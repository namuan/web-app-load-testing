"""Locust load test for the local SPA using a real headless Chromium browser.

Target:
  http://localhost:5173  (the running Vite dev server)

This is the **real-browser** Locust file. Each `BrowserUser` spawns a
separate Python subprocess (`loadtest/browser_worker.py`) that owns a
real headless Chromium instance. The user sends JSON commands to the
subprocess over stdin and reads JSON results from stdout.

Why a subprocess? Because the Locust master uses gevent, and gevent's
threading monkey-patch makes Playwright's sync API refuse to start
(it thinks it's running inside an asyncio loop). A subprocess gets a
fresh Python interpreter with a clean asyncio state, so the sync API
works as documented. The alternative — `--processes N` to fork Locust
itself — has its own issues and doesn't fix the master side.

Metrics captured per page load:

  - FCP  (First Contentful Paint)   — time until the first DOM content renders
  - LCP  (Largest Contentful Paint) — time until the largest element renders
  - TBT  (Total Blocking Time)       — sum of long-task main-thread blocking
  - TTFB (Time to First Byte)        — server-side response latency
  - CLS  (Cumulative Layout Shift)   — sum of unexpected layout shifts
  - INP  (Interaction to Next Paint) — worst interaction latency
  - TTI  (Time to Interactive)       — app-specific: ms from goto until
                                       the route's test-id is in the DOM
                                       AND the network has been idle for 500ms

Each metric is fired into Locust as a synthetic `events.request` event
with the metric value (in ms; CLS is multiplied by 1000 for percentile
readability) as the "response time". They show up in the Locust report
as e.g. `metric=FCP (dashboard)` with a normal percentile distribution.

Run with one of:

  locust -f loadtest/locustfile_browser.py --host=http://localhost:5173
  locust -f loadtest/locustfile_browser.py --host=http://localhost:5173 --headless -u 5 -r 1 -t 30s

Requires:

  pip install playwright
  playwright install chromium
"""
from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from locust import HttpUser, task, between, events


HOST_DEFAULT = "http://localhost:5173"
SCRIPT_DIR = Path(__file__).parent
WORKER_PATH = SCRIPT_DIR / "browser_worker.py"
PYTHON_BIN = sys.executable  # Use the same Python that's running Locust

# Optional: where the playwright browser cache lives. Most installs
# default to ~/.cache/ms-playwright on Linux or
# ~/Library/Caches/ms-playwright on macOS, but the user can override.
PLAYWRIGHT_BROWSERS_PATH = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")

# Optional: override which Python interpreter runs the worker. Defaults
# to the same one running Locust so we know the env matches.
WORKER_PYTHON = os.environ.get("WORKER_PYTHON", PYTHON_BIN)

# Hard ceiling on concurrent users. Each user is a Chromium + a
# subprocess, so 1 user ≈ 200 MB.
MAX_RECOMMENDED_USERS = 20


# ---------- Routes (path, weight, label) ----------

ROUTES: list[tuple[str, int, str]] = [
    ("/dashboard", 40, "dashboard"),
    ("/reports",   25, "reports"),
    ("/analytics", 20, "analytics"),
    ("/users",     10, "users"),
    ("/settings",   5, "settings"),
    ("/profile",    3, "profile"),
    ("/",           1, "home"),
]


# ---------- The user class ----------

