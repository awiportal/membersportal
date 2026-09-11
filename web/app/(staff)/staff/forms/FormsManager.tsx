'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { createForm, updateForm, setFormStatus, deleteForm } from './actions';
import ConfirmSubmit from '@/components/ConfirmSubmit';

type Field = { label: string; type: string; required: boolean; options?: string[] };

const TYPES: [string, string][] = [
  ['text', 'Short text'],
  ['textarea', 'Paragraph'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['select', 'Dropdown'],
];

const emptyField = (): Field => ({ label: '', type: 'text', required: false });

export default function FormsManager({
  forms,
  counts,
  flash,
}: {
  forms: any[];
  counts: Record<string, { total: number; pending: number }>;
  flash?: { ok?: string; err?: string };
}) {
  const [editing, setEditing] = useState<any | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requireSig, setRequireSig] = useState(false);
  const [published, setPublished] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [fields, setFields] = useState<Field[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  function reset() {
    setEditing(null);
    setTitle('');
    setDescription('');
    setRequireSig(false);
    setPublished(true);
    setSortOrder(0);
    setFields([]);
  }

  function startEdit(f: any) {
    setEditing(f);
    setTitle(f.title || '');
    setDescription(f.description || '');
    setRequireSig(!!f.require_signature);
    setPublished(f.status === 'active');
    setSortOrder(Number(f.sort_order) || 0);
    const parsed: Field[] = Array.isArray(f.fields)
      ? f.fields.map((x: any) => ({
          label: String(x?.label || ''),
          type: String(x?.type || 'text'),
          required: !!x?.required,
          options: Array.isArray(x?.options) ? x.options.map((o: any) => String(o)) : undefined,
        }))
      : [];
    setFields(parsed);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateField(i: number, patch: Partial<Field>) {
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function moveField(i: number, dir: -1 | 1) {
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const copy = [...fs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function removeField(i: number) {
    setFields((fs) => fs.filter((_, idx) => idx !== i));
  }

  // Serialised payload the server action parses back into stored fields.
  const fieldsPayload = JSON.stringify(
    fields.map((f) => ({
      label: f.label,
      type: f.type,
      required: f.required,
      ...(f.type === 'select' ? { options: f.options || [] } : {}),
    })),
  );

  const banners: Record<string, string> = {
    created: 'Form created.',
    updated: 'Form saved.',
    published: 'Form published — members can see it now.',
    unpublished: 'Form unpublished — hidden from members.',
    deleted: 'Form deleted.',
  };
  const banner = flash?.ok ? banners[flash.ok] : null;
  const errText =
    flash?.err === 'title' ? 'Please give the form a title.' : flash?.err ? 'Could not save the form. Please try again.' : null;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="page-title">Online Forms</div>
      <div className="sub">Create forms members fill and e-sign in their portal, and review what they submit.</div>

      {banner && (
        <div className="badge badge-good" style={{ marginTop: 16, padding: '10px 14px', fontSize: 13 }}>
          <i className="fa-solid fa-circle-check" /> {banner}
        </div>
      )}
      {errText && (
        <div className="badge badge-bad" style={{ marginTop: 16, padding: '10px 14px', fontSize: 13 }}>
          <i className="fa-solid fa-circle-exclamation" /> {errText}
        </div>
      )}

      {/* Builder */}
      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{editing ? 'Edit form' : 'New form'}</div>
          {editing && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              <i className="fa-solid fa-plus" /> New form
            </button>
          )}
        </div>

        <form ref={formRef} action={editing ? updateForm : createForm}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <input type="hidden" name="fields" value={fieldsPayload} />
          <input type="hidden" name="require_signature" value={requireSig ? '1' : '0'} />
          <input type="hidden" name="published" value={published ? '1' : '0'} />

          <div className="field">
            <label>Title</label>
            <input
              className="input"
              name="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Annual member declaration"
            />
          </div>
          <div className="field">
            <label>Description (optional)</label>
            <textarea
              className="input"
              name="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown under the title when a member opens the form."
            />
          </div>

          <div style={{ fontWeight: 700, fontSize: 14, margin: '16px 0 8px' }}>Fields</div>
          {fields.length === 0 && (
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
              No fields yet. A form with no fields just collects a signature. Add fields below.
            </div>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {fields.map((f, i) => (
              <div key={i} className="card" style={{ padding: 12, background: 'var(--surface2)' }}>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11.5 }}>Question / label</label>
                    <input className="input" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} placeholder="e.g. Full name" />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11.5 }}>Type</label>
                    <select className="input" value={f.type} onChange={(e) => updateField(i, { type: e.target.value })}>
                      {TYPES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {f.type === 'select' && (
                  <div className="field" style={{ margin: '10px 0 0' }}>
                    <label style={{ fontSize: 11.5 }}>Dropdown options (comma-separated)</label>
                    <input
                      className="input"
                      value={(f.options || []).join(', ')}
                      onChange={(e) => updateField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                      placeholder="e.g. Yes, No, Maybe"
                    />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} /> Required
                  </label>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveField(i, -1)} disabled={i === 0} title="Move up">
                      <i className="fa-solid fa-arrow-up" />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} title="Move down">
                      <i className="fa-solid fa-arrow-down" />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#ef5a5a' }} onClick={() => removeField(i)} title="Remove field">
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setFields((fs) => [...fs, emptyField()])}>
            <i className="fa-solid fa-plus" /> Add field
          </button>

          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginTop: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={requireSig} onChange={(e) => setRequireSig(e.target.checked)} /> Require signature
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published (visible to members)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
              Order
              <input className="input" style={{ width: 80 }} type="number" name="sort_order" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} disabled={!title.trim()}>
              <i className="fa-solid fa-floppy-disk" /> {editing ? 'Save changes' : 'Create form'}
            </button>
          </div>
        </form>
      </div>

      {/* Existing forms */}
      <div style={{ fontWeight: 800, fontSize: 16, margin: '24px 0 12px' }}>All forms</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {forms.length === 0 && <div className="card card-pad muted" style={{ fontSize: 13 }}>No forms yet — create your first above.</div>}
        {forms.map((f) => {
          const c = counts[f.id] || { total: 0, pending: 0 };
          const nfields = Array.isArray(f.fields) ? f.fields.length : 0;
          return (
            <div key={f.id} className="card card-pad" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <span className="ic" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--surface2)', color: 'var(--lime2)', flexShrink: 0 }}>
                <i className="fa-solid fa-file-signature" />
              </span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`badge ${f.status === 'active' ? 'badge-good' : 'badge-warn'}`} style={{ fontSize: 10.5 }}>{f.status === 'active' ? 'Published' : 'Unpublished'}</span>
                  {f.require_signature && (
                    <span className="badge badge-purple" style={{ fontSize: 10.5 }}>
                      <i className="fa-solid fa-pen-nib" /> Signature
                    </span>
                  )}
                  <span className="badge badge-info" style={{ fontSize: 10.5 }}>{nfields} field{nfields === 1 ? '' : 's'}</span>
                </div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{f.title}</div>
                {f.description && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{f.description}</div>}
                <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  {c.total} submission{c.total === 1 ? '' : 's'}{c.pending ? ` · ${c.pending} awaiting review` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href={`/staff/forms/${f.id}/submissions`} className="btn btn-ghost btn-sm">
                  <i className="fa-solid fa-inbox" /> Submissions{c.pending ? ` (${c.pending})` : ''}
                </Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(f)}>
                  <i className="fa-solid fa-pen" /> Edit
                </button>
                <form action={setFormStatus}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="status" value={f.status === 'active' ? 'archived' : 'active'} />
                  <button type="submit" className="btn btn-ghost btn-sm">
                    {f.status === 'active' ? (<><i className="fa-solid fa-eye-slash" /> Unpublish</>) : (<><i className="fa-solid fa-eye" /> Publish</>)}
                  </button>
                </form>
                <form action={deleteForm}>
                  <input type="hidden" name="id" value={f.id} />
                  <ConfirmSubmit
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#ef5a5a' }}
                    ariaLabel="Delete form"
                    title="Delete this form?"
                    body="This permanently removes the form and every member submission to it. This can’t be undone."
                    confirmLabel="Delete form"
                  >
                    <i className="fa-solid fa-trash" />
                  </ConfirmSubmit>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
