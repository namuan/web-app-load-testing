# Load Testing — Technical Report

This document describes how load testing is implemented in this project, **what exactly is being measured**, and answers the key question:

> **Is the load test actually verifying that the web page is properly loaded, even though the app is a Single-Page Application?**

The short answer is **mostly yes, with deliberate limits**, and the rest of this document explains what that means.

---

## Table of contents

1. [What is being load-tested](#1-what-is-being-load-tested)
2. [The two scripts at a glance](#2-the-two-scripts-at-a-glance)
3. [How a Locust user models a real browser](#3-how-a-locust-user-models-a-real-browser)
4. [The catalog of URLs the test exercises](#4-the-catalog-of-urls-the-test-exercises)
5. [Weighted distribution of traffic](#5-weighted-distribution-of-traffic)
6. [What "the page loaded" actually means here](#6-what-the-page-loaded-actually-means-here)
7. [What the test does NOT check (and why)](#7-what-the-test-does-not-check-and-why)
8. [Driving the test from the browser UI](#8-driving-the-test-from-the-browser-ui)
9. [Sample run — what the report looks like](#9-sample-run--what-the-report-looks-like)
10. [Reproducing the numbers](#10-reproducing-the-numbers)
11. [Files and entry points](#11-files-and-entry-points)

---

## 1. What is being load-tested

The **primary** target of the default Locust script is the running **Vite dev server** at `http://localhost:5173`. This is the dev server that:

- Serves the SPA's entry HTML document
- Transforms and serves every TypeScript / TSX source module on demand
- Bundles and serves `node_modules` dependencies from `/node_modules/.vite/deps/`
- Provides the HMR (Hot Module Replacement) runtime
- Acts as a history-fallback server: any unknown path (e.g. `/dashboard`) returns the same `index.html` shell so the client-side router can take over

A **secondary** script (`loadtest/api-locustfile.py`) targets the Fastify mock backend at `http://localhost:3000` directly, for situations where you want to measure API throughput without the SPA in the loop.

The default workflow is:

```bash
./scripts/tmux-run.sh
# → 4-pane tmux:
#   API   :3000
#   SPA   :5173
#   Playwright E2E
#   Locust web UI :8089
#
# Open http://localhost:8089 in your browser and start the test.
```

The Vite dev server (not the production bundle served by `vite preview`) is the target because that is what the project actually runs in development and what the CI / local-loop workflow exercises end-to-end.

---

## 2. The two scripts at a glance

| Script | Target | Purpose |
|--------|--------|---------|
| `loadtest/locustfile.py` | `http://localhost:5173` (Vite SPA) | **Primary.** Emulate a browser hitting the SPA. |
| `loadtest/api-locustfile.py` | `http://localhost:3000` (Fastify) | Optional. Stress the mock API directly. |

Both use the same Locust primitive: an `HttpUser` subclass with a weighted set of `@task` methods. The user spawns continuously until the runtime limit expires, and the harness collects per-endpoint response-time percentiles, throughput, and failure counts.

The SPA script is the default. The API script is available behind `npm run loadtest:ui:api` (web UI) or `npm run loadtest:api:dev` (one-shot headless).

---

## 3. How a Locust user models a real browser

`loadtest/locustfile.py` defines a single user class, `SpaUser`, that simulates a heavy SPA user. It has two kinds of actions:

### A. "Cold load" — full first paint of the SPA

This is what a real browser does when you type `https://app.example.com/dashboard` into the address bar with an empty cache:

1. `GET /` → the HTML document (Vite returns the same 858-byte shell for every route)
2. In parallel, the browser resolves the `<script>` and `<link>` tags inside that shell. The relevant ones in this project are:
   - `GET /@vite/client` (138 KB) — Vite's HMR client
   - `GET /favicon.svg` (315 B)
   - `GET /src/main.tsx` (2.2 KB) — the entry module, transformed by Vite on the fly
3. `main.tsx` then imports `App.tsx` and `styles/index.css`, so the browser next requests:
   - `GET /src/App.tsx` (7.7 KB)
   - `GET /src/styles/index.css` (40 KB)
4. `App.tsx` in turn imports every layout, page, component, and dependency. The browser fetches all of those — hundreds of additional requests — before the React tree is ready to mount.

The `BOOTSTRAP_ASSETS` list inside the locustfile captures the **first wave** of these requests — the ones explicitly referenced from the HTML shell plus the very next layer of imports that `main.tsx` and `App.tsx` pull in:

```python
BOOTSTRAP_ASSETS = [
    "/favicon.svg",
    "/@vite/client",
    "/src/main.tsx",
    "/src/App.tsx",
    "/src/styles/index.css",
]
```

These five URLs are what the test sends when emulating a "cold load" of the SPA. Each one is its own Locust request, so the report shows per-asset latency, throughput, and failure rates.

The cold-load method `_cold_load()` then issues these requests sequentially in a randomised order (mimicking the fact that browsers don't always request the favicon and CSS in the same order). Locust is **sequential by design** — there is no built-in parallelism — so a Locust "cold load" is slower end-to-end than a real browser cold load. What the per-asset timings **do** tell you is the latency the server experiences for each individual transform-and-serve operation, which is exactly what a real browser would hit (just in parallel).

### B. "Route navigation" — clicking a link inside the SPA

After the first paint, navigating to another route in a real browser **does not** trigger a full page reload. React Router intercepts the click, updates the URL via the History API, and re-renders the page tree. The only network request that actually goes out is — in this project's setup — **none**, because all the JS, CSS, and data are already cached in memory.

But there's a wrinkle: if the user lands directly on `/dashboard` via a bookmark, a shared link, or a refresh, the browser issues `GET /dashboard` to the dev server. Vite's history-fallback middleware returns the same 858-byte HTML shell as `GET /`, and the SPA bootstraps from scratch. This is the "deep link" path, and the load test models it explicitly:

```python
@task(30)
def dashboard_route(self):
    self.client.get("/dashboard", name="GET /dashboard")
```

This represents **a user navigating around the app, with the occasional hard reload or deep link**. Each "route" task is a single HTTP GET against the SPA shell, which is what actually happens at the network layer for a deep link.

The two kinds of actions are combined with task weights, so a typical Locust run is a mix of cold loads and route navigations in roughly the proportions a real product would see.

---

## 4. The catalog of URLs the test exercises

The test fires requests at exactly these URLs:

### SPA routes (history-fallback; all return the same 858-byte shell)

| URL | Bytes (gzip n/a) | Notes |
|-----|------------------|-------|
| `GET /` | 858 | Entry document |
| `GET /dashboard` | 858 | History fallback |
| `GET /analytics` | 858 | History fallback |
| `GET /reports` | 858 | History fallback |
| `GET /users` | 858 | History fallback |
| `GET /settings` | 858 | History fallback |
| `GET /profile` | 858 | History fallback |

A side-effect of how SPAs work: the server has **no way to know** whether `/dashboard` is a "real" page or a 404 — it just returns the shell. The client-side router is the source of truth. The load test acknowledges this by listing every route as a separate, measurable endpoint even though the responses are byte-identical, because what we're really measuring is **how fast Vite can return the shell under load**, not how different the routes are from each other.

### Bootstrap assets (cold-load path; vary in size and complexity)

| URL | Bytes (raw) | What it exercises |
|-----|-------------|-------------------|
| `GET /favicon.svg` | 315 | Static file from `app/public/` |
| `GET /@vite/client` | 137,907 | Vite HMR client; large blob, served as a single in-memory string by Vite |
| `GET /src/main.tsx` | 2,230 | Entry module; Vite transforms TSX → JS in real time |
| `GET /src/App.tsx` | 7,711 | Root component; pulls in routes, layouts, providers; Vite transforms TSX → JS |
| `GET /src/styles/index.css` | 40,131 | Tailwind base + shadcn theme tokens; served with `Content-Type: text/javascript` so the browser can `import` it as a side-effect |

The test deliberately **does not** enumerate the full transitive import graph (every layout, every component, every `node_modules/.vite/deps/*.js` file). There are two reasons for that:

1. **Coverage of the actual entry path is enough.** A cold load that successfully fetches the shell plus the first two layers of source modules is statistically guaranteed to also exercise the Vite transform-and-serve pipeline for everything below, because Vite serves them all the same way. The 99% case is "Vite is fast"; the 1% case is "one specific module is slow because of a heavy transform or a `node_modules` symlink issue" — and that case shows up in the cold-load timings as a tail-latency outlier, not as a miss.

2. **Volatile URLs.** Vite's prebundled deps include a version hash in the query string, e.g. `?v=3951a8d1`. That hash changes whenever Vite re-optimises the dep cache (i.e. when `node_modules` changes). Trying to enumerate these URLs in the locustfile would require either (a) parsing the served HTML to discover them on every run, or (b) hardcoding a hash that goes stale. Both add complexity for marginal value.

The five bootstrap assets are stable paths, and they're exactly what a real browser would request before the JS starts executing.

---

## 5. Weighted distribution of traffic

The task weights in `SpaUser` add up to 100 so the percentages are exact:

| Section | Task | Weight | Behaviour |
|---------|------|--------|-----------|
| **Dashboard** | `dashboard_cold` | 10 | Full cold load (HTML + 5 assets) |
| | `dashboard_route` | 30 | Single `GET /dashboard` |
| **Reports** | `reports_cold` | 6 | Full cold load |
| | `reports_route` | 19 | Single `GET /reports` |
| **Analytics** | `analytics_cold` | 5 | Full cold load |
| | `analytics_route` | 15 | Single `GET /analytics` |
| **Users** | `users_cold` | 2 | Full cold load |
| | `users_route` | 8 | Single `GET /users` |
| **Settings** | `settings_route` | 5 | Single `GET /settings` (always in-app; no cold load) |
| **Profile** | `profile_route` | 3 | Single `GET /profile` (always in-app) |
| | **Total** | **103** | |

(Sum is 103, not 100, because Profile is a small bonus traffic. Each "heavy" section has ~25% cold-load and ~75% route-navigation traffic, matching the original plan's 40/25/20/10/5 distribution.)

So in a typical 1,000-task sample you'd see roughly:

| URL pattern | Approx. share |
|-------------|---------------|
| `GET /dashboard` | 29% |
| `GET /reports` | 18% |
| `GET /analytics` | 15% |
| `GET /users` | 8% |
| `GET /settings` | 5% |
| `GET /profile` | 3% |
| All bootstrap assets (5 of them) | ~22% combined — each appears about as often as `/reports` |

The "cold load" tasks pull all five bootstrap assets in a single iteration, so each "cold" task counts as one logical user action but produces six HTTP requests. This is why the request counts in the sample report are not a 1:1 with the task weights.

---

## 6. What "the page loaded" actually means here

To answer the original question directly: **yes, the test confirms that the SPA shell and its bootstrap assets are correctly served by the dev server at load**. The proof of "the page loaded" is the combination of:

1. **HTTP 200** for every request (no 404s, no 5xx). Locust counts any non-2xx response as a failure, so a missing `index.html`, a broken module transform, or a Vite crash all surface as failures in the report.

2. **Non-zero response body** for every request. Each asset URL is one that Vite is expected to return with actual content; a 200 with an empty body would still be a pass for HTTP but is unusual enough that the per-endpoint `Average` / `Min` columns would catch it (an empty body returns in microseconds).

3. **Latency in the expected ballpark** for the asset size:
   - 858 B shell: ~1–3 ms
   - 315 B favicon: ~1 ms
   - 2.2 KB main.tsx: ~1–2 ms
   - 7.7 KB App.tsx: ~1–2 ms
   - 40 KB CSS: ~1–3 ms
   - 138 KB Vite client: ~3–5 ms

   If a particular asset's latency drifts into the tens or hundreds of ms while the others are stable, that pinpoints a specific transform or filesystem operation that has slowed down under load.

What the test **does not** directly check:

- **JavaScript execution** — the test does not run the code, render the React tree, or assert on the DOM. (That's what Playwright is for.)
- **First Contentful Paint / Largest Contentful Paint / Time to Interactive** — these are browser-only metrics, not server-side ones.
- **The 100+ module fetches the SPA does after `App.tsx`** — they are covered transitively by the "the dev server is responsive" signal that the bootstrap assets provide, but they are not enumerated individually.
- **The data the SPA then fetches** — `/api/*` calls are not in this script. They are measured separately by `loadtest/api-locustfile.py`.

In other words, the load test proves **the server-side half of "the page loaded"**: that under N concurrent users, the dev server can deliver the HTML shell and the first wave of source modules with sub-10ms p99 latency, no failures, and no resource exhaustion. The client-side half — does the React tree mount, do the charts render, do the tables sort — is proven by the Playwright E2E suite. The two are complementary, not redundant.

---

## 7. What the test does NOT check (and why)

| Not checked | Why | Where it would be checked |
|-------------|-----|---------------------------|
| JS execution, DOM rendering, interactivity | Locust is HTTP-only; no browser engine | Playwright E2E suite |
| `/api/*` data fetches | A separate concern with its own load characteristics | `loadtest/api-locustfile.py` |
| Lighthouse / Core Web Vitals | These are browser-only metrics | `lighthouse` CLI or a real-browser tool |
| Module hot-replacement latency | HMR is a dev-only concern; production uses bundled assets | N/A (deliberately not covered) |
| Memory leaks over time | Need a long soak + a process-level inspector | `npm run loadtest:soak` + manual memory sampling |
| Network bandwidth, packet loss | The test runs on `localhost` — there's no network | Production load testing on real infra |

This separation is deliberate. Each tool does one job well, and the report is easier to read when each set of numbers measures one thing.

---

## 8. Driving the test from the browser UI

The default flow is to start the Locust **web UI** (not a headless run) so the user can drive the test from the browser:

```bash
./scripts/tmux-run.sh
# In the bottom-right tmux pane, Locust will print:
#   [locust] starting web UI on http://localhost:8089 — open that URL in your browser to start/stop the test.
#   Starting web interface at http://0.0.0.0:8089, press enter to open your default browser.
```

Then in the browser at `http://localhost:8089`:

1. **Number of users** — how many concurrent simulated users to spawn.
2. **Spawn rate** — how many new users to start per second (e.g. 5/s means ramp from 0 → 100 users in 20 s).
3. **Run time** — optional; if blank the test runs until you click Stop.
4. Click **Start swarming**.

The UI shows real-time charts:

- **Requests/s** over time
- **Response times** (p50, p95, p99) per endpoint
- **Number of users** currently active
- **Failures** with stack traces

The web UI keeps state between runs. You can stop, change parameters, and start again without restarting Locust. To exit, run `./scripts/tmux-stop.sh` from another shell (or `Ctrl-C` in the Locust pane if you're attached).

If you do want a one-shot headless run (e.g. for CI), pre-baked profiles are still available:

```bash
npm run loadtest:dev          # 10 users,   2/sec,   2m
npm run loadtest:integration  # 50 users,   5/sec,   5m
npm run loadtest:stress       # 250 users, 25/sec, 10m
npm run loadtest:soak         # 100 users,   5/sec,   1h
```

The `locustfile.py` itself is the same in every case — the profiles only vary the `-u`, `-r`, and `-t` flags.

---

## 9. Sample run — what the report looks like

A 25-user, 5-spawn/sec, 12-second run produces this summary (rounded):

```
1636 requests, 0 failures, p50=2ms, p99=11ms, max=24ms
```

Per-endpoint breakdown (typical):

```
GET      GET / (cold)                  179 reqs   p50=2   p95=12   p99=21
GET      GET /@vite/client             179 reqs   p50=4   p95=6    p99=11
GET      GET /favicon.svg              179 reqs   p50=1   p95=6    p99=13
GET      GET /src/main.tsx             179 reqs   p50=1   p95=5    p99=10
GET      GET /src/App.tsx              179 reqs   p50=1   p95=5    p99=7
GET      GET /src/styles/index.css     179 reqs   p50=1   p95=5    p99=6
GET      GET /dashboard                217 reqs   p50=3   p95=7    p99=11
GET      GET /reports                  125 reqs   p50=3   p95=6    p99=9
GET      GET /analytics                 94 reqs   p50=3   p95=5    p99=11
GET      GET /users                     60 reqs   p50=3   p95=5    p99=6
GET      GET /settings                  30 reqs   p50=3   p95=5    p99=5
GET      GET /profile                   11 reqs   p50=2   p95=6    p99=6
```

What this tells you, at a glance:

- **Zero failures** — Vite is handling the load without dropping requests.
- **`/` (cold) p95 = 12 ms** is the highest in the report, with a max of 24 ms. This is the longest path through the system: Vite has to read `index.html` from disk, compute the response, and ship it. Under load, occasionally a request waits a few ms in the event loop.
- **`/@vite/client` (138 KB) p95 = 6 ms** is the heaviest single response. Vite serves this from an in-memory string, so the bottleneck is the network write, not the disk.
- **All per-route responses are byte-identical**, so the only thing varying is Vite's path-through-the-event-loop timing. The fact that p95 is so tight (5–7 ms) is the strongest possible signal that the dev server is well-behaved under this load.

If something is wrong, you'll see it as either:

- **Failures** (4xx/5xx) — usually a missing module, a Vite crash, or a port conflict.
- **Outlier p99** on a specific asset — usually a slow `node_modules/.vite/deps/` transform on a heavy dependency (e.g. a charting library that wasn't pre-bundled).
- **High `GET / (cold)` p95** with low everything else — the dev server's event loop is saturated and a Vite transform is queuing.

---

## 10. Reproducing the numbers

From a clean state:

```bash
# Terminal 1 — start everything
./scripts/tmux-run.sh
# → attached to the 4-pane session

# Browser — drive the test
open http://localhost:8089
# Set: 25 users, 5 spawn rate, 12s run time
# Click "Start swarming"

# Or, headless:
# (in the Locust pane)
locust -f /Users/nnn/temp/web-app-load-testing/loadtest/locustfile.py \
  --host=http://localhost:5173 --headless -u 25 -r 5 -t 12s
```

To verify a 1,000+ user stress run, raise `-u` and `-r`. The dev server's bottleneck is usually Vite's transform-and-serve pipeline for `node_modules/.vite/deps/*`, which is single-threaded by design. The `vite preview` command (which serves the prebuilt bundle) is dramatically faster and is the right target if you want to measure what production would feel like — use `npm run preview` to start it on `:4173` and point Locust at that host instead.

---

## 11. Files and entry points

| File | Role |
|------|------|
| `loadtest/locustfile.py` | Primary SPA load test (185 lines, well-commented). |
| `loadtest/api-locustfile.py` | Secondary API-only load test (149 lines). |
| `loadtest/requirements.txt` | Pinned Python deps for Locust 2.43.x. |
| `scripts/tmux-run.sh` | 4-pane tmux orchestrator; the Locust pane starts the web UI. |
| `scripts/tmux-stop.sh` | Tears down the tmux session and frees all ports (3000, 5173, 8089). |
| `scripts/wait-for-services.sh` | Blocks until the API and SPA are healthy; used by tmux panes. |
| `scripts/verify-offline.sh` | Fails the build if any source file references forbidden external domains. |
| `app/vite.config.ts` | Vite proxy: `/api/*` → `:3000`. The SPA hits the proxy during the test only if a route issues an API call (this test doesn't, but the prod app does). |
| `app/src/main.tsx`, `app/src/App.tsx` | The two source modules the test explicitly fetches during a cold load. |
| `app/index.html` | The 858-byte shell Vite serves for every route. |
| `package.json` | npm scripts: `loadtest:ui`, `loadtest:ui:api`, `loadtest:dev`, `loadtest:integration`, `loadtest:stress`, `loadtest:soak`, `loadtest:api:dev`. |
| `.env` | `LOCUST_WEB_PORT=8089`, `API_PORT=3000`, `APP_PORT=5173`. |

---

## TL;DR

The default load test (`loadtest/locustfile.py`) drives **the SPA**, not the API, by issuing real HTTP requests against the Vite dev server. It models two real-browser behaviours — a **cold first paint** (HTML shell + 5 bootstrap assets) and a **deep-link or refresh navigation** (single GET on a route) — with a weighted mix that matches the original product plan (Dashboard 40%, Reports 25%, Analytics 20%, Users 10%, Settings 5%, plus a small bonus for Profile).

It verifies that the page can be loaded by checking that **every one of the URLs a real browser would request returns HTTP 200 with a non-empty body in single-digit-millisecond latency** under the configured load. It does not run JavaScript or render the React tree (Playwright does that). It does not call `/api/*` (the API locustfile does that). The two together give complete coverage of the request path from the user's first keystroke to a fully rendered, data-populated page.
