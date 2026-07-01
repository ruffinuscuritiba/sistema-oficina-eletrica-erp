-- ============================================================================
-- SISTEMA DE GESTAO PARA OFICINA / AUTO ELETRICA
-- Schema PostgreSQL
--
-- ORGANIZACAO: o schema segue a mesma divisao em modulos da arquitetura
-- (cadastros, os_estoque, pdv_financeiro, localizacao, integracoes).
-- Cada bloco pode evoluir sozinho sem quebrar os outros.
--
-- PADROES USADOS EM TODAS AS TABELAS (para facilitar extensao futura):
--   - id UUID como chave primaria (evita expor sequencial, facilita merge
--     de dados se um dia houver mais de uma unidade/CNPJ)
--   - created_at / updated_at em todas as tabelas
--   - deleted_at para soft-delete (nunca apagar historico de OS ou estoque)
--   - metadata JSONB em tabelas centrais: campo "escape hatch" para guardar
--     informacao nova sem precisar de migration -- ex.: preferencias do
--     cliente, dados extras do checklist, config especifica de integracao.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ============================================================================
-- MODULO: CADASTROS (usuarios, clientes, veiculos, mecanicos)
-- ============================================================================

CREATE TABLE usuarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome            TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    senha_hash      TEXT NOT NULL,
    papel           TEXT NOT NULL DEFAULT 'atendente'
                        CHECK (papel IN ('admin', 'atendente', 'mecanico', 'financeiro')),
    ativo           BOOLEAN NOT NULL DEFAULT true,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE clientes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome            TEXT NOT NULL,
    documento       TEXT UNIQUE,              -- CPF ou CNPJ (sem mascara)
    tipo_documento  TEXT CHECK (tipo_documento IN ('cpf', 'cnpj')),
    telefone        TEXT NOT NULL,             -- usado para WhatsApp / IA
    email           TEXT,
    endereco        JSONB DEFAULT '{}',        -- rua, numero, bairro, cidade, uf, cep
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_clientes_telefone ON clientes (telefone) WHERE deleted_at IS NULL;

CREATE TABLE veiculos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id      UUID NOT NULL REFERENCES clientes(id),
    placa           TEXT NOT NULL,
    marca           TEXT,
    modelo          TEXT,
    ano             INTEGER,
    cor             TEXT,
    quilometragem_atual INTEGER,
    metadata        JSONB NOT NULL DEFAULT '{}', -- ex.: chassi, motor, observacoes fixas
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (placa, cliente_id)
);
CREATE INDEX idx_veiculos_placa ON veiculos (placa) WHERE deleted_at IS NULL;

CREATE TABLE mecanicos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID REFERENCES usuarios(id), -- login, se ele acessa o app
    nome            TEXT NOT NULL,
    telefone        TEXT,
    especialidades  TEXT[] NOT NULL DEFAULT '{}', -- ex.: {'eletrica','motor','freios'}
    ativo           BOOLEAN NOT NULL DEFAULT true,
    metadata        JSONB NOT NULL DEFAULT '{}',  -- ex.: comissao, meta mensal
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE fornecedores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome            TEXT NOT NULL,
    documento       TEXT,
    telefone        TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- ============================================================================
-- MODULO: OS & ESTOQUE (o coracao do sistema)
-- ============================================================================

