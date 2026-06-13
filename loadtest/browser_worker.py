#!/usr/bin/env python3
"""Browser worker subprocess for the Locust load test.

This is a long-running Python subprocess that one `BrowserUser` instance
in the Locust master process talks to. Each worker:

  - Owns one real headless Chromium instance.
  - Listens on stdin for newline-delimited JSON commands.
  - Performs a navigation + vitals capture per command.
  - Writes the captured metrics back to stdout as JSON lines.

Why a subprocess? Because the Locust master uses gevent + greenlets,
which is incompatible with Playwright's sync API (gevent's threading
monkey-patch makes Playwright's `asyncio.get_running_loop()` return a
greenlet-hub loop, and Playwright then refuses to start). A subprocess
gets a fresh Python interpreter with a clean asyncio state, so the
sync API works as documented.

Communication protocol (newline-delimited JSON):

  Command (master → worker stdin):
    {"id": "<correlation id>", "type": "navigate", "path": "/dashboard"}

  Response (worker → master stdout):
    {"id": "<correlation id>",
     "ok": true,
     "nav_ms": 120,
     "tti_ms": 644,
     "vitals": {"fcp": 144, "lcp": 176, "tbt": 0, "ttfb": 4, "cls": 0, "inp": null},
     "page_error": null}

  Or, on failure:
    {"id": "<correlation id>", "ok": false, "error": "..."}

Run standalone for debugging:

  echo '{"id":"t1","type":"navigate","path":"/dashboard"}' | \\
    python loadtest/browser_worker.py
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any

# Load the web-vitals init script and the offline route-blocker from
# the parent project, since they're identical for every worker.
VENDOR_DIR = Path(__file__).parent / "vendor"
WEB_VITALS_JS_PATH = VENDOR_DIR / "web-vitals.iife.js"
SPA_ORIGIN = os.environ.get("SPA_ORIGIN", "http://localhost:5173")
ROUTES = {
    "/": "home-page",
    "/dashboard": "dashboard-page",
    "/analytics": "analytics-page",
    "/reports": "reports-page",
    "/users": "users-page",
    "/settings": "settings-page",
    "/profile": "profile-page",
}


def _load_web_vitals_script() -> str:
    if WEB_VITALS_JS_PATH.exists():
        bundle = WEB_VITALS_JS_PATH.read_text()
    else:
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


INJECT_SCRIPT = _load_web_vitals_script()


def _offline_route_handler(route):
    """Block any non-localhost request — mirrors the Playwright E2E policy."""
    url = route.request.url
    if (
        url.startswith("http://localhost")
        or url.startswith("http://127.0.0.1")
        or url.startswith("data:")
        or url.startswith("blob:")
        or url.startswith("about:")
    ):
        route.continue_()
    else:
        route.abort()


def _navigate(playwright_page, path: str) -> dict[str, Any]:
    """Navigate to `path`, wait for the SPA to be ready, return metrics."""
    testid = ROUTES.get(path, path.strip("/") + "-page")
    url = SPA_ORIGIN.rstrip("/") + path

    t0 = time.perf_counter()
    page_error = None
    try:
        response = playwright_page.goto(url, wait_until="domcontentloaded", timeout=20_000)
    except Exception as e:
        return {
            "ok": False,
            "error": f"goto: {e!r}",
            "nav_ms": (time.perf_counter() - t0) * 1000,
            "tti_ms": None,
            "vitals": {},
        }

    nav_ms = (time.perf_counter() - t0) * 1000

    tti_ms = None
    try:
        playwright_page.wait_for_selector(f"[data-testid='{testid}']", timeout=15_000)
        playwright_page.wait_for_load_state("networkidle", timeout=10_000)
        tti_ms = (time.perf_counter() - t0) * 1000
    except Exception as e:
        page_error = repr(e)
    if tti_ms is None:
        tti_ms = min(nav_ms, 15_000)

    # Give web-vitals a moment, then flush.
    try:
        playwright_page.wait_for_timeout(500)
        playwright_page.evaluate(
            "() => { try { webVitals.onLCP.flush && webVitals.onLCP.flush(); } catch(_) {} "
            "try { webVitals.onCLS.flush && webVitals.onCLS.flush(); } catch(_) {} "
            "try { webVitals.onINP.flush && webVitals.onINP.flush(); } catch(_) {} }"
        )
    except Exception:
        pass

    try:
        vitals = playwright_page.evaluate("() => window.__webVitals__ || {}")
    except Exception:
        vitals = {}

    return {
        "ok": response is not None and (not hasattr(response, "ok") or response.ok),
        "nav_ms": int(nav_ms),
        "tti_ms": int(tti_ms),
        "vitals": {k: vitals.get(k) for k in ("fcp", "lcp", "tbt", "ttfb", "cls", "inp")},
        "page_error": page_error,
    }


def main():
    from playwright.sync_api import sync_playwright

    # Lazy-import so importing this file in the master process (to
    # discover the executable path) doesn't try to launch a browser.
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        context.route("**/*", _offline_route_handler)
        page = context.new_page()
        page.add_init_script(INJECT_SCRIPT)

        # Announce we're ready by writing a hello line on stdout.
        sys.stdout.write(json.dumps({"type": "ready"}) + "\n")
        sys.stdout.flush()

        # Main command loop: read JSON lines from stdin, dispatch, write result.
        try:
            for raw_line in sys.stdin:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    cmd = json.loads(line)
                except json.JSONDecodeError as e:
                    sys.stdout.write(json.dumps({"ok": False, "error": f"bad json: {e!r}"}) + "\n")
                    sys.stdout.flush()
                    continue

                if cmd.get("type") == "shutdown":
                    break

                cid = cmd.get("id", "")
                cmd_type = cmd.get("type")
                if cmd_type == "navigate":
                    path = cmd.get("path", "/")
                    try:
                        result = _navigate(page, path)
                        result["id"] = cid
                        sys.stdout.write(json.dumps(result) + "\n")
                        sys.stdout.flush()
                    except Exception as e:
                        sys.stdout.write(
                            json.dumps(
                                {
                                    "id": cid,
                                    "ok": False,
                                    "error": f"navigate crashed: {e!r}",
                                    "trace": traceback.format_exc(limit=3),
                                }
                            )
                            + "\n"
                        )
                        sys.stdout.flush()
                else:
                    sys.stdout.write(
                        json.dumps({"id": cid, "ok": False, "error": f"unknown command type: {cmd_type!r}"})
                        + "\n"
                    )
                    sys.stdout.flush()
        except (EOFError, KeyboardInterrupt):
            pass
        finally:
            try:
                context.close()
            except Exception:
                pass
            try:
                browser.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()
