create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.appointment_status as enum ('pending', 'confirmed', 'cancelled', 'completed');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

create table public.organizations (
  id text primary key,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null,
  default_locale text not null default 'hu' check (default_locale in ('hu', 'en')),
  timezone text not null default 'Europe/Budapest',
  settings jsonb not null default '{"booking":{"minimum_notice_minutes":120,"max_days_ahead":60,"buffer_minutes":0,"cancellation_window_hours":24,"auto_confirm":true},"payments":{"on_site":true,"stripe_online":false},"notifications":{"email_confirmation":true,"email_reminder":true,"reminder_hours":24}}'::jsonb,
  stripe_account_id text unique,
  stripe_connect_enabled boolean not null default false,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'pending',
  subscription_current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  clerk_user_id text not null,
  display_name text not null,
  email text,
  role text not null default 'org:member' check (role in ('org:admin', 'org:member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, clerk_user_id),
  unique (id, org_id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  name text not null,
  duration_minutes integer not null check (duration_minutes between 5 and 720),
  price_huf integer not null default 0 check (price_huf >= 0),
  deposit_huf integer check (deposit_huf >= 0 and deposit_huf <= price_huf),
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);

create unique index services_one_default_per_org on public.services (org_id) where is_default;

create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  member_id uuid,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  is_closed boolean not null default false,
  check (closes_at > opens_at),
  foreign key (member_id, org_id) references public.members(id, org_id) on delete cascade,
  unique nulls not distinct (org_id, member_id, weekday)
);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  member_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at),
  foreign key (member_id, org_id) references public.members(id, org_id) on delete cascade
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  preferred_locale text check (preferred_locale in ('hu', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);

create unique index customers_org_email on public.customers (org_id, lower(email)) where email is not null;
create unique index customers_org_phone on public.customers (org_id, phone) where phone is not null;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  customer_id uuid,
  service_id uuid,
  staff_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'confirmed',
  source text not null default 'owner' check (source in ('owner', 'public')),
  price_huf integer not null default 0 check (price_huf >= 0),
  notes text,
  allow_overlap boolean not null default false,
  manage_token_hash text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (customer_id, org_id) references public.customers(id, org_id) on delete set null (customer_id),
  foreign key (service_id, org_id) references public.services(id, org_id) on delete set null (service_id),
  foreign key (staff_id, org_id) references public.members(id, org_id),
  unique (id, org_id)
);

alter table public.appointments add constraint appointments_no_staff_overlap
  exclude using gist (staff_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status <> 'cancelled' and not allow_overlap);

create index appointments_org_start on public.appointments (org_id, starts_at) where status <> 'cancelled';
create index appointments_staff_start on public.appointments (staff_id, starts_at) where status <> 'cancelled';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  appointment_id uuid not null,
  provider text not null check (provider in ('on_site', 'stripe')),
  provider_payment_id text unique,
  amount_huf integer not null check (amount_huf >= 0),
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (appointment_id, org_id) references public.appointments(id, org_id) on delete cascade,
  unique (appointment_id, provider)
);

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id) on delete cascade,
  appointment_id uuid,
  notification_type text not null check (notification_type in ('confirmation', 'pending_approval', 'owner_new_booking', 'reminder', 'cancellation')),
  recipient text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  foreign key (appointment_id, org_id) references public.appointments(id, org_id) on delete set null (appointment_id),
  unique (appointment_id, notification_type, recipient)
);

create table public.webhook_events (
  event_id text primary key,
  provider text not null check (provider in ('stripe', 'clerk')),
  event_type text not null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create table public.request_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null default 1 check (hit_count >= 1)
);

