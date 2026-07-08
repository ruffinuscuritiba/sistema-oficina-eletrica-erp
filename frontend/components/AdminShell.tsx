"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Gauge, Wrench, Settings } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

const NAV = [
  { href: "/dashboard", label: "Painel", icon: Gauge },
  { href: "/manutencao", label: "Manutenção preventiva", icon: Wrench },
  { href: "/configuracao", label: "Configuração", icon: Settings },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, logout } = useAuthStore();
  const [naoLidas, setNaoLidas] = useState(0);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [token, router]);

  useEffect(() => {
    if (!token) return;
    let ativo = true;
    async function tick() {
      try {
        const { data } = await api.get("/admin/notificacoes/count");
        if (ativo) setNaoLidas(data.total ?? 0);
      } catch {
        // silencioso -- o sino so mostra contagem, nao e critico
      }
    }
    tick();
    const id = setInterval(tick, 20000);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [token]);

  if (!token) return null;

  return (
    <div className="min-h-screen flex" style={{ background: "var(--surface-0)" }}>
      <aside
        className="hidden md:flex flex-col w-60 shrink-0 p-4"
        style={{ background: "var(--surface-1)", borderRight: "1px solid var(--border-ui)" }}
      >
        <div className="mb-6 px-2">
          <div className="text-lg font-bold">🔧 Painel Admin</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {user?.oficinaNome}
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--text-main)",
                }}
              >
                <Icon size={17} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 pt-2" style={{ borderTop: "1px solid var(--border-ui)" }}>
          <Link
            href="/notificacoes"
            className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium"
            style={{ color: "var(--text-main)" }}
          >
            <span className="flex items-center gap-2.5">
              <Bell size={17} />
              Notificações
            </span>
            {naoLidas > 0 && (
              <span
                className="text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center"
                style={{ background: "var(--danger)", color: "#fff" }}
              >
                {naoLidas > 99 ? "99+" : naoLidas}
              </span>
            )}
          </Link>
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            <LogOut size={17} />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 max-w-4xl mx-auto w-full">{children}</main>
    </div>
  );
}
