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

**Multi-tenant desde 01/07/2026** (ver seção dedicada mais abaixo): 1 deploy/banco atende N oficinas ("lojas"), cada uma isolada por `oficina_id`. Antes disso o sistema era single-tenant por deploy (1 instância = 1 oficina) — essa era a arquitetura original, hoje superada pela migration `db/007_multi_tenant.sql`. A tabela `oficinas` (substituiu o singleton `configuracao_oficina`) guarda, por linha, **qual sistema aquela loja contratou**: `auto_eletrica`, `mecanica` ou `integrado`. Esse valor não é só um rótulo — ele muda de verdade:

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
  003_configuracao_oficina.sql     # singleton do segmento contratado (SUPERADO pela 007 — tabela some na 008 futura)
  004_notificacoes_controle.sql    # idempotência dos jobs automáticos
  005_manutencao_preventiva.sql    # planos_manutencao + manutencoes_realizadas
  006_notificacoes_painel.sql      # sininho do painel
  007_multi_tenant.sql             # tabela oficinas + oficina_id em toda tabela tenant-scoped (ver seção Multi-tenant)
scripts/
  seed.js                          # cria super_admin inicial + admin/postos da oficina seed
src/
  core/
    module-registry.ts             # registro genérico de módulos (padrão já existia)
    db.ts                          # Pool do pg compartilhado
    auth.ts                        # JWT (com oficinaId) + middlewares exigirAdmin / exigirSuperAdmin
    config-oficina.ts              # ler/salvar 1 linha de "oficinas" por oficinaId
    segmentos.ts                   # TUDO que muda por segmento (categorias, urgência, perguntas, duração)
    manutencao.ts                  # registrar/listar manutenção preventiva (por oficinaId)
    notificacoes-painel.ts         # sininho do painel (por oficinaId)
    jobs.ts                        # setInterval: roda os 3 jobs POR OFICINA ATIVA
  modules/
    admin/                         # login + painel server-rendered de UMA loja (protegido por JWT em cookie)
    super-admin/                   # login + painel que lista/cria/edita/ativa TODAS as lojas
    agendamento-publico/           # GET /agendamento/:id — página pública de confirmação (mostra nome da loja)
    integracoes/whatsapp-ia/       # webhook Evolution API + máquina de estados da triagem
      evolution-client.ts          # enviar mensagem + extrair payload (v1/v2), no-op se API não configurada
      triagem.ts                   # classificar sintoma (IA com fallback por palavra-chave), por segmento
      agendamento.service.ts       # calcular horários livres + confirmar agendamento (por oficinaId, com re-checagem de corrida)
      conversa.service.ts          # máquina de estados: inicio → dados → sintoma → mídia → período → horário → concluído (por oficinaId)
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

**Onboarding obrigatório**: `oficinas.configurado_em IS NULL` força redirect pra `/admin/configuracao` antes de liberar o painel — a oficina não usa o sistema sem escolher o segmento primeiro. Lojas criadas pelo super-admin (`POST /super-admin/lojas/nova`) já nascem com `configurado_em` preenchido (pulam o onboarding, já que o segmento é escolhido na hora da criação).

---

## Autenticação

- `POST /admin/login` — busca `usuarios` por e-mail (não é mais único globalmente, e sim por `(email, oficina_id)` — a mesma pessoa pode ter conta em 2+ lojas). Verifica `senha_hash` (bcrypt) → gera JWT (8h, payload agora inclui `oficinaId`) → cookie `admin_token` (httpOnly, sameSite=lax, secure em produção). Se o e-mail bater em mais de uma loja ativa, mostra uma tela extra "qual loja é essa?" antes de completar o login.
- `GET /admin/*` protegido por `exigirAdmin` (middleware em `core/auth.ts`) — sem cookie válido, redireciona pra `/admin/login`. Login é bloqueado se a loja do usuário estiver `ativo=false` (desativada pelo super-admin).
- `POST /super-admin/login` — mesma lógica, mas só aceita `usuarios.papel = 'super_admin'` (que sempre tem `oficina_id = NULL`). Protegido por `exigirSuperAdmin`.
- **JWT_SECRET obrigatório em produção** — o app lança erro no boot se não estiver setado (só usa fallback dev fora de `NODE_ENV=production`).
- `usuarios.papel` (`admin`, `atendente`, `mecanico`, `financeiro`, `super_admin`) — o painel admin de loja ainda não distingue por papel dentro da própria loja (qualquer usuário ativo dessa loja pode logar); `super_admin` é o único papel com tratamento de fato diferente (painel próprio, sem `oficina_id`).

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

