-- ============================================================================
-- MULTI-TENANT: transforma "1 deploy = 1 oficina" em "N oficinas (lojas)
-- geridas por um super-admin", sem quebrar a oficina que ja esta em producao.
--
-- ESTA E A PRIMEIRA MIGRATION QUE ALTERA TABELAS EXISTENTES (002-006 so
-- criavam tabelas novas) -- por isso todo passo aqui e defensivo (guardas de
-- information_schema/pg_constraint), pensado pra rodar com seguranca tanto
-- em banco novo (fresh install, via docker-entrypoint-initdb.d) quanto
-- reaplicado manualmente em producao com dados reais.
--
-- ORDEM IMPORTA:
--   1. cria "oficinas" (substitui o singleton "configuracao_oficina")
--   2. migra a linha unica de configuracao_oficina pra dentro de oficinas,
--      usando um UUID CONSTANTE (nao aleatorio) -- assim os passos seguintes
--      podem referenciar essa oficina como DEFAULT de coluna, sem subquery.
--   3. adiciona oficina_id em toda tabela tenant-scoped, JA com
--      "NOT NULL DEFAULT <uuid constante>" no mesmo ALTER -- desde o
--      Postgres 11 isso e uma operacao metadata-only (nao reescreve a
--      tabela) e, mais importante: cobre o app ANTIGO que continuar
--      rodando entre esta migration e o deploy do codigo novo (ele faz
--      INSERT sem citar oficina_id -- sem o DEFAULT, todo INSERT quebraria).
--   4. ajustes de unicidade (email por oficina, telefone por oficina).
--
-- "configuracao_oficina" NAO e apagada aqui -- fica inerte como rede de
-- seguranca de rollback. Uma migration separada (008) remove depois de
-- validar producao estavel por alguns dias.
-- ============================================================================

-- Oficina "seed" -- a que ja existe em qualquer instalacao hoje (a linha
-- id=1 de configuracao_oficina sempre existe, inserida pela migration 003).
-- Usar um UUID fixo (nao gen_random_uuid()) torna esta migration idempotente
-- e permite referencia-lo como DEFAULT abaixo sem subquery.
-- (constante usada em todo este arquivo: '00000000-0000-0000-0000-000000000001')

CREATE TABLE IF NOT EXISTS oficinas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome            TEXT NOT NULL,
    segmento        TEXT NOT NULL DEFAULT 'integrado'
                        CHECK (segmento IN ('auto_eletrica', 'mecanica', 'integrado')),
    whatsapp_numero TEXT,
    ativo           BOOLEAN NOT NULL DEFAULT true,
    configurado_em  TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    CREATE TRIGGER trg_oficinas_updated_at
        BEFORE UPDATE ON oficinas
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- Migra a linha singleton pra dentro de oficinas, preservando os dados reais
-- ja configurados (nome, segmento, whatsapp) em vez de resetar pra default.
INSERT INTO oficinas (id, nome, segmento, whatsapp_numero, ativo, configurado_em, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000001'::uuid,
       nome_oficina, segmento, whatsapp_numero, true, configurado_em, created_at, updated_at
FROM configuracao_oficina
WHERE id = 1
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- oficina_id em toda tabela tenant-scoped.
-- Padrao repetido: guarda por information_schema (idempotente), depois
-- ADD COLUMN ... NOT NULL DEFAULT <constante> REFERENCES oficinas(id).
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'usuarios' AND column_name = 'oficina_id'
    ) THEN
        ALTER TABLE usuarios
            ADD COLUMN oficina_id UUID REFERENCES oficinas(id)
                DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
        -- NOT NULL fica de fora aqui de proposito: super_admin tem oficina_id
        -- NULL (ver constraint mais abaixo). Usuarios normais ganham o
        -- default acima; a coerencia papel/oficina_id e garantida pelo CHECK.
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clientes' AND column_name = 'oficina_id'
    ) THEN
        ALTER TABLE clientes
            ADD COLUMN oficina_id UUID NOT NULL REFERENCES oficinas(id)
                DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'veiculos' AND column_name = 'oficina_id'
    ) THEN
        ALTER TABLE veiculos
            ADD COLUMN oficina_id UUID NOT NULL REFERENCES oficinas(id)
                DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agendamentos' AND column_name = 'oficina_id'
    ) THEN
        ALTER TABLE agendamentos
            ADD COLUMN oficina_id UUID NOT NULL REFERENCES oficinas(id)
                DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'atendimento_conversas' AND column_name = 'oficina_id'
    ) THEN
        ALTER TABLE atendimento_conversas
            ADD COLUMN oficina_id UUID NOT NULL REFERENCES oficinas(id)
                DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notificacoes_painel' AND column_name = 'oficina_id'
    ) THEN
        ALTER TABLE notificacoes_painel
            ADD COLUMN oficina_id UUID NOT NULL REFERENCES oficinas(id)
                DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'manutencoes_realizadas' AND column_name = 'oficina_id'
    ) THEN
        ALTER TABLE manutencoes_realizadas
            ADD COLUMN oficina_id UUID NOT NULL REFERENCES oficinas(id)
                DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'postos_trabalho' AND column_name = 'oficina_id'
    ) THEN
        ALTER TABLE postos_trabalho
            ADD COLUMN oficina_id UUID NOT NULL REFERENCES oficinas(id)
                DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
