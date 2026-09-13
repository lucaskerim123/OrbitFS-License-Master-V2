-- Release/Deployment authority handoff.
-- License Master performs the technical release/deployment work, then hands a
-- final, validated draft to the V2 Billing Store. Customer visibility/publication
-- remains a Billing Store responsibility.

alter table releases drop constraint if exists releases_status_check;
alter table releases add constraint releases_status_check check (status in ('draft','validated','ready_for_store','published','paused','withdrawn'));
alter table releases add column if not exists finalized_at timestamptz;
alter table releases add column if not exists finalized_by text;
alter table releases add column if not exists billing_store_release_id text;
alter table releases add column if not exists automation_source text;
alter table releases add column if not exists github_release_url text;
alter table releases add column if not exists github_deployment_id text;

alter table master_license_settings add column if not exists release_automation_enabled boolean not null default false;
alter table master_license_settings add column if not exists auto_finalize_base boolean not null default false;
alter table master_license_settings add column if not exists auto_finalize_updates boolean not null default false;

create table if not exists release_store_deliveries (
  id uuid primary key default gen_random_uuid(),
  release_id text not null references releases(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','acknowledged','failed')),
  attempts integer not null default 0,
  last_error text,
  response jsonb not null default '{}'::jsonb,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(release_id)
);
create index if not exists release_store_deliveries_status_idx on release_store_deliveries(status, updated_at desc);
