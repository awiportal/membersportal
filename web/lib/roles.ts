// Role helpers shared across the app.
// Enum (member_role): member=Investor, secretary=Secretary, admin=Admin, superadmin=Chairlady.

export const STAFF_ROLES = ['secretary', 'admin', 'superadmin'];
export const ADMIN_ROLES = ['admin', 'superadmin'];

export function isStaff(role?: string | null) {
  return !!role && STAFF_ROLES.includes(role);
}

export function isAdmin(role?: string | null) {
  return !!role && ADMIN_ROLES.includes(role);
}

export function roleLabel(role?: string | null) {
  switch (role) {
    case 'superadmin':
      return 'Chairlady';
    case 'admin':
      return 'Admin';
    case 'secretary':
      return 'Secretary';
    case 'member':
      return 'Investor';
    default:
      return 'Member';
  }
}

export function statusLabel(s?: string | null) {
  if (!s) return '—';
  return s[0].toUpperCase() + s.slice(1);
}
