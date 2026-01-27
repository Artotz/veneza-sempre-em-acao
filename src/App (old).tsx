// src/App.tsx
import { useEffect, useState } from "react";

export default function App() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const log = () => {
      if (window.matchMedia("(display-mode: standalone)").matches) {
        console.log("PWA em standalone");
      } else if ((navigator as any).standalone) {
        console.log("PWA em standalone (iOS legacy)");
      } else {
        console.log("Rodando no navegador");
      }
    };
    log();
    window.addEventListener("visibilitychange", log);
    return () => window.removeEventListener("visibilitychange", log);
  }, []);

  const onInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setCanInstall(false);
    console.log("Install outcome:", outcome);
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/70 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <h1 className="text-xl font-semibold tracking-tight">My PWA</h1>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-border p-6 shadow-lg">
          <h2 className="text-lg font-medium">React + Tailwind + PWA</h2>
          <p className="mt-2 text-foreground-muted">
            Instalável, com cache offline e atualização automática via Workbox.
            Rode um build e teste no Lighthouse.
          </p>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => location.reload()}
              className="rounded-2xl border border-border-strong px-4 py-2 hover:bg-surface"
            >
              Simular atualização
            </button>

            {canInstall && (
              <button
                onClick={onInstall}
                className="rounded-2xl bg-brand px-4 py-2 font-medium text-contrast hover:bg-brand-strong"
              >
                Instalar
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

