import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Percent, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type CouponRow = { id: string; code: string; percentageOff: number | null; fixedOffCents: number | null; maxUses: number | null; usedCount: number; startsAt: string | null; endsAt: string | null; active: boolean; ordersCount: number; createdAt: string };

type CouponForm = { code: string; discountType: "percentage" | "fixed"; percentageOff: string; fixedOff: string; maxUses: string; startsAt: string; endsAt: string };

const EMPTY_FORM: CouponForm = { code: "", discountType: "percentage", percentageOff: "10", fixedOff: "5,00", maxUses: "", startsAt: "", endsAt: "" };

function formatBRL(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function toLocalInput(iso: string | null) { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }

function couponState(coupon: CouponRow): { label: string; className: string } {
  const now = new Date();
  if (!coupon.active) return { label: "Inativo", className: "border-slate-400/30 bg-slate-400/10 text-slate-400" };
  if (coupon.startsAt && new Date(coupon.startsAt) > now) return { label: "Agendado", className: "border-sky-400/30 bg-sky-400/10 text-sky-300" };
  if (coupon.endsAt && new Date(coupon.endsAt) < now) return { label: "Expirado", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return { label: "Esgotado", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" };
  return { label: "Ativo", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" };
}

export default function Coupons() {
  const [token] = useState(() => localStorage.getItem("digitalticket_access_token") ?? "");
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/manage/coupons`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "REQUEST_FAILED");
      setCoupons(body); setError(null);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const buildPayload = () => {
    const payload: Record<string, unknown> = {};
    if (!editing) payload.code = form.code;
    if (form.discountType === "percentage") { payload.percentageOff = Number(form.percentageOff); payload.fixedOffCents = null; }
    else { payload.fixedOffCents = Math.round(parseFloat(form.fixedOff.replace(",", ".")) * 100); payload.percentageOff = null; }
    payload.maxUses = form.maxUses ? Number(form.maxUses) : null;
    payload.startsAt = form.startsAt ? new Date(form.startsAt).toISOString() : null;
    payload.endsAt = form.endsAt ? new Date(form.endsAt).toISOString() : null;
    return payload;
  };

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(editing ? `${API_URL}/api/v1/manage/coupons/${editing.id}` : `${API_URL}/api/v1/manage/coupons`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildPayload()),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "REQUEST_FAILED");
      setForm(EMPTY_FORM); setShowForm(false); setEditing(null);
      await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const startEdit = (coupon: CouponRow) => {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      discountType: coupon.percentageOff != null ? "percentage" : "fixed",
      percentageOff: String(coupon.percentageOff ?? 10),
      fixedOff: ((coupon.fixedOffCents ?? 0) / 100).toFixed(2).replace(".", ","),
      maxUses: coupon.maxUses != null ? String(coupon.maxUses) : "",
      startsAt: toLocalInput(coupon.startsAt),
      endsAt: toLocalInput(coupon.endsAt),
    });
    setShowForm(true);
  };

  const toggleActive = async (coupon: CouponRow) => {
    setBusy(true);
    try {
      await fetch(`${API_URL}/api/v1/manage/coupons/${coupon.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ active: !coupon.active }) });
      await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const removeCoupon = async (coupon: CouponRow) => {
    setBusy(true);
    try {
      await fetch(`${API_URL}/api/v1/manage/coupons/${coupon.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  if (!token) return <main className="grid min-h-screen place-items-center bg-[#080a12] text-slate-400">Entre como organizador para gerenciar cupons.</main>;

  const filtered = coupons.filter((coupon) => filter === "all" ? true : filter === "active" ? couponState(coupon).label === "Ativo" : couponState(coupon).label !== "Ativo");

  return (
    <div className="min-h-screen bg-[#080a12] text-slate-100">
      <header className="flex items-center justify-between border-b border-white/5 px-6 py-5 lg:px-10">
        <div><p className="text-xs uppercase tracking-[.2em] text-slate-500">Workspace</p><h1 className="text-xl font-semibold">Cupons de desconto</h1></div>
        <div className="flex gap-3">
          <Button className="bg-fuchsia-500 hover:bg-fuchsia-400" onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />Novo cupom</Button>
          <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => (window.location.href = "/")}>Voltar ao painel</Button>
        </div>
      </header>
      <main className="space-y-5 p-6 lg:p-10">
        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

        {showForm && (
          <Card className="border-fuchsia-400/20 bg-fuchsia-400/5 shadow-none">
            <CardHeader><CardTitle className="text-base">{editing ? `Editar cupom ${editing.code}` : "Criar cupom"}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CÓDIGO" disabled={Boolean(editing)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm uppercase outline-none focus:border-fuchsia-400 disabled:opacity-50" />
                <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as "percentage" | "fixed" })} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-fuchsia-400">
                  <option value="percentage">Percentual (%)</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </select>
                {form.discountType === "percentage"
                  ? <input value={form.percentageOff} onChange={(e) => setForm({ ...form, percentageOff: e.target.value })} type="number" min="1" max="100" placeholder="% de desconto" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-fuchsia-400" />
                  : <input value={form.fixedOff} onChange={(e) => setForm({ ...form, fixedOff: e.target.value })} placeholder="Valor (ex: 10,00)" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-fuchsia-400" />}
                <input value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} type="number" min="1" placeholder="Limite de usos (vazio = ilimitado)" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-fuchsia-400" />
                <label className="text-xs text-slate-500">Válido a partir de
                  <input value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} type="datetime-local" className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-fuchsia-400" />
                </label>
                <label className="text-xs text-slate-500">Válido até
                  <input value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} type="datetime-local" className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-fuchsia-400" />
                </label>
              </div>
              <div className="flex gap-2">
                <Button disabled={busy || (!editing && form.code.length < 3)} onClick={() => void submit()} className="bg-fuchsia-500 hover:bg-fuchsia-400">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Salvar alterações" : "Criar cupom"}</Button>
                {editing && <Button variant="outline" className="border-white/15 bg-white/5 text-white" onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowForm(false); }}>Cancelar</Button>}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-2 text-sm">
          {(["all", "active", "inactive"] as const).map((value) => (
            <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 transition ${filter === value ? "bg-fuchsia-500/20 text-fuchsia-200" : "text-slate-500 hover:text-white"}`}>
              {value === "all" ? "Todos" : value === "active" ? "Ativos" : "Inativos/encerrados"}
            </button>
          ))}
          <span className="ml-auto text-slate-500">{filtered.length} cupom(ns)</span>
        </div>

        <Card className="border-white/5 bg-[#111522] shadow-none">
          <CardContent className="p-0">
            {loading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" /></div> : !filtered.length ? (
              <div className="grid min-h-64 place-items-center text-center"><div><Percent className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-3 text-sm text-slate-500">Nenhum cupom encontrado.</p></div></div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-4">Código</th><th className="px-5 py-4">Desconto</th><th className="px-5 py-4">Usos</th><th className="px-5 py-4">Vigência</th><th className="px-5 py-4">Status</th><th className="px-5 py-4"></th>
                </tr></thead>
                <tbody>
                  {filtered.map((coupon) => {
                    const state = couponState(coupon);
                    return (
                      <tr key={coupon.id} className="border-b border-white/5 last:border-0 hover:bg-white/[.02]">
                        <td className="px-5 py-4 font-mono font-semibold text-fuchsia-300">{coupon.code}</td>
                        <td className="px-5 py-4 text-slate-300">{coupon.percentageOff != null ? `${coupon.percentageOff}%` : formatBRL(coupon.fixedOffCents ?? 0)}</td>
                        <td className="px-5 py-4 text-slate-400">{coupon.usedCount}{coupon.maxUses != null ? ` / ${coupon.maxUses}` : " / ∞"}</td>
                        <td className="px-5 py-4 text-xs text-slate-400">
                          {coupon.startsAt ? new Date(coupon.startsAt).toLocaleDateString("pt-BR") : "imediato"} → {coupon.endsAt ? new Date(coupon.endsAt).toLocaleDateString("pt-BR") : "sem fim"}
                        </td>
                        <td className="px-5 py-4">
                          <button onClick={() => void toggleActive(coupon)} disabled={busy} title="Clique para ativar/desativar">
                            <Badge className={state.className}>{state.label}</Badge>
                          </button>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button onClick={() => startEdit(coupon)} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white" title="Editar"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => void removeCoupon(coupon)} disabled={busy} className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400" title={coupon.ordersCount > 0 ? "Cupom em uso — será desativado" : "Excluir cupom"}><Trash2 className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
