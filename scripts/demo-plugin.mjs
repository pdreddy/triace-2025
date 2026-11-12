import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { applyUtrUpdates, validateUtrUpdates } from '../functions/lib/pprcSync.js';
import { initialState, publicState, applyRegistration, applyConfiguration, applyEarlyBird, applyRecalculation, applyLeagueRules, applyCalendar, guard, isOwner, ValidationError } from '../functions/lib/tournament.js';
import { applyGenerateFixtures, applyGeneratePlayoffs, applySubmitResult, applyReviewResult, applyManageSeason, applySetSchedule, applyMoveFixture, applyIssueChallenge, applyUpdateTeam, applyLinkPprc, applyWithdrawTeam, applySetCaptainLogin, applyAutoSchedule, applyAddBuffer } from '../functions/lib/league.js';
import { adminEmail, validateAdminUsername, newAdminPassword, checkRemoval } from '../functions/lib/admins.js';
import { newPassword, usernameAttempt, loginNames, captainUid, loginEmail, normalizePassword } from '../functions/lib/captainLogin.js';
import { validateLegacySeason } from '../functions/lib/legacy.js';
import { applyLadder } from '../functions/lib/singlesLadder/engine.js';
import { DEMO_ROSTER, seedDemoLadder, demoUid } from './ladder-dev-fixtures.mjs';
import { applyCreatePost, applyExpressInterest, applyClosePost, applyMarkPicked, applyReopenPost } from '../functions/lib/partners.js';
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
  // The shared PPRC database, served from a local file so the demo works offline: GET /pprc-db/<path>.json
  // (the same shape as the Realtime Database REST interface). The file is the multiclub.json the migration writes.
  const treeFile = path.resolve(env.PPRC_TREE || '.local-migration/multiclub.json');
  return { name: 'traice-local-demo', configureServer(server) {
    server.middlewares.use('/pprc-db', async (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
      const host = (req.headers.host || '').split(':')[0];
      if (!['localhost', '127.0.0.1'].includes(host)) { res.statusCode = 403; return res.end('{"error":"Local demo only accepts loopback hosts."}'); }
      let tree;
      try { tree = JSON.parse(await readFile(treeFile, 'utf8')); } catch { res.statusCode = 404; return res.end(JSON.stringify({ error: 'No local PPRC data. Run: bash run-local.sh --export <your-export.json> --demo' })); }
      const segments = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/|\.json$/g, '').split('/').filter(Boolean);
      const value = segments.reduce((node, key) => (node && typeof node === 'object' && Object.hasOwn(node, key) ? node[key] : null), tree);
      res.end(JSON.stringify(value ?? null));
    });
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
          if (endpoint === '/ladder') {
            // The same read rules as database.rules.template.json: index and public for everyone, own identity/requests/notifications, everything for organizers.
            const parts = (url.searchParams.get('path') || '').split('/').filter(Boolean), ladder = state.ladder || {}, mine = session && ladder.accounts?.[session.uid];
            const allowed = session?.admin || ['index', 'public'].includes(parts[0]) || (parts[0] === 'accounts' && parts.length === 2 && parts[1] === session?.uid) || (parts[0] === 'private' && ['requests', 'notifications'].includes(parts[2]) && parts.length >= 4 && mine && parts[3] === mine);
            if (!allowed) return send(403, { error: 'You cannot read that ladder data.' });
            return send(200, parts.reduce((node, key) => (node && typeof node === 'object' && Object.hasOwn(node, key) ? node[key] : null), ladder) ?? null);
          }
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
          const extra = state.demoAdmins?.[identifier.replace(/@traice\.local$/, '')];
          const isOwnerLogin = [username.toLowerCase(), email.toLowerCase()].includes(identifier) && timingSafeEqual(digest(String(payload.password || '')), digest(password));
          if (!isOwnerLogin && !(extra && passwordMatches(extra, String(payload.password || '')))) return send(401, { error: 'Invalid credentials.' });
          session = newSession(true); attempts.delete(ip); return send(200, safeUser());
        }
        if (endpoint === '/logout') { session = newSession(); return send(200, safeUser()); }
        if (endpoint === '/register' && !session) return send(401, { error: 'Open the registration page before submitting.' });
        if (endpoint === '/register') {
          const names = loginNames(payload), uid = typeof payload?.teamId === 'string' ? captainUid(payload.teamId) : null;
          let attempt = 0; while (state.demoLogins?.[usernameAttempt(names, attempt)]) attempt++;   // arjuraj, arjuraj2 ...
          const login = { username: usernameAttempt(names, attempt), password: newPassword(names) };
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
        // Singles Ladder: the same engine the Cloud Function runs. Players come from the development roster, never from live data.
        if (endpoint === '/ladder-action') {
          if (!session || session.anonymous) return send(401, { error: 'Sign in with your player account.' });
          const data = { ...payload };
          if (admin && data.action === 'enroll') { const record = Object.hasOwn(DEMO_ROSTER, data.playerId) && DEMO_ROSTER[data.playerId]; if (!record) return send(400, { error: 'The local demo only knows its development roster: ladder_demo_1 to ladder_demo_12.' }); Object.assign(data, record); }
          if (admin && data.action === 'syncPlayers') data.players = DEMO_ROSTER;
          return send(200, await mutate(current => { const out = applyLadder(current.ladder, data, { uid: session.uid, admin }, { now: Date.now(), id: newId() }); return { state: { ...current, ladder: JSON.parse(JSON.stringify(out.state)) }, result: out.result }; }));
        }
        if (endpoint === '/ladder-demo-seed') {
          if (!admin) return send(403, { error: 'Administrator access is required.' });
          return send(200, await mutate(current => ({ state: { ...current, ladder: JSON.parse(JSON.stringify(seedDemoLadder(current.ladder, Date.now()))) }, result: { ok: true } })));
        }
        if (endpoint === '/ladder-demo-login') {
          const uid = Object.hasOwn(DEMO_ROSTER, payload.playerId) ? demoUid(payload.playerId) : null;
          if (!uid || state.ladder?.accounts?.[uid] !== payload.playerId) return send(400, { error: 'Seed the demo ladder first, then choose one of its players.' });
          session = newSession(false, { uid, username: payload.playerId.replaceAll('_', '') }); return send(200, safeUser());
        }
        if (endpoint === '/partner-post') return signedIn ? send(200, await mutate(current => applyCreatePost(current, payload, session.uid, Date.now(), newId()))) : send(401, { error: 'Open the page again, then retry.' });
        if (endpoint === '/partner-interest') return signedIn ? send(200, await mutate(current => applyExpressInterest(current, payload, session.uid, Date.now(), newId()))) : send(401, { error: 'Open the page again, then retry.' });
        if (endpoint === '/partner-picked') return signedIn ? send(200, await mutate(current => applyMarkPicked(current, payload, session.uid, admin))) : send(401, { error: 'Open the page again, then retry.' });
        if (endpoint === '/partner-reopen') return signedIn ? send(200, await mutate(current => applyReopenPost(current, payload, session.uid, admin))) : send(401, { error: 'Open the page again, then retry.' });
        if (endpoint === '/partner-close') return signedIn ? send(200, await mutate(current => applyClosePost(current, payload, session.uid, admin))) : send(401, { error: 'Open the page again, then retry.' });
        if (endpoint === '/issue-challenge') return signedIn ? send(200, await mutate(current => applyIssueChallenge(current, payload, session.uid, admin))) : send(401, { error: 'Sign in first.' });
        if (endpoint === '/update-team') return signedIn ? send(200, await mutate(current => applyUpdateTeam(current, payload, session.uid, admin))) : send(401, { error: 'Sign in first.' });
        if (endpoint === '/sync-pprc-utr') {
          if (!admin) return send(403, { error: 'Administrator access is required.' });
          let tree;
          try { tree = JSON.parse(await readFile(treeFile, 'utf8')); } catch { return send(404, { error: 'No local PPRC data. Run: bash check-local.sh --export <your-export.json> --demo' }); }
          let result;
          try { result = applyUtrUpdates({ pprcMaster: tree.pprcMaster, clubs: tree.clubs }, validateUtrUpdates(payload?.updates)); } catch (error) { return send(400, { error: error.message }); }
          Object.assign(tree.pprcMaster.players, result.changedPlayers); Object.assign(tree.pprcMaster.nameIndex, result.newIndex);
          tree.pprcMaster.utrHistory ||= {}; for (const [id, h] of Object.entries(result.utrHistory)) tree.pprcMaster.utrHistory[id] = { ...(tree.pprcMaster.utrHistory[id] || {}), ...h };
          Object.assign(tree.pprcMaster, result.derived);
          await writeFile(treeFile, JSON.stringify(tree));
          return send(200, result.summary);
        }
        if (endpoint === '/link-pprc') return signedIn ? send(200, await mutate(current => applyLinkPprc(current, payload, admin))) : send(401, { error: 'Sign in first.' });
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
          const names = loginNames(record), password = newPassword(names), uid = captainUid(record.teamId);
          let attempt = 0; while (state.demoLogins?.[usernameAttempt(names, attempt)]) attempt++;
          const username = record.captainUsername && state.demoLogins?.[record.captainUsername] ? record.captainUsername : usernameAttempt(names, attempt);
          await mutate(current => {
            const outcome = record.captainUsername === username ? { state: structuredClone(current), result: {} } : applySetCaptainLogin(current, { teamId: record.teamId, uid, username });
            outcome.state.demoLogins = { ...(outcome.state.demoLogins || {}), [username]: { uid, teamId: record.teamId, ...hashPassword(password) } };
            return outcome;
          });
          return send(200, { teamId: record.teamId, username, password });
        }
        if (endpoint === '/backup-now') { await mkdir(path.join(directory, 'backups'), { recursive: true }); const name = `backups/traice-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; await writeFile(path.join(directory, name), JSON.stringify(state), { mode: 0o600 }); return send(200, { bucket: 'local demo folder', json: name, txt: name, teams: Object.keys(state.registrations || {}).length }); }
        if (endpoint === '/calendar') return send(200, await mutate(current => applyCalendar(current, payload)));
        if (endpoint === '/auto-schedule') return send(200, await mutate(current => applyAutoSchedule(current, payload)));
        if (endpoint === '/add-buffer') return send(200, await mutate(current => applyAddBuffer(current, payload)));
        if (endpoint.startsWith('/admin')) {
          const admins = () => [{ uid: 'demo-admin', username, email, you: true }, ...Object.keys(state.demoAdmins || {}).map(name => ({ uid: `demo-${name}`, username: name, email: adminEmail(name), you: false }))];
          const target = String(payload.uid || '').replace(/^demo-/, '');
          if (endpoint === '/admins') return send(200, { admins: admins() });
          if (endpoint === '/admin-create') {
            const name = guard(() => validateAdminUsername(payload.username));
            if (name === username.toLowerCase() || state.demoAdmins?.[name]) return send(400, { error: `“${name}” already has an account. Choose another name.` });
            const pw = newAdminPassword();
            await mutate(current => ({ state: { ...current, demoAdmins: { ...(current.demoAdmins || {}), [name]: hashPassword(pw) } }, result: null }));
            return send(200, { uid: `demo-${name}`, username: name, password: pw });
          }
          if (endpoint === '/admin-reset') {
            if (!state.demoAdmins?.[target]) return send(400, { error: 'That person is not an administrator.' });
            const pw = newAdminPassword();
            await mutate(current => ({ state: { ...current, demoAdmins: { ...current.demoAdmins, [target]: hashPassword(pw) } }, result: null }));
            return send(200, { uid: payload.uid, username: target, password: pw });
          }
          if (endpoint === '/admin-remove') {
            guard(() => checkRemoval(admins(), payload.uid, 'demo-admin'));
            await mutate(current => { const demoAdmins = { ...current.demoAdmins }; delete demoAdmins[target]; return { state: { ...current, demoAdmins }, result: null }; });
            return send(200, { uid: payload.uid });
          }
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
