ALTER TABLE licences ADD COLUMN max_installations INTEGER NOT NULL DEFAULT 1;
ALTER TABLE licences ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_licence_status ON licences(status);

ALTER TABLE installations ADD COLUMN hostname TEXT;
ALTER TABLE installations ADD COLUMN platform TEXT;
ALTER TABLE installations ADD COLUMN version TEXT;
ALTER TABLE installations ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS idx_installation_binding
  ON installations(licence_id, component, installation_ref);

ALTER TABLE releases ADD COLUMN min_version TEXT;
ALTER TABLE releases ADD COLUMN max_version TEXT;
ALTER TABLE releases ADD COLUMN compatibility_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE releases ADD COLUMN manifest_sha256 TEXT;
ALTER TABLE releases ADD COLUMN artifact_content_type TEXT;
ALTER TABLE releases ADD COLUMN published_by TEXT;
ALTER TABLE releases ADD COLUMN paused_at TEXT;
ALTER TABLE releases ADD COLUMN withdrawn_at TEXT;
ALTER TABLE releases ADD COLUMN supersedes_release_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_release_component_channel_version
  ON releases(component, channel, version);

ALTER TABLE deployment_jobs ADD COLUMN requested_by TEXT;
ALTER TABLE deployment_jobs ADD COLUMN started_at TEXT;
ALTER TABLE deployment_jobs ADD COLUMN completed_at TEXT;
ALTER TABLE deployment_jobs ADD COLUMN progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deployment_jobs ADD COLUMN message TEXT;
ALTER TABLE deployment_jobs ADD COLUMN result_json TEXT;
CREATE INDEX IF NOT EXISTS idx_deployment_installation ON deployment_jobs(installation_id, created_at);
ALTER TABLE licence_components ADD COLUMN updated_at TEXT;
UPDATE licence_components SET updated_at = COALESCE(locked_at, datetime('now')) WHERE updated_at IS NULL;