class BrowserUser(HttpUser):
    """One user = one headless Chromium, owned by a worker subprocess."""

    # Brief pause between navigations to mimic real interaction.
    wait_time = between(1.0, 3.0)

    # Subprocess state, set in on_start.
    _proc: subprocess.Popen | None = None
    _stdout_thread: threading.Thread | None = None
    _response_q: queue.Queue | None = None
    _ready_event: threading.Event | None = None
    _stderr_tail: list[str] = None  # type: ignore

    # ---------- Lifecycle ----------

    def on_start(self):
        # Concurrency warning
        target = int(os.environ.get("LOCUST_USERS", "0") or "0")
        if target > MAX_RECOMMENDED_USERS:
            sys.stderr.write(
                f"[locustfile_browser] WARNING: -u {target} will launch "
                f"{target} headless Chromium instances. Each uses ~200 MB. "
                f"Recommended ceiling is {MAX_RECOMMENDED_USERS}.\n"
            )

        if not WORKER_PATH.exists():
            raise RuntimeError(
                f"Browser worker not found at {WORKER_PATH}. "
                f"Make sure loadtest/browser_worker.py exists."
            )

        env = os.environ.copy()
        if PLAYWRIGHT_BROWSERS_PATH:
            env["PLAYWRIGHT_BROWSERS_PATH"] = PLAYWRIGHT_BROWSERS_PATH
        env["SPA_ORIGIN"] = self.host

        self._stderr_tail = []
        self._response_q = queue.Queue()
        self._ready_event = threading.Event()

        # bufsize=1, text mode, line-buffered — so the worker can write
        # JSON lines as soon as they're produced.
        self._proc = subprocess.Popen(
            [WORKER_PYTHON, str(WORKER_PATH)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=1,
            text=True,
            env=env,
        )

        # Start a reader thread that pulls JSON lines off the worker's
        # stdout and dispatches them to the response queue or the
        # ready event.
        self._stdout_thread = threading.Thread(
            target=self._read_stdout_loop,
            name=f"browser-worker-reader-{id(self)}",
            daemon=True,
        )
        self._stdout_thread.start()

        # Start a stderr drainer so the worker's errors don't fill our pipe.
        threading.Thread(
            target=self._drain_stderr,
            args=(self._proc.stderr,),
            name=f"browser-worker-stderr-{id(self)}",
            daemon=True,
        ).start()

        # Wait for the worker to signal it's ready (browser launched, etc).
        # Bound the wait so a stuck worker fails fast.
        if not self._ready_event.wait(timeout=30):
            self._terminate()
            raise RuntimeError("Browser worker failed to become ready within 30s")

    def on_stop(self):
        self._terminate()

    def _terminate(self):
        proc = self._proc
        if not proc:
            return
        try:
            if proc.stdin and not proc.stdin.closed:
                try:
                    proc.stdin.write(json.dumps({"type": "shutdown"}) + "\n")
                    proc.stdin.flush()
                except Exception:
                    pass
        finally:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        self._proc = None

    # ---------- Reader threads (run in real OS threads, NOT greenlets) ----------

    def _read_stdout_loop(self):
        """Read JSON lines from the worker's stdout and dispatch them."""
        assert self._proc and self._proc.stdout
        try:
            for raw_line in self._proc.stdout:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if msg.get("type") == "ready":
                    if self._ready_event:
                        self._ready_event.set()
                    continue
                if self._response_q:
                    self._response_q.put(msg)
        except (ValueError, OSError):
            # Worker process died or pipe closed.
            pass
        finally:
            # Sentinel so any pending get() returns.
            if self._response_q:
                self._response_q.put(None)

    def _drain_stderr(self, stream):
        """Read the worker's stderr so the pipe doesn't fill; keep the
        last 50 lines for debugging if the worker crashes."""
        try:
            assert stream is not None
            for line in iter(stream.readline, ""):
                self._stderr_tail.append(line.rstrip())
                if len(self._stderr_tail) > 50:
                    self._stderr_tail.pop(0)
        except Exception:
            pass

    # ---------- Tasks ----------

    @task(40)
    def load_dashboard(self):
        self._do_navigation("/dashboard", "dashboard")

    @task(25)
    def load_reports(self):
        self._do_navigation("/reports", "reports")

    @task(20)
    def load_analytics(self):
        self._do_navigation("/analytics", "analytics")

    @task(10)
    def load_users(self):
        self._do_navigation("/users", "users")

    @task(5)
    def load_settings(self):
        self._do_navigation("/settings", "settings")

    @task(3)
    def load_profile(self):
        self._do_navigation("/profile", "profile")

    @task(1)
    def load_home(self):
        self._do_navigation("/", "home")

    # ---------- Internals ----------

    def _do_navigation(self, path: str, label: str):
        """Send a navigate command to the worker and report metrics back."""
        if not self._proc or not self._response_q:
            return

        cid = uuid.uuid4().hex
        cmd = json.dumps({"id": cid, "type": "navigate", "path": path}) + "\n"
        try:
            self._proc.stdin.write(cmd)
            self._proc.stdin.flush()
        except (BrokenPipeError, ValueError, OSError) as e:
            # Worker died; re-raise as a Locust failure.
            self._fire_metric("page_load", f"page_load ({label})", 0,
                              success=False, error=f"worker-pipe: {e!r}")
            return

        # Wait for the result. Bound the wait so a hung worker doesn't
        # block the user forever.
        try:
            result = self._response_q.get(timeout=30)
        except queue.Empty:
            self._fire_metric("page_load", f"page_load ({label})", 0,
                              success=False, error="worker-timeout")
            return

        if result is None:
            # Worker process died.
            stderr_excerpt = "\n".join(self._stderr_tail or [])[-800:]
            self._fire_metric("page_load", f"page_load ({label})", 0,
                              success=False, error=f"worker-died: {stderr_excerpt}")
            return

        if not result.get("ok"):
            err = result.get("error") or "worker-error"
            self._fire_metric("page_load", f"page_load ({label})", 0,
                              success=False, error=err)
            return

        nav_ms = int(result.get("nav_ms", 0))
        tti_ms = int(result.get("tti_ms", 0))
        vitals = result.get("vitals") or {}

        # Report page_load and TTI as their own metrics.
        self._fire_metric("page_load", f"page_load ({label})", nav_ms, success=True)
        self._fire_metric("TTI", f"metric=TTI ({label})", tti_ms, success=tti_ms <= 15_000)

        # Report each captured web-vital.
        #
        # 0 is a valid value for CLS / TBT / INP (no event fired). The
        # other three (FCP/LCP/TTFB) should always have a value or
        # the worker is misconfigured.
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
                # CLS is unitless; multiply by 1000 for percentile readability.
                reported = int(value) if metric != "CLS" else int(value * 1000)
                self._fire_metric(metric, f"metric={metric} ({label})", reported, success=True)

    def _fire_metric(self, request_type: str, name: str, response_ms: int,
                     error: str | None = None, success: bool = True):
        """Fire a synthetic Locust request event."""
        try:
            events.request.fire(
                request_type=request_type,
                name=name,
                response_time=max(0, int(response_ms)),
                response_length=0,
                exception=Exception(error) if (not success and error) else None,
                context={},
            )
        except Exception:
            # Runner may have shut down.
            pass


# ---------- Startup banner ----------

@events.test_start.add_listener
def _on_test_start(environment, **kwargs):
    print("=" * 60)
    print("  Acme Console — Browser Load Test (real Chromium via subprocess)")
    print(f"  Host:   {environment.host}")
    print(f"  Worker: {WORKER_PATH}")
    print(f"  Vitals: FCP, LCP, TBT, TTFB, CLS, INP, TTI")
    print(f"  Web vitals source: {'vendored' if (SCRIPT_DIR / 'vendor' / 'web-vitals.iife.js').exists() else 'fallback shim'}")
    print("=" * 60)
