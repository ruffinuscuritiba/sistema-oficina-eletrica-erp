"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SuperAdminShell from "@/components/SuperAdminShell";
import api from "@/lib/api";

type Segmento = "auto_eletrica" | "mecanica" | "integrado";

const SEGMENTOS: { valor: Segmento; label: string }[] = [
  { valor: "auto_eletrica", label: "Auto-Elétrica" },
  { valor: "mecanica", label: "Oficina Mecânica" },
  { valor: "integrado", label: "Integrado" },
];

const inputStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-ui)",
  color: "var(--text-main)",
};

export default function EditarLojaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [segmento, setSegmento] = useState<Segmento>("integrado");
  const [whatsappNumero, setWhatsappNumero] = useState("");
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.get(`/super-admin/lojas/${params.id}`).then(({ data }) => {
      setNome(data.nome);
      setSegmento(data.segmento);
      setWhatsappNumero(data.whatsappNumero ?? "");
      setCarregado(true);
    });
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    try {
      await api.put(`/super-admin/lojas/${params.id}`, { nome, segmento, whatsappNumero });
      router.push("/super-admin");
    } catch (err: any) {
      setErro(err.response?.data?.erro || "Erro ao salvar loja.");
    } finally {
      setSalvando(false);
    }
  }

  if (!carregado) return null;

  return (
    <SuperAdminShell>
      <h1 className="text-2xl font-bold mb-6">{nome}</h1>

      <form
        onSubmit={handleSubmit}
        className="p-5 space-y-4"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-ui)", borderRadius: "var(--radius-card)" }}
      >
        <div>
          <label className="block text-sm mb-1.5" style={{ color: "var(--text-muted)" }}>
            Nome da oficina
          </label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
            style={inputStyle}
          />
        </div>

        <div>
          <label className="block text-sm mb-2" style={{ color: "var(--text-muted)" }}>
            Qual sistema essa loja contratou?
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
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: "var(--text-muted)" }}>
            WhatsApp para receber avisos
          </label>
          <input
            type="text"
            value={whatsappNumero}
            onChange={(e) => setWhatsappNumero(e.target.value)}
            placeholder="5511999999999"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
            style={inputStyle}
          />
        </div>

        {erro && <p className="text-sm" style={{ color: "var(--danger)" }}>{erro}</p>}

        <button
          type="submit"
          disabled={salvando}
          className="px-4 py-2.5 rounded-xl font-semibold disabled:opacity-60"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </form>

      <Link href="/super-admin" className="inline-block mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
        ← Voltar
      </Link>
    </SuperAdminShell>
  );
}
