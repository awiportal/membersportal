-- Optional per-login display title that overrides the role label in the UI.
--
-- The role model has four tiers (member / secretary / admin / superadmin) and
-- `superadmin` always renders as "Chairlady". This lets two superadmin-tier
-- logins show distinct titles (e.g. "Super Admin" vs "Chairlady") WITHOUT
-- adding a role enum value and WITHOUT changing any permission. The UI prefers
-- profiles.title when set, otherwise falls back to roleLabel(role).
alter table public.profiles add column if not exists title text;

-- Moses's main login is the system owner: show "Super Admin" instead of the
-- default "Chairlady". The +chair login keeps the default Chairlady label
-- (title left null). Both remain full superadmin-tier with identical powers.
update public.profiles
   set title = 'Super Admin'
 where id = 'a1d05c59-a56b-4cee-a301-b0bfff0eca49'; -- mosemqute@gmail.com
