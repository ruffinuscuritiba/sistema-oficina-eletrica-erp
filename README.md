# Sistema de gestão da oficina

Base do projeto, organizada para crescer sem virar um monólito emaranhado.
Cada bloco da arquitetura que já desenhamos virou uma pasta real:

```
db/schema.sql                          -> banco de dados completo, comentado por módulo
src/core/module-registry.ts            -> mecanismo genérico de registro de módulos
src/modules/cadastros/                 -> clientes, veículos, mecânicos
src/modules/os-estoque/                -> ordens de serviço + baixa de estoque
src/modules/pdv-financeiro/            -> venda de balcão, caixa, contas
src/modules/localizacao/               -> posto de trabalho interno + leva-e-traz (GPS)
src/modules/integracoes/nfce/          -> emissão de nota fiscal
src/modules/integracoes/pagamento/     -> Pix / cartão
src/modules/integracoes/whatsapp-ia/   -> atendente virtual e notificações
```

## Por que essa estrutura

Cada módulo expõe só duas coisas: um `prefixo` de rota e um `router` do
Express. O `src/index.ts` não sabe (nem precisa saber) o que tem dentro de
cada módulo — ele só registra a lista. Isso significa que build de um módulo
novo nunca arrisca quebrar os outros.

## Como adicionar algo novo depois

**Um módulo novo inteiro** (ex.: agendamento online, programa de fidelidade):

1. `mkdir src/modules/nome-do-modulo`
2. crie um `index.ts` que exporta `{ prefixo, router }` — copie a estrutura de
   qualquer módulo existente como modelo
3. adicione a linha `require("./modules/nome-do-modulo").default,` em
   `src/index.ts`
4. se precisar de tabelas novas, crie `db/002_nome_do_modulo.sql` — nunca edite
   `db/schema.sql` depois que ele for aplicado em produção; schema é histórico

**Um campo novo numa entidade que já existe:**

Toda tabela central tem uma coluna `metadata JSONB`. Para algo pequeno ou
ainda incerto, guarde ali em vez de sair fazendo `ALTER TABLE` a cada ideia
nova. Quando o campo "assentar" (ficar claro que é permanente e vai ser
consultado/filtrado com frequência), aí sim vale promover para coluna própria
com índice.

**Uma integração externa nova:**

Siga o padrão das tabelas `integracao_*` no schema: uma tabela de log com
`origem_tipo` + `origem_id` genéricos, nunca uma foreign key direta e rígida
para a tabela de origem. Isso deixa a integração plugável — se um dia trocar
de gateway de pagamento ou de provedor de NFC-e, só essa tabela e essa pasta
mudam.

## Próximos passos sugeridos

- Rodar `db/schema.sql` num Postgres local e conectar via `pg`
- Implementar de fato o módulo `os-estoque` (é o único onde a lógica
  transacional — "FOR UPDATE" ao baixar estoque — importa de verdade)
- Trocar os `TODO` dos outros módulos por implementação real, um por vez
