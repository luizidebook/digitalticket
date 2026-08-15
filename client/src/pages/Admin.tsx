import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, CircleDollarSign, Loader2, Plus, ShieldCheck, Ticket, Trash2, UserPlus, Users, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type Overview = { organizations: number; events: number; orders: number; ticketsIssued: number; grossRevenueCents: number; platformFeeCents: number; netRevenueCents: number };
type OrganizationRow = { id: string; name: string; slug: string; domain: string | null; logoUrl: string | null; primaryColor: string; accentColor: string; createdAt: string; events: number; orders: number; users: number; grossRevenueCents: number };
type OrganizerRow = { id: string; name: string; email: string; createdAt: string };
type FeeInfo = { fee: { percentageBps: number; fixedCents: number }; source: string };

function formatBRL(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) }, ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "REQUEST_FAILED");
  return data as T;
}

export default function Admin() {
  const [token, setToken] = useState(() => localStorage.getItem("digitalticket_access_token") ?? "");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null); const [authBusy, setAuthBusy] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [fee, setFee] = useState<FeeInfo | null>(null);
  const [selected, setSelected] = useState<OrganizationRow | null>(null);
  const [organizers, setOrganizers] = useState<OrganizerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orgForm, setOrgForm] = useState({ name: "", slug: "", domain: "", primaryColor: "#ff5c7a", accentColor: "#8b5cf6" });
  const [organizerForm, setOrganizerForm] = useState({ name: "", email: "", password: "" });
  const [showOrgForm, setShowOrgForm] = useState(false);

  const login = async () => {
    setAuthBusy(true); setAuthError(null);
    try {
      const data = await api<{ accessToken: string; user: { role: string } }>("/api/v1/auth/login", "", { method: "POST", body: JSON.stringify({ email, password }) });
      if (data.user.role !== "SUPER_ADMIN") { setAuthError("Esta conta não é super-admin."); return; }
      localStorage.setItem("digitalticket_access_token", data.accessToken);
      setToken(data.accessToken);
    } catch { setAuthError("Credenciais inválidas."); } finally { setAuthBusy(false); }
  };

  const load = useCallback(async (auth: string) => {
    try {
      const [ov, orgs, fees] = await Promise.all([
        api<Overview>("/api/v1/admin/overview", auth),
        api<OrganizationRow[]>("/api/v1/admin/organizations", auth),
        api<FeeInfo>("/api/v1/admin/platform/fees", auth),
      ]);
      setOverview(ov); setOrganizations(orgs); setFee(fees); setError(null);
    } catch (err: any) { setError(err.message); }
  }, []);

  useEffect(() => { if (token) void load(token); }, [token, load]);

  const loadOrganizers = async (org: OrganizationRow) => {
    setSelected(org);
    const rows = await api<OrganizerRow[]>(`/api/v1/admin/organizations/${org.id}/organizers`, token).catch(() => []);
    setOrganizers(rows);
  };

  const createOrganization = async () => {
    setBusy(true); setError(null);
    try {
      await api("/api/v1/admin/organizations", token, { method: "POST", body: JSON.stringify({ name: orgForm.name, slug: orgForm.slug, domain: orgForm.domain || null, primaryColor: orgForm.primaryColor, accentColor: orgForm.accentColor }) });
      setOrgForm({ name: "", slug: "", domain: "", primaryColor: "#ff5c7a", accentColor: "#8b5cf6" }); setShowOrgForm(false);
      await load(token);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const createOrganizer = async () => {
    if (!selected) return; setBusy(true); setError(null);
    try {
      await api(`/api/v1/admin/organizations/${selected.id}/organizers`, token, { method: "POST", body: JSON.stringify(organizerForm) });
      setOrganizerForm({ name: "", email: "", password: "" });
      await loadOrganizers(selected);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const removeOrganizer = async (userId: string) => {
    if (!selected) return; setBusy(true);
    try { await api(`/api/v1/admin/organizers/${userId}`, token, { method: "DELETE" }); await loadOrganizers(selected); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#080a12] px-6 text-white">
        <Card className="w-full max-w-sm border-white/10 bg-[#111522]">
          <CardHeader className="items-center text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-400 to-violet-600"><ShieldCheck className="h-6 w-6" /></div>
            <CardTitle className="text-white">Painel super-admin</CardTitle>
            <p className="text-sm text-slate-500">Acesso restrito à administração da plataforma.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-fuchsia-400" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Senha" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-fuchsia-400" onKeyDown={(e) => e.key === "Enter" && void login()} />
            {authError && <p className="text-sm text-rose-400">{authError}</p>}
            <Button disabled={authBusy || !email || !password} onClick={() => void login()} className="h-11 w-full bg-fuchsia-500 hover:bg-fuchsia-400">{authBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const kpis = overview ? [
    { label: "Organizações", value: String(overview.organizations), icon: Building2 },
    { label: "Eventos", value: String(overview.events), icon: Zap },
    { label: "Ingressos emitidos", value: String(overview.ticketsIssued), icon: Ticket },
    { label: "Receita bruta", value: formatBRL(overview.grossRevenueCents), icon: CircleDollarSign },
    { label: "Taxa da plataforma", value: formatBRL(overview.platformFeeCents), icon: CircleDollarSign },
    { label: "Receita líquida (orgs)", value: formatBRL(overview.netRevenueCents), icon: Users },
  ] : [];

  return (
    <div className="min-h-screen bg-[#080a12] text-slate-100">
      <header className="flex items-center justify-between border-b border-white/5 px-6 py-5 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-400 to-violet-600"><ShieldCheck className="h-4 w-4" /></div>
          <div><p className="text-xs uppercase tracking-[.2em] text-slate-500">DigitalTicket</p><h1 className="text-xl font-semibold">Painel super-admin</h1></div>
        </div>
        <div className="flex items-center gap-3">
          {fee && <Badge className="border-white/10 bg-white/5 text-slate-300">Taxa: {(fee.fee.percentageBps / 100).toFixed(2)}% + {formatBRL(fee.fee.fixedCents)} ({fee.source})</Badge>}
          <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => { localStorage.removeItem("digitalticket_access_token"); setToken(""); }}>Sair</Button>
        </div>
      </header>

      <main className="space-y-8 p-6 lg:p-10">
        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="border-white/5 bg-[#111522] shadow-none">
              <CardContent className="p-5">
                <div className="flex items-center justify-between"><p className="text-xs text-slate-500">{kpi.label}</p><kpi.icon className="h-4 w-4 text-fuchsia-300" /></div>
                <p className="mt-4 text-xl font-semibold tracking-tight">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
          <Card className="border-white/5 bg-[#111522] shadow-none">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Organizações</CardTitle>
              <Button size="sm" className="bg-fuchsia-500 hover:bg-fuchsia-400" onClick={() => setShowOrgForm(!showOrgForm)}><Plus className="mr-1 h-4 w-4" />Nova organização</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {showOrgForm && (
                <div className="space-y-2 rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} placeholder="Nome" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                    <input value={orgForm.slug} onChange={(e) => setOrgForm({ ...orgForm, slug: e.target.value })} placeholder="slug" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                    <input value={orgForm.domain} onChange={(e) => setOrgForm({ ...orgForm, domain: e.target.value })} placeholder="domínio próprio (opcional)" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                    <div className="flex items-center gap-2">
                      <input type="color" value={orgForm.primaryColor} onChange={(e) => setOrgForm({ ...orgForm, primaryColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent" title="Cor primária" />
                      <input type="color" value={orgForm.accentColor} onChange={(e) => setOrgForm({ ...orgForm, accentColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent" title="Cor de destaque" />
                    </div>
                  </div>
                  <Button disabled={busy || !orgForm.name || !orgForm.slug} onClick={() => void createOrganization()} size="sm" className="bg-fuchsia-500 hover:bg-fuchsia-400">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar organização"}</Button>
                </div>
              )}
              {organizations.map((org) => (
                <button key={org.id} onClick={() => void loadOrganizers(org)} className={`flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition ${selected?.id === org.id ? "border-fuchsia-400/40 bg-fuchsia-400/10" : "border-white/5 bg-white/[.02] hover:border-white/15"}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg" style={{ background: `linear-gradient(135deg, ${org.primaryColor}, ${org.accentColor})` }} />
                    <div>
                      <p className="font-medium text-slate-200">{org.name} <span className="text-xs text-slate-500">/{org.slug}</span></p>
                      <p className="mt-0.5 text-xs text-slate-500">{org.domain ?? "sem domínio próprio"} · {org.events} evento(s) · {org.users} usuário(s)</p>
                    </div>
                  </div>
                  <span className="text-sm text-fuchsia-300">{formatBRL(org.grossRevenueCents)}</span>
                </button>
              ))}
              {!organizations.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma organização cadastrada.</p>}
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-[#111522] shadow-none">
            <CardHeader><CardTitle className="text-base">{selected ? `Organizadores — ${selected.name}` : "Organizadores"}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!selected ? <p className="py-8 text-center text-sm text-slate-500">Selecione uma organização para gerenciar organizadores.</p> : (
                <>
                  <div className="space-y-2 rounded-xl border border-white/5 bg-white/[.02] p-3">
                    <input value={organizerForm.name} onChange={(e) => setOrganizerForm({ ...organizerForm, name: e.target.value })} placeholder="Nome do organizador" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                    <input value={organizerForm.email} onChange={(e) => setOrganizerForm({ ...organizerForm, email: e.target.value })} placeholder="E-mail" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                    <input value={organizerForm.password} onChange={(e) => setOrganizerForm({ ...organizerForm, password: e.target.value })} type="password" placeholder="Senha (mín. 8)" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                    <Button disabled={busy || !organizerForm.name || !organizerForm.email || organizerForm.password.length < 8} onClick={() => void createOrganizer()} size="sm" className="bg-fuchsia-500 hover:bg-fuchsia-400"><UserPlus className="mr-1 h-4 w-4" />Adicionar</Button>
                  </div>
                  {organizers.map((organizer) => (
                    <div key={organizer.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[.02] px-4 py-3">
                      <div><p className="text-sm font-medium text-slate-200">{organizer.name}</p><p className="text-xs text-slate-500">{organizer.email}</p></div>
                      <button onClick={() => void removeOrganizer(organizer.id)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400" title="Remover organizador"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  {!organizers.length && <p className="py-4 text-center text-sm text-slate-500">Nenhum organizador nesta organização.</p>}
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
