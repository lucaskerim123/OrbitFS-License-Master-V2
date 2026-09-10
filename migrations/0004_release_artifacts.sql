ALTER TABLE releases ADD COLUMN artifact_path TEXT;
ALTER TABLE releases ADD COLUMN artifact_sha256 TEXT;
ALTER TABLE releases ADD COLUMN artifact_size INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_release_component_version ON releases(component, version);
