import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canViewStaffConsole, isAdmin, roleLabel } from '@/lib/roles';
import { parseCustomFields } from '@/lib/customFields';
import { fieldsForSigner, parseFieldLayout, signerKeyForStep } from '@/lib/fieldLayout';
import StaffSignRequests from './StaffSignRequests';

export const dynamic = 'force-dynamic';

export default async function StaffSignRequestsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canViewStaffConsole((me as any)?.role)) redirect('/staff');

  // All privileged reads use the service-role client (RLS only grants members
  // their own rows).
  const admin = createAdminClient();

  // ---- Individual flow (unchanged) ----
  const { data: reqRows } = await admin
    .from('sign_requests')
    .select('*')
    .order('created_at', { ascending: false });
  const allRequests = ((reqRows ?? []) as any[]);
  // The individual list excludes sequential requests (those render separately).
  const requests = allRequests.filter((r) => (r.flow || 'individual') !== 'sequential');
  const reqIds = requests.map((r) => r.id);

  const { data: rcptRows } = reqIds.length
    ? await admin.from('sign_request_recipients').select('*').in('request_id', reqIds)
    : { data: [] as any[] };
  const recipients = ((rcptRows ?? []) as any[]);

  const memberIds = Array.from(new Set(recipients.map((r) => r.member_id).filter(Boolean)));
  const { data: memRows } = memberIds.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', memberIds)
    : { data: [] as any[] };
  const memberById: Record<string, any> = {};
  ((memRows ?? []) as any[]).forEach((m) => (memberById[m.id] = m));

  // Active members for the (individual) recipient picker.
  const { data: activeRows } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('status', 'active')
    .eq('role', 'member')
    .order('full_name', { ascending: true });
  const activeMembers = ((activeRows ?? []) as any[]).map((m) => ({
    id: m.id,
    full_name: m.full_name,
    email: m.email,
  }));

  const recipientsByReq: Record<string, any[]> = {};
  recipients.forEach((r) => {
    const m = memberById[r.member_id];
    const item = { ...r, member_name: m?.full_name || 'Member', member_email: m?.email || '' };
    (recipientsByReq[r.request_id] = recipientsByReq[r.request_id] || []).push(item);
  });

  const data = requests.map((r) => ({
    id: r.id,
    title: r.title,
    doc_type: r.doc_type,
    note: r.note,
    created_at: r.created_at,
    recipients: recipientsByReq[r.id] || [],
  }));

  // ---- Sequential flow (additive) ----
  const seqRequests = allRequests.filter((r) => (r.flow || 'individual') === 'sequential');
  const seqIds = seqRequests.map((r) => r.id);

  const { data: stepRows } = seqIds.length
    ? await admin
        .from('sign_request_steps')
        .select('*')
        .in('request_id', seqIds)
        .order('step_order', { ascending: true })
    : { data: [] as any[] };
  const steps = ((stepRows ?? []) as any[]);

  const stepSignerIds = Array.from(new Set(steps.map((s) => s.signer_id).filter(Boolean)));
  const { data: stepProfRows } = stepSignerIds.length
    ? await admin.from('profiles').select('id, full_name, email, role').in('id', stepSignerIds)
    : { data: [] as any[] };
  const stepProfById: Record<string, any> = {};
  ((stepProfRows ?? []) as any[]).forEach((p) => (stepProfById[p.id] = p));

  const stepsByReq: Record<string, any[]> = {};
  steps.forEach((s) => {
    const p = stepProfById[s.signer_id] || {};
    const item = {
      id: s.id,
      step_order: s.step_order,
      signer_id: s.signer_id,
      signer_role: s.signer_role,
      status: s.status,
      signed_name: s.signed_name,
      signed_at: s.signed_at,
      signer_name: p.full_name || 'Signer',
      signer_email: p.email || '',
      signer_role_label: roleLabel(p.role),
    };
    (stepsByReq[s.request_id] = stepsByReq[s.request_id] || []).push(item);
  });

  const sequentialRequests = seqRequests.map((r) => ({
    id: r.id,
    title: r.title,
    doc_type: r.doc_type,
    note: r.note,
    created_at: r.created_at,
    completed_at: r.completed_at || null,
    // batch_id groups a broadcast fan-out (one chain per member); audience drives
    // the "All active members" / "Selected members" label on the grouped card.
    batch_id: r.batch_id || null,
    audience: r.audience || null,
    steps: (stepsByReq[r.id] || []).slice().sort((a, b) => a.step_order - b.step_order),
  }));

  // Steps where the CURRENT staff user is the active signer (awaiting them).
  const seqReqById: Record<string, any> = {};
  seqRequests.forEach((r) => (seqReqById[r.id] = r));
  const myActiveSteps = steps
    .filter((s) => s.signer_id === user.id && s.status === 'active')
    .map((s) => {
      const r = seqReqById[s.request_id] || {};
      const total = (stepsByReq[s.request_id] || []).length;
      return {
        step_id: s.id,
        request_id: s.request_id,
        step_order: s.step_order,
        total,
        signer_role: s.signer_role,
        title: r.title || 'Document',
        doc_type: r.doc_type || 'other',
        note: r.note || null,
        // Custom fields this signer must fill in on their active step.
        custom_fields: parseCustomFields(s.custom_fields),
        // Positional PDF fields for THIS signer's active step (empty when none).
        positional_fields: fieldsForSigner(
          parseFieldLayout((r as any).field_layout),
          signerKeyForStep(s.step_order, s.signer_role)
        ),
      };
    });

  // Profiles for the ordered-signer picker (any role, so office-holders appear).
  const { data: pickRows } = await admin
    .from('profiles')
    .select('id, full_name, email, role')
    .order('full_name', { ascending: true });
  const pickerProfiles = ((pickRows ?? []) as any[]).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    role: p.role,
  }));

  return (
    <StaffSignRequests
      requests={data}
      activeMembers={activeMembers}
      canSend={isAdmin((me as any)?.role)}
      sequentialRequests={sequentialRequests}
      myActiveSteps={myActiveSteps}
      pickerProfiles={pickerProfiles}
    />
  );
}
