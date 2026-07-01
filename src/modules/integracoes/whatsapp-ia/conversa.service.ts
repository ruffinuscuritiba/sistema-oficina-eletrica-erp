import { db } from "../../../core/db";
import { obterConfiguracao, type Segmento } from "../../../core/config-oficina";
import { PERGUNTA_EXTRA_TRIAGEM } from "../../../core/segmentos";
import { criarNotificacao } from "../../../core/notificacoes-painel";
import { enviarMensagem } from "./evolution-client";
import { classificarSintoma, type Categoria } from "./triagem";
import { buscarProximosHorarios, confirmarAgendamento } from "./agendamento.service";

const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";

/**
 * Avisa a oficina de um evento (novo agendamento / urgencia): grava no sininho
 * do painel (PDV) E manda no WhatsApp da empresa, se o numero estiver configurado.
 * Best-effort -- nunca deixa uma falha de notificacao quebrar o atendimento.
 */
async function notificarEmpresa(params: {
    tipo: "novo_agendamento" | "urgencia";
    titulo: string;
    descricao: string;
    referenciaId?: string | null;
    link?: string | null;
    whatsappNumero: string | null;
    mensagemWhatsapp: string;
}): Promise<void> {
    try {
        await criarNotificacao({
            tipo: params.tipo,
            titulo: params.titulo,
            descricao: params.descricao,
            referenciaId: params.referenciaId ?? null,
            link: params.link ?? null,
        });
    } catch (erro) {
        console.error("[whatsapp-ia] falha ao gravar notificacao do painel:", erro);
    }
    if (params.whatsappNumero) {
        try {
            await enviarMensagem(params.whatsappNumero, params.mensagemWhatsapp);
        } catch (erro) {
            console.error("[whatsapp-ia] falha ao notificar empresa no WhatsApp:", erro);
        }
    }
}

type Estado =
    | "inicio"
    | "aguardando_dados"
    | "aguardando_confirmacao_veiculo"
    | "aguardando_sintoma"
    | "aguardando_midia_ou_pular"
    | "aguardando_periodo"
    | "aguardando_escolha_horario"
    | "urgente_transferido"
    | "concluido";

interface Contexto {
    clienteId?: string;
    veiculoId?: string | null;
    veiculoDescricao?: string;
    sintoma?: string;
    categoria?: Categoria;
    urgente?: boolean;
    midiaRecebida?: boolean;
    detalheExtra?: string;
    periodo?: "manha" | "tarde";
    slotsOferecidos?: string[]; // ISO strings, na ordem em que foram apresentados
}

interface ConversaRow {
    telefone: string;
    cliente_id: string | null;
    estado: Estado;
    contexto: Contexto;
}

function normalizarTelefone(telefone: string): string {
    return telefone.replace(/\D/g, "");
}

function apenasSim(texto: string): boolean {
    const t = texto.trim().toLowerCase();
    return ["sim", "s", "isso", "correto", "certo", "yes"].includes(t);
}

const NOMES_DIA = ["domingo", "segunda-feira", "terca-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sabado"];

function formatarSlot(data: Date): string {
    const dia = NOMES_DIA[data.getDay()];
    const hoje = new Date();
    const ehHoje = data.toDateString() === hoje.toDateString();
    const horario = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return ehHoje ? `Hoje, ${horario}h` : `${dia.charAt(0).toUpperCase() + dia.slice(1)}, ${horario}h`;
}

async function carregarOuCriarConversa(telefone: string): Promise<ConversaRow> {
    const { rows } = await db.query<ConversaRow>(
        "SELECT telefone, cliente_id, estado, contexto FROM atendimento_conversas WHERE telefone = $1",
        [telefone]
    );
    if (rows[0]) return rows[0];

    const { rows: novas } = await db.query<ConversaRow>(
        `INSERT INTO atendimento_conversas (telefone, estado, contexto)
         VALUES ($1, 'inicio', '{}') RETURNING telefone, cliente_id, estado, contexto`,
        [telefone]
    );
    return novas[0];
}

