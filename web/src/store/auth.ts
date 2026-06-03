import { create } from 'zustand';
import { api, setToken } from '../api/client';
import { isNetworkError } from './offline';

export type Role = 'ADMIN' | 'MANAGER' | 'CASHIER';
export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithPin: (pin: string) => Promise<void>;
  logout: () => void;
  restore: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('pos_user') || 'null'),
  loading: false,
  async login(username, password) {
    set({ loading: true });
    try {
      const res = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      setToken(res.token);
      localStorage.setItem('pos_user', JSON.stringify(res.user));
      set({ user: res.user });
    } finally {
      set({ loading: false });
    }
  },
  async loginWithPin(pin) {
    const res = await api<{ token: string; user: User }>('/auth/pin', { method: 'POST', body: { pin } });
    setToken(res.token);
    localStorage.setItem('pos_user', JSON.stringify(res.user));
    set({ user: res.user });
  },
  logout() {
    setToken(null);
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_shift');
    set({ user: null });
  },
  async restore() {
    if (!localStorage.getItem('pos_token')) return;
    const cached = JSON.parse(localStorage.getItem('pos_user') || 'null') as User | null;
    try {
      const res = await api<{ user: User }>('/auth/me');
      set({ user: res.user });
    } catch (e) {
      // Offline (e.g. a cold reload during an outage): trust the cached user so the POS
      // stays usable. Only a real auth rejection (online 401) clears the session.
      if (isNetworkError(e) && cached) { set({ user: cached }); return; }
      setToken(null);
      localStorage.removeItem('pos_user');
      set({ user: null });
    }
  },
}));

export const isBackStore = (role?: Role) => role === 'ADMIN' || role === 'MANAGER';
