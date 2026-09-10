CREATE TABLE IF NOT EXISTS licences (
  id TEXT PRIMARY KEY,
  customer_ref TEXT,
  order_ref TEXT,
  product_code TEXT NOT NULL DEFAULT 'orbitfs_base',
  key_hash TEXT NOT NULL UNIQUE,
  key_cipher TEXT,
  key_iv TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS licence_components (
  licence_id TEXT NOT NULL,
  component TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  installation_id TEXT,
  locked_at TEXT,
  PRIMARY KEY (licence_id, component),
  FOREIGN KEY (licence_id) REFERENCES licences(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS installations (
  id TEXT PRIMARY KEY,
  licence_id TEXT NOT NULL,
  component TEXT NOT NULL,
  installation_ref TEXT,
  last_seen TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (licence_id) REFERENCES licences(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_ref TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_licence_customer ON licences(customer_ref);
CREATE INDEX IF NOT EXISTS idx_installation_licence ON installations(licence_id);
