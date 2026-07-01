import { Router } from "express";
import type { Modulo } from "../../../core/module-registry";

const router = Router();

router.get("/health", (_req, res) => {
    res.json({ modulo: "integracoes/nfce", status: "ok" });
});

const modulo: Modulo = { prefixo: "/integracoes/nfce", router };
export default modulo;
