import { db } from "./db";

export type Segmento = "auto_eletrica" | "mecanica" | "integrado";

export interface ConfiguracaoOficina {
    id: string;
    segmento: Segmento;
    nomeOficina: string;
    whatsappNumero: string | null;
    ativo: boolean;
    configuradoEm: Date | null;
}

/**
 * Le os dados de UMA oficina (linha da tabela "oficinas"). Antes da migration
 * multi-tenant isto lia um singleton (id=1 fixo); agora "oficinas" tem 1 linha
 * por loja e o chamador sempre informa qual (vem do JWT pos-login).
 */
export async function obterConfiguracao(oficinaId: string): Promise<ConfiguracaoOficina> {
    const { rows } = await db.query(
        "SELECT id, segmento, nome AS nome_oficina, whatsapp_numero, ativo, configurado_em FROM oficinas WHERE id = $1",
        [oficinaId]
    );
    const row = rows[0];
    return {
        id: row.id,
        segmento: row.segmento,
        nomeOficina: row.nome_oficina,
        whatsappNumero: row.whatsapp_numero,
        ativo: row.ativo,
        configuradoEm: row.configurado_em,
    };
}

export async function salvarConfiguracao(
    oficinaId: string,
    dados: { segmento: Segmento; nomeOficina: string; whatsappNumero?: string }
): Promise<void> {
    await db.query(
        `UPDATE oficinas
         SET segmento = $2, nome = $3, whatsapp_numero = $4, configurado_em = now()
         WHERE id = $1`,
        [oficinaId, dados.segmento, dados.nomeOficina, dados.whatsappNumero ?? null]
    );
}
