import { useEffect, useState } from 'react';
// Install prompt, connectivity and "app updated" signals for the installed PWA.
export function usePwa() {
  const [prompt, setPrompt] = useState(null), [online, setOnline] = useState(() => navigator.onLine), [updated, setUpdated] = useState(false);
  useEffect(() => {
    const onPrompt = event => { event.preventDefault(); setPrompt(event); };
    const onInstalled = () => setPrompt(null), up = () => setOnline(true), down = () => setOnline(false), onUpdate = () => setUpdated(true);
    window.addEventListener('beforeinstallprompt', onPrompt); window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', up); window.addEventListener('offline', down); window.addEventListener('traice:updated', onUpdate);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); window.removeEventListener('online', up); window.removeEventListener('offline', down); window.removeEventListener('traice:updated', onUpdate); };
  }, []);
  async function install() { if (!prompt) return; prompt.prompt(); await prompt.userChoice.catch(() => {}); setPrompt(null); }
  return { canInstall: !!prompt, install, online, updated };
}
