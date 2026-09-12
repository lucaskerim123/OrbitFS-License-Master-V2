-- OrbitFS License Master V2 control-plane hardening.
-- Uses the canonical license_products catalogue from 0002_product_catalog.sql.
-- License Master remains authoritative for product/entitlement/license state.
-- Billing Store owns orders/invoices/UI; customer systems never receive DB credentials.

alter table license_products add column if not exists requires_license boolean not null default true;
alter table license_products add column if not exists updater_enabled boolean not null default true;
alter table license_products add column if not exists runtime_config jsonb not null default '{}'::jsonb;

create table if not exists installation_components (
  id text primary key,
  installation_id text not null references orbitfs_installations(id) on delete cascade,
  product_id text not null references license_products(id),
  version text,
  desired_version text,
  status text not null default 'inactive' check (status in ('inactive','installed','updating','failed','disabled')),
  config jsonb not null default '{}'::jsonb,
  last_deployment_id text,
  installed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(installation_id, product_id)
);
create index if not exists installation_components_installation_idx on installation_components(installation_id, status);

alter table orbitfs_installations add column if not exists deployment_provider text not null default 'vercel';
alter table orbitfs_installations add column if not exists supabase_project_ref text;
alter table orbitfs_installations add column if not exists panel_version text;
alter table orbitfs_installations add column if not exists engine_version text;
alter table orbitfs_installations add column if not exists status text not null default 'provisioning';
alter table orbitfs_installations add column if not exists health_status text not null default 'unknown';
alter table orbitfs_installations add column if not exists last_health_check_at timestamptz;
alter table orbitfs_installations add column if not exists metadata_version integer not null default 1;

alter table releases add column if not exists product_id text references license_products(id);
alter table releases add column if not exists minimum_schema_version text;
alter table releases add column if not exists update_strategy text not null default 'in_place' check (update_strategy in ('in_place','migration','replace'));
alter table releases add column if not exists customer_visible boolean not null default false;
alter table releases add column if not exists release_notes jsonb not null default '{}'::jsonb;

alter table deployment_jobs add column if not exists provider text not null default 'vercel';
alter table deployment_jobs add column if not exists provider_project_id text;
alter table deployment_jobs add column if not exists target_version text;
alter table deployment_jobs add column if not exists previous_version text;
alter table deployment_jobs add column if not exists preserve_data boolean not null default true;
alter table deployment_jobs add column if not exists migration_required boolean not null default false;
alter table deployment_jobs add column if not exists rollback_release_id text references releases(id);
alter table deployment_jobs add column if not exists provider_deployment_id text;

create index if not exists releases_product_idx on releases(product_id, status, channel, created_at desc);
create index if not exists deployment_jobs_provider_idx on deployment_jobs(provider, provider_project_id, created_at desc);

-- Normal updates preserve the customer's existing application/database state.
update deployment_jobs set preserve_data=true where preserve_data is null;
