import { useState } from 'react';
import { Icon } from './Icons';

// A captain's team login, shown once: copy it, download it, or print it.
export function loginText(login, teamLabel = 'your team') {
  return `Triace team login for ${teamLabel}\nUsername: ${login.username}\nPassword: ${login.password}\nSign in at ${window.location.origin}/captain to submit scores and manage your team.\n`;
}
export default function LoginCard({ login, teamLabel, title = 'Your team login' }) {
  const [copied, setCopied] = useState('');
  async function copy(label, text) { try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(''), 2000); } catch { setCopied('Copy failed. Select the text instead.'); } }
  function download() {
    const url = URL.createObjectURL(new Blob([loginText(login, teamLabel)], { type: 'text/plain' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'triace-team-login.txt' });
    link.click(); URL.revokeObjectURL(url);
  }
  return (
    <div className="credential-card" role="group" aria-label={title}>
      <p className="eyebrow">{title}</p>
      <dl>
        <div><dt>Username</dt><dd><output className="mono" aria-label="Username">{login.username}</output><button type="button" className="secondary small" onClick={() => copy('Username copied', login.username)}>Copy</button></dd></div>
        <div><dt>Password</dt><dd><output className="mono password" aria-label="Password">{login.password}</output><button type="button" className="secondary small" onClick={() => copy('Password copied', login.password)}>Copy</button></dd></div>
      </dl>
      <p className="small pattern-note"><b>How it’s built:</b> username = first 4 letters of your first name + first 3 letters of Ace 2’s name. Password = first 3 letters of your last name + first 3 letters of your first name + 4 digits.</p>
      <div className="credential-actions">
        <button type="button" className="secondary small" onClick={() => copy('Username and password copied', loginText(login, teamLabel))}><Icon name="copy" size={16} /> Copy both</button>
        <button type="button" className="secondary small" onClick={download}><Icon name="download" size={16} /> Download</button>
        <button type="button" className="secondary small" onClick={() => window.print()}>Print</button>
      </div>
      <p className="small" role="status">{copied || 'Save it now. If it’s lost, the admin can reset it.'}</p>
    </div>
  );
}
