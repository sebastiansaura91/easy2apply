-- H4 (audit): This migration previously seeded a real individual's CV bullets
-- (personal data) tied to a specific resume id. Seeding real PII in a migration is a
-- GDPR problem and it lands in git history. The data has been removed from this file.
--
-- Migration intentionally left as a no-op. Seed/demo data must be loaded out-of-band
-- (e.g. a local-only script), never committed to the repository.
--
-- NOTE: removing the data here does NOT scrub it from prior git history. The commit
-- that introduced it must still be purged with git filter-repo / BFG and force-pushed.
SELECT 1;
