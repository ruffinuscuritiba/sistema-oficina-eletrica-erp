import type { Segmento } from "../../../core/config-oficina";
import { CATEGORIAS_POR_SEGMENTO, URGENCIA_POR_SEGMENTO } from "../../../core/segmentos";

/**
 * Classificacao do sintoma relatado pelo cliente: categoria + nivel de urgencia.
 *
 * Depende do SEGMENTO contratado (auto_eletrica | mecanica | integrado):
 * palavras de urgencia e categorias possiveis mudam de verdade, nao e so texto.
 *
 * Se ANTHROPIC_API_KEY estiver configurada, usa IA para interpretar texto livre
 * com mais nuance. Sem a chave (ou se a chamada falhar), cai automaticamente
 * para o classificador por palavra-chave -- o fluxo nunca trava esperando IA.
 */

export type Categoria = "revisao" | "eletrica" | "mecanica" | "outro";

export interface Classificacao {
    categoria: Categoria;
    urgente: boolean;
    resumo: string;
}

const PALAVRAS_ELETRICA = [
    "bateria", "nao liga", "não liga", "luz do painel", "luz acesa", "painel",
    "farol", "lanterna", "pisca", "alternador", "motor de partida", "fusivel", "fusível",
    "trava eletrica", "trava elétrica", "vidro eletrico", "vidro elétrico", "ar condicionado",
];

const PALAVRAS_REVISAO = [
    "revisao", "revisão", "troca de oleo", "troca de óleo", "oleo", "óleo",
    "filtro", "manutencao", "manutenção", "km", "quilometragem",
];

function normalizar(texto: string): string {
    return texto.toLowerCase();
}

function contemAlguma(texto: string, lista: string[]): boolean {
    return lista.some((p) => texto.includes(p));
}

/** Garante que a categoria devolvida faz sentido pro segmento contratado (senao vira "outro"). */
function restringirAoSegmento(categoria: Categoria, segmento: Segmento): Categoria {
    const permitidas = CATEGORIAS_POR_SEGMENTO[segmento];
    return (permitidas as string[]).includes(categoria) ? categoria : "outro";
}

function classificarPorPalavraChave(sintomaOriginal: string, segmento: Segmento): Classificacao {
    const texto = normalizar(sintomaOriginal);
    const urgente = contemAlguma(texto, URGENCIA_POR_SEGMENTO[segmento]);

    let categoria: Categoria = "outro";
    if (contemAlguma(texto, PALAVRAS_ELETRICA)) categoria = "eletrica";
    else if (contemAlguma(texto, PALAVRAS_REVISAO)) categoria = "revisao";
    else if (texto.includes("barulho") || texto.includes("ruido") || texto.includes("ruído")) categoria = "mecanica";

    return { categoria: restringirAoSegmento(categoria, segmento), urgente, resumo: sintomaOriginal.slice(0, 200) };
}

export async function classificarSintoma(sintomaOriginal: string, segmento: Segmento): Promise<Classificacao> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return classificarPorPalavraChave(sintomaOriginal, segmento);

    const categoriasPermitidas = CATEGORIAS_POR_SEGMENTO[segmento].join("|");

    try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 200,
                system:
                    `Voce classifica sintomas de carro relatados por clientes de uma oficina do segmento "${segmento}". ` +
                    `Responda APENAS um JSON: {"categoria":"${categoriasPermitidas}","urgente":true|false,"resumo":"..."}. ` +
                    'urgente=true SOMENTE se houver risco de seguranca (sem freio, nao liga no meio da rua, fumaca/cheiro de queimado, acidente, direcao travada, superaquecimento). ' +
                    'Duvida rotineira (barulho leve, revisao agendada) = urgente false. ' +
                    `Use APENAS uma das categorias permitidas: ${categoriasPermitidas}.`,
                messages: [{ role: "user", content: sintomaOriginal }],
            }),
            signal: AbortSignal.timeout(8_000),
        });

        if (!res.ok) throw new Error(`Anthropic respondeu ${res.status}`);
        const data: any = await res.json();
        const textoResposta: string = data?.content?.[0]?.text ?? "";
        const match = textoResposta.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("Resposta sem JSON");

        const parsed = JSON.parse(match[0]);
        const categoria = restringirAoSegmento(
            (["revisao", "eletrica", "mecanica", "outro"] as Categoria[]).includes(parsed.categoria) ? parsed.categoria : "outro",
            segmento
        );
        return {
            categoria,
            urgente: Boolean(parsed.urgente),
            resumo: String(parsed.resumo ?? sintomaOriginal).slice(0, 200),
        };
    } catch (erro) {
        console.warn("[whatsapp-ia] classificacao via IA falhou, usando fallback por palavra-chave:", erro);
        return classificarPorPalavraChave(sintomaOriginal, segmento);
    }
}
