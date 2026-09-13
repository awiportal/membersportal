'use client';

import { useState } from 'react';
import SignaturePad from '@/components/SignaturePad';
import { approveMember } from '../../actions';

// Approve & activate a pending member. Approval doubles as the Admin/Chairlady
// COUNTERSIGNATURE on the agreements the member signed during onboarding: the
// server action always records the approver's name + time, and an optional drawn
// signature captured here is stored alongside it.
export default function ApproveCountersign({ memberId }: { memberId: string }) {
  const [show, setShow] = useState(false);
  const [hasSig, setHasSig] = useState(false);

  return (
    <form action={approveMember} style={{ display: 'grid', gap: 10, maxWidth: 380 }}>
      <input type="hidden" name="id" value={memberId} />
      <input type="hidden" name="countersign_signature_kind" value="draw" />

      {show ? (
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>
            Your signature (countersignature)
          </label>
          <SignaturePad name="countersign_signature_image" onCapture={setHasSig} />
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShow(true)}
          style={{ justifySelf: 'start' }}
        >
          <i className="fa-solid fa-signature" /> Add my signature (optional)
        </button>
      )}

      <button className="btn btn-lime" type="submit" style={{ justifySelf: 'start' }}>
        <i className="fa-solid fa-check" /> Approve &amp; activate{show && hasSig ? ' with signature' : ''}
      </button>

      <div className="muted" style={{ fontSize: 11.5 }}>
        Approving records your name and the time as the countersignature on the agreements this member signed during
        onboarding.
      </div>
    </form>
  );
}
