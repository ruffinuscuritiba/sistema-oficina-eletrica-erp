import { db } from "./db";

/**
 * Notificacoes que aparecem no "sininho" do painel admin (PDV).
 * Criadas por eventos operacionais: novo agendamento, urgencia, etc.
 */

export async function criarNotificacao(n: {
    tipo: string;
    titulo: string;
    descricao?: string | null;
    referenciaId?: string | null;
    link?: string | null;
}): Promise<void> {
    await db.query(
        `INSERT INTO notificacoes_painel (tipo, titulo, descricao, referencia_id, link)
         VALUES ($1, $2, $3, $4, $5)`,
        [n.tipo, n.titulo, n.descricao ?? null, n.referenciaId ?? null, n.link ?? null]
    );
}

export async function contarNaoLidas(): Promise<number> {
    const { rows } = await db.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM notificacoes_painel WHERE lida = false"
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

export async function listar(limite = 50): Promise<NotificacaoPainel[]> {
    const { rows } = await db.query<NotificacaoPainel>(
        `SELECT id, tipo, titulo, descricao, link, lida, created_at
         FROM notificacoes_painel
         ORDER BY created_at DESC
         LIMIT $1`,
        [limite]
    );
    return rows;
}

export async function marcarTodasLidas(): Promise<void> {
    await db.query("UPDATE notificacoes_painel SET lida = true WHERE lida = false");
}
