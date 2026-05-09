import { useEffect, useRef, useState } from 'react';
import { createInitialWorld } from '@aof/shared';
import { GameCanvas } from './components/GameCanvas.js';
import { SignInButton } from './components/SignInButton.js';
import { UserBadge } from './components/UserBadge.js';
import { BuildMenu } from './components/BuildMenu.js';
import { TickOverlay } from './components/TickOverlay.js';
import { FactoryInfoPanel } from './components/FactoryInfoPanel.js';
import { WorkersPanel } from './components/WorkersPanel.js';
import { useAuthStore } from './state/authStore.js';
import { useGameStore } from './state/gameStore.js';
import { WsClient } from './net/ws.js';
import { devLogin } from './net/api.js';
import { startSimLoop } from './sim/loop.js';
import { startSaveLoop } from './sim/saveLoop.js';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

const RECONNECT_DELAY_MS = 2000;

export function App() {
  const status = useAuthStore((s) => s.status);
  const token = useAuthStore((s) => s.token);
  const error = useAuthStore((s) => s.error);
  const signOut = useAuthStore((s) => s.signOut);
  const setSigningIn = useAuthStore((s) => s.setSigningIn);
  const setSignedIn = useAuthStore((s) => s.setSignedIn);
  const setError = useAuthStore((s) => s.setError);
  const resetWorld = useGameStore((s) => s.resetWorld);

  const [conn, setConn] = useState<ConnectionStatus>('disconnected');

  const autoSignedInRef = useRef(false);
  useEffect(() => {
    if (autoSignedInRef.current) return;
    if (status !== 'signed-out') return;
    autoSignedInRef.current = true;
    setSigningIn();
    devLogin('Local Dev')
      .then(({ token: t, user }) => setSignedIn(t, user))
      .catch((err) => setError(err instanceof Error ? err.message : 'auto sign-in failed'));
  }, [status, setSigningIn, setSignedIn, setError]);

  useEffect(() => {
    if (status !== 'signed-in' || !token) return;

    let cancelled = false;
    let wsClient: WsClient | null = null;
    let reconnectTimer: number | null = null;
    let stopSim: (() => void) | null = null;
    let stopSave: (() => void) | null = null;

    const connect = () => {
      if (cancelled) return;
      setConn('connecting');
      const client = new WsClient();
      wsClient = client;
      client.connect(token, {
        onAuthOk: (_user, save) => {
          if (cancelled) return;
          useGameStore.getState().setWorld(save?.state ?? createInitialWorld());
          if (save) useGameStore.getState().markSaved(save.updatedAt);
          stopSim?.();
          stopSave?.();
          stopSim = startSimLoop();
          stopSave = startSaveLoop(client);
          setConn('connected');
        },
        onSaveOk: (ts) => useGameStore.getState().markSaved(ts),
        onError: (msg) => {
          console.error('ws error:', msg);
          if (msg.includes('not authenticated') || msg.includes('invalid')) {
            signOut();
          }
        },
        onClose: () => {
          stopSim?.();
          stopSave?.();
          stopSim = null;
          stopSave = null;
          if (cancelled) return;
          setConn('disconnected');
          reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
        },
      });
    };
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      stopSim?.();
      stopSave?.();
      wsClient?.close();
    };
  }, [status, token, signOut]);

  const onResetWorld = () => {
    if (window.confirm('Reset the world? Everything you built will be wiped.')) {
      resetWorld();
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Age of Factories</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          <ConnectionBadge status={conn} />
          {status === 'signed-in' && (
            <button
              type="button"
              onClick={onResetWorld}
              title="Wipe the current world and start a new one"
              style={{
                padding: '0.3rem 0.6rem',
                background: '#3a1a1a',
                color: '#ffb3b3',
                border: '1px solid #5a2a2a',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Reset world
            </button>
          )}
          {status === 'signed-in' ? <UserBadge /> : <SignInButton />}
        </div>
      </header>
      {error && (
        <div
          style={{
            background: '#3a1a1a',
            color: '#ffb3b3',
            padding: '0.4rem 1rem',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
      <main className="app-main">
        <TickOverlay />
        <WorkersPanel />
        <BuildMenu />
        <FactoryInfoPanel />
        <GameCanvas />
      </main>
    </div>
  );
}

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const palette: Record<ConnectionStatus, { dot: string; label: string; text: string }> = {
    connected: { dot: '#5fb86a', label: 'connected', text: '#9ad9a4' },
    connecting: { dot: '#e0c060', label: 'connecting…', text: '#e0c060' },
    disconnected: { dot: '#c56a6a', label: 'disconnected — retrying…', text: '#e09a9a' },
  };
  const p = palette[status];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: p.text }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: p.dot,
          display: 'inline-block',
        }}
      />
      {p.label}
    </div>
  );
}
