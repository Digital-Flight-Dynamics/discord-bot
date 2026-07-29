-- Remove profile enrichment data; moderation snapshots retain only names and Discord IDs.
ALTER TABLE identity_snapshots DROP COLUMN IF EXISTS pronouns;
ALTER TABLE identity_snapshots DROP COLUMN IF EXISTS bio;
ALTER TABLE identity_snapshots DROP COLUMN IF EXISTS urls;
