import { Router } from "express";
import type { Modulo } from "../../../core/module-registry";

const router = Router();

router.get("/health", (_req, res) => {
    res.json({ modulo: "integracoes/whatsapp-ia", status: "ok" });
});

const modulo: Modulo = { prefixo: "/integracoes/whatsapp-ia", router };
export default modulo;
