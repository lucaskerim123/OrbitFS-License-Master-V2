-- OrbitFS License Master V2 control-plane hardening.
-- License Master remains authoritative for product/entitlement/license state.
-- Billing Store owns orders/invoices/UI; customer systems never receive DB credentials.

create table if not exists products (
  id text primary key,
  code text not null unique,
  name text not null,
  description text not null default '',
  runtime text not null default 'panel' check (runtime in ('panel','engine','service')),
  requires_license boolean not null default true,
  requires_engine boolean not null default false,
  active boolean not null default true,
  purchasable boolean not null default true,
  public_visible boolean not null default true,
  installation_limit integer not null default 1 check (installation_limit between 1 and 100),
  release_channel text not null default 'stable',
  metadata jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  entitlement_defaults jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_active_idx on products(active, public_visible, sort_order);

insert into products (id, code, name, runtime, requires_engine, metadata, features)
values
  ('orbitfs_base', 'orbitfs_base', 'OrbitFS Base', 'panel', false, '{"component":"panel"}'::jsonb, '{"base_deployer":true,"updater":true}'::jsonb),
  ('orbitfs_mcp', 'orbitfs_mcp', 'OrbitFS MCP', 'engine', true, '{"component":"mcp"}'::jsonb, '{}'::jsonb),
  ('orbitfs_apex', 'orbitfs_apex', 'OrbitFS APEX', 'engine', true, '{"component":"apex"}'::jsonb, '{}'::jsonb),
  ('orbitfs_studio', 'orbitfs_studio', 'OrbitFS Studio', 'engine', true, '{"component":"studio"}'::jsonb, '{}'::jsonb)
on conflict (id) do update set
  name=excluded.name,
  runtime=excluded.runtime,
  requires_engine=excluded.requires_engine,
  metadata=excluded.metadata,
  features=excluded.features,
  updated_at=now();

create table if not exists product_entitlement_rules (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  rule_key text not null,
  rule_value jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, rule_key)
);

create table if not exists installation_components (
  id text primary key,
  installation_id text not null references orbitfs_installations(id) on delete cascade,
  product_id text not null references products(id),
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

alter table releases add column if not exists product_id text references products(id);
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

-- Never silently replace customer data during a normal update.
update deployment_jobs set preserve_data=true where preserve_data is null;
