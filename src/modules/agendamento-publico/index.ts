import { Router } from "express";
import type { Modulo } from "../../core/module-registry";
import { db } from "../../core/db";

const router = Router();

const STATUS_LABEL: Record<string, { texto: string; cor: string }> = {
    confirmado: { texto: "Confirmado", cor: "#22c55e" },
    lembrete_enviado: { texto: "Confirmado (lembrete enviado)", cor: "#22c55e" },
    concluido: { texto: "Atendimento concluído", cor: "#3b82f6" },
    cancelado: { texto: "Cancelado", cor: "#ef4444" },
    nao_compareceu: { texto: "Não compareceu", cor: "#ef4444" },
};

function pagina(titulo: string, corpo: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${titulo}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#0A0B0E; color:#f5f5f5; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; padding:1.5rem; }
  main { max-width:420px; width:100%; background:#15171c; border:1px solid #23262e; border-radius:16px; padding:2rem; }
  h1 { font-size:1.4rem; margin:0 0 1rem; }
  .badge { display:inline-block; padding:.3rem .8rem; border-radius:999px; font-size:.8rem; font-weight:600; margin-bottom:1rem; }
  .linha { display:flex; justify-content:space-between; padding:.5rem 0; border-bottom:1px solid #23262e; font-size:.95rem; }
  .linha span:first-child { color:#9ca3af; }
  .rodape { margin-top:1.5rem; font-size:.8rem; color:#6b7280; text-align:center; }
</style>
</head>
<body><main>${corpo}</main></body>
</html>`;
}

router.get("/:id", async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT a.id, a.data_hora, a.periodo, a.status, a.sintoma,
                    c.nome AS cliente_nome, v.modelo AS veiculo_modelo, v.placa AS veiculo_placa,
                    o.nome AS oficina_nome
             FROM agendamentos a
             JOIN clientes c ON c.id = a.cliente_id
             LEFT JOIN veiculos v ON v.id = a.veiculo_id
             JOIN oficinas o ON o.id = a.oficina_id
             WHERE a.id = $1`,
            [req.params.id]
        );

        const ag = rows[0];
        if (!ag) {
            res.status(404).send(
                pagina("Agendamento não encontrado", `<h1>Agendamento não encontrado</h1><p>Confira o link recebido no WhatsApp.</p>`)
            );
            return;
        }

        const status = STATUS_LABEL[ag.status] ?? { texto: ag.status, cor: "#9ca3af" };
        const dataFormatada = new Date(ag.data_hora).toLocaleString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
        });

        res.send(
            pagina(
                "Confirmação de agendamento",
                `<span class="badge" style="background:${status.cor}22; color:${status.cor}">${status.texto}</span>
                 <h1>Olá, ${ag.cliente_nome}!</h1>
                 <div class="linha"><span>Data e hora</span><span>${dataFormatada}</span></div>
                 ${ag.veiculo_modelo ? `<div class="linha"><span>Veículo</span><span>${ag.veiculo_modelo}${ag.veiculo_placa && ag.veiculo_placa !== "A_INFORMAR" ? " · " + ag.veiculo_placa : ""}</span></div>` : ""}
                 <div class="linha"><span>Relato</span><span>${(ag.sintoma ?? "").slice(0, 60)}</span></div>
                 <p class="rodape">${ag.oficina_nome} — precisa remarcar ou cancelar? É só mandar uma mensagem no WhatsApp da oficina.</p>`
            )
        );
    } catch (erro) {
        console.error("[agendamento-publico] erro:", erro);
        res.status(400).send(
            pagina("Link inválido", `<h1>Link inválido</h1><p>Confira o link recebido no WhatsApp.</p>`)
        );
    }
});

const modulo: Modulo = { prefixo: "/agendamento", router };
export default modulo;
