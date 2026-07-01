-- ============================================================================
-- MODULO: MANUTENCAO PREVENTIVA (a IA traz o cliente de volta sozinha)
--
-- Ideia: todo servico recorrente (troca de oleo, pastilha de freio, correia
-- dentada, bateria, etc.) tem um intervalo natural de desgaste -- por
-- quilometragem, por tempo, ou os dois. Quando o servico e feito, o sistema
-- ja agenda o proximo lembrete. Um job diario verifica quem esta chegando na
-- hora e a IA manda uma mensagem consultiva convidando pra revisao preventiva.
--
-- Isso muda a IA de "atende quem chama" para "traz o cliente de volta".
-- ============================================================================

-- Catalogo dos tipos de manutencao recorrente e seus intervalos.
-- E reference data: cada oficina pode ajustar depois, mas ja vem com defaults
-- sensatos por segmento.
CREATE TABLE planos_manutencao (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo          TEXT UNIQUE NOT NULL,     -- ex.: 'troca_oleo', 'correia_dentada'
    nome            TEXT NOT NULL,            -- rotulo humano
    intervalo_km    INTEGER,                  -- desgaste por km (NULL = so por tempo)
    intervalo_meses INTEGER,                  -- desgaste por tempo (NULL = so por km)
    segmentos       TEXT[] NOT NULL DEFAULT '{}', -- em quais segmentos faz sentido
    mensagem_template TEXT NOT NULL,          -- {nome} {veiculo} {servico} sao substituidos
    ativo           BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada servico recorrente efetivamente realizado num veiculo. Ao registrar,
-- o app calcula proxima_data (= realizada_em + intervalo_meses) e proximo_km
-- (= km_na_realizacao + intervalo_km). O job de lembrete le daqui.
CREATE TABLE manutencoes_realizadas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veiculo_id      UUID NOT NULL REFERENCES veiculos(id),
    cliente_id      UUID NOT NULL REFERENCES clientes(id),
    plano_id        UUID NOT NULL REFERENCES planos_manutencao(id),
    realizada_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    km_na_realizacao INTEGER,                 -- km do carro no dia do servico
    proximo_km      INTEGER,                  -- alvo estimado da proxima troca
    proxima_data    DATE,                     -- quando lembrar (fonte principal do gatilho)
    status          TEXT NOT NULL DEFAULT 'pendente_lembrete'
                        CHECK (status IN ('pendente_lembrete', 'lembrete_enviado', 'reagendado', 'concluida', 'cancelada')),
    os_id           UUID REFERENCES ordens_servico(id), -- se veio de uma OS real
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_manutencao_proxima ON manutencoes_realizadas (proxima_data) WHERE status = 'pendente_lembrete';
CREATE INDEX idx_manutencao_veiculo ON manutencoes_realizadas (veiculo_id);

CREATE TRIGGER trg_manutencao_updated_at
    BEFORE UPDATE ON manutencoes_realizadas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- SEED: planos padrao (intervalos aproximados de praxe em oficina brasileira).
-- A oficina pode ajustar depois; ON CONFLICT evita duplicar em re-execucao.
-- ============================================================================

INSERT INTO planos_manutencao (codigo, nome, intervalo_km, intervalo_meses, segmentos, mensagem_template) VALUES
('troca_oleo', 'Troca de óleo e filtro', 10000, 12, ARRAY['mecanica','integrado'],
 'Oi {nome}! 🔧 Passando pra lembrar: seu {veiculo} já está chegando na hora da *troca de óleo*. Fazer no tempo certo protege o motor e evita gasto maior lá na frente. Quer que eu veja um horário pra você? É só responder por aqui. 🚗'),

('alinhamento_balanceamento', 'Alinhamento e balanceamento', 10000, 12, ARRAY['mecanica','integrado'],
 'Oi {nome}! 🔧 Faz um tempinho que seu {veiculo} não passa por *alinhamento e balanceamento*. Isso economiza pneu e deixa a direção mais segura. Bora agendar? Responde aqui que eu já vejo um horário.'),

('pastilha_freio', 'Revisão de pastilhas de freio', 30000, 24, ARRAY['mecanica','integrado'],
 'Oi {nome}! ⚠️ Já deu tempo do seu {veiculo} para uma *revisão nos freios* (pastilhas). Freio em dia é segurança que não dá pra deixar pra depois. Quer que eu reserve um horário pra checar? É só responder.'),

('correia_dentada', 'Troca de correia dentada', 50000, 48, ARRAY['mecanica','integrado'],
 'Oi {nome}! 🔧 O seu {veiculo} está entrando na faixa de *troca da correia dentada*. Essa é daquelas que, se romper, o prejuízo é grande — melhor prevenir. Posso agendar uma avaliação pra você?'),

('fluido_freio', 'Troca do fluido de freio', 40000, 24, ARRAY['mecanica','integrado'],
 'Oi {nome}! 🔧 Está na época de trocar o *fluido de freio* do seu {veiculo}. Com o tempo ele perde eficiência e compromete a frenagem. Quer que eu veja um horário? Responde aqui.'),

('bateria', 'Verificação/troca da bateria', NULL, 30, ARRAY['auto_eletrica','integrado'],
 'Oi {nome}! ⚡ A *bateria* do seu {veiculo} já tem um tempo de uso — é a idade em que costuma começar a falhar, principalmente no frio. Bora testar antes de te deixar na mão? Responde aqui que eu agendo.'),

('revisao_eletrica', 'Revisão elétrica geral', 20000, 12, ARRAY['auto_eletrica','integrado'],
 'Oi {nome}! ⚡ Já deu o intervalo de uma *revisão elétrica geral* no seu {veiculo} (alternador, cabos, luzes, partida). Um check-up rápido evita pane na hora errada. Quer agendar? É só responder.'),

('higienizacao_ar', 'Higienização do ar-condicionado', NULL, 12, ARRAY['auto_eletrica','integrado'],
 'Oi {nome}! ❄️ Faz cerca de um ano da última *higienização do ar-condicionado* do seu {veiculo}. Ajuda na saúde de quem anda no carro e no cheiro também. Posso reservar um horário pra você?')
ON CONFLICT (codigo) DO NOTHING;
