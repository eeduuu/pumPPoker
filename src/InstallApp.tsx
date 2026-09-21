import { useEffect, useState } from 'react';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [help, setHelp] = useState(false);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); setHelp(false); };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', complete);
    return () => {
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', complete);
    };
  }, []);

  const install = async () => {
    if (!prompt) { setHelp(value => !value); return; }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  };

  if (installed) return <div className="install-card installed" aria-label="Aplicación instalada"><span aria-hidden="true">✓</span><strong>App instalada</strong></div>;
  return <div className="install-wrap">
    <button className="install-card" type="button" onClick={install}><span aria-hidden="true">↓</span><span><strong>Instalar en el móvil</strong><small>Juega desde tu icono, a pantalla completa</small></span></button>
    {help && <p className="install-help" role="status">{isIos ? 'En Safari: Compartir → Añadir a pantalla de inicio.' : 'Abre el menú del navegador y elige “Instalar aplicación” o “Añadir a pantalla de inicio”.'}</p>}
  </div>;
}
