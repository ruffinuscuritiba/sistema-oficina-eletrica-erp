"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import SuperAdminShell from "@/components/SuperAdminShell";
import api from "@/lib/api";

interface Loja {
  id: string;
  nome: string;
  segmento: string;
  ativo: boolean;
  totalClientes: number;
  totalAgendamentos: number;
}

const SEGMENTO_LABEL: Record<string, string> = {
  auto_eletrica: "Auto-Elétrica",
  mecanica: "Oficina Mecânica",
  integrado: "Integrado",
};

export default function SuperAdminLojasPage() {
  const [lojas, setLojas] = useState<Loja[] | null>(null);
  const [erro, setErro] = useState("");

  async function carregar() {
    try {
      const { data } = await api.get("/super-admin/lojas");
      setLojas(data.lojas);
    } catch {
      setErro("Erro ao carregar lojas.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function toggleAtivo(id: string) {
    await api.post(`/super-admin/lojas/${id}/toggle-ativo`);
    carregar();
  }

  return (
    <SuperAdminShell>
      <h1 className="text-2xl font-bold">Lojas</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Todas as oficinas cadastradas no sistema.
      </p>

      {erro && <p style={{ color: "var(--danger)" }}>{erro}</p>}

      <div
        className="p-5 mb-6"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-ui)", borderRadius: "var(--radius-card)" }}
      >
        {!lojas || lojas.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nenhuma loja cadastrada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="text-left py-2 pr-3 font-medium">Nome</th>
                  <th className="text-left py-2 pr-3 font-medium">Sistema</th>
                  <th className="text-left py-2 pr-3 font-medium">Clientes</th>
                  <th className="text-left py-2 pr-3 font-medium">Agendamentos</th>
                  <th className="text-left py-2 pr-3 font-medium">Status</th>
                  <th className="text-left py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lojas.map((o) => (
                  <tr key={o.id} style={{ borderTop: "1px solid var(--border-ui)" }}>
                    <td className="py-2 pr-3">{o.nome}</td>
                    <td className="py-2 pr-3">{SEGMENTO_LABEL[o.segmento] ?? o.segmento}</td>
                    <td className="py-2 pr-3">{o.totalClientes}</td>
                    <td className="py-2 pr-3">{o.totalAgendamentos}</td>
                    <td className="py-2 pr-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={
                          o.ativo
                            ? { background: "rgba(34,197,94,0.15)", color: "var(--success)" }
                            : { background: "rgba(239,68,68,0.15)", color: "var(--danger)" }
                        }
                      >
                        {o.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-3 text-xs">
                        <Link href={`/super-admin/${o.id}`} style={{ color: "var(--text-muted)" }}>
                          Editar
                        </Link>
                        <button onClick={() => toggleAtivo(o.id)} style={{ color: o.ativo ? "var(--danger)" : "var(--success)" }}>
                          {o.ativo ? "Desativar" : "Reativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Link
        href="/super-admin/nova"
        className="inline-block px-4 py-2.5 rounded-xl font-semibold text-sm"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        + Nova loja
      </Link>
    </SuperAdminShell>
  );
}