END $$;

-- ordens_servico nao estava no escopo original (modulo os-estoque, fora do
-- atendimento-ia/admin) mas src/core/jobs.ts::enviarAvaliacoesPosServico
-- consulta esta tabela direto -- sem oficina_id o job per-oficina nao
-- consegue filtrar corretamente. planos_manutencao fica de fora (catalogo
-- de referencia compartilhado entre todas as lojas, filtrado por segmento).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ordens_servico' AND column_name = 'oficina_id'
    ) THEN
        ALTER TABLE ordens_servico
            ADD COLUMN oficina_id UUID NOT NULL REFERENCES oficinas(id)
                DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
END $$;

-- ============================================================================
-- usuarios: papel 'super_admin' + coerencia com oficina_id + email unico
-- por oficina (era global).
-- ============================================================================

DO $$
BEGIN
    ALTER TABLE usuarios DROP CONSTRAINT usuarios_papel_check;
EXCEPTION WHEN undefined_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_papel_check
        CHECK (papel IN ('admin', 'atendente', 'mecanico', 'financeiro', 'super_admin'));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_oficina_coerencia_check
        CHECK (
            (papel = 'super_admin' AND oficina_id IS NULL) OR
            (papel != 'super_admin' AND oficina_id IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE usuarios DROP CONSTRAINT usuarios_email_key;
EXCEPTION WHEN undefined_object THEN
    NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email_oficina
    ON usuarios (email, oficina_id) WHERE oficina_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email_super_admin
    ON usuarios (email) WHERE papel = 'super_admin';

-- ============================================================================
-- atendimento_conversas: telefone deixa de ser globalmente unico (2 lojas
-- podem legitimamente ter o mesmo numero como cliente). Sem ON CONFLICT
-- (telefone) no codigo (confirmado em conversa.service.ts -- e um
-- SELECT-then-INSERT manual), entao trocar a PK e seguro mesmo com o app
-- antigo ainda rodando.
-- ============================================================================

DO $$
BEGIN
    ALTER TABLE atendimento_conversas DROP CONSTRAINT atendimento_conversas_pkey;
EXCEPTION WHEN undefined_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE atendimento_conversas
        ADD CONSTRAINT uq_atendimento_conversas_telefone_oficina UNIQUE (telefone, oficina_id);
-- UNIQUE cria um indice de apoio (catalogado como "relation"): colisao de
-- nome levanta duplicate_table (42P07), nao duplicate_object (42710) --
-- mesma pegadinha ja documentada no projeto irmao pra CREATE TABLE.
EXCEPTION WHEN duplicate_object OR duplicate_table THEN
    NULL;
END $$;

-- ============================================================================
-- Indices compostos (oficina_id como coluna lider) -- mantem os planos de
-- consulta eficientes agora que varias lojas compartilham as mesmas tabelas.
-- ============================================================================

DROP INDEX IF EXISTS idx_clientes_telefone;
CREATE INDEX IF NOT EXISTS idx_clientes_oficina_telefone
    ON clientes (oficina_id, telefone) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_veiculos_placa;
CREATE INDEX IF NOT EXISTS idx_veiculos_oficina_placa
    ON veiculos (oficina_id, placa) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_agendamentos_data;
CREATE INDEX IF NOT EXISTS idx_agendamentos_oficina_data
    ON agendamentos (oficina_id, data_hora) WHERE status IN ('confirmado', 'lembrete_enviado');
