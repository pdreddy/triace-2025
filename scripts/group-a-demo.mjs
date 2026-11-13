// A separate local data directory keeps ordinary demo sessions and recorded results intact.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { groupAPractice, GROUP_A_PASSWORD, GROUP_A_SEASON } from './group-a-practice.mjs';
const directory = process.env.TRAICE_DEMO_DATA_DIR || '.local-demo/group-a-v2';
if (process.argv.includes('--reset')) {
  const file = path.resolve(directory, 'state.json');
  if (fs.existsSync(file)) {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (state.groupAPractice?.seasonId !== GROUP_A_SEASON) throw new Error('Refusing to reset a folder that is not the Group A practice profile.');
    fs.unlinkSync(file);
  }
}
const { accounts, practice } = groupAPractice();
console.log('\nGroup A local practice — real roster, fresh test results.');
console.log(`Open /player-login. All six local test passwords: ${GROUP_A_PASSWORD}`);
console.table(accounts.map(({ name, username }) => ({ Player: name, Username: username, Password: GROUP_A_PASSWORD })));
console.log('Two sample rounds (six matches) are already completed. Open /ladder and click Watch snake & ladder.');
console.log('Three actual Group A pairings are waiting for the opponents to accept:');
for (const match of practice.matches) console.log(`  ${match.home} v ${match.away} · ${match.round} · reference score ${match.score}`);
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--mode', 'demo', ...process.argv.slice(2).filter(arg => arg !== '--reset')], {
  stdio: 'inherit', env: { ...process.env, TRAICE_DEMO_PROFILE: 'group-a', TRAICE_DEMO_DATA_DIR: directory, VITE_MULTICLUB_DATABASE_URL: '/pprc-db' }
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
