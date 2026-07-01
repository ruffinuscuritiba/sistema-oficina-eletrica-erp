# CLAUDE.md — Sistema Oficina / Auto-Elétrica

Memória técnica resumida do projeto. Consultar **antes** de explorar o código para evitar leituras repetidas.

---

## Stack

- Node.js 20 + TypeScript + Express (sem framework MVC, módulos manuais registrados em `src/index.ts`)
- PostgreSQL (`pg` — Pool direto, sem ORM)
- Autenticação admin: JWT em cookie httpOnly (`jsonwebtoken` + `bcryptjs`)
- WhatsApp: compatível com Evolution API (v1 e v2), sem SDK — `fetch` nativo
- IA opcional: Anthropic Claude (Haiku) para classificar sintomas, com fallback determinístico por palavra-chave quando `ANTHROPIC_API_KEY` não está configurada
- Sem framework de frontend — páginas server-renderizadas (template literals HTML inline) para o painel admin e a página pública de agendamento
- Deploy: Docker Compose, VPS Hostinger compartilhado (`srv1747711.hstgr.cloud`), Traefik como reverse proxy — ver memória `project_multi_vertical_vps.md` do projeto irmão food-system-Sas-ERP para o padrão de labels

---

## Arquitetura

Sistema **single-tenant por deploy**: cada oficina que contrata roda sua própria instância isolada (não é multi-tenant como o food-system-Sas-ERP). A tabela `configuracao_oficina` é um singleton (1 linha fixa) que guarda **qual sistema essa instância roda**: `auto_eletrica`, `mecanica` ou `integrado`. Esse valor não é só um rótulo — ele muda de verdade:

- quais categorias de serviço a IA classifica (`CATEGORIAS_POR_SEGMENTO`)
- quais palavras indicam urgência/emergência (`URGENCIA_POR_SEGMENTO`)
- qual pergunta extra de triagem a IA faz (`PERGUNTA_EXTRA_TRIAGEM`)
- duração padrão do slot de agendamento (`duracaoBaseMinutos`)
- título/conteúdo do painel admin

Tudo isso está centralizado em `src/core/segmentos.ts` — qualquer ajuste de comportamento por segmento deve mexer só ali.

---

## Diferenças reais entre os 3 segmentos (pesquisa de mercado)

| | Auto-Elétrica | Oficina Mecânica | Integrado |
|---|---|---|---|
| Categorias oferecidas | elétrica, outro | revisão, mecânica, outro | todas |
| Pergunta extra de triagem | Luz no painel? Já rodou scanner/diagnóstico? Código de erro? | Km atual? Barulho ao frear/acelerar/virar? | as duas |
| Urgência típica | bateria descarregando, curto-circuito, cheiro de queimado, não liga | sem freio, superaquecimento/fervendo, fumaça no motor, direção travada | união dos dois conjuntos |
| Duração do slot | 60min (diagnóstico é mais rápido) | 90min (desmontagem mecânica) | 60/90min conforme categoria do sintoma |
| Painel ADM | foco em diagnósticos do dia | foco em revisões por km + estoque de peças | os dois |

Serviços NÃO oferecidos por segmento (equipamento/especialidade real, não é filtro artificial):
- **Auto-elétrica** não atende motor, suspensão, câmbio, freios mecânicos, funilaria.
- **Mecânica** não atende diagnóstico de módulos eletrônicos, chicote elétrico, scanner OBD2.
- **Integrado** resolve os dois no mesmo lugar — diferencial de mercado real (cliente não precisa visitar duas oficinas quando o sintoma é ambíguo, ex.: "não liga" pode ser bateria OU motor de arranque preso).

---

## Estrutura de pastas

