import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../../core/db";
import { gerarToken } from "../../core/auth";

const router = Router();

interface CandidatoLogin {
    id: string;
    nome: string;
    senha_hash: string;
    email: string;
    papel: string;
    ativo: boolean;
    oficina_id: string;
    oficina_nome: string;
    oficina_ativa: boolean;
}

// Login do painel de UMA loja. Mesma regra de negocio do POST /admin/login
// (HTML), so que devolve JSON com o token em vez de setar cookie + redirect --
// e o que o frontend Next.js desacoplado consome.
router.post("/login", async (req, res) => {
    try {
        const { email, senha, oficinaId } = req.body ?? {};
        if (!email || !senha) {
            res.status(400).json({ erro: "Informe e-mail e senha." });
            return;
        }

        const { rows } = await db.query<CandidatoLogin>(
            `SELECT u.id, u.nome, u.senha_hash, u.email, u.papel, u.ativo,
                    u.oficina_id, o.nome AS oficina_nome, o.ativo AS oficina_ativa
             FROM usuarios u
             JOIN oficinas o ON o.id = u.oficina_id
             WHERE u.email = $1 AND u.papel != 'super_admin'`,
            [email]
        );

        const candidatos = rows.filter((u) => u.ativo && u.oficina_ativa);
        if (candidatos.length === 0) {
            res.status(401).json({ erro: "E-mail ou senha invalidos." });
            return;
        }

        let selecionado = candidatos[0];
        if (candidatos.length > 1) {
            if (oficinaId) {
                const encontrado = candidatos.find((u) => u.oficina_id === oficinaId);
                if (!encontrado) {
                    res.status(401).json({ erro: "E-mail ou senha invalidos." });
                    return;
                }
                selecionado = encontrado;
            } else {
                // Mesmo e-mail em 2+ lojas: pede pro frontend mostrar um seletor
                // e reenviar o login com oficinaId preenchido (sem guardar a senha).
                res.status(300).json({
                    multiplasLojas: candidatos.map((u) => ({ oficinaId: u.oficina_id, oficinaNome: u.oficina_nome })),
                });
                return;
            }
        }

        if (!(await bcrypt.compare(senha, selecionado.senha_hash))) {
            res.status(401).json({ erro: "E-mail ou senha invalidos." });
            return;
        }

        const accessToken = gerarToken({
            usuarioId: selecionado.id,
            email: selecionado.email,
            papel: selecionado.papel,
            oficinaId: selecionado.oficina_id,
        });

        res.json({
            accessToken,
            user: {
                id: selecionado.id,
                nome: selecionado.nome,
                email: selecionado.email,
                papel: selecionado.papel,
                oficinaId: selecionado.oficina_id,
                oficinaNome: selecionado.oficina_nome,
            },
        });
    } catch (erro) {
        console.error("[api/auth] erro no login:", erro);
        res.status(500).json({ erro: "Erro ao processar login." });
    }
});

// Login do super-admin (ve todas as lojas). Mesma regra do POST /super-admin/login.
router.post("/super-admin-login", async (req, res) => {
    try {
        const { email, senha } = req.body ?? {};
        if (!email || !senha) {
            res.status(400).json({ erro: "Informe e-mail e senha." });
            return;
        }

        const { rows } = await db.query<{ id: string; nome: string; senha_hash: string; email: string; papel: string; ativo: boolean }>(
            "SELECT id, nome, senha_hash, email, papel, ativo FROM usuarios WHERE email = $1 AND papel = 'super_admin'",
            [email]
        );
        const usuario = rows[0];
        if (!usuario || !usuario.ativo || !(await bcrypt.compare(senha, usuario.senha_hash))) {
            res.status(401).json({ erro: "E-mail ou senha invalidos." });
            return;
        }

        const accessToken = gerarToken({ usuarioId: usuario.id, email: usuario.email, papel: usuario.papel, oficinaId: null });
        res.json({
            accessToken,
            user: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel, oficinaId: null },
        });
    } catch (erro) {
        console.error("[api/auth] erro no login super-admin:", erro);
        res.status(500).json({ erro: "Erro ao processar login." });
    }
});

export default router;