async function salvarConversa(telefone: string, estado: Estado, contexto: Contexto, clienteId?: string | null) {
    await db.query(
        `UPDATE atendimento_conversas
         SET estado = $2, contexto = $3, cliente_id = COALESCE($4, cliente_id), ultima_interacao = now()
         WHERE telefone = $1`,
        [telefone, estado, JSON.stringify(contexto), clienteId ?? null]
    );
}

async function registrarLog(telefone: string, clienteId: string | null, direcao: "entrada" | "saida", mensagem: string, escalado = false) {
    await db.query(
        `INSERT INTO integracao_whatsapp_log (cliente_id, telefone, direcao, mensagem, atendido_por_ia, escalado_humano)
         VALUES ($1, $2, $3, $4, true, $5)`,
        [clienteId, telefone, direcao, mensagem, escalado]
    );
}

async function responder(telefone: string, clienteId: string | null, texto: string, escalado = false) {
    await enviarMensagem(telefone, texto);
    await registrarLog(telefone, clienteId, "saida", texto, escalado);
}

/** Busca o cliente pelo telefone e, se existir, o veiculo mais recente dele. */
async function buscarClienteExistente(telefone: string) {
    const { rows } = await db.query<{ id: string; nome: string }>(
        "SELECT id, nome FROM clientes WHERE telefone = $1 AND deleted_at IS NULL LIMIT 1",
        [telefone]
    );
    if (!rows[0]) return null;

    const { rows: veiculos } = await db.query<{ id: string; marca: string | null; modelo: string | null; ano: number | null; placa: string }>(
        "SELECT id, marca, modelo, ano, placa FROM veiculos WHERE cliente_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
        [rows[0].id]
    );

    return { cliente: rows[0], veiculo: veiculos[0] ?? null };
}

