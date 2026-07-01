import { Router } from "express";
import type { Modulo } from "../../core/module-registry";

const router = Router();

router.get("/health", (_req, res) => {
    res.json({ modulo: "localizacao", status: "ok" });
});

const modulo: Modulo = { prefixo: "/localizacao", router };
export default modulo;
