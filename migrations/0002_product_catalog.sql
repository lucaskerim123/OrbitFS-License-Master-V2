-- OrbitFS License Master V2: fully configurable product catalogue.
-- Products are independent from licence bindings so Store/Billing can use the
-- same catalogue while the License Master controls entitlement behaviour.
create table if not exists license_products (
  id text primary key,
  code text not null unique,
  name text not null,
  slug text not null unique,
  description text not null default '',
  short_description text not null default '',
  product_type text not null default 'component',
  active boolean not null default true,
  purchasable boolean not null default true,
  public boolean not null default true,
  component_key text,
  runtime text not null default 'engine',
  requires_engine boolean not null default false,
  requires_base boolean not null default true,
  max_installations integer not null default 1 check (max_installations between 1 and 100),
  duration_days integer,
  grace_seconds integer,
  version_policy text not null default 'latest',
  release_channel text not null default 'stable',
  price_amount numeric(14,2) not null default 0,
  price_currency text not null default 'AUD',
  billing_interval text not null default 'one_time',
  stripe_price_id text,
  stripe_product_id text,
  paypal_product_id text,
  features jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  entitlement_defaults jsonb not null default '{}'::jsonb,
  display jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists license_products_active_idx on license_products(active, sort_order, name);
create index if not exists license_products_component_idx on license_products(component_key);

insert into license_products
(id, code, name, slug, description, product_type, component_key, runtime, requires_engine, requires_base, max_installations, sort_order)
values
('prod_orbitfs_base','orbitfs_base','OrbitFS Base','orbitfs-base','OrbitFS core panel and base runtime.','component','orbitfs_base','panel',false,false,1,10),
('prod_orbitfs_mcp','orbitfs_mcp','OrbitFS MCP','orbitfs-mcp','ChatGPT/MCP backend addon for OrbitFS.','addon','orbitfs_mcp','engine',true,true,1,20),
('prod_orbitfs_apex','orbitfs_apex','OrbitFS APEX','orbitfs-apex','Sorter and converter addon for OrbitFS.','addon','orbitfs_apex','engine',true,true,1,30),
('prod_orbitfs_studio','orbitfs_studio','OrbitFS Studio','orbitfs-studio','Writing and documentation addon for OrbitFS.','addon','orbitfs_studio','engine',true,true,1,40)
on conflict (code) do nothing;

create table if not exists product_component_rules (
  id text primary key,
  product_id text not null references license_products(id) on delete cascade,
  component_key text not null,
  enabled boolean not null default true,
  required boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  unique(product_id, component_key)
);

create table if not exists product_release_rules (
  id text primary key,
  product_id text not null references license_products(id) on delete cascade,
  component_key text not null,
  channel text not null default 'stable',
  minimum_version text,
  maximum_version text,
  pinned_version text,
  auto_update boolean not null default true,
  rollout_percent integer not null default 100 check (rollout_percent between 0 and 100),
  configuration jsonb not null default '{}'::jsonb,
  unique(product_id, component_key, channel)
);

create table if not exists product_entitlement_rules (
  id text primary key,
  product_id text not null references license_products(id) on delete cascade,
  key text not null,
  value jsonb not null default 'true'::jsonb,
  enabled boolean not null default true,
  unique(product_id, key)
);
