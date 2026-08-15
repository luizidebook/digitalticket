import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CalendarDays, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type EventDate = { id: string; label: string | null; startsAt: string | null; endsAt: string | null; sortOrder: number; active: boolean };
type Lot = { id: string; name: string; priceInCents: number; capacity: number; sold: number; maxPerOrder: number; active: boolean; eventDateId: string | null };
type EventData = { id: string; name: string; slug: string; type: string; category: string | null; description: string | null; imageUrl: string | null; startsAt: string | null; endsAt: string | null; status: string; dates: EventDate[]; lots: Lot[] };

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) }, ...init });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "REQUEST_FAILED");
  return data as T;
}

function toLocalInput(iso: string | null) { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
function fromLocalInput(value: string) { return value ? new Date(value).toISOString() : null; }
function formatBRL(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function EventStudio() {
  const params = useParams<{ eventId?: string }>();
  const eventId = params.eventId;
  const [token] = useState(() => localStorage.getItem("digitalticket_access_token") ?? "");
  const [event, setEvent] = useState<EventData | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", type: "show", category: "", description: "", imageUrl: "", startsAt: "", endsAt: "" });
  const [dateForm, setDateForm] = useState({ label: "", startsAt: "", endsAt: "" });
  const [lotForm, setLotForm] = useState({ name: "", price: "", capacity: "", maxPerOrder: "10", eventDateId: "" });
  const [loading, setLoading] = useState(Boolean(eventId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId || !token) return;
    setLoading(true);
    try {
      const data = await api<EventData>(`/api/v1/events/${eventId}`, token);
      setEvent(data);
      setForm({ name: data.name, slug: data.slug, type: data.type, category: data.category ?? "", description: data.description ?? "", imageUrl: data.imageUrl ?? "", startsAt: toLocalInput(data.startsAt), endsAt: toLocalInput(data.endsAt) });
      setError(null);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [eventId, token]);

  useEffect(() => { void load(); }, [load]);

  const flash = (message: string) => { setNotice(message); setTimeout(() => setNotice(null), 3000); };

  const saveEvent = async () => {
    setBusy(true); setError(null);
    try {
      const payload = { name: form.name, slug: form.slug, type: form.type, category: form.category || undefined, description: form.description || undefined, imageUrl: form.imageUrl || undefined, startsAt: fromLocalInput(form.startsAt) ?? undefined, endsAt: fromLocalInput(form.endsAt) ?? undefined };
      if (event) {
        await api(`/api/v1/events/${event.id}`, token, { method: "PATCH", body: JSON.stringify(payload) });
        flash("Evento atualizado.");
      } else {
        const created = await api<EventData>(`/api/v1/events`, token, { method: "POST", body: JSON.stringify(payload) });
        window.location.href = `/events/${created.id}/edit`;
        return;
      }
      await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const publish = async () => {
    if (!event) return; setBusy(true);
    try { await api(`/api/v1/events/${event.id}/publish`, token, { method: "POST", body: "{}" }); flash("Evento publicado."); await load(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const addDate = async () => {
    if (!event) return; setBusy(true); setError(null);
    try {
      await api(`/api/v1/events/${event.id}/dates`, token, { method: "POST", body: JSON.stringify({ label: dateForm.label || null, startsAt: fromLocalInput(dateForm.startsAt), endsAt: fromLocalInput(dateForm.endsAt) }) });
      setDateForm({ label: "", startsAt: "", endsAt: "" }); flash("Data adicionada."); await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const removeDate = async (dateId: string) => {
    if (!event) return; setBusy(true);
    try { await api(`/api/v1/events/${event.id}/dates/${dateId}`, token, { method: "DELETE" }); await load(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const addLot = async () => {
    if (!event) return; setBusy(true); setError(null);
    try {
      await api(`/api/v1/events/${event.id}/lots`, token, { method: "POST", body: JSON.stringify({ name: lotForm.name, priceInCents: Math.round(parseFloat(lotForm.price.replace(",", ".")) * 100), capacity: Number(lotForm.capacity), maxPerOrder: Number(lotForm.maxPerOrder), eventDateId: lotForm.eventDateId || null }) });
      setLotForm({ name: "", price: "", capacity: "", maxPerOrder: "10", eventDateId: "" }); flash("Lote criado."); await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const toggleLot = async (lot: Lot) => {
    if (!event) return; setBusy(true);
    try { await api(`/api/v1/events/${event.id}/lots/${lot.id}`, token, { method: "PATCH", body: JSON.stringify({ active: !lot.active }) }); await load(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const removeLot = async (lot: Lot) => {
    if (!event) return; setBusy(true);
    try { await api(`/api/v1/events/${event.id}/lots/${lot.id}`, token, { method: "DELETE" }); await load(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  if (!token) return <main className="grid min-h-screen place-items-center bg-[#080a12] text-slate-400">Entre como organizador para gerenciar eventos.</main>;
  if (loading) return <main className="grid min-h-screen place-items-center bg-[#080a12]"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" /></main>;

  return (
    <div className="min-h-screen bg-[#080a12] px-6 py-8 text-slate-100 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <button onClick={() => (window.location.href = "/events")} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white"><ArrowLeft className="h-4 w-4" />Voltar aos eventos</button>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-fuchsia-300">Eventos / {event ? "Editar evento" : "Novo evento"}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{event ? event.name : "Crie uma nova experiência"}</h1>
            {event && <Badge className="mt-2 border-white/10 bg-white/5 text-slate-300">{event.status}</Badge>}
          </div>
          <div className="flex gap-2">
            {event && event.status !== "PUBLISHED" && <Button variant="outline" className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20" onClick={() => void publish()} disabled={busy}>Publicar</Button>}
            <Button className="bg-fuchsia-500 hover:bg-fuchsia-400" onClick={() => void saveEvent()} disabled={busy || !form.name || !form.slug}><Save className="mr-2 h-4 w-4" />{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : event ? "Salvar alterações" : "Criar evento"}</Button>
          </div>
        </div>

        {error && <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
        {notice && <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <div className="space-y-6">
            <Card className="border-white/5 bg-[#111522]">
              <CardHeader><CardTitle className="text-base">Informações principais</CardTitle></CardHeader>
              <CardContent className="grid gap-5">
                <label className="grid gap-2 text-sm text-slate-400">Nome do evento
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: event ? form.slug : e.target.value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") })} placeholder="Ex.: Festival Aurora" className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-white placeholder:text-slate-600" />
                </label>
                <label className="grid gap-2 text-sm text-slate-400">Slug (URL pública)
                  <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="festival-aurora" className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 font-mono text-sm text-white placeholder:text-slate-600" />
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-400">Tipo
                    <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Show, workshop, passeio…" className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-white placeholder:text-slate-600" />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-400">Categoria
                    <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Música, cultura…" className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-white placeholder:text-slate-600" />
                  </label>
                </div>
                <label className="grid gap-2 text-sm text-slate-400">Descrição
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Conte ao público o que torna este evento especial." className="min-h-28 rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-white placeholder:text-slate-600" />
                </label>
                <label className="grid gap-2 text-sm text-slate-400">URL da imagem de capa
                  <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…/capa.jpg" className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-white placeholder:text-slate-600" />
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-400">Início (data principal)
                    <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-white" />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-400">Fim
                    <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-white" />
                  </label>
                </div>
              </CardContent>
            </Card>

            {event && (
              <Card className="border-white/5 bg-[#111522]">
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-fuchsia-300" />Datas e sessões</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {event.dates.map((date) => (
                    <div key={date.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[.02] px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-200">{date.label ?? "Data"}</p>
                        <p className="text-xs text-slate-500">{date.startsAt ? new Date(date.startsAt).toLocaleString("pt-BR") : "Sem data definida"}{date.endsAt ? ` → ${new Date(date.endsAt).toLocaleString("pt-BR")}` : ""}</p>
                      </div>
                      <button onClick={() => void removeDate(date.id)} disabled={busy} className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <div className="grid gap-2 rounded-xl border border-dashed border-white/10 p-3 sm:grid-cols-3">
                    <input value={dateForm.label} onChange={(e) => setDateForm({ ...dateForm, label: e.target.value })} placeholder="Rótulo (ex.: Sexta)" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                    <input type="datetime-local" value={dateForm.startsAt} onChange={(e) => setDateForm({ ...dateForm, startsAt: e.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                    <input type="datetime-local" value={dateForm.endsAt} onChange={(e) => setDateForm({ ...dateForm, endsAt: e.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                  </div>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void addDate()} className="border-white/15 bg-white/5 text-white hover:bg-white/10"><Plus className="mr-1 h-4 w-4" />Adicionar data / produto sem data</Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {event && (
              <Card className="border-white/5 bg-[#111522]">
                <CardHeader><CardTitle className="text-base">Lotes e capacidade</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {event.lots.map((lot) => (
                    <div key={lot.id} className="rounded-xl border border-white/5 bg-white/[.02] px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-200">{lot.name}</p>
                        <div className="flex items-center gap-1">
                          <button onClick={() => void toggleLot(lot)} disabled={busy}><Badge className={lot.active ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-slate-400/30 bg-slate-400/10 text-slate-400"}>{lot.active ? "Ativo" : "Inativo"}</Badge></button>
                          <button onClick={() => void removeLot(lot)} disabled={busy} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{formatBRL(lot.priceInCents)} · {lot.sold}/{lot.capacity} vendidos · máx. {lot.maxPerOrder}/pedido{lot.eventDateId ? ` · vinculado a ${event.dates.find((d) => d.id === lot.eventDateId)?.label ?? "data"}` : ""}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-500" style={{ width: `${lot.capacity > 0 ? Math.min(100, (lot.sold / lot.capacity) * 100) : 0}%` }} /></div>
                    </div>
                  ))}
                  <div className="grid gap-2 rounded-xl border border-dashed border-white/10 p-3">
                    <input value={lotForm.name} onChange={(e) => setLotForm({ ...lotForm, name: e.target.value })} placeholder="Nome do lote" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                    <div className="grid grid-cols-3 gap-2">
                      <input value={lotForm.price} onChange={(e) => setLotForm({ ...lotForm, price: e.target.value })} placeholder="Preço R$" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                      <input value={lotForm.capacity} onChange={(e) => setLotForm({ ...lotForm, capacity: e.target.value })} type="number" min="1" placeholder="Capacidade" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                      <input value={lotForm.maxPerOrder} onChange={(e) => setLotForm({ ...lotForm, maxPerOrder: e.target.value })} type="number" min="1" max="50" placeholder="Máx/pedido" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                    </div>
                    {event.dates.length > 0 && (
                      <select value={lotForm.eventDateId} onChange={(e) => setLotForm({ ...lotForm, eventDateId: e.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400">
                        <option value="">Todas as datas</option>
                        {event.dates.map((date) => <option key={date.id} value={date.id}>{date.label ?? (date.startsAt ? new Date(date.startsAt).toLocaleDateString("pt-BR") : "Sem data")}</option>)}
                      </select>
                    )}
                    <Button size="sm" disabled={busy || !lotForm.name || !lotForm.price || !lotForm.capacity} onClick={() => void addLot()} className="bg-fuchsia-500 hover:bg-fuchsia-400"><Plus className="mr-1 h-4 w-4" />Adicionar lote</Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {!event && (
              <Card className="border-white/5 bg-[#111522]">
                <CardContent className="p-6 text-center text-sm text-slate-500">Crie o evento primeiro para configurar datas, sessões e lotes.</CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
