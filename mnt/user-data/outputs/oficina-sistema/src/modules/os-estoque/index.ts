import { Router } from "express";
import type { Modulo } from "../../core/module-registry";

const router = Router();

const TRANSICOES_VALIDAS: Record<string, string[]> = {
    recepcao: ["diagnostico", "cancelada"],
    diagnostico: ["aguardando_aprovacao", "cancelada"],
    aguardando_aprovacao: ["em_execucao", "cancelada"],
    em_execucao: ["concluida"],
    concluida: ["entregue"],
    entregue: [],
    cancelada: [],
};

router.post("/os", async (req, res) => {
    // TODO: criar OS com status inicial "recepcao" + registrar em os_status_historico
    res.status(201).json({ id: "uuid-gerado", status: "recepcao", ...req.body });
});

router.patch("/os/:id/status", async (req, res) => {
    const { novoStatus } = req.body;
    // TODO: buscar status atual da OS no banco antes de validar a transicao
    const statusAtual = "recepcao"; // placeholder
    if (!TRANSICOES_VALIDAS[statusAtual]?.includes(novoStatus)) {
        return res.status(400).json({ erro: `Transicao de "${statusAtual}" para "${novoStatus}" nao é permitida` });
    }
    // TODO: dentro de uma unica transacao de banco:
    //   1. UPDATE ordens_servico SET status = novoStatus
    //   2. INSERT em os_status_historico
    //   3. se novoStatus === 'em_execucao', notificar via whatsapp-ia
    res.json({ id: req.params.id, status: novoStatus });
});

// Lancar peca/servico na OS -- é aqui que a baixa de estoque deve ser atomica
router.post("/os/:id/itens", async (req, res) => {
    const { catalogoItemId, quantidade } = req.body;
    // TODO: dentro de UMA transacao (BEGIN...COMMIT):
    //   1. SELECT quantidade_estoque FROM catalogo_itens WHERE id = catalogoItemId FOR UPDATE
    //   2. se quantidade_estoque < quantidade -> erro "sem estoque"
    //   3. INSERT em os_itens
    //   4. UPDATE catalogo_itens SET quantidade_estoque = quantidade_estoque - quantidade
    //   5. INSERT em estoque_movimentacao (tipo='saida', origem_tipo='os_item')
    // O "FOR UPDATE" no passo 1 é o que evita duas OS venderem a ultima peca ao mesmo tempo.
    res.status(201).json({ osId: req.params.id, catalogoItemId, quantidade });
});

router.get("/estoque/alertas", async (_req, res) => {
    // TODO: SELECT * FROM catalogo_itens WHERE quantidade_estoque <= quantidade_minima
    res.json({ itens_baixo_estoque: [] });
});

const modulo: Modulo = { prefixo: "/os-estoque", router };
export default modulo;
