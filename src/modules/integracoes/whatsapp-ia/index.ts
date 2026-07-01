import { Router } from "express";
import type { Modulo } from "../../../core/module-registry";
import { extrairMensagemRecebida } from "./evolution-client";
import { processarMensagem } from "./conversa.service";

const router = Router();

router.get("/health", (_req, res) => {
    res.json({ modulo: "integracoes/whatsapp-ia", status: "ok" });
});

// Compativel com Evolution API (v1 e v2). Configurar o webhook da instancia
// apontando para POST /integracoes/whatsapp-ia/webhook.
router.post("/webhook", async (req, res) => {
    // Responde 200 imediatamente -- processa em segundo plano (nao bloqueia o
    // ACK do provedor de WhatsApp).
    res.status(200).json({ recebido: true });

    try {
        const mensagem = extrairMensagemRecebida(req.body);
        if (!mensagem) return;
        await processarMensagem(mensagem.telefone, mensagem.texto, mensagem.temMidia);
    } catch (erro) {
        console.error("[whatsapp-ia] erro processando webhook:", erro);
    }
});

const modulo: Modulo = { prefixo: "/integracoes/whatsapp-ia", router };
export default modulo;
