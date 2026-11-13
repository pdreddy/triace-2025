import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTournament, useMyTeams } from '../hooks/useTournament';
import { Field, Message } from '../components/UI';
import { Icon } from '../components/Icons';
import AuthCard from '../components/AuthCard';
import { usernameFrom } from '../../functions/lib/captainAccount.js';

// Captains and ladder players use separate account identifiers and sign-in modes.
export default function CaptainLogin({ playerMode = false }) {
  const { service, user } = useTournament(), navigate = useNavigate(), teams = useMyTeams();
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await (playerMode ? service.playerLogin : service.captainLogin)(username.trim(), password); navigate('/home'); }
    catch (e) { setError(e.message); setBusy(false); }
  }
  if (user?.player && !user.admin) return (
    <AuthCard eyebrow="Player" title="You’re signed in" intro={<>Signed in as <strong className="mono">{usernameFrom(user.email)}</strong>. Your ladder account is ready.</>}>
      <div className="auth-actions"><Link className="button" to="/ladder">Open the ladder <Icon name="arrow" size={18} /></Link><Link className="secondary" to="/ladder/matches">My matches</Link><button className="secondary" onClick={() => service.logout().catch(e => setError(e.message))}>Sign out</button></div><Message error>{error}</Message>
    </AuthCard>
  );
  if (user?.captain) {
    const [teamId] = Object.keys(teams);
    return (
      <AuthCard eyebrow="Captain" title="You’re signed in" intro={<>Signed in as <strong className="mono">{usernameFrom(user.email)}</strong>. Submit scores from the League page{teamId ? ' or edit your team from its page' : ''}.</>}>
        <div className="auth-actions">
          <Link className="button" to="/league">Open the League <Icon name="arrow" size={18} /></Link>
          {teamId && <Link className="secondary" to={`/team/${teamId}`}>My team</Link>}
          <button type="button" className="secondary" onClick={() => service.logout()}>Sign out</button>
        </div>
      </AuthCard>
    );
  }
  if (user?.admin) return <Navigate to="/admin" replace />;
  return (
    <AuthCard eyebrow={playerMode ? 'Players' : 'Captains'} title={playerMode ? 'Player sign in' : 'Team sign in'} intro={playerMode ? 'Use the player username and password provided by your organizer.' : 'Use the username and password you saved when your team registered.'} footer={<>Lost your login? Ask the tournament admin to reset it. {playerMode ? <Link to="/captain">Captain sign in</Link> : <Link to="/player-login">Ladder player sign in</Link>} · <Link to="/admin/login">Admin sign in</Link></>}>
      <form className="auth-form" onSubmit={submit} aria-label={playerMode ? 'Player sign in' : 'Captain sign in'}>
        <Field id="captain-username" name="username" label="Username" placeholder={playerMode ? 'Your player username' : 'e.g. arjuraj'} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={username} onChange={e => setUsername(e.target.value)} required />
        <Field id="captain-password" name="password" label="Password" type="password" placeholder={playerMode ? 'Your player password' : 'e.g. ranarj4172'} maxLength={playerMode ? 128 : 16} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={password} onChange={e => setPassword(e.target.value)} required />
        <Message error>{error}</Message>
        <button className="button block" disabled={busy || service.loading || !!service.setupError || !username.trim() || !password.trim()}>{busy ? 'Signing in…' : 'Sign in'} <Icon name="arrow" size={18} /></button>
      </form>
    </AuthCard>
  );
}
