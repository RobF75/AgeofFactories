import { useEffect, useState } from 'react';
import { useAuthStore } from '../state/authStore.js';
import { useGameStore } from '../state/gameStore.js';

export function UserBadge() {
  const { user, signOut } = useAuthStore();
  const lastSavedAt = useGameStore((s) => s.lastSavedAt);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!user) return null;
  const savedLabel = lastSavedAt ? `saved ${Math.round((now - lastSavedAt) / 1000)}s ago` : 'unsaved';

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
      <span>{user.displayName ?? user.email}</span>
      <span style={{ color: '#7a8294' }}>{savedLabel}</span>
      <button
        type="button"
        onClick={signOut}
        style={{
          padding: '0.3rem 0.6rem',
          background: '#2a3042',
          color: '#e6e6e6',
          border: '1px solid #3a4258',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </div>
  );
}
