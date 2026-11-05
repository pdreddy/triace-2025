import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { Field, Message } from '../components/UI';

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
    <section className="page login-screen">
      <div className="login-card">
        <div className="login-art"><img src="/traice-tennis.webp" alt="Traice Tennis, powered by Prosper Open" /></div>
        <div className="login-form">
          <p className="eyebrow">Admin access</p>
          <h1>Welcome <em>back.</em></h1>
          <p>Sign in to manage registrations and tournament tiers.</p>
          <form onSubmit={submit}>
            <Field id="username" label="Username or email" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required />
            <Field id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
            <Message error>{error}</Message>
            <button className="button block" disabled={busy || service.loading || !!service.setupError}>{busy ? 'Signing in…' : 'Sign in ↗'}</button>
          </form>
          {user && !user.anonymous && !user.admin && (
            <>
              <Message error>This account has no administrator role. The project owner must grant the admin custom claim.</Message>
              <button className="secondary" onClick={() => service.logout().catch(e => setError(e.message))}>Sign out of this account</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
