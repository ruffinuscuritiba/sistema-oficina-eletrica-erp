import { Router } from "express";
import type { Modulo } from "../../../core/module-registry";

const router = Router();

router.get("/health", (_req, res) => {
    res.json({ modulo: "integracoes/pagamento", status: "ok" });
});

const modulo: Modulo = { prefixo: "/integracoes/pagamento", router };
export default modulo;
