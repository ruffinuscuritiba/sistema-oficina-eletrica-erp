import { Router } from "express";
import type { Modulo } from "../../core/module-registry";

const router = Router();

router.get("/health", (_req, res) => {
    res.json({ modulo: "pdv-financeiro", status: "ok" });
});

const modulo: Modulo = { prefixo: "/pdv-financeiro", router };
export default modulo;
