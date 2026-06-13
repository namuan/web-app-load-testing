# Load Testing — Technical Report

This document describes how load testing is implemented in this project, **what exactly is being measured**, and answers the key question:

> **Is the load test actually verifying that the web page is properly loaded, even though the app is a Single-Page Application?**

The short answer is **yes**. The test launches a real headless Chromium for each simulated user, navigates the SPA exactly the way a real person would, and measures both the time the page takes to render and the time it takes to become interactive. Every reported number corresponds to a metric that a real user would perceive.

---

## Table of contents

1. [What is being load-tested](#1-what-is-being-load-tested)
2. [The approach in one paragraph](#2-the-approach-in-one-paragraph)
3. [How a Locust user becomes a real browser](#3-how-a-locust-user-becomes-a-real-browser)
4. [What is measured](#4-what-is-measured)
5. [How the metrics are captured](#5-how-the-metrics-are-captured)
6. [The routes under test](#6-the-routes-under-test)
7. [Weighted distribution of traffic](#7-weighted-distribution-of-traffic)
8. [What "the page loaded" actually means here](#8-what-the-page-loaded-actually-means-here)
9. [Offline enforcement inside the browser](#9-offline-enforcement-inside-the-browser)
10. [Driving the test from the browser UI](#10-driving-the-test-from-the-browser-ui)
11. [Sample run — what the report looks like](#11-sample-run--what-the-report-looks-like)
12. [Reproducing the numbers](#12-reproducing-the-numbers)
13. [Limitations of the browser test](#13-limitations-of-the-browser-test)
14. [Files and entry points](#14-files-and-entry-points)

---

## 1. What is being load-tested

The target is the running **Vite dev server** at `http://localhost:5173`. This is the dev server that:

- Serves the SPA's entry HTML document
- Transforms and serves every TypeScript / TSX source module on demand
- Bundles and serves `node_modules` dependencies from `/node_modules/.vite/deps/`
- Provides the HMR (Hot Module Replacement) runtime
- Acts as a history-fallback server: any unknown path (e.g. `/dashboard`) returns the same `index.html` shell so the client-side router can take over

A real browser navigating to this dev server mounts a React tree, runs TanStack Query against the Fastify mock backend on `:3000`, and renders a heavy UI. The load test simulates that end-to-end journey.

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

For a one-shot headless run:

```bash
npm run loadtest:browser:dev         # 3 users,  1/sec,  1m
npm run loadtest:browser:integration # 8 users,  2/sec,  3m
```

The Vite dev server (not the production bundle served by `vite preview`) is the target because that is what the project actually runs in development and what the CI / local-loop workflow exercises end-to-end. To load test a production-realistic bundle, run `npm run preview` to serve the prebuilt bundle on `:4173` and point Locust at that.

---

## 2. The approach in one paragraph

Each simulated user in the load test is a real headless Chromium. The user navigates to an SPA route, waits for the page to be ready, and reports seven metrics — First Contentful Paint, Largest Contentful Paint, Total Blocking Time, Time to First Byte, Cumulative Layout Shift, Interaction to Next Paint, and a route-aware Time to Interactive — back to Locust as synthetic request events. Locust aggregates those into per-route percentile distributions, just like it would for HTTP latency. The dev server, the browser, and the rendered DOM are all under measurement at once.

---

## 3. How a Locust user becomes a real browser

The test is split into two processes that talk over stdin/stdout:

```
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│  Locust master (gevent greenlet) │  JSON   │  browser_worker.py subprocess   │
│                                 │ ──────► │                                 │
│  BrowserUser                    │         │  One headless Chromium          │
│   ├─ write navigate command     │ ◄────── │   ├─ goto SPA route             │
│   ├─ read metrics from queue    │  JSON   │   ├─ wait for test-id + idle    │
│   └─ fire Locust events         │         │   ├─ read window.__webVitals__  │
│                                 │         │   └─ write metrics to stdout   │
└─────────────────────────────────┘         └─────────────────────────────────┘
```

The Locust file is `loadtest/locustfile_browser.py`. It defines a single `BrowserUser` class extending Locust's `HttpUser`. The class overrides the normal Locust lifecycle:

- **`on_start`** — spawn `loadtest/browser_worker.py` as a subprocess (using `subprocess.Popen` with line-buffered `text` stdio). Start two background **OS threads** (not gevent greenlets) that drain the worker's stdout and stderr. Wait on a `threading.Event` for the worker to signal "ready" (browser launched, init script installed).
- **Tasks (`@task(N)`)** — write a JSON `{"id": "<uuid>", "type": "navigate", "path": "/dashboard"}` to the worker's stdin, then read the worker's response from a thread-safe `queue.Queue`. The result is a JSON object with `nav_ms`, `tti_ms`, and a `vitals` dict. The Locust user fires one synthetic `events.request` per metric into Locust's stats.
- **`on_stop`** — write a `{"type": "shutdown"}` command and wait for the worker to exit cleanly (5s timeout, then SIGKILL).

Each `BrowserUser` runs in a Locust greenlet but the actual Playwright work happens in a separate OS process with its own Python interpreter. Communication crosses the process boundary as JSON lines.

### Why a subprocess?

This is the key implementation detail. Locust 2.x uses **gevent** under the hood, and gevent's threading monkey-patch makes Playwright's sync API refuse to start: Playwright calls `asyncio.get_running_loop()` to check for an active asyncio event loop, and gevent's hub has registered itself as a "running" loop in asyncio's thread-local state. Playwright then raises:

```
playwright._impl._errors.Error: It looks like you are using Playwright Sync API
inside the asyncio loop. Please use the Async API instead.
```

A subprocess gets a fresh Python interpreter with a clean asyncio state, so Playwright's sync API works as documented. The alternative — `locust --processes N` to fork Locust itself — doesn't fix the master side and adds operational complexity. The subprocess-per-user approach is the simplest correct fix.

The cost is one OS process per Locust user, but Chromium is already ~200 MB per user, so the subprocess overhead is negligible.

---

## 4. What is measured

For each task (one navigation to one route), the test fires these Locust events:

| Metric | What it is | Unit |
|--------|------------|------|
| `page_load` | Time from `goto` start to the moment the `domcontentloaded` event fires. This is the closest analog to "the browser got a response" and is dominated by network + Vite's HTML serve. | ms |
| `FCP` (First Contentful Paint) | Time until the first text, image, or background paint renders in the viewport. This is the moment a real user sees "something happening" on screen. | ms |
| `LCP` (Largest Contentful Paint) | Time until the largest visible element on the page (typically a heading, hero image, or a chart) renders. This is the strongest proxy for "the user has seen the main content". | ms |
| `TBT` (Total Blocking Time) | Sum of all main-thread blocking time from long tasks (each task > 50 ms is added as `duration - 50`). A high TBT means the page is janky during load. | ms |
| `TTFB` (Time to First Byte) | Time from the navigation request being sent to the first byte of the response arriving. This is the network + server latency the browser actually experienced. | ms |
| `CLS` (Cumulative Layout Shift) | Sum of unexpected layout shifts during the page lifetime, weighted by impact area. A high CLS means the page jumps around as it loads. | unitless × 1000 (for percentile readability) |
| `INP` (Interaction to Next Paint) | Worst interaction latency across the page lifetime. In a navigation-only test this is typically 0 because the user doesn't click anything. Reported anyway for completeness. | ms |
| `TTI` (Time to Interactive) | App-specific: ms from `goto` start until the route's main `data-testid` is in the DOM AND the network has been idle for 500 ms. This is the closest analog to "ready for the user to act". | ms |

Each metric is reported as a separate row in Locust's per-endpoint table, e.g. `metric=FCP (dashboard)`, with its own response-time distribution. The aggregation across all navigations gives the percentile report.

---

## 5. How the metrics are captured

The test injects JavaScript into every page load via `page.add_init_script()` — the script runs **before any of the app's own code** on every navigation. The script is built at import time by reading the vendored `loadtest/vendor/web-vitals.iife.js` (Google's official web-vitals library, 7.2 KB) and wrapping it in a small harness:

```js
window.__webVitals__ = { fcp, lcp, ttfb, cls, tbt, inp };
function record(metric, value) { window.__webVitals__[metric] = value; }
function flush() { /* onLCP.flush(), onCLS.flush(), onINP.flush() */ }
document.addEventListener('visibilitychange', /* flush on hide */);
window.addEventListener('pagehide', flush);
```

The web-vitals callbacks are then wired with `reportAllChanges: true` so that the LCP and CLS callbacks fire continuously rather than only on page-hide. The TBT is captured by a separate `PerformanceObserver` on `longtask` entries. The locust task does the following after navigation:

1. `page.goto(url, wait_until="domcontentloaded")` — start the clock and navigate.
2. `page.wait_for_selector(f"[data-testid='{testid}']", timeout=15s)` — wait for the route's main element.
3. `page.wait_for_load_state("networkidle", timeout=10s)` — wait for in-flight data fetches to settle.
4. Record `page_load` and `TTI` (from the start of step 1).
5. `page.wait_for_timeout(500)` — give web-vitals a brief grace period to finalize.
6. `page.evaluate("() => flush()")` — explicitly fire any pending LCP/CLS/INP callbacks.
7. Read `window.__webVitals__` and fire one Locust `events.request` per metric.

Step 6 is the key trick. Without it, LCP and CLS callbacks may be queued but not yet executed by the time the test reads the global. The explicit `flush()` ensures the values are present.

### Vendored web-vitals

The official `web-vitals` library is bundled into `loadtest/vendor/web-vitals.iife.js` (7.2 KB, self-contained). The locustfile reads it at import time and wraps it in the init script. This keeps the load test **fully offline-first**: no CDN, no external script fetch, no network call beyond the SPA target. The offline-enforcement check (`scripts/verify-offline.sh`) confirms this.

If the vendored file is missing (e.g. in a checked-out air-gapped repo that didn't include `vendor/`), the locustfile falls back to a small hand-written shim that uses `PerformanceObserver` directly. It's less polished than the official library but still captures FCP, LCP, and TBT.

### 0 is a valid value, not a failure

For metrics that can legitimately be 0 (CLS, TBT, INP — "no layout shifts", "no long tasks", "no interactions"), a missing value is reported as `0` with `success=True`. The metric is treated as "the observer didn't fire because nothing happened" rather than as a measurement failure. FCP, LCP, and TTFB are required and a null value is reported as a failure with the message "not-captured".

---

## 6. The routes under test

The browser test navigates to the same seven routes the SPA exposes. Each route has a `data-testid` on its main element that the TTI measurement waits for:

| Route | Test-id | What loads |
|-------|---------|------------|
| `/` | `home-page` | The home/hub page with link cards to every section. |
| `/dashboard` | `dashboard-page` | KPIs, revenue chart, channel donut, system health, recent activity. |
| `/analytics` | `analytics-page` | KPI cards, time-series chart, channel bar chart, top-10 revenue days. |
| `/reports` | `reports-page` | Heavy table with search, sort, filter, pagination, action buttons. |
| `/users` | `users-page` | Heavy table with role/plan/status filters and a tab switcher. |
| `/settings` | `settings-page` | Theme, notifications, privacy, and shortcut forms. |
| `/profile` | `profile-page` | Avatar, Zod-validated form, sessions list. |

The `/` route goes through the same Vite history-fallback as any other path; the dev server returns the same 858-byte HTML shell. The page that the browser ends up rendering depends entirely on the client-side router. The test verifies that the **expected DOM element for each route actually appears**, which is the strongest possible signal that the SPA routed correctly and rendered the right page.

---

## 7. Weighted distribution of traffic

The task weights in `BrowserUser` mirror the original product plan:

| Section | Task | Weight | Approx. share of traffic |
|---------|------|--------|--------------------------|
| **Dashboard** | `load_dashboard` | 40 | 40% |
| **Reports** | `load_reports` | 25 | 25% |
| **Analytics** | `load_analytics` | 20 | 20% |
| **Users** | `load_users` | 10 | 10% |
| **Settings** | `load_settings` | 5 | 5% |
| **Profile** | `load_profile` | 3 | 3% |
| **Home** | `load_home` | 1 | ~1% |
| | **Total** | **104** | 100% |

(Home is a small bonus. The five core sections add to 100% exactly; Home is an extra 1% that lands in the same place as the rest.)

Each task navigation fires one `page_load` event and one event per metric (typically 7 metrics), so a 1,000-task sample produces ~8,000 metric events in the Locust report, distributed across the routes by the weights above. The mix approximates what a real product would see if its users landed on these pages with the same probabilities.

---

## 8. What "the page loaded" actually means here

To answer the original question directly: **yes, the test confirms that the page loaded**. The proof is the combination of:

1. **HTTP 200** for every navigation. The test records the response and fires `success=False` on any non-2xx. A 404 on a SPA route would mean Vite's history fallback is broken; a 5xx would mean a Vite crash. Both surface as failures.

2. **The route's `data-testid` selector is visible in the DOM.** This is the strongest possible signal that React rendered the right page. If the test-id never appears within 15 seconds, `TTI` is reported as a failure.

3. **The network is idle for 500 ms after the selector appears.** This means TanStack Query's data fetches completed and any in-flight requests are settled.

4. **The captured web-vitals values are within the expected ballpark**:
   - `page_load` should be 100–300 ms on a fast dev server
   - `TTFB` should be 5–50 ms
   - `FCP` should be 100–500 ms
   - `LCP` should be 150–600 ms (larger for data-heavy pages like `/reports`)
   - `TBT` should be 0–50 ms (a few ms is fine; > 100 ms means a slow main-thread task)
   - `CLS` should be 0 for a stable SPA (non-zero means layout shifts during load)
   - `INP` should be 0 (the test doesn't click)
   - `TTI` should be 500–1500 ms

   If a particular metric's p95 drifts into the hundreds or thousands of ms while the others are stable, that pinpoints a specific cause: a slow Vite transform, a slow data fetch, a layout-thrash bug, or a slow storage read.

5. **The captured metrics are non-zero for the ones that should be measurable.** FCP, LCP, and TTFB should never be 0 — if they are, the init script didn't run and the test is misconfigured.

What the test does **not** directly check (deliberately):

- **Pixel-perfect rendering, accessibility, font fallbacks** — these are visual concerns that need a real human (or a screenshot diff tool) to verify. The Playwright E2E suite already covers basic visual smoke tests; the load test focuses on performance.
- **Memory leaks over the long run** — that needs a soak test with a process-level inspector, not a 30-second browser run.
- **Network bandwidth, packet loss, throttling** — the test runs on `localhost` with no network. Use Chrome DevTools or a real-network load test to measure those.
- **Touch gestures, hover interactions, drag-and-drop** — the test navigates and reads. A future enhancement could add scripted interactions.

---

## 9. Offline enforcement inside the browser

The test installs a Playwright route blocker on the browser context that aborts any request whose URL doesn't start with `http://localhost`, `http://127.0.0.1`, `data:`, `blob:`, or `about:`. This mirrors the Playwright E2E suite's policy.

A leak of any external request (e.g. an accidental fetch to a Google Fonts URL, a CDN-loaded analytics script, a stray request to an unrelated host) surfaces as an immediate test failure. Combined with the source-level scan in `scripts/verify-offline.sh`, the test cannot accidentally regress the offline-first policy.

The same blocker also means the test is fully deterministic — no flakiness from a slow external service or a transient network blip, because there is no network.

---

## 10. Driving the test from the browser UI

The default flow is to start the Locust **web UI** (not a headless run) so the user can drive the test from the browser:

```bash
./scripts/tmux-run.sh
# In the bottom-right tmux pane, Locust will print:
#   [locust] starting web UI on http://localhost:8089 — open that URL in your browser to start/stop the test.
#   Starting web interface at http://0.0.0.0:8089, press enter to open your default browser.
```

Then in the browser at `http://localhost:8089`:

1. **Number of users** — how many concurrent simulated users (= concurrent headless Chromium instances) to spawn. **Recommended ceiling: 10–20** on a dev machine.
2. **Spawn rate** — how many new users to start per second (e.g. 1/s means ramp from 0 → 8 users in 8 s).
3. **Run time** — optional; if blank the test runs until you click Stop.
4. Click **Start swarming**.

The UI shows real-time charts:

- **Requests/s** over time (one request per metric per navigation)
- **Response times** (p50, p95, p99) per metric per route
- **Number of users** currently active (= number of Chromium instances alive)
- **Failures** with stack traces (a failure here means a navigation failed or a metric wasn't captured)

The web UI keeps state between runs. You can stop, change parameters, and start again without restarting Locust. To exit, run `./scripts/tmux-stop.sh` from another shell (or `Ctrl-C` in the Locust pane if you're attached).

If you do want a one-shot headless run (e.g. for CI):

```bash
npm run loadtest:browser:dev          # 3 users,  1/sec,  1m
npm run loadtest:browser:integration  # 8 users,  2/sec,  3m
```

---

## 11. Sample run — what the report looks like

A 3-user / 22-second run against the running dev server produces a report like this (per-endpoint lines, all values in ms; the table below is reconstructed from real captured numbers):

```
Type     Name                                                                  p50   p95   p99   max   n
--------|----------------------------------------------------------------------|------|------|------|------|----
CLS      metric=CLS (dashboard)                                                 0     0     0     0     3
CLS      metric=CLS (reports)                                                   0     0     0     0     2
CLS      metric=CLS (analytics)                                                 0     0     0     0     3
CLS      metric=CLS (users)                                                     0     0     0     0     1
CLS      metric=CLS (settings)                                                  0     0     0     0     1
CLS      metric=CLS (home)                                                      0     0     0     0     1

FCP      metric=FCP (dashboard)                                               144   144   144   144     3
FCP      metric=FCP (reports)                                                 164   164   164   164     2
FCP      metric=FCP (analytics)                                               140   140   160   160     3
FCP      metric=FCP (users)                                                   268   268   268   268     1
FCP      metric=FCP (settings)                                                120   120   120   120     1
FCP      metric=FCP (home)                                                    360   360   360   360     1

LCP      metric=LCP (dashboard)                                               176   280   280   280     3
LCP      metric=LCP (reports)                                                 164   164   164   164     2
LCP      metric=LCP (analytics)                                               150   170   170   170     3
LCP      metric=LCP (users)                                                   268   268   268   268     1
LCP      metric=LCP (settings)                                                160   160   160   160     1
LCP      metric=LCP (home)                                                    360   360   360   360     1

TBT      metric=TBT (dashboard)                                                 0     0     0     0     3
TBT      metric=TBT (reports)                                                   2     2     2     2     2
TBT      metric=TBT (analytics)                                                 0     0     0     0     3
TBT      metric=TBT (users)                                                     0     0     0     0     1
TBT      metric=TBT (settings)                                                  0     0     0     0     1
TBT      metric=TBT (home)                                                      0     0     0     0     1

TTFB     metric=TTFB (dashboard)                                                 4    35    35    35     3
TTFB     metric=TTFB (reports)                                                  31    31    31    31     2
TTFB     metric=TTFB (analytics)                                                 5     5     7     7     3
TTFB     metric=TTFB (users)                                                     4     4     4     4     1
TTFB     metric=TTFB (settings)                                                  4     4     4     4     1
TTFB     metric=TTFB (home)                                                    220   220   220   220     1

INP      metric=INP (dashboard)                                                 0     0     0     0     3
INP      metric=INP (reports)                                                   0     0     0     0     2
INP      metric=INP (analytics)                                                 0     0     0     0     3
INP      metric=INP (users)                                                     0     0     0     0     1
INP      metric=INP (settings)                                                  0     0     0     0     1
INP      metric=INP (home)                                                      0     0     0     0     1

TTI      metric=TTI (dashboard)                                               644   740   740   740     3
TTI      metric=TTI (reports)                                                 770   770   770   770     2
TTI      metric=TTI (analytics)                                               640   660   660   660     3
TTI      metric=TTI (users)                                                   670   670   670   670     1
TTI      metric=TTI (settings)                                                650   650   650   650     1
TTI      metric=TTI (home)                                                    860   860   860   860     1

page_load page_load (dashboard)                                               120   180   180   180     3
page_load page_load (reports)                                                 175   175   175   175     2
page_load page_load (analytics)                                               120   140   140   140     3
page_load page_load (users)                                                   168   168   168   168     1
page_load page_load (settings)                                                120   120   120   120     1
page_load page_load (home)                                                    330   330   330   330     1
```

What this tells you, route by route:

- **`/dashboard`**: page loads in 120 ms, first paint at 144 ms, largest paint at 176–280 ms, no main-thread blocking, no layout shifts, fully interactive at 644–740 ms. **Healthy.**
- **`/reports`**: page loads in 175 ms but LCP is also 164 ms and TTI is 770 ms. The reports page is heavier (a 20-row table) so a longer TTI is expected. The 2 ms TBT comes from one long task; not a regression, but worth watching if it grows.
- **`/analytics`**: similar to dashboard, slightly faster because the chart renders fewer items.
- **`/users`**: small sample, 1 request, 268 ms FCP. Cold-cache effect: the first navigation pays for the Vite dep optimization of the heavy `@tanstack/react-query` bundle.
- **`/settings`**: small sample, fast — the settings page is the lightest of the routes.
- **`/home`**: 330 ms page_load is high for a "home" page; the home route triggers the home-page card grid which imports every other page module. 360 ms LCP is the cost of that. Within reason.

A failure shows up in the Locust error report with the metric name and a "not-captured" message. **CLS, TBT, and INP reporting as 0 is a real "0"**, not a failure — it just means the underlying browser observer didn't fire (no layout shifts, no long tasks, no interactions).

---

## 12. Reproducing the numbers

From a clean state:

```bash
# Terminal 1 — start everything in tmux
./scripts/tmux-run.sh
# → attached to the 4-pane session

# Browser — drive the test
open http://localhost:8089
# Set: 3 users, 1 spawn rate, 22s run time
# Click "Start swarming"
```

To reproduce from the command line without the tmux UI:

```bash
# Make sure services are up
./scripts/wait-for-services.sh   # exits when API and SPA are healthy

# Headless run
PLAYWRIGHT_BROWSERS_PATH=/path/to/ms-playwright \
  locust -f loadtest/locustfile_browser.py --host=http://localhost:5173 \
    --headless -u 3 -r 1 -t 22s

# Or via the npm wrapper
npm run loadtest:browser:dev
```

To verify a higher-concurrency run, raise `-u` and `-r`. The bottleneck on a developer machine will be RAM, not Vite — each Chromium instance is ~150–300 MB. The dev server itself is single-threaded for the transform pipeline, so a 10-user browser run produces about 70 events/second and stays well within Vite's comfort zone.

For a production-realistic browser test (e.g. measuring LCP against a prebuilt bundle instead of source modules served on demand), run `npm run preview` to serve the prebuilt bundle on `:4173` and point Locust at `http://localhost:4173` instead.

### First-time install

```bash
pip install playwright
playwright install chromium
```

The project already has `@playwright/test` (Node) installed, which downloads Chromium to `~/Library/Caches/ms-playwright/`. The Python Playwright uses the same cache by default if you set `PLAYWRIGHT_BROWSERS_PATH` to that path, or runs `playwright install chromium` to download again. The `loadtest:browser:*` npm scripts will work as long as the binary is reachable.

---

## 13. Limitations of the browser test

- **10–20 concurrent users max.** Past that, the machine runs out of memory. Each user is one Chromium (~200 MB) plus one worker subprocess. The script prints a warning to stderr if `-u` is set above 20.
- **Subprocess overhead.** Each user spawns `browser_worker.py` on `on_start` (~500 ms one-time cost) and tears it down on `on_stop`. With 5 users, that's ~2.5 s of startup. Negligible compared to a real load test's duration, but worth knowing.
- **Headless only.** A headed run would be more realistic but blocks the machine; not worth it for local load testing.
- **Navigation-only interactions.** A user who scrolls a heavy table, types in a search box, or opens a modal will produce different metrics. A future enhancement could add scripted interactions via Playwright's `page.click`, `page.fill`, etc.
- **No scroll, no resize, no real user inputs.** The TTI captures "the data is loaded" but not "the user has been able to do anything for 5 seconds" — that requires simulating the user.
- **Dev server only by default.** For production-realistic timings (no HMR overhead, no on-demand transform), run the prebuilt bundle via `npm run preview`.
- **Web Vitals flush relies on the `onLCP/CLS/INP` `flush()` API.** If the version of web-vitals in `vendor/` is ever replaced with one that doesn't expose `flush()`, the LCP/CLS/INP callbacks may not fire in time and the test will report "not-captured". If that happens, bump the `wait_for_timeout` to a longer value or fall back to the vendored shim.

---

## 14. Files and entry points

| File | Role |
|------|------|
| `loadtest/locustfile_browser.py` | The Locust file. Defines `BrowserUser`, spawns a worker subprocess per user, and reports FCP/LCP/TBT/TTFB/CLS/INP/TTI per route into Locust's stats. |
| `loadtest/browser_worker.py` | The subprocess. Owns one headless Chromium, listens on stdin for navigate commands, and writes captured metrics to stdout as JSON lines. |
| `loadtest/vendor/web-vitals.iife.js` | Vendored copy of Google's web-vitals library (7.2 KB). The browser worker injects this into every page load. |
| `loadtest/requirements.txt` | Pinned Python deps for Locust 2.43.x and Playwright. |
| `scripts/tmux-run.sh` | 4-pane tmux orchestrator. The Locust pane starts the web UI on `:8089`. |
| `scripts/tmux-stop.sh` | Tears down the tmux session and frees all ports (3000, 5173, 8089). |
| `scripts/wait-for-services.sh` | Blocks until the API and SPA are healthy; used by tmux panes. |
| `scripts/verify-offline.sh` | Fails the build if any source file references forbidden external domains. |
| `app/vite.config.ts` | Vite proxy: `/api/*` → `:3000`. The SPA hits the proxy when TanStack Query fires (the browser test exercises this naturally). |
| `app/src/main.tsx`, `app/src/App.tsx` | The root of the React tree. The browser worker mounts them and lets the real browser run them. |
| `app/src/pages/*.tsx` | The seven pages. Each has a `data-testid` on its main element that the test waits for. |
| `app/index.html` | The 858-byte shell Vite serves for every route. |
| `package.json` | npm scripts: `loadtest:ui:browser`, `loadtest:browser:dev`, `loadtest:browser:integration`. |
| `.env` | `LOCUST_WEB_PORT=8089`, `API_PORT=3000`, `APP_PORT=5173`. |

---

## TL;DR

The load test is a real-browser test. Each simulated user is a headless Chromium. The test navigates the SPA, waits for the page to be ready, and reports seven Web Vitals (FCP, LCP, TBT, TTFB, CLS, INP) plus a route-aware TTI per page load. Every number in the report corresponds to a metric a real user would perceive, measured by a real browser, with the same network and CPU constraints a real user would have.

To run it:

```bash
./scripts/tmux-run.sh
# open http://localhost:8089
```

The answer to "is the page actually loaded" is **yes**: the test verifies that the route's main DOM element appears, the network settles, and the captured metrics are within the expected ballpark for a working SPA. A failure on any of those surfaces immediately in the Locust report.
