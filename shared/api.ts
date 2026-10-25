// API client shared by the web and mobile apps

export interface Status {
  up: boolean | null;
  last_check: number | null;
  latency_ms: number | null;
  down_since: number | null;
  uptime_24h: number | null;
  check_interval: number;
}

export interface Check {
  ts: number;
  up: boolean;
  latency_ms: number | null;
}

export interface Outage {
  start: number;
  end: number | null;
}

export function createClient(baseUrl = "") {
  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  return {
    status: () => get<Status>("/api/status"),
    history: (hours = 24) => get<Check[]>(`/api/history?hours=${hours}`),
    outages: (limit = 50) => get<Outage[]>(`/api/outages?limit=${limit}`),
  };
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
