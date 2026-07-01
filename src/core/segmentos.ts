import type { Segmento } from "./config-oficina";

/**
 * Diferencas reais entre os 3 sistemas contratos (nao e so rotulo):
 * cada segmento oferece um subconjunto diferente de categorias de servico,
 * uma pergunta extra de triagem adequada ao tipo de problema, e um conjunto
 * de palavras de urgencia calibrado pro que de fato e emergencia naquele ramo.
 */

export const SEGMENTO_LABEL: Record<Segmento, string> = {
    auto_eletrica: "Auto-Elétrica",
    mecanica: "Oficina Mecânica",
    integrado: "Oficina Mecânica + Auto-Elétrica",
};

export const SEGMENTO_DESCRICAO: Record<Segmento, string> = {
    auto_eletrica:
        "Diagnóstico elétrico: bateria, alternador, motor de partida, chicote, módulos, ar-condicionado, som/alarme, painel.",
    mecanica:
        "Revisão, óleo/filtros, freios, suspensão, embreagem, câmbio, correia dentada, motor, escapamento, pneus/alinhamento.",
    integrado:
        "Atende os dois: um problema que pode ser elétrico OU mecânico é resolvido no mesmo lugar, sem precisar visitar duas oficinas.",
};

export const CATEGORIAS_POR_SEGMENTO: Record<Segmento, string[]> = {
    auto_eletrica: ["eletrica", "outro"],
    mecanica: ["revisao", "mecanica", "outro"],
    integrado: ["revisao", "eletrica", "mecanica", "outro"],
};

export const PERGUNTA_EXTRA_TRIAGEM: Record<Segmento, string> = {
    auto_eletrica:
        "Alguma luz acende no painel (bateria, óleo, injeção, freio)? E se já rodou um diagnóstico/scanner em outro lugar, me passa o código de erro.",
    mecanica:
        "Qual a quilometragem atual do carro? E o problema acontece ao frear, ao acelerar, ao virar o volante, ou o tempo todo?",
    integrado:
        "Me conta também: alguma luz acende no painel? E qual a quilometragem atual? Assim eu já sei se chamo o time de elétrica, mecânica, ou os dois.",
};

// Palavras-base (qualquer segmento) + extras calibrados por especialidade.
const URGENCIA_BASE = ["acidente", "colisao", "colisão", "capotou", "batida"];

const URGENCIA_ELETRICA = [
    "nao liga", "não liga", "nao pega", "não pega", "nao da partida", "não dá partida",
    "fumaca", "fumaça", "cheiro de queimado", "cheirando queimado", "curto", "curto-circuito",
    "todas as luzes piscando", "painel todo aceso",
];

const URGENCIA_MECANICA = [
    "sem freio", "freio nao", "freio não", "perdeu o freio", "fervendo", "superaquecendo",
    "fumaca no motor", "fumaça no motor", "travou o volante", "travou a direcao", "travou a direção",
    "parou na pista", "parou no meio da rua", "quebrou na estrada",
];

export const URGENCIA_POR_SEGMENTO: Record<Segmento, string[]> = {
    auto_eletrica: [...URGENCIA_BASE, ...URGENCIA_ELETRICA],
    mecanica: [...URGENCIA_BASE, ...URGENCIA_MECANICA],
    integrado: [...URGENCIA_BASE, ...URGENCIA_ELETRICA, ...URGENCIA_MECANICA],
};

/** Duracao padrao de slot (minutos) por segmento -- diagnostico eletrico e mais rapido que desmontagem mecanica. */
export function duracaoBaseMinutos(segmento: Segmento): number {
    return segmento === "mecanica" ? 90 : segmento === "auto_eletrica" ? 60 : 75;
}
