import { Router } from "express";
import type { Modulo } from "../../core/module-registry";
import auth from "./auth";
import admin from "./admin";
import superAdmin from "./super-admin";

// API JSON aditiva para o frontend Next.js desacoplado. Nao substitui nem
// altera as rotas HTML server-rendered existentes (/admin, /super-admin) --
// convive lado a lado, mesmo banco, mesma logica de negocio (via helpers
// reaproveitados de src/core), autenticacao por Bearer token em vez de cookie.
const router = Router();
router.use("/auth", auth);
router.use("/admin", admin);
router.use("/super-admin", superAdmin);

const modulo: Modulo = { prefixo: "/api", router };
export default modulo;
