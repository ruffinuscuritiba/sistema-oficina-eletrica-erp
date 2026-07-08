import express from "express";
import cookieParser from "cookie-parser";
import { registrarModulos } from "./core/module-registry";
import { iniciarJobsAutomaticos } from "./core/jobs";

// Rede de seguranca: Express 4 nao encaminha erros de handlers "async" para o
// error-middleware sozinho -- sem isso, uma promise rejeitada nao tratada
// dentro de uma rota derruba o processo inteiro (o container reinicia sem log
// nenhum). Cada rota que mexe no banco tambem tem try/catch proprio; isto e
// so a ultima linha de defesa.
process.on("unhandledRejection", (motivo) => {
    console.error("[unhandledRejection]", motivo);
});
process.on("uncaughtException", (erro) => {
    console.error("[uncaughtException]", erro);
});

const app = express();

// CORS so para a API JSON (/api/*), consumida pelo frontend Next.js
// desacoplado (outro dominio). Sem "Access-Control-Allow-Credentials": a
// autenticacao dessa API e via header "Authorization: Bearer", nao cookie --
// nao precisa (nem deve) marcar como credentialed. As rotas HTML antigas
// (/admin, /super-admin) continuam sem CORS, do jeito que sempre estiveram.
const ORIGENS_PERMITIDAS = (process.env.FRONTEND_ORIGINS ?? "http://localhost:3000,https://sistema-oficina-eletrica-erp.vercel.app")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

app.use("/api", (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ORIGENS_PERMITIDAS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    next();
});

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
    require("./modules/super-admin").default,
    require("./modules/api").default,
]);

// Error handler global (4 argumentos = Express reconhece como middleware de erro).
// Fica depois de todos os modulos -- pega qualquer erro que escapou dos try/catch locais.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[erro nao tratado]", err);
    if (!res.headersSent) res.status(500).json({ erro: "Erro interno" });
});

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`API da oficina rodando na porta ${PORTA}`);
    iniciarJobsAutomaticos();
});
