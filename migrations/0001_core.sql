-- OrbitFS License Master V2 requires PostgreSQL (Supabase). This is the complete
-- baseline for a fresh database; later migration files are retained as no-ops
-- so existing migration runners can continue to apply the numbered sequence.
create table if not exists license_bindings (
  id text primary key,
  customer_ref text not null default '',
  order_ref text not null,
  product_code text not null default 'orbitfs_base',
  status text not null default 'active' check (status in ('active','suspended','terminated')),
  desired_state text not null default 'active',
  remote_state text not null default 'active',
  expires_at timestamptz,
  max_installations integer not null default 1 check (max_installations between 1 and 100),
  components jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  license_key_hash text not null,
  license_key_last4 text not null,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists license_bindings_order_ref_uq on license_bindings(order_ref) where archived_at is null;
create unique index if not exists license_bindings_key_hash_uq on license_bindings(license_key_hash);
create index if not exists license_bindings_customer_idx on license_bindings(customer_ref);
create index if not exists license_bindings_status_idx on license_bindings(status);

create table if not exists license_key_delivery (
  binding_id text primary key references license_bindings(id) on delete cascade,
  customer_ref text not null default '',
  license_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists license_fulfillments (
  order_ref text primary key,
  customer_ref text not null default '',
  product_code text not null default 'orbitfs_base',
  state text not null,
  binding_id text not null references license_bindings(id),
  license_id text not null references license_bindings(id),
  fulfilled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists license_installations (
  id text primary key,
  binding_id text not null references license_bindings(id) on delete cascade,
  component_key text not null,
  installation_id text not null,
  device_name text,
  platform text,
  app_version text,
  status text not null default 'active' check (status in ('active','inactive')),
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  locked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(binding_id, component_key, installation_id)
);
create index if not exists license_installations_binding_idx on license_installations(binding_id, status);

create table if not exists master_license_settings (
  id text primary key,
  issuer text not null default 'orbitfs-license-master',
  audience text not null default 'orbitfs-runtime',
  entitlement_ttl_seconds integer not null default 10800,
  grace_seconds integer not null default 604800,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
insert into master_license_settings(id) values ('primary') on conflict (id) do nothing;

create table if not exists license_validation_log (
  id bigserial primary key,
  binding_id text not null references license_bindings(id),
  license_id text not null references license_bindings(id),
  installation_id text not null,
  result text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists license_validation_log_binding_idx on license_validation_log(binding_id, created_at desc);

create table if not exists orbitfs_installations (
  id text primary key,
  user_ref text,
  binding_id text references license_bindings(id),
  hostname text,
  platform text,
  version text,
  vercel_team_id text,
  vercel_project_id text,
  vercel_project_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists releases (
  id text primary key,
  component text not null,
  version text not null,
  channel text not null default 'stable',
  status text not null default 'draft' check (status in ('draft','validated','published','paused','withdrawn')),
  title text not null default '',
  description text not null default '',
  changelog text not null default '',
  customer_notes text not null default '',
  internal_notes text not null default '',
  severity text not null default 'normal',
  required boolean not null default false,
  rollout text not null default 'public',
  minimum_version text,
  rollback_version text,
  schema_version text not null default '1',
  checkpoint_required boolean not null default false,
  components jsonb not null default '[]'::jsonb,
  manifest jsonb not null default '{}'::jsonb,
  permissions jsonb not null default '{}'::jsonb,
  compatibility jsonb not null default '{}'::jsonb,
  source_commit text,
  artifact_path text,
  artifact_sha256 text,
  artifact_size bigint not null default 0,
  artifact_content_type text,
  manifest_sha256 text,
  published_at timestamptz,
  published_by text,
  paused_at timestamptz,
  withdrawn_at timestamptz,
  supersedes_release_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(component, channel, version)
);
create index if not exists releases_status_idx on releases(status, channel, updated_at desc);

create table if not exists deployment_jobs (
  id text primary key,
  installation_id text not null,
  user_ref text,
  binding_id text references license_bindings(id),
  release_id text not null references releases(id),
  action text not null,
  status text not null default 'queued',
  error text,
  requested_by text,
  started_at timestamptz,
  completed_at timestamptz,
  progress integer not null default 0 check (progress between 0 and 100),
  message text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deployment_jobs_status_idx on deployment_jobs(status, created_at desc);
create index if not exists deployment_jobs_installation_idx on deployment_jobs(installation_id, created_at desc);

create table if not exists audit_log (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_ref text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on audit_log(entity_type, entity_id, created_at desc);
