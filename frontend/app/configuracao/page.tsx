"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import api from "@/lib/api";

type Segmento = "auto_eletrica" | "mecanica" | "integrado";

const SEGMENTOS: { valor: Segmento; label: string; descricao: string }[] = [
  { valor: "auto_eletrica", label: "Auto-Elétrica", descricao: "Diagnóstico elétrico, bateria, chicote, módulos." },
  { valor: "mecanica", label: "Oficina Mecânica", descricao: "Revisão, freios, suspensão, motor, câmbio." },
  { valor: "integrado", label: "Integrado", descricao: "Atende os dois — elétrica e mecânica no mesmo lugar." },
];

function ConfiguracaoContent() {
  const searchParams = useSearchParams();
  const onboarding = searchParams.get("onboarding") === "1";

  const [segmento, setSegmento] = useState<Segmento>("integrado");
  const [nomeOficina, setNomeOficina] = useState("");
  const [whatsappNumero, setWhatsappNumero] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.get("/admin/configuracao").then(({ data }) => {
      setSegmento(data.segmento);
      setNomeOficina(data.nomeOficina ?? "");
      setWhatsappNumero(data.whatsappNumero ?? "");
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setSalvo(false);
    try {
      await api.put("/admin/configuracao", { segmento, nomeOficina, whatsappNumero });
      setSalvo(true);
    } catch (err: any) {
      setErro(err.response?.data?.erro || "Erro ao salvar configuração.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AdminShell>
      {onboarding && (
        <div
          className="p-3 rounded-xl text-sm mb-4"
          style={{ background: "rgba(59,130,246,0.1)", border: "1px solid var(--accent)", color: "var(--accent)" }}
        >
          👋 Antes de começar, escolha qual sistema sua oficina contratou. Isso muda as perguntas da IA no WhatsApp e o painel.
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6">Configuração da oficina</h1>

      <form
        onSubmit={handleSubmit}
        className="p-5 space-y-4"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-ui)", borderRadius: "var(--radius-card)" }}
      >
        <div>
          <label className="block text-sm mb-2" style={{ color: "var(--text-muted)" }}>
            Qual sistema sua oficina contratou?
          </label>
          <div className="space-y-2">
            {SEGMENTOS.map((s) => (
              <label
                key={s.valor}
                className="block p-3 rounded-xl cursor-pointer"
                style={{
                  border: `1px solid ${segmento === s.valor ? "var(--accent)" : "var(--border-ui)"}`,
                  background: segmento === s.valor ? "var(--surface-3)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="segmento"
                  value={s.valor}
                  checked={segmento === s.valor}
                  onChange={() => setSegmento(s.valor)}
                  className="mr-2"
                />
                <b>{s.label}</b>
                <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {s.descricao}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: "var(--text-muted)" }}>
            Nome da oficina (aparece pro cliente no WhatsApp)
          </label>
          <input
            type="text"
            value={nomeOficina}
            onChange={(e) => setNomeOficina(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-ui)", color: "var(--text-main)" }}
          />
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: "var(--text-muted)" }}>
            WhatsApp para receber avisos (com DDI, ex: 5511999999999)
          </label>
          <input
            type="text"
            value={whatsappNumero}
            onChange={(e) => setWhatsappNumero(e.target.value)}
            placeholder="5511999999999"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-ui)", color: "var(--text-main)" }}
          />
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            É pra este número que a oficina recebe o aviso de cada novo agendamento e de urgências.
          </p>
        </div>

        {erro && <p className="text-sm" style={{ color: "var(--danger)" }}>{erro}</p>}
        {salvo && <p className="text-sm" style={{ color: "var(--success)" }}>Configuração salva com sucesso.</p>}

        <button
          type="submit"
          disabled={salvando}
          className="px-4 py-2.5 rounded-xl font-semibold disabled:opacity-60"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </AdminShell>
  );
}

export default function ConfiguracaoPage() {
  return (
    <Suspense fallback={null}>
      <ConfiguracaoContent />
    </Suspense>
  );
}
