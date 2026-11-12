import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { TournamentProvider, useTournament } from './hooks/useTournament';
import { RulesAccessProvider, useRulesAccess } from './hooks/useRulesAccess';
import { usePwa } from './hooks/usePwa';
import { Message } from './components/UI';
import { Icon } from './components/Icons';
import { EarlyBirdBar } from './components/EarlyBird';
import { diagnose } from './services/diagnose.js';
import { MODULES, moduleForPath } from './features/modules.js';
import { LadderProvider } from './features/ladder/LadderContext';

const PlayerHome = lazy(() => import('./features/home/PlayerHome'));
const ComingSoon = lazy(() => import('./features/home/PlayerHome').then(m => ({ default: m.ComingSoon })));
const LadderLayout = lazy(() => import('./features/ladder/LadderLayout'));
const LadderStandings = lazy(() => import('./features/ladder/Standings'));
const LadderMatches = lazy(() => import('./features/ladder/Matches'));
const LadderActivity = lazy(() => import('./features/ladder/Activity'));
const LadderRules = lazy(() => import('./features/ladder/RulesPage'));
const LadderOrganizer = lazy(() => import('./features/ladder/Organizer'));
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
const Partners = lazy(() => import('./pages/Partners'));
const Status = lazy(() => import('./pages/Status'));
const Pprc = lazy(() => import('./pages/Pprc'));
const Rankings = lazy(() => import('./pages/Rankings'));
const PprcPlayer = lazy(() => import('./pages/Pprc').then(m => ({ default: m.PprcPlayer })));

const FRIENDLY_ERROR = 'We can’t reach the tournament right now. Please check your connection and try again shortly.';
const SCREENS = { '/home': 'home', '/triace': 'rules', '/': 'home', '/register': 'register', '/tiers': 'tiers', '/league': 'league', '/players': 'players', '/champions': 'champions', '/partners': 'partners', '/admin/login': 'login', '/captain': 'login', '/admin': 'admin' };

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
      <Link className="button" to="/triace">Back to rules <Icon name="arrow" size={18} /></Link>
    </section>
  );
}

