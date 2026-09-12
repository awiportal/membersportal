import { saveRelation, clearRelation } from './relations-actions';

const KINDS: { key: 'next_of_kin' | 'beneficiary' | 'nominee'; label: string; hint: string }[] = [
  { key: 'next_of_kin', label: 'Next of kin', hint: "Emergency contact for the member." },
  { key: 'beneficiary', label: 'Beneficiary', hint: "Receives benefits on the member's behalf." },
  { key: 'nominee', label: 'Nominee', hint: "Nominated recipient of the member's holdings." },
];

// Admin CRUD for the three designated people held in member_relations. One entry
// of each kind (unique per member); Save upserts, Clear removes. Rendered on the
// staff member-detail page. The read/write is gated by the staff layout + RLS.
export default function RelationsEditor({ memberId, relations }: { memberId: string; relations: any[] }) {
  const byKind: Record<string, any> = {};
  (relations || []).forEach((r) => (byKind[r.relation_kind] = r));

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Next of kin, beneficiary &amp; nominee</div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
        Record or update the designated people for this member. One entry of each kind is kept. Leave every field blank and Save to clear an entry.
      </div>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        {KINDS.map(({ key, label, hint }) => {
          const r = byKind[key] || {};
          const hasEntry = !!(r.name || r.relationship || r.phone || r.id_number);
          return (
            <div
              key={key}
              style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface2)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</div>
                {hasEntry ? (
                  <span className="badge badge-good" style={{ fontSize: 10.5 }}>On file</span>
                ) : (
                  <span className="badge badge-warn" style={{ fontSize: 10.5 }}>Not set</span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>{hint}</div>
              <form action={saveRelation} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input type="hidden" name="member_id" value={memberId} />
                <input type="hidden" name="relation_kind" value={key} />
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Full name</label>
                  <input className="input" name="name" defaultValue={r.name || ''} placeholder="Full name" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Relationship</label>
                  <input className="input" name="relationship" defaultValue={r.relationship || ''} placeholder="e.g. Spouse, Daughter" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Phone</label>
                  <input className="input" name="phone" defaultValue={r.phone || ''} placeholder="+254 7xx xxx xxx" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>ID / Passport no.</label>
                  <input className="input" name="id_number" defaultValue={r.id_number || ''} placeholder="ID / Passport" />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className="btn btn-primary btn-sm" type="submit">
                    <i className="fa-solid fa-floppy-disk" /> Save
                  </button>
                </div>
              </form>
              {hasEntry ? (
                <form action={clearRelation} style={{ marginTop: 8 }}>
                  <input type="hidden" name="member_id" value={memberId} />
                  <input type="hidden" name="relation_kind" value={key} />
                  <button className="btn btn-ghost btn-sm" type="submit">
                    <i className="fa-solid fa-trash-can" /> Clear
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
