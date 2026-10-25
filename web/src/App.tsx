import { useEffect, useState } from "react";
import { createClient, formatDuration, formatTime, type Check, type Outage, type Status } from "../../shared/api";
import LatencyChart from "./LatencyChart";

const api = createClient();
const REFRESH_MS = 15_000;

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [history, setHistory] = useState<Check[]>([]);
  const [outages, setOutages] = useState<Outage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, h, o] = await Promise.all([api.status(), api.history(24), api.outages(20)]);
        setStatus(s);
        setHistory(h);
        setOutages(o);
        setError(null);
      } catch (e) {
        setError(`Can't reach the monitor: ${(e as Error).message}`);
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const now = Date.now() / 1000;
  const state = status?.up == null ? "unknown" : status.up ? "up" : "down";

  return (
    <main>
      <h1>Internet Monitor</h1>
      {error && <div className="error">{error}</div>}

      <section className={`hero ${state}`}>
        <span className="dot" />
        <div>
          <div className="hero-title">
            {state === "up" ? "Online" : state === "down" ? "Offline" : "Waiting for first check…"}
          </div>
          {status?.down_since && <div className="muted">Down for {formatDuration(now - status.down_since)}</div>}
          {status?.last_check && <div className="muted">Last checked {formatTime(status.last_check)}</div>}
        </div>
      </section>

      <section className="stats">
        <Stat label="Latency" value={status?.latency_ms != null ? `${Math.round(status.latency_ms)} ms` : "–"} />
        <Stat label="Uptime (24h)" value={status?.uptime_24h != null ? `${status.uptime_24h.toFixed(2)}%` : "–"} />
        <Stat label="Outages (shown)" value={String(outages.length)} />
      </section>

      <section className="card">
        <h2>Last 24 hours</h2>
        <LatencyChart checks={history} />
      </section>

      <section className="card">
        <h2>Recent outages</h2>
        {outages.length === 0 ? (
          <p className="muted">No outages recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Ended</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {outages.map((o) => (
                <tr key={o.start}>
                  <td>{formatTime(o.start)}</td>
                  <td>{o.end ? formatTime(o.end) : <span className="badge">Ongoing</span>}</td>
                  <td>{formatDuration((o.end ?? now) - o.start)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat">
      <div className="muted">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
