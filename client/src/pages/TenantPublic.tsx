import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, Loader2, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "wouter";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type TenantEvent = { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; startsAt: string | null; category: string | null; lots: Array<{ id: string; name: string; priceInCents: number; available: number }> };
type TenantData = { id: string; name: string; slug: string; logoUrl: string | null; primaryColor: string; accentColor: string; events: TenantEvent[] };

function formatBRL(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function TenantPublic() {
  const params = useParams<{ slug: string }>();
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/public/tenants/${params.slug}`)
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body?.error ?? "TENANT_NOT_FOUND"); setTenant(body); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.slug]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f7f5fb]"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-500" /></main>;
  if (error || !tenant) return <main className="grid min-h-screen place-items-center bg-[#f7f5fb] px-6 text-center"><div><Ticket className="mx-auto h-10 w-10 text-slate-400" /><h1 className="mt-4 text-xl font-semibold text-slate-900">Página não encontrada</h1><p className="mt-2 text-slate-500">Este organizador não existe ou ainda não publicou eventos.</p></div></main>;

  return (
    <main className="min-h-screen bg-[#f7f5fb] text-slate-950">
      <header className="border-b border-slate-200/80 bg-white/80 px-6 py-5 backdrop-blur lg:px-10">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          {tenant.logoUrl ? <img src={tenant.logoUrl} alt={tenant.name} className="h-10 w-10 rounded-xl object-cover" /> : <div className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.accentColor})` }}><Ticket className="h-5 w-5" /></div>}
          <span className="text-lg font-semibold">{tenant.name}</span>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-12 lg:px-10">
        <Badge className="border" style={{ borderColor: `${tenant.primaryColor}40`, backgroundColor: `${tenant.primaryColor}12`, color: tenant.primaryColor }}>Eventos oficiais</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-.03em] sm:text-5xl">Próximos eventos de {tenant.name}</h1>
        <p className="mt-4 max-w-xl text-lg text-slate-500">Compre ingressos com segurança e receba seu QR Code na hora.</p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {tenant.events.map((event) => {
            const cheapest = event.lots.reduce<number | null>((min, lot) => (min == null || lot.priceInCents < min ? lot.priceInCents : min), null);
            return (
              <Card key={event.id} className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-lg shadow-slate-200/40">
                {event.imageUrl && <img src={event.imageUrl} alt={event.name} className="h-44 w-full object-cover" />}
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">{event.name}</h2>
                      {event.category && <p className="mt-1 text-sm text-slate-500">{event.category}</p>}
                    </div>
                    {cheapest != null && <Badge style={{ backgroundColor: `${tenant.accentColor}14`, color: tenant.accentColor }}>a partir de {formatBRL(cheapest)}</Badge>}
                  </div>
                  {event.description && <p className="mt-3 line-clamp-2 text-sm text-slate-500">{event.description}</p>}
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                    <CalendarDays className="h-4 w-4" style={{ color: tenant.primaryColor }} />
                    {event.startsAt ? new Date(event.startsAt).toLocaleString("pt-BR") : "Data a confirmar"}
                  </div>
                  <Button className="mt-5 w-full text-white" style={{ backgroundColor: tenant.primaryColor }} onClick={() => (window.location.href = `/event/demo`)}>Comprar ingresso</Button>
                </CardContent>
              </Card>
            );
          })}
          {!tenant.events.length && <p className="text-slate-500">Nenhum evento publicado no momento.</p>}
        </div>
      </section>
      <footer className="border-t border-slate-200 px-6 py-6 text-center text-xs text-slate-400">Powered by DigitalTicket</footer>
    </main>
  );
}
