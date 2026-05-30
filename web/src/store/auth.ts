import { create } from 'zustand';
import { api, setToken } from '../api/client';

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
  logout() {
    setToken(null);
    localStorage.removeItem('pos_user');
    set({ user: null });
  },
  async restore() {
    if (!localStorage.getItem('pos_token')) return;
    try {
      const res = await api<{ user: User }>('/auth/me');
      set({ user: res.user });
    } catch {
      setToken(null);
      localStorage.removeItem('pos_user');
      set({ user: null });
    }
  },
}));

export const isBackStore = (role?: Role) => role === 'ADMIN' || role === 'MANAGER';
