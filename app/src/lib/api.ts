const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface DashboardData {
  kpis: {
    totalUsers: number;
    activeUsers: number;
    revenue: number;
    conversionRate: number;
    averageOrderValue: number;
    churnRate: number;
  };
  growth: Record<string, number>;
  recentActivity: Array<{
    id: number;
    type: string;
    user: string;
    amount?: number;
    at: string;
  }>;
  topProducts: Array<{ id: string; name: string; units: number; revenue: number }>;
  systemHealth: {
    api: string;
    web: string;
    db: string;
    cdn: string;
    lastIncident: string;
  };
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  lastSeen: string;
  plan: string;
}

export interface Report {
  id: string;
  title: string;
  type: string;
  status: string;
  author: string;
  createdAt: string;
  rows: number;
  size: string;
}

export interface AnalyticsData {
  summary: {
    pageViews: number;
    sessions: number;
    bounceRate: number;
    avgSessionDurationSec: number;
  };
  timeseries: Array<{
    date: string;
    pageViews: number;
    sessions: number;
    signups: number;
    revenue: number;
  }>;
  channels: Array<{ name: string; sessions: number; conversions: number; sharePct: number }>;
}

export interface AppNotification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  body: string;
  at: string;
  read: boolean;
}

export interface Profile {
  id: number;
  name: string;
  email: string;
  role: string;
  plan: string;
  memberSince: string;
  bio: string;
}

export const api = {
  health: () => request<{ status: string; service: string; uptime: number; timestamp: string }>('/../health'),

  getDashboard: () => request<DashboardData>('/dashboard'),
  getUsers: (params: { q?: string; role?: string; status?: string; plan?: string; limit?: number; offset?: number } = {}) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') sp.set(k, String(v));
    });
    const qs = sp.toString();
    return request<{ total: number; users: User[] }>(`/users${qs ? `?${qs}` : ''}`);
  },
  getUser: (id: number) => request<User>(`/users/${id}`),

  getReports: (params: { q?: string; type?: string; status?: string; limit?: number; offset?: number } = {}) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') sp.set(k, String(v));
    });
    const qs = sp.toString();
    return request<{ total: number; reports: Report[] }>(`/reports${qs ? `?${qs}` : ''}`);
  },
  getReport: (id: string) => request<Report>(`/reports/${id}`),

  getAnalytics: () => request<AnalyticsData>('/analytics'),

  getSettings: () => request<Record<string, unknown>>('/settings'),
  putSettings: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/settings', { method: 'PUT', body: JSON.stringify(body) }),

  login: (email: string, password: string) =>
    request<{ token: string; user: { id: number; email: string; name: string; role: string } }>(
      '/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    ),
  logout: () => request<{ ok: boolean }>('/logout', { method: 'POST' }),

  getProfile: () => request<Profile>('/profile'),
  getNotifications: () => request<AppNotification[]>('/notifications'),
};
