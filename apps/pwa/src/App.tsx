import React, { useEffect, useState } from 'react';
import { processUploadQueue } from './store/uploadQueue';
import { migrateLegacyEvidenceKeys } from './store/evidenceStore';
import { useMediaQuery } from './hooks/useMediaQuery';
import { DesktopScreen } from './screens/DesktopScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CaptureScreen } from './screens/CaptureScreen';
import { TacticalCommsScreen } from './screens/TacticalCommsScreen';
import { SignalScreen } from './screens/SignalScreen';
import { TacticalVaultScreen } from './screens/TacticalVaultScreen';
import { TacticalMapScreen } from './screens/TacticalMapScreen';
import { PurgeScreen } from './screens/PurgeScreen';
import { DecoyScreen } from './screens/DecoyScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { EvidenceScreen } from './screens/EvidenceScreen';
import { storageGet, storageSet, storageRemove } from './utils/safeStorage';

export type MobileTab = 'home' | 'comms' | 'signal' | 'vault' | 'map' | 'capture' | 'settings' | 'evidence';

/** Returns the stored 4-digit PIN, creating one if it doesn't exist yet. */
function getOrCreatePin(): string {
  let pin = storageGet('witness_pin');
  if (!pin || pin.length !== 4) {
    pin = String(Math.floor(1000 + Math.random() * 9000));
    storageSet('witness_pin', pin);
  }
  return pin;
}

export function App() {
  const [tab, setTab] = useState<MobileTab>('home');
  const [showPurge, setShowPurge] = useState(false);
  // Persist decoy mode across reloads — once purged the app stays as a calculator
  const [decoyMode, setDecoyMode] = useState(() => storageGet('witness_decoy') === '1');
  const [pin] = useState(getOrCreatePin);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Drain the upload queue on startup, on connectivity restore, and when
  // the service worker background-sync fires a WITNESS_SYNC_UPLOAD message.
  useEffect(() => {
    // Phase 2B: seal any legacy raw evidence keys before anything else runs.
    migrateLegacyEvidenceKeys().catch(() => {});
    processUploadQueue().catch(() => {});

    const onOnline = () => processUploadQueue().catch(() => {});
    window.addEventListener('online', onOnline);

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'WITNESS_SYNC_UPLOAD') {
        processUploadQueue().catch(() => {});
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    return () => {
      window.removeEventListener('online', onOnline);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, []);

  function deactivateDecoy() {
    storageRemove('witness_decoy');
    setDecoyMode(false);
  }

  if (isDesktop) return <DesktopScreen />;

  // After purge: show decoy calculator. Typing the 4-digit PIN unlocks the app.
  if (decoyMode) {
    return <DecoyScreen pin={pin} onUnlock={deactivateDecoy} />;
  }

  return (
    <div className="flex flex-col h-dvh bg-[#0d0d0d] text-white overflow-hidden font-sentry">
      {/* Screen content */}
      <main className="flex-1 overflow-hidden relative">
        {tab === 'home'    && <HomeScreen onNavigate={setTab} onPurge={() => setShowPurge(true)} />}
        {tab === 'capture' && <CaptureScreen onSaved={() => setTab('evidence')} />}
        {tab === 'comms'   && <TacticalCommsScreen />}
        {tab === 'signal'  && <SignalScreen />}
        {tab === 'vault'   && <TacticalVaultScreen />}
        {tab === 'map'     && <TacticalMapScreen />}
        {tab === 'settings' && <SettingsScreen pin={pin} onPurge={() => setShowPurge(true)} />}
        {tab === 'evidence' && <EvidenceScreen />}

        {/* Purge modal (absolute overlay) */}
        {showPurge && (
          <PurgeScreen
            pin={pin}
            onClose={() => setShowPurge(false)}
            onActivateDecoy={() => {
              storageSet('witness_decoy', '1');
              setShowPurge(false);
              setDecoyMode(true);
            }}
          />
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="flex bg-[#0a0a0a] border-t border-[#1a1a1a] h-[60px] shrink-0">
        <NavBtn id="home"   label="HOME"   active={tab === 'home'}   onClick={() => setTab('home')}>
          <HomeIcon />
        </NavBtn>
        <NavBtn id="comms"  label="COMMS"  active={tab === 'comms'}  onClick={() => setTab('comms')}>
          <CommsIcon />
        </NavBtn>
        <NavBtn id="signal" label="SIGNAL" active={tab === 'signal'} onClick={() => setTab('signal')}>
          <SignalIcon />
        </NavBtn>
        <NavBtn id="vault"  label="VAULT"  active={tab === 'vault'}  onClick={() => setTab('vault')}>
          <VaultIcon />
        </NavBtn>
        <NavBtn id="map"    label="MAP"    active={tab === 'map'}    onClick={() => setTab('map')}>
          <MapNavIcon />
        </NavBtn>
        {/* Purge shortcut */}
        <NavBtn id="purge" label="PURGE" active={false} onClick={() => setShowPurge(true)} danger>
          <PurgeIcon />
        </NavBtn>
      </nav>
    </div>
  );
}

function NavBtn({ id, label, active, danger, onClick, children }: {
  id: string; label: string; active: boolean; danger?: boolean;
  onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      key={id}
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
        danger
          ? 'text-[#cc4444] hover:text-[#dd5555]'
          : active
          ? 'text-[#00ff33]'
          : 'text-[#444] hover:text-gray-400'
      }`}
    >
      {active && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#00ff33]"/>
      )}
      <div className="w-5 h-5">{children}</div>
      <span className={`text-[8px] font-bold tracking-[0.12em] ${
        danger ? 'text-[#cc4444]' : active ? 'text-[#00ff33]' : 'text-[#444]'
      }`}>{label}</span>
    </button>
  );
}

/* ─── Nav Icons ─── */
function HomeIcon() {
  return <svg fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>;
}
function CommsIcon() {
  return <svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>;
}
function SignalIcon() {
  return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>;
}
function VaultIcon() {
  return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>;
}
function MapNavIcon() {
  return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>;
}
function PurgeIcon() {
  return <svg fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm3.46-7.12l1.41-1.41L12 11.59l1.12-1.12 1.41 1.41L13.41 13l1.12 1.12-1.41 1.41L12 14.41l-1.12 1.12-1.41-1.41L10.59 13l-1.13-1.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/></svg>;
}
