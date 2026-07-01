-- ============================================================================
-- MODULO: CONTROLE DE NOTIFICACOES (idempotencia para jobs automaticos)
--
-- Job de lembrete/avaliacao roda em intervalo (nao e trigger de banco), entao
-- precisa de um jeito de saber "ja mandei essa notificacao?" sem duplicar.
-- Uma tabela pequena e generica evita precisar de coluna nova em cada tabela
-- que ganhar um novo tipo de notificacao automatica no futuro.
-- ============================================================================

CREATE TABLE notificacoes_enviadas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo            TEXT NOT NULL,      -- ex.: 'lembrete_agendamento', 'avaliacao_pos_servico'
    referencia_id   UUID NOT NULL,      -- id do agendamento, da OS, etc.
    enviado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo, referencia_id)
);
