-- ============================================================================
-- MODULO: ATENDIMENTO IA (triagem e agendamento via WhatsApp)
--
-- Segue a orientacao do schema.sql: modulo novo = arquivo novo, sem editar
-- 001. Referencia clientes/veiculos/ordens_servico so por UUID.
-- ============================================================================

-- Uma vaga reservada pelo fluxo de triagem. Vira uma OS de verdade so quando
-- o carro chega fisicamente na oficina (os_id fica NULL ate la).
CREATE TABLE agendamentos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id      UUID NOT NULL REFERENCES clientes(id),
    veiculo_id      UUID REFERENCES veiculos(id), -- pode ser NULL se o cliente nao informou ainda
    data_hora       TIMESTAMPTZ NOT NULL,
    periodo         TEXT NOT NULL CHECK (periodo IN ('manha', 'tarde')),
    categoria       TEXT NOT NULL CHECK (categoria IN ('revisao', 'eletrica', 'mecanica', 'outro')),
    sintoma         TEXT NOT NULL,               -- descricao livre do cliente
    urgente         BOOLEAN NOT NULL DEFAULT false, -- true = sintoma de risco (nao liga, freio, fumaca)
    midia_url       TEXT,                        -- foto do painel / audio do barulho, se enviado
    status          TEXT NOT NULL DEFAULT 'confirmado'
                        CHECK (status IN ('confirmado', 'lembrete_enviado', 'concluido', 'cancelado', 'nao_compareceu')),
    os_id           UUID REFERENCES ordens_servico(id), -- preenchido quando a OS e aberta na chegada
    origem          TEXT NOT NULL DEFAULT 'whatsapp_ia',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agendamentos_data ON agendamentos (data_hora) WHERE status IN ('confirmado', 'lembrete_enviado');
CREATE INDEX idx_agendamentos_cliente ON agendamentos (cliente_id);

-- Estado da conversa de WhatsApp por telefone (a IA le/escreve aqui a cada mensagem).
-- Nao e log -- e o "cursor" atual da conversa. O log de mensagens continua
-- em integracao_whatsapp_log (001), que ja existe pra auditoria.
CREATE TABLE atendimento_conversas (
    telefone        TEXT PRIMARY KEY,
    cliente_id      UUID REFERENCES clientes(id),   -- preenchido assim que reconhecido/criado
    estado          TEXT NOT NULL DEFAULT 'inicio',
    contexto        JSONB NOT NULL DEFAULT '{}',    -- dados coletados no meio do fluxo (nome, veiculo, sintoma...)
    ultima_interacao TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_agendamentos_updated_at BEFORE UPDATE ON agendamentos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Regras de capacidade (aplicadas em app, nao em SQL):
--   - "postos_trabalho" ativos definem quantos agendamentos cabem no mesmo
--     horario. Ex.: 3 elevadores ativos = ate 3 agendamentos simultaneos.
--   - Sintomas urgentes (nao liga, freio, fumaca/cheiro de queimado) NAO
--     passam por aqui -- viram atendimento imediato/escalonamento humano.
-- ============================================================================
