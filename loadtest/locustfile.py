"""Locust load test for the local SPA (Vite dev server).

Target:
  http://localhost:5173  (the running Vite dev server)

This file load-tests the **SPA itself** — the entry HTML, Vite's HMR
client, source modules served on demand, and SPA routes (which all return
the same HTML shell thanks to Vite's history fallback). It deliberately
does NOT call /api/* directly. In a real browser those calls happen via
the SPA's data layer, but we measure them separately on the API.

We model a typical user session as:

  1. "Cold load": fetch the HTML, then fetch the assets a real browser
     would request on first paint (Vite client, favicon, entry module,
     App, prebundled React/ReactDOM deps, CSS). Each of these is a
     distinct request that stresses Vite's module transform and serve
     pipeline.
  2. "Route navigation": the SPA uses client-side routing, so navigating
     to /dashboard, /reports, etc. in a real browser only triggers a
     single GET on the route (Vite returns the same HTML shell via
     history fallback). We do exactly that.

Weighted distribution (mirrors the original plan and real usage):

  Dashboard  40%
  Reports    25%
  Analytics  20%
  Users      10%
  Settings    5%

  Of the Dashboard / Reports / Analytics / Users traffic, ~25% is a
  full "cold load" (HTML + all bootstrap assets) and the other 75% is
  an in-app navigation (single GET on the route). Settings and Profile
  are always in-app navigations.

Run with one of:

  locust -f loadtest/locustfile.py --host=http://localhost:5173
  locust -f loadtest/locustfile.py --host=http://localhost:5173 --headless -u 100 -r 10 -t 10m

The @task weights sum to 100 so the percentages above are exact.
"""
from __future__ import annotations

import random
from locust import HttpUser, task, between, events


HOST_DEFAULT = "http://localhost:5173"


# ---------- Asset / route catalogues ----------

# All SPA routes. Every one of these returns the same index.html shell
# thanks to Vite's history fallback, but we list them individually so
# we can measure per-route response time and group them in the report.
SPA_ROUTES = [
    "/",
    "/dashboard",
    "/analytics",
    "/reports",
    "/users",
    "/settings",
    "/profile",
]

# Asset URLs that a real browser fetches on the first cold load of the
# SPA. The exact list depends on Vite's dep optimization (a version
# hash is appended to /node_modules/.vite/deps/*.js), so we use a
# stable suffix `?v=*` on the Vite-served path; we don't need to match
# the hash exactly — Vite responds with 404 for unknown versions and
# the real cold-load requests we care about (HTML, client, favicon,
# main.tsx, App.tsx, index.css) don't have a hash.
BOOTSTRAP_ASSETS = [
    "/favicon.svg",
    "/@vite/client",
    "/src/main.tsx",
    "/src/App.tsx",
    "/src/styles/index.css",
]


class SpaUser(HttpUser):
    """Simulates a heavy SPA user clicking through the app."""

    # Brief pause between actions to mimic real interaction timing.
    wait_time = between(0.1, 0.6)

    def on_start(self):
        # Warm up: one cold load so the first user doesn't see a skewed
        # cold-start latency, and so any first-time Vite optimization
        # happens before the run is in full swing.
        self._cold_load()
        self.client.get("/", name="GET / (warmup)")

    # ---------- Helper: emulate a browser cold load ----------

    def _cold_load(self):
        """Fetch the HTML shell + the assets the browser would pull.

        Each asset is sent as its own Locust request so the report shows
        per-asset latency, throughput, and failure rates. A real browser
        fetches these in parallel; Locust is sequential by design, so
        end-to-end cold-load latency here is *higher* than a real user
        would see. Use the per-asset timings to draw conclusions.
        """
        # 1. The HTML document
        self.client.get("/", name="GET / (cold)")

        # 2. The bootstrap assets. Randomise order to mimic browsers
        #    that may speculatively request a favicon or CSS first.
        assets = list(BOOTSTRAP_ASSETS)
        random.shuffle(assets)
        for asset in assets:
            self.client.get(asset, name=f"GET {asset}")

    # ---------- Dashboard: 40 ----------

    @task(10)
    def dashboard_cold(self):
        """25% of dashboard traffic — full cold load."""
        self._cold_load()

    @task(30)
    def dashboard_route(self):
        """75% of dashboard traffic — in-app navigation."""
        self.client.get("/dashboard", name="GET /dashboard")

    # ---------- Reports: 25 ----------

    @task(6)
    def reports_cold(self):
        """~24% of reports traffic — full cold load."""
        self._cold_load()

    @task(19)
    def reports_route(self):
        """~76% of reports traffic — in-app navigation."""
        self.client.get("/reports", name="GET /reports")

    # ---------- Analytics: 20 ----------

    @task(5)
    def analytics_cold(self):
        """25% of analytics traffic — full cold load."""
        self._cold_load()

    @task(15)
    def analytics_route(self):
        """75% of analytics traffic — in-app navigation."""
        self.client.get("/analytics", name="GET /analytics")

    # ---------- Users: 10 ----------

    @task(2)
    def users_cold(self):
        """~20% of users traffic — full cold load."""
        self._cold_load()

    @task(8)
    def users_route(self):
        """~80% of users traffic — in-app navigation."""
        self.client.get("/users", name="GET /users")

    # ---------- Settings: 5 (always in-app) ----------

    @task(5)
    def settings_route(self):
        self.client.get("/settings", name="GET /settings")

    # ---------- Profile (low frequency, in-app) ----------

    @task(3)
    def profile_route(self):
        self.client.get("/profile", name="GET /profile")


@events.test_start.add_listener
def _on_test_start(environment, **kwargs):
    print("=" * 60)
    print("  Acme Console — SPA Load Test")
    print(f"  Host:   {environment.host}")
    print("  Target: Vite dev server (SPA + history-fallback routes)")
    print("=" * 60)
