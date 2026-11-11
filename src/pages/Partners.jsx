import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { EmptyState, Field, Message } from '../components/UI';
import { Icon } from '../components/Icons';
import { formatUtr, parseUtr } from '../../functions/lib/tournament.js';
import { LIMITS } from '../../functions/lib/partners.js';

const DAY = 86400000;
const waLink = (phone, text) => `https://wa.me/${String(phone).replace(/^\+/, '')}?text=${encodeURIComponent(text)}`;
const ago = ms => { const days = Math.floor((Date.now() - ms) / DAY); return days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`; };
const toUtr = text => (String(text).trim() ? parseUtr(text) : null);
const CONTACTS_KEY = 'traice.partnerContacts';
const loadContacts = () => { try { return JSON.parse(localStorage.getItem(CONTACTS_KEY)) || {}; } catch { return {}; } };
const saveContact = (postId, value) => { try { localStorage.setItem(CONTACTS_KEY, JSON.stringify({ ...loadContacts(), [postId]: value })); } catch { /* storage blocked */ } };

function useMyPosts(service, uid) {
  const [posts, setPosts] = useState({});
  useEffect(() => {
    setPosts({});
    if (!uid || !service.subscribeMyPartnerPosts) return;
    return service.subscribeMyPartnerPosts(uid, setPosts);
  }, [service, uid]);
  return posts;
}

function Replies({ secret, post }) {
  const replies = Object.values(secret?.interests || {}).sort((a, b) => b.at - a.at);
  if (!replies.length) return <p className="small muted">No replies yet. When someone is interested you will see their name and WhatsApp number here.</p>;
  return (
    <ul className="replies">
      {replies.map(r => (
        <li key={r.id}>
          <div><b>{r.name}</b><small>{ago(r.at)}</small>{r.message && <p>“{r.message}”</p>}</div>
          <a className="button small" href={waLink(r.whatsapp, `Hi ${r.name}, thanks for your interest in my Triace post (${post.kind === 'team' ? 'team needs a player' : 'looking for a team'}).`)} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={16} /> WhatsApp</a>
        </li>
      ))}
    </ul>
  );
}

function InterestForm({ post, service, onDone }) {
  const [form, setForm] = useState({ name: '', whatsapp: '', message: '' }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = key => e => setForm(old => ({ ...old, [key]: e.target.value }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { const r = await service.expressInterest({ postId: post.id, ...form }); saveContact(post.id, { firstName: r.firstName, contact: r.contact }); onDone(r); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <form className="interest-form" onSubmit={submit} aria-label={`Show interest in ${post.firstName}`}>
      <Field id={`i-name-${post.id}`} label="Your first name" autoComplete="given-name" maxLength={LIMITS.name} value={form.name} onChange={set('name')} required />
      <Field id={`i-wa-${post.id}`} label="Your WhatsApp number" type="tel" inputMode="tel" autoComplete="tel" placeholder="+15551234567" value={form.whatsapp} onChange={set('whatsapp')} required hint="Only the person who posted sees this." />
      <Field id={`i-msg-${post.id}`} label="Message (optional)" maxLength={LIMITS.message} value={form.message} onChange={set('message')} placeholder="e.g. I play evenings and weekends" />
      <Message error>{error}</Message>
      <button className="button small" disabled={busy}>{busy ? 'Sending…' : 'Send my details'}</button>
    </form>
  );
}

function PostCard({ post, secret, mine, admin, service, onMessage }) {
  const [open, setOpen] = useState(false), [contact, setContact] = useState(() => loadContacts()[post.id] || null), [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false), [pickedBy, setPickedBy] = useState('');
  const team = post.kind === 'team', picked = post.status === 'picked', canManage = mine || admin;
  async function remove() {
    if (!window.confirm('Remove this post?')) return;
    setBusy(true);
    try { await service.closePartnerPost({ postId: post.id }); onMessage('Post removed.'); } catch (e) { onMessage(e.message); setBusy(false); }
  }
  async function act(fn, done) {
    setBusy(true);
    try { await fn(); onMessage(done); setPicking(false); setPickedBy(''); } catch (e) { onMessage(e.message); } finally { setBusy(false); }
  }
  const markPicked = () => act(() => service.markPartnerPicked({ postId: post.id, pickedBy }), pickedBy.trim() ? `Marked as picked by ${pickedBy.trim()}.` : 'Marked as picked.');
  const reopen = () => act(() => service.reopenPartnerPost({ postId: post.id }), 'Reopened. It is back on the board.');
  return (
    <article className={`partner-card ${team ? 'team' : 'player'}${mine ? ' mine' : ''}${picked ? ' picked' : ''}`} aria-label={`${post.firstName}: ${team ? 'team needs a player' : 'available to join a team'}`}>
      <header>
        {picked ? <span className="pill picked-pill"><Icon name="check" size={14} /> Picked</span> : <span className="pill">{team ? `Team needs ${post.needs} more` : 'Available to join a team'}</span>}
        {mine && <span className="pill mine-pill">Your post</span>}
        <small>{picked ? `picked ${ago(post.pickedAt)}` : ago(post.createdAt)}</small>
      </header>
      <div className="partner-main">
        <div>
          <h3>{post.firstName}</h3>
          <p className="partner-detail">Singles {formatUtr(post.singlesUtr)}{post.doublesUtr != null ? ` · Doubles ${formatUtr(post.doublesUtr)}` : ''}</p>
        </div>
        <div className="partner-utr" aria-label={`Counted UTR ${formatUtr(post.utr)}`}><b>{formatUtr(post.utr)}</b><small>UTR</small></div>
      </div>
      {team && (post.wantMin != null || post.wantMax != null) && <p className="partner-want">Looking for UTR {post.wantMin != null ? formatUtr(post.wantMin) : 'any'} – {post.wantMax != null ? formatUtr(post.wantMax) : 'any'}</p>}
      {post.note && <p className="partner-note">{post.note}</p>}
      {picked && <p className="partner-picked">{team ? 'Spot filled' : 'Joined a team'}{post.pickedBy ? <>: <b>{post.pickedBy}</b></> : ''}</p>}
      {picking && (
        <div className="pick-form">
          <Field id={`pick-${post.id}`} label={team ? 'Who was picked? (optional)' : 'Picked by which team? (optional)'} maxLength={LIMITS.name} value={pickedBy} onChange={e => setPickedBy(e.target.value)} placeholder={team ? 'e.g. Sam' : 'e.g. Ravi’s team'} hint="Shown to everyone on the board." />
          <div className="card-actions"><button type="button" className="button small" disabled={busy} onClick={markPicked}>Show as picked</button><button type="button" className="secondary small" onClick={() => setPicking(false)}>Cancel</button></div>
        </div>
      )}
      {mine ? <Replies secret={secret} post={post} /> : picked ? null : contact ? (
        <p className="partner-contact"><Icon name="check" size={16} /> Details sent. <a href={waLink(contact.contact, `Hi ${contact.firstName}, I saw your Triace post and I'm interested.`)} target="_blank" rel="noopener noreferrer">Message {contact.firstName} on WhatsApp</a></p>
      ) : open ? (
        <InterestForm post={post} service={service} onDone={r => { setContact({ firstName: r.firstName, contact: r.contact }); setOpen(false); onMessage(`Sent. ${r.firstName} will see your name and number; you can message them on WhatsApp now.`); }} />
      ) : null}
      <footer>
        {!picked && canManage && !picking && <button type="button" className="secondary small" disabled={busy} onClick={() => setPicking(true)}>Mark as picked</button>}
        {picked && canManage && <button type="button" className="secondary small" disabled={busy} onClick={reopen}>Reopen</button>}
        {!picked && !mine && !contact && !open && <button type="button" className="button small" onClick={() => setOpen(true)}>I’m interested</button>}
        {open && <button type="button" className="secondary small" onClick={() => setOpen(false)}>Cancel</button>}
        {admin && <button type="button" className="danger small" disabled={busy} onClick={remove}>Remove</button>}
        {mine && !admin && <small className="partner-hint">Only the admin can remove posts. It also disappears by itself after {LIMITS.expireDays} days.</small>}
        {post.interested > 0 && <small>{post.interested} interested</small>}
      </footer>
    </article>
  );
}

