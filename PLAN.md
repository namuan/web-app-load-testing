# Offline-First React SPA + Playwright + Locust Project Plan

## Goal

Build a **heavy UI React SPA** that can be:

* Developed locally
* Tested locally
* Load tested locally
* Run completely offline after dependency installation
* Started with a single command
* Automatically orchestrated through tmux

No external API calls, CDNs, cloud services, analytics, or internet access during test execution.

---

# High-Level Architecture

```text
┌─────────────────────────────────────┐
│ React SPA (Vite + TypeScript)       │
│ localhost:5173                      │
└──────────────┬──────────────────────┘
               │
               │ HTTP
               ▼
┌─────────────────────────────────────┐
│ Mock Backend (Fastify)              │
│ localhost:3000                      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ JSON Fixtures                       │
│ dashboard.json                      │
│ users.json                          │
│ reports.json                        │
│ analytics.json                      │
└─────────────────────────────────────┘

          ▲                    ▲
          │                    │
          │                    │
   Playwright E2E       Locust Load Test
```

Everything runs on localhost.

---

# Technology Stack

## Frontend

| Component         | Choice          |
| ----------------- | --------------- |
| Framework         | React           |
| Build Tool        | Vite            |
| Language          | TypeScript      |
| Routing           | React Router    |
| Data Fetching     | TanStack Query  |
| State Management  | Zustand         |
| Forms             | React Hook Form |
| Validation        | Zod             |
| Styling           | Tailwind CSS    |
| Component Library | shadcn/ui       |
| Animations        | Framer Motion   |

---

## Backend

| Component | Choice         |
| --------- | -------------- |
| Runtime   | Node.js        |
| Framework | Fastify        |
| Storage   | JSON Fixtures  |
| Database  | None initially |

---

## Testing

| Component    | Choice         |
| ------------ | -------------- |
| E2E Testing  | Playwright     |
| Load Testing | Locust         |
| Browser      | Local Chromium |

---

# Repository Layout

```text
project/

├── app/
│   ├── src/
│   │   ├── api/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── routes/
│   │   ├── stores/
│   │   ├── styles/
│   │   └── main.tsx
│   │
│   ├── tests/
│   │   ├── e2e/
│   │   └── fixtures/
│   │
│   ├── vite.config.ts
│   ├── playwright.config.ts
│   └── package.json
│
├── api/
│   ├── fixtures/
│   │   ├── dashboard.json
│   │   ├── users.json
│   │   ├── reports.json
│   │   └── analytics.json
│   │
│   ├── routes/
│   ├── server.ts
│   └── package.json
│
├── loadtest/
│   ├── locustfile.py
│   └── requirements.txt
│
├── scripts/
│   ├── wait-for-services.sh
│   ├── tmux-run.sh
│   └── verify-offline.sh
│
├── .env
├── README.md
└── package.json
```

---

# SPA Structure

## Main Routes

```text
/
├── dashboard
├── analytics
├── reports
├── users
├── settings
└── profile
```

---

## Layout

```text
AppLayout
├── Sidebar
├── Header
├── Notification Center
├── Main Content
└── Footer
```

---

## UI Characteristics

Heavy UI should include:

* Large data tables
* Search
* Filtering
* Sorting
* Pagination
* Charts
* Modal dialogs
* Drawers
* Tabs
* Toast notifications
* Theme switching
* Keyboard shortcuts

---

# State Management

## Zustand

Store only client state:

```text
theme
sidebar
notifications
user preferences
active filters
```

---

## TanStack Query

Store server state:

```text
dashboard
reports
analytics
users
settings
```

---

# Mock Backend

## Fastify Server

Runs locally:

```text
http://localhost:3000
```

---

## Endpoints

```text
GET /api/dashboard
GET /api/users
GET /api/reports
GET /api/analytics

POST /api/login
POST /api/logout

PUT /api/settings
```

---

## Data Source

Fixtures:

```text
api/fixtures/
```

Example:

```json
{
  "totalUsers": 1250,
  "activeUsers": 842,
  "revenue": 120000
}
```

