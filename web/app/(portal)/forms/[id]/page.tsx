import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import FormFill, { FormField } from './FormFill';

export const dynamic = 'force-dynamic';

export default async function FormDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const { data: form } = await supabase.from('forms').select('*').eq('id', params.id).single();
  if (!form) notFound();

  const { data: subRows } = await supabase
    .from('form_submissions')
    .select('*')
    .eq('form_id', params.id)
    .eq('member_id', uid)
    .limit(1);
  const sub = ((subRows ?? []) as any[])[0];

  const fields: FormField[] = Array.isArray(form.fields) ? form.fields : [];
  const submitted = sub?.status === 'submitted' || sub?.status === 'approved';

  return (
    <div>
      <Link href="/forms" className="btn btn-ghost btn-sm"><i className="fa-solid fa-arrow-left" /> All forms</Link>
      <div className="page-title" style={{ marginTop: 14 }}>{form.title}</div>
      <div className="sub">{form.description || 'Fill the form, then sign and submit.'}</div>

      {submitted && (
        <div className="card card-pad" style={{ marginTop: 16, borderColor: 'rgba(55,201,138,0.3)' }}>
          <i className="fa-solid fa-circle-check" style={{ color: 'var(--good)' }} /> You&apos;ve already submitted this form. You can update and resubmit it below.
        </div>
      )}

      <FormFill
        formId={form.id}
        fields={fields}
        requireSignature={!!form.require_signature}
        existingAnswers={(sub?.answers as Record<string, unknown>) || {}}
      />
    </div>
  );
}