```
db/
  schema.sql                       # schema base (cadastros, OS, estoque, PDV, localização, integrações)
  002_atendimento_ia.sql           # agendamentos + atendimento_conversas (estado da conversa)
  003_configuracao_oficina.sql     # singleton do segmento contratado
  004_notificacoes_controle.sql    # idempotência dos jobs automáticos
scripts/
  seed.js                          # cria admin inicial + postos de trabalho padrão
src/
  core/
    module-registry.ts             # registro genérico de módulos (padrão já existia)
    db.ts                          # Pool do pg compartilhado
    auth.ts                        # JWT + middleware exigirAdmin
    config-oficina.ts              # ler/salvar configuracao_oficina
    segmentos.ts                   # TUDO que muda por segmento (categorias, urgência, perguntas, duração)
    jobs.ts                        # setInterval: lembrete de agendamento + avaliação pós-serviço
  modules/
    admin/                         # login + painel server-rendered (protegido por JWT em cookie)
    agendamento-publico/           # GET /agendamento/:id — página pública de confirmação
    integracoes/whatsapp-ia/       # webhook Evolution API + máquina de estados da triagem
      evolution-client.ts          # enviar mensagem + extrair payload (v1/v2), no-op se API não configurada
      triagem.ts                   # classificar sintoma (IA com fallback por palavra-chave), por segmento
      agendamento.service.ts       # calcular horários livres + confirmar agendamento (com re-checagem de corrida)
      conversa.service.ts          # máquina de estados: inicio → dados → sintoma → mídia → período → horário → concluído
```

---

## Fluxo de triagem via WhatsApp (máquina de estados)

```
inicio
  ├─ telefone já é cliente conhecido? → aguardando_confirmacao_veiculo (pula nome/carro)
  └─ novo → aguardando_dados (nome + carro em 1 mensagem)
       ↓
aguardando_sintoma (texto livre, sem menu de múltipla escolha)
  ├─ classificarSintoma() detecta URGÊNCIA (por segmento) → urgente_transferido (escalonamento humano imediato, SEM agendamento)
  └─ não urgente → aguardando_midia_ou_pular (pergunta extra por segmento + pede foto opcional)
       ↓
aguardando_periodo (manhã/tarde)
  ↓
aguardando_escolha_horario (até 3 horários REAIS, calculados contra postos_trabalho x agendamentos existentes)
  ↓ (re-checa corrida antes de gravar)
concluido → agendamento criado + link público de confirmação enviado
```

Comando `cancelar` funciona em qualquer estado `concluido` (libera a vaga).

---

## Regras de negócio

**Cliente recorrente**: reconhecido pelo telefone (`clientes.telefone`). Se já tem veículo cadastrado, a IA confirma ("ainda é o Onix 2020?") em vez de pedir tudo de novo.

**Urgência nunca vira agendamento**: se `classificarSintoma` retorna `urgente=true`, o fluxo desvia pra escalonamento humano imediato — não mostra horários, não cria `agendamentos`. Fica registrado em `integracao_whatsapp_log` com `escalado_humano=true`.

**Disponibilidade real de horário**: `capacidadeSimultanea()` conta `postos_trabalho` ativos; um slot só é oferecido se `COUNT(agendamentos nesse horário) < capacidade`. Reconfere no momento da confirmação (evita 2 clientes reservando o mesmo horário simultaneamente) — se perdeu a corrida, recalcula e oferece novos horários automaticamente.

**Idempotência dos jobs automáticos**: lembrete de agendamento consome o próprio `agendamentos.status` (`confirmado` → `lembrete_enviado`, nunca reenvia). Avaliação pós-serviço usa `notificacoes_enviadas (tipo, referencia_id)` com `UNIQUE` — nunca manda duas vezes pra mesma OS.

**Onboarding obrigatório**: `configuracao_oficina.configurado_em IS NULL` força redirect pra `/admin/configuracao` antes de liberar o painel — a oficina não usa o sistema sem escolher o segmento primeiro.

---

## Autenticação

- `POST /admin/login` — verifica `usuarios.senha_hash` (bcrypt) → gera JWT (8h) → cookie `admin_token` (httpOnly, sameSite=lax, secure em produção).
- `GET /admin/*` protegido por `exigirAdmin` (middleware em `core/auth.ts`) — sem cookie válido, redireciona pra `/admin/login`.
- **JWT_SECRET obrigatório em produção** — o app lança erro no boot se não estiver setado (só usa fallback dev fora de `NODE_ENV=production`).
- `usuarios.papel` existe no schema (`admin`, `atendente`, `mecanico`, `financeiro`) mas o painel admin atual não distingue por papel — qualquer usuário ativo pode logar. Se precisar restringir por papel no futuro, o campo já está disponível em `req.usuario.papel` após `exigirAdmin`.

