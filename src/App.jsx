import { BrowserRouter, NavLink, Routes, Route, Link, useLocation } from 'react-router-dom';
import { TournamentProvider, useTournament } from './hooks/useTournament';
import { lazy, Suspense, useState } from 'react';
import { RulesAccessProvider, useRulesAccess } from './hooks/useRulesAccess';
import { Navigate } from 'react-router-dom';
const Rules = lazy(() => import('./pages/Rules'));
const Register = lazy(() => import('./pages/Register'));
const Tiers = lazy(() => import('./pages/Tiers'));
const Login = lazy(() => import('./pages/Login'));
const Admin = lazy(() => import('./pages/Admin'));
import { Message } from './components/UI';
function Layout() {
  const { service, connected, error, user } = useTournament();
  const { accepted } = useRulesAccess(), onRules = useLocation().pathname === '/';
  const [logoutError, setLogoutError] = useState(''), [loggingOut, setLoggingOut] = useState(false);
  async function logout() { setLoggingOut(true); setLogoutError(''); try { await service.logout(); } catch (e) { setLogoutError(e.message); } finally { setLoggingOut(false); } }
  return <div className={onRules ? 'app app-rules' : 'app'}><header className="wrap"><Link to="/" className="brand"><img src="/traice-tennis.webp" alt="" /> traice <b>2.0</b></Link><nav aria-label="Main navigation"><NavLink to="/" end>Rules</NavLink>{accepted ? <NavLink to="/register">Register</NavLink> : <span className="nav-locked" aria-disabled="true" title="Read and agree to all rules first">Register 🔒</span>}<NavLink to="/tiers">Tier list</NavLink><NavLink to={user?.admin ? '/admin' : '/admin/login'}>Admin ↗</NavLink>{user?.admin && <button className="text-button" disabled={loggingOut} onClick={logout}>{loggingOut ? 'Signing out…' : 'Sign out'}</button>}</nav></header><main className="wrap">{(service.mode === 'Local demo' || !connected || import.meta.env.DEV) && <div className="environment"><span className={`dot ${connected ? 'online' : ''}`} />{connected ? service.mode + ' · Connected' : service.mode === 'Local demo' ? 'Local demo · Local test data only. No live Firebase connection.' : 'Connecting…'}</div>}<Message error>{import.meta.env.DEV || !error ? error || logoutError : logoutError || "We can’t reach the tournament right now. Please check your connection and try again shortly."}</Message><Suspense fallback={<Message>Loading page…</Message>}><Routes><Route path="/" element={<Rules />} /><Route path="/register" element={accepted ? <Register /> : <Navigate to="/" replace />} /><Route path="/tiers" element={<Tiers />} /><Route path="/admin/login" element={<Login />} /><Route path="/admin" element={<Admin />} /><Route path="*" element={<section className="page"><h1>Page not found.</h1><Link to="/">Return to rules →</Link></section>} /></Routes></Suspense></main><footer className="wrap"><Link to="/" className="brand"><img src="/traice-tennis.webp" alt="" /> traice <b>2.0</b></Link><span>Three players. Shared ambition.</span></footer></div>;
}
export default function App() { return <BrowserRouter><TournamentProvider><RulesAccessProvider><Layout /></RulesAccessProvider></TournamentProvider></BrowserRouter>; }
