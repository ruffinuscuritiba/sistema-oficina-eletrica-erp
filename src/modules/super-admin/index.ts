import { Router } from "express";
import bcrypt from "bcryptjs";
import type { Modulo } from "../../core/module-registry";
import { db } from "../../core/db";
import { gerarToken, exigirSuperAdmin } from "../../core/auth";
import { SEGMENTO_LABEL } from "../../core/segmentos";
import { layout } from "../admin/layout";
import type { Segmento } from "../../core/config-oficina";

const router = Router();

// Reaproveita as classes CSS de admin/layout.ts (card, grid, kpi, badge, form)
// mas com topo proprio -- e uma persona distinta do admin de loja, sem sino
// de notificacoes por oficina e com nav diferente.
function paginaSuperAdmin(titulo: string, corpo: string): string {
    return layout(
        titulo,
        `<div class="topo" style="margin:-1.5rem -1.5rem 1.5rem;">
            <b>🏢 Super Admin</b>
            <a class="sair" href="/super-admin/logout">Sair</a>
         </div>
         ${corpo}`,
        { semTopo: true }
    );
}

router.get("/login", (req, res) => {
    const erro = req.query.erro ? `<div class="erro">E-mail ou senha inválidos.</div>` : "";
    res.send(
        layout(
            "Entrar — Super Admin",
            `<div style="max-width:360px;margin:4rem auto 0;">
                <h2 style="text-align:center;margin-bottom:1.5rem;">🏢 Super Admin</h2>
                ${erro}
                <form method="POST" action="/super-admin/login">
                    <label>E-mail</label>
                    <input type="email" name="email" required autofocus />
                    <label>Senha</label>
                    <input type="password" name="senha" required />
                    <button type="submit" style="width:100%;">Entrar</button>
                </form>
            </div>`,
            { semTopo: true }
        )
    );
});

router.post("/login", async (req, res) => {
    try {
        const { email, senha } = req.body ?? {};
        if (!email || !senha) return res.redirect("/super-admin/login?erro=1");

        const { rows } = await db.query<{ id: string; senha_hash: string; email: string; papel: string; ativo: boolean }>(
            "SELECT id, senha_hash, email, papel, ativo FROM usuarios WHERE email = $1 AND papel = 'super_admin'",
            [email]
        );
        const usuario = rows[0];
        if (!usuario || !usuario.ativo || !(await bcrypt.compare(senha, usuario.senha_hash))) {
            return res.redirect("/super-admin/login?erro=1");
        }

        const token = gerarToken({ usuarioId: usuario.id, email: usuario.email, papel: usuario.papel, oficinaId: null });
        res.cookie("admin_token", token, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 8 * 60 * 60 * 1000,
        });
        res.redirect("/super-admin");
    } catch (erro) {
        console.error("[super-admin] erro no login:", erro);
        res.status(500).send("Erro ao processar login. Tente novamente.");
    }
});

router.get("/logout", (_req, res) => {
    res.clearCookie("admin_token");
    res.redirect("/super-admin/login");
});

router.get("/", exigirSuperAdmin, async (_req, res) => {
    try {
        const { rows: lojas } = await db.query(
            `SELECT o.id, o.nome, o.segmento, o.ativo, o.configurado_em,
                    COALESCE(cli.total, 0) AS total_clientes,
                    COALESCE(ag.total, 0) AS total_agendamentos
             FROM oficinas o
             LEFT JOIN (SELECT oficina_id, COUNT(*) AS total FROM clientes WHERE deleted_at IS NULL GROUP BY oficina_id) cli
                    ON cli.oficina_id = o.id
             LEFT JOIN (SELECT oficina_id, COUNT(*) AS total FROM agendamentos GROUP BY oficina_id) ag
                    ON ag.oficina_id = o.id
             ORDER BY o.created_at ASC`
        );

        const linhas = lojas
            .map(
                (o: any) => `<tr>
                    <td>${o.nome}</td>
                    <td>${SEGMENTO_LABEL[o.segmento as Segmento] ?? o.segmento}</td>
                    <td>${o.total_clientes}</td>
                    <td>${o.total_agendamentos}</td>
                    <td>${
                        o.ativo
                            ? '<span class="badge" style="background:#22c55e22;color:#22c55e">Ativa</span>'
                            : '<span class="badge" style="background:#ef444422;color:#ef4444">Inativa</span>'
                    }</td>
                    <td>
                        <a class="sair" href="/super-admin/lojas/${o.id}">Editar</a>
                        &nbsp;·&nbsp;
                        <form method="POST" action="/super-admin/lojas/${o.id}/toggle-ativo" style="display:inline;">
                            <button type="submit" style="all:unset;cursor:pointer;color:${o.ativo ? "#ef4444" : "#22c55e"};font-size:.85rem;">
                                ${o.ativo ? "Desativar" : "Reativar"}
                            </button>
                        </form>
                    </td>
                </tr>`
            )
            .join("");

        res.send(
            paginaSuperAdmin(
                "Lojas — Super Admin",
                `<h1 style="margin-top:0;">Lojas</h1>
                 <p style="color:#9ca3af;margin-top:-.5rem;">Todas as oficinas cadastradas no sistema.</p>

                 <div class="card">
                    <table>
                        <thead><tr><th>Nome</th><th>Sistema</th><th>Clientes</th><th>Agendamentos</th><th>Status</th><th>Ações</th></tr></thead>
                        <tbody>${linhas || '<tr><td colspan="6" style="color:#6b7280;">Nenhuma loja cadastrada ainda.</td></tr>'}</tbody>
                    </table>
                 </div>

                 <p style="margin-top:1.5rem;"><a class="sair" href="/super-admin/lojas/nova">+ Nova loja</a></p>`
            )
        );
    } catch (erro) {
        console.error("[super-admin] erro ao listar lojas:", erro);
        res.status(500).send("Erro ao carregar lojas.");
    }
});

