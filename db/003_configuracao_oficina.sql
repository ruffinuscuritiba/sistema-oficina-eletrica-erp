-- ============================================================================
-- MODULO: CONFIGURACAO DA OFICINA (segmento contratado + dados basicos)
--
-- Cada instancia deployada deste sistema atende UMA oficina (arquitetura de
-- deploy isolado por cliente, nao multi-tenant). Esta tabela e um singleton
-- (sempre 1 linha, id fixo) que guarda qual "sistema" a oficina contratou:
-- auto_eletrica, mecanica ou integrado. O restante da aplicacao (IA de
-- triagem no WhatsApp, painel admin) le esse valor e adapta perguntas,
-- categorias de servico e paineis -- nao e so rotulo, muda comportamento real.
-- ============================================================================

CREATE TABLE configuracao_oficina (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- garante 1 linha so
    segmento        TEXT NOT NULL DEFAULT 'integrado'
                        CHECK (segmento IN ('auto_eletrica', 'mecanica', 'integrado')),
    nome_oficina    TEXT NOT NULL DEFAULT 'Minha Oficina',
    whatsapp_numero TEXT,
    configurado_em  TIMESTAMPTZ, -- NULL = onboarding ainda nao concluido
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO configuracao_oficina (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER trg_configuracao_oficina_updated_at
    BEFORE UPDATE ON configuracao_oficina
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
