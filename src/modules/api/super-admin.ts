import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../../core/db";
import { exigirApiSuperAdmin } from "../../core/auth";

const router = Router();
router.use(exigirApiSuperAdmin);

router.get("/lojas", async (_req, res) => {
    try {
        const { rows: lojas } = await db.query(
            `SELECT o.id, o.nome, o.segmento, o.ativo, o.configurado_em, o.whatsapp_numero,
                    COALESCE(cli.total, 0) AS total_clientes,
                    COALESCE(ag.total, 0) AS total_agendamentos
             FROM oficinas o
             LEFT JOIN (SELECT oficina_id, COUNT(*) AS total FROM clientes WHERE deleted_at IS NULL GROUP BY oficina_id) cli
                    ON cli.oficina_id = o.id
             LEFT JOIN (SELECT oficina_id, COUNT(*) AS total FROM agendamentos GROUP BY oficina_id) ag
                    ON ag.oficina_id = o.id
             ORDER BY o.created_at ASC`
        );

        res.json({
            lojas: lojas.map((o: any) => ({
                id: o.id,
                nome: o.nome,
                segmento: o.segmento,
                ativo: o.ativo,
                configuradoEm: o.configurado_em,
                whatsappNumero: o.whatsapp_numero,
                totalClientes: o.total_clientes,
                totalAgendamentos: o.total_agendamentos,
            })),
        });
    } catch (erro) {
        console.error("[api/super-admin] erro ao listar lojas:", erro);
        res.status(500).json({ erro: "Erro ao carregar lojas." });
    }
});

router.get("/lojas/:id", async (req, res) => {
    try {
        const { rows } = await db.query(
            "SELECT id, nome, segmento, whatsapp_numero, ativo, configurado_em FROM oficinas WHERE id = $1",
            [req.params.id]
        );
        const loja = rows[0];
        if (!loja) {
            res.status(404).json({ erro: "Loja não encontrada." });
            return;
        }
        res.json({
            id: loja.id,
            nome: loja.nome,
            segmento: loja.segmento,
            whatsappNumero: loja.whatsapp_numero,
            ativo: loja.ativo,
            configuradoEm: loja.configurado_em,
        });
    } catch (erro) {
        console.error("[api/super-admin] erro ao carregar loja:", erro);
        res.status(500).json({ erro: "Erro ao carregar loja." });
    }
});

router.post("/lojas", async (req, res) => {
    const cliente = await db.connect();
    try {
        const { nome, segmento, whatsappNumero, adminNome, adminEmail, adminSenha } = req.body ?? {};
        if (!nome || !["auto_eletrica", "mecanica", "integrado"].includes(segmento) || !adminNome || !adminEmail || !adminSenha) {
            res.status(400).json({ erro: "Preencha todos os campos obrigatórios." });
            return;
        }

        await cliente.query("BEGIN");

        const { rows: oficinaRows } = await cliente.query<{ id: string }>(
            `INSERT INTO oficinas (nome, segmento, whatsapp_numero, ativo, configurado_em)
             VALUES ($1, $2, $3, true, now())
             RETURNING id`,
            [nome, segmento, whatsappNumero || null]
        );
        const oficinaId = oficinaRows[0].id;

        const hash = await bcrypt.hash(adminSenha, 10);
        await cliente.query(
            `INSERT INTO usuarios (nome, email, senha_hash, papel, oficina_id)
             VALUES ($1, $2, $3, 'admin', $4)`,
            [adminNome, adminEmail, hash, oficinaId]
        );

        await cliente.query("COMMIT");
        res.json({ ok: true, oficinaId });
    } catch (erro) {
        await cliente.query("ROLLBACK");
        console.error("[api/super-admin] erro ao criar loja:", erro);
        res.status(500).json({ erro: "Erro ao criar loja. Verifique se o e-mail do admin já não está em uso nessa loja." });
    } finally {
        cliente.release();
    }
});

router.put("/lojas/:id", async (req, res) => {
    try {
        const { nome, segmento, whatsappNumero } = req.body ?? {};
        if (!nome || !["auto_eletrica", "mecanica", "integrado"].includes(segmento)) {
            res.status(400).json({ erro: "Dados inválidos." });
            return;
        }
        await db.query(
            "UPDATE oficinas SET nome = $2, segmento = $3, whatsapp_numero = $4 WHERE id = $1",
            [req.params.id, nome, segmento, whatsappNumero || null]
        );
        res.json({ ok: true });
    } catch (erro) {
        console.error("[api/super-admin] erro ao salvar loja:", erro);
        res.status(500).json({ erro: "Erro ao salvar loja." });
    }
});

router.post("/lojas/:id/toggle-ativo", async (req, res) => {
    try {
        await db.query("UPDATE oficinas SET ativo = NOT ativo WHERE id = $1", [req.params.id]);
        res.json({ ok: true });
    } catch (erro) {
        console.error("[api/super-admin] erro ao alternar status da loja:", erro);
        res.status(500).json({ erro: "Erro ao alternar status da loja." });
    }
});

export default router;
