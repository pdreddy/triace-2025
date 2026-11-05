// Project-owner tool: set a new password on an existing Firebase Authentication user (typed twice, never shown or saved).
//   GOOGLE_CLOUD_PROJECT=<project> node scripts/set-admin-password.cjs reddi2026@traice.local
// Needs Google Application Default Credentials (gcloud auth application-default login). Never commit service-account keys.
const readline = require('node:readline');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = text => { if (text.includes(question)) rl.output.write(text); };   // hide what is typed
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}
async function main() {
  const email = process.argv[2];
  if (!email || !process.env.GOOGLE_CLOUD_PROJECT) throw new Error('Usage: GOOGLE_CLOUD_PROJECT=your-project node scripts/set-admin-password.cjs admin@example.com');
  initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT });
  const user = await getAuth().getUserByEmail(email);
  const first = await ask('New password (12+ characters): '), second = await ask('Type it again: ');
  if (first !== second) throw new Error('The two passwords differ. Nothing was changed.');
  if (first.length < 12) throw new Error('Use at least 12 characters. Nothing was changed.');
  await getAuth().updateUser(user.uid, { password: first });
  await getAuth().revokeRefreshTokens(user.uid);
  console.log(`Password changed for ${email}. Any open sessions were signed out.`);
  console.log(user.customClaims?.admin ? 'This account already has the admin role.' : 'This account does not have the admin role yet: run scripts/grant-admin.cjs next.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
