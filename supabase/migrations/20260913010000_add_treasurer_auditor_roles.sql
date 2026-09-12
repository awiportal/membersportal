-- ============================================================================
-- AWIVEST — add Treasurer and Auditor roles to member_role (#155)
-- Kept in its OWN migration so the new enum values are committed before the
-- permission policies in the next migration reference them (Postgres forbids
-- using a freshly added enum value in the same transaction).
--
-- Role map (member_role enum):
--   member      -> Investor
--   secretary   -> Secretary
--   treasurer   -> Treasurer   (NEW) — finance-focused staff operator
--   auditor     -> Auditor     (NEW) — read-only governance role
--   admin       -> Admin
--   superadmin  -> Chairlady
-- ============================================================================

alter type public.member_role add value if not exists 'treasurer';
alter type public.member_role add value if not exists 'auditor';