/** Ponto de entrada: chamado pelo webhook a cada mensagem recebida. */
export async function processarMensagem(telefoneOriginal: string, textoOriginal: string, temMidia: boolean): Promise<void> {
    const telefone = normalizarTelefone(telefoneOriginal);
    const texto = textoOriginal.trim();
    const [conversa, config] = await Promise.all([carregarOuCriarConversa(telefone), obterConfiguracao()]);
    const NOME_OFICINA = config.nomeOficina || process.env.OFICINA_NOME || "nossa oficina";
    const segmento: Segmento = config.segmento;
    await registrarLog(telefone, conversa.cliente_id, "entrada", texto || "[midia]");

    const contexto: Contexto = conversa.contexto || {};

    // Comandos validos em qualquer estado
    if (/^cancelar$/i.test(texto) && conversa.estado === "concluido") {
        await db.query(
            `UPDATE agendamentos SET status = 'cancelado'
             WHERE cliente_id = $1 AND status IN ('confirmado', 'lembrete_enviado')
             AND id = (SELECT id FROM agendamentos WHERE cliente_id = $1 AND status IN ('confirmado','lembrete_enviado') ORDER BY data_hora DESC LIMIT 1)`,
            [conversa.cliente_id]
        );
        await responder(telefone, conversa.cliente_id, "Prontinho, cancelei sua vaga. Se quiser remarcar é só chamar de novo por aqui! 👋");
        return;
    }

    switch (conversa.estado) {
        case "inicio": {
            const existente = await buscarClienteExistente(telefone);
            if (existente) {
                contexto.clienteId = existente.cliente.id;
                if (existente.veiculo) {
                    contexto.veiculoId = existente.veiculo.id;
                    const veiculoTexto = [existente.veiculo.marca, existente.veiculo.modelo, existente.veiculo.ano]
                        .filter(Boolean)
                        .join(" ");
                    const placaTexto =
                        existente.veiculo.placa && existente.veiculo.placa !== "A_INFORMAR"
                            ? ` (placa ${existente.veiculo.placa})`
                            : "";
                    await salvarConversa(telefone, "aguardando_confirmacao_veiculo", contexto, existente.cliente.id);
                    await responder(
                        telefone,
                        existente.cliente.id,
                        `Boas-vindas de volta, ${existente.cliente.nome}! 🚗⚡ Aqui é o assistente virtual da ${NOME_OFICINA}.\n\n` +
                            `Ainda é o *${veiculoTexto}*${placaTexto}? Responda *sim* ou me diga qual é o carro dessa vez.`
                    );
                    return;
                }
                await salvarConversa(telefone, "aguardando_sintoma", contexto, existente.cliente.id);
                await responder(
                    telefone,
                    existente.cliente.id,
                    `Boas-vindas de volta, ${existente.cliente.nome}! 🚗⚡ Me conta: o que está acontecendo com o carro (ou qual serviço você precisa)?`
                );
                return;
            }

            await salvarConversa(telefone, "aguardando_dados", contexto);
            await responder(
                telefone,
                null,
                `Olá! Bem-vindo à ${NOME_OFICINA}! 🚗⚡\n\n` +
                    `Eu sou o assistente virtual daqui e vou agilizar seu atendimento. Pra já separar seu horário certinho, me manda em uma única mensagem:\n\n` +
                    `*seu nome* e o *modelo/ano do carro*\n` +
                    `Ex: _João Silva, Onix 2020_`
            );
            return;
        }

        case "aguardando_dados": {
            const [nomeParte, ...resto] = texto.split(",");
            const nome = nomeParte?.trim();
            const veiculoDescricao = resto.join(",").trim();

            if (!nome || !veiculoDescricao) {
                await responder(
                    telefone,
                    null,
                    `Só preciso do seu nome e do carro separados por vírgula, tipo: _João Silva, Onix 2020_. Pode mandar de novo?`
                );
                return;
            }

            const { rows: clienteRows } = await db.query<{ id: string }>(
                `INSERT INTO clientes (nome, telefone) VALUES ($1, $2) RETURNING id`,
                [nome, telefone]
            );
            const clienteId = clienteRows[0].id;

            const { rows: veiculoRows } = await db.query<{ id: string }>(
                `INSERT INTO veiculos (cliente_id, placa, modelo) VALUES ($1, $2, $3) RETURNING id`,
                [clienteId, "A_INFORMAR", veiculoDescricao]
            );

            contexto.clienteId = clienteId;
            contexto.veiculoId = veiculoRows[0].id;
            contexto.veiculoDescricao = veiculoDescricao;

            await salvarConversa(telefone, "aguardando_sintoma", contexto, clienteId);
            await responder(
                telefone,
                clienteId,
                `Prazer, ${nome}! Anotei o *${veiculoDescricao}*.\n\n` +
                    `Agora me conta: o que está acontecendo com o carro, ou qual serviço você precisa? ` +
                    `(pode descrever com suas palavras, tipo "não liga de manhã" ou "revisão dos 20 mil km")`
            );
            return;
        }

        case "aguardando_confirmacao_veiculo": {
            if (!apenasSim(texto)) {
                const { rows: veiculoRows } = await db.query<{ id: string }>(
                    `INSERT INTO veiculos (cliente_id, placa, modelo) VALUES ($1, $2, $3) RETURNING id`,
                    [contexto.clienteId, "A_INFORMAR", texto]
                );
                contexto.veiculoId = veiculoRows[0].id;
                contexto.veiculoDescricao = texto;
            }
            await salvarConversa(telefone, "aguardando_sintoma", contexto);
            await responder(
                telefone,
                contexto.clienteId ?? null,
                `Combinado! Me conta agora: o que está acontecendo com o carro, ou qual serviço você precisa?`
            );
            return;
        }

        case "aguardando_sintoma": {
            const classificacao = await classificarSintoma(texto, segmento);
            contexto.sintoma = texto;
            contexto.categoria = classificacao.categoria;
            contexto.urgente = classificacao.urgente;

            if (classificacao.urgente) {
                await salvarConversa(telefone, "urgente_transferido", contexto);
                await responder(
                    telefone,
                    contexto.clienteId ?? null,
                    `⚠️ Entendi, isso é sério. Já estou chamando um especialista para falar com você AGORA, sem precisar esperar por horário marcado.\n\n` +
                        `Se o carro estiver parado na via, me avisa que já acionamos o guincho parceiro. Um consultor da ${NOME_OFICINA} entra em contato em instantes.`,
                    true
                );

                // Avisa a oficina AGORA (WhatsApp da empresa + sininho do PDV)
                const { rows: cliRows } = await db.query<{ nome: string }>(
                    "SELECT nome FROM clientes WHERE id = $1",
                    [contexto.clienteId]
                );
                const nomeCli = cliRows[0]?.nome ?? "Cliente";
                await notificarEmpresa({
                    tipo: "urgencia",
                    titulo: `⚠️ URGÊNCIA — ${nomeCli}`,
                    descricao: `${contexto.veiculoDescricao ?? "veículo"} · ${texto}`.slice(0, 300),
                    whatsappNumero: config.whatsappNumero,
                    mensagemWhatsapp:
                        `⚠️ *URGÊNCIA na ${NOME_OFICINA}*\n\n` +
                        `Cliente: ${nomeCli} (${telefone})\n` +
                        `Veículo: ${contexto.veiculoDescricao ?? "—"}\n` +
                        `Relato: ${texto}\n\n` +
                        `Precisa de atendimento imediato — o cliente foi avisado que um especialista vai chamar.`,
                });
                return;
            }

            // Pergunta extra muda de verdade conforme o segmento contratado
            // (elétrica pergunta luz do painel/código de erro; mecânica pergunta km/tipo de barulho).
            await salvarConversa(telefone, "aguardando_midia_ou_pular", contexto);
            await responder(
                telefone,
                contexto.clienteId ?? null,
                `Entendi! ${PERGUNTA_EXTRA_TRIAGEM[segmento]}\n\n` +
                    `Se puder, me manda também uma *foto* (do painel ou do problema) — ajuda demais o profissional já chegar sabendo o que pode ser.\n\n` +
                    `Pode responder tudo em uma mensagem só, ou digitar *pular* se não tiver mais detalhes.`
            );
            return;
        }

        case "aguardando_midia_ou_pular": {
            if (temMidia) contexto.midiaRecebida = true;
            if (texto && !/^pular$/i.test(texto)) contexto.detalheExtra = texto.slice(0, 300);

            await salvarConversa(telefone, "aguardando_periodo", contexto);
            await responder(
                telefone,
                contexto.clienteId ?? null,
                (temMidia ? "Recebi a imagem, valeu! 📸\n\n" : "") +
                    `Você prefere ser atendido em qual período?\n\n*1* - Manhã (08h às 12h)\n*2* - Tarde (13h às 18h)`
            );
            return;
        }

        case "aguardando_periodo": {
            const t = texto.trim().toLowerCase();
            let periodo: "manha" | "tarde" | null = null;
            if (t === "1" || t.includes("manh")) periodo = "manha";
            else if (t === "2" || t.includes("tard")) periodo = "tarde";

            if (!periodo) {
                await responder(telefone, contexto.clienteId ?? null, `Não entendi. Digite *1* para manhã ou *2* para tarde.`);
                return;
            }

            contexto.periodo = periodo;
            const slots = await buscarProximosHorarios(periodo, contexto.categoria ?? "outro", segmento);

            if (slots.length === 0) {
                await responder(
                    telefone,
                    contexto.clienteId ?? null,
                    `Poxa, não encontrei vaga nos próximos dias nesse período. Um consultor vai te chamar por aqui em breve pra encontrarmos um horário juntos.`,
                    true
                );
                await salvarConversa(telefone, "concluido", contexto);
                return;
            }

            contexto.slotsOferecidos = slots.map((s) => s.dataHora.toISOString());
            const listaTexto = slots.map((s, i) => `🗓️ *${i + 1}* - ${formatarSlot(s.dataHora)}`).join("\n");

            await salvarConversa(telefone, "aguardando_escolha_horario", contexto);
            await responder(
                telefone,
                contexto.clienteId ?? null,
                `Já verifiquei nossa agenda! Temos estes horários disponíveis:\n\n${listaTexto}\n\n` +
                    `Qual número fica melhor pra você? Assim que escolher, já reservo sua vaga.`
            );
            return;
        }

        case "aguardando_escolha_horario": {
            const escolha = parseInt(texto.trim(), 10);
            const slotsIso = contexto.slotsOferecidos ?? [];
            if (!escolha || escolha < 1 || escolha > slotsIso.length) {
                await responder(telefone, contexto.clienteId ?? null, `Escolha um dos números que te mandei (1, 2 ou 3).`);
                return;
            }

            const dataHora = new Date(slotsIso[escolha - 1]);
            const sintomaCompleto = [contexto.sintoma, contexto.detalheExtra].filter(Boolean).join(" — ");
            const resultado = await confirmarAgendamento({
                clienteId: contexto.clienteId!,
                veiculoId: contexto.veiculoId ?? null,
                dataHora,
                periodo: contexto.periodo!,
                categoria: contexto.categoria ?? "outro",
                sintoma: sintomaCompleto || contexto.sintoma || "",
                urgente: false,
                midiaRecebida: Boolean(contexto.midiaRecebida),
            });

            if ("conflito" in resultado) {
                const novosSlots = await buscarProximosHorarios(contexto.periodo!, contexto.categoria ?? "outro", segmento);
                contexto.slotsOferecidos = novosSlots.map((s) => s.dataHora.toISOString());
                const listaTexto = novosSlots.map((s, i) => `🗓️ *${i + 1}* - ${formatarSlot(s.dataHora)}`).join("\n");
                await salvarConversa(telefone, "aguardando_escolha_horario", contexto);
                await responder(
                    telefone,
                    contexto.clienteId ?? null,
                    `Ih, esse horário acabou de ser preenchido por outro cliente! Ainda temos:\n\n${listaTexto}\n\nQual prefere?`
                );
                return;
            }

            const link = `${PUBLIC_URL}/agendamento/${resultado.id}`;
            await salvarConversa(telefone, "concluido", contexto);
            await responder(
                telefone,
                contexto.clienteId ?? null,
                `Prontinho! ✅ Sua vaga para *${formatarSlot(dataHora)}* está reservada e o consultor técnico vai te esperar.\n\n` +
                    `Aqui está a confirmação: ${link}\n\n` +
                    `Vou te lembrar por aqui um pouco antes do horário. Se precisar cancelar, é só digitar *cancelar*. Até lá! 🔧`
            );

            // Avisa a oficina do novo agendamento (WhatsApp da empresa + sininho do PDV)
            const { rows: cliRows } = await db.query<{ nome: string }>(
                "SELECT nome FROM clientes WHERE id = $1",
                [contexto.clienteId]
            );
            const nomeCli = cliRows[0]?.nome ?? "Cliente";
            const veic = contexto.veiculoDescricao ?? "veículo";
            await notificarEmpresa({
                tipo: "novo_agendamento",
                titulo: `Novo agendamento — ${nomeCli}`,
                descricao: `${veic} · ${formatarSlot(dataHora)} · ${sintomaCompleto || contexto.sintoma || ""}`.slice(0, 300),
                referenciaId: resultado.id,
                link,
                whatsappNumero: config.whatsappNumero,
                mensagemWhatsapp:
                    `🗓️ *Novo agendamento na ${NOME_OFICINA}*\n\n` +
                    `Cliente: ${nomeCli} (${telefone})\n` +
                    `Veículo: ${veic}\n` +
                    `Quando: ${formatarSlot(dataHora)}\n` +
                    `Serviço: ${sintomaCompleto || contexto.sintoma || "—"}\n\n` +
                    `Detalhes: ${link}`,
            });
            return;
        }

        case "urgente_transferido":
        case "concluido":
        default: {
            await responder(
                telefone,
                conversa.cliente_id,
                `Um consultor da ${NOME_OFICINA} já vai te responder por aqui. Se quiser reagendar, digite *cancelar* para liberar a vaga atual e começar de novo.`
            );
            return;
        }
    }
}
