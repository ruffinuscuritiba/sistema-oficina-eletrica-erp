"use client";
import { useState } from "react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

interface LojaOpcao {
  oficinaId: string;
  oficinaNome: string;
}

export default function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lojas, setLojas] = useState<LojaOpcao[] | null>(null);
  const [oficinaId, setOficinaId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, senha, oficinaId: oficinaId || undefined });
      setAuth(data.accessToken, data.user);
      // Navegacao hard (nao router.push): o router cache do App Router pode
      // servir uma arvore prefetchada ANTES do login, com o zustand ainda
      // sem token -- reload garante que /dashboard monta com o estado real.
      window.location.href = "/dashboard";
    } catch (err: any) {
      if (err.response?.status === 300 && err.response.data?.multiplasLojas) {
        setLojas(err.response.data.multiplasLojas);
      } else {
        setError(err.response?.data?.erro || "E-mail ou senha inválidos.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--surface-0)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl mb-2">🔧</div>
          <h1 className="text-2xl font-bold">Painel Admin</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Entre para gerenciar sua oficina
          </p>
        </div>

        <div
          className="p-6"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-ui)", borderRadius: "var(--radius-card)" }}
        >
          {!lojas ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: "var(--text-muted)" }}>
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border-ui)", color: "var(--text-main)" }}
                />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Senha
                </label>
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border-ui)", color: "var(--text-main)" }}
                />
              </div>

              {error && <p className="text-sm text-center" style={{ color: "var(--danger)" }}>{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-semibold disabled:opacity-60"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Esse e-mail está cadastrado em mais de uma oficina. Selecione qual:
              </p>
              {lojas.map((l) => (
                <label
                  key={l.oficinaId}
                  className="flex items-center gap-2.5 p-3 rounded-xl cursor-pointer text-sm"
                  style={{ border: "1px solid var(--border-ui)", background: oficinaId === l.oficinaId ? "var(--surface-3)" : "transparent" }}
                >
                  <input
                    type="radio"
                    name="oficinaId"
                    value={l.oficinaId}
                    checked={oficinaId === l.oficinaId}
                    onChange={(e) => setOficinaId(e.target.value)}
                    required
                  />
                  {l.oficinaNome}
                </label>
              ))}

              {error && <p className="text-sm text-center" style={{ color: "var(--danger)" }}>{error}</p>}

              <button
                type="submit"
                disabled={loading || !oficinaId}
                className="w-full py-2.5 rounded-xl font-semibold disabled:opacity-60"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {loading ? "Entrando..." : "Confirmar"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
