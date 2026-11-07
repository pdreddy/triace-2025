import { useEffect, useState } from 'react';

// A form draft for a saved record that carries a `revision` (calendar, early bird, league rules).
//  - The draft is filled from the saved record until the person edits it.
//  - A save names the revision the draft was based on (`expectedRevision`); the server refuses it if someone else saved first.
//  - After a save the acknowledged revision is remembered, so a late snapshot of the *older* record cannot replace what was just saved.
//  - If another session saves while this one has unsaved edits, `conflict` is true: reload (discard the edits) before saving again.
export function useRevisionedDraft(saved, toDraft) {
  const revision = saved?.revision || 0;
  const [draft, setDraft] = useState(() => toDraft(saved)), [dirty, setDirty] = useState(false);
  const [base, setBase] = useState(revision), [acked, setAcked] = useState(null);
  useEffect(() => {
    if (dirty) return;
    if (acked !== null && revision < acked) return;   // a snapshot from before our own save: keep showing what was saved
    setDraft(toDraft(saved)); setBase(revision); setAcked(null);
  }, [saved, dirty]);   // eslint-disable-line react-hooks/exhaustive-deps
  return {
    draft, dirty, expectedRevision: base, conflict: dirty && revision !== base,
    edit: (key, value) => { setDraft(old => ({ ...old, [key]: value })); setDirty(true); },
    markSaved: newRevision => { setDirty(false); if (Number.isInteger(newRevision)) { setBase(newRevision); setAcked(newRevision); } },
    reload: () => { setDraft(toDraft(saved)); setBase(revision); setAcked(null); setDirty(false); }
  };
}
