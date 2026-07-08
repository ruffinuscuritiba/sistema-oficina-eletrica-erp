import { Router } from "express";
import { db } from "../../core/db";
import { exigirApiAdmin } from "../../core/auth";
import { obterConfiguracao, salvarConfiguracao, type Segmento } from "../../core/config-oficina";
import { listarPlanos, registrarManutencao, listarProximas } from "../../core/manutencao";
import { contarNaoLidas, listar as listarNotificacoes, marcarTodasLidas } from "../../core/notificacoes-painel";

const router = Router();
router.use(exigirApiAdmin);

router.get("/dashboard", async (req, res) => {
    try {
        const oficinaId = req.usuario!.oficinaId!;
        const config = await obterConfiguracao(oficinaId);

        const [{ rows: hojeRows }, { rows: urgentesRows }, { rows: preventivosRows }, { rows: clientesRows }, { rows: proximos }] = await Promise.all([
            db.query(
                "SELECT COUNT(*)::int AS total FROM agendamentos WHERE oficina_id = $1 AND data_hora::date = CURRENT_DATE AND status IN ('confirmado','lembrete_enviado')",
                [oficinaId]
            ),
            db.query(
                "SELECT COUNT(*)::int AS total FROM atendimento_conversas WHERE oficina_id = $1 AND estado = 'urgente_transferido' AND ultima_interacao > now() - interval '24 hours'",
                [oficinaId]
            ),
            db.query(
                "SELECT COUNT(*)::int AS total FROM manutencoes_realizadas WHERE oficina_id = $1 AND status = 'pendente_lembrete' AND proxima_data <= CURRENT_DATE + interval '10 days'",
                [oficinaId]
            ),
            db.query("SELECT COUNT(*)::int AS total FROM clientes WHERE oficina_id = $1 AND deleted_at IS NULL", [oficinaId]),
            db.query(
                `SELECT a.id, a.data_hora, a.categoria, a.sintoma, a.status, c.nome AS cliente_nome, v.modelo AS veiculo_modelo
                 FROM agendamentos a
                 JOIN clientes c ON c.id = a.cliente_id
                 LEFT JOIN veiculos v ON v.id = a.veiculo_id
                 WHERE a.oficina_id = $1 AND a.status IN ('confirmado', 'lembrete_enviado') AND a.data_hora >= now()
                 ORDER BY a.data_hora ASC LIMIT 20`,
                [oficinaId]
            ),
        ]);

        res.json({
            oficinaNome: config.nomeOficina,
            segmento: config.segmento,
            precisaOnboarding: !config.configuradoEm,
            kpis: {
                agendamentosHoje: hojeRows[0].total,
                urgencias24h: urgentesRows[0].total,
                revisoesPreventivas: preventivosRows[0].total,
                clientesCadastrados: clientesRows[0].total,
            },
            proximosAgendamentos: proximos.map((a: any) => ({
                id: a.id,
                dataHora: a.data_hora,
                categoria: a.categoria,
                sintoma: a.sintoma,
                status: a.status,
                clienteNome: a.cliente_nome,
                veiculoModelo: a.veiculo_modelo,
            })),
        });
    } catch (erro) {
        console.error("[api/admin] erro no dashboard:", erro);
        res.status(500).json({ erro: "Erro ao carregar o painel." });
    }
});

router.get("/configuracao", async (req, res) => {
    try {
        const config = await obterConfiguracao(req.usuario!.oficinaId!);
        res.json(config);
    } catch (erro) {
        console.error("[api/admin] erro ao carregar configuracao:", erro);
        res.status(500).json({ erro: "Erro ao carregar configuração." });
    }
});

router.put("/configuracao", async (req, res) => {
    try {
        const { segmento, nomeOficina, whatsappNumero } = req.body ?? {};
        if (!["auto_eletrica", "mecanica", "integrado"].includes(segmento) || !nomeOficina) {
            res.status(400).json({ erro: "Dados invalidos." });
            return;
        }
        await salvarConfiguracao(req.usuario!.oficinaId!, { segmento: segmento as Segmento, nomeOficina, whatsappNumero });
        res.json({ ok: true });
    } catch (erro) {
        console.error("[api/admin] erro ao salvar configuracao:", erro);
        res.status(500).json({ erro: "Erro ao salvar configuração." });
    }
});

router.get("/manutencao", async (req, res) => {
    try {
        const oficinaId = req.usuario!.oficinaId!;
        const config = await obterConfiguracao(oficinaId);
        const [planos, proximas, { rows: veiculos }] = await Promise.all([
            listarPlanos(config.segmento),
            listarProximas(oficinaId, 30),
            db.query<{ id: string; marca: string | null; modelo: string; cliente_nome: string; cliente_telefone: string }>(
                `SELECT v.id, v.marca, v.modelo, c.nome AS cliente_nome, c.telefone AS cliente_telefone
                 FROM veiculos v
                 JOIN clientes c ON c.id = v.cliente_id
                 WHERE v.oficina_id = $1 AND v.deleted_at IS NULL AND c.deleted_at IS NULL
                 ORDER BY v.created_at DESC LIMIT 200`,
                [oficinaId]
            ),
        ]);

        res.json({
            planos,
            proximasRevisoes: proximas,
            veiculos: veiculos.map((v) => ({
                id: v.id,
                label: `${v.marca ? v.marca + " " : ""}${v.modelo} — ${v.cliente_nome} (${v.cliente_telefone})`,
            })),
        });
    } catch (erro) {
        console.error("[api/admin] erro ao carregar manutencao:", erro);
        res.status(500).json({ erro: "Erro ao carregar manutenção preventiva." });
    }
});

router.post("/manutencao", async (req, res) => {
    try {
        const oficinaId = req.usuario!.oficinaId!;
        const { veiculoId, planoId, kmAtual } = req.body ?? {};
        if (!veiculoId || !planoId) {
            res.status(400).json({ erro: "Selecione veículo e serviço." });
            return;
        }

        const { rows } = await db.query<{ cliente_id: string }>(
            "SELECT cliente_id FROM veiculos WHERE id = $1 AND oficina_id = $2",
            [veiculoId, oficinaId]
        );
        const clienteId = rows[0]?.cliente_id;
        if (!clienteId) {
            res.status(404).json({ erro: "Veículo não encontrado." });
            return;
        }

        const km = typeof kmAtual === "number" ? kmAtual : kmAtual ? parseInt(kmAtual, 10) : null;
        const resultado = await registrarManutencao(oficinaId, {
            veiculoId,
            clienteId,
            planoId,
            kmAtual: Number.isFinite(km as number) ? km : null,
        });

        if ("erro" in resultado) {
            res.status(400).json(resultado);
            return;
        }
        res.json({ ok: true, ...resultado });
    } catch (erro) {
        console.error("[api/admin] erro ao registrar manutencao:", erro);
        res.status(500).json({ erro: "Erro ao registrar serviço." });
    }
});

router.get("/notificacoes/count", async (req, res) => {
    try {
        const total = await contarNaoLidas(req.usuario!.oficinaId!);
        res.json({ total });
    } catch (erro) {
        console.error("[api/admin] erro ao contar notificacoes:", erro);
        res.json({ total: 0 });
    }
});

router.get("/notificacoes", async (req, res) => {
    try {
        const oficinaId = req.usuario!.oficinaId!;
        const itens = await listarNotificacoes(oficinaId, 50);
        await marcarTodasLidas(oficinaId);
        res.json({ itens });
    } catch (erro) {
        console.error("[api/admin] erro ao listar notificacoes:", erro);
        res.status(500).json({ erro: "Erro ao carregar notificações." });
    }
});

export default router;
