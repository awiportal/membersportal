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

// ---- System-wide staff capabilities (confirmed roles matrix) --------------
// Secretary handles day-to-day operations (KYC, forms, content, fund-data entry,
// review steps). Admin and Chairlady own member governance, money-out, and
// configuration. These are the semantic gates enforced in the server actions.
export function canApproveMembers(role?: string | null) {
  return isAdmin(role); // approve/reject member applications + change member standing
}
export function canDisburseFunds(role?: string | null) {
  return isAdmin(role); // record withdrawals, mark/settle exits, mark welfare/withdrawals paid
}
export function canManageConfig(role?: string | null) {
  return isAdmin(role); // agreement templates + staff e-sign settings
}

// Mapping a login to its AWIVEST fund record (member_finances) is Admin-only.
// Members never self-link; an Admin verifies identity and maps them.
export function canMapMembership(role?: string | null) {
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
