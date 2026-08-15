import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Loader2, Search, Ticket } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type OrderRow = {
  id: string; status: string; subtotalCents: number; discountCents: number; totalCents: number; createdAt: string;
  buyer: { id: string; name: string; email: string };
  event: { id: string; name: string; slug: string };
  payment: { status: string; method: string; externalId: string | null } | null;
  items: Array<{ quantity: number; unitPriceCents: number; lot: { name: string }; tickets: Array<{ id: string; status: string }> }>;
  coupon: { code: string } | null;
};
type OrdersResponse = { total: number; page: number; pageSize: number; orders: OrderRow[] };

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: "Aguardando pagamento", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  PAID: { label: "Pago", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  CANCELLED: { label: "Cancelado", className: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
  EXPIRED: { label: "Expirado", className: "border-slate-400/30 bg-slate-400/10 text-slate-400" },
};

function formatBRL(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function Orders() {
  const [token] = useState(() => localStorage.getItem("digitalticket_access_token") ?? "");
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "15" });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const response = await fetch(`${API_URL}/api/v1/manage/orders?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "REQUEST_FAILED");
      setData(body); setError(null);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [token, page, search, status]);

  useEffect(() => { const timer = setTimeout(() => void load(), 300); return () => clearTimeout(timer); }, [load]);

  if (!token) return <main className="grid min-h-screen place-items-center bg-[#080a12] text-slate-400">Entre como organizador para gerenciar pedidos.</main>;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="min-h-screen bg-[#080a12] text-slate-100">
      <header className="flex items-center justify-between border-b border-white/5 px-6 py-5 lg:px-10">
        <div><p className="text-xs uppercase tracking-[.2em] text-slate-500">Workspace</p><h1 className="text-xl font-semibold">Pedidos</h1></div>
        <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => (window.location.href = "/")}>Voltar ao painel</Button>
      </header>
      <main className="space-y-5 p-6 lg:p-10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por comprador, e-mail ou pedido" className="w-80 rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-fuchsia-400" />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-fuchsia-400">
            <option value="">Todos os status</option>
            <option value="PENDING_PAYMENT">Aguardando pagamento</option>
            <option value="PAID">Pago</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
          {data && <span className="text-sm text-slate-500">{data.total} pedido(s)</span>}
        </div>

        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

        <Card className="border-white/5 bg-[#111522] shadow-none">
          <CardContent className="p-0">
            {loading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" /></div> : !data?.orders.length ? (
              <div className="grid min-h-64 place-items-center text-center"><div><Ticket className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-3 text-sm text-slate-500">Nenhum pedido encontrado.</p></div></div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-4">Pedido</th><th className="px-5 py-4">Comprador</th><th className="px-5 py-4">Evento</th><th className="px-5 py-4">Itens</th><th className="px-5 py-4">Pagamento</th><th className="px-5 py-4">Total</th><th className="px-5 py-4">Status</th>
                </tr></thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr key={order.id} className="border-b border-white/5 last:border-0 hover:bg-white/[.02]">
                      <td className="px-5 py-4"><p className="font-mono text-xs text-slate-400">#{order.id.slice(-8)}</p><p className="mt-1 text-xs text-slate-600">{new Date(order.createdAt).toLocaleString("pt-BR")}</p></td>
                      <td className="px-5 py-4"><p className="font-medium text-slate-200">{order.buyer.name}</p><p className="text-xs text-slate-500">{order.buyer.email}</p></td>
                      <td className="px-5 py-4 text-slate-300">{order.event.name}</td>
                      <td className="px-5 py-4 text-slate-400">{order.items.map((item) => `${item.quantity}× ${item.lot.name}`).join(", ")}{order.coupon && <Badge className="ml-2 border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300">{order.coupon.code}</Badge>}</td>
                      <td className="px-5 py-4 text-slate-400">{order.payment ? `${order.payment.method} · ${order.payment.status}` : "—"}</td>
                      <td className="px-5 py-4"><p className="font-semibold text-slate-100">{formatBRL(order.totalCents)}</p>{order.discountCents > 0 && <p className="text-xs text-emerald-400">-{formatBRL(order.discountCents)}</p>}</td>
                      <td className="px-5 py-4"><Badge className={STATUS_LABEL[order.status]?.className ?? "border-white/10 bg-white/5 text-slate-300"}>{STATUS_LABEL[order.status]?.label ?? order.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {data && totalPages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} className="border-white/15 bg-white/5 text-white"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm text-slate-500">Página {page} de {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="border-white/15 bg-white/5 text-white"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </main>
    </div>
  );
}
