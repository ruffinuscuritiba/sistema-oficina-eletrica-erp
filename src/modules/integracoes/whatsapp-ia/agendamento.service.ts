import { db } from "../../../core/db";
import type { Segmento } from "../../../core/config-oficina";
import { duracaoBaseMinutos } from "../../../core/segmentos";
import type { Categoria } from "./triagem";

export interface SlotDisponivel {
    dataHora: Date;
}

const JANELAS: Record<"manha" | "tarde", { inicioHora: number; fimHora: number }> = {
    manha: { inicioHora: 8, fimHora: 12 },
    tarde: { inicioHora: 13, fimHora: 18 },
};

// Duracao do slot depende do segmento contratado (eletrica e mais rapido que
// mecanica pesada). No integrado, a categoria do sintoma desempata.
function duracaoMinutos(categoria: Categoria, segmento: Segmento): number {
    if (segmento !== "integrado") return duracaoBaseMinutos(segmento);
    return categoria === "revisao" ? 60 : 90;
}

async function capacidadeSimultanea(oficinaId: string): Promise<number> {
    const { rows } = await db.query<{ total: string }>(
        "SELECT COUNT(*)::text AS total FROM postos_trabalho WHERE oficina_id = $1 AND ativo = true",
        [oficinaId]
    );
    const total = Number(rows[0]?.total ?? 0);
    return total > 0 ? total : 1; // nunca trava em 0 vagas por falta de cadastro
}

function gerarSlotsDoDia(dia: Date, periodo: "manha" | "tarde", duracao: number): Date[] {
    const janela = JANELAS[periodo];
    const slots: Date[] = [];
    const cursor = new Date(dia);
    cursor.setHours(janela.inicioHora, 0, 0, 0);
    const fim = new Date(dia);
    fim.setHours(janela.fimHora, 0, 0, 0);

    const agora = new Date();
    while (cursor.getTime() + duracao * 60_000 <= fim.getTime()) {
        if (cursor.getTime() > agora.getTime() + 30 * 60_000) {
            // so oferece horario com pelo menos 30min de antecedencia
            slots.push(new Date(cursor));
        }
        cursor.setMinutes(cursor.getMinutes() + duracao);
    }
    return slots;
}

/** Retorna ate 3 horarios livres, buscando a partir de hoje nos proximos dias uteis. */
export async function buscarProximosHorarios(
    oficinaId: string,
    periodo: "manha" | "tarde",
    categoria: Categoria,
    segmento: Segmento,
    maxResultados = 3
): Promise<SlotDisponivel[]> {
    const capacidade = await capacidadeSimultanea(oficinaId);
    const duracao = duracaoMinutos(categoria, segmento);
    const disponiveis: SlotDisponivel[] = [];

    for (let diasAFrente = 0; diasAFrente < 7 && disponiveis.length < maxResultados; diasAFrente++) {
        const dia = new Date();
        dia.setDate(dia.getDate() + diasAFrente);
        if (dia.getDay() === 0) continue; // pula domingo

        const candidatos = gerarSlotsDoDia(dia, periodo, duracao);
        if (candidatos.length === 0) continue;

        const { rows: ocupacao } = await db.query<{ data_hora: Date; total: string }>(
            `SELECT data_hora, COUNT(*)::text AS total
             FROM agendamentos
             WHERE oficina_id = $1
               AND status IN ('confirmado', 'lembrete_enviado')
               AND data_hora >= $2 AND data_hora <= $3
             GROUP BY data_hora`,
            [oficinaId, candidatos[0], candidatos[candidatos.length - 1]]
        );
        const ocupacaoPorHorario = new Map(ocupacao.map((r) => [new Date(r.data_hora).getTime(), Number(r.total)]));

        for (const slot of candidatos) {
            if (disponiveis.length >= maxResultados) break;
            const ocupados = ocupacaoPorHorario.get(slot.getTime()) ?? 0;
            if (ocupados < capacidade) disponiveis.push({ dataHora: slot });
        }
    }

    return disponiveis;
}

/** Confere de novo (evita corrida entre dois clientes escolhendo o mesmo horario) e cria o agendamento. */
export async function confirmarAgendamento(
    oficinaId: string,
    params: {
        clienteId: string;
        veiculoId: string | null;
        dataHora: Date;
        periodo: "manha" | "tarde";
        categoria: Categoria;
        sintoma: string;
        urgente: boolean;
        midiaRecebida: boolean;
    }
): Promise<{ id: string } | { conflito: true }> {
    const capacidade = await capacidadeSimultanea(oficinaId);

    const { rows } = await db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM agendamentos
         WHERE oficina_id = $1 AND data_hora = $2 AND status IN ('confirmado', 'lembrete_enviado')`,
        [oficinaId, params.dataHora]
    );
    if (Number(rows[0]?.total ?? 0) >= capacidade) {
        return { conflito: true };
    }

    const { rows: inseridos } = await db.query<{ id: string }>(
        `INSERT INTO agendamentos
            (oficina_id, cliente_id, veiculo_id, data_hora, periodo, categoria, sintoma, urgente, midia_url, origem)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'whatsapp_ia')
         RETURNING id`,
        [
            oficinaId,
            params.clienteId,
            params.veiculoId,
            params.dataHora,
            params.periodo,
            params.categoria,
            params.sintoma,
            params.urgente,
            params.midiaRecebida ? "recebida_via_whatsapp" : null,
        ]
    );

    return { id: inseridos[0].id };
}
