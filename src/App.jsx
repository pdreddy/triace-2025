import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
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
const League = lazy(() => import('./pages/League'));
const Team = lazy(() => import('./pages/Team'));
const Players = lazy(() => import('./pages/Players'));
const Player = lazy(() => import('./pages/Player'));
const History = lazy(() => import('./pages/History'));
const Champions = lazy(() => import('./pages/Champions'));
const CaptainLogin = lazy(() => import('./pages/CaptainLogin'));

const FRIENDLY_ERROR = 'We can’t reach the tournament right now. Please check your connection and try again shortly.';
const SCREENS = { '/': 'rules', '/register': 'register', '/tiers': 'tiers', '/league': 'league', '/players': 'players', '/champions': 'champions', '/admin/login': 'login', '/captain': 'login', '/admin': 'admin' };

function StatusPill({ mode, connected, online }) {
  const state = !online ? 'offline' : connected ? 'live' : 'connecting';
  const label = !online ? 'Offline' : connected ? (mode === 'Local demo' ? 'Demo · Live' : 'Live') : 'Connecting';
  return <span className={`status-pill ${state}`} title={mode}><i aria-hidden="true" />{label}</span>;
}

function NotFound() {
  return (
    <section className="page not-found">
      <Icon name="ball" size={56} />
      <h1>Out of <em>bounds.</em></h1>
      <p>That page isn’t on the court. Head back to the rules to get started.</p>
      <Link className="button" to="/">Back to rules <Icon name="arrow" size={18} /></Link>
    </section>
  );
}

function Layout() {
  const { service, connected, error, user, savedAt } = useTournament();
  const { accepted } = useRulesAccess();
  const { canInstall, install, online, updated } = usePwa();
  const path = useLocation().pathname, screen = SCREENS[path] || (path.startsWith('/team/') ? 'team' : path.startsWith('/player/') ? 'player' : path.startsWith('/history') ? 'history' : 'other');
  const [logoutError, setLogoutError] = useState(''), [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true); setLogoutError('');
    try { await service.logout(); } catch (e) { setLogoutError(e.message); } finally { setLoggingOut(false); }
  }
  const shownError = import.meta.env.DEV || !error ? error || logoutError : logoutError || FRIENDLY_ERROR;

  return (
    <div className={`app screen-${screen}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="Traice 2.0 home"><img src="/traice-tennis.webp" alt="" /><span>traice</span><b>2.0</b></Link>
          <nav aria-label="Main navigation" className="tabs">
            <NavLink to="/" end><Icon name="rules" /><span>Rules</span></NavLink>
            {accepted
              ? <NavLink to="/register"><Icon name="register" /><span>Register</span></NavLink>
              : <span className="nav-locked" aria-disabled="true" title="Read and agree to all rules first"><Icon name="lock" /><span>Register</span></span>}
            <NavLink to="/tiers"><Icon name="trophy" /><span>Tier list</span></NavLink>
            <NavLink to="/league"><Icon name="calendar" /><span>League</span></NavLink>
            <NavLink to="/players"><Icon name="users" /><span>Players</span></NavLink>
            <NavLink to="/champions"><Icon name="trophy" /><span>Champions</span></NavLink>
            <NavLink className="admin-tab" to={user?.admin ? '/admin' : '/admin/login'}><Icon name="shield" /><span>Admin</span></NavLink>
          </nav>
          <div className="topbar-actions">
            <StatusPill mode={service.mode} connected={connected} online={online} />
            <NavLink className="chip-button admin-chip" to={user?.admin ? '/admin' : '/admin/login'} aria-label="Admin"><Icon name="shield" size={16} /></NavLink>
            {!user?.admin && <NavLink className="chip-button" to="/captain" aria-label={user?.captain ? 'My team' : 'Captain sign in'}><Icon name="user" size={16} /><span>{user?.captain ? 'My team' : 'Captain'}</span></NavLink>}
            {canInstall && <button type="button" className="chip-button" aria-label="Install app" onClick={install}><Icon name="download" size={16} /><span>Install app</span></button>}
            {(user?.admin || user?.captain) && <button type="button" className="chip-button" aria-label="Sign out" disabled={loggingOut} onClick={logout}><Icon name="logout" size={16} /><span>{loggingOut ? 'Signing out…' : 'Sign out'}</span></button>}
          </div>
        </div>
      </header>

      <main>
        {!online && <p className="banner offline" role="status"><Icon name="wifiOff" size={16} /> You’re offline. Saved pages still work; reconnect before registering.</p>}
        {savedAt && <p className="banner offline" role="status"><Icon name="wifiOff" size={16} /> Showing data saved {new Date(savedAt).toLocaleString()}. It refreshes as soon as a connection is available.</p>}
        {updated && <p className="banner update" role="status"><Icon name="refresh" size={16} /> A new version is ready. <button type="button" onClick={() => location.reload()}>Reload</button></p>}
        <Message error>{shownError}</Message>
        <Suspense fallback={<div className="page-loading" aria-busy="true"><span className="spinner" /> Loading…</div>}>
          <Routes>
            <Route path="/" element={<Rules />} />
            <Route path="/register" element={accepted ? <Register /> : <Navigate to="/" replace />} />
            <Route path="/tiers" element={<Tiers />} />
            <Route path="/league" element={<League />} />
            <Route path="/team/:teamId" element={<Team />} />
            <Route path="/players" element={<Players />} />
            <Route path="/player/:teamId/:role" element={<Player />} />
            <Route path="/captain" element={<CaptainLogin />} />
            <Route path="/champions" element={<Champions />} />
            <Route path="/history" element={<History />} />
            <Route path="/history/:seasonId" element={<History />} />
            <Route path="/admin/login" element={<Login />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TournamentProvider>
        <RulesAccessProvider>
          <Layout />
        </RulesAccessProvider>
      </TournamentProvider>
    </BrowserRouter>
  );
}