function Layout() {
  const { service, connected, error, user, savedAt } = useTournament();
  const { accepted } = useRulesAccess();
  const { canInstall, install, online, updated } = usePwa();
  const path = useLocation().pathname, module = moduleForPath(path), triace = module === 'triace', screen = SCREENS[path] || (module !== 'triace' ? module : (path.startsWith('/team/') ? 'team' : path.startsWith('/player/') ? 'player' : path.startsWith('/history') ? 'history' : 'other'));
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
          {/* Each format keeps its own brand and tabs inside the shared PPRC header; All Formats is always one tap away. */}
          {triace
            ? <Link to="/triace" className="brand" aria-label="Traice 2.0 home"><img src="/traice-tennis.webp" alt="" /><span>traice</span><b>2.0</b></Link>
            : <Link to="/home" className="brand pprc" aria-label="PPRC Player Home"><span>PPRC</span>{module === 'ladder' && <b>Ladder</b>}</Link>}
          {module !== 'home' && <NavLink className="chip-button all-formats" to="/home" aria-label="All Formats"><Icon name="grid" size={16} /><span>All Formats</span></NavLink>}
          {triace && <nav aria-label="Main navigation" className="tabs">
            <NavLink to="/triace" end><Icon name="rules" /><span>Rules</span></NavLink>
            {accepted
              ? <NavLink to="/register"><Icon name="register" /><span>Register</span></NavLink>
              : <span className="nav-locked" aria-disabled="true" title="Read and agree to all rules first"><Icon name="lock" /><span>Register</span></span>}
            <NavLink to="/tiers"><Icon name="trophy" /><span>Tier list</span></NavLink>
            <NavLink to="/league"><Icon name="calendar" /><span>League</span></NavLink>
            <NavLink to="/players"><Icon name="users" /><span>Players</span></NavLink>
            <NavLink to="/partners" aria-label="Find a partner"><Icon name="partner" /><span className="tab-long">Find a partner</span><span className="tab-short">Partner</span></NavLink>
            <NavLink to="/rankings"><Icon name="ladder" /><span>Rankings</span></NavLink>
            <NavLink to="/champions"><Icon name="trophy" /><span>Champions</span></NavLink>
            <NavLink className="admin-tab" to={user?.admin ? '/admin' : '/admin/login'}><Icon name="shield" /><span>Admin</span></NavLink>
          </nav>}
          {module === 'ladder' && <nav aria-label="Ladder navigation" className="tabs">
            <NavLink to="/ladder" end><Icon name="ladder" /><span>Ladder</span></NavLink>
            <NavLink to="/ladder/matches"><Icon name="ball" /><span>Matches</span></NavLink>
            <NavLink to="/ladder/activity"><Icon name="bolt" /><span>Activity</span></NavLink>
            <NavLink to="/ladder/rules"><Icon name="rules" /><span>Rules</span></NavLink>
            {user?.admin && <NavLink to="/ladder/organizer"><Icon name="shield" /><span>Organizer</span></NavLink>}
          </nav>}
          <div className="topbar-actions">
            <StatusPill mode={service.mode} connected={connected} online={online} />
            {triace && <NavLink className="chip-button admin-chip" to={user?.admin ? '/admin' : '/admin/login'} aria-label="Admin"><Icon name="shield" size={16} /></NavLink>}
            {!user?.admin && (triace || !user?.captain) && <NavLink className="chip-button" to="/captain" aria-label={triace ? (user?.captain ? 'My team' : 'Captain sign in') : 'Sign in'}><Icon name="user" size={16} /><span>{triace ? (user?.captain ? 'My team' : 'Captain') : 'Sign in'}</span></NavLink>}
            {canInstall && <button type="button" className="chip-button" aria-label="Install app" onClick={install}><Icon name="download" size={16} /><span>Install app</span></button>}
            {(user?.admin || user?.captain) && <button type="button" className="chip-button" aria-label="Sign out" disabled={loggingOut} onClick={logout}><Icon name="logout" size={16} /><span>{loggingOut ? 'Signing out…' : 'Sign out'}</span></button>}
          </div>
        </div>
      </header>

      {triace && <EarlyBirdBar />}
      <main>
        {!online && <p className="banner offline" role="status"><Icon name="wifiOff" size={16} /> You’re offline. Saved pages still work; reconnect before registering.</p>}
        {savedAt && <p className="banner offline" role="status"><Icon name="wifiOff" size={16} /> Showing data saved {new Date(savedAt).toLocaleString()}. It refreshes as soon as a connection is available.</p>}
        {updated && <p className="banner update" role="status"><Icon name="refresh" size={16} /> A new version is ready. <button type="button" onClick={() => location.reload()}>Reload</button></p>}
        <Message error>{shownError}</Message>
        {error && shownError === FRIENDLY_ERROR && (
          <details className="error-details">
            <summary>Technical details (for the tournament admin)</summary>
            <p><code>{error}</code></p>
            <p><strong>Likely fix:</strong> {diagnose(error)}</p>
            <p><Link to="/status">Run the full setup check →</Link></p>
          </details>
        )}
        <Suspense fallback={<div className="page-loading" aria-busy="true"><span className="spinner" /> Loading…</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            {/* Player Home and the Ladder share the ladder's data provider; TRIACE pages never load ladder data. */}
            <Route element={<LadderProvider><Outlet /></LadderProvider>}>
              <Route path="/home" element={<PlayerHome />} />
              <Route path="/ladder" element={<LadderLayout />}>
                <Route index element={<LadderStandings />} />
                <Route path="matches" element={<LadderMatches />} />
                <Route path="activity" element={<LadderActivity />} />
                <Route path="rules" element={<LadderRules />} />
                <Route path="organizer" element={<LadderOrganizer />} />
              </Route>
            </Route>
            {MODULES.filter(m => m.status === 'soon').map(m => <Route key={m.id} path={m.path} element={<ComingSoon name={m.name} />} />)}
            <Route path="/triace" element={<Rules />} />
            <Route path="/register" element={accepted ? <Register /> : <Navigate to="/triace" replace />} />
            <Route path="/tiers" element={<Tiers />} />
            <Route path="/league" element={<League />} />
            <Route path="/team/:teamId" element={<Team />} />
            <Route path="/players" element={<Players />} />
            <Route path="/player/:teamId/:role" element={<Player />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/status" element={<Status />} />
            <Route path="/captain" element={<CaptainLogin />} />
            <Route path="/champions" element={<Champions />} />
            <Route path="/rankings" element={<Rankings />} />
            <Route path="/pprc" element={<Pprc />} />
            <Route path="/pprc/:playerId" element={<PprcPlayer />} />
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
