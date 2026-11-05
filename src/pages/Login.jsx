import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { Field, Message } from '../components/UI';
import AuthCard from '../components/AuthCard';

export default function Login() {
  const { service, user } = useTournament(), navigate = useNavigate();
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');

  useEffect(() => { if (user?.admin) navigate('/admin', { replace: true }); }, [user?.admin, navigate]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await service.login(username, password); setPassword(''); }
    catch (e) { setError(`Sign-in failed. ${e.message || 'Check your username/email and password.'}`); }
    finally { setBusy(false); }
  }

  return (
    <AuthCard eyebrow="Admin" title="Sign in" intro="Manage registrations, tiers and the league." footer={<>Captain of a team? <Link to="/captain">Captain sign in</Link></>}>
      <form className="auth-form" onSubmit={submit} aria-label="Admin sign in">
        <Field id="username" name="username" label="Username or email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={username} onChange={e => setUsername(e.target.value)} required />
        <Field id="password" name="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        <Message error>{error}</Message>
        <button className="button block" disabled={busy || service.loading || !!service.setupError}>{busy ? 'Signing in…' : 'Sign in ↗'}</button>
      </form>
      {user && !user.anonymous && !user.admin && (
        <div className="auth-notice">
          <Message error>This account has no administrator role. The project owner must grant the admin custom claim.</Message>
          <button type="button" className="secondary" onClick={() => service.logout().catch(e => setError(e.message))}>Sign out of this account</button>
        </div>
      )}
    </AuthCard>
  );
}
