import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, CalendarDays, ChevronRight, CircleDollarSign, LayoutDashboard, LogOut, Palette, Percent, QrCode, Ticket, Users, Zap } from "lucide-react";
import { useEffect, useState } from "react";

const navItems = [
  { label: "Visão geral", icon: LayoutDashboard, active: true, href: "/" },
  { label: "Eventos", icon: CalendarDays, href: "/events/new" },
  { label: "Pedidos", icon: Ticket, href: "/orders" },
  { label: "Check-in", icon: QrCode, href: "/check-in" },
  { label: "Clientes", icon: Users, href: "/customers" },
  { label: "Cupons", icon: Percent, href: "/coupons" },
  { label: "Relatórios", icon: BarChart3, href: "/reports" },
  { label: "Marca", icon: Palette, href: "/branding" },
];

type OrganizerEvent = { id: string; name: string; status: string; lots: Array<{ capacity: number; sold: number }> };

const kpis = [
  { label: "Receita bruta", value: "R$ 0,00", detail: "Aguardando suas primeiras vendas", icon: CircleDollarSign, tone: "violet" },
  { label: "Ingressos vendidos", value: "0", detail: "Nenhum ingresso emitido", icon: Ticket, tone: "pink" },
  { label: "Check-ins realizados", value: "0", detail: "Portaria ainda não iniciada", icon: QrCode, tone: "blue" },
  { label: "Clientes", value: "0", detail: "Sua base começa aqui", icon: Users, tone: "amber" },
];

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  useEffect(() => { if (!isAuthenticated) return; const token = localStorage.getItem("digitalticket_access_token"); if (!token) return; setEventsLoading(true); fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/events`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() : []).then((data: OrganizerEvent[]) => setEvents(data)).catch(() => setEvents([])).finally(() => setEventsLoading(false)); }, [isAuthenticated]);
  const totalSold = events.reduce((sum, event) => sum + event.lots.reduce((lotSum, lot) => lotSum + lot.sold, 0), 0);
  const dynamicKpis = kpis.map((kpi) => kpi.label === "Ingressos vendidos" ? { ...kpi, value: String(totalSold), detail: events.length ? `${events.length} evento(s) na operação` : "Nenhum ingresso emitido" } : kpi);

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#080a12] text-slate-400">Carregando seu workspace…</div>;
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen overflow-hidden bg-[#080a12] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(139,92,246,.2),transparent_35%),radial-gradient(circle_at_85%_25%,rgba(236,72,153,.15),transparent_30%)]" />
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-7 lg:px-10">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-400 to-violet-600 shadow-lg shadow-fuchsia-500/20"><Zap className="h-5 w-5" /></div><span className="text-lg font-semibold tracking-tight">Digital<span className="text-fuchsia-400">Ticket</span></span></div>
          <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={startLogin}>Entrar no painel</Button>
        </nav>
        <section className="relative mx-auto grid max-w-7xl gap-16 px-6 pb-24 pt-16 lg:grid-cols-[1.1fr_.9fr] lg:px-10 lg:pt-24">
          <div className="max-w-2xl self-center"><Badge className="mb-7 border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-1 text-fuchsia-200">A nova infraestrutura da sua operação</Badge><h1 className="text-5xl font-semibold leading-[1.03] tracking-[-.04em] sm:text-7xl">Venda experiências.<br /><span className="bg-gradient-to-r from-fuchsia-300 via-violet-300 to-sky-300 bg-clip-text text-transparent">Entregue presença.</span></h1><p className="mt-7 max-w-xl text-lg leading-8 text-slate-400">Uma plataforma white-label para publicar eventos, vender ingressos, acompanhar pagamentos e controlar cada entrada com segurança.</p><div className="mt-9 flex flex-wrap gap-3"><Button size="lg" className="bg-fuchsia-500 text-white shadow-xl shadow-fuchsia-500/20 hover:bg-fuchsia-400" onClick={startLogin}>Começar agora <ChevronRight className="ml-2 h-4 w-4" /></Button><Button size="lg" variant="ghost" className="text-slate-300 hover:bg-white/5 hover:text-white" onClick={startLogin}>Acessar workspace</Button></div></div>
          <div className="relative"><div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-r from-fuchsia-500/20 to-violet-500/20 blur-3xl" /><Card className="relative overflow-hidden rounded-[2rem] border-white/10 bg-[#111522]/90 shadow-2xl shadow-black/40"><CardHeader className="border-b border-white/5 pb-5"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.2em] text-slate-500">Preview do workspace</p><CardTitle className="mt-2 text-xl text-white">Visão geral</CardTitle></div><div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" /></div></CardHeader><CardContent className="space-y-4 p-5"><div className="grid grid-cols-2 gap-3">{kpis.slice(0, 4).map((kpi) => <div key={kpi.label} className="rounded-2xl border border-white/5 bg-white/[.03] p-4"><kpi.icon className="mb-6 h-4 w-4 text-fuchsia-300" /><p className="text-2xl font-semibold text-white">{kpi.value}</p><p className="mt-1 text-xs text-slate-500">{kpi.label}</p></div>)}</div><div className="rounded-2xl border border-dashed border-white/10 bg-white/[.02] p-6 text-center"><CalendarDays className="mx-auto h-7 w-7 text-slate-500" /><p className="mt-3 text-sm font-medium text-slate-300">Seu próximo evento aparece aqui</p><p className="mt-1 text-xs text-slate-500">Crie seu primeiro evento para começar a operar.</p></div></CardContent></Card></div>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#080a12] text-slate-100"><aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/5 bg-[#0b0e18] px-4 py-6 lg:block"><div className="flex items-center gap-3 px-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-400 to-violet-600"><Zap className="h-4 w-4" /></div><span className="font-semibold">Digital<span className="text-fuchsia-400">Ticket</span></span></div><div className="mt-12 space-y-1">{navItems.map(({ label, icon: Icon, active, href }) => <button key={label} onClick={() => href !== "/" && (window.location.href = href)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${active ? "bg-fuchsia-500/15 text-fuchsia-200" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"}`}><Icon className="h-4 w-4" />{label}</button>)}</div><div className="absolute bottom-6 left-4 right-4"><button onClick={() => logout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500 hover:bg-white/5 hover:text-white"><LogOut className="h-4 w-4" />Sair</button></div></aside><main className="lg:ml-64"><header className="flex items-center justify-between border-b border-white/5 px-6 py-5 lg:px-10"><div><p className="text-sm text-slate-500">Workspace do organizador</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Bom te ver, {user?.name?.split(" ")[0] ?? "organizador"}.</h1></div><Button className="bg-fuchsia-500 hover:bg-fuchsia-400" onClick={() => (window.location.href = "/events/new")}><CalendarDays className="mr-2 h-4 w-4" />Novo evento</Button></header><section className="space-y-8 p-6 lg:p-10"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{dynamicKpis.map((kpi) => <Card key={kpi.label} className="border-white/5 bg-[#111522] shadow-none"><CardContent className="p-5"><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{kpi.label}</p><kpi.icon className="h-4 w-4 text-fuchsia-300" /></div><p className="mt-5 text-3xl font-semibold tracking-tight">{kpi.value}</p><p className="mt-2 text-xs text-slate-600">{kpi.detail}</p></CardContent></Card>)}</div><div className="grid gap-6 xl:grid-cols-[1.4fr_.6fr]"><Card className="border-white/5 bg-[#111522] shadow-none"><CardHeader><CardTitle className="text-base">Atividade de vendas</CardTitle></CardHeader><CardContent>{eventsLoading ? <div className="grid min-h-64 place-items-center text-slate-500">Carregando eventos reais…</div> : events.length ? <div className="space-y-3">{events.map((event) => <div key={event.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[.02] px-4 py-4"><div><p className="font-medium text-slate-200">{event.name}</p><p className="mt-1 text-xs text-slate-500">{event.status} · {event.lots.length} lote(s)</p></div><span className="text-sm text-fuchsia-300">{event.lots.reduce((sum, lot) => sum + lot.sold, 0)} vendidos</span></div>)}</div> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[.015] text-center"><div><CircleDollarSign className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-3 font-medium text-slate-400">Ainda não há eventos carregados</p><p className="mt-1 text-sm text-slate-600">Crie um evento e conecte o workspace à API.</p></div></div>}</CardContent></Card><Card className="border-white/5 bg-[#111522] shadow-none"><CardHeader><CardTitle className="text-base">Ações rápidas</CardTitle></CardHeader><CardContent className="space-y-2">{[{ label: "Criar seu primeiro evento", href: "/events/new" }, { label: "Configurar marca white-label", href: "/branding" }, { label: "Ver relatórios de vendas", href: "/reports" }, { label: "Abrir central de check-in", href: "/check-in" }].map((item) => <button key={item.label} onClick={() => (window.location.href = item.href)} className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[.02] px-4 py-3 text-left text-sm text-slate-300 hover:border-fuchsia-400/30 hover:bg-fuchsia-400/5"><span>{item.label}</span><ChevronRight className="h-4 w-4 text-slate-600" /></button>)}</CardContent></Card></div></section></main></div>
  );
}
