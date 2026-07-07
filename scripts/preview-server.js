/**
 * Wrapper so pra sessao de preview local (Chrome via Claude). O caminho da
 * pasta do projeto tem "&", que quebra os .cmd shims gerados pelo npm
 * (npx/tsc/ts-node-dev) -- ver nota em CLAUDE.md. Este script contorna isso
 * setando as env vars aqui dentro e requerendo o JS ja compilado em dist/
 * direto via node (evita tambem a resolucao ESM nativa do Node 24 pra .ts).
 *
 * Rodar `tsc` (build) antes de usar este script se o dist/ estiver desatualizado.
 * Nao usar em producao -- e so para rodar localmente durante o preview.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/oficina_preview";
process.env.JWT_SECRET = process.env.JWT_SECRET || "preview-secret-local-nao-usar-em-producao";
process.env.PORT = process.env.PORT || "3099";
process.env.PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3099";

require("../dist/index.js");
