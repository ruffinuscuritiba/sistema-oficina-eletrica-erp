import { db } from "./db";

/**
 * Notificacoes que aparecem no "sininho" do painel admin (PDV).
 * Criadas por eventos operacionais: novo agendamento, urgencia, etc.
 * Sempre escopadas por oficina -- o sino de uma loja nao pode mostrar
 * eventos de outra.
 */

export async function criarNotificacao(
    oficinaId: string,
    n: {
        tipo: string;
        titulo: string;
        descricao?: string | null;
        referenciaId?: string | null;
        link?: string | null;
    }
): Promise<void> {
    await db.query(
        `INSERT INTO notificacoes_painel (oficina_id, tipo, titulo, descricao, referencia_id, link)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [oficinaId, n.tipo, n.titulo, n.descricao ?? null, n.referenciaId ?? null, n.link ?? null]
    );
}

export async function contarNaoLidas(oficinaId: string): Promise<number> {
    const { rows } = await db.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM notificacoes_painel WHERE oficina_id = $1 AND lida = false",
        [oficinaId]
    );
    return Number(rows[0]?.n ?? 0);
}

export interface NotificacaoPainel {
    id: string;
    tipo: string;
    titulo: string;
    descricao: string | null;
    link: string | null;
    lida: boolean;
    created_at: Date;
}

export async function listar(oficinaId: string, limite = 50): Promise<NotificacaoPainel[]> {
    const { rows } = await db.query<NotificacaoPainel>(
        `SELECT id, tipo, titulo, descricao, link, lida, created_at
         FROM notificacoes_painel
         WHERE oficina_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [oficinaId, limite]
    );
    return rows;
}

export async function marcarTodasLidas(oficinaId: string): Promise<void> {
    await db.query("UPDATE notificacoes_painel SET lida = true WHERE oficina_id = $1 AND lida = false", [oficinaId]);
}