---

## Notificações de agendamento/urgência (WhatsApp da empresa + sininho do PDV)

Quando a IA confirma um agendamento (ou detecta urgência), a oficina é avisada por **dois canais**:
1. **WhatsApp da empresa** — mensagem com resumo (cliente, veículo, quando, serviço, link) enviada para `configuracao_oficina.whatsapp_numero` (configurável em `/admin/configuracao` — o label deixa claro que é o número que recebe os avisos). Só envia se o número estiver preenchido.
2. **Sininho do painel (PDV)** — grava em `notificacoes_painel`; o top bar do painel mostra um 🔔 com contagem de não-lidas.

- **`db/006_notificacoes_painel.sql`**: `notificacoes_painel` (tipo/titulo/descricao/referencia_id/link/lida). Distinta de `integracao_whatsapp_log` (auditoria de conversa) e `notificacoes_enviadas` (idempotência de jobs) — esta é pro operador ver na tela.
- **`src/core/notificacoes-painel.ts`**: `criarNotificacao`/`contarNaoLidas`/`listar`/`marcarTodasLidas`.
- **`conversa.service.ts` → `notificarEmpresa()`**: helper best-effort chamado no bloco de agendamento confirmado e no de urgência. Grava no painel + envia WhatsApp; nunca deixa falha de notificação quebrar o atendimento.
- **`layout.ts`**: sino no top bar com badge; script de polling a cada 20s bate em `GET /admin/notificacoes/count.json`.
- **`admin/index.ts`**: `GET /admin/notificacoes/count.json` (contagem pro polling) + `GET /admin/notificacoes` (lista e **marca tudo como lido ao abrir**).

Validado em produção: fluxo de agendamento e de urgência disparam os dois canais; sininho conta e zera ao abrir a lista; mensagem completa chega no WhatsApp da empresa. Dados de teste limpos e config resetada pro onboarding.

**Nota sobre o link de confirmação** (`/agendamento/:id`): funciona (testado 200 em produção com UUID real). O `{id}` que aparece na doc é só placeholder — o link real gerado por cada agendamento usa o UUID de verdade. IDs inválidos/inexistentes caem numa página amigável ("Link inválido"/"não encontrado"), não em erro.

---

## Multi-tenant — Fase 1 (01/07/2026): 1 deploy atende N lojas

O usuário pediu pra transformar o sistema (que era 1 deploy = 1 oficina) em multi-loja de verdade, com um painel único listando/criando lojas — no mesmo espírito do super-admin do food-system-Sas-ERP. Implementado em fases: **Fase 1** (esta) = fundação multi-tenant completa (tabela de lojas, super-admin, todo dado isolado por `oficina_id`). **Fase 2** (futura, não implementada) = cada loja com sua própria instância/número Evolution API — hoje ainda existe só 1 WhatsApp por deploy, compartilhado entre todas as lojas.

### O que mudou

- **Tabela `oficinas`** substitui o singleton `configuracao_oficina` (que fica no banco, inerte, até a migration de limpeza `008` rodar). 1 linha por loja: `nome`, `segmento`, `whatsapp_numero`, `ativo`, `configurado_em`.
- **`oficina_id`** adicionado (com `DEFAULT` pro UUID da loja migrada, `'00000000-0000-0000-0000-000000000001'`) em: `usuarios`, `clientes`, `veiculos`, `agendamentos`, `atendimento_conversas`, `notificacoes_painel`, `manutencoes_realizadas`, `postos_trabalho`, `ordens_servico`. **Não** entraram: `notificacoes_enviadas` (idempotência por `referencia_id`, já único) e `planos_manutencao` (catálogo de referência compartilhado entre todas as lojas, filtrado só por `segmento`).
- **`usuarios.papel`** ganhou `'super_admin'` — único papel com `oficina_id IS NULL` (CHECK garante essa coerência). E-mail deixou de ser único globalmente: agora é único por `(email, oficina_id)`, com índice parcial separado pro e-mail de super_admin.
- **`atendimento_conversas`**: `telefone` deixou de ser PK sozinho (2 lojas podem ter cliente com o mesmo número) — virou `UNIQUE(telefone, oficina_id)`.
- **`src/core/jobs.ts`**: os 3 jobs automáticos (lembrete, avaliação pós-serviço, preventiva) agora rodam **em loop por cada oficina ativa**, não mais 1x global.
- **Novo módulo `src/modules/super-admin/`**: login próprio, lista de lojas com KPIs (clientes/agendamentos), criar loja (+ primeiro admin dela na mesma transação), editar loja, ativar/desativar.

