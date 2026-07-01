import express from "express";
import { registrarModulos } from "./core/module-registry";

const app = express();
app.use(express.json());

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
]);

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`API da oficina rodando na porta ${PORTA}`);
});
