import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Loader2, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type EventRow = {
  id: string; name: string; slug: string; status: string; startsAt: string | null; createdAt: string;
  lots: Array<{ id: string; name: string; capacity: number; sold: number; priceInCents: number }>;
  dates: Array<{ id: string; label: string | null; startsAt: string | null }>;
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Rascunho", className: "border-slate-400/30 bg-slate-400/10 text-slate-400" },
  PUBLISHED: { label: "Publicado", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  ARCHIVED: { label: "Arquivado", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
};

function formatBRL(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function Events() {
  const [token] = useState(() => localStorage.getItem("digitalticket_access_token") ?? "");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/events`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "REQUEST_FAILED");
      setEvents(body); setError(null);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  if (!token) return <main className="grid min-h-screen place-items-center bg-[#080a12] text-slate-400">Entre como organizador para gerenciar eventos.</main>;

  return (
    <div className="min-h-screen bg-[#080a12] text-slate-100">
      <header className="flex items-center justify-between border-b border-white/5 px-6 py-5 lg:px-10">
        <div><p className="text-xs uppercase tracking-[.2em] text-slate-500">Workspace</p><h1 className="text-xl font-semibold">Eventos</h1></div>
        <div className="flex gap-3">
          <Button className="bg-fuchsia-500 hover:bg-fuchsia-400" onClick={() => (window.location.href = "/events/new")}><Plus className="mr-1 h-4 w-4" />Novo evento</Button>
          <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => (window.location.href = "/")}>Voltar ao painel</Button>
        </div>
      </header>
      <main className="p-6 lg:p-10">
        {error && <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
        {loading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" /></div> : !events.length ? (
          <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-white/10 text-center"><div><CalendarDays className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-3 text-sm text-slate-500">Nenhum evento criado ainda.</p></div></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => {
              const capacity = event.lots.reduce((sum, lot) => sum + lot.capacity, 0);
              const sold = event.lots.reduce((sum, lot) => sum + lot.sold, 0);
              const cheapest = event.lots.reduce<number | null>((min, lot) => (min == null || lot.priceInCents < min ? lot.priceInCents : min), null);
              return (
                <Card key={event.id} className="border-white/5 bg-[#111522] shadow-none">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-100">{event.name}</p>
                        <p className="mt-1 text-xs text-slate-500">/{event.slug} · {event.dates.length > 0 ? `${event.dates.length} data(s)` : event.startsAt ? new Date(event.startsAt).toLocaleDateString("pt-BR") : "sem data definida"}</p>
                      </div>
                      <Badge className={STATUS_LABEL[event.status]?.className ?? ""}>{STATUS_LABEL[event.status]?.label ?? event.status}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">{sold}/{capacity} vendidos</span>
                      {cheapest != null && <span className="text-fuchsia-300">a partir de {formatBRL(cheapest)}</span>}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-500" style={{ width: `${capacity > 0 ? Math.min(100, (sold / capacity) * 100) : 0}%` }} /></div>
                    <Button size="sm" variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => (window.location.href = `/events/${event.id}/edit`)}><Pencil className="mr-1 h-3.5 w-3.5" />Gerenciar</Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
