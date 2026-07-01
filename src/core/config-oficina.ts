import { db } from "./db";

export type Segmento = "auto_eletrica" | "mecanica" | "integrado";

export interface ConfiguracaoOficina {
    segmento: Segmento;
    nomeOficina: string;
    whatsappNumero: string | null;
    configuradoEm: Date | null;
}

/** Le a configuracao singleton. Sempre existe (a migration ja insere a linha default). */
export async function obterConfiguracao(): Promise<ConfiguracaoOficina> {
    const { rows } = await db.query(
        "SELECT segmento, nome_oficina, whatsapp_numero, configurado_em FROM configuracao_oficina WHERE id = 1"
    );
    const row = rows[0];
    return {
        segmento: row.segmento,
        nomeOficina: row.nome_oficina,
        whatsappNumero: row.whatsapp_numero,
        configuradoEm: row.configurado_em,
    };
}

export async function salvarConfiguracao(dados: { segmento: Segmento; nomeOficina: string; whatsappNumero?: string }): Promise<void> {
    await db.query(
        `UPDATE configuracao_oficina
         SET segmento = $1, nome_oficina = $2, whatsapp_numero = $3, configurado_em = now()
         WHERE id = 1`,
        [dados.segmento, dados.nomeOficina, dados.whatsappNumero ?? null]
    );
}
