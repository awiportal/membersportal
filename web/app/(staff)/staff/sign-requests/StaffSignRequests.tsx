'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import SignaturePad from '@/components/SignaturePad';
import { roleLabel } from '@/lib/roles';
import { sendSignRequest, countersignSignRequest, sendSequentialSignRequest, signSequentialStep } from './actions';
import { DOC_TYPE_OPTIONS, docTypeLabel } from './docTypes';
import type { CustomField } from '@/lib/customFields';
import { officeSignerKey, serializeFieldLayout, type PlacedField } from '@/lib/fieldLayout';
import PdfFieldPlacer, { type PlacerSigner } from './PdfFieldPlacer';
import PdfSignOverlay from '@/components/PdfSignOverlay';

type Recipient = {
  id: string;
  member_id: string;
  status: string;
  member_name: string;
  member_email: string;
  member_signed_name?: string | null;
  member_signed_at?: string | null;
  countersigned_name?: string | null;
  countersigned_at?: string | null;
};
type SignRequest = {
  id: string;
  title: string;
  doc_type: string;
  note?: string | null;
  created_at?: string | null;
  recipients: Recipient[];
};
type Member = { id: string; full_name?: string | null; email?: string | null };

// ---- Sequential (ordered) signing types ----
type SeqStep = {
  id: string;
  step_order: number;
  signer_id: string;
  signer_role?: string | null;
  status: string;
  signed_name?: string | null;
  signed_at?: string | null;
  signer_name: string;
  signer_email: string;
  signer_role_label: string;
};
type SeqRequest = {
  id: string;
  title: string;
  doc_type: string;
  note?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  batch_id?: string | null;
  audience?: string | null;
  steps: SeqStep[];
};
type MyActiveStep = {
  step_id: string;
  request_id: string;
  step_order: number;
  total: number;
  signer_role?: string | null;
  title: string;
  doc_type: string;
  note?: string | null;
  custom_fields?: CustomField[];
  positional_fields?: PlacedField[];
};
type PickerProfile = { id: string; full_name?: string | null; email?: string | null; role?: string | null };

function fmtDate(v?: string | null) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(v?: string | null) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="badge badge-good" style={{ fontSize: 11 }}>
        <i className="fa-solid fa-circle-check" /> Completed
      </span>
    );
  }
  if (status === 'signed') {
    return (
      <span className="badge badge-warn" style={{ fontSize: 11 }}>
        <i className="fa-solid fa-pen-nib" /> Awaiting countersign
      </span>
    );
  }
  return (
    <span className="badge badge-info" style={{ fontSize: 11 }}>
      <i className="fa-regular fa-paper-plane" /> Awaiting signature
    </span>
  );
}

