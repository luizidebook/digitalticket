import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2, Search, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type CustomerRow = { id: string; name: string; email: string; createdAt: string; ordersCount: number; paidOrders: number; lifetimeValueCents: number; lastOrderAt: string | null };
type CustomersResponse = { total: number; page: number; pageSize: number; customers: CustomerRow[] };

function formatBRL(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function Customers() {
  const [token] = useState(() => localStorage.getItem("digitalticket_access_token") ?? "");
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "15" });
      if (search) params.set("search", search);
      const response = await fetch(`${API_URL}/api/v1/manage/customers?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "REQUEST_FAILED");
      setData(body); setError(null);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [token, page, search]);

  useEffect(() => { const timer = setTimeout(() => void load(), 300); return () => clearTimeout(timer); }, [load]);

  if (!token) return <main className="grid min-h-screen place-items-center bg-[#080a12] text-slate-400">Entre como organizador para gerenciar clientes.</main>;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="min-h-screen bg-[#080a12] text-slate-100">
      <header className="flex items-center justify-between border-b border-white/5 px-6 py-5 lg:px-10">
        <div><p className="text-xs uppercase tracking-[.2em] text-slate-500">Workspace</p><h1 className="text-xl font-semibold">Clientes</h1></div>
        <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => (window.location.href = "/")}>Voltar ao painel</Button>
      </header>
      <main className="space-y-5 p-6 lg:p-10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por nome ou e-mail" className="w-80 rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-fuchsia-400" />
          </div>
          {data && <span className="text-sm text-slate-500">{data.total} cliente(s)</span>}
        </div>

        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

        <Card className="border-white/5 bg-[#111522] shadow-none">
          <CardContent className="p-0">
            {loading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" /></div> : !data?.customers.length ? (
              <div className="grid min-h-64 place-items-center text-center"><div><Users className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-3 text-sm text-slate-500">Nenhum cliente encontrado.</p></div></div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-4">Cliente</th><th className="px-5 py-4">Desde</th><th className="px-5 py-4">Pedidos</th><th className="px-5 py-4">Pedidos pagos</th><th className="px-5 py-4">Valor total</th><th className="px-5 py-4">Último pedido</th>
                </tr></thead>
                <tbody>
                  {data.customers.map((customer) => (
                    <tr key={customer.id} className="border-b border-white/5 last:border-0 hover:bg-white/[.02]">
                      <td className="px-5 py-4"><p className="font-medium text-slate-200">{customer.name}</p><p className="text-xs text-slate-500">{customer.email}</p></td>
                      <td className="px-5 py-4 text-slate-400">{new Date(customer.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td className="px-5 py-4 text-slate-300">{customer.ordersCount}</td>
                      <td className="px-5 py-4 text-slate-300">{customer.paidOrders}</td>
                      <td className="px-5 py-4 font-semibold text-slate-100">{formatBRL(customer.lifetimeValueCents)}</td>
                      <td className="px-5 py-4 text-slate-400">{customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString("pt-BR") : "—"}</td>
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