### Como acessar (local e produção)

| | URL | Credenciais (seed) |
|---|---|---|
| **Super-admin** (todas as lojas) | `/super-admin/login` | `superadmin@oficina.com` / `SuperAdmin@2026` (env `SEED_SUPERADMIN_EMAIL`/`SEED_SUPERADMIN_SENHA`) |
| **Admin da loja seed** ("Minha Oficina", a que já existia antes da migration) | `/admin/login` | `admin@oficina.com` / `Oficina@2026` (env `SEED_ADMIN_EMAIL`/`SEED_ADMIN_SENHA`) |
| **Lojas novas** | `/admin/login` | credenciais definidas na hora da criação em `/super-admin/lojas/nova` |

Em produção: `https://oficina-api.srv1747711.hstgr.cloud/super-admin/login`. **O link do super-admin não aparece em nenhum menu/UI** — é proposital (persona/login separados do admin de loja); acesse direto pela URL.

### Resolução da oficina no WhatsApp (Fase 1, limitação conhecida)

Como só existe 1 instância Evolution API por deploy, `conversa.service.ts` resolve a oficina de toda mensagem recebida com `SELECT id FROM oficinas ORDER BY created_at ASC LIMIT 1` (sempre a loja mais antiga = a seed). **Se uma 2ª loja for criada, mensagens de WhatsApp dela ainda vão cair na loja seed** até a Fase 2 (roteamento real por instância/número, no padrão `WhatsappConnection` do food-system-Sas-ERP) ser implementada. O resto do sistema (painel, isolamento de dados, jobs) já funciona corretamente pra N lojas — só o roteamento de WhatsApp é single-instância por enquanto.

### Migration 007 — idempotência (bug real encontrado e corrigido)

`ADD CONSTRAINT ... UNIQUE` cria um índice de apoio catalogado como "relation" — colisão de nome ao reexecutar levanta `duplicate_table` (42P07), **não** `duplicate_object` (42710) como as outras constraints. Mesma pegadinha já documentada no projeto irmão pra `CREATE TABLE`. Corrigido no bloco de `atendimento_conversas` (`EXCEPTION WHEN duplicate_object OR duplicate_table`). Validado rodando a migration 3x seguidas sem erro.

### Rollout em produção (dados reais, sem downtime)

1. Backup (`pg_dump`) antes de tudo.
2. Rodar `db/007_multi_tenant.sql` manualmente no Postgres de produção **antes** de deployar o código novo — seguro porque todo `ADD COLUMN` tem `DEFAULT` pro UUID da loja seed, então o código ANTIGO (que não sabe de `oficina_id`) continua funcionando sem quebrar nenhum INSERT durante a janela entre migration e deploy.
3. Conferir contagens de linha antes/depois + `SELECT * FROM oficinas` (1 linha, dados corretos da oficina real).
4. Só então buildar/deployar o código novo (lembrar: `docker compose build --no-cache` manual — botão "Implantar" da UI Hostinger não builda).
5. Rodar `node scripts/seed.js` de novo em produção **uma vez** pós-deploy — cria o `super_admin` inicial (a condição "se não existe nenhum" não disparava antes porque só checava `usuarios` em geral, agora checa especificamente por papel).
6. Smoke test: login do admin atual funciona, dashboard mostra os dados de sempre, 1 mensagem de teste no WhatsApp fim-a-fim, jobs sem duplicar envio.
7. `configuracao_oficina` fica inerte no banco (não apagada) como rede de segurança — só remover numa migration `008` separada, depois de alguns dias estável.

### Validado localmente (01/07/2026)

Migrations 001→007 rodam limpo do zero (Postgres 18 local, fora de Docker — Docker Desktop indisponível na sessão); 007 idempotente (3 execuções). Testado via curl simulando o servidor rodando: login super-admin, listagem de lojas, criação de 2ª e 3ª loja (+ primeiro admin de cada), login da loja nova, **isolamento confirmado** (mensagem de WhatsApp simulada criou cliente só na loja seed, dashboard da 2ª loja permaneceu zerado), bloqueio cross-tenant testado (admin da loja 2 não conseguiu registrar manutenção num veículo da loja seed — silenciosamente rejeitado), toggle ativo/inativo bloqueia login da loja desativada, tela de "escolha sua loja" funciona quando o mesmo e-mail existe em 2+ lojas, página pública `/agendamento/:id` mostra o nome da loja correta.

**Pendente**: aplicar em produção (passos do Rollout acima) — não foi feito nesta sessão, só validado localmente.
