import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { AppState, type AppStateStatus, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decideOfflineTicket, findCachedTicket, incrementOfflineStats, normalizeOfflineCode, searchCachedTickets } from "./offline";
import approvedSound from "./assets/approved.wav";
import usedSound from "./assets/used.wav";
import invalidSound from "./assets/invalid.wav";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const OPERATOR_TOKEN = process.env.EXPO_PUBLIC_OPERATOR_TOKEN ?? "";
const DEVICE_ID = process.env.EXPO_PUBLIC_DEVICE_ID ?? "expo-checkin-device";
const CACHE_KEY = "digitalticket.mobile.tickets.v2";
const HISTORY_KEY = "digitalticket.mobile.history.v2";
const PENDING_KEY = "digitalticket.mobile.pending.v2";

const APPROVED_SOUND = approvedSound;
const USED_SOUND = usedSound;
const INVALID_SOUND = invalidSound;

type TicketStatus = "ISSUED" | "VALIDATED" | "USED" | "CANCELLED";
type ResultState = "idle" | "approved" | "used" | "cancelled" | "invalid" | "rejected";
type Mode = "scan" | "list" | "history";

type CachedTicket = {
  id: string;
  holderName: string;
  holderEmail: string;
  checkInCode: string;
  qrTokenHash: string;
  status: TicketStatus;
  eventId: string;
  eventName: string;
  issuedAt: string;
  validatedAt?: string | null;
  usedAt?: string | null;
  cancelledAt?: string | null;
  offlineValidatedAt?: string;
};

type HistoryEntry = {
  id: string;
  ticketId?: string;
  holderName?: string;
  holderEmail?: string;
  checkInCode: string;
  state: ResultState;
  message: string;
  createdAt: string;
  source: "online" | "offline" | "sync";
};

type PendingEntry = { code: string; ticketId: string; queuedAt: string };
type Stats = { totalSold: number; entered: number; remaining: number; issued: number; validated: number; cancelled: number; entryRate: number };

const EMPTY_STATS: Stats = { totalSold: 0, entered: 0, remaining: 0, issued: 0, validated: 0, cancelled: 0, entryRate: 0 };

function resultFromApi(data: any): ResultState {
  if (data?.accepted) return "approved";
  if (data?.state === "USED") return "used";
  if (data?.state === "CANCELLED") return "cancelled";
  if (data?.state === "INVALID_TOKEN" || data?.state === "NOT_FOUND") return "invalid";
  return "rejected";
}

function resultLabel(result: ResultState) {
  return result === "approved" ? "APROVADO" : result === "used" ? "JÁ UTILIZADO" : result === "cancelled" ? "CANCELADO" : result === "invalid" ? "INGRESSO INVÁLIDO" : result === "rejected" ? "RECUSADO" : "AGUARDANDO LEITURA";
}

function resultColor(result: ResultState) {
  return result === "approved" ? "#34d399" : result === "idle" ? "#cbd5e1" : "#fb7185";
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}

async function writeJson(key: string, value: unknown) {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* Cache is best effort. */ }
}

