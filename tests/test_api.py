import os
import tempfile
import time

os.environ["DATA_DIR"] = tempfile.mkdtemp()
os.environ["EMAIL_FROM"] = ""

import pytest
from fastapi.testclient import TestClient

import monitor

# No `with` block, so the lifespan (and the background check loop) doesn't start
client = TestClient(monitor.app)


@pytest.fixture(autouse=True)
def fresh_db():
    monitor.init_db()
    with monitor.get_db() as conn:
        conn.execute("DELETE FROM checks")
        conn.execute("DELETE FROM outages")


def add_checks(*checks):
    with monitor.get_db() as conn:
        conn.executemany("INSERT INTO checks (ts, up, latency_ms) VALUES (?, ?, ?)", checks)


def test_status_empty():
    body = client.get("/api/status").json()
    assert body["up"] is None
    assert body["uptime_24h"] is None


def test_status_and_uptime():
    now = time.time()
    add_checks((now - 120, 1, 20.0), (now - 60, 0, None), (now - 30, 1, 25.0), (now - 10, 1, 30.0))
    body = client.get("/api/status").json()
    assert body["up"] is True
    assert body["latency_ms"] == 30.0
    assert body["uptime_24h"] == 75.0


def test_history_filters_by_hours():
    now = time.time()
    add_checks((now - 3 * 3600, 1, 20.0), (now - 60, 1, 25.0))
    assert len(client.get("/api/history?hours=1").json()) == 1
    assert len(client.get("/api/history?hours=24").json()) == 2


def test_outages_newest_first():
    with monitor.get_db() as conn:
        conn.execute("INSERT INTO outages (start, end) VALUES (100, 200)")
        conn.execute("INSERT INTO outages (start) VALUES (300)")
    body = client.get("/api/outages").json()
    assert body == [{"start": 300, "end": None}, {"start": 100, "end": 200}]
