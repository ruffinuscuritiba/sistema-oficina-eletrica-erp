/**
 * Cliente minimo para a Evolution API (envio de mensagens de texto via WhatsApp).
 * Sem API configurada (env vars vazias), enviarMensagem vira no-op com log --
 * o fluxo inteiro roda e grava tudo no banco mesmo sem WhatsApp conectado ainda,
 * o que permite testar a logica de triagem antes de plugar o numero real.
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "";
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || "";

export async function enviarMensagem(telefone: string, texto: string): Promise<void> {
    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
        console.log(`[whatsapp-ia] (Evolution API nao configurada) enviaria para ${telefone}:\n${texto}`);
        return;
    }

    const numero = telefone.replace(/\D/g, "");
    const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${EVOLUTION_INSTANCE_NAME}`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({ number: numero, text: texto }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            console.error(`[whatsapp-ia] Evolution API respondeu ${res.status} ao enviar para ${numero}`);
        }
    } catch (erro) {
        console.error(`[whatsapp-ia] Falha ao enviar mensagem via Evolution API:`, erro);
    }
}

/** Extrai telefone e texto de um payload de webhook, compativel com Evolution v1 e v2. */
export function extrairMensagemRecebida(body: any): { telefone: string; texto: string; temMidia: boolean } | null {
    const data = body?.data;
    if (!data) return null;

    // v2 agrupa em data.messages[0]; v1 usa data.key/data.message diretamente
    const msgData = Array.isArray(data?.messages) && data.messages.length > 0 ? data.messages[0] : data;

    if (msgData?.key?.fromMe) return null; // ignora mensagens enviadas pela propria oficina
    const remoteJid: string | undefined = msgData?.key?.remoteJid;
    if (!remoteJid || remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) return null; // ignora grupos

    const telefone = remoteJid.split("@")[0];
    const msg = msgData?.message;
    const texto: string =
        msg?.conversation ||
        msg?.extendedTextMessage?.text ||
        msg?.buttonsResponseMessage?.selectedButtonId ||
        msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        "";

    const temMidia = Boolean(msg?.imageMessage || msg?.audioMessage || msg?.videoMessage);

    if (!texto && !temMidia) return null;
    return { telefone, texto: texto.trim(), temMidia };
}