async function sha256(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>("scan");
  const [code, setCode] = useState("");
  const [scanned, setScanned] = useState(false);
  const [message, setMessage] = useState("Aguardando leitura");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResultState>("idle");
  const [online, setOnline] = useState(true);
  const [cache, setCache] = useState<CachedTicket[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const persistCache = useCallback((next: CachedTicket[]) => { setCache(next); void writeJson(CACHE_KEY, next); }, []);
  const persistHistory = useCallback((next: HistoryEntry[]) => { setHistory(next); void writeJson(HISTORY_KEY, next); }, []);
  const persistPending = useCallback((next: PendingEntry[]) => { setPending(next); void writeJson(PENDING_KEY, next); }, []);

  const addHistory = useCallback((entry: Omit<HistoryEntry, "id" | "createdAt">) => {
    const next = [{ ...entry, id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString() }, ...history].slice(0, 200);
    persistHistory(next);
  }, [history, persistHistory]);

  const playFeedback = useCallback(async (feedback: ResultState) => {
    try {
      if (feedback === "approved") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else if (feedback === "used") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      else await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch { /* Haptics are unavailable on some simulators. */ }
    const asset = feedback === "approved" ? APPROVED_SOUND : feedback === "used" ? USED_SOUND : INVALID_SOUND;
    try {
      const { sound } = await Audio.Sound.createAsync(asset, { shouldPlay: true, volume: 0.8 });
      sound.setOnPlaybackStatusUpdate((status) => { if (status.isLoaded && status.didJustFinish) void sound.unloadAsync(); });
    } catch { /* Audio is best effort when the device is muted or unavailable. */ }
  }, []);

  const refreshStats = useCallback(async () => {
    if (!OPERATOR_TOKEN) return;
    try {
      const response = await fetch(`${API_URL}/api/v1/check-in/stats`, { headers: { Authorization: `Bearer ${OPERATOR_TOKEN}` } });
      if (!response.ok) throw new Error("STATS_FAILED");
      setStats(await response.json()); setOnline(true); setLastSync(new Date().toISOString());
    } catch { setOnline(false); }
  }, []);

  const refreshCatalog = useCallback(async () => {
    if (!OPERATOR_TOKEN) return false;
    try {
      const response = await fetch(`${API_URL}/api/v1/check-in/catalog?limit=2000`, { headers: { Authorization: `Bearer ${OPERATOR_TOKEN}` } });
      if (!response.ok) throw new Error("CATALOG_FAILED");
      const data = await response.json();
      persistCache(data.tickets ?? []); setOnline(true); setLastSync(new Date().toISOString());
      await refreshStats();
      return true;
    } catch { setOnline(false); return false; }
  }, [persistCache, refreshStats]);

  const syncPending = useCallback(async () => {
    if (!OPERATOR_TOKEN || pending.length === 0) return;
    const remaining: PendingEntry[] = [];
    for (const item of pending) {
      try {
        const response = await fetch(`${API_URL}/api/v1/check-in/validate`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPERATOR_TOKEN}` }, body: JSON.stringify({ code: item.code, consume: true, deviceId: DEVICE_ID, note: "offline-sync" }) });
        const data = await response.json().catch(() => ({}));
        if (response.ok || data.state === "USED") {
          addHistory({ ticketId: item.ticketId, checkInCode: item.code, state: data.accepted ? "approved" : "used", message: data.message ?? "Leitura offline sincronizada.", source: "sync" });
        } else remaining.push(item);
      } catch { remaining.push(item); }
    }
    persistPending(remaining); if (remaining.length === 0) await refreshStats();
  }, [addHistory, pending, persistPending, refreshStats]);

  useEffect(() => {
    let active = true;
    void Promise.all([readJson<CachedTicket[]>(CACHE_KEY, []), readJson<HistoryEntry[]>(HISTORY_KEY, []), readJson<PendingEntry[]>(PENDING_KEY, [])]).then(([tickets, entries, queued]) => {
      if (!active) return;
      setCache(tickets); setHistory(entries); setPending(queued);
      void refreshCatalog().then(() => void syncPending());
    });
    return () => { active = false; };
  }, [refreshCatalog, syncPending]);

  useEffect(() => {
    const timer = setInterval(() => { if (appState.current === "active") { void refreshStats(); void refreshCatalog(); void syncPending(); } }, 15000);
    const subscription = AppState.addEventListener("change", (next) => { appState.current = next; if (next === "active") { void refreshStats(); void syncPending(); } });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [refreshCatalog, refreshStats, syncPending]);

  const offlineFind = useCallback(async (candidate: string) => {
    const normalized = normalizeOfflineCode(candidate);
    const hash = normalized.includes(".") ? await sha256(normalized.split(".")[0]) : "";
    return findCachedTicket(cache, normalized, hash);
  }, [cache]);

  const validateOffline = useCallback(async (candidate: string) => {
    const ticket = await offlineFind(candidate);
    const decision = decideOfflineTicket(ticket);
    if (!ticket || decision === "invalid") {
      setResult("invalid"); setMessage("Ingresso não encontrado no cache offline."); await playFeedback("invalid");
      addHistory({ checkInCode: candidate, state: "invalid", message: "Ingresso não encontrado no cache offline.", source: "offline" }); return;
    }
    if (decision === "used") {
      setResult("used"); setMessage("Ingresso já utilizado."); await playFeedback("used");
      addHistory({ ticketId: ticket.id, holderName: ticket.holderName, holderEmail: ticket.holderEmail, checkInCode: ticket.checkInCode, state: "used", message: "Ingresso já utilizado.", source: "offline" }); return;
    }
    if (decision === "cancelled") {
      setResult("cancelled"); setMessage("Ingresso cancelado."); await playFeedback("invalid");
      addHistory({ ticketId: ticket.id, holderName: ticket.holderName, holderEmail: ticket.holderEmail, checkInCode: ticket.checkInCode, state: "cancelled", message: "Ingresso cancelado.", source: "offline" }); return;
    }
    const now = new Date().toISOString();
    persistCache(cache.map((item) => item.id === ticket.id ? { ...item, status: "USED", usedAt: now, offlineValidatedAt: now } : item));
    persistPending([...pending, { ticketId: ticket.id, code: ticket.checkInCode, queuedAt: now }]);
    setStats((current) => incrementOfflineStats(current));
    setResult("approved"); setMessage(`Entrada autorizada offline · ${ticket.holderName}`); await playFeedback("approved");
    addHistory({ ticketId: ticket.id, holderName: ticket.holderName, holderEmail: ticket.holderEmail, checkInCode: ticket.checkInCode, state: "approved", message: `Entrada autorizada offline · ${ticket.holderName}`, source: "offline" });
  }, [addHistory, cache, offlineFind, pending, persistCache, persistPending, playFeedback]);

  const validate = useCallback(async (candidate: string) => {
    const normalized = candidate.trim();
    if (!normalized || busy) { if (!normalized) setMessage("Digite ou escaneie um código válido."); return; }
    setBusy(true); setMessage(online ? "Validando ingresso no servidor…" : "Validando no cache offline…");
    try {
      if (!online) { await validateOffline(normalized); return; }
      const response = await fetch(`${API_URL}/api/v1/check-in/validate`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPERATOR_TOKEN}` }, body: JSON.stringify({ code: normalized, consume: true, deviceId: DEVICE_ID }) });
      const data = await response.json().catch(() => ({}));
      const state = resultFromApi(data); setResult(state); setMessage(data.message ?? (data.accepted ? `Entrada autorizada · ${data.holderName ?? ""}` : "Entrada recusada."));
      await playFeedback(state);
      addHistory({ ticketId: data.ticketId, holderName: data.holderName, checkInCode: normalized, state, message: data.message ?? resultLabel(state), source: "online" });
      if (data.ticketId) persistCache(cache.map((ticket) => ticket.id === data.ticketId ? { ...ticket, status: data.accepted ? "USED" : ticket.status, usedAt: data.accepted ? new Date().toISOString() : ticket.usedAt } : ticket));
      if (response.ok || response.status === 409) { setOnline(true); void refreshStats(); }
    } catch {
      setOnline(false); await validateOffline(normalized);
    } finally { setBusy(false); }
  }, [addHistory, busy, cache, online, persistCache, playFeedback, refreshStats, validateOffline]);

  const handleBarcode = ({ data }: { data: string }) => { if (scanned) return; const normalized = data.replace("digitalticket://ticket/", ""); setScanned(true); setCode(normalized); void validate(normalized); };
  const reset = () => { setScanned(false); setCode(""); setResult("idle"); setMessage(online ? "Aguardando leitura" : "Aguardando leitura offline"); };
  const filteredTickets = useMemo(() => searchCachedTickets(cache, search), [cache, search]);

  const renderScanner = () => {
    if (!permission) return <Text style={styles.subtitle}>Solicitando permissão da câmera…</Text>;
    if (!permission.granted) return <View><Text style={styles.title}>A câmera é necessária.</Text><Text style={styles.subtitle}>Permita o acesso para escanear QR Codes de ingressos.</Text><TouchableOpacity style={styles.primary} onPress={requestPermission}><Text style={styles.primaryText}>Permitir câmera</Text></TouchableOpacity></View>;
    return <View><Text style={styles.subtitle}>Aponte a câmera para o QR Code do voucher.</Text><View style={styles.cameraFrame}><CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcode} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} /><View style={styles.scanGuide} /></View><Text style={[styles.statusText, { color: resultColor(result) }]}>{message}</Text>{scanned && <TouchableOpacity style={styles.secondary} onPress={reset}><Text style={styles.secondaryText}>Ler outro ingresso</Text></TouchableOpacity>}<View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>OU DIGITE</Text><View style={styles.line} /></View><TextInput value={code} onChangeText={setCode} placeholder="Ex.: DT-8F3K-29QX" placeholderTextColor="#64748b" style={styles.input} autoCapitalize="characters" /><TouchableOpacity disabled={busy} style={styles.secondary} onPress={() => void validate(code)}><Text style={styles.secondaryText}>{busy ? "Validando…" : "Validar código"}</Text></TouchableOpacity></View>;
  };

  const renderList = () => <View><Text style={styles.sectionTitle}>Busca manual</Text><Text style={styles.muted}>Ingressos cacheados no dispositivo · {cache.length} registro(s)</Text><TextInput value={search} onChangeText={setSearch} placeholder="Nome, e-mail ou código" placeholderTextColor="#64748b" style={styles.input} autoCapitalize="none" />{filteredTickets.map((ticket) => <TouchableOpacity key={ticket.id} style={styles.ticketRow} onPress={() => { setCode(ticket.checkInCode); setMode("scan"); void validate(ticket.checkInCode); }}><View style={styles.ticketMain}><Text style={styles.ticketName}>{ticket.holderName}</Text><Text style={styles.ticketEmail}>{ticket.holderEmail}</Text><Text style={styles.ticketCode}>{ticket.checkInCode} · {ticket.eventName}</Text></View><Text style={[styles.ticketStatus, { color: ticket.status === "USED" ? "#fb7185" : ticket.status === "CANCELLED" ? "#fbbf24" : "#34d399" }]}>{ticket.status === "USED" ? "USADO" : ticket.status === "CANCELLED" ? "CANCELADO" : "DISPONÍVEL"}</Text></TouchableOpacity>)}{filteredTickets.length === 0 && <Text style={styles.empty}>Nenhum ingresso encontrado no cache.</Text>}</View>;

  const renderHistory = () => <View><Text style={styles.sectionTitle}>Histórico do operador</Text><Text style={styles.muted}>Últimas {history.length} leituras neste dispositivo</Text>{history.map((entry) => <View key={entry.id} style={styles.historyRow}><View style={styles.historyDot}><Text style={styles.historyDotText}>{entry.state === "approved" ? "✓" : "!"}</Text></View><View style={styles.ticketMain}><Text style={styles.ticketName}>{entry.holderName ?? entry.checkInCode}</Text><Text style={styles.ticketEmail}>{entry.message}</Text><Text style={styles.ticketCode}>{formatTime(entry.createdAt)} · {entry.source === "offline" ? "offline" : entry.source === "sync" ? "sincronizado" : "online"}</Text></View></View>)}{history.length === 0 && <Text style={styles.empty}>Nenhuma leitura registrada ainda.</Text>}</View>;

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}><View style={styles.header}><View><Text style={styles.eyebrow}>DIGITALTICKET / PORTARIA</Text><Text style={styles.title}>Valide entradas.</Text></View><View style={[styles.connection, { borderColor: online ? "#34d399" : "#fbbf24" }]}><View style={[styles.connectionDot, { backgroundColor: online ? "#34d399" : "#fbbf24" }]} /><Text style={styles.connectionText}>{online ? "online" : "offline"}</Text></View></View><View style={styles.statsCard}><View><Text style={styles.statsLabel}>Entradas</Text><Text style={styles.statsValue}>{stats.entered}<Text style={styles.statsTotal}> / {stats.totalSold}</Text></Text></View><View style={styles.statsDivider} /><View><Text style={styles.statsLabel}>Restantes</Text><Text style={styles.statsValue}>{stats.remaining}</Text></View><View style={styles.rate}><Text style={styles.statsLabel}>Taxa</Text><Text style={styles.rateText}>{stats.entryRate}%</Text></View></View>{lastSync && <Text style={styles.syncText}>Atualizado às {formatTime(lastSync)} · {pending.length ? `${pending.length} pendente(s) de sincronização` : "cache sincronizado"}</Text>}<View style={styles.tabs}>{(["scan", "list", "history"] as Mode[]).map((item) => <TouchableOpacity key={item} onPress={() => setMode(item)} style={[styles.tab, mode === item && styles.tabActive]}><Text style={[styles.tabText, mode === item && styles.tabTextActive]}>{item === "scan" ? "Câmera" : item === "list" ? "Lista" : "Histórico"}</Text></TouchableOpacity>)}</View>{mode === "scan" ? renderScanner() : mode === "list" ? renderList() : renderHistory()}<TouchableOpacity style={styles.refresh} onPress={() => { void refreshCatalog(); void syncPending(); }}><Text style={styles.refreshText}>Atualizar cache e sincronizar</Text></TouchableOpacity></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#080a12" },
  container: { flexGrow: 1, padding: 22, paddingBottom: 42 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  eyebrow: { color: "#c084fc", fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  title: { color: "#f8fafc", fontSize: 32, lineHeight: 38, fontWeight: "700", marginTop: 12 },
  subtitle: { color: "#94a3b8", fontSize: 15, lineHeight: 22, marginTop: 10 },
  muted: { color: "#64748b", fontSize: 12, marginTop: 5 },
  connection: { alignItems: "center", borderWidth: 1, borderRadius: 14, flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  connectionDot: { borderRadius: 8, height: 8, width: 8 },
  connectionText: { color: "#cbd5e1", fontSize: 12, fontWeight: "700" },
  statsCard: { backgroundColor: "#111522", borderColor: "#263044", borderRadius: 18, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 20, padding: 16 },
  statsLabel: { color: "#64748b", fontSize: 11, textTransform: "uppercase" },
  statsValue: { color: "#f8fafc", fontSize: 25, fontWeight: "800", marginTop: 4 },
  statsTotal: { color: "#64748b", fontSize: 14, fontWeight: "500" },
  statsDivider: { backgroundColor: "#263044", width: 1 },
  rate: { alignItems: "flex-end" },
  rateText: { color: "#34d399", fontSize: 20, fontWeight: "800", marginTop: 7 },
  syncText: { color: "#64748b", fontSize: 11, marginTop: 8, textAlign: "center" },
  tabs: { backgroundColor: "#111522", borderRadius: 14, flexDirection: "row", marginTop: 18, padding: 4 },
  tab: { borderRadius: 11, flex: 1, padding: 11 },
  tabActive: { backgroundColor: "#d946ef" },
  tabText: { color: "#94a3b8", fontSize: 13, fontWeight: "700", textAlign: "center" },
  tabTextActive: { color: "#fff" },
  cameraFrame: { backgroundColor: "#111522", borderColor: "#d946ef", borderRadius: 24, borderWidth: 1, height: 230, marginTop: 22, overflow: "hidden" },
  scanGuide: { borderColor: "rgba(255,255,255,.8)", borderRadius: 18, borderWidth: 2, bottom: "20%", left: "15%", position: "absolute", right: "15%", top: "20%" },
  statusText: { fontSize: 14, fontWeight: "700", marginTop: 14, textAlign: "center" },
  primary: { alignItems: "center", backgroundColor: "#d946ef", borderRadius: 16, marginTop: 28, padding: 17 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondary: { alignItems: "center", borderColor: "#334155", borderRadius: 14, borderWidth: 1, marginTop: 12, padding: 15 },
  secondaryText: { color: "#e2e8f0", fontSize: 15, fontWeight: "600" },
  divider: { alignItems: "center", flexDirection: "row", gap: 12, marginVertical: 18 },
  line: { backgroundColor: "#1e293b", flex: 1, height: 1 },
  or: { color: "#64748b", fontSize: 10 },
  input: { backgroundColor: "#111522", borderColor: "#263044", borderRadius: 14, borderWidth: 1, color: "#f8fafc", fontSize: 15, marginTop: 15, padding: 15 },
  sectionTitle: { color: "#f8fafc", fontSize: 20, fontWeight: "800", marginTop: 20 },
  ticketRow: { alignItems: "center", backgroundColor: "#111522", borderColor: "#263044", borderRadius: 14, borderWidth: 1, flexDirection: "row", marginTop: 9, padding: 13 },
  ticketMain: { flex: 1 },
  ticketName: { color: "#f8fafc", fontSize: 14, fontWeight: "700" },
  ticketEmail: { color: "#94a3b8", fontSize: 12, marginTop: 3 },
  ticketCode: { color: "#64748b", fontSize: 10, marginTop: 5 },
  ticketStatus: { fontSize: 10, fontWeight: "800", marginLeft: 8 },
  historyRow: { alignItems: "center", borderBottomColor: "#1e293b", borderBottomWidth: 1, flexDirection: "row", paddingVertical: 13 },
  historyDot: { alignItems: "center", backgroundColor: "#1e293b", borderRadius: 18, height: 30, justifyContent: "center", marginRight: 10, width: 30 },
  historyDotText: { color: "#c084fc", fontSize: 17, fontWeight: "800" },
  empty: { color: "#64748b", paddingVertical: 28, textAlign: "center" },
  refresh: { alignItems: "center", borderColor: "#334155", borderRadius: 13, borderWidth: 1, marginTop: 24, padding: 13 },
  refreshText: { color: "#cbd5e1", fontSize: 13, fontWeight: "700" },
});
