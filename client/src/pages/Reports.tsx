import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, CircleDollarSign, Download, Loader2, QrCode, Ticket, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type Summary = { grossRevenueCents: number; paidOrders: number; ticketsIssued: number; checkIns: number; customers: number; events: number; last30Days: Array<{ date: string; orders: number; revenueCents: number }> };
type EventReport = { eventId: string; eventName: string; status: string; capacity: number; sold: number; occupancyRate: number; revenueCents: number; orders: number; ticketsIssued: number; checkIns: number };

function formatBRL(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function Reports() {
  const [token] = useState(() => localStorage.getItem("digitalticket_access_token") ?? "");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<EventReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [summaryResponse, eventsResponse] = await Promise.all([
        fetch(`${API_URL}/api/v1/reports/summary`, { headers }),
        fetch(`${API_URL}/api/v1/reports/events`, { headers }),
      ]);
      const summaryBody = await summaryResponse.json();
      const eventsBody = await eventsResponse.json();
      if (!summaryResponse.ok) throw new Error(summaryBody?.error ?? "REQUEST_FAILED");
      if (!eventsResponse.ok) throw new Error(eventsBody?.error ?? "REQUEST_FAILED");
      setSummary(summaryBody); setEvents(eventsBody); setError(null);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const downloadCsv = (path: string) => {
    window.open(`${API_URL}${path}?token=`, "_blank");
    void fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) return;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "export.csv";
        anchor.click();
        URL.revokeObjectURL(url);
      });
  };

  if (!token) return <main className="grid min-h-screen place-items-center bg-[#080a12] text-slate-400">Entre como organizador para ver relatórios.</main>;

  const kpis = summary ? [
    { label: "Receita bruta", value: formatBRL(summary.grossRevenueCents), icon: CircleDollarSign },
    { label: "Pedidos pagos", value: String(summary.paidOrders), icon: BarChart3 },
    { label: "Ingressos emitidos", value: String(summary.ticketsIssued), icon: Ticket },
    { label: "Check-ins", value: String(summary.checkIns), icon: QrCode },
    { label: "Clientes", value: String(summary.customers), icon: Users },
  ] : [];

  return (
    <div className="min-h-screen bg-[#080a12] text-slate-100">
      <header className="flex items-center justify-between border-b border-white/5 px-6 py-5 lg:px-10">
        <div><p className="text-xs uppercase tracking-[.2em] text-slate-500">Workspace</p><h1 className="text-xl font-semibold">Relatórios</h1></div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => downloadCsv("/api/v1/reports/orders.csv")}><Download className="mr-1 h-4 w-4" />Pedidos CSV</Button>
          <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => downloadCsv("/api/v1/reports/customers.csv")}><Download className="mr-1 h-4 w-4" />Clientes CSV</Button>
          <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => downloadCsv("/api/v1/reports/tickets.csv")}><Download className="mr-1 h-4 w-4" />Ingressos CSV</Button>
          <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => (window.location.href = "/")}>Voltar</Button>
        </div>
      </header>
      <main className="space-y-6 p-6 lg:p-10">
        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
        {loading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" /></div> : (
          <>
            <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              {kpis.map((kpi) => (
                <Card key={kpi.label} className="border-white/5 bg-[#111522] shadow-none">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between"><p className="text-xs text-slate-500">{kpi.label}</p><kpi.icon className="h-4 w-4 text-fuchsia-300" /></div>
                    <p className="mt-4 text-xl font-semibold tracking-tight">{kpi.value}</p>
                  </CardContent>
                </Card>
              ))}
            </section>

            <Card className="border-white/5 bg-[#111522] shadow-none">
              <CardHeader><CardTitle className="text-base">Vendas dos últimos 30 dias</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={summary?.last30Days ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#e879f9" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#e879f9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(value: string) => value.slice(8, 10) + "/" + value.slice(5, 7)} stroke="rgba(255,255,255,.1)" />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(value: number) => `R$ ${(value / 100).toFixed(0)}`} stroke="rgba(255,255,255,.1)" width={70} />
                    <Tooltip contentStyle={{ background: "#111522", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }} labelStyle={{ color: "#94a3b8" }} formatter={(value: number) => [formatBRL(value), "Receita"]} />
                    <Area type="monotone" dataKey="revenueCents" stroke="#e879f9" fill="url(#revenue)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-white/5 bg-[#111522] shadow-none">
              <CardHeader><CardTitle className="text-base">Desempenho por evento</CardTitle></CardHeader>
              <CardContent className="p-0">
                {!events.length ? <p className="px-5 pb-6 text-sm text-slate-500">Nenhum evento cadastrado.</p> : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-4">Evento</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Ocupação</th><th className="px-5 py-4">Pedidos</th><th className="px-5 py-4">Ingressos</th><th className="px-5 py-4">Check-ins</th><th className="px-5 py-4">Receita</th>
                    </tr></thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.eventId} className="border-b border-white/5 last:border-0 hover:bg-white/[.02]">
                          <td className="px-5 py-4 font-medium text-slate-200">{event.eventName}</td>
                          <td className="px-5 py-4"><Badge className={event.status === "PUBLISHED" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-slate-400/30 bg-slate-400/10 text-slate-400"}>{event.status}</Badge></td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-500" style={{ width: `${Math.min(100, event.occupancyRate)}%` }} /></div>
                              <span className="text-xs text-slate-400">{event.sold}/{event.capacity} ({event.occupancyRate}%)</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-300">{event.orders}</td>
                          <td className="px-5 py-4 text-slate-300">{event.ticketsIssued}</td>
                          <td className="px-5 py-4 text-slate-300">{event.checkIns}</td>
                          <td className="px-5 py-4 font-semibold text-slate-100">{formatBRL(event.revenueCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
