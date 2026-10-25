import type { Check } from "../../shared/api";

const W = 800;
const H = 160;
const PAD = 4;

// Latency line with red bands wherever a check failed
export default function LatencyChart({ checks }: { checks: Check[] }) {
  if (checks.length < 2) return <p className="muted">Not enough data yet.</p>;

  const t0 = checks[0].ts;
  const t1 = checks[checks.length - 1].ts;
  const maxLatency = Math.max(50, ...checks.map((c) => c.latency_ms ?? 0));
  const x = (ts: number) => ((ts - t0) / (t1 - t0 || 1)) * W;
  const y = (ms: number) => H - PAD - (ms / maxLatency) * (H - PAD * 2);

  // Break the line at failed checks so gaps are visible
  let path = "";
  let penDown = false;
  for (const c of checks) {
    if (c.latency_ms == null) {
      penDown = false;
      continue;
    }
    path += `${penDown ? "L" : "M"}${x(c.ts).toFixed(1)},${y(c.latency_ms).toFixed(1)}`;
    penDown = true;
  }

  const step = (t1 - t0) / checks.length;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Latency over the last 24 hours">
        {checks
          .filter((c) => !c.up)
          .map((c) => (
            <rect key={c.ts} x={x(c.ts)} y={0} width={Math.max(2, x(c.ts + step) - x(c.ts))} height={H} className="down-band" />
          ))}
        <path d={path} className="latency-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chart-axis muted">
        <span>{new Date(t0 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        <span>peak {Math.round(maxLatency)} ms</span>
        <span>now</span>
      </div>
    </div>
  );
}