function PostForm({ service, settings, onPosted }) {
  const empty = { kind: 'player', firstName: '', singles: '', doubles: '', note: '', whatsapp: '', needs: '1', wantMin: '', wantMax: '', consent: false };
  const [form, setForm] = useState(empty), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = key => e => setForm(old => ({ ...old, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const team = form.kind === 'team';
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const payload = { kind: form.kind, firstName: form.firstName.trim(), singlesUtr: parseUtr(form.singles), doublesUtr: toUtr(form.doubles), note: form.note, whatsapp: form.whatsapp.trim() };
      if (team) Object.assign(payload, { needs: Number(form.needs), wantMin: toUtr(form.wantMin), wantMax: toUtr(form.wantMax) });
      await service.createPartnerPost(payload);
      setForm(empty); onPosted();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <form className="card partner-form" onSubmit={submit} aria-label="Post to the partner board">
      <fieldset className="kind-choice">
        <legend>I want to…</legend>
        <label className={!team ? 'on' : ''}><input type="radio" name="kind" value="player" checked={!team} onChange={set('kind')} /> <span><b>Join a team</b><small>I’m available and need a team</small></span></label>
        <label className={team ? 'on' : ''}><input type="radio" name="kind" value="team" checked={team} onChange={set('kind')} /> <span><b>Find players</b><small>My team needs a player</small></span></label>
      </fieldset>
      <div className="form-grid">
        <Field id="p-name" label="Your first name" autoComplete="given-name" maxLength={LIMITS.name} value={form.firstName} onChange={set('firstName')} required />
        <Field id="p-wa" label="Your WhatsApp number" type="tel" inputMode="tel" autoComplete="tel" placeholder="+15551234567" value={form.whatsapp} onChange={set('whatsapp')} required hint="Never shown on the board." />
        <Field id="p-singles" label={team ? 'Your singles UTR' : 'Singles UTR'} inputMode="decimal" placeholder="e.g. 6.25" value={form.singles} onChange={set('singles')} required hint={`${formatUtr(settings.minPlayerUtr)}–${formatUtr(settings.maxPlayerUtr)}`} />
        <Field id="p-doubles" label="Doubles UTR (optional)" inputMode="decimal" placeholder="e.g. 6.80" value={form.doubles} onChange={set('doubles')} />
      </div>
      {team && (
        <div className="form-grid">
          <div className="field"><label htmlFor="p-needs">Players you still need</label><select id="p-needs" value={form.needs} onChange={set('needs')}><option value="1">1 (we have 2)</option><option value="2">2 (we have 1)</option></select></div>
          <Field id="p-min" label="Lowest UTR you want" inputMode="decimal" placeholder="optional" value={form.wantMin} onChange={set('wantMin')} />
          <Field id="p-max" label="Highest UTR you want" inputMode="decimal" placeholder="optional" value={form.wantMax} onChange={set('wantMax')} />
        </div>
      )}
      <Field id="p-note" label="Note (optional)" maxLength={LIMITS.note} placeholder={team ? 'e.g. We play Saturday mornings' : 'e.g. Free weekday evenings, happy to play doubles'} value={form.note} onChange={set('note')} hint={`${form.note.length}/${LIMITS.note} · no links`} />
      <label className="checkbox"><input type="checkbox" checked={form.consent} onChange={set('consent')} /><span>I agree to show my name and UTR on this page. My WhatsApp number is shared only with people who reply.</span></label>
      <Message error>{error}</Message>
      <button className="button" disabled={busy || !form.consent}>{busy ? 'Posting…' : 'Post to the board'}</button>
    </form>
  );
}

export default function Partners() {
  const { data, service, user } = useTournament();
  const mine = useMyPosts(service, user?.uid);
  const [tab, setTab] = useState('players'), [posting, setPosting] = useState(false), [message, setMessage] = useState('');
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [sort, setSort] = useState('new');
  const admin = !!user?.admin, settings = data?.settings;

  const posts = useMemo(() => Object.values(data?.partnerPosts || {}).filter(p => Date.now() - p.createdAt < LIMITS.expireDays * DAY), [data?.partnerPosts]);
  const range = useMemo(() => { try { return [toUtr(from), toUtr(to)]; } catch { return [null, null]; } }, [from, to]);
  const isPicked = p => p.status === 'picked';
  const open = posts.filter(p => !isPicked(p)), pickedPosts = posts.filter(p => isPicked(p) && Date.now() - (p.pickedAt || p.createdAt) < LIMITS.pickedDays * DAY).sort((a, b) => (b.pickedAt || 0) - (a.pickedAt || 0));
  const inRange = p => (range[0] == null || p.utr >= range[0]) && (range[1] == null || p.utr <= range[1]);
  const shown = open
    .filter(p => p.kind === (tab === 'teams' ? 'team' : 'player'))
    .filter(inRange)
    .sort((a, b) => (sort === 'utr' ? b.utr - a.utr : b.createdAt - a.createdAt));
  const myIds = new Set(Object.keys(mine)), myPosts = posts.filter(p => myIds.has(p.id)).sort((a, b) => b.createdAt - a.createdAt);
  const count = kind => open.filter(p => p.kind === kind).length;

  return (
    <section className="page partners-screen">
      <header className="page-head with-actions">
        <div>
          <p className="eyebrow">Teams of three</p>
          <h1>Find a <em>partner.</em></h1>
          <p>Need a team, or a third player? Post your UTR here. People who reply get your WhatsApp link; your number is never shown on the board.</p>
        </div>
        <button type="button" className="button" aria-expanded={posting} onClick={() => setPosting(open => !open)}>{posting ? 'Close' : 'Post to the board'} <Icon name={posting ? 'close' : 'register'} size={18} /></button>
      </header>

      {posting && settings && <PostForm service={service} settings={settings} onPosted={() => { setPosting(false); setTab('mine'); setMessage('Posted. Replies will show up under My posts.'); }} />}
      <Message>{message}</Message>

      <div className="toolbar">
        <div className="segmented labelled" role="tablist" aria-label="Partner board">
          <button type="button" role="tab" aria-selected={tab === 'players'} onClick={() => setTab('players')}>Players ({count('player')})</button>
          <button type="button" role="tab" aria-selected={tab === 'teams'} onClick={() => setTab('teams')}>Teams ({count('team')})</button>
          <button type="button" role="tab" aria-selected={tab === 'picked'} onClick={() => setTab('picked')}>Picked ({pickedPosts.length})</button>
          <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>My posts ({myPosts.length})</button>
        </div>
        {tab !== 'mine' && tab !== 'picked' && (
          <div className="toolbar-controls partner-filters">
            <Field id="f-from" label="UTR from" inputMode="decimal" placeholder="0.00" value={from} onChange={e => setFrom(e.target.value)} />
            <Field id="f-to" label="UTR to" inputMode="decimal" placeholder="16.50" value={to} onChange={e => setTo(e.target.value)} />
            <div className="field"><label htmlFor="f-sort">Sort</label><select id="f-sort" value={sort} onChange={e => setSort(e.target.value)}><option value="new">Newest</option><option value="utr">Highest UTR</option></select></div>
          </div>
        )}
      </div>

      {!data && <div className="skeleton-list" aria-busy="true">{[0, 1].map(i => <div key={i} className="skeleton-card" />)}</div>}
      {data && tab === 'picked' && (pickedPosts.length
        ? <div className="partner-list">{pickedPosts.map(p => <PostCard key={p.id} post={p} mine={myIds.has(p.id)} secret={mine[p.id]} admin={admin} service={service} onMessage={setMessage} />)}</div>
        : <EmptyState icon="users" title="Nobody has been picked yet.">When a player joins a team, or a team fills its spot, it shows here for {LIMITS.pickedDays} days.</EmptyState>)}
      {data && tab !== 'mine' && tab !== 'picked' && (shown.length
        ? <div className="partner-list">{shown.map(p => <PostCard key={p.id} post={p} mine={myIds.has(p.id)} secret={mine[p.id]} admin={admin} service={service} onMessage={setMessage} />)}</div>
        : <EmptyState icon="users" title={tab === 'teams' ? 'No team is looking for players yet.' : 'Nobody is available yet.'}>{open.length ? 'Nobody matches this UTR range.' : 'Be the first: post to the board and teams will find you.'}</EmptyState>)}
      {data && tab === 'mine' && (myPosts.length
        ? <div className="partner-list">{myPosts.map(p => <PostCard key={p.id} post={p} mine secret={mine[p.id]} admin={admin} service={service} onMessage={setMessage} />)}</div>
        : <EmptyState icon="users" title="You have no posts.">Post to the board and replies will appear here. Use the same phone or browser to see them.</EmptyState>)}

      <p className="small partner-foot">Already have three players? <Link to="/register">Register your team</Link>. Posts disappear after {LIMITS.expireDays} days.</p>
    </section>
  );
}
