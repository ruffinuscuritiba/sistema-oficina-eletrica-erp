import { db } from "./db";
import { enviarMensagem } from "../modules/integracoes/whatsapp-ia/evolution-client";
import { obterConfiguracao } from "./config-oficina";

const INTERVALO_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Reduz no-show de verdade: manda lembrete ~1h antes do horario confirmado
 * (nao e so a promessa no texto de boas-vindas -- e um job que roda mesmo).
 */
async function enviarLembretes(): Promise<void> {
    const { rows } = await db.query(
        `SELECT a.id, a.data_hora, c.telefone, c.nome
         FROM agendamentos a
         JOIN clientes c ON c.id = a.cliente_id
         WHERE a.status = 'confirmado'
           AND a.data_hora > now()
           AND a.data_hora <= now() + interval '65 minutes'`
    );

    for (const ag of rows as any[]) {
        const horario = new Date(ag.data_hora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        try {
            await enviarMensagem(
                ag.telefone,
                `⏰ Olá, ${ag.nome}! Só passando pra lembrar que seu horário na oficina é hoje às ${horario}h. Te esperamos!`
            );
            await db.query("UPDATE agendamentos SET status = 'lembrete_enviado' WHERE id = $1", [ag.id]);
        } catch (erro) {
            console.error(`[jobs] falha ao enviar lembrete do agendamento ${ag.id}:`, erro);
        }
    }
}

/**
 * Quando uma OS e marcada como entregue (feito pelo modulo os-estoque),
 * manda uma mensagem de agradecimento/avaliacao. Idempotente via
 * notificacoes_enviadas -- roda a cada 5min e nunca manda duas vezes pra
 * mesma OS.
 */
async function enviarAvaliacoesPosServico(): Promise<void> {
    const config = await obterConfiguracao();

    const { rows } = await db.query(
        `SELECT os.id, c.telefone, c.nome
         FROM ordens_servico os
         JOIN clientes c ON c.id = os.cliente_id
         WHERE os.status = 'entregue'
           AND NOT EXISTS (
               SELECT 1 FROM notificacoes_enviadas
               WHERE tipo = 'avaliacao_pos_servico' AND referencia_id = os.id
           )`
    );

    for (const os of rows as any[]) {
        try {
            await enviarMensagem(
                os.telefone,
                `Olá, ${os.nome}! Seu veículo foi entregue pela ${config.nomeOficina}. ` +
                    `Se puder, conta pra gente como foi o atendimento -- isso nos ajuda muito. Obrigado pela confiança! 🔧🙏`
            );
            await db.query(
                "INSERT INTO notificacoes_enviadas (tipo, referencia_id) VALUES ('avaliacao_pos_servico', $1) ON CONFLICT DO NOTHING",
                [os.id]
            );
        } catch (erro) {
            console.error(`[jobs] falha ao enviar avaliacao da OS ${os.id}:`, erro);
        }
    }
}

function rodarUmaVez(): void {
    enviarLembretes().catch((erro) => console.error("[jobs] enviarLembretes falhou:", erro));
    enviarAvaliacoesPosServico().catch((erro) => console.error("[jobs] enviarAvaliacoesPosServico falhou:", erro));
}

export function iniciarJobsAutomaticos(): void {
    rodarUmaVez(); // nao espera o primeiro intervalo -- roda logo que o servidor sobe
    setInterval(rodarUmaVez, INTERVALO_MS);
    console.log(`[jobs] lembretes e avaliacoes automaticas ativos (a cada ${INTERVALO_MS / 60000} min)`);
}
