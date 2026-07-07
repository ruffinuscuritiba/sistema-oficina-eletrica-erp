import { db } from "./db";
import type { Segmento } from "./config-oficina";

export interface Plano {
    id: string;
    codigo: string;
    nome: string;
    intervalo_km: number | null;
    intervalo_meses: number | null;
}

/** Planos aplicaveis ao segmento contratado (o array segmentos contem o segmento). */
export async function listarPlanos(segmento: Segmento): Promise<Plano[]> {
    const { rows } = await db.query<Plano>(
        `SELECT id, codigo, nome, intervalo_km, intervalo_meses
         FROM planos_manutencao
         WHERE ativo = true AND $1 = ANY(segmentos)
         ORDER BY nome ASC`,
        [segmento]
    );
    return rows;
}

/**
 * Registra um servico recorrente feito num veiculo e ja agenda o proximo
 * lembrete (proxima_data = hoje + intervalo_meses; proximo_km = km + intervalo_km).
 *
 * Este e o PONTO DE ENTRADA UNICO da manutencao preventiva -- hoje e chamado
 * pela tela do admin; quando o modulo os-estoque marcar uma OS como entregue,
 * deve chamar esta mesma funcao para cada servico recorrente lancado.
 */
export async function registrarManutencao(
    oficinaId: string,
    params: {
        veiculoId: string;
        clienteId: string;
        planoId: string;
        kmAtual?: number | null;
        osId?: string | null;
    }
): Promise<{ id: string; proximaData: Date | null } | { erro: string }> {
    const { rows: planoRows } = await db.query<{ intervalo_km: number | null; intervalo_meses: number | null }>(
        "SELECT intervalo_km, intervalo_meses FROM planos_manutencao WHERE id = $1 AND ativo = true",
        [params.planoId]
    );
    const plano = planoRows[0];
    if (!plano) return { erro: "Plano de manutenção não encontrado." };

    const realizadaEm = new Date();
    let proximaData: Date | null = null;
    if (plano.intervalo_meses) {
        proximaData = new Date(realizadaEm);
        proximaData.setMonth(proximaData.getMonth() + plano.intervalo_meses);
    }

    let proximoKm: number | null = null;
    if (plano.intervalo_km && params.kmAtual) {
        proximoKm = params.kmAtual + plano.intervalo_km;
    }

    const { rows } = await db.query<{ id: string }>(
        `INSERT INTO manutencoes_realizadas
            (oficina_id, veiculo_id, cliente_id, plano_id, km_na_realizacao, proximo_km, proxima_data, os_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
            oficinaId,
            params.veiculoId,
            params.clienteId,
            params.planoId,
            params.kmAtual ?? null,
            proximoKm,
            proximaData ? proximaData.toISOString().slice(0, 10) : null,
            params.osId ?? null,
        ]
    );

    // Atualiza a km conhecida do veiculo (util pra estimativas futuras).
    if (params.kmAtual) {
        await db.query("UPDATE veiculos SET quilometragem_atual = $2 WHERE id = $1 AND oficina_id = $3", [
            params.veiculoId,
            params.kmAtual,
            oficinaId,
        ]);
    }

    return { id: rows[0].id, proximaData };
}

export interface ProximaManutencao {
    id: string;
    proxima_data: Date | null;
    proximo_km: number | null;
    status: string;
    servico: string;
    cliente_nome: string;
    veiculo_modelo: string | null;
}

/** Lista as manutencoes com lembrete pendente ou ja enviado, mais proximas primeiro. */
export async function listarProximas(oficinaId: string, limite = 30): Promise<ProximaManutencao[]> {
    const { rows } = await db.query<ProximaManutencao>(
        `SELECT m.id, m.proxima_data, m.proximo_km, m.status,
                p.nome AS servico, c.nome AS cliente_nome, v.modelo AS veiculo_modelo
         FROM manutencoes_realizadas m
         JOIN planos_manutencao p ON p.id = m.plano_id
         JOIN clientes c ON c.id = m.cliente_id
         JOIN veiculos v ON v.id = m.veiculo_id
         WHERE m.oficina_id = $1 AND m.status IN ('pendente_lembrete', 'lembrete_enviado')
         ORDER BY m.proxima_data ASC NULLS LAST
         LIMIT $2`,
        [oficinaId, limite]
    );
    return rows;
}
