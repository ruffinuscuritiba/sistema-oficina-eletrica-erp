"use client";
import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import api from "@/lib/api";

interface Plano {
  id: string;
  nome: string;
  intervalo_km: number | null;
  intervalo_meses: number | null;
}

interface ProximaRevisao {
  id: string;
  proxima_data: string | null;
  servico: string;
  cliente_nome: string;
  veiculo_modelo: string | null;
  status: string;
}

interface Veiculo {
  id: string;
  label: string;
}

interface ManutencaoData {
  planos: Plano[];
  proximasRevisoes: ProximaRevisao[];
  veiculos: Veiculo[];
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-ui)",
  color: "var(--text-main)",
};

export default function ManutencaoPage() {
  const [data, setData] = useState<ManutencaoData | null>(null);
  const [veiculoId, setVeiculoId] = useState("");
  const [planoId, setPlanoId] = useState("");
  const [kmAtual, setKmAtual] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function carregar() {
    try {
      const { data } = await api.get("/admin/manutencao");
      setData(data);
    } catch {
      setMensagem({ tipo: "erro", texto: "Erro ao carregar manutenção preventiva." });
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMensagem(null);
    try {
      await api.post("/admin/manutencao", {
        veiculoId,
        planoId,
        kmAtual: kmAtual ? parseInt(kmAtual, 10) : undefined,
      });
      setMensagem({ tipo: "ok", texto: "Serviço registrado! O lembrete da próxima revisão já está agendado." });
      setVeiculoId("");
      setPlanoId("");
      setKmAtual("");
      carregar();
    } catch (err: any) {
      setMensagem({ tipo: "erro", texto: err.response?.data?.erro || "Erro ao registrar serviço." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold">Manutenção preventiva</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Registre um serviço feito e o sistema avisa o cliente sozinho quando estiver na hora da próxima revisão.
      </p>

      {mensagem && (
        <div
          className="p-3 rounded-xl text-sm mb-4"
          style={{
            background: mensagem.tipo === "ok" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            border: `1px solid ${mensagem.tipo === "ok" ? "var(--success)" : "var(--danger)"}`,
            color: mensagem.tipo === "ok" ? "var(--success)" : "var(--danger)",
          }}
        >
          {mensagem.texto}
        </div>
      )}

      <div
        className="p-5 mb-6"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-ui)", borderRadius: "var(--radius-card)" }}
      >
        <h3 className="font-semibold mb-3">Registrar serviço realizado</h3>
        {data && data.veiculos.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nenhum veículo cadastrado ainda. Os veículos aparecem aqui automaticamente conforme os clientes chegam pelo WhatsApp.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--text-muted)" }}>
                Veículo
              </label>
              <select
                value={veiculoId}
                onChange={(e) => setVeiculoId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
              >
                <option value="">Selecione...</option>
                {data?.veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--text-muted)" }}>
                Serviço realizado
              </label>
              <select
                value={planoId}
                onChange={(e) => setPlanoId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
              >
                <option value="">Selecione...</option>
                {data?.planos.map((p) => {
                  const intervalo = [
                    p.intervalo_km ? `${p.intervalo_km.toLocaleString("pt-BR")} km` : null,
                    p.intervalo_meses ? `${p.intervalo_meses} meses` : null,
                  ]
                    .filter(Boolean)
                    .join(" ou ");
                  return (
                    <option key={p.id} value={p.id}>
                      {p.nome} (a cada {intervalo})
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--text-muted)" }}>
                Quilometragem atual (opcional)
              </label>
              <input
                type="number"
                value={kmAtual}
                onChange={(e) => setKmAtual(e.target.value)}
                min={0}
                placeholder="Ex: 45000"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2.5 rounded-xl font-semibold disabled:opacity-60"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {salvando ? "Registrando..." : "Registrar e agendar lembrete"}
            </button>
          </form>
        )}
      </div>

      <div
        className="p-5"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-ui)", borderRadius: "var(--radius-card)" }}
      >
        <h3 className="font-semibold mb-3">Próximas revisões a lembrar</h3>
        {!data || data.proximasRevisoes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nenhuma revisão programada ainda. Registre um serviço acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="text-left py-2 pr-3 font-medium">Quando</th>
                  <th className="text-left py-2 pr-3 font-medium">Cliente</th>
                  <th className="text-left py-2 pr-3 font-medium">Veículo</th>
                  <th className="text-left py-2 pr-3 font-medium">Serviço</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.proximasRevisoes.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid var(--border-ui)" }}>
                    <td className="py-2 pr-3">
                      {m.proxima_data
                        ? new Date(m.proxima_data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="py-2 pr-3">{m.cliente_nome}</td>
                    <td className="py-2 pr-3">{m.veiculo_modelo ?? "—"}</td>
                    <td className="py-2 pr-3">{m.servico}</td>
                    <td className="py-2">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={
                          m.status === "lembrete_enviado"
                            ? { background: "rgba(34,197,94,0.15)", color: "var(--success)" }
                            : { background: "rgba(59,130,246,0.15)", color: "var(--accent)" }
                        }
                      >
                        {m.status === "lembrete_enviado" ? "Lembrete enviado" : "Aguardando"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
