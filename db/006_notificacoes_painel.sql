-- ============================================================================
-- MODULO: NOTIFICACOES DO PAINEL (o "sininho" do PDV)
--
-- Cada evento relevante pro operador da oficina (novo agendamento, urgencia)
-- vira uma linha aqui. O painel admin mostra a contagem de nao-lidas no sino
-- e lista tudo em /admin/notificacoes. Diferente de integracao_whatsapp_log
-- (que e auditoria de conversa) e de notificacoes_enviadas (idempotencia de
-- jobs) -- este e voltado pro operador ver na tela.
-- ============================================================================

CREATE TABLE notificacoes_painel (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo            TEXT NOT NULL,          -- 'novo_agendamento' | 'urgencia'
    titulo          TEXT NOT NULL,
    descricao       TEXT,
    referencia_id   UUID,                   -- id do agendamento, se houver
    link            TEXT,                   -- link pra abrir (ex.: pagina do agendamento)
    lida            BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_painel_nao_lidas ON notificacoes_painel (created_at DESC) WHERE lida = false;
