"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function NovaLojaPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [segmento, setSegmento] = useState<Segmento>("integrado");
  const [whatsappNumero, setWhatsappNumero] = useState("");
  const [adminNome, setAdminNome] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminSenha, setAdminSenha] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    try {
      await api.post("/super-admin/lojas", { nome, segmento, whatsappNumero, adminNome, adminEmail, adminSenha });
      router.push("/super-admin");
    } catch (err: any) {
      setErro(err.response?.data?.erro || "Erro ao criar loja.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SuperAdminShell>
      <h1 className="text-2xl font-bold mb-1">Nova loja</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Cria a oficina e o primeiro usuário admin dela.
      </p>

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
            WhatsApp para receber avisos (com DDI, opcional por enquanto)
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

        <div className="pt-2" style={{ borderTop: "1px solid var(--border-ui)" }}>
          <label className="block text-sm mb-1.5 mt-3" style={{ color: "var(--text-muted)" }}>
            Nome do responsável (primeiro admin)
          </label>
          <input
            type="text"
            value={adminNome}
            onChange={(e) => setAdminNome(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
            style={inputStyle}
          />
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: "var(--text-muted)" }}>
            E-mail do admin (login)
          </label>
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
            style={inputStyle}
          />
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: "var(--text-muted)" }}>
            Senha inicial
          </label>
          <input
            type="password"
            value={adminSenha}
            onChange={(e) => setAdminSenha(e.target.value)}
            required
            minLength={6}
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
          {salvando ? "Criando..." : "Criar loja"}
        </button>
      </form>

      <Link href="/super-admin" className="inline-block mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
        ← Voltar
      </Link>
    </SuperAdminShell>
  );
}
