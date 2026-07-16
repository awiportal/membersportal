-- ============================================================================
-- AWIVEST Investor Portal — migration v0.3a: add the Secretary role
-- Runs after 20260716130000_storage_triggers_seed.sql.
--
-- Kept in its OWN migration so the new enum value is committed before the
-- permission policies in v0.3b reference it (Postgres forbids using a freshly
-- added enum value in the same transaction).
--
-- Role map (member_role enum):
--   member      -> Investor
--   secretary   -> Secretary   (NEW)
--   admin       -> Admin
--   superadmin  -> Chairlady (top-level)
-- ============================================================================

alter type public.member_role add value if not exists 'secretary';
