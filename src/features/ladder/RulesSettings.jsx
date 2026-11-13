// Organizer-only: edit the season's rules. The form, its limits and its help text are generated from the shared
// definition; validation here is the same function the server runs, and the server runs it again before saving.
import { useEffect, useMemo, useState } from 'react';
import { Message } from '../../components/UI';
import { RULE_GROUPS, validateRules, diffRules, describeRules, completeRules } from '../../../functions/lib/singlesLadder/config.js';
import { useLadder, useAction } from './LadderContext';

export default function RulesSettings() {
  const { season, act, meta } = useLadder(), { busy, error, run } = useAction();
  const version = season.rules.version, saved = useMemo(() => completeRules(season.rules.values), [season.rules.values]);
  const [draft, setDraft] = useState(() => structuredClone(saved)), [base, setBase] = useState(version), [reason, setReason] = useState(''), [note, setNote] = useState('');
  // Someone else saved a newer version while this form was open: start again from it rather than overwrite it.
  useEffect(() => { if (version !== base) { setDraft(structuredClone(saved)); setBase(version); } }, [version]);   // eslint-disable-line react-hooks/exhaustive-deps
  const check = useMemo(() => validateRules(draft), [draft]), changes = useMemo(() => diffRules(saved, draft), [saved, draft]);
  const sentences = values => describeRules(values).flatMap(s => s.lines);
  const preview = useMemo(() => { if (!check.ok) return null; const before = new Set(sentences(saved)), after = sentences(draft); return { added: after.filter(line => !before.has(line)), removed: [...before].filter(line => !after.includes(line)) }; }, [check.ok, saved, draft]);
  const set = (group, key, value) => { setNote(''); setDraft(d => ({ ...d, [group]: { ...d[group], [key]: value } })); };
  const closed = meta.status === 'closed';
  return (
    <form className="rules-settings" aria-label="Rules settings" onSubmit={e => { e.preventDefault(); run(async () => { const result = await act({ action: 'saveRules', values: draft, baseVersion: base, reason }); setReason(''); setNote(`Saved as rules version ${result.version}. It applies to challenges sent from now on.`); }); }}>
      <p className="lmeta">Rules version {version}. Changes apply to new challenges only: challenges already sent, finished results, points and positions are never recalculated.</p>
      {RULE_GROUPS.map(group => (
        <fieldset className="lcard" key={group.id} disabled={closed}>
          <legend>{group.title}</legend>
          {Object.entries(group.fields).map(([key, field]) => {
            const id = `rule-${group.id}-${key}`, value = draft[group.id][key], problem = check.errors[`${group.id}.${key}`];
            return (
              <div className={`rule-field${problem ? ' invalid' : ''}`} key={key}>
                {field.type === 'bool'
                  ? <label className="rule-toggle" htmlFor={id}><input id={id} type="checkbox" checked={value} onChange={e => set(group.id, key, e.target.checked)} /><span>{field.label}</span></label>
                  : <label htmlFor={id}><span>{field.label}</span>
                    {field.type === 'int' && <input id={id} type="number" inputMode="numeric" min={field.min} max={field.max} step="1" value={Number.isFinite(value) ? value : ''} onChange={e => set(group.id, key, e.target.value === '' ? null : Number(e.target.value))} />}
                    {field.type === 'enum' && <select id={id} value={String(value)} onChange={e => set(group.id, key, typeof field.default === 'number' ? Number(e.target.value) : e.target.value)}>{Object.entries(field.options).map(([option, label]) => <option key={option} value={option}>{label}</option>)}</select>}
                    {field.type === 'time' && <input id={id} type="time" value={value} onChange={e => set(group.id, key, e.target.value)} />}
                    {field.type === 'timezone' && <input id={id} type="text" autoCapitalize="none" spellCheck="false" value={value} onChange={e => set(group.id, key, e.target.value.trim())} />}
                  </label>}
                <small>{field.help}{field.type === 'int' ? ` (${field.min}–${field.max})` : ''}</small>
                {problem && <small className="rule-error" role="alert">{problem}</small>}
              </div>
            );
          })}
        </fieldset>
      ))}
      <div className="lcard rules-preview" aria-live="polite">
        <h3>Preview of changes</h3>
        {!changes.length ? <p className="lmeta">Nothing changed yet.</p> : <>
          <table><thead><tr><th>Rule</th><th>Now</th><th>After saving</th></tr></thead><tbody>{changes.map(c => <tr key={c.key}><td>{c.group}: {c.label}</td><td>{c.beforeText}</td><td><b>{c.afterText}</b></td></tr>)}</tbody></table>
          {!check.ok ? <p className="rule-error" role="alert">Fix the highlighted settings before saving: {Object.values(check.errors)[0]}</p> : <>
            {preview.removed.length > 0 && <><h4>Players will no longer read</h4><ul className="removed">{preview.removed.map(line => <li key={line}>{line}</li>)}</ul></>}
            {preview.added.length > 0 && <><h4>Players will read instead</h4><ul className="added">{preview.added.map(line => <li key={line}>{line}</li>)}</ul></>}
          </>}
        </>}
        <label className="lfield" htmlFor="rules-reason"><span>Reason for the change (kept in the audit log)</span><input id="rules-reason" required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <div className="lactions"><button className="button small" disabled={busy || closed || !check.ok || !changes.length || reason.trim().length < 3}>Save rules</button><button type="button" className="secondary small" disabled={busy || !changes.length} onClick={() => setDraft(structuredClone(saved))}>Discard changes</button></div>
        <Message error>{error}</Message><Message>{note}</Message>
      </div>
    </form>
  );
}