function formularioLoja(dados?: { nome?: string; segmento?: Segmento; whatsappNumero?: string }) {
    const opcoes = (["auto_eletrica", "mecanica", "integrado"] as Segmento[])
        .map(
            (s) => `<label style="display:block;border:1px solid #2b2f3a;border-radius:12px;padding:1rem;margin-top:.6rem;cursor:pointer;">
                <input type="radio" name="segmento" value="${s}" ${dados?.segmento === s ? "checked" : ""} style="width:auto;display:inline;margin-right:.5rem;" required />
                <b>${SEGMENTO_LABEL[s]}</b>
            </label>`
        )
        .join("");

    return `<label>Nome da oficina</label>
             <input type="text" name="nome" value="${dados?.nome ?? ""}" required />

             <label>Qual sistema essa loja contratou?</label>
             ${opcoes}

             <label>WhatsApp para receber avisos (com DDI, opcional por enquanto)</label>
             <input type="text" name="whatsappNumero" value="${dados?.whatsappNumero ?? ""}" placeholder="5511999999999" />`;
}

router.get("/lojas/nova", exigirSuperAdmin, (_req, res) => {
    res.send(
        paginaSuperAdmin(
            "Nova loja — Super Admin",
            `<h1 style="margin-top:0;">Nova loja</h1>
             <p style="color:#9ca3af;margin-top:-.5rem;">Cria a oficina e o primeiro usuário admin dela.</p>
             <div class="card">
                <form method="POST" action="/super-admin/lojas/nova">
                    ${formularioLoja()}
                    <label style="margin-top:1.2rem;">Nome do responsável (primeiro admin)</label>
                    <input type="text" name="adminNome" required />
                    <label>E-mail do admin (login)</label>
                    <input type="email" name="adminEmail" required />
                    <label>Senha inicial</label>
                    <input type="password" name="adminSenha" required minlength="6" />
                    <button type="submit">Criar loja</button>
                </form>
             </div>
             <p style="margin-top:1.5rem;"><a class="sair" href="/super-admin">← Voltar</a></p>`
        )
    );
});

router.post("/lojas/nova", exigirSuperAdmin, async (req, res) => {
    const cliente = await db.connect();
    try {
        const { nome, segmento, whatsappNumero, adminNome, adminEmail, adminSenha } = req.body ?? {};
        if (!nome || !["auto_eletrica", "mecanica", "integrado"].includes(segmento) || !adminNome || !adminEmail || !adminSenha) {
            cliente.release();
            return res.redirect("/super-admin/lojas/nova");
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
        res.redirect("/super-admin");
    } catch (erro) {
        await cliente.query("ROLLBACK");
        console.error("[super-admin] erro ao criar loja:", erro);
        res.status(500).send("Erro ao criar loja. Verifique se o e-mail do admin já não está em uso nessa loja.");
    } finally {
        cliente.release();
    }
});

router.get("/lojas/:id", exigirSuperAdmin, async (req, res) => {
    try {
        const { rows } = await db.query(
            "SELECT id, nome, segmento, whatsapp_numero, ativo FROM oficinas WHERE id = $1",
            [req.params.id]
        );
        const loja = rows[0];
        if (!loja) return res.status(404).send("Loja não encontrada.");

        res.send(
            paginaSuperAdmin(
                `${loja.nome} — Super Admin`,
                `<h1 style="margin-top:0;">${loja.nome}</h1>
                 <div class="card">
                    <form method="POST" action="/super-admin/lojas/${loja.id}">
                        ${formularioLoja({ nome: loja.nome, segmento: loja.segmento, whatsappNumero: loja.whatsapp_numero })}
                        <button type="submit">Salvar</button>
                    </form>
                 </div>
                 <p style="margin-top:1.5rem;"><a class="sair" href="/super-admin">← Voltar</a></p>`
            )
        );
    } catch (erro) {
        console.error("[super-admin] erro ao carregar loja:", erro);
        res.status(500).send("Erro ao carregar loja.");
    }
});

router.post("/lojas/:id", exigirSuperAdmin, async (req, res) => {
    try {
        const { nome, segmento, whatsappNumero } = req.body ?? {};
        if (!nome || !["auto_eletrica", "mecanica", "integrado"].includes(segmento)) {
            return res.redirect(`/super-admin/lojas/${req.params.id}`);
        }
        await db.query(
            "UPDATE oficinas SET nome = $2, segmento = $3, whatsapp_numero = $4 WHERE id = $1",
            [req.params.id, nome, segmento, whatsappNumero || null]
        );
        res.redirect("/super-admin");
    } catch (erro) {
        console.error("[super-admin] erro ao salvar loja:", erro);
        res.status(500).send("Erro ao salvar loja.");
    }
});

router.post("/lojas/:id/toggle-ativo", exigirSuperAdmin, async (req, res) => {
    try {
        await db.query("UPDATE oficinas SET ativo = NOT ativo WHERE id = $1", [req.params.id]);
        res.redirect("/super-admin");
    } catch (erro) {
        console.error("[super-admin] erro ao alternar status da loja:", erro);
        res.status(500).send("Erro ao alternar status da loja.");
    }
});

const modulo: Modulo = { prefixo: "/super-admin", router };
export default modulo;