create or replace function public.consume_rate_limit(p_bucket_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_count integer;
begin
  insert into public.request_limits (bucket_key, window_started_at, hit_count)
  values (p_bucket_key, clock_timestamp(), 1)
  on conflict (bucket_key) do update set
    window_started_at = case
      when public.request_limits.window_started_at + make_interval(secs => p_window_seconds) <= clock_timestamp() then clock_timestamp()
      else public.request_limits.window_started_at
    end,
    hit_count = case
      when public.request_limits.window_started_at + make_interval(secs => p_window_seconds) <= clock_timestamp() then 1
      else public.request_limits.hit_count + 1
    end
  returning hit_count into current_count;
  return current_count <= p_limit;
end;
$$;

create or replace function public.current_org_id() returns text
language sql stable as $$ select auth.jwt() ->> 'org_id' $$;
create or replace function public.current_org_role() returns text
language sql stable as $$ select auth.jwt() ->> 'org_role' $$;
create or replace function public.is_org_admin() returns boolean
language sql stable as $$ select public.current_org_role() in ('org:admin', 'org:owner') $$;

alter table public.organizations enable row level security;
alter table public.members enable row level security;
alter table public.services enable row level security;
alter table public.working_hours enable row level security;
alter table public.time_off enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.payments enable row level security;
alter table public.notification_log enable row level security;
alter table public.webhook_events enable row level security;
alter table public.request_limits enable row level security;

create policy "organization members can read their organization" on public.organizations for select using (id = public.current_org_id());
create policy "organization admins can update their organization" on public.organizations for update using (id = public.current_org_id() and public.is_org_admin()) with check (id = public.current_org_id() and public.is_org_admin());

create policy "members can read their organization roster" on public.members for select using (org_id = public.current_org_id());
create policy "admins manage organization roster" on public.members for all using (org_id = public.current_org_id() and public.is_org_admin()) with check (org_id = public.current_org_id() and public.is_org_admin());

create policy "members can read services" on public.services for select using (org_id = public.current_org_id());
create policy "admins manage services" on public.services for all using (org_id = public.current_org_id() and public.is_org_admin()) with check (org_id = public.current_org_id() and public.is_org_admin());

create policy "members can read working hours" on public.working_hours for select using (org_id = public.current_org_id());
create policy "admins and members manage working hours" on public.working_hours for all using (
  org_id = public.current_org_id() and (public.is_org_admin() or member_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'))
) with check (
  org_id = public.current_org_id() and (public.is_org_admin() or member_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'))
);

create policy "members can read time off" on public.time_off for select using (org_id = public.current_org_id());
create policy "admins and members manage time off" on public.time_off for all using (
  org_id = public.current_org_id() and (public.is_org_admin() or member_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'))
) with check (
  org_id = public.current_org_id() and (public.is_org_admin() or member_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'))
);

create policy "members read their clients" on public.customers for select using (
  org_id = public.current_org_id() and (public.is_org_admin() or exists (
    select 1 from public.appointments a join public.members m on m.id = a.staff_id
    where a.org_id = customers.org_id and a.customer_id = customers.id and m.clerk_user_id = auth.jwt() ->> 'sub'
  ))
);
create policy "members create clients for their bookings" on public.customers for insert with check (org_id = public.current_org_id());
create policy "admins manage clients" on public.customers for all using (org_id = public.current_org_id() and public.is_org_admin()) with check (org_id = public.current_org_id() and public.is_org_admin());

create policy "members read their appointments" on public.appointments for select using (
  org_id = public.current_org_id() and (public.is_org_admin() or staff_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'))
);
create policy "members create their appointments" on public.appointments for insert with check (
  org_id = public.current_org_id() and (public.is_org_admin() or staff_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'))
);
create policy "members update their appointments" on public.appointments for update using (
  org_id = public.current_org_id() and (public.is_org_admin() or staff_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'))
) with check (
  org_id = public.current_org_id() and (public.is_org_admin() or staff_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'))
);
create policy "members cancel their appointments" on public.appointments for delete using (
  org_id = public.current_org_id() and (public.is_org_admin() or staff_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub'))
);

create policy "members read their payments" on public.payments for select using (
  org_id = public.current_org_id() and (public.is_org_admin() or exists (select 1 from public.appointments a where a.id = payments.appointment_id and a.staff_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub')))
);
create policy "members update on site payments" on public.payments for update using (
  org_id = public.current_org_id() and provider = 'on_site' and (public.is_org_admin() or exists (select 1 from public.appointments a where a.id = payments.appointment_id and a.staff_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub')))
) with check (org_id = public.current_org_id() and provider = 'on_site');

create policy "members read their notifications" on public.notification_log for select using (
  org_id = public.current_org_id() and (public.is_org_admin() or exists (select 1 from public.appointments a where a.id = notification_log.appointment_id and a.staff_id in (select id from public.members where org_id = public.current_org_id() and clerk_user_id = auth.jwt() ->> 'sub')))
);

revoke all on public.webhook_events from anon, authenticated;
revoke all on public.request_limits from anon, authenticated;
revoke all on function public.current_org_id() from public;
grant execute on function public.current_org_id() to authenticated;
revoke all on function public.current_org_role() from public;
grant execute on function public.current_org_role() to authenticated;
revoke all on function public.is_org_admin() from public;
grant execute on function public.is_org_admin() to authenticated;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
