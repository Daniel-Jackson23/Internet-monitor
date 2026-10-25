import os
import smtplib
import socket
import sqlite3
import threading
import time
from contextlib import asynccontextmanager
from email.message import EmailMessage
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

CHECK_HOST = os.getenv("CHECK_HOST", "8.8.8.8")
CHECK_PORT = int(os.getenv("CHECK_PORT", "53"))
CHECK_INTERVAL = int(os.getenv("CHECK_INTERVAL", "60"))
DATA_DIR = Path(os.getenv("DATA_DIR", "data"))
WEB_DIST = Path(__file__).parent / "web" / "dist"

DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "monitor.db"
db_lock = threading.Lock()


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db_lock, get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS checks (
                ts REAL NOT NULL,
                up INTEGER NOT NULL,
                latency_ms REAL
            );
            CREATE INDEX IF NOT EXISTS idx_checks_ts ON checks(ts);
            CREATE TABLE IF NOT EXISTS outages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start REAL NOT NULL,
                end REAL
            );
        """)


def check_connection():
    """Returns latency in ms if connected, otherwise None."""
    start = time.perf_counter()
    try:
        with socket.create_connection((CHECK_HOST, CHECK_PORT), timeout=5):
            return (time.perf_counter() - start) * 1000
    except OSError:
        return None


def send_email(outage_start, outage_end):
    if not os.getenv("EMAIL_FROM"):
        return
    fmt = "%Y-%m-%d %H:%M:%S"
    minutes = (outage_end - outage_start) / 60
    msg = EmailMessage()
    msg.set_content(
        f"Your internet connection was down from {time.strftime(fmt, time.localtime(outage_start))} "
        f"to {time.strftime(fmt, time.localtime(outage_end))} ({minutes:.1f} minutes)."
    )
    msg["Subject"] = "Internet Outage Report"
    msg["From"] = os.getenv("EMAIL_FROM")
    msg["To"] = os.getenv("EMAIL_TO")

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as smtp:
        smtp.login(os.getenv("EMAIL_FROM"), os.getenv("EMAIL_PASS"))
        smtp.send_message(msg)


def monitor_loop():
    while True:
        now = time.time()
        latency = check_connection()
        up = latency is not None
        print(f"Internet is {'up' if up else 'DOWN'}" + (f" ({latency:.0f} ms)" if up else ""), flush=True)

        ended_outage = None
        with db_lock, get_db() as conn:
            conn.execute("INSERT INTO checks (ts, up, latency_ms) VALUES (?, ?, ?)", (now, int(up), latency))
            open_outage = conn.execute("SELECT id, start FROM outages WHERE end IS NULL").fetchone()
            if not up and open_outage is None:
                conn.execute("INSERT INTO outages (start) VALUES (?)", (now,))
            elif up and open_outage is not None:
                conn.execute("UPDATE outages SET end = ? WHERE id = ?", (now, open_outage["id"]))
                ended_outage = (open_outage["start"], now)

        # Email once the connection is back - it can't be sent while the internet is down
        if ended_outage:
            try:
                send_email(*ended_outage)
            except (smtplib.SMTPException, OSError) as e:
                print(f"Failed to send email: {e}", flush=True)

        time.sleep(CHECK_INTERVAL)


@asynccontextmanager
async def lifespan(app):
    init_db()
    threading.Thread(target=monitor_loop, daemon=True).start()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])


@app.get("/api/status")
def status():
    since = time.time() - 24 * 3600
    with get_db() as conn:
        last = conn.execute("SELECT * FROM checks ORDER BY ts DESC LIMIT 1").fetchone()
        totals = conn.execute("SELECT COUNT(*) AS total, SUM(up) AS up FROM checks WHERE ts >= ?", (since,)).fetchone()
        open_outage = conn.execute("SELECT start FROM outages WHERE end IS NULL").fetchone()
    return {
        "up": bool(last["up"]) if last else None,
        "last_check": last["ts"] if last else None,
        "latency_ms": last["latency_ms"] if last else None,
        "down_since": open_outage["start"] if open_outage else None,
        "uptime_24h": (totals["up"] / totals["total"] * 100) if totals["total"] else None,
        "check_interval": CHECK_INTERVAL,
    }


@app.get("/api/history")
def history(hours: float = 24):
    since = time.time() - hours * 3600
    with get_db() as conn:
        rows = conn.execute("SELECT ts, up, latency_ms FROM checks WHERE ts >= ? ORDER BY ts", (since,)).fetchall()
    return [{"ts": r["ts"], "up": bool(r["up"]), "latency_ms": r["latency_ms"]} for r in rows]


@app.get("/api/outages")
def outages(limit: int = 50):
    with get_db() as conn:
        rows = conn.execute("SELECT start, end FROM outages ORDER BY start DESC LIMIT ?", (limit,)).fetchall()
    return [{"start": r["start"], "end": r["end"]} for r in rows]


if WEB_DIST.exists():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8090")))
