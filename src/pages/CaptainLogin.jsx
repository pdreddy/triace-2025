import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTournament, useMyTeams } from '../hooks/useTournament';
import { Field, Message } from '../components/UI';
import { Icon } from '../components/Icons';

// Captains sign in with the username and password shown when their team registered.
export default function CaptainLogin() {
  const { service, user } = useTournament(), navigate = useNavigate(), teams = useMyTeams();
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await service.captainLogin(username.trim(), password.trim()); navigate('/league'); }
    catch (e) { setError(e.message); setBusy(false); }
  }
  if (user?.captain) {
    const [teamId] = Object.keys(teams);
    return (
      <section className="page login-screen">
        <p className="eyebrow">Captain</p>
        <h1>You’re <em>signed in.</em></h1>
        <p>Submit scores from the League page{teamId ? ' or edit your team from its page' : ''}.</p>
        <div className="success-actions">
          <Link className="button" to="/league">Open the League <Icon name="arrow" size={18} /></Link>
          {teamId && <Link className="secondary" to={`/team/${teamId}`}>My team</Link>}
          <button type="button" className="secondary" onClick={() => service.logout()}>Sign out</button>
        </div>
      </section>
    );
  }
  if (user?.admin) return <Navigate to="/admin" replace />;
  return (
    <section className="page login-screen">
      <p className="eyebrow">Captains</p>
      <h1>Team <em>sign in.</em></h1>
      <p>Use the username and password you saved when your team registered. They let you submit scores and manage your team from any phone or computer.</p>
      <form className="card login-form" onSubmit={submit} aria-label="Captain sign in">
        <Field id="captain-username" label="Username" placeholder="e.g. arjun-k7q2" autoComplete="username" autoCapitalize="none" spellCheck="false" value={username} onChange={e => setUsername(e.target.value)} required />
        <Field id="captain-password" label="Password" type="password" placeholder="e.g. maple-tiger-orbit-482" autoComplete="current-password" autoCapitalize="none" spellCheck="false" value={password} onChange={e => setPassword(e.target.value)} required />
        <button className="button" disabled={busy || !username.trim() || !password.trim()}>{busy ? 'Signing in…' : 'Sign in'} <Icon name="arrow" size={18} /></button>
        <Message error>{error}</Message>
        <p className="small">Lost your login? Ask the tournament admin to reset it. Not a captain? <Link to="/admin/login">Admin sign in</Link></p>
      </form>
    </section>
  );
}
