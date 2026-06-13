# Web App Load Testing — Offline-First Heavy React SPA

A complete, **offline-first** heavy UI demo with:

- **React 18 + Vite + TypeScript** SPA (port 5173)
- **Fastify** mock API serving JSON fixtures (port 3000)
- **Playwright** E2E tests with strict offline enforcement
- **Locust** load tests with weighted scenarios
- **tmux** orchestration for a 4-pane monitoring dashboard
- **Zero external network traffic** during test execution

## Repository Layout

```
.
├── app/                # Vite + React + TypeScript SPA
│   ├── src/
│   ├── tests/e2e/      # Playwright specs
│   ├── public/
│   ├── vite.config.ts
│   ├── playwright.config.ts
│   └── package.json
├── api/                # Fastify mock backend
│   ├── fixtures/       # JSON fixtures
│   ├── server.ts
│   └── package.json
├── loadtest/
│   ├── locustfile_browser.py     # real-browser SPA load test (Playwright + web-vitals)
│   ├── vendor/web-vitals.iife.js # vendored web-vitals for the browser test
│   └── requirements.txt
├── scripts/
│   ├── wait-for-services.sh
│   ├── tmux-run.sh
│   ├── tmux-stop.sh
│   └── verify-offline.sh
├── .env
├── package.json        # npm workspaces root
└── README.md
```

## One-time setup (online)

```bash
# Install all Node dependencies (root + workspaces)
npm install

# Install Python deps for Locust
pip3 install -r loadtest/requirements.txt

# Install Playwright's Chromium browser
npx --workspace=app playwright install chromium
```

After this point, the project runs **completely offline**.

## Single-command start

```bash
./scripts/tmux-run.sh
```

This creates a 4-pane tmux session:

```
┌────────────────────┬────────────────────┐
│ API Server         │ React SPA          │
├────────────────────┼────────────────────┤
│ Playwright         │ Locust (web UI)    │
└────────────────────┴────────────────────┘
```

- **API** (top-left) — Fastify mock backend on `:3000`
- **SPA** (top-right) — Vite dev server on `:5173`
- **Playwright** (bottom-left) — runs the E2E suite once
- **Locust** (bottom-right) — starts the **web UI** on `http://localhost:8089` and waits for the user to drive the load test from the browser. It does **not** auto-start a headless run.

Both the Playwright and Locust panes **wait for the API and SPA to be healthy** before proceeding.

Open `http://localhost:8089` to start/stop the load test, set user count, spawn rate, and runtime from the form, and watch live charts.

If `tmux` is not installed, the script falls back to a foreground runner that also exposes the Locust web UI.

### Stopping everything

```bash
./scripts/tmux-stop.sh
```

This:

