create extension if not exists pgtap;
begin;
select plan(5);

insert into public.organizations (id, slug, name)
values ('test-overlap-org', 'test-overlap-org', 'Overlap Test')
on conflict (id) do nothing;
insert into public.members (id, org_id, clerk_user_id, display_name, role)
values ('a80c783c-ddca-4610-afc0-5f5fb353002b', 'test-overlap-org', 'test-owner', 'Test Owner', 'org:admin')
on conflict (id) do nothing;

select ok(
  public.claim_webhook_event('evt_idempotency_test', 'stripe', 'checkout.session.completed', '{}'::jsonb),
  'the first webhook delivery claims the event'
);
select ok(
  not public.claim_webhook_event('evt_idempotency_test', 'stripe', 'checkout.session.completed', '{}'::jsonb),
  'a concurrent or repeated webhook delivery cannot claim a processing event'
);

insert into public.appointments (id, org_id, staff_id, starts_at, ends_at, source)
values ('a80c783c-ddca-4610-afc0-5f5fb353002c', 'test-overlap-org', 'a80c783c-ddca-4610-afc0-5f5fb353002b', '2026-10-20 09:00:00+02', '2026-10-20 10:00:00+02', 'owner');

select throws_ok(
  $$insert into public.appointments (id, org_id, staff_id, starts_at, ends_at, source) values ('a80c783c-ddca-4610-afc0-5f5fb353002d', 'test-overlap-org', 'a80c783c-ddca-4610-afc0-5f5fb353002b', '2026-10-20 09:30:00+02', '2026-10-20 10:30:00+02', 'public')$$,
  '23P01',
  'appointment overlaps an existing appointment',
  'the database rejects overlapping customer bookings'
);

insert into public.appointments (id, org_id, staff_id, starts_at, ends_at, source, allow_overlap)
values ('a80c783c-ddca-4610-afc0-5f5fb353002e', 'test-overlap-org', 'a80c783c-ddca-4610-afc0-5f5fb353002b', '2026-10-20 09:30:00+02', '2026-10-20 10:30:00+02', 'owner', true);
select ok(true, 'an explicitly confirmed owner overlap is accepted');

select throws_ok(
  $$insert into public.appointments (id, org_id, staff_id, starts_at, ends_at, source) values ('a80c783c-ddca-4610-afc0-5f5fb353002f', 'test-overlap-org', 'a80c783c-ddca-4610-afc0-5f5fb353002b', '2026-10-20 09:45:00+02', '2026-10-20 10:15:00+02', 'public')$$,
  '23P01',
  'appointment overlaps an existing appointment',
  'an owner-confirmed overlap blocks later customer bookings'
);

select * from finish();
rollback;
