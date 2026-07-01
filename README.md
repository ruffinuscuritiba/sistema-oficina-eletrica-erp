# Sistema de gestao da oficina

Backend modular em Node.js, Express, TypeScript, PostgreSQL e Docker.

## Estrutura

```text
db/schema.sql                          -> schema inicial do banco
src/core/module-registry.ts            -> registro generico dos modulos
src/modules/cadastros/                 -> clientes, veiculos, mecanicos
src/modules/os-estoque/                -> ordens de servico + baixa de estoque
src/modules/pdv-financeiro/            -> venda de balcao, caixa, contas
src/modules/localizacao/               -> posto interno + leva-e-traz
src/modules/integracoes/nfce/          -> emissao de nota fiscal
src/modules/integracoes/pagamento/     -> Pix / cartao
src/modules/integracoes/whatsapp-ia/   -> atendente virtual e notificacoes
```

Cada modulo expoe um `prefixo` de rota e um `router` do Express. O arquivo
`src/index.ts` apenas registra os modulos disponiveis.

## Rodando com Docker

Com o Docker Desktop aberto:

```powershell
docker compose up --build
```

A API fica em:

```text
http://localhost:3000
```

O Postgres sobe junto com:

```text
database: oficina
user: oficina
password: oficina
port: 5432
```

## Rodando localmente

```powershell
npm install
node .\node_modules\typescript\bin\tsc
node dist/index.js
```

Observacao: nesta pasta, `npm run build` pode falhar no Windows porque o nome
do caminho contem `&`. Dentro do Docker isso nao acontece.
