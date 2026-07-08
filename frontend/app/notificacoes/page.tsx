"use client";
import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import api from "@/lib/api";

interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  link: string | null;
  lida: boolean;
  created_at: string;
}

const ICONE: Record<string, string> = { novo_agendamento: "🗓️", urgencia: "⚠️" };

export default function NotificacoesPage() {
  const [itens, setItens] = useState<Notificacao[] | null>(null);

  useEffect(() => {
    api.get("/admin/notificacoes").then(({ data }) => setItens(data.itens));
  }, []);

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold">🔔 Notificações</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Novos agendamentos e urgências que chegam pelo WhatsApp aparecem aqui.
      </p>

      <div
        className="p-5"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-ui)", borderRadius: "var(--radius-card)" }}
      >
        {!itens || itens.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nenhuma notificação ainda.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border-ui)" }}>
            {itens.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-4 py-3" style={{ borderColor: "var(--border-ui)" }}>
                <div>
                  <div className="font-semibold text-sm">
                    {ICONE[n.tipo] ?? "🔔"}{" "}
                    {n.link ? (
                      <a href={n.link} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>
                        {n.titulo}
                      </a>
                    ) : (
                      n.titulo
                    )}
                  </div>
                  {n.descricao && (
                    <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      {n.descricao}
                    </div>
                  )}
                </div>
                <div className="text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  {new Date(n.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
