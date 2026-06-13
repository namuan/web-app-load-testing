import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  resolved: () => 'light' | 'dark';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      toggle: () => {
        const current = get().resolved();
        set({ theme: current === 'dark' ? 'light' : 'dark' });
      },
      resolved: () => {
        if (typeof window === 'undefined') return 'light';
        if (get().theme !== 'system') return get().theme as 'light' | 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      },
    }),
    { name: 'theme' },
  ),
);

interface SidebarState {
  collapsed: boolean;
  mobileOpen: boolean;
  toggleCollapsed: () => void;
  setMobileOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  mobileOpen: false,
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setMobileOpen: (open) => set({ mobileOpen: open }),
}));

export interface UINotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body?: string;
  at: number;
  read: boolean;
}

interface NotificationState {
  items: UINotification[];
  unreadCount: () => number;
  push: (n: Omit<UINotification, 'id' | 'at' | 'read'>) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unreadCount: () => get().items.filter((n) => !n.read).length,
  push: (n) =>
    set((state) => ({
      items: [
        { ...n, id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), read: false },
        ...state.items,
      ].slice(0, 100),
    })),
  markAllRead: () => set((state) => ({ items: state.items.map((n) => ({ ...n, read: true })) })),
  markRead: (id) =>
    set((state) => ({ items: state.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
  clear: () => set({ items: [] }),
}));

interface FilterState {
  users: { q: string; role: string; status: string; plan: string };
  reports: { q: string; type: string; status: string };
  setUsers: (partial: Partial<FilterState['users']>) => void;
  setReports: (partial: Partial<FilterState['reports']>) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  users: { q: '', role: '', status: '', plan: '' },
  reports: { q: '', type: '', status: '' },
  setUsers: (partial) => set((s) => ({ users: { ...s.users, ...partial } })),
  setReports: (partial) => set((s) => ({ reports: { ...s.reports, ...partial } })),
  reset: () => set({ users: { q: '', role: '', status: '', plan: '' }, reports: { q: '', type: '', status: '' } }),
}));

interface AuthState {
  user: { id: number; email: string; name: string; role: string } | null;
  token: string | null;
  login: (user: AuthState['user'], token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: { id: 1, email: 'alex.morgan@example.com', name: 'Alex Morgan', role: 'admin' },
      token: 'mock-token-seed',
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
    }),
    { name: 'auth' },
  ),
);
