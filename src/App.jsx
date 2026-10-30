import { BrowserRouter, NavLink, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { TournamentProvider, useTournament } from './hooks/useTournament';
import { RulesAccessProvider, useRulesAccess } from './hooks/useRulesAccess';
import { usePwa } from './hooks/usePwa';
import { Message } from './components/UI';
import { Icon } from './components/Icons';
const Rules = lazy(() => import('./pages/Rules'));
const Register = lazy(() => import('./pages/Register'));
const Tiers = lazy(() => import('./pages/Tiers'));
const Login = lazy(() => import('./pages/Login'));
const Admin = lazy(() => import('./pages/Admin'));
const FRIENDLY_ERROR = 'We can’t reach the tournament right now. Please check your connection and try again shortly.';
function StatusPill({ service, connected, online }) {
  const state = !online ? 'offline' : connected ? 'live' : 'connecting';
  const label = !online ? 'Offline' : connected ? (service.mode === 'Local demo' ? 'Demo · Live' : 'Live') : 'Connecting';
  return <span className={`status-pill ${state}`} title={service.mode}><i aria-hidden="true" />{label}</span>;
}
function NotFound() { return <section className="page not-found"><Icon name="ball" size={56} /><h1>Out of <em>bounds.</em></h1><p>That page isn’t on the court. Head back to the rules to get started.</p><Link className="button" to="/">Back to rules <Icon name="arrow" size={18} /></Link></section>; }
function Layout() {
  const { service, connected, error, user } = useTournament();
  const { accepted } = useRulesAccess(), { canInstall, install, online, updated } = usePwa();
  const path = useLocation().pathname, screen = path === '/' ? 'rules' : path === '/register' ? 'register' : path.startsWith('/admin/login') ? 'login' : path.startsWith('/admin') ? 'admin' : path === '/tiers' ? 'tiers' : 'other';
  const [logoutError, setLogoutError] = useState(''), [loggingOut, setLoggingOut] = useState(false);
  async function logout() { setLoggingOut(true); setLogoutError(''); try { await service.logout(); } catch (e) { setLogoutError(e.message); } finally { setLoggingOut(false); } }
  const shownError = import.meta.env.DEV || !error ? error || logoutError : logoutError || FRIENDLY_ERROR;
  return <div className={`app screen-${screen}`}>
    <header className="topbar"><div className="topbar-inner">
      <Link to="/" className="brand" aria-label="Traice 2.0 home"><img src="/traice-tennis.webp" alt="" /><span>traice</span><b>2.0</b></Link>
      <nav aria-label="Main navigation" className="tabs">
        <NavLink to="/" end><Icon name="rules" /><span>Rules</span></NavLink>
        {accepted ? <NavLink to="/register"><Icon name="register" /><span>Register</span></NavLink> : <span className="nav-locked" aria-disabled="true" title="Read and agree to all rules first"><Icon name="lock" /><span>Register</span></span>}
        <NavLink to="/tiers"><Icon name="trophy" /><span>Tier list</span></NavLink>
        <NavLink to={user?.admin ? '/admin' : '/admin/login'}><Icon name="shield" /><span>Admin</span></NavLink>
      </nav>
      <div className="topbar-actions">
        <StatusPill service={service} connected={connected} online={online} />
        {canInstall && <button type="button" className="chip-button" onClick={install}><Icon name="download" size={16} /><span>Install app</span></button>}
        {user?.admin && <button type="button" className="chip-button" disabled={loggingOut} onClick={logout}><Icon name="logout" size={16} /><span>{loggingOut ? 'Signing out…' : 'Sign out'}</span></button>}
      </div>
    </div></header>
    <main>
      {!online && <p className="banner offline" role="status"><Icon name="wifiOff" size={16} /> You’re offline. Saved pages still work; reconnect before registering.</p>}
      {updated && <p className="banner update" role="status"><Icon name="refresh" size={16} /> A new version is ready. <button type="button" onClick={() => location.reload()}>Reload</button></p>}
      <Message error>{shownError}</Message>
      <Suspense fallback={<div className="page-loading" aria-busy="true"><span className="spinner" /> Loading…</div>}>
        <Routes>
          <Route path="/" element={<Rules />} />
          <Route path="/register" element={accepted ? <Register /> : <Navigate to="/" replace />} />
          <Route path="/tiers" element={<Tiers />} />
          <Route path="/admin/login" element={<Login />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </main>
  </div>;
}
export default function App() { return <BrowserRouter><TournamentProvider><RulesAccessProvider><Layout /></RulesAccessProvider></TournamentProvider></BrowserRouter>; }
