"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import api from "@/lib/api";

interface Dashboard {
  oficinaNome: string;
  segmento: string;
  precisaOnboarding: boolean;
  kpis: {
    agendamentosHoje: number;
    urgencias24h: number;
    revisoesPreventivas: number;
    clientesCadastrados: number;
  };
  proximosAgendamentos: {
    id: string;
    dataHora: string;
    categoria: string;
    sintoma: string | null;
    status: string;
    clienteNome: string;
    veiculoModelo: string | null;
  }[];
}

const SEGMENTO_LABEL: Record<string, string> = {
  auto_eletrica: "Auto-Elétrica",
  mecanica: "Oficina Mecânica",
  integrado: "Integrado",
};

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div
      className="p-5"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-ui)", borderRadius: "var(--radius-card)" }}
    >
      <div className="text-3xl font-bold" style={{ color: color ?? "var(--text-main)" }}>
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .get("/admin/dashboard")
      .then((r) => setData(r.data))
      .catch(() => setErro("Erro ao carregar o painel."));
  }, []);

  useEffect(() => {
    if (data?.precisaOnboarding) router.replace("/configuracao?onboarding=1");
  }, [data, router]);

  return (
    <AdminShell>
      {erro && <p style={{ color: "var(--danger)" }}>{erro}</p>}
      {data && (
        <>
          <h1 className="text-2xl font-bold">Painel {SEGMENTO_LABEL[data.segmento] ?? data.segmento}</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            {data.oficinaNome}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Kpi label="Agendamentos hoje" value={data.kpis.agendamentosHoje} />
            <Kpi
              label="Urgências (24h)"
              value={data.kpis.urgencias24h}
              color={data.kpis.urgencias24h > 0 ? "var(--danger)" : undefined}
            />
            <Kpi
              label="Revisões preventivas a lembrar"
              value={data.kpis.revisoesPreventivas}
              color={data.kpis.revisoesPreventivas > 0 ? "var(--accent)" : undefined}
            />
            <Kpi label="Clientes cadastrados" value={data.kpis.clientesCadastrados} />
          </div>

          <div
            className="p-5"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-ui)", borderRadius: "var(--radius-card)" }}
          >
            <h3 className="font-semibold mb-3">Próximos agendamentos</h3>
            {data.proximosAgendamentos.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Nenhum agendamento futuro ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <th className="text-left py-2 pr-3 font-medium">Quando</th>
                      <th className="text-left py-2 pr-3 font-medium">Cliente</th>
                      <th className="text-left py-2 pr-3 font-medium">Veículo</th>
                      <th className="text-left py-2 pr-3 font-medium">Categoria</th>
                      <th className="text-left py-2 font-medium">Relato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.proximosAgendamentos.map((a) => (
                      <tr key={a.id} style={{ borderTop: "1px solid var(--border-ui)" }}>
                        <td className="py-2 pr-3">
                          {new Date(a.dataHora).toLocaleString("pt-BR", {
                            weekday: "short",
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2 pr-3">{a.clienteNome}</td>
                        <td className="py-2 pr-3">{a.veiculoModelo ?? "—"}</td>
                        <td className="py-2 pr-3">{a.categoria}</td>
                        <td className="py-2" style={{ color: "var(--text-muted)" }}>
                          {(a.sintoma ?? "").slice(0, 40)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </AdminShell>
  );
}
