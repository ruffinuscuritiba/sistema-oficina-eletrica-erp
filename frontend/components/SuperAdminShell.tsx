"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";

export default function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, logout, isSuperAdmin } = useAuthStore();

  useEffect(() => {
    if (!token || !isSuperAdmin()) {
      router.replace("/super-admin/login");
    }
  }, [token, isSuperAdmin, router]);

  if (!token || !isSuperAdmin()) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--surface-0)" }}>
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--border-ui)", background: "var(--surface-1)" }}
      >
        <b>🏢 Super Admin</b>
        <button
          onClick={() => {
            logout();
            router.push("/super-admin/login");
          }}
          className="flex items-center gap-1.5 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          <LogOut size={15} />
          Sair
        </button>
      </div>
      <div className="max-w-4xl mx-auto p-4 md:p-8">{children}</div>
    </div>
  );
}
