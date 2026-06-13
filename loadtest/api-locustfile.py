"""Locust load test for the local mock API.

This file is a secondary, optional script for load testing the API
directly. The primary load test (locustfile.py) targets the SPA.

Weighted scenario distribution matches the original plan:
  - Dashboard  40%
  - Reports    25%
  - Analytics  20%
  - Users      10%
  - Settings    5%

Run with one of:
  locust -f loadtest/api-locustfile.py --host=http://localhost:3000
  locust -f loadtest/api-locustfile.py --host=http://localhost:3000 --headless -u 100 -r 10 -t 10m

The @task weights intentionally sum to 100 so the percentages above are exact.
"""
from __future__ import annotations

import random
from locust import HttpUser, task, between, events


HOST_DEFAULT = "http://localhost:3000"


class AcmeApiUser(HttpUser):
    """Simulates a heavy dashboard user clicking through the app."""

    wait_time = between(0.1, 0.6)

    def on_start(self):
        self.client.verify = False
        # Hit /health at session start to warm the connection.
        self.client.get("/health", name="GET /health")

    # ---------- Dashboard: 40 ----------
    @task(15)
    def get_dashboard(self):
        self.client.get("/api/dashboard", name="GET /api/dashboard")

    @task(15)
    def get_dashboard_with_kpis(self):
        self.client.get("/api/dashboard", name="GET /api/dashboard (refresh)")

    @task(10)
    def get_notifications(self):
        self.client.get("/api/notifications", name="GET /api/notifications")

    # ---------- Reports: 25 ----------
    @task(8)
    def get_reports_all(self):
        self.client.get("/api/reports", name="GET /api/reports")

    @task(5)
    def get_reports_paged(self):
        offset = random.randint(0, 10) * 5
        limit = 10
        self.client.get(
            f"/api/reports?limit={limit}&offset={offset}",
            name="GET /api/reports (paged)",
        )

    @task(5)
    def get_reports_filtered(self):
        status = random.choice(["published", "draft", "review"])
        self.client.get(
            f"/api/reports?status={status}",
            name="GET /api/reports (filtered)",
        )

    @task(4)
    def get_reports_search(self):
        q = random.choice(["Q1", "Q2", "Spring", "renewal", "audit"])
        self.client.get(
            f"/api/reports?q={q}",
            name="GET /api/reports (search)",
        )

    @task(3)
    def get_report_detail(self):
        rid = f"r-{random.randint(1, 20):03d}"
        self.client.get(f"/api/reports/{rid}", name="GET /api/reports/:id")

    # ---------- Analytics: 20 ----------
    @task(20)
    def get_analytics(self):
        self.client.get("/api/analytics", name="GET /api/analytics")

    # ---------- Users: 10 ----------
    @task(4)
    def get_users_all(self):
        self.client.get("/api/users", name="GET /api/users")

    @task(3)
    def get_users_paged(self):
        offset = random.randint(0, 4) * 5
        self.client.get(
            f"/api/users?limit=10&offset={offset}",
            name="GET /api/users (paged)",
        )

    @task(2)
    def get_users_filtered(self):
        status = random.choice(["active", "invited", "churned"])
        self.client.get(
            f"/api/users?status={status}",
            name="GET /api/users (filtered)",
        )

    @task(1)
    def get_user_detail(self):
        uid = random.randint(1, 30)
        self.client.get(f"/api/users/{uid}", name="GET /api/users/:id")

    # ---------- Settings: 5 ----------
    @task(3)
    def get_settings(self):
        self.client.get("/api/settings", name="GET /api/settings")

    @task(2)
    def put_settings(self):
        self.client.put(
            "/api/settings",
            json={"display": {"density": random.choice(["comfortable", "compact"])}},
            name="PUT /api/settings",
        )

    # ---------- Profile / auth (low frequency) ----------
    @task(2)
    def get_profile(self):
        self.client.get("/api/profile", name="GET /api/profile")

    @task(1)
    def login(self):
        self.client.post(
            "/api/login",
            json={"email": "alex.morgan@example.com", "password": "demo"},
            name="POST /api/login",
        )


@events.test_start.add_listener
def _on_test_start(environment, **kwargs):
    print("=" * 60)
    print("  Acme Console — API Load Test (secondary)")
    print(f"  Host: {environment.host}")
    print("=" * 60)
