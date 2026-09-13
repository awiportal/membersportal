import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { roleLabel } from '@/lib/roles';
import MemberSignRequests from './MemberSignRequests';

export const dynamic = 'force-dynamic';

export default async function MemberSignRequestsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  // The member's own recipient rows (admin client, filtered by member_id), then
  // the parent request info for each.
  const admin = createAdminClient();
  const { data: rcptRows } = await admin
    .from('sign_request_recipients')
    .select('*')
    .eq('member_id', uid)
    .order('created_at', { ascending: false });
  const recipients = ((rcptRows ?? []) as any[]);

  const reqIds = Array.from(new Set(recipients.map((r) => r.request_id).filter(Boolean)));
  const { data: reqRows } = reqIds.length
    ? await admin.from('sign_requests').select('id, title, doc_type, note').in('id', reqIds)
    : { data: [] as any[] };
  const reqById: Record<string, any> = {};
  ((reqRows ?? []) as any[]).forEach((r) => (reqById[r.id] = r));

  const items = recipients.map((r) => {
    const req = reqById[r.request_id] || {};
    return {
      id: r.id,
      status: r.status,
      title: req.title || 'Document',
      doc_type: req.doc_type || 'other',
      note: req.note || null,
      member_signed_name: r.member_signed_name,
      member_signed_at: r.member_signed_at,
      countersigned_name: r.countersigned_name,
      countersigned_at: r.countersigned_at,
    };
  });

  // ---- Sequential (ordered) signing: requests where this member participates ----
  const { data: myStepRows } = await admin
    .from('sign_request_steps')
    .select('*')
    .eq('signer_id', uid);
  const mySteps = ((myStepRows ?? []) as any[]);
  const myReqIds = Array.from(new Set(mySteps.map((s) => s.request_id).filter(Boolean)));

  const { data: seqReqRows } = myReqIds.length
    ? await admin.from('sign_requests').select('*').in('id', myReqIds)
    : { data: [] as any[] };
  const seqReqById: Record<string, any> = {};
  ((seqReqRows ?? []) as any[]).forEach((r) => (seqReqById[r.id] = r));

  // All steps of those requests (to compute progress + who is currently signing).
  const { data: allStepRows } = myReqIds.length
    ? await admin
        .from('sign_request_steps')
        .select('*')
        .in('request_id', myReqIds)
        .order('step_order', { ascending: true })
    : { data: [] as any[] };
  const allSteps = ((allStepRows ?? []) as any[]);

  const signerIds = Array.from(new Set(allSteps.map((s) => s.signer_id).filter(Boolean)));
  const { data: profRows } = signerIds.length
    ? await admin.from('profiles').select('id, full_name, role').in('id', signerIds)
    : { data: [] as any[] };
  const profById: Record<string, any> = {};
  ((profRows ?? []) as any[]).forEach((p) => (profById[p.id] = p));

  const stepsByReq: Record<string, any[]> = {};
  allSteps.forEach((s) => {
    (stepsByReq[s.request_id] = stepsByReq[s.request_id] || []).push(s);
  });

  const sequentialItems = myReqIds
    .map((rid) => {
      const req = seqReqById[rid] || {};
      const stepsForReq = (stepsByReq[rid] || []).slice().sort((a, b) => a.step_order - b.step_order);
      const myStep = stepsForReq.find((s) => s.signer_id === uid);
      const active = stepsForReq.find((s) => s.status === 'active');
      const total = stepsForReq.length;
      const signed = stepsForReq.filter((s) => s.status === 'signed').length;
      const activeRoleLabel = active
        ? active.signer_role || roleLabel(profById[active.signer_id]?.role) || 'the next signer'
        : null;
      return {
        request_id: rid,
        step_id: myStep?.id || '',
        title: req.title || 'Document',
        doc_type: req.doc_type || 'other',
        note: req.note || null,
        completed_at: req.completed_at || null,
        my_status: myStep?.status || 'pending',
        my_step_order: myStep?.step_order || null,
        my_signed_at: myStep?.signed_at || null,
        my_turn: !!myStep && myStep.status === 'active',
        total,
        signed,
        active_role_label: activeRoleLabel,
        created_at: req.created_at || null,
      };
    })
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

  return <MemberSignRequests items={items} sequentialItems={sequentialItems} />;
}