---

# Vite Proxy

Frontend calls:

```text
/api/*
```

Proxy:

```text
localhost:5173
        ↓
localhost:3000
```

This avoids CORS and keeps URLs consistent.

---

# Offline Requirements

## Forbidden

Do not use:

```text
Google Fonts
Cloudflare CDN
FontAwesome CDN
Analytics SDKs
Hotjar
Mixpanel
Segment
Google Analytics
Remote APIs
Remote Images
Remote CSS
Remote JS
```

---

## Allowed

```text
Local fonts
Local SVG icons
Local images
Local API
Local browser
```

---

# Build Validation

Create:

```text
scripts/verify-offline.sh
```

Checks for:

```text
http://
https://
fonts.googleapis.com
googletagmanager.com
cdn
```

Fail build if detected.

---

# Playwright Setup

Install once:

```bash
npx playwright install chromium
```

---

## Playwright Coverage

### Smoke

```text
Homepage loads
Navigation works
Sidebar opens
Theme switch works
```

---

### User Journey

```text
Dashboard
→ Reports
→ Analytics
→ Settings
```

---

### UI Interaction

```text
Filters
Search
Sorting
Pagination
Dialogs
Forms
```

---

## Offline Enforcement

Block all non-localhost traffic.

Example policy:

```text
localhost      → allow
127.0.0.1      → allow
everything else → block
```

This guarantees tests remain offline.

---

# Load Testing

## Locust Target

Primary target:

```text
http://localhost:3000
```

Testing APIs is more meaningful than testing static assets.

---

## Load Profiles

### Development

```text
Users: 10
Ramp: 2/sec
Duration: 2 min
```

---

### Integration

```text
Users: 50
Ramp: 5/sec
Duration: 5 min
```

---

### Stress

```text
Users: 250
Ramp: 25/sec
Duration: 10 min
```

---

### Soak

```text
Users: 100
Ramp: 5/sec
Duration: 1 hour
```

---

## Scenarios

Weighted requests:

```text
Dashboard 40%
Reports 25%
Analytics 20%
Users 10%
Settings 5%
```

---

# Startup Workflow

Services:

1. Fastify API
2. Vite SPA
3. Playwright
4. Locust

---

# Health Checks

Before tests:

```bash
curl localhost:3000/health
curl localhost:5173
```

Proceed only when both respond.

---

# TMUX Layout

```text
┌────────────────────┬────────────────────┐
│ API Server         │ React SPA          │
├────────────────────┼────────────────────┤
│ Playwright         │ Locust             │
└────────────────────┴────────────────────┘
```

---

# tmux-run.sh Flow

## Pane 1

```bash
cd api
npm run dev
```

---

## Pane 2

```bash
cd app
npm run dev
```

---

## Pane 3

Wait until services are healthy.

Then:

```bash
npm run test:e2e
```

---

## Pane 4

Wait until services are healthy.

Then:

```bash
locust \
  -f loadtest/locustfile.py \
  --host=http://localhost:3000 \
  --headless \
  -u 100 \
  -r 10 \
  -t 10m
```

---

# Single Command

User runs:

```bash
./scripts/tmux-run.sh
```

Result:

```text
✓ API starts
✓ SPA starts
✓ Health checks pass
✓ Playwright runs
✓ Locust runs
✓ TMUX attaches
```

No manual steps.

---

# Dependency Preparation (One-Time Online Step)

Before entering an offline environment:

```bash
npm ci
cd api && npm ci

pip install -r loadtest/requirements.txt

npx playwright install chromium
```

Optional:

```bash
npm cache verify
```

or maintain a local package mirror.

---

# Success Criteria

A successful implementation should provide:

* React + Vite + TypeScript SPA
* Heavy UI with realistic workflows
* Local Fastify backend
* Fixture-driven responses
* Playwright E2E coverage
* Locust performance testing
* Offline execution
* Zero external network traffic during tests
* One-command startup
* Multi-pane tmux monitoring
* Reproducible execution on developer machines, CI runners, containers, and air-gapped environments.