-- Catalogo unico de pecas e servicos (uma OS lanca itens deste catalogo)
CREATE TABLE catalogo_itens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo            TEXT NOT NULL CHECK (tipo IN ('peca', 'servico')),
    codigo          TEXT UNIQUE,             -- codigo interno / SKU (so pecas)
    descricao       TEXT NOT NULL,
    fornecedor_id   UUID REFERENCES fornecedores(id),
    preco_custo     NUMERIC(12,2) DEFAULT 0, -- so pecas
    preco_venda     NUMERIC(12,2) NOT NULL,
    quantidade_estoque INTEGER DEFAULT 0,    -- so pecas; servico fica NULL/0
    quantidade_minima  INTEGER DEFAULT 0,    -- alerta de reposicao
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE ordens_servico (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero          SERIAL UNIQUE,           -- numero sequencial legivel p/ cliente
    veiculo_id      UUID NOT NULL REFERENCES veiculos(id),
    cliente_id      UUID NOT NULL REFERENCES clientes(id),
    mecanico_id     UUID REFERENCES mecanicos(id),
    status          TEXT NOT NULL DEFAULT 'recepcao'
                        CHECK (status IN (
                            'recepcao', 'diagnostico', 'aguardando_aprovacao',
                            'em_execucao', 'concluida', 'entregue', 'cancelada'
                        )),
    diagnostico     TEXT,
    quilometragem_entrada INTEGER,
    data_entrada    TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_previsao   TIMESTAMPTZ,
    data_entrega    TIMESTAMPTZ,
    valor_total     NUMERIC(12,2) NOT NULL DEFAULT 0, -- recalculado via trigger/app
    metadata        JSONB NOT NULL DEFAULT '{}',       -- ex.: origem (leva-e-traz, agendamento)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_os_status ON ordens_servico (status) WHERE status NOT IN ('entregue', 'cancelada');
CREATE INDEX idx_os_veiculo ON ordens_servico (veiculo_id);

-- Historico de status: toda transicao vira um registro (nunca sobrescreve)
CREATE TABLE os_status_historico (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_id           UUID NOT NULL REFERENCES ordens_servico(id),
    status_anterior TEXT,
    status_novo     TEXT NOT NULL,
    usuario_id      UUID REFERENCES usuarios(id),
    observacao      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Itens (pecas e servicos) lancados numa OS -- é aqui que a baixa de estoque acontece
CREATE TABLE os_itens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_id           UUID NOT NULL REFERENCES ordens_servico(id),
    catalogo_item_id UUID NOT NULL REFERENCES catalogo_itens(id),
    quantidade      NUMERIC(10,2) NOT NULL DEFAULT 1,
    preco_unitario  NUMERIC(12,2) NOT NULL, -- snapshot do preco no momento do lancamento
    aprovado_cliente BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Toda entrada/saida de estoque, sempre com origem rastreavel
CREATE TABLE estoque_movimentacao (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalogo_item_id UUID NOT NULL REFERENCES catalogo_itens(id),
    tipo            TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
    quantidade      NUMERIC(10,2) NOT NULL,
    origem_tipo     TEXT NOT NULL CHECK (origem_tipo IN ('os_item', 'venda_balcao', 'compra_fornecedor', 'ajuste_manual')),
    origem_id       UUID, -- id da OS, venda ou compra que gerou o movimento
    usuario_id      UUID REFERENCES usuarios(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_estoque_mov_item ON estoque_movimentacao (catalogo_item_id);

-- Checklist digital de entrada (evita disputa sobre avarias pre-existentes)
CREATE TABLE checklist_veiculo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_id           UUID NOT NULL REFERENCES ordens_servico(id),
    itens           JSONB NOT NULL DEFAULT '[]', -- [{item, conforme, observacao}]
    assinatura_cliente_url TEXT,                 -- url do arquivo de assinatura digital
    assinado_em     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checklist_fotos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id    UUID NOT NULL REFERENCES checklist_veiculo(id),
    url             TEXT NOT NULL,
    descricao       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- MODULO: PDV & FINANCEIRO
-- ============================================================================

CREATE TABLE vendas_balcao (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero          SERIAL UNIQUE,
    cliente_id      UUID REFERENCES clientes(id), -- pode ser venda sem cadastro
    usuario_id      UUID NOT NULL REFERENCES usuarios(id), -- quem atendeu
    valor_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
    forma_pagamento TEXT CHECK (forma_pagamento IN ('dinheiro', 'pix', 'debito', 'credito', 'boleto')),
    nfce_id         UUID, -- referencia ao registro de emissao fiscal, se houver
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE venda_itens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venda_id        UUID NOT NULL REFERENCES vendas_balcao(id),
    catalogo_item_id UUID NOT NULL REFERENCES catalogo_itens(id),
    quantidade      NUMERIC(10,2) NOT NULL DEFAULT 1,
    preco_unitario  NUMERIC(12,2) NOT NULL
);

CREATE TABLE financeiro_lancamentos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo            TEXT NOT NULL CHECK (tipo IN ('a_pagar', 'a_receber')),
    descricao       TEXT NOT NULL,
    valor           NUMERIC(12,2) NOT NULL,
    vencimento      DATE NOT NULL,
    pago_em         TIMESTAMPTZ,
    origem_tipo     TEXT CHECK (origem_tipo IN ('os', 'venda_balcao', 'fornecedor', 'manual')),
    origem_id       UUID,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- MODULO: LOCALIZACAO (posto interno e leva-e-traz externo)
-- ============================================================================

CREATE TABLE postos_trabalho (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome            TEXT NOT NULL, -- ex.: "Elevador 1", "Baia 3"
    ativo           BOOLEAN NOT NULL DEFAULT true
);

-- vincula uma OS a um posto (localizacao interna, sem GPS)
CREATE TABLE os_posto_trabalho (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_id           UUID NOT NULL REFERENCES ordens_servico(id),
    posto_id        UUID NOT NULL REFERENCES postos_trabalho(id),
    ocupado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    liberado_em     TIMESTAMPTZ
);

-- leva-e-traz: localizacao GPS real, fora da oficina
CREATE TABLE leva_e_traz (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_id           UUID NOT NULL REFERENCES ordens_servico(id),
    mecanico_id     UUID REFERENCES mecanicos(id),
    tipo            TEXT NOT NULL CHECK (tipo IN ('busca', 'entrega')),
    latitude        NUMERIC(10,7),
    longitude       NUMERIC(10,7),
    endereco_texto  TEXT,
    foto_url        TEXT,
    concluido_em    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- MODULO: INTEGRACOES (registro de eventos, nao a logica em si)
-- ============================================================================

CREATE TABLE integracao_nfce (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origem_tipo     TEXT NOT NULL CHECK (origem_tipo IN ('os', 'venda_balcao')),
    origem_id       UUID NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'emitida', 'erro', 'cancelada')),
    chave_acesso    TEXT,
    xml_url         TEXT,
    erro_mensagem   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE integracao_pagamento (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origem_tipo     TEXT NOT NULL CHECK (origem_tipo IN ('os', 'venda_balcao')),
    origem_id       UUID NOT NULL,
    metodo          TEXT NOT NULL CHECK (metodo IN ('pix', 'debito', 'credito')),
    status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado')),
    valor           NUMERIC(12,2) NOT NULL,
    gateway_ref     TEXT, -- id da transacao no gateway externo
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- log de toda conversa/evento do atendente de IA no WhatsApp (auditoria + treino futuro)
CREATE TABLE integracao_whatsapp_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id      UUID REFERENCES clientes(id),
    telefone        TEXT NOT NULL,
    direcao         TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
    mensagem        TEXT NOT NULL,
    atendido_por_ia BOOLEAN NOT NULL DEFAULT true,
    escalado_humano BOOLEAN NOT NULL DEFAULT false,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- TRIGGER GENERICO: updated_at automatico (aplicavel a qualquer tabela nova)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_veiculos_updated_at BEFORE UPDATE ON veiculos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_mecanicos_updated_at BEFORE UPDATE ON mecanicos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_catalogo_updated_at BEFORE UPDATE ON catalogo_itens FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_os_updated_at BEFORE UPDATE ON ordens_servico FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- COMO ADICIONAR ALGO NOVO DEPOIS (guia rapido):
--
-- 1. Novo CAMPO numa tabela existente sem migration urgente?
--    -> guarde em "metadata" (JSONB) até decidir se merece coluna propria.
--
-- 2. Novo MODULO inteiro (ex.: agendamento online, fidelidade/pontos)?
--    -> crie um arquivo novo db/002_nome_do_modulo.sql, com suas proprias
--       tabelas referenciando as existentes por UUID. Nao edite este arquivo.
--
-- 3. Nova INTEGRACAO externa (ex.: outro gateway de pagamento)?
--    -> siga o padrao das tabelas integracao_*: uma tabela de log/status
--       que referencia origem_tipo + origem_id, nunca uma FK direta dura.
-- ============================================================================