1. Kills the `acme` tmux session (which sends SIGTERM to every pane's child process — the API, SPA, Playwright, Locust).
2. As a safety net, `pkill`s any stray `tsx` / `vite` / `locust` / `playwright` / `chromium` processes and frees the API (`:3000`), SPA (`:5173`), and Locust web UI (`:8089`) ports in case they were launched outside tmux.
3. Prints a final health check so you can see clean state.

Override the session name with `SESSION=foo ./scripts/tmux-stop.sh`. The script is idempotent — running it when nothing is running is a no-op.

## Manual commands

```bash
# Start the API (port 3000)
npm run dev:api

# Start the SPA (port 5173)
npm run dev:app

# Run Playwright E2E
npm run test:e2e

# Run Playwright with the UI runner
npm run test:e2e:ui

# Open the Locust web UI (start/stop tests from the browser)
npm run loadtest:ui:browser   # real-browser SPA test (Playwright) on http://localhost:8089

# Or run a one-shot headless profile (no UI, runs and exits)
npm run loadtest:browser:dev         # 3 users,  1/sec,  1m
npm run loadtest:browser:integration # 8 users,  2/sec,  3m

# The tmux flow always uses the real-browser test in the Locust pane.
./scripts/tmux-run.sh

# Health checks
curl http://localhost:3000/health
curl http://localhost:5173

# Verify there are no external network references in source
npm run verify:offline
```

## Architecture

### Frontend (Vite + React 18)

| Concern             | Library            |
| ------------------- | ------------------ |
| Framework           | React 18           |
| Build tool          | Vite 5             |
| Language            | TypeScript 5       |
| Routing             | React Router 6     |
| Server state        | TanStack Query 5   |
| Client state        | Zustand 4          |
| Forms               | React Hook Form    |
| Validation          | Zod                |
| Styling             | Tailwind CSS 3     |
| Components          | shadcn/ui-style    |
| Animations          | Framer Motion      |
| Icons               | lucide-react       |

### Backend (Fastify)

- Serves JSON fixtures from `api/fixtures/`.
- Endpoints:
  - `GET  /api/dashboard`
  - `GET  /api/users` (q, role, status, plan, limit, offset)
  - `GET  /api/users/:id`
  - `GET  /api/reports` (q, type, status, limit, offset)
  - `GET  /api/reports/:id`
  - `GET  /api/analytics`
  - `GET  /api/settings` / `PUT /api/settings`
  - `POST /api/login` / `POST /api/logout`
  - `GET  /api/profile`
  - `GET  /api/notifications`
  - `GET  /health`

### Vite proxy

The SPA calls `/api/*` and the Vite dev server proxies those calls to `http://localhost:3000`. The production build is fully static and assumes a reverse proxy in front.

### SPA routes

| Route          | Description                                |
| -------------- | ------------------------------------------ |
| `/`            | Home / hub                                 |
| `/dashboard`   | KPIs, revenue chart, channel donut, feeds  |
| `/analytics`   | Time series, channel performance           |
| `/reports`     | Heavy table (search, sort, filter, paging) |
| `/users`       | Heavy table + row actions + modals         |
| `/settings`    | Theme, notifications, privacy, shortcuts   |
| `/profile`     | Form with Zod validation                   |

### Heavy UI features

- Large data tables with **search, sort, filter, pagination, page-size control**
- **Charts** (line, bar, donut) rendered with custom SVG — no chart-library bloat
- **Modal dialogs**, **side drawers**, **tabs**, **toast notifications**
- **Theme switching** (light / dark / system) with `localStorage` persistence
- **Keyboard shortcuts** (`⌘K` opens search)
- **Notification center** with local + server notifications
- **Sidebar** with collapse and mobile drawer

## Offline enforcement

Two layers of offline enforcement:

1. **Source scan** via `scripts/verify-offline.sh` — fails the build if any source file references Google Fonts, CDNs, analytics, etc.
2. **Playwright route blocking** — every test installs a `beforeEach` hook that aborts any request whose URL doesn't start with `http://localhost`, `http://127.0.0.1`, `data:`, or `blob:`.

Forbidden patterns include: `fonts.googleapis.com`, `googletagmanager.com`, `cdn.jsdelivr.net`, `unpkg.com`, `cloudflare.com`, `mixpanel.com`, `hotjar.com`, etc.

## Load testing

> **For a full technical report — what is being measured, how the test works, what it doesn't check, and sample numbers — see [`LOAD_TESTING.md`](./LOAD_TESTING.md).**

The load test is a **real-browser** test. Each Locust user is a headless Chromium that navigates the SPA, waits for the page to be ready, and reports seven Web Vitals (FCP, LCP, TBT, TTFB, CLS, INP) plus a route-aware TTI per page load. Every number in the report corresponds to a metric a real user would perceive, measured by a real browser.

The test exercises all seven SPA routes (`/`, `/dashboard`, `/analytics`, `/reports`, `/users`, `/settings`, `/profile`) and uses the same 40/25/20/10/5/3 weighting as the original product plan (Dashboard / Reports / Analytics / Users / Settings / Profile, plus a small bonus for Home). The dev server is the target.

### Driving the load test

The default flow is to start the Locust web UI and drive the test from the browser:

```bash
./scripts/tmux-run.sh
# Open http://localhost:8089
```

The UI lets you set the number of users, spawn rate, and runtime per run, and shows live charts as the test runs. Multiple runs can be queued; Locust keeps state between them until you kill the server.

For a one-shot headless run without opening a browser (e.g. for CI), the same file is exposed as pre-baked profiles:

```bash
npm run loadtest:browser:dev          # 3 users,  1/sec,  1m
npm run loadtest:browser:integration  # 8 users,  2/sec,  3m
```

Recommended ceiling: **10–20 concurrent users** on a developer machine (each Chromium is ~150–300 MB).

## Success criteria

- [x] React + Vite + TypeScript SPA
- [x] Heavy UI with realistic workflows
- [x] Local Fastify backend
- [x] Fixture-driven responses
- [x] Playwright E2E coverage (smoke, journey, interactions)
- [x] Locust performance testing
- [x] Offline execution — no external network during tests
- [x] One-command startup (`./scripts/tmux-run.sh`)
- [x] Multi-pane tmux monitoring
- [x] Reproducible on developer machines, CI runners, and air-gapped environments
