import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

interface AuthState {
  status: 'signed-out' | 'signing-in' | 'signed-in';
  token: string | null;
  user: AuthUser | null;
  error: string | null;
  setSigningIn: () => void;
  setSignedIn: (token: string, user: AuthUser) => void;
  setError: (error: string) => void;
  signOut: () => void;
}

const TOKEN_KEY = 'aof.token';
const USER_KEY = 'aof.user';

const initial = ((): { status: 'signed-in'; token: string; user: AuthUser } | { status: 'signed-out'; token: null; user: null } => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const userJson = localStorage.getItem(USER_KEY);
    if (token && userJson) {
      return { status: 'signed-in', token, user: JSON.parse(userJson) as AuthUser };
    }
  } catch {
    // fall through
  }
  return { status: 'signed-out', token: null, user: null };
})();

export const useAuthStore = create<AuthState>((set) => ({
  ...initial,
  error: null,
  setSigningIn: () => set({ status: 'signing-in', error: null }),
  setSignedIn: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ status: 'signed-in', token, user, error: null });
  },
  setError: (error) => set({ status: 'signed-out', error, token: null, user: null }),
  signOut: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ status: 'signed-out', token: null, user: null, error: null });
  },
}));
