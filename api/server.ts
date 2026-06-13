import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.API_PORT ?? 3000);
const HOST = process.env.API_HOST ?? '0.0.0.0';
const APP_ORIGIN = process.env.APP_BASE_URL ?? 'http://localhost:5173';

// Simulate non-zero work for realistic load-test timing
const ARTIFICIAL_LATENCY_MS = Number(process.env.API_LATENCY_MS ?? 0);

const fixturesDir = join(__dirname, 'fixtures');

type JsonValue = unknown;

function loadFixture(name: string): JsonValue {
  const path = join(fixturesDir, name);
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

const dashboardFixture = loadFixture('dashboard.json');
const usersFixture = loadFixture('users.json');
const reportsFixture = loadFixture('reports.json');
const analyticsFixture = loadFixture('analytics.json');
const settingsFixture = loadFixture('settings.json');

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l' },
        },
  },
});

await fastify.register(helmet, { contentSecurityPolicy: false });
await fastify.register(cors, {
  origin: [APP_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
});
await fastify.register(sensible);

fastify.addHook('onRequest', async (_req, _reply) => {
  if (ARTIFICIAL_LATENCY_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, ARTIFICIAL_LATENCY_MS));
  }
});

// Health
fastify.get('/health', async () => ({
  status: 'ok',
  service: 'mock-api',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

// Dashboard
fastify.get('/api/dashboard', async () => dashboardFixture);

// Users
fastify.get<{
  Querystring: { q?: string; role?: string; status?: string; plan?: string; limit?: string; offset?: string };
}>('/api/users', async (request) => {
  const { q, role, status, plan, limit, offset } = request.query;
  const allUsers = (usersFixture as { users: Array<Record<string, unknown>> }).users;
  let filtered = allUsers;
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter(
      (u) =>
        String(u.name).toLowerCase().includes(needle) ||
        String(u.email).toLowerCase().includes(needle),
    );
  }
  if (role) filtered = filtered.filter((u) => u.role === role);
  if (status) filtered = filtered.filter((u) => u.status === status);
  if (plan) filtered = filtered.filter((u) => u.plan === plan);

  const total = filtered.length;
  const start = Number(offset ?? 0);
  const end = start + (Number(limit ?? 50));
  const slice = filtered.slice(start, end);
  return { total, users: slice };
});

fastify.get<{ Params: { id: string } }>('/api/users/:id', async (request, reply) => {
  const id = Number(request.params.id);
  const allUsers = (usersFixture as { users: Array<Record<string, unknown>> }).users;
  const user = allUsers.find((u) => Number(u.id) === id);
  if (!user) return reply.notFound('User not found');
  return user;
});

// Reports
fastify.get<{
  Querystring: { q?: string; type?: string; status?: string; limit?: string; offset?: string };
}>('/api/reports', async (request) => {
  const { q, type, status, limit, offset } = request.query;
  const allReports = (reportsFixture as { reports: Array<Record<string, unknown>> }).reports;
  let filtered = allReports;
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        String(r.title).toLowerCase().includes(needle) ||
        String(r.author).toLowerCase().includes(needle),
    );
  }
  if (type) filtered = filtered.filter((r) => r.type === type);
  if (status) filtered = filtered.filter((r) => r.status === status);

  const total = filtered.length;
  const start = Number(offset ?? 0);
  const end = start + (Number(limit ?? 50));
  const slice = filtered.slice(start, end);
  return { total, reports: slice };
});

fastify.get<{ Params: { id: string } }>('/api/reports/:id', async (request, reply) => {
  const id = request.params.id;
  const allReports = (reportsFixture as { reports: Array<Record<string, unknown>> }).reports;
  const report = allReports.find((r) => r.id === id);
  if (!report) return reply.notFound('Report not found');
  return report;
});

// Analytics
fastify.get('/api/analytics', async () => analyticsFixture);

// Settings (GET, PUT)
let currentSettings: JsonValue = structuredClone(settingsFixture);

fastify.get('/api/settings', async () => currentSettings);

fastify.put<{ Body: JsonValue }>('/api/settings', async (request) => {
  currentSettings = { ...(currentSettings as Record<string, unknown>), ...(request.body as Record<string, unknown>) };
  return currentSettings;
});

// Auth (mock)
fastify.post<{ Body: { email?: string; password?: string } }>('/api/login', async (request, reply) => {
  const { email } = request.body ?? {};
  if (!email) return reply.badRequest('Email required');
  return {
    token: 'mock-token-' + Math.random().toString(36).slice(2),
    user: { id: 1, email, name: 'Mock User', role: 'admin' },
  };
});

fastify.post('/api/logout', async () => ({ ok: true }));

// Profile
fastify.get('/api/profile', async () => ({
  id: 1,
  name: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  role: 'admin',
  plan: 'Enterprise',
  memberSince: '2024-03-12T00:00:00Z',
  bio: 'Heavy-UI demo profile. Everything runs locally.',
}));

// Notifications
fastify.get('/api/notifications', async () => [
  { id: 'n-1', type: 'info', title: 'System nominal', body: 'All services healthy.', at: '2026-06-13T09:14:00Z', read: false },
  { id: 'n-2', type: 'warning', title: 'Renewals due', body: '3 enterprise accounts renew in 14 days.', at: '2026-06-13T08:00:00Z', read: false },
  { id: 'n-3', type: 'success', title: 'Deploy complete', body: 'Build #4821 deployed to production.', at: '2026-06-12T20:00:00Z', read: true },
  { id: 'n-4', type: 'info', title: 'New report ready', body: 'Q2 sales pipeline is ready for review.', at: '2026-06-12T15:00:00Z', read: true },
  { id: 'n-5', type: 'warning', title: 'Quota warning', body: 'Analytics usage at 82% of monthly quota.', at: '2026-06-12T11:00:00Z', read: true },
]);

try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`Mock API ready on http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
