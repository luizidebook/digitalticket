import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Globe, Image, Loader2, Palette } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type Branding = { id: string; name: string; slug: string; domain: string | null; logoUrl: string | null; primaryColor: string; accentColor: string };

export default function Branding() {
  const [token] = useState(() => localStorage.getItem("digitalticket_access_token") ?? "");
  const [branding, setBranding] = useState<Branding | null>(null);
  const [form, setForm] = useState({ name: "", domain: "", logoUrl: "", primaryColor: "#ff5c7a", accentColor: "#8b5cf6" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/tenant/branding`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "REQUEST_FAILED");
      setBranding(body);
      setForm({ name: body.name, domain: body.domain ?? "", logoUrl: body.logoUrl ?? "", primaryColor: body.primaryColor, accentColor: body.accentColor });
      setError(null);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const response = await fetch(`${API_URL}/api/v1/tenant/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: form.name, domain: form.domain || null, logoUrl: form.logoUrl || null, primaryColor: form.primaryColor, accentColor: form.accentColor }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "REQUEST_FAILED");
      setBranding(body); setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  if (!token) return <main className="grid min-h-screen place-items-center bg-[#080a12] text-slate-400">Entre como organizador para configurar a marca.</main>;

  return (
    <div className="min-h-screen bg-[#080a12] text-slate-100">
      <header className="flex items-center justify-between border-b border-white/5 px-6 py-5 lg:px-10">
        <div><p className="text-xs uppercase tracking-[.2em] text-slate-500">Workspace</p><h1 className="text-xl font-semibold">Marca white-label</h1></div>
        <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => (window.location.href = "/")}>Voltar ao painel</Button>
      </header>
      <main className="grid gap-6 p-6 lg:grid-cols-[1fr_1fr] lg:p-10">
        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 lg:col-span-2">{error}</div>}
        {loading ? <div className="grid min-h-64 place-items-center lg:col-span-2"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" /></div> : (
          <>
            <Card className="border-white/5 bg-[#111522] shadow-none">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4 text-fuchsia-300" />Identidade visual</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <label className="block text-sm text-slate-400">Nome da organização
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-fuchsia-400" />
                </label>
                <label className="block text-sm text-slate-400"><Globe className="mr-1 inline h-3.5 w-3.5" />Domínio próprio
                  <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="tickets.suaempresa.com.br" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-fuchsia-400" />
                  <span className="mt-1 block text-xs text-slate-600">Aponte um CNAME para a plataforma e informe o domínio aqui.</span>
                </label>
                <label className="block text-sm text-slate-400"><Image className="mr-1 inline h-3.5 w-3.5" />URL do logotipo
                  <input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://…/logo.png" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-fuchsia-400" />
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block text-sm text-slate-400">Cor primária
                    <div className="mt-1.5 flex items-center gap-2">
                      <input type="color" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
                      <input value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none focus:border-fuchsia-400" />
                    </div>
                  </label>
                  <label className="block text-sm text-slate-400">Cor de destaque
                    <div className="mt-1.5 flex items-center gap-2">
                      <input type="color" value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
                      <input value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none focus:border-fuchsia-400" />
                    </div>
                  </label>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Button disabled={busy || !form.name} onClick={() => void save()} className="bg-fuchsia-500 hover:bg-fuchsia-400">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar alterações"}</Button>
                  {saved && <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300"><Check className="mr-1 h-3 w-3" />Salvo</Badge>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/5 bg-[#111522] shadow-none">
              <CardHeader><CardTitle className="text-base">Pré-visualização pública</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white text-slate-950">
                  <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                    {form.logoUrl ? <img src={form.logoUrl} alt="Logo" className="h-9 w-9 rounded-xl object-cover" /> : <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${form.primaryColor}, ${form.accentColor})` }}><Palette className="h-4 w-4" /></div>}
                    <span className="font-semibold">{form.name || "Sua organização"}</span>
                  </div>
                  <div className="space-y-4 p-6">
                    <span className="inline-block rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: `${form.primaryColor}18`, color: form.primaryColor }}>Evento publicado</span>
                    <h3 className="text-2xl font-semibold tracking-tight">Aurora Sessions</h3>
                    <p className="text-sm text-slate-500">Assim seus compradores verão a página pública do seu evento, com as cores e o logotipo da sua marca.</p>
                    <button className="w-full rounded-xl py-3 text-sm font-semibold text-white" style={{ backgroundColor: form.primaryColor }}>Comprar ingresso</button>
                    <button className="w-full rounded-xl border py-3 text-sm font-semibold" style={{ borderColor: form.accentColor, color: form.accentColor }}>Saiba mais</button>
                  </div>
                </div>
                {branding && <p className="mt-4 text-center text-xs text-slate-500">Página pública: /{branding.slug} · {branding.domain ?? "sem domínio próprio configurado"}</p>}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
