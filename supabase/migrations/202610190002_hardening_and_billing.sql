alter table public.notification_log
  drop constraint if exists notification_log_status_check;
alter table public.notification_log
  add constraint notification_log_status_check check (status in ('queued', 'sending', 'sent', 'failed'));
alter table public.notification_log
  drop constraint if exists notification_log_notification_type_check;
alter table public.notification_log
  add constraint notification_log_notification_type_check check (notification_type in ('confirmation', 'pending_approval', 'payment_required', 'owner_new_booking', 'reminder', 'cancellation'));
alter table public.notification_log
  add column if not exists sending_started_at timestamptz;

alter table public.webhook_events
  add column if not exists processing_started_at timestamptz;
alter table public.organizations
  add column if not exists stripe_checkout_session_id text unique;

create or replace function public.claim_webhook_event(
  p_event_id text,
  p_provider text,
  p_event_type text,
  p_payload jsonb
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed boolean := false;
begin
  insert into public.webhook_events (event_id, provider, event_type, payload, status, processing_started_at)
  values (p_event_id, p_provider, p_event_type, p_payload, 'processing', clock_timestamp())
  on conflict (event_id) do update set
    status = 'processing',
    error = null,
    payload = excluded.payload,
    processing_started_at = clock_timestamp()
  where public.webhook_events.status in ('failed', 'received')
     or (public.webhook_events.status = 'processing'
         and public.webhook_events.processing_started_at < clock_timestamp() - interval '5 minutes')
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_webhook_event(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_webhook_event(text, text, text, jsonb) to service_role;

drop policy if exists "members create their appointments" on public.appointments;
create policy "members create non-overlapping appointments" on public.appointments for insert with check (
  org_id = public.current_org_id() and not allow_overlap and
  (public.is_org_admin() or staff_id in (
    select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'
  ))
);

drop policy if exists "members update their appointments" on public.appointments;
create policy "members update non-overlapping appointments" on public.appointments for update using (
  org_id = public.current_org_id() and (public.is_org_admin() or staff_id in (
    select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'
  ))
) with check (
  org_id = public.current_org_id() and not allow_overlap and
  (public.is_org_admin() or staff_id in (
    select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'
  ))
);

create policy "members create on site payments" on public.payments for insert with check (
  org_id = public.current_org_id() and provider = 'on_site' and exists (
    select 1 from public.appointments a where a.id = payments.appointment_id and a.org_id = payments.org_id and
      (public.is_org_admin() or a.staff_id in (
        select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'
      ))
  )
);

create index if not exists appointments_confirmed_start on public.appointments (starts_at)
  where status = 'confirmed';

create or replace function public.guard_appointment_overlap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.staff_id::text, 0));
  if new.source = 'owner' and new.allow_overlap then
    return new;
  end if;
  if exists (
    select 1 from public.appointments a
    where a.staff_id = new.staff_id
      and a.status <> 'cancelled'
      and a.id <> new.id
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'appointment overlaps an existing appointment'
      using errcode = '23P01', constraint = 'appointments_no_staff_overlap';
  end if;
  return new;
end;
$$;

create trigger appointments_guard_overlap
before insert or update of staff_id, starts_at, ends_at, status, allow_overlap on public.appointments
for each row execute function public.guard_appointment_overlap();
