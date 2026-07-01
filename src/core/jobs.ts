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

/**
 * Manutencao preventiva -- o coracao da estrategia "a IA traz o cliente de volta".
 * Quando um servico recorrente (troca de oleo, freio, correia, bateria...) esta
 * chegando na hora (por tempo), dispara uma mensagem consultiva convidando pra
 * revisao. Se o cliente responder, cai no fluxo normal de triagem/agendamento.
 *
 * Gatilho: proxima_data <= hoje + 10 dias. Idempotente por dois caminhos --
 * status vira 'lembrete_enviado' e ha registro em notificacoes_enviadas.
 */
async function enviarLembretesPreventivos(): Promise<void> {
    const { rows } = await db.query(
        `SELECT m.id, m.proximo_km, c.telefone, c.nome,
                p.nome AS servico, p.mensagem_template,
                v.marca, v.modelo, v.ano
         FROM manutencoes_realizadas m
         JOIN planos_manutencao p ON p.id = m.plano_id
         JOIN clientes c ON c.id = m.cliente_id
         JOIN veiculos v ON v.id = m.veiculo_id
         WHERE m.status = 'pendente_lembrete'
           AND m.proxima_data IS NOT NULL
           AND m.proxima_data <= (CURRENT_DATE + interval '10 days')
           AND NOT EXISTS (
               SELECT 1 FROM notificacoes_enviadas
               WHERE tipo = 'lembrete_preventivo' AND referencia_id = m.id
           )`
    );

    for (const m of rows as any[]) {
        const veiculo = [m.marca, m.modelo, m.ano].filter(Boolean).join(" ") || "veículo";
        const mensagem = (m.mensagem_template as string)
            .replace(/\{nome\}/g, m.nome)
            .replace(/\{veiculo\}/g, veiculo)
            .replace(/\{servico\}/g, m.servico);
        try {
            await enviarMensagem(m.telefone, mensagem);
            await db.query(
                "INSERT INTO notificacoes_enviadas (tipo, referencia_id) VALUES ('lembrete_preventivo', $1) ON CONFLICT DO NOTHING",
                [m.id]
            );
            await db.query("UPDATE manutencoes_realizadas SET status = 'lembrete_enviado' WHERE id = $1", [m.id]);
        } catch (erro) {
            console.error(`[jobs] falha ao enviar lembrete preventivo ${m.id}:`, erro);
        }
    }
}

function rodarUmaVez(): void {
    enviarLembretes().catch((erro) => console.error("[jobs] enviarLembretes falhou:", erro));
    enviarAvaliacoesPosServico().catch((erro) => console.error("[jobs] enviarAvaliacoesPosServico falhou:", erro));
    enviarLembretesPreventivos().catch((erro) => console.error("[jobs] enviarLembretesPreventivos falhou:", erro));
}

export function iniciarJobsAutomaticos(): void {
    rodarUmaVez(); // nao espera o primeiro intervalo -- roda logo que o servidor sobe
    setInterval(rodarUmaVez, INTERVALO_MS);
    console.log(`[jobs] lembretes, avaliacoes e manutencao preventiva ativos (a cada ${INTERVALO_MS / 60000} min)`);
}
