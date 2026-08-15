import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Zap } from "lucide-react";
import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type AuthResponse = { accessToken: string; refreshToken: string; user: { id: string; name: string; email: string; role: string; organizationId?: string | null } };

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "REQUEST_FAILED");
  return data as T;
}

const ERROR_LABELS: Record<string, string> = {
  INVALID_CREDENTIALS: "E-mail ou senha inválidos.",
  EMAIL_ALREADY_REGISTERED: "Este e-mail já está cadastrado. Faça login.",
  REQUEST_FAILED: "Falha na comunicação com o servidor.",
};

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const data = mode === "login"
        ? await post<AuthResponse>("/api/v1/auth/login", { email, password })
        : await post<AuthResponse>("/api/v1/auth/register", { email, password, name: name || undefined });
      localStorage.setItem("digitalticket_access_token", data.accessToken);
      localStorage.setItem("digitalticket_refresh_token", data.refreshToken);
      localStorage.setItem("digitalticket_user", JSON.stringify(data.user));
      window.location.href = data.user.role === "SUPER_ADMIN" ? "/admin" : "/";
    } catch (err: any) {
      setError(ERROR_LABELS[err.message] ?? "Não foi possível autenticar. Tente novamente.");
    } finally { setBusy(false); }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#080a12] px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(139,92,246,.18),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(236,72,153,.12),transparent_30%)]" />
      <Card className="relative w-full max-w-md border-white/10 bg-[#111522]/95">
        <CardHeader className="items-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-400 to-violet-600 shadow-lg shadow-fuchsia-500/20"><Zap className="h-6 w-6" /></div>
          <CardTitle className="text-2xl text-white">Digital<span className="text-fuchsia-400">Ticket</span></CardTitle>
          <p className="text-sm text-slate-500">{mode === "login" ? "Acesse sua conta para continuar." : "Crie sua conta de comprador."}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/5 p-1 text-sm">
            <button onClick={() => setMode("login")} className={`rounded-lg py-2 transition ${mode === "login" ? "bg-fuchsia-500/20 text-fuchsia-200" : "text-slate-400 hover:text-white"}`}>Entrar</button>
            <button onClick={() => setMode("register")} className={`rounded-lg py-2 transition ${mode === "register" ? "bg-fuchsia-500/20 text-fuchsia-200" : "text-slate-400 hover:text-white"}`}>Cadastrar</button>
          </div>
          {mode === "register" && (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-fuchsia-400" />
          )}
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-fuchsia-400" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={mode === "register" ? "Senha (mínimo 8 caracteres)" : "Senha"} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-fuchsia-400" onKeyDown={(e) => e.key === "Enter" && void submit()} />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <Button disabled={busy || !email || password.length < 8} onClick={() => void submit()} className="h-11 w-full bg-fuchsia-500 hover:bg-fuchsia-400">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
          <p className="text-center text-xs text-slate-600">Organizadores: use as credenciais fornecidas pelo super-admin.</p>
        </CardContent>
      </Card>
    </main>
  );
}
