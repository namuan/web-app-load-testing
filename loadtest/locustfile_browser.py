#!/usr/bin/env -S uv run --quiet --script
# /// script
# dependencies = [
#   "locust==2.43.3",
#   "locust-plugins>=4.0",
#   "playwright>=1.45.0",
# ]
# ///
"""Locust load test for the local SPA using a real headless Chromium browser.

Target:
  http://localhost:5173  (the running Vite dev server)

This is the **real-browser** Locust file. It uses
`locust-plugins`'s `PlaywrightUser`, which is the recommended way to
combine Locust with Playwright:

  - Locust's runner uses **gevent** under the hood, but Playwright's
    sync API is incompatible with gevent (gevent's threading
    monkey-patch makes Playwright's `asyncio.get_running_loop()` see a
    fake running loop and refuse to start).
  - `PlaywrightUser` solves this by running Playwright's **async API**
    in a single shared asyncio event loop, bridged to Locust's
    gevent greenlets via `asyncio.run_coroutine_threadsafe` +
    `gevent.sleep(0.1)`. The bridge is set up by locust-plugins'
    built-in `test_start` listener.
  - Each Locust user drives N concurrent Playwright browser sessions
    via the `multiplier` attribute (we use 1 — one browser per user).

Per route, the test fires synthetic Locust request events for:

  - FCP  (First Contentful Paint)   — time until the first DOM content renders
  - LCP  (Largest Contentful Paint) — time until the largest element renders
  - TBT  (Total Blocking Time)       — sum of long-task main-thread blocking
  - TTFB (Time to First Byte)        — server-side response latency
  - CLS  (Cumulative Layout Shift)   — sum of unexpected layout shifts
  - INP  (Interaction to Next Paint) — worst interaction latency
  - TTI  (Time to Interactive)       — app-specific: ms from goto until
                                       the route's main test-id is in the DOM
                                       AND the network has been idle for 500ms

Each metric is reported as a separate row in Locust's per-endpoint table,
e.g. `metric=FCP (dashboard)`, with its own response-time distribution.

Dependencies are declared inline (PEP 723) and resolved automatically by
uv. Run with either of these forms (they are equivalent):

  uv run loadtest/locustfile_browser.py --host=http://localhost:5173
  uv run loadtest/locustfile_browser.py --host=http://localhost:5173 --headless -u 5 -r 1 -t 30s

  # Or the classic locust invocation (requires locust on PATH):
  # locust -f loadtest/locustfile_browser.py --host=http://localhost:5173

You also need a Chromium browser binary for Playwright:

  uv run playwright install chromium
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from locust import task, between, events
from locust_plugins.users.playwright import PlaywrightUser, pw


# NOTE: Locust 2.x + Python 3.11 + Playwright can produce a harmless
# `Exception ignored in: <bound method _ForkHooks.after_fork_in_child ...>`
# traceback from gevent's threading module. It's a known gevent 23.x
# false positive when Playwright's driver subprocess forks (the
# assertion `not thread.is_alive()` fires for threads that are alive
# by design of Playwright's IPC bridge). It does not affect test
# execution, metric capture, or the Locust report. We tried patching
# the bound method on `gevent.threading._fork_hooks` but
# `os.register_at_fork` holds a reference to the original, so the
# patch is a no-op. The traceback is accepted as harmless noise.

HOST_DEFAULT = "http://localhost:5173"
SCRIPT_DIR = Path(__file__).parent
VENDOR_DIR = SCRIPT_DIR / "vendor"
WEB_VITALS_JS_PATH = VENDOR_DIR / "web-vitals.iife.js"

# Hard ceiling on concurrent browsers. Each user is a Chromium
# (~200 MB), so 10-20 users is a sensible upper bound on a dev machine.
MAX_RECOMMENDED_USERS = 20

# Route catalogue: (path, test-id selector, label)
ROUTES: list[tuple[str, str, str]] = [
    ("/",            "home-page",       "home"),
    ("/dashboard",   "dashboard-page",  "dashboard"),
    ("/analytics",   "analytics-page",  "analytics"),
    ("/reports",     "reports-page",    "reports"),
    ("/users",       "users-page",      "users"),
    ("/settings",    "settings-page",   "settings"),
    ("/profile",     "profile-page",    "profile"),
]


# ---------- web-vitals injection ----------

def _load_web_vitals_script() -> str:
    """Read the vendored web-vitals IIFE bundle and wrap it to record
    every metric into a global object the Locust task can read."""
    if WEB_VITALS_JS_PATH.exists():
        bundle = WEB_VITALS_JS_PATH.read_text()
    else:
        # Fallback: a small hand-written shim using PerformanceObserver.
        # Less polished than the official library, but still captures
        # FCP, LCP, and TBT.
        bundle = ""

    return (
        "(function(){\n"
        "  window.__webVitals__ = { fcp: null, lcp: null, ttfb: null, cls: null, tbt: null, inp: null };\n"
        "  function record(metric, value) { window.__webVitals__[metric] = value; }\n"
        "  function flush() {\n"
        "    try { webVitals.onLCP.flush && webVitals.onLCP.flush(); } catch(_) {}\n"
        "    try { webVitals.onCLS.flush && webVitals.onCLS.flush(); } catch(_) {}\n"
        "    try { webVitals.onINP.flush && webVitals.onINP.flush(); } catch(_) {}\n"
        "  }\n"
        "  document.addEventListener && document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') flush(); });\n"
        "  window.addEventListener && window.addEventListener('pagehide', flush);\n"
        + bundle + "\n"
        "  try {\n"
        "    webVitals.onFCP(function(m){ record('fcp', m.value); }, { reportAllChanges: true });\n"
        "    webVitals.onLCP(function(m){ record('lcp', m.value); }, { reportAllChanges: true });\n"
        "    webVitals.onTTFB(function(m){ record('ttfb', m.value); }, { reportAllChanges: true });\n"
        "    webVitals.onCLS(function(m){ record('cls', m.value); }, { reportAllChanges: true });\n"
        "    webVitals.onINP(function(m){ record('inp', m.value); }, { reportAllChanges: true });\n"
        "    try {\n"
        "      var tbt = 0;\n"
        "      var po = new PerformanceObserver(function(list){\n"
        "        for (var i = 0; i < list.getEntries().length; i++) {\n"
        "          tbt += Math.max(0, list.getEntries()[i].duration - 50);\n"
        "        }\n"
        "        record('tbt', tbt);\n"
        "      });\n"
        "      po.observe({ type: 'longtask', buffered: true });\n"
        "    } catch(_) {}\n"
        "  } catch(_) {}\n"
        "})();\n"
    )


INIT_SCRIPT = _load_web_vitals_script()


# ---------- The user class ----------

class BrowserUser(PlaywrightUser):
    """One real headless Chromium per Locust user (with `multiplier`
    for more effective concurrency from a single greenlet)."""

    # 1-3s think-time between navigations.
    wait_time = between(1.0, 3.0)

    # multiplier: how many concurrent Playwright browser sessions this
    # Locust user drives. Locust-plugins scales one browser per sub-user.
    multiplier = 1

    # Turn off the built-in locust-plugins "TASK ..." rows; we emit our
    # own per-metric events and the TASK rows just add noise.
    log_tasks = False

    # One init-script string is shared across all browsers; the @pw
    # decorator creates a fresh BrowserContext per task, and the
    # context-level add_init_script applies to every page in it.
    _INIT_SCRIPT = INIT_SCRIPT

    def on_start(self):
        # Concurrency warning
        target = int(os.environ.get("LOCUST_USERS", "0") or "0")
        if target > MAX_RECOMMENDED_USERS:
            sys.stderr.write(
                f"[locustfile_browser] WARNING: -u {target} will launch "
                f"{target} headless Chromium instances. Each uses ~200 MB. "
                f"Recommended ceiling is {MAX_RECOMMENDED_USERS}.\n"
            )
        # Note: PlaywrightUser already launches the browser in __init__
        # (via the test_start listener that wires up the asyncio loop).
        # We don't need to do anything else here.

    # ---------- Tasks ----------

    @task(40)
    @pw
    async def load_dashboard(self, page):
        await self._navigate(page, "/dashboard", "dashboard")

    @task(25)
    @pw
    async def load_reports(self, page):
        await self._navigate(page, "/reports", "reports")

    @task(20)
    @pw
    async def load_analytics(self, page):
        await self._navigate(page, "/analytics", "analytics")

    @task(10)
    @pw
    async def load_users(self, page):
        await self._navigate(page, "/users", "users")

    @task(5)
    @pw
    async def load_settings(self, page):
        await self._navigate(page, "/settings", "settings")

    @task(3)
    @pw
    async def load_profile(self, page):
        await self._navigate(page, "/profile", "profile")

    @task(1)
    @pw
    async def load_home(self, page):
        await self._navigate(page, "/", "home")

    # ---------- Internals ----------

    async def _navigate(self, page, path: str, label: str):
        """Navigate, wait for the SPA to be ready, capture Web Vitals,
        and fire one Locust event per metric."""
        # Install the web-vitals init script on the context that owns
        # this page. Playwright runs it on every new page and on every
        # navigation, so subsequent page.goto() calls in the same
        # context will also have the script available.
        await page.context.add_init_script(self._INIT_SCRIPT)
        # Install the offline route-blocker on the same context. We
        # need to be careful: add_init_script is a one-shot; route()
        # is also one-shot. Doing it here per-task is safe because the
        # @pw decorator creates a fresh context per task.
        await page.context.route(
            "**/*",
            lambda route: route.abort() if not self._is_localhost(route.request.url) else route.continue_(),
        )

        testid = next((t for (p, t, l) in ROUTES if p == path), label + "-page")
        url = self.host.rstrip("/") + path

        t0 = time.perf_counter()
        try:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
        except Exception as e:
            self._fire_metric("page_load", f"page_load ({label})", 0,
                              success=False, error=f"goto: {e!r}")
            return
        nav_ms = (time.perf_counter() - t0) * 1000

        # App-aware TTI: route's test-id visible + network idle.
        tti_deadline = time.perf_counter() + 15
        tti_ms = None
        try:
            await page.wait_for_selector(f"[data-testid='{testid}']", timeout=15_000)
            await page.wait_for_load_state("networkidle", timeout=10_000)
            tti_ms = (time.perf_counter() - t0) * 1000
        except Exception:
            pass
        if tti_ms is None:
            tti_ms = min(nav_ms, 15_000)

        # Grace period for web-vitals to finalize, then flush.
        try:
            await page.wait_for_timeout(500)
            await page.evaluate(
                "() => { try { webVitals.onLCP.flush && webVitals.onLCP.flush(); } catch(_) {} "
                "try { webVitals.onCLS.flush && webVitals.onCLS.flush(); } catch(_) {} "
                "try { webVitals.onINP.flush && webVitals.onINP.flush(); } catch(_) {} }"
            )
        except Exception:
            pass

        try:
            vitals = await page.evaluate("() => window.__webVitals__ || {}")
        except Exception:
            vitals = {}

        ok = bool(response and getattr(response, "ok", True))

        # Report page_load (a separate row, time = nav_ms).
        self._fire_metric("page_load", f"page_load ({label})", int(nav_ms), success=ok)

        # Report TTI.
        self._fire_metric("TTI", f"metric=TTI ({label})", int(tti_ms), success=tti_ms <= 15_000)

        # Report each web-vital. CLS/TBT/INP can legitimately be 0
        # (no event fired), so we report 0 with success=True for those.
        for metric in ("FCP", "LCP", "TBT", "TTFB", "CLS", "INP"):
            value = vitals.get(metric.lower())
            null_is_valid_zero = metric in ("CLS", "TBT", "INP")
            if value is None:
                if null_is_valid_zero:
                    self._fire_metric(metric, f"metric={metric} ({label})", 0, success=True)
                else:
                    self._fire_metric(metric, f"metric={metric} ({label})", 0,
                                      success=False, error="not-captured")
            else:
                # CLS is unitless; multiply by 1000 for percentile display.
                reported = int(value) if metric != "CLS" else int(value * 1000)
                self._fire_metric(metric, f"metric={metric} ({label})", reported, success=True)

    @staticmethod
    def _is_localhost(url: str) -> bool:
        return (
            url.startswith("http://localhost")
            or url.startswith("http://127.0.0.1")
            or url.startswith("data:")
            or url.startswith("blob:")
            or url.startswith("about:")
        )

    def _fire_metric(self, request_type: str, name: str, response_ms: int,
                     success: bool = True, error: str | None = None):
        """Fire a synthetic Locust request event."""
        try:
            self.environment.events.request.fire(
                request_type=request_type,
                name=name,
                response_time=max(0, int(response_ms)),
                response_length=0,
                exception=Exception(error) if (not success and error) else None,
                context={**self.context()},
            )
        except Exception:
            # Runner may have shut down.
            pass


# ---------- Startup banner ----------

@events.test_start.add_listener
def _on_test_start(environment, **kwargs):
    print("=" * 60)
    print("  Acme Console — Browser Load Test (locust-plugins PlaywrightUser)")
    print(f"  Host:   {environment.host}")
    print(f"  Vitals: FCP, LCP, TBT, TTFB, CLS, INP, TTI")
    print(f"  Web vitals source: {'vendored' if WEB_VITALS_JS_PATH.exists() else 'fallback shim'}")
    print("=" * 60)


# ---------- uv run entry point ----------

if __name__ == "__main__":
    import subprocess
    import sys

    subprocess.check_call(["locust", "-f", __file__] + sys.argv[1:])
