import { BrowserRouter, NavLink, Routes, Route, Link } from 'react-router-dom';
import { TournamentProvider, useTournament } from './hooks/useTournament';
import { lazy, Suspense, useState } from 'react';
const Register = lazy(() => import('./pages/Register'));
const Tiers = lazy(() => import('./pages/Tiers'));
const Login = lazy(() => import('./pages/Login'));
const Admin = lazy(() => import('./pages/Admin'));
import { Message } from './components/UI';
function Layout() {
  const { service, connected, error, user } = useTournament();
  const [logoutError, setLogoutError] = useState(''), [loggingOut, setLoggingOut] = useState(false);
  async function logout() { setLoggingOut(true); setLogoutError(''); try { await service.logout(); } catch (e) { setLogoutError(e.message); } finally { setLoggingOut(false); } }
  return <><header className="wrap"><Link to="/" className="brand"><img src="/traice-tennis.webp" alt="" /> traice <b>2.0</b></Link><nav aria-label="Main navigation"><NavLink to="/" end>Register</NavLink><NavLink to="/tiers">Tier list</NavLink><NavLink to={user?.admin ? '/admin' : '/admin/login'}>Admin ↗</NavLink>{user?.admin && <button className="text-button" disabled={loggingOut} onClick={logout}>{loggingOut ? 'Signing out…' : 'Sign out'}</button>}</nav></header><main className="wrap"><div className="environment"><span className={`dot ${connected ? 'online' : ''}`} />{service.mode}{service.mode === 'Local demo' ? ' · Local test data only. No live Firebase connection.' : connected ? ' · Connected' : ' · Connecting…'}</div><Message error>{error || logoutError}</Message><Suspense fallback={<Message>Loading page…</Message>}><Routes><Route path="/" element={<Register />} /><Route path="/tiers" element={<Tiers />} /><Route path="/admin/login" element={<Login />} /><Route path="/admin" element={<Admin />} /><Route path="*" element={<section className="page"><h1>Page not found.</h1><Link to="/">Return to registration →</Link></section>} /></Routes></Suspense></main><footer className="wrap"><Link to="/" className="brand"><img src="/traice-tennis.webp" alt="" /> traice <b>2.0</b></Link><span>Three players. Shared ambition.</span></footer></>;
}
export default function App() { return <BrowserRouter><TournamentProvider><Layout /></TournamentProvider></BrowserRouter>; }
