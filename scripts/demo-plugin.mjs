import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { initialState, publicState, applyRegistration, applyConfiguration, applyEarlyBird, applyRecalculation, applyLeagueRules, isOwner, ValidationError } from '../functions/lib/tournament.js';
import { applyGenerateFixtures, applyGeneratePlayoffs, applySubmitResult, applyReviewResult, applyManageSeason, applySetSchedule, applyMoveFixture, applyIssueChallenge, applyUpdateTeam, applyWithdrawTeam, applySetCaptainLogin } from '../functions/lib/league.js';
import { newLogin, newPassword, captainUid, loginEmail, normalizePassword } from '../functions/lib/captainLogin.js';
import { validateLegacySeason } from '../functions/lib/legacy.js';
import { applyCreatePost, applyExpressInterest, applyClosePost } from '../functions/lib/partners.js';
const digest = value => createHash('sha256').update(value).digest();
// Demo captain logins are kept in the demo state with a salted hash (never the password).
const hashPassword = (password, salt = randomBytes(16).toString('hex')) => ({ salt, hash: scryptSync(normalizePassword(password), salt, 32).toString('hex') });
const passwordMatches = (login, password) => !!login && timingSafeEqual(Buffer.from(hashPassword(password, login.salt).hash, 'hex'), Buffer.from(login.hash, 'hex'));
export function demoPlugin(env) {
  // An unset password no longer stops the demo: a random one is made for this run and printed once.
  // A password that is set but shorter than 8 characters is still an error.
  let password = env.TRAICE_ADMIN_PASSWORD;
  if (!password) {
    password = randomBytes(9).toString('base64url');
    console.log(`\n  Demo admin password for this run: ${password}\n  (set TRAICE_ADMIN_PASSWORD in .env.demo.local to choose your own)\n`);
  }
  if (password.length < 8) throw new Error(`TRAICE_ADMIN_PASSWORD is only ${password.length} characters; use 8 or more.`);
  const username = env.TRAICE_ADMIN_USERNAME || 'reddi2026', email = env.TRAICE_ADMIN_EMAIL || 'reddi2026@traice.local';
  const directory = path.resolve(env.TRAICE_DEMO_DATA_DIR || '.local-demo'), file = path.join(directory, 'state.json');
  const sessions = new Map(), attempts = new Map();
  let state, queue = Promise.resolve();
  async function initialize() {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try { state = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; state = initialState(); await writeFile(file, JSON.stringify(state), { mode: 0o600 }); }
  }
  const ready = initialize();
  function mutate(operation) {
    const job = queue.then(async () => {
      const { state: next, result } = operation(state), temporary = file + '.tmp';
      await writeFile(temporary, JSON.stringify(next), { mode: 0o600 }); await rename(temporary, file); state = next; return result;
    }); queue = job.catch(() => {}); return job;
  }
  return { name: 'traice-local-demo', configureServer(server) {
    server.middlewares.use('/api', async (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
      const send = (code, body) => { res.statusCode = code; res.end(JSON.stringify(body)); };
      try {
        await ready;
        const host = (req.headers.host || '').split(':')[0];
        if (!['localhost', '127.0.0.1'].includes(host)) return send(403, { error: 'Local demo only accepts loopback hosts.' });
        const url = new URL(req.url, `http://${req.headers.host}`), endpoint = url.pathname;
        const token = /(?:^|;\s*)traice_demo=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
        let session = token && sessions.get(token);
        const cookie = value => res.setHeader('Set-Cookie', `traice_demo=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
        function newSession(admin = false, captain = null) { if (token) sessions.delete(token); const value = randomBytes(32).toString('hex'); const created = { uid: captain?.uid || 'demo_' + randomBytes(16).toString('hex'), admin, anonymous: !admin && !captain, ...(admin ? { email } : {}), ...(captain ? { email: loginEmail(captain.username), captain: true } : {}), expires: Date.now() + 28800000 }; sessions.set(value, created); cookie(value); return created; }
        if (session?.expires < Date.now()) session = undefined;
        if (!session && endpoint === '/session') session = newSession();
        for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
        const safeUser = () => ({ uid: session.uid, admin: session.admin, anonymous: session.anonymous, ...(session.captain ? { captain: true } : {}), ...(session.email ? { email: session.email } : {}) });
        if (req.method === 'GET') {
          if (endpoint === '/session') return send(200, safeUser());
          if (endpoint === '/public') return send(200, { ...publicState(state), ...(state.season1 ? { legacySeasons: { s1: state.season1 } } : {}) });
          if (endpoint === '/my-registration') { const reg = state.registrations?.[url.searchParams.get('teamId')]; return reg && session && (session.admin || isOwner(reg, session.uid)) ? send(200, reg) : send(403, { error: 'Only this team’s captain can read it.' }); }
          if (endpoint === '/partner-mine') return send(200, session ? Object.fromEntries(Object.entries(state.partnerPrivate || {}).filter(([, secret]) => secret.ownerUid === session.uid)) : {});
          if (endpoint === '/my-teams') return send(200, session ? state.teamsByOwner?.[session.uid] || {} : {});
          if (endpoint === '/registrations') return session?.admin ? send(200, state.registrations || {}) : send(403, { error: 'Administrator access is required.' });
          return send(404, { error: 'Unknown endpoint.' });
        }
        if (req.method !== 'POST') return send(405, { error: 'Method not allowed.' });
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: 'Cross-origin requests are not accepted.' });
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON content is required.' });
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 65536) return send(413, { error: 'Request too large.' }); }
        let payload; try { payload = JSON.parse(raw); } catch { return send(400, { error: 'Invalid JSON.' }); }
        if (endpoint === '/login') {
          const ip = req.socket.remoteAddress, prior = attempts.get(ip) || { count: 0, until: 0 }, now = Date.now();
          if (prior.until < now) { prior.count = 0; prior.until = now + 60000; } prior.count++; attempts.set(ip, prior);
          if (prior.count > 10) return send(429, { error: 'Too many sign-in attempts. Wait one minute.' });
          const identifier = String(payload.username || '').trim().toLowerCase();
          if (![username.toLowerCase(), email.toLowerCase()].includes(identifier) || !timingSafeEqual(digest(String(payload.password || '')), digest(password))) return send(401, { error: 'Invalid credentials.' });
          session = newSession(true); attempts.delete(ip); return send(200, safeUser());
        }
        if (endpoint === '/logout') { session = newSession(); return send(200, safeUser()); }
        if (endpoint === '/register' && !session) return send(401, { error: 'Open the registration page before submitting.' });
        if (endpoint === '/register') {
          const login = newLogin(payload?.captain?.firstName), uid = typeof payload?.teamId === 'string' ? captainUid(payload.teamId) : null;
          const result = await mutate(current => {
            const outcome = applyRegistration(current, payload, session.uid, Date.now(), uid && { uid, username: login.username });
            if (outcome.result.created) outcome.state.demoLogins = { ...(outcome.state.demoLogins || {}), [login.username]: { uid, teamId: payload.teamId, ...hashPassword(login.password) } };
            return outcome;
          });
          return send(200, result.created ? { ...result, login } : result);
        }
        if (endpoint === '/captain-login') {
          const ip = `captain:${req.socket.remoteAddress}`, prior = attempts.get(ip) || { count: 0, until: 0 }, now = Date.now();
          if (prior.until < now) { prior.count = 0; prior.until = now + 60000; } prior.count++; attempts.set(ip, prior);
          if (prior.count > 10) return send(429, { error: 'Too many sign-in attempts. Wait one minute.' });
          const username = String(payload.username || '').trim().toLowerCase(), login = state.demoLogins?.[username];
          if (!login || !passwordMatches(login, payload.password) || !state.registrations?.[login.teamId]) return send(401, { error: 'Wrong username or password.' });
          session = newSession(false, { uid: login.uid, username }); attempts.delete(ip); return send(200, safeUser());
        }
        const signedIn = session && session.uid, admin = session?.admin === true;
        if (endpoint === '/import-season1') {
          if (!admin) return send(403, { error: 'Administrator access is required.' });
          validateLegacySeason(payload.season);
          return send(200, await mutate(current => ({ state: { ...current, season1: payload.season }, result: { path: 'demo state' } })));
        }
        const newId = () => randomBytes(10).toString('hex');
        if (endpoint === '/partner-post') return signedIn ? send(200, await mutate(current => applyCreatePost(current, payload, session.uid, Date.now(), newId()))) : send(401, { error: 'Open the page again, then retry.' });
        if (endpoint === '/partner-interest') return signedIn ? send(200, await mutate(current => applyExpressInterest(current, payload, session.uid, Date.now(), newId()))) : send(401, { error: 'Open the page again, then retry.' });
        if (endpoint === '/partner-close') return signedIn ? send(200, await mutate(current => applyClosePost(current, payload, session.uid, admin))) : send(401, { error: 'Open the page again, then retry.' });
        if (endpoint === '/issue-challenge') return signedIn ? send(200, await mutate(current => applyIssueChallenge(current, payload, session.uid, admin))) : send(401, { error: 'Sign in first.' });
        if (endpoint === '/update-team') return signedIn ? send(200, await mutate(current => applyUpdateTeam(current, payload, session.uid, admin))) : send(401, { error: 'Sign in first.' });
        if (endpoint === '/withdraw-team') {
          if (!signedIn) return send(401, { error: 'Sign in first.' });
          return send(200, await mutate(current => { const outcome = applyWithdrawTeam(current, payload, session.uid, admin); outcome.state.demoLogins = Object.fromEntries(Object.entries(outcome.state.demoLogins || {}).filter(([, login]) => login.teamId !== outcome.result.teamId)); return outcome; }));   // the team's login goes with it
        }
        if (endpoint === '/submit-result') return session ? send(200, await mutate(current => applySubmitResult(current, payload, session.uid, session.admin === true))) : send(401, { error: 'Sign in before submitting a score.' });
        if (!session?.admin) return send(403, { error: 'Administrator access is required.' });
        if (endpoint === '/configuration') return send(200, await mutate(current => applyConfiguration(current, payload)));
        if (endpoint === '/generate-fixtures') return send(200, await mutate(current => applyGenerateFixtures(current, payload)));
        if (endpoint === '/generate-playoffs') return send(200, await mutate(current => applyGeneratePlayoffs(current, payload)));
        if (endpoint === '/set-schedule') return send(200, await mutate(current => applySetSchedule(current, payload)));
        if (endpoint === '/move-fixture') return send(200, await mutate(current => applyMoveFixture(current, payload)));
        if (endpoint === '/reset-captain-login') {
          const record = state.registrations?.[payload.teamId];
          if (!record) return send(400, { error: 'That team no longer exists.' });
          const password = newPassword(), uid = captainUid(record.teamId);
          const username = record.captainUsername && state.demoLogins?.[record.captainUsername] ? record.captainUsername : newLogin(record.captain?.firstName).username;
          await mutate(current => {
            const outcome = record.captainUsername === username ? { state: structuredClone(current), result: {} } : applySetCaptainLogin(current, { teamId: record.teamId, uid, username });
            outcome.state.demoLogins = { ...(outcome.state.demoLogins || {}), [username]: { uid, teamId: record.teamId, ...hashPassword(password) } };
            return outcome;
          });
          return send(200, { teamId: record.teamId, username, password });
        }
        if (endpoint === '/early-bird') return send(200, await mutate(current => applyEarlyBird(current, payload)));
        if (endpoint === '/league-rules') return send(200, await mutate(current => applyLeagueRules(current, payload)));
        if (endpoint === '/season') return send(200, await mutate(current => applyManageSeason(current, payload)));
        if (endpoint === '/review-result') return send(200, await mutate(current => applyReviewResult(current, payload)));
        if (endpoint === '/recalculate') return send(200, await mutate(current => applyRecalculation(current)));
        return send(404, { error: 'Unknown endpoint.' });
      } catch (error) { send(error instanceof ValidationError ? 400 : 500, { error: error instanceof ValidationError ? error.message : 'Local demo failed. Check its data directory and server output.' }); }
    });
  } };
}
