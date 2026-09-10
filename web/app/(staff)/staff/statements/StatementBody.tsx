// The printable statement card now lives in a single shared component so the
// member self-service view, the staff full page, and the staff drawer all
// render identical, professional output. Kept as a thin re-export to preserve
// the existing import paths (StatementView, StaffStatementsBrowser).
export { default } from '@/components/StatementSheet';
