import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { createClient, formatDuration, formatTime, type Check, type Outage, type Status } from "../shared/api";

const REFRESH_MS = 15_000;
const SERVER_KEY = "serverUrl";
const MONITOR_PORT = 8090;
// Placeholder addresses older versions could have saved
const STALE_URLS = ["http://192.168.1.10:8000", "http://192.168.1.10:8080"];

// In development the monitor usually runs on the same PC as the Expo dev server
function guessServerUrl(): string | null {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:${MONITOR_PORT}` : null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Monitor />
    </SafeAreaProvider>
  );
}

function Monitor() {
  const scheme = useColorScheme();
  const c = scheme === "dark" ? dark : light;

  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState(() => guessServerUrl() ?? `http://192.168.0.100:${MONITOR_PORT}`);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [history, setHistory] = useState<Check[]>([]);
  const [outages, setOutages] = useState<Outage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    AsyncStorage.getItem(SERVER_KEY).then((saved) => {
      const url = saved && !STALE_URLS.includes(saved) ? saved : guessServerUrl();
      if (url) {
        setServerUrl(url);
        setDraftUrl(url);
      } else {
        setEditing(true);
      }
    });
  }, []);

  const api = useMemo(() => (serverUrl ? createClient(serverUrl) : null), [serverUrl]);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const [s, h, o] = await Promise.all([api.status(), api.history(24), api.outages(20)]);
      setStatus(s);
      setHistory(h);
      setOutages(o);
      setError(null);
      setNow(Date.now() / 1000);
    } catch (e) {
      setError(`Can't reach the monitor at ${serverUrl}: ${(e as Error).message}`);
    }
  }, [api, serverUrl]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const saveServer = async () => {
    const url = draftUrl.trim().replace(/\/+$/, "");
    await AsyncStorage.setItem(SERVER_KEY, url);
    setServerUrl(url);
    setEditing(false);
  };

  const state = status?.up == null ? "unknown" : status.up ? "up" : "down";
  const dotColor = state === "up" ? c.up : state === "down" ? c.down : c.muted;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.bg }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.text }]}>Internet Monitor</Text>
          <Pressable onPress={() => setEditing(!editing)}>
            <Text style={{ color: c.accent }}>{editing ? "Close" : "Server"}</Text>
          </Pressable>
        </View>

        {editing && (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.muted, { color: c.muted }]}>Monitor address on your network</Text>
            <TextInput
              value={draftUrl}
              onChangeText={setDraftUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, { color: c.text, borderColor: c.border }]}
            />
            <Pressable onPress={saveServer} style={[styles.button, { backgroundColor: c.accent }]}>
              <Text style={styles.buttonText}>Save</Text>
            </Pressable>
          </View>
        )}

        {error && (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.down }]}>
            <Text style={{ color: c.text }}>{error}</Text>
          </View>
        )}

        <View style={[styles.card, styles.hero, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <View>
            <Text style={[styles.heroTitle, { color: c.text }]}>
              {state === "up" ? "Online" : state === "down" ? "Offline" : "No data yet"}
            </Text>
            {status?.down_since != null && (
              <Text style={[styles.muted, { color: c.muted }]}>Down for {formatDuration(now - status.down_since)}</Text>
            )}
            {status?.last_check != null && (
              <Text style={[styles.muted, { color: c.muted }]}>Last checked {formatTime(status.last_check)}</Text>
            )}
          </View>
        </View>

        <View style={styles.stats}>
          <Stat c={c} label="Latency" value={status?.latency_ms != null ? `${Math.round(status.latency_ms)} ms` : "–"} />
          <Stat c={c} label="Uptime 24h" value={status?.uptime_24h != null ? `${status.uptime_24h.toFixed(2)}%` : "–"} />
        </View>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Last 24 hours</Text>
          <Timeline checks={history} now={now} c={c} />
        </View>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Recent outages</Text>
          {outages.length === 0 ? (
            <Text style={[styles.muted, { color: c.muted }]}>No outages recorded.</Text>
          ) : (
            outages.map((o) => (
              <View key={o.start} style={[styles.row, { borderColor: c.border }]}>
                <Text style={{ color: c.text }}>{formatTime(o.start)}</Text>
                <Text style={{ color: o.end ? c.muted : c.down }}>
                  {o.end ? formatDuration(o.end - o.start) : "Ongoing"}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type Colors = typeof light;

function Stat({ c, label, value }: { c: Colors; label: string; value: string }) {
  return (
    <View style={[styles.card, styles.stat, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.muted, { color: c.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

// 24h up/down strip: checks grouped into buckets, a bucket is red if any check in it failed
function Timeline({ checks, now, c }: { checks: Check[]; now: number; c: Colors }) {
  const BUCKETS = 48;
  if (checks.length === 0) return <Text style={[styles.muted, { color: c.muted }]}>Not enough data yet.</Text>;

  const end = now;
  const start = end - 24 * 3600;
  const buckets: ("up" | "down" | "none")[] = Array(BUCKETS).fill("none");
  for (const check of checks) {
    const i = Math.min(BUCKETS - 1, Math.floor(((check.ts - start) / (end - start)) * BUCKETS));
    if (i < 0) continue;
    if (!check.up) buckets[i] = "down";
    else if (buckets[i] === "none") buckets[i] = "up";
  }

  return (
    <View>
      <View style={styles.timeline}>
        {buckets.map((b, i) => (
          <View
            key={i}
            style={[styles.bucket, { backgroundColor: b === "up" ? c.up : b === "down" ? c.down : c.border }]}
          />
        ))}
      </View>
      <View style={styles.row}>
        <Text style={[styles.muted, { color: c.muted }]}>24h ago</Text>
        <Text style={[styles.muted, { color: c.muted }]}>now</Text>
      </View>
    </View>
  );
}

const light = {
  bg: "#f6f7f9",
  card: "#ffffff",
  text: "#16181d",
  muted: "#6b7280",
  border: "#e5e7eb",
  up: "#16a34a",
  down: "#dc2626",
  accent: "#2563eb",
};

const dark: Colors = {
  bg: "#0f1115",
  card: "#181b21",
  text: "#e8eaed",
  muted: "#9aa0a6",
  border: "#2a2e36",
  up: "#22c55e",
  down: "#ef4444",
  accent: "#60a5fa",
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "600" },
  card: { borderWidth: 1, borderRadius: 12, padding: 16 },
  hero: { flexDirection: "row", alignItems: "center", gap: 16 },
  heroTitle: { fontSize: 24, fontWeight: "600" },
  dot: { width: 18, height: 18, borderRadius: 9 },
  muted: { fontSize: 13 },
  stats: { flexDirection: "row", gap: 12 },
  stat: { flex: 1 },
  statValue: { fontSize: 20, fontWeight: "600", marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  timeline: { flexDirection: "row", gap: 2, height: 28 },
  bucket: { flex: 1, borderRadius: 2 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginVertical: 10 },
  button: { borderRadius: 8, padding: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