---

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `DATABASE_URL` | conexão Postgres |
| `JWT_SECRET` | obrigatório em produção (login admin) |
| `PUBLIC_URL` | usado para montar o link de confirmação de agendamento |
| `OFICINA_NOME` | fallback do nome da oficina (o valor real vem de `configuracao_oficina`, configurável em `/admin/configuracao`) |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE_NAME` | Evolution API — sem essas 3, `enviarMensagem` vira no-op com log (fluxo continua funcionando, só não manda WhatsApp de verdade) |
| `ANTHROPIC_API_KEY` | opcional — sem ela, classificação de sintoma cai pro fallback por palavra-chave (funciona igual, com menos nuance) |

---

## Convenções

- **Idioma**: PT-BR em mensagens, comentários, UI. Nomes de variáveis/funções também em PT-BR (padrão que o scaffold original já usava — `router`, `Modulo`, `db` em inglês por serem termos técnicos genéricos).
- **Módulo novo**: pasta em `src/modules/<nome>/index.ts` exportando `{ prefixo, router }`, mais uma linha em `src/index.ts`. Documentado no próprio `src/core/module-registry.ts`.
- **Migration nova**: arquivo `db/00N_nome.sql` — nunca editar `schema.sql` (001) direto, conforme o guia já escrito no final desse arquivo.
- **Windows + `&` no nome da pasta**: `npx tsc` quebra por causa do `&` no caminho (`Sistema Oficina & Elétrica-ERP`). Usar `node ./node_modules/typescript/bin/tsc` direto (evita o `.bin` shim que o npx tenta resolver).
- **Segmento**: qualquer mudança de comportamento por `auto_eletrica | mecanica | integrado` deve ficar em `src/core/segmentos.ts`, nunca espalhada pelo código dos módulos.

---

## Testado localmente (01/07/2026)

Ambiente: PostgreSQL 18 local (Windows, fora de Docker — Docker Desktop não estava disponível na sessão), banco `oficina_dev`, usuário `oficina`/`oficina`.

E2E validado via curl simulando payloads Evolution API:
- Login admin (JWT cookie) + redirect de onboarding quando `configuracao_oficina` não configurada
- Configuração de segmento muda o título do painel (`Painel Auto-Elétrica` / `Painel Mecânica`)
- Fluxo completo novo cliente → nome+carro → sintoma → pergunta extra (confirmada diferente por segmento) → foto/pular → período → horários reais (60min elétrica, 90min mecânica) → confirmação com link
- Cliente recorrente reconhecido pelo telefone, sem repetir nome/carro
- Urgência (`sem freio`, `cheiro de queimado`) desvia pra escalonamento, não gera agendamento
- Cancelamento via comando `cancelar` grava `status=cancelado`
- Job de lembrete (agendamento daqui a 30min) e avaliação pós-serviço (OS `entregue`) disparam corretamente e são idempotentes (`notificacoes_enviadas`, `agendamentos.status`)
- Página pública `/agendamento/:id` renderiza status/dados corretos

**Pendente (fora do escopo desta sessão)**: `os-estoque` ainda é scaffold (TODOs, não grava no banco de verdade) — o job de avaliação pós-serviço está pronto e testado, mas só vai disparar de verdade quando as ordens de serviço passarem a ser gravadas via `PATCH /os-estoque/os/:id/status` real (hoje é só stub). Conexão real com WhatsApp (Evolution API + QR code do número da oficina) não foi feita nesta sessão — segue o mesmo procedimento já documentado pro Kely no food-system-Sas-ERP.

---

## Deploy em produção (01/07/2026) — 2 bugs críticos corrigidos

Sistema deployado no VPS compartilhado (`oficina-api.srv1747711.hstgr.cloud`, projeto Docker `/docker/oficina-eletrica-erp/`, container `oficina-eletrica-erp-backend-1` + `oficina-eletrica-postgres`). Dois bugs sérios apareceram só em produção (não reproduziam local) e foram corrigidos:

1. **Handlers `async` sem try/catch derrubavam o processo inteiro**: Express 4 não encaminha rejeição de promise de rota `async` pro error-middleware sozinho. Um erro dentro de `/admin/login` ou `/admin` (ou `/agendamento/:id`) matava o processo Node com `ExitCode=0` (saída "limpa" do ponto de vista do Docker, mas sem log nenhum) e o `restart:unless-stopped` reiniciava o container silenciosamente, causando 502 no Traefik bem na hora do request. **Corrigido**: todos os handlers `async` têm try/catch próprio + error-middleware global (4 args) + `process.on('unhandledRejection'|'uncaughtException')` como última rede de segurança (`src/index.ts`).

2. **Colisão de DNS com outro projeto no mesmo VPS**: o serviço Postgres no `docker-compose.yml` usava o nome genérico `postgres:` (chave do YAML) — só que OUTRO projeto Docker Compose na mesma rede externa `proxy` **também** usa esse nome, e o DNS interno do Docker passou a alternar (round-robin) entre os dois containers Postgres diferentes a cada conexão. Resultado: erro `password authentication failed` **intermitente** (~80% das vezes), porque a conexão ia parar no Postgres errado (de outro sistema). Diagnóstico: `getent hosts postgres` de dentro do container retornava IPs diferentes a cada chamada. **Corrigido**: serviço renomeado para `oficina-postgres:` (nome único), com `depends_on` e `DATABASE_URL` atualizados — ver memória `project_multi_vertical_vps.md` para o procedimento completo (vale pra qualquer projeto futuro nesse VPS).

Depois dos dois fixes: 8/8 requisições consecutivas com `200 OK`, `0` reinícios do container, dado do seed (usuário admin) preservado através da recriação do container.

---

## Manutenção preventiva (a IA traz o cliente de volta sozinha)

Estratégia central de retenção: cada serviço recorrente tem um intervalo de desgaste (por km, por tempo, ou os dois). Quando o serviço é registrado, o sistema já agenda o próximo lembrete; um job diário verifica quem está chegando na hora e a IA dispara uma mensagem consultiva convidando pra revisão. Se o cliente responder, cai no fluxo normal de triagem/agendamento — o ciclo se fecha sozinho.

- **`db/005_manutencao_preventiva.sql`**: `planos_manutencao` (catálogo de tipos recorrentes com `intervalo_km`/`intervalo_meses`/`segmentos[]`/`mensagem_template`, 8 planos seed) + `manutencoes_realizadas` (registro do serviço feito + `proximo_km`/`proxima_data`/`status`).
- **`src/core/manutencao.ts`**: `registrarManutencao()` — **ponto de entrada único**. Calcula `proxima_data = hoje + intervalo_meses` e `proximo_km = km + intervalo_km`. É aqui que o módulo `os-estoque` deve chamar quando uma OS for marcada entregue (hoje é chamado pela tela do admin). `listarPlanos(segmento)` filtra pelos planos aplicáveis ao segmento contratado. `listarProximas()` para o painel.
- **`src/core/jobs.ts` → `enviarLembretesPreventivos()`**: gatilho `proxima_data <= hoje + 10 dias` e `status = 'pendente_lembrete'`. Substitui `{nome}`/`{veiculo}`/`{servico}` no template. Idempotente por dois caminhos (`status → 'lembrete_enviado'` + `notificacoes_enviadas` com `tipo='lembrete_preventivo'`).
- **Painel admin**: `GET /admin/manutencao` (form de registrar serviço com dropdown de veículos + planos do segmento + km, e lista das próximas revisões) + `POST /admin/manutencao/registrar`. KPI "Revisões preventivas a lembrar" no dashboard.

**Planos seed** (intervalos aproximados de praxe): troca_oleo (10.000km/12m), alinhamento (10.000km/12m), pastilha_freio (30.000km/24m), correia_dentada (50.000km/48m), fluido_freio (40.000km/24m) — mecânica/integrado; bateria (30m), revisao_eletrica (20.000km/12m), higienizacao_ar (12m) — elétrica/integrado.

**Nota de estimativa de km**: como a km do veículo só é conhecida no dia de cada serviço (não há telemetria contínua), o gatilho do lembrete é **por tempo** (`proxima_data`); o `proximo_km` fica registrado como referência e aparece na mensagem/painel, mas não dispara sozinho. Se no futuro a km passar a ser atualizada com frequência (ex.: a cada visita), dá pra adicionar um gatilho por km estimada.

Validado local end-to-end: registro calcula próxima data/km corretos, job dispara mensagem personalizada ("Oi Roberto! seu Civic 2019 está chegando na hora da troca de óleo..."), idempotente, e a resposta do cliente reentra na triagem reconhecendo-o como recorrente. Deploy validado em produção (8 planos seed, página renderiza, backend estável).
