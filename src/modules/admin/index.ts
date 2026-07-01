import { Router } from "express";
import bcrypt from "bcryptjs";
import type { Modulo } from "../../core/module-registry";
import { db } from "../../core/db";
import { gerarToken, exigirAdmin } from "../../core/auth";
import { obterConfiguracao, salvarConfiguracao, type Segmento } from "../../core/config-oficina";
import { SEGMENTO_LABEL, SEGMENTO_DESCRICAO } from "../../core/segmentos";
import { listarPlanos, registrarManutencao, listarProximas } from "../../core/manutencao";
import { contarNaoLidas, listar as listarNotificacoes, marcarTodasLidas } from "../../core/notificacoes-painel";
import { layout } from "./layout";

const router = Router();

router.get("/login", (req, res) => {
    const erro = req.query.erro ? `<div class="erro">E-mail ou senha inválidos.</div>` : "";
    res.send(
        layout(
            "Entrar — Painel Admin",
            `<div style="max-width:360px;margin:4rem auto 0;">
                <h2 style="text-align:center;margin-bottom:1.5rem;">🔧 Painel Admin</h2>
                ${erro}
                <form method="POST" action="/admin/login">
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
        if (!email || !senha) return res.redirect("/admin/login?erro=1");

        const { rows } = await db.query<{ id: string; senha_hash: string; email: string; papel: string; ativo: boolean }>(
            "SELECT id, senha_hash, email, papel, ativo FROM usuarios WHERE email = $1",
            [email]
        );
        const usuario = rows[0];
        if (!usuario || !usuario.ativo || !(await bcrypt.compare(senha, usuario.senha_hash))) {
            return res.redirect("/admin/login?erro=1");
        }

        const token = gerarToken({ usuarioId: usuario.id, email: usuario.email, papel: usuario.papel });
        res.cookie("admin_token", token, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 8 * 60 * 60 * 1000,
        });
        res.redirect("/admin");
    } catch (erro) {
        console.error("[admin] erro no login:", erro);
        res.status(500).send("Erro ao processar login. Tente novamente.");
    }
});

router.get("/logout", (_req, res) => {
    res.clearCookie("admin_token");
    res.redirect("/admin/login");
});

router.get("/", exigirAdmin, async (_req, res) => {
    try {
        const config = await obterConfiguracao();
        if (!config.configuradoEm) return res.redirect("/admin/configuracao?onboarding=1");

        const [{ rows: hojeRows }, { rows: urgentesRows }, { rows: preventivosRows }, { rows: clientesRows }, { rows: proximos }] = await Promise.all([
            db.query("SELECT COUNT(*)::int AS total FROM agendamentos WHERE data_hora::date = CURRENT_DATE AND status IN ('confirmado','lembrete_enviado')"),
            db.query("SELECT COUNT(*)::int AS total FROM atendimento_conversas WHERE estado = 'urgente_transferido' AND ultima_interacao > now() - interval '24 hours'"),
            db.query("SELECT COUNT(*)::int AS total FROM manutencoes_realizadas WHERE status = 'pendente_lembrete' AND proxima_data <= CURRENT_DATE + interval '10 days'"),
            db.query("SELECT COUNT(*)::int AS total FROM clientes WHERE deleted_at IS NULL"),
            db.query(
                `SELECT a.id, a.data_hora, a.categoria, a.sintoma, a.status, c.nome AS cliente_nome, v.modelo AS veiculo_modelo
                 FROM agendamentos a
                 JOIN clientes c ON c.id = a.cliente_id
                 LEFT JOIN veiculos v ON v.id = a.veiculo_id
                 WHERE a.status IN ('confirmado', 'lembrete_enviado') AND a.data_hora >= now()
                 ORDER BY a.data_hora ASC LIMIT 20`
            ),
        ]);

        const linhas = proximos
            .map(
                (a: any) =>
                    `<tr>
                        <td>${new Date(a.data_hora).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                        <td>${a.cliente_nome}</td>
                        <td>${a.veiculo_modelo ?? "—"}</td>
                        <td>${a.categoria}</td>
                        <td>${(a.sintoma ?? "").slice(0, 40)}</td>
                    </tr>`
            )
            .join("");

        res.send(
            layout(
                `Painel ${SEGMENTO_LABEL[config.segmento]}`,
                `<h1 style="margin-top:0;">Painel ${SEGMENTO_LABEL[config.segmento]}</h1>
                 <p style="color:#9ca3af;margin-top:-.5rem;">${config.nomeOficina}</p>

                 <div class="grid" style="margin-bottom:1.5rem;">
                    <div class="card"><div class="kpi">${hojeRows[0].total}</div><div class="kpi-label">Agendamentos hoje</div></div>
                    <div class="card"><div class="kpi" style="color:${urgentesRows[0].total > 0 ? "#ef4444" : "#f5f5f5"}">${urgentesRows[0].total}</div><div class="kpi-label">Urgências (24h)</div></div>
                    <div class="card"><div class="kpi" style="color:${preventivosRows[0].total > 0 ? "#3b82f6" : "#f5f5f5"}">${preventivosRows[0].total}</div><div class="kpi-label">Revisões preventivas a lembrar</div></div>
                    <div class="card"><div class="kpi">${clientesRows[0].total}</div><div class="kpi-label">Clientes cadastrados</div></div>
                 </div>

                 <div class="card">
                    <h3 style="margin-top:0;">Próximos agendamentos</h3>
                    <table>
                        <thead><tr><th>Quando</th><th>Cliente</th><th>Veículo</th><th>Categoria</th><th>Relato</th></tr></thead>
                        <tbody>${linhas || '<tr><td colspan="5" style="color:#6b7280;">Nenhum agendamento futuro ainda.</td></tr>'}</tbody>
                    </table>
                 </div>

                 <p style="margin-top:1.5rem;">
                    <a class="sair" href="/admin/manutencao">🔧 Manutenção preventiva</a>
                    &nbsp;·&nbsp;
                    <a class="sair" href="/admin/configuracao">⚙️ Configurações da oficina</a>
                 </p>`
            )
        );
    } catch (erro) {
        console.error("[admin] erro no dashboard:", erro);
        res.status(500).send("Erro ao carregar o painel.");
    }
});

router.get("/manutencao", exigirAdmin, async (req, res) => {
    try {
        const config = await obterConfiguracao();
        const [planos, proximas, { rows: veiculos }] = await Promise.all([
            listarPlanos(config.segmento),
            listarProximas(30),
            db.query<{ id: string; label: string }>(
                `SELECT v.id, (COALESCE(v.marca || ' ', '') || COALESCE(v.modelo, 'veículo') ||
                        ' — ' || c.nome || ' (' || c.telefone || ')') AS label
                 FROM veiculos v
                 JOIN clientes c ON c.id = v.cliente_id
                 WHERE v.deleted_at IS NULL AND c.deleted_at IS NULL
                 ORDER BY v.created_at DESC LIMIT 200`
            ),
        ]);

        const sucesso = req.query.ok ? '<div class="card" style="border-color:#22c55e;">✅ Serviço registrado! O lembrete da próxima revisão já está agendado.</div>' : "";

        const veiculoOpcoes = veiculos.map((v) => `<option value="${v.id}">${v.label}</option>`).join("");
        const planoOpcoes = planos
            .map((p) => {
                const intervalo = [
                    p.intervalo_km ? `${p.intervalo_km.toLocaleString("pt-BR")} km` : null,
                    p.intervalo_meses ? `${p.intervalo_meses} meses` : null,
                ]
                    .filter(Boolean)
                    .join(" ou ");
                return `<option value="${p.id}">${p.nome} (a cada ${intervalo})</option>`;
            })
            .join("");

        const linhas = proximas
            .map((m: any) => {
                const quando = m.proxima_data
                    ? new Date(m.proxima_data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                    : "—";
                const badge =
                    m.status === "lembrete_enviado"
                        ? '<span class="badge" style="background:#22c55e22;color:#22c55e">Lembrete enviado</span>'
                        : '<span class="badge" style="background:#3b82f622;color:#3b82f6">Aguardando</span>';
                return `<tr>
                    <td>${quando}</td>
                    <td>${m.cliente_nome}</td>
                    <td>${m.veiculo_modelo ?? "—"}</td>
                    <td>${m.servico}</td>
                    <td>${badge}</td>
                </tr>`;
            })
            .join("");

        res.send(
            layout(
                "Manutenção preventiva",
                `${sucesso}
                 <h1 style="margin-top:0;">Manutenção preventiva</h1>
                 <p style="color:#9ca3af;margin-top:-.5rem;">Registre um serviço feito e o sistema avisa o cliente sozinho quando estiver na hora da próxima revisão.</p>

                 <div class="card">
                    <h3 style="margin-top:0;">Registrar serviço realizado</h3>
                    ${
                        veiculos.length === 0
                            ? '<p style="color:#9ca3af;">Nenhum veículo cadastrado ainda. Os veículos aparecem aqui automaticamente conforme os clientes chegam pelo WhatsApp.</p>'
                            : `<form method="POST" action="/admin/manutencao/registrar">
                                <label>Veículo</label>
                                <select name="veiculoId" required>${veiculoOpcoes}</select>
                                <label>Serviço realizado</label>
                                <select name="planoId" required>${planoOpcoes}</select>
                                <label>Quilometragem atual (opcional)</label>
                                <input type="number" name="kmAtual" placeholder="Ex: 45000" min="0" />
                                <button type="submit">Registrar e agendar lembrete</button>
                              </form>`
                    }
                 </div>

                 <div class="card">
                    <h3 style="margin-top:0;">Próximas revisões a lembrar</h3>
                    <table>
                        <thead><tr><th>Quando</th><th>Cliente</th><th>Veículo</th><th>Serviço</th><th>Status</th></tr></thead>
                        <tbody>${linhas || '<tr><td colspan="5" style="color:#6b7280;">Nenhuma revisão programada ainda. Registre um serviço acima.</td></tr>'}</tbody>
                    </table>
                 </div>

                 <p style="margin-top:1.5rem;"><a class="sair" href="/admin">← Voltar ao painel</a></p>`
            )
        );
    } catch (erro) {
        console.error("[admin] erro na manutencao:", erro);
        res.status(500).send("Erro ao carregar manutenção preventiva.");
    }
});

router.post("/manutencao/registrar", exigirAdmin, async (req, res) => {
    try {
        const { veiculoId, planoId, kmAtual } = req.body ?? {};
        if (!veiculoId || !planoId) return res.redirect("/admin/manutencao");

        const { rows } = await db.query<{ cliente_id: string }>("SELECT cliente_id FROM veiculos WHERE id = $1", [veiculoId]);
        const clienteId = rows[0]?.cliente_id;
        if (!clienteId) return res.redirect("/admin/manutencao");

        const km = kmAtual ? parseInt(kmAtual, 10) : null;
        await registrarManutencao({ veiculoId, clienteId, planoId, kmAtual: Number.isFinite(km as number) ? km : null });
        res.redirect("/admin/manutencao?ok=1");
    } catch (erro) {
        console.error("[admin] erro ao registrar manutencao:", erro);
        res.status(500).send("Erro ao registrar serviço.");
    }
});

router.get("/configuracao", exigirAdmin, async (req, res) => {
    try {
        const config = await obterConfiguracao();
        const onboarding = req.query.onboarding === "1";

        const opcoes = (["auto_eletrica", "mecanica", "integrado"] as Segmento[])
            .map(
                (s) => `<label style="display:block;border:1px solid #2b2f3a;border-radius:12px;padding:1rem;margin-top:.6rem;cursor:pointer;">
                    <input type="radio" name="segmento" value="${s}" ${config.segmento === s ? "checked" : ""} style="width:auto;display:inline;margin-right:.5rem;" />
                    <b>${SEGMENTO_LABEL[s]}</b>
                    <div style="color:#9ca3af;font-size:.85rem;margin-top:.3rem;">${SEGMENTO_DESCRICAO[s]}</div>
                </label>`
            )
            .join("");

        res.send(
            layout(
                "Configuração da oficina",
                `${onboarding ? '<div class="card" style="border-color:#3b82f6;">👋 Antes de começar, escolha qual sistema sua oficina contratou. Isso muda as perguntas da IA no WhatsApp e o painel abaixo.</div>' : ""}
                 <h1>Configuração da oficina</h1>
                 <form method="POST" action="/admin/configuracao">
                    <label>Qual sistema sua oficina contratou?</label>
                    ${opcoes}

                    <label>Nome da oficina (aparece pro cliente no WhatsApp)</label>
                    <input type="text" name="nomeOficina" value="${config.nomeOficina}" required />

                    <label>WhatsApp para receber avisos (com DDI, ex: 5511999999999)</label>
                    <input type="text" name="whatsappNumero" value="${config.whatsappNumero ?? ""}" placeholder="5511999999999" />
                    <p style="color:#6b7280;font-size:.8rem;margin:.3rem 0 0;">É pra este número que a oficina recebe o aviso de cada novo agendamento e de urgências.</p>

                    <button type="submit">Salvar</button>
                 </form>`
            )
        );
    } catch (erro) {
        console.error("[admin] erro na configuracao:", erro);
        res.status(500).send("Erro ao carregar configuração.");
    }
});

router.post("/configuracao", exigirAdmin, async (req, res) => {
    try {
        const { segmento, nomeOficina, whatsappNumero } = req.body ?? {};
        if (!["auto_eletrica", "mecanica", "integrado"].includes(segmento) || !nomeOficina) {
            return res.redirect("/admin/configuracao");
        }
        await salvarConfiguracao({ segmento, nomeOficina, whatsappNumero });
        res.redirect("/admin");
    } catch (erro) {
        console.error("[admin] erro ao salvar configuracao:", erro);
        res.status(500).send("Erro ao salvar configuração.");
    }
});

// Contagem de nao-lidas -- consumido pelo polling do sininho no layout.
router.get("/notificacoes/count.json", exigirAdmin, async (_req, res) => {
    try {
        const total = await contarNaoLidas();
        res.json({ total });
    } catch (erro) {
        console.error("[admin] erro ao contar notificacoes:", erro);
        res.json({ total: 0 });
    }
});

router.get("/notificacoes", exigirAdmin, async (_req, res) => {
    try {
        const itens = await listarNotificacoes(50);
        await marcarTodasLidas(); // abrir a lista marca tudo como lido

        const ICONE: Record<string, string> = { novo_agendamento: "🗓️", urgencia: "⚠️" };
        const linhas =
            itens
                .map((n) => {
                    const quando = new Date(n.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                    });
                    const titulo = n.link
                        ? `<a href="${n.link}" target="_blank" style="text-decoration:none;">${n.titulo}</a>`
                        : n.titulo;
                    return `<div class="lista-item" style="${n.lida ? "" : "background:#12161f;margin:0 -1.5rem;padding:.6rem 1.5rem;"}">
                        <div>
                            <div><b>${ICONE[n.tipo] ?? "🔔"} ${titulo}</b></div>
                            <div style="color:#9ca3af;font-size:.82rem;margin-top:.15rem;">${n.descricao ?? ""}</div>
                        </div>
                        <div style="color:#6b7280;font-size:.78rem;white-space:nowrap;margin-left:1rem;">${quando}</div>
                    </div>`;
                })
                .join("") || '<p style="color:#6b7280;">Nenhuma notificação ainda.</p>';

        res.send(
            layout(
                "Notificações",
                `<h1 style="margin-top:0;">🔔 Notificações</h1>
                 <p style="color:#9ca3af;margin-top:-.5rem;">Novos agendamentos e urgências que chegam pelo WhatsApp aparecem aqui.</p>
                 <div class="card">${linhas}</div>
                 <p style="margin-top:1.5rem;"><a class="sair" href="/admin">← Voltar ao painel</a></p>`
            )
        );
    } catch (erro) {
        console.error("[admin] erro ao listar notificacoes:", erro);
        res.status(500).send("Erro ao carregar notificações.");
    }
});

const modulo: Modulo = { prefixo: "/admin", router };
export default modulo;
