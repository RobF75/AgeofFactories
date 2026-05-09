import { useState } from 'react';
import { useAuthStore } from '../state/authStore.js';
import { devLogin } from '../net/api.js';

export function SignInButton() {
  const { status, setSigningIn, setSignedIn, setError } = useAuthStore();
  const [name, setName] = useState('Dev Player');

  const onSignIn = async () => {
    setSigningIn();
    try {
      const { token, user } = await devLogin(name);
      setSignedIn(token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sign-in failed');
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        style={{
          padding: '0.35rem 0.5rem',
          background: '#1a1f2c',
          color: '#e6e6e6',
          border: '1px solid #2c3344',
          borderRadius: 4,
        }}
      />
      <button
        type="button"
        onClick={onSignIn}
        disabled={status === 'signing-in'}
        style={{
          padding: '0.4rem 0.8rem',
          background: '#2a3042',
          color: '#e6e6e6',
          border: '1px solid #3a4258',
          borderRadius: 4,
          cursor: status === 'signing-in' ? 'wait' : 'pointer',
        }}
      >
        {status === 'signing-in' ? 'Signing in…' : 'Dev sign in'}
      </button>
    </div>
  );
}
