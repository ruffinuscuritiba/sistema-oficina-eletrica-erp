"use client";
import { create } from "zustand";

export interface AuthUser {
  id: string;
  nome: string;
  email: string;
  papel: string;
  oficinaId: string | null;
  oficinaNome?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  isSuperAdmin: () => boolean;
}

function readUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: readUser(),
  token: typeof window !== "undefined" ? localStorage.getItem("token") : null,

  setAuth: (token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("papel", user.papel);
    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("papel");
    set({ token: null, user: null });
  },

  isSuperAdmin: () => get().user?.papel === "super_admin",
}));
