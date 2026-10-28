import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { TournamentProvider, useTournament } from './hooks/useTournament';
import { RulesAccessProvider, useRulesAccess } from './hooks/useRulesAccess';
import { Message } from './components/UI';

const Rules = lazy(() => import('./pages/Rules'));
const Register = lazy(() => import('./pages/Register'));
const Tiers = lazy(() => import('./pages/Tiers'));
const Login = lazy(() => import('./pages/Login'));
const Admin = lazy(() => import('./pages/Admin'));

function Icon({ name }) {
  const paths = {
    rules: <><path d="M4 4.5h7.5a3 3 0 0 1 3 3V20H7a3 3 0 0 0-3 3V4.5Z" /><path d="M20 4.5h-5.5a3 3 0 0 0-3 3V20H17a3 3 0 0 1 3 3V4.5Z" /></>,
    register: <><circle cx="12" cy="7" r="3" /><path d="M5 20v-1a7 7 0 0 1 14 0v1H5Z" /><path d="M19 7v6m-3-3h6" /></>,
    teams: <><circle cx="8" cy="8" r="2.5" /><circle cx="17" cy="8" r="2.5" /><path d="M2.5 19v-1a5.5 5.5 0 0 1 11 0v1h-11Zm11 0v-1a5.5 5.5 0 0 1 8-4.9V19h-8Z" /></>,
    admin: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>
  };
  return <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Layout() {
  const { service, connected, error, user } = useTournament();
  const { accepted } = useRulesAccess();
  const pathname = useLocation().pathname;
  const onRules = pathname === '/';
  const mainRef = useRef(null);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const adminPath = user?.admin ? '/admin' : '/admin/login';
  async function logout() {
    setLoggingOut(true); setLogoutError('');
    try { await service.logout(); } catch (failure) { setLogoutError(failure.message); }
    finally { setLoggingOut(false); }
  }
  return <div className={`app ${onRules ? 'app-rules' : ''}`}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="app-header wrap">
      <Link to="/" className="brand" aria-label="Triace home"><img src="/traice-tennis.webp" alt="" /><span>TRIACE</span><b>2.0</b></Link>
      <nav className="app-nav" aria-label="Main navigation">
        <NavLink to="/" end><Icon name="rules" /><span>Rules</span></NavLink>
        {accepted ? <NavLink to="/register"><Icon name="register" /><span>Register</span></NavLink> : <span className="nav-locked" aria-disabled="true" title="Read and agree to all rules first"><Icon name="lock" /><span>Register</span></span>}
        <NavLink to="/tiers"><Icon name="teams" /><span>Teams</span></NavLink>
        <NavLink to={adminPath}><Icon name="admin" /><span>Admin</span></NavLink>
        {user?.admin && <button className="text-button" disabled={loggingOut} onClick={logout}>{loggingOut ? 'Signing out…' : 'Sign out'}</button>}
      </nav>
    </header>
    <main className="wrap" id="main-content" ref={mainRef} tabIndex={-1}>
      {(service.mode === 'Local demo' || !connected || import.meta.env.DEV) && <div className="environment"><span className={`dot ${connected ? 'online' : ''}`} />{service.mode === 'Local demo' ? 'Local demo · Test data only' : connected ? `${service.mode} · Connected` : 'Connecting…'}</div>}
      <Message error>{error || logoutError}</Message>
      <Suspense fallback={<Message>Loading page…</Message>}>
        <Routes>
          <Route path="/" element={<Rules />} />
          <Route path="/register" element={accepted ? <Register /> : <Navigate to="/" replace />} />
          <Route path="/tiers" element={<Tiers />} />
          <Route path="/admin/login" element={<Login />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<section className="page"><h1>Page not found.</h1><Link to="/">Return to rules →</Link></section>} />
        </Routes>
      </Suspense>
    </main>
    <footer className="wrap"><Link to="/" className="brand"><img src="/traice-tennis.webp" alt="" />TRIACE <b>2.0</b></Link><span>Three players. Shared ambition.</span></footer>
  </div>;
}
export default function App() { return <BrowserRouter><TournamentProvider><RulesAccessProvider><Layout /></RulesAccessProvider></TournamentProvider></BrowserRouter>; }
