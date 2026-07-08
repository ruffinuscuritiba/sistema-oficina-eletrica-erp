import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "https://oficina-api.srv1747711.hstgr.cloud/api",
});

api.interceptors.request.use((config) => {
  const isAuthRoute = config.url?.includes("/auth/login") || config.url?.includes("/auth/super-admin-login");
  if (!isAuthRoute && typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthRoute = err.config?.url?.includes("/auth/login") || err.config?.url?.includes("/auth/super-admin-login");
    if (err.response?.status === 401 && !isAuthRoute && typeof window !== "undefined") {
      const isSuperAdmin = localStorage.getItem("papel") === "super_admin";
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("papel");
      window.location.href = isSuperAdmin ? "/super-admin/login" : "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
