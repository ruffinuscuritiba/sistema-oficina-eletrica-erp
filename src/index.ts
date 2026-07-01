import express from "express";
import cookieParser from "cookie-parser";
import { registrarModulos } from "./core/module-registry";
import { iniciarJobsAutomaticos } from "./core/jobs";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // formularios do painel admin
app.use(cookieParser());

// Cada modulo se registra sozinho aqui. Para adicionar um modulo novo:
// 1. crie a pasta em src/modules/<nome-do-modulo>
// 2. exporte um objeto { prefixo, router } a partir de um arquivo index.ts
// 3. adicione uma linha na lista abaixo -- nada mais precisa mudar.
registrarModulos(app, [
    require("./modules/cadastros").default,
    require("./modules/os-estoque").default,
    require("./modules/pdv-financeiro").default,
    require("./modules/localizacao").default,
    require("./modules/integracoes/nfce").default,
    require("./modules/integracoes/pagamento").default,
    require("./modules/integracoes/whatsapp-ia").default,
    require("./modules/agendamento-publico").default,
    require("./modules/admin").default,
]);

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`API da oficina rodando na porta ${PORTA}`);
    iniciarJobsAutomaticos();
});
