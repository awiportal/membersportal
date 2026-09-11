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

// Chairlady is the single superadmin-tier governance role.
export function isChairlady(role?: string | null) {
  return role === 'superadmin';
}

// ---- Withdrawal workflow capabilities -------------------------------------
// Segregated duties (confirmed with the office):
//   review  (submitted -> under_review): any staff member (Secretary+),
//   decide  (approve / reject):          Chairlady only,
//   pay     (mark paid / disburse):      Admin or Chairlady.
export function canReviewWithdrawal(role?: string | null) {
  return isStaff(role);
}
export function canDecideWithdrawal(role?: string | null) {
  return isChairlady(role);
}
export function canPayWithdrawal(role?: string | null) {
  return isAdmin(role);
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