// ---------------------------------------------------------------------------
// Send panel (Admin/Chairlady only)
// ---------------------------------------------------------------------------
function SendPanel({ activeMembers }: { activeMembers: Member[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'all' | 'list'>('all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [pickQuery, setPickQuery] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const pickedCount = Object.values(picked).filter(Boolean).length;
  const shownMembers = activeMembers.filter((m) => {
    if (!pickQuery.trim()) return true;
    const q = pickQuery.toLowerCase();
    return (
      (m.full_name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)
    );
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const file = fd.get('file');
    if (!title) {
      setMsg('Please give the document a title.');
      return;
    }
    if (!(file instanceof File) || file.size === 0) {
      setMsg('Please choose a PDF to send.');
      return;
    }
    if (mode === 'list' && pickedCount === 0) {
      setMsg('Pick at least one member, or switch to "All active members".');
      return;
    }
    setBusy(true);
    try {
      const res = await sendSignRequest(fd);
      if (res?.error) {
        setMsg(res.error);
        return;
      }
      setMode('all');
      setPicked({});
      setPickQuery('');
      setFormKey((k) => k + 1); // reset the form (clears file + fields)
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || 'Could not send the document. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form key={formKey} onSubmit={onSubmit} className="card card-pad" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Send a document to sign</div>
      {msg && (
        <div className="badge badge-bad" style={{ marginBottom: 14 }}>
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}

      <div className="field">
        <label>
          Title <span style={{ color: 'var(--lime2)' }}>*</span>
        </label>
        <input className="input" name="title" placeholder="e.g. Exit acknowledgement" />
      </div>

      <div className="field">
        <label>Document type</label>
        <select className="input" name="doc_type" defaultValue="other">
          {DOC_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Note (optional)</label>
        <textarea className="input" name="note" rows={2} placeholder="A short message shown with the request" />
      </div>

      <div className="field">
        <label>Recipients</label>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="radio" name="mode" value="all" checked={mode === 'all'} onChange={() => setMode('all')} />
            <span>All active members</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="radio" name="mode" value="list" checked={mode === 'list'} onChange={() => setMode('list')} />
            <span>Pick members{mode === 'list' && pickedCount > 0 ? ` (${pickedCount})` : ''}</span>
          </label>
        </div>
      </div>

      {mode === 'list' && (
        <div className="field">
          <label>Choose members</label>
          {activeMembers.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>
              No active members found.
            </div>
          ) : (
            <>
              <input
                className="input"
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                placeholder="Search name or email"
                style={{ marginBottom: 8 }}
              />
              <div
                style={{
                  maxHeight: 220,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {shownMembers.map((m) => (
                  <label
                    key={m.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5, padding: '4px 2px' }}
                  >
                    <input
                      type="checkbox"
                      name="member_ids"
                      value={m.id}
                      checked={!!picked[m.id]}
                      onChange={(e) => setPicked((prev) => ({ ...prev, [m.id]: e.target.checked }))}
                    />
                    <span style={{ fontWeight: 600 }}>{m.full_name || 'Member'}</span>
                    {m.email ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {m.email}
                      </span>
                    ) : null}
                  </label>
                ))}
                {shownMembers.length === 0 && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    No members match &quot;{pickQuery}&quot;.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="field">
        <label>
          PDF document <span style={{ color: 'var(--lime2)' }}>*</span>
        </label>
        <input type="file" name="file" accept=".pdf,application/pdf" />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          PDF only, up to 15 MB.
        </div>
      </div>

      <button className="btn btn-lime" type="submit" disabled={busy}>
        {busy ? (
          'Sending…'
        ) : (
          <>
            <i className="fa-solid fa-paper-plane" /> Send for signing
          </>
        )}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sequential (ordered) send panel (Admin/Chairlady only)
// ---------------------------------------------------------------------------
// The DOWNSTREAM office sequence — the signers AFTER the member. The member is
// step 1 of every chain (signing as "Investor") and is chosen separately via the
// first-signer audience control, so it is NOT part of these presets.
// Per-signer highlight colours for placed PDF fields (builder boxes + signing
// overlay legend). Index 0 is the member (Investor, step 1); office-holders take
// the remaining colours in sequence order, wrapping if there are many.
const SIGNER_COLORS = ['#7c3aed', '#2563eb', '#c026d3', '#0d9488', '#d97706', '#db2777'];

const SEQ_ROLE_PRESETS: { label: string; role: string }[] = [
  { label: 'Secretary', role: 'secretary' },
  { label: 'Treasurer', role: 'treasurer' },
  { label: 'Chairlady', role: 'superadmin' },
];

type CustomFieldDraft = { uid: string; label: string; type: 'text' | 'date'; required: boolean };
type StepDraft = { uid: string; roleLabel: string; signerId: string; fields: CustomFieldDraft[] };

let seqUidCounter = 0;
function nextUid() {
  seqUidCounter += 1;
  return `seqstep-${seqUidCounter}`;
}

let fieldUidCounter = 0;
function nextFieldUid() {
  fieldUidCounter += 1;
  return `seqfield-${fieldUidCounter}`;
}

// Serialise builder rows into the { label, type, required } shape the creation
// action turns into stored custom_field DEFINITIONS (value = null).
function fieldsToJson(fields: CustomFieldDraft[]): string {
  return JSON.stringify(
    fields.map((f) => ({ label: f.label.trim(), type: f.type, required: f.required }))
  );
}

// Reusable editor for a signer's custom fields: rows of { label, type, required }.
function CustomFieldsEditor({
  fields,
  onAdd,
  onRemove,
  onChange,
}: {
  fields: CustomFieldDraft[];
  onAdd: () => void;
  onRemove: (uid: string) => void;
  onChange: (uid: string, patch: Partial<Pick<CustomFieldDraft, 'label' | 'type' | 'required'>>) => void;
}) {
  return (
    <div style={{ marginTop: 8, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
        Custom fields this signer must fill in when signing (optional)
      </div>
      {fields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fields.map((f) => (
            <div key={f.uid} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input"
                value={f.label}
                onChange={(e) => onChange(f.uid, { label: e.target.value })}
                placeholder="Field label (e.g. National ID number)"
                aria-label="Custom field label"
                style={{ flex: 1, minWidth: 160 }}
              />
              <select
                className="input"
                value={f.type}
                onChange={(e) => onChange(f.uid, { type: e.target.value === 'date' ? 'date' : 'text' })}
                aria-label="Custom field type"
                style={{ width: 110 }}
              >
                <option value="text">Text</option>
                <option value="date">Date</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => onChange(f.uid, { required: e.target.checked })}
                />
                Required
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onRemove(f.uid)}
                title="Remove field"
                aria-label="Remove field"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={onAdd}>
        <i className="fa-solid fa-plus" /> Add custom field
      </button>
    </div>
  );
}

function SequentialSendPanel({
  activeMembers,
  pickerProfiles,
}: {
  activeMembers: Member[];
  pickerProfiles: PickerProfile[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  // First signer (step 1 of every chain) is a member, signing as "Investor".
  const [firstAudience, setFirstAudience] = useState<'all' | 'list' | 'individual'>('individual');
  const [individualId, setIndividualId] = useState('');
  const [pickQuery, setPickQuery] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const pickedCount = Object.values(picked).filter(Boolean).length;
  const shownMembers = activeMembers.filter((m) => {
    if (!pickQuery.trim()) return true;
    const q = pickQuery.toLowerCase();
    return (m.full_name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
  });

  const defaultSignerFor = (role: string) => {
    const found = pickerProfiles.find((p) => p.role === role);
    return found ? found.id : '';
  };
  // Downstream office-holder steps only (the member is added server-side as step 1).
  const makeInitial = (): StepDraft[] =>
    SEQ_ROLE_PRESETS.map((r) => ({
      uid: nextUid(),
      roleLabel: r.label,
      signerId: defaultSignerFor(r.role),
      fields: [],
    }));

  const [steps, setSteps] = useState<StepDraft[]>(makeInitial);
  // Custom fields for the FIRST (member) signer — step 1 of every chain.
  const [firstFields, setFirstFields] = useState<CustomFieldDraft[]>([]);

  // Visual PDF field placement (optional layer): the chosen PDF and the boxes
  // dropped onto it. Cleared on a successful send / form reset.
  const [file, setFile] = useState<File | null>(null);
  const [placedFields, setPlacedFields] = useState<PlacedField[]>([]);
  // Phase 5b — document source: upload a PDF directly, or upload a Word (.docx)
  // that is converted server-side to an exact-layout PDF before placement/send.
  const [docSource, setDocSource] = useState<'pdf' | 'word'>('pdf');
  const [converting, setConverting] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);

  // Signers available to place fields for: the member (step 1) plus each
  // office-holder in the sequence, keyed the SAME way the signing/stamping side
  // derives keys (member -> 'member', office -> role label lowercased).
  const placerSigners: PlacerSigner[] = useMemo(() => {
    const arr: PlacerSigner[] = [
      { key: 'member', label: 'Member (Investor)', color: SIGNER_COLORS[0] },
    ];
    steps.forEach((s, i) => {
      const key = officeSignerKey(s.roleLabel);
      if (!key) return;
      if (arr.some((a) => a.key === key)) return;
      arr.push({
        key,
        label: s.roleLabel.trim() || 'Signer',
        color: SIGNER_COLORS[(i + 1) % SIGNER_COLORS.length],
      });
    });
    return arr;
  }, [steps]);

  function move(idx: number, dir: -1 | 1) {
    setSteps((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function removeStep(idx: number) {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }
  function addStep() {
    setSteps((prev) => [...prev, { uid: nextUid(), roleLabel: 'Signer', signerId: '', fields: [] }]);
  }
  function setSigner(idx: number, signerId: string) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, signerId } : s)));
  }
  function setRoleLabel(idx: number, roleLabel: string) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, roleLabel } : s)));
  }

  // First-signer (member) custom field handlers.
  function addFirstField() {
    setFirstFields((prev) => [...prev, { uid: nextFieldUid(), label: '', type: 'text', required: false }]);
  }
  function removeFirstField(uid: string) {
    setFirstFields((prev) => prev.filter((f) => f.uid !== uid));
  }
  function changeFirstField(
    uid: string,
    patch: Partial<Pick<CustomFieldDraft, 'label' | 'type' | 'required'>>
  ) {
    setFirstFields((prev) => prev.map((f) => (f.uid === uid ? { ...f, ...patch } : f)));
  }

  // Per office-holder step custom field handlers.
  function addStepField(idx: number) {
    setSteps((prev) =>
      prev.map((s, i) =>
        i === idx
          ? { ...s, fields: [...s.fields, { uid: nextFieldUid(), label: '', type: 'text', required: false }] }
          : s
      )
    );
  }
  function removeStepField(idx: number, uid: string) {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, fields: s.fields.filter((f) => f.uid !== uid) } : s))
    );
  }
  function changeStepField(
    idx: number,
    uid: string,
    patch: Partial<Pick<CustomFieldDraft, 'label' | 'type' | 'required'>>
  ) {
    setSteps((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, fields: s.fields.map((f) => (f.uid === uid ? { ...f, ...patch } : f)) } : s
      )
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    if (!title) {
      setMsg('Please give the document a title.');
      return;
    }
    if (!(file instanceof File) || file.size === 0) {
      setMsg('Please choose a document to send.');
      return;
    }
    // `file` (React state) is the document to send: the chosen PDF, or the PDF
    // produced from a Word upload by /api/sign/convert-docx. Submit THAT file,
    // not whatever raw upload is still sitting in the native <input>.
    fd.set('file', file, file.name);
    // Validate the first-signer audience.
    if (firstAudience === 'list' && pickedCount === 0) {
      setMsg('Pick at least one member, or choose "All active members".');
      return;
    }
    if (firstAudience === 'individual' && !individualId) {
      setMsg('Choose the member who signs first.');
      return;
    }
    const chosen = steps.filter((s) => s.signerId);
    if (chosen.length < 1) {
      setMsg('Add at least one office-holder to sign after the member.');
      return;
    }
    // Rebuild the audience + ordered signer fields from React state (source of truth).
    fd.set('first_audience', firstAudience);
    fd.set('first_role', 'investor');
    fd.set('first_custom_fields', fieldsToJson(firstFields));
    fd.delete('first_member_ids');
    if (firstAudience === 'list') {
      for (const m of activeMembers) if (picked[m.id]) fd.append('first_member_ids', m.id);
    } else if (firstAudience === 'individual') {
      fd.append('first_member_ids', individualId);
    }
    fd.delete('signer_ids');
    fd.delete('signer_roles');
    fd.delete('signer_custom_fields');
    for (const s of steps) {
      if (!s.signerId) continue;
      fd.append('signer_ids', s.signerId);
      fd.append('signer_roles', s.roleLabel.trim() || 'Signer');
      fd.append('signer_custom_fields', fieldsToJson(s.fields));
    }
    // Serialise the placed PDF fields, dropping any whose signer is no longer in
    // the sequence (e.g. an office-holder step was removed after boxes were
    // placed). An empty layout leaves the flow exactly as before.
    const knownSignerKeys = new Set(placerSigners.map((ps) => ps.key));
    fd.set(
      'field_layout',
      serializeFieldLayout(placedFields.filter((f) => knownSignerKeys.has(f.signer_key)))
    );
    setBusy(true);
    try {
      const res = await sendSequentialSignRequest(fd);
      if (res?.error) {
        setMsg(res.error);
        return;
      }
      setFirstAudience('individual');
      setIndividualId('');
      setPicked({});
      setPickQuery('');
      setSteps(makeInitial());
      setFile(null);
      setDocSource('pdf');
      setConvertMsg(null);
      setPlacedFields([]);
      setFormKey((k) => k + 1);
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || 'Could not send the document. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form key={formKey} onSubmit={onSubmit} className="card card-pad" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Send a document for ordered signing</div>
      {msg && (
        <div className="badge badge-bad" style={{ marginBottom: 14 }}>
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}

      <div className="field">
        <label>
          Title <span style={{ color: 'var(--lime2)' }}>*</span>
        </label>
        <input className="input" name="title" placeholder="e.g. Board resolution" />
      </div>

      <div className="field">
        <label>Document type</label>
        <select className="input" name="doc_type" defaultValue="other">
          {DOC_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Note (optional)</label>
        <textarea className="input" name="note" rows={2} placeholder="A short message shown with the request" />
      </div>

      {/* First signer: who signs step 1 of each chain (as Investor). Choosing more
          than one member broadcasts the document — each member gets their own chain. */}
      <div className="field">
        <label>First signer (the member)</label>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Step 1 of each chain is the member, signing as <strong>Investor</strong>. Choosing more than one member
          sends the document to every one of them — each gets their own chain through the office sequence below.
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="radio"
              name="first_audience_ui"
              value="all"
              checked={firstAudience === 'all'}
              onChange={() => setFirstAudience('all')}
            />
            <span>All active members</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="radio"
              name="first_audience_ui"
              value="list"
              checked={firstAudience === 'list'}
              onChange={() => setFirstAudience('list')}
            />
            <span>Selected members{firstAudience === 'list' && pickedCount > 0 ? ` (${pickedCount})` : ''}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="radio"
              name="first_audience_ui"
              value="individual"
              checked={firstAudience === 'individual'}
              onChange={() => setFirstAudience('individual')}
            />
            <span>A specific member</span>
          </label>
        </div>
      </div>

      {firstAudience === 'individual' && (
        <div className="field">
          <label>Choose the member</label>
          <select className="input" value={individualId} onChange={(e) => setIndividualId(e.target.value)}>
            <option value="">Choose a member…</option>
            {activeMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {(m.full_name || 'Member') + (m.email ? ` — ${m.email}` : '')}
              </option>
            ))}
          </select>
        </div>
      )}

      {firstAudience === 'list' && (
        <div className="field">
          <label>Choose members</label>
          {activeMembers.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>
              No active members found.
            </div>
          ) : (
            <>
              <input
                className="input"
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                placeholder="Search name or email"
                style={{ marginBottom: 8 }}
              />
              <div
                style={{
                  maxHeight: 220,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {shownMembers.map((m) => (
                  <label
                    key={m.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5, padding: '4px 2px' }}
                  >
                    <input
                      type="checkbox"
                      checked={!!picked[m.id]}
                      onChange={(e) => setPicked((prev) => ({ ...prev, [m.id]: e.target.checked }))}
                    />
                    <span style={{ fontWeight: 600 }}>{m.full_name || 'Member'}</span>
                    {m.email ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {m.email}
                      </span>
                    ) : null}
                  </label>
                ))}
                {shownMembers.length === 0 && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    No members match &quot;{pickQuery}&quot;.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="field">
        <label>Custom fields for the member (step 1)</label>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
          Ask the member to fill in extra details when they sign. The same fields apply to step 1 of every chain.
        </div>
        <CustomFieldsEditor
          fields={firstFields}
          onAdd={addFirstField}
          onRemove={removeFirstField}
          onChange={changeFirstField}
        />
      </div>

      <div className="field">
        <label>Office sequence (signs after the member)</label>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          These office-holders sign in turn AFTER the member. The next signer is only notified once the previous one
          has signed.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {steps.map((s, i) => (
            <div
              key={s.uid}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 10,
                background: 'var(--surface)',
              }}
            >
              <span className="badge badge-info" style={{ fontSize: 11 }}>
                Step {i + 1}
              </span>
              <select
                className="input"
                value={s.signerId}
                onChange={(e) => setSigner(i, e.target.value)}
                style={{ flex: 1, minWidth: 200 }}
              >
                <option value="">Choose a person…</option>
                {pickerProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.full_name || 'Member') + (p.role ? ` — ${roleLabel(p.role)}` : '')}
                  </option>
                ))}
              </select>
              <input
                className="input"
                value={s.roleLabel}
                onChange={(e) => setRoleLabel(i, e.target.value)}
                placeholder="Role label"
                aria-label="Role label"
                style={{ width: 150 }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  title="Move up"
                >
                  <i className="fa-solid fa-arrow-up" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => move(i, 1)}
                  disabled={i === steps.length - 1}
                  title="Move down"
                >
                  <i className="fa-solid fa-arrow-down" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeStep(i)}
                  disabled={steps.length <= 1}
                  title="Remove signer"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              <div style={{ flexBasis: '100%', width: '100%' }}>
                <CustomFieldsEditor
                  fields={s.fields}
                  onAdd={() => addStepField(i)}
                  onRemove={(uid) => removeStepField(i, uid)}
                  onChange={(uid, patch) => changeStepField(i, uid, patch)}
                />
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={addStep}>
          <i className="fa-solid fa-plus" /> Add signer
        </button>
      </div>

      <div className="field">
        <label>
          Document <span style={{ color: 'var(--lime2)' }}>*</span>
        </label>
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="radio"
              name="doc_source"
              value="pdf"
              checked={docSource === 'pdf'}
              onChange={() => {
                setDocSource('pdf');
                setFile(null);
                setConvertMsg(null);
              }}
            />
            PDF
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="radio"
              name="doc_source"
              value="word"
              checked={docSource === 'word'}
              onChange={() => {
                setDocSource('word');
                setFile(null);
                setConvertMsg(null);
              }}
            />
            Word (.docx)
          </label>
        </div>
        <input
          type="file"
          name="file"
          accept={
            docSource === 'pdf'
              ? '.pdf,application/pdf'
              : '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          }
          onChange={async (e) => {
            const picked =
              e.currentTarget.files && e.currentTarget.files[0] ? e.currentTarget.files[0] : null;
            if (docSource === 'pdf') {
              setFile(picked);
              return;
            }
            // Word (.docx): convert to an exact-layout PDF server-side, then feed
            // the converted PDF into the existing placement/signing flow.
            setConvertMsg(null);
            if (!picked) {
              setFile(null);
              return;
            }
            setConverting(true);
            setFile(null);
            try {
              const body = new FormData();
              body.append('file', picked);
              const res = await fetch('/api/sign/convert-docx', { method: 'POST', body });
              if (res.ok) {
                const blob = await res.blob();
                setFile(
                  new File([blob], picked.name.replace(/\.docx$/i, '.pdf'), {
                    type: 'application/pdf',
                  })
                );
              } else if (res.status === 503) {
                setConvertMsg(
                  "Word conversion isn't set up yet. Add CLOUDCONVERT_API_KEY in Vercel (Production, server-only) and redeploy."
                );
              } else {
                let detail = 'Could not convert this Word document. Please try again.';
                try {
                  const j = await res.json();
                  if (j?.error) detail = String(j.error);
                } catch {
                  /* non-JSON error body */
                }
                setConvertMsg(detail);
              }
            } catch (err: any) {
              setConvertMsg(err?.message || 'Could not convert this Word document. Please try again.');
            } finally {
              setConverting(false);
            }
          }}
        />
        {converting && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            <i className="fa-solid fa-spinner fa-spin" /> Converting Word to PDF…
          </div>
        )}
        {convertMsg && (
          <div className="badge badge-bad" style={{ marginTop: 6 }}>
            <i className="fa-solid fa-circle-exclamation" /> {convertMsg}
          </div>
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {docSource === 'pdf'
            ? 'PDF only, up to 15 MB.'
            : 'Word (.docx), up to 15 MB. The exact original layout is preserved: the file is converted to PDF, then you drag the signing fields onto that converted PDF.'}
        </div>
      </div>

      {file && placerSigners.length > 0 && (
        <div className="field">
          <label>Place fields on the document (optional)</label>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Drop signature, name, date and text boxes onto exact spots for each signer. Leave this
            empty to send the document without placed fields (unchanged behaviour).
          </div>
          <PdfFieldPlacer
            file={file}
            signers={placerSigners}
            fields={placedFields}
            onChange={setPlacedFields}
          />
        </div>
      )}

      <button className="btn btn-lime" type="submit" disabled={busy}>
        {busy ? (
          'Sending…'
        ) : (
          <>
            <i className="fa-solid fa-list-ol" /> Send for ordered signing
          </>
        )}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Create area: choose Individual vs Sequential flow
// ---------------------------------------------------------------------------
function CreateArea({ activeMembers, pickerProfiles }: { activeMembers: Member[]; pickerProfiles: PickerProfile[] }) {
  const [flow, setFlow] = useState<'individual' | 'sequential'>('individual');

  const tabBase: React.CSSProperties = {
    flex: 1,
    padding: '9px 10px',
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 600,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    minHeight: 40,
  };
  const tabActive: React.CSSProperties = {
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: 3,
          borderRadius: 12,
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          marginBottom: 14,
          maxWidth: 420,
        }}
      >
        <button type="button" style={{ ...tabBase, ...(flow === 'individual' ? tabActive : {}) }} onClick={() => setFlow('individual')}>
          <i className="fa-solid fa-user-check" style={{ marginRight: 6 }} /> Individual
        </button>
        <button type="button" style={{ ...tabBase, ...(flow === 'sequential' ? tabActive : {}) }} onClick={() => setFlow('sequential')}>
          <i className="fa-solid fa-list-ol" style={{ marginRight: 6 }} /> Sequential
        </button>
      </div>
      {flow === 'individual' ? (
        <SendPanel activeMembers={activeMembers} />
      ) : (
        <SequentialSendPanel activeMembers={activeMembers} pickerProfiles={pickerProfiles} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline countersign form for one recipient that has status 'signed'
// ---------------------------------------------------------------------------
function CountersignForm({ recipient, onDone }: { recipient: Recipient; onDone: () => void }) {
  const router = useRouter();
  const [hasSig, setHasSig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await countersignSignRequest(fd);
      if (res?.error) {
        setMsg(res.error);
        return;
      }
      onDone();
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || 'Could not countersign. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ marginTop: 12, display: 'grid', gap: 12, borderTop: '1px dashed var(--border)', paddingTop: 12 }}
    >
      <input type="hidden" name="recipient_id" value={recipient.id} />
      <input type="hidden" name="countersign_signature_kind" value="draw" />
      {msg && (
        <div className="badge badge-bad">
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Countersigned by (optional)</label>
        <input className="input" name="countersigned_name" placeholder="Defaults to your name" />
      </div>
      <div>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>Your signature</label>
        <SignaturePad name="countersign_signature_image" onCapture={setHasSig} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-lime btn-sm" type="submit" disabled={busy || !hasSig}>
          <i className="fa-solid fa-signature" /> {busy ? 'Saving…' : 'Countersign & complete'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// One recipient row inside a request
// ---------------------------------------------------------------------------
function RecipientRow({ rc, canSend }: { rc: Recipient; canSend: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{rc.member_name}</div>
          {rc.member_email ? (
            <div className="muted" style={{ fontSize: 12 }}>
              {rc.member_email}
            </div>
          ) : null}
        </div>
        <StatusBadge status={rc.status} />
        {rc.status === 'signed' && canSend && !open && (
          <button className="btn btn-lime btn-sm" type="button" onClick={() => setOpen(true)}>
            <i className="fa-solid fa-signature" /> Countersign
          </button>
        )}
        {rc.status === 'completed' && (
          <a
            href={`/staff/sign-requests/${rc.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            <i className="fa-solid fa-download" /> Download
          </a>
        )}
      </div>

      {/* Timeline detail */}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {rc.member_signed_at && (
          <span>
            <i className="fa-solid fa-pen" /> Signed {fmtDateTime(rc.member_signed_at)}
          </span>
        )}
        {rc.status === 'completed' && rc.countersigned_at && (
          <span>
            <i className="fa-solid fa-stamp" /> Countersigned by {rc.countersigned_name || 'the office'} on {fmtDateTime(rc.countersigned_at)}
          </span>
        )}
        {rc.status === 'sent' && <span>Not signed yet.</span>}
        {rc.status === 'signed' && !canSend && <span>Awaiting countersignature by an Admin or Chairlady.</span>}
      </div>

      {rc.status === 'signed' && canSend && open && (
        <CountersignForm recipient={rc} onDone={() => setOpen(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One request card with progress + filters + search over its recipients
// ---------------------------------------------------------------------------
type FilterKey = 'all' | 'sent' | 'signed' | 'completed';

function RequestCard({ r, canSend }: { r: SignRequest; canSend: boolean }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const c = { total: r.recipients.length, sent: 0, signed: 0, completed: 0 };
    for (const rc of r.recipients) {
      if (rc.status === 'completed') c.completed += 1;
      else if (rc.status === 'signed') c.signed += 1;
      else c.sent += 1;
    }
    return c;
  }, [r.recipients]);

  const pct = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return r.recipients.filter((rc) => {
      if (filter !== 'all' && rc.status !== filter) return false;
      if (!query) return true;
      return (
        (rc.member_name || '').toLowerCase().includes(query) ||
        (rc.member_email || '').toLowerCase().includes(query)
      );
    });
  }, [r.recipients, filter, q]);

  const bulk = counts.total > 6;

  const Chip = ({ k, label, tone }: { k: FilterKey; label: string; tone: string }) => (
    <button
      type="button"
      onClick={() => setFilter((cur) => (cur === k ? 'all' : k))}
      className="badge"
      style={{
        cursor: 'pointer',
        fontSize: 11.5,
        background: filter === k ? tone : 'var(--surface)',
        color: filter === k ? '#fff' : 'var(--text)',
        border: '1px solid var(--border)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--surface)',
            color: 'var(--purple2)',
          }}
        >
          <i className="fa-solid fa-file-pen" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600 }}>{r.title}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {docTypeLabel(r.doc_type)}
            {r.created_at ? ` · Sent ${fmtDate(r.created_at)}` : ''}
          </div>
          {r.note ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {r.note}
            </div>
          ) : null}
        </div>
        <div style={{ textAlign: 'right', minWidth: 120 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {counts.completed}/{counts.total}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>completed</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 12, height: 8, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green, #61CE70)', borderRadius: 999, transition: 'width .3s' }} />
      </div>

      {/* Filter chips */}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip k="sent" label={`Awaiting signature ${counts.sent}`} tone="#6b7280" />
        <Chip k="signed" label={`Awaiting countersign ${counts.signed}`} tone="#c98a00" />
        <Chip k="completed" label={`Completed ${counts.completed}`} tone="#3a9d52" />
        {filter !== 'all' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter('all')}>
            Clear filter
          </button>
        )}
      </div>

      {canSend && counts.signed > 0 && filter !== 'signed' && (
        <div
          className="badge badge-warn"
          style={{ marginTop: 12, cursor: 'pointer', fontSize: 12 }}
          onClick={() => setFilter('signed')}
        >
          <i className="fa-solid fa-bell" /> {counts.signed} waiting for your countersignature — review
        </div>
      )}

      {/* Search (bulk only) */}
      {bulk && (
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search recipients by name or email"
          style={{ marginTop: 12 }}
        />
      )}

      {/* Recipient list */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxHeight: bulk ? 460 : undefined,
          overflowY: bulk ? 'auto' : undefined,
        }}
      >
        {filtered.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>
            No recipients match this view.
          </div>
        ) : (
          filtered.map((rc) => <RecipientRow key={rc.id} rc={rc} canSend={canSend} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sequential: sign form for the current staff user's active step
// ---------------------------------------------------------------------------
function SequentialSignForm({ step }: { step: MyActiveStep }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [hasSig, setHasSig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fields = step.custom_fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});

  // Positional PDF fields for THIS signer (additive; empty -> unchanged flow).
  const posFields = step.positional_fields ?? [];
  const [posValues, setPosValues] = useState<Record<string, string>>({});
  const [sig, setSig] = useState('');

  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const requiredOk = fields.every((f) => !f.required || (values[f.key] || '').trim().length > 0);
  const posRequiredOk = posFields.every((f) => {
    if (f.type === 'signature') return !f.required || hasSig;
    if (f.type === 'name') return !f.required || (posValues[f.id] || name).trim().length > 0;
    return !f.required || (posValues[f.id] || '').trim().length > 0;
  });
  const canSubmit = name.trim().length > 1 && hasSig && requiredOk && posRequiredOk && !busy;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set('custom_field_values', JSON.stringify(values));
    // Fill any untouched name boxes with the signer's typed name before submit.
    const finalPos: Record<string, string> = { ...posValues };
    for (const f of posFields) {
      if (f.type === 'name' && !(finalPos[f.id] && finalPos[f.id].trim())) finalPos[f.id] = name.trim();
    }
    fd.set('positional_values', JSON.stringify(finalPos));
    setBusy(true);
    try {
      const res = await signSequentialStep(fd);
      if (res?.error) {
        setMsg(res.error);
        return;
      }
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || 'Could not submit your signature. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 12, display: 'grid', gap: 12 }}>
      <input type="hidden" name="step_id" value={step.step_id} />
      <input type="hidden" name="signature_kind" value="draw" />
      {msg && (
        <div className="badge badge-bad">
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Full name</label>
          <input
            className="input"
            name="signed_name"
            placeholder="Your full name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Date</label>
          <input className="input" type="date" name="signed_date" defaultValue={todayIso} />
        </div>
      </div>
      {fields.length > 0 && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          {fields.map((f) => (
            <div className="field" style={{ marginBottom: 0 }} key={f.key}>
              <label>
                {f.label}
                {f.required ? <span style={{ color: 'var(--lime2)' }}> *</span> : null}
              </label>
              <input
                className="input"
                type={f.type === 'date' ? 'date' : 'text'}
                required={f.required}
                value={values[f.key] || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
      {posFields.length > 0 && (
        <PdfSignOverlay
          originalUrl={`/staff/sign-requests/${step.request_id}/download?original=1`}
          fields={posFields}
          values={posValues}
          onChange={setPosValues}
          signatureDataUrl={sig}
          signerName={name}
        />
      )}
      <div>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>Your signature</label>
        <SignaturePad name="signature_image" onCapture={setHasSig} onValue={setSig} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-lime btn-sm" type="submit" disabled={!canSubmit}>
          <i className="fa-solid fa-signature" /> {busy ? 'Submitting…' : 'Sign & submit'}
        </button>
        <span className="muted" style={{ fontSize: 11.5, flex: 1, minWidth: 200 }}>
          You are step {step.step_order} of {step.total}. Your name and date are recorded for the audit trail.
        </span>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sequential: one request card with the ordered signer chain + progress
// ---------------------------------------------------------------------------
function SeqStepBadge({ status }: { status: string }) {
  if (status === 'signed') {
    return (
      <span className="badge badge-good" style={{ fontSize: 11 }}>
        <i className="fa-solid fa-circle-check" /> Signed
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="badge badge-warn" style={{ fontSize: 11 }}>
        <i className="fa-solid fa-pen-nib" /> Signing now
      </span>
    );
  }
  return (
    <span className="badge badge-info" style={{ fontSize: 11 }}>
      <i className="fa-regular fa-clock" /> Waiting
    </span>
  );
}

function SequentialRequestCard({ r }: { r: SeqRequest }) {
  const total = r.steps.length;
  const signed = r.steps.filter((s) => s.status === 'signed').length;
  const active = r.steps.find((s) => s.status === 'active');
  const completed = !!r.completed_at;
  const pct = total ? Math.round((signed / total) * 100) : 0;
  const activeRole = active ? (active.signer_role || active.signer_role_label || 'the next signer') : null;
  const progressText = completed
    ? 'Completed - fully signed'
    : `${signed} of ${total} signed${activeRole ? ` — awaiting ${activeRole}` : ''}`;

  return (
    <div style={{ padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--surface)',
            color: 'var(--purple2)',
          }}
        >
          <i className="fa-solid fa-list-ol" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600 }}>{r.title}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {docTypeLabel(r.doc_type)}
            {r.created_at ? ` · Started ${fmtDate(r.created_at)}` : ''}
          </div>
          {r.note ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {r.note}
            </div>
          ) : null}
        </div>
        <div style={{ textAlign: 'right', minWidth: 130 }}>
          {completed ? (
            <span className="badge badge-good" style={{ fontSize: 11 }}>
              <i className="fa-solid fa-circle-check" /> Completed
            </span>
          ) : (
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {signed}/{total}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 12, height: 8, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green, #61CE70)', borderRadius: 999, transition: 'width .3s' }} />
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {progressText}
      </div>

      {/* Ordered signer chain */}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {r.steps.map((s) => (
          <div
            key={s.id}
            style={{ padding: 12, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="badge badge-info" style={{ fontSize: 11 }}>
                Step {s.step_order}
              </span>
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                  {s.signed_name || s.signer_name}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {' '}
                    — {s.signer_role || s.signer_role_label}
                  </span>
                </div>
                {s.signer_email ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {s.signer_email}
                  </div>
                ) : null}
              </div>
              <SeqStepBadge status={s.status} />
            </div>
            {s.signed_at && (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                <i className="fa-solid fa-pen" /> Signed {fmtDateTime(s.signed_at)}
              </div>
            )}
          </div>
        ))}
      </div>

      {completed && (
        <div style={{ marginTop: 12 }}>
          <a
            href={`/staff/sign-requests/${r.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-lime btn-sm"
          >
            <i className="fa-solid fa-file-circle-check" /> View signed document
          </a>
          <a
            href={`/staff/sign-requests/${r.id}/download?download=1`}
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 8 }}
          >
            <i className="fa-solid fa-download" /> Download
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group sequential requests into broadcasts. Requests sharing a batch_id belong
// to one broadcast (one chain per member); a null batch_id is a standalone chain.
// Order is preserved from the incoming (created_at desc) list.
// ---------------------------------------------------------------------------
type SeqGroup = { batch_id: string | null; chains: SeqRequest[] };

function groupSequential(reqs: SeqRequest[]): SeqGroup[] {
  const out: SeqGroup[] = [];
  const byBatch: Record<string, SeqGroup> = {};
  for (const r of reqs) {
    const b = r.batch_id || null;
    if (!b) {
      out.push({ batch_id: null, chains: [r] });
      continue;
    }
    if (!byBatch[b]) {
      byBatch[b] = { batch_id: b, chains: [] };
      out.push(byBatch[b]);
    }
    byBatch[b].chains.push(r);
  }
  return out;
}

function audienceLabel(a?: string | null) {
  if (a === 'all') return 'All active members';
  if (a === 'list') return 'Selected members';
  return 'Members';
}

// One card for a broadcast batch: rollup "M of N members completed", with an
// expandable list of each member's chain (status + download when complete).
function SequentialBatchCard({ chains }: { chains: SeqRequest[] }) {
  const [open, setOpen] = useState(false);
  const first = chains[0] || ({} as SeqRequest);
  const N = chains.length;
  const M = chains.filter((c) => !!c.completed_at).length;
  const pct = N ? Math.round((M / N) * 100) : 0;

  return (
    <div style={{ padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--surface)',
            color: 'var(--purple2)',
          }}
        >
          <i className="fa-solid fa-people-group" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600 }}>{first.title}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {docTypeLabel(first.doc_type)} · {audienceLabel(first.audience)}
            {first.created_at ? ` · Sent ${fmtDate(first.created_at)}` : ''}
          </div>
          {first.note ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {first.note}
            </div>
          ) : null}
        </div>
        <div style={{ textAlign: 'right', minWidth: 120 }}>
          {M === N ? (
            <span className="badge badge-good" style={{ fontSize: 11 }}>
              <i className="fa-solid fa-circle-check" /> All completed
            </span>
          ) : (
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {M}/{N}
            </div>
          )}
        </div>
      </div>

      {/* Rollup progress */}
      <div style={{ marginTop: 12, height: 8, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green, #61CE70)', borderRadius: 999, transition: 'width .3s' }} />
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {M} of {N} members completed
      </div>

      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setOpen((v) => !v)}>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} /> {open ? 'Hide member chains' : `Show member chains (${N})`}
      </button>

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chains.map((c) => {
            const memberStep = c.steps.find((s) => s.step_order === 1) || c.steps[0];
            const memberName = memberStep?.signed_name || memberStep?.signer_name || 'Member';
            const total = c.steps.length;
            const signed = c.steps.filter((s) => s.status === 'signed').length;
            const active = c.steps.find((s) => s.status === 'active');
            const activeRole = active ? active.signer_role || active.signer_role_label || 'the next signer' : null;
            const cCompleted = !!c.completed_at;
            return (
              <div
                key={c.id}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{memberName}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {cCompleted
                      ? 'Fully signed'
                      : `${signed} of ${total} signed${activeRole ? ` — awaiting ${activeRole}` : ''}`}
                  </div>
                </div>
                {cCompleted ? (
                  <span className="badge badge-good" style={{ fontSize: 11 }}>
                    <i className="fa-solid fa-circle-check" /> Completed
                  </span>
                ) : (
                  <span className="badge badge-info" style={{ fontSize: 11 }}>
                    <i className="fa-regular fa-clock" /> In progress
                  </span>
                )}
                {cCompleted && (
                  <a
                    href={`/staff/sign-requests/${c.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    <i className="fa-solid fa-download" /> Download
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function StaffSignRequests({
  requests,
  activeMembers,
  canSend,
  sequentialRequests = [],
  myActiveSteps = [],
  pickerProfiles = [],
}: {
  requests: SignRequest[];
  activeMembers: Member[];
  canSend: boolean;
  sequentialRequests?: SeqRequest[];
  myActiveSteps?: MyActiveStep[];
  pickerProfiles?: PickerProfile[];
}) {
  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div className="page-title">Documents to sign</div>
      <div className="sub">
        Send a PDF to one member, a chosen group, or all active members to sign online. Once a member has signed, an Admin or
        Chairlady countersigns to complete it. Use the Sequential flow to route one document through several signers in a set order.
      </div>

      {canSend && (
        <div style={{ marginTop: 20 }}>
          <CreateArea activeMembers={activeMembers} pickerProfiles={pickerProfiles} />
        </div>
      )}

      {myActiveSteps.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
            <i className="fa-solid fa-pen-nib" style={{ marginRight: 6, color: 'var(--purple2)' }} /> Awaiting your signature
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {myActiveSteps.map((s) => (
              <div
                key={s.step_id}
                style={{ padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}
              >
                <div style={{ fontWeight: 600 }}>{s.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {docTypeLabel(s.doc_type)} · Step {s.step_order} of {s.total}
                  {s.signer_role ? ` · Signing as ${s.signer_role}` : ''}
                </div>
                {s.note ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {s.note}
                  </div>
                ) : null}
                <SequentialSignForm step={s} />
              </div>
            ))}
          </div>
        </div>
      )}

      {sequentialRequests.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Ordered (sequential) documents</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {groupSequential(sequentialRequests).map((g) =>
              g.batch_id ? (
                <SequentialBatchCard key={g.batch_id} chains={g.chains} />
              ) : (
                <SequentialRequestCard key={g.chains[0].id} r={g.chains[0]} />
              )
            )}
          </div>
        </div>
      )}

      <div className="card card-pad">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Sent documents</div>
        {requests.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            No documents sent yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {requests.map((r) => (
              <RequestCard key={r.id} r={r} canSend={canSend} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
