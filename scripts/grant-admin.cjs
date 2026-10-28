// Project-owner tool. Never run with browser credentials or commit service-account keys.
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT });
async function main() {
 const email=process.argv[2]; if(!email) throw new Error('Usage: GOOGLE_CLOUD_PROJECT=your-project node scripts/grant-admin.cjs admin@example.com');
 const user=await getAuth().getUserByEmail(email);
 await getAuth().setCustomUserClaims(user.uid,{...user.customClaims,admin:true});
 console.log('Admin role granted. Sign out and sign in again to refresh the claim.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
