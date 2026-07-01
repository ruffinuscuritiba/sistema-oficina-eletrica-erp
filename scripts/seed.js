/**
 * Seed inicial: cria o primeiro usuario admin (se ainda nao existir nenhum)
 * e os postos de trabalho padrao (se a tabela estiver vazia).
 *
 * Uso: DATABASE_URL=... node scripts/seed.js
 * A senha pode ser customizada via SEED_ADMIN_SENHA (recomendado em producao).
 */
const { Client } = require("pg");
const bcrypt = require("bcryptjs");

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@oficina.com";
const SEED_ADMIN_SENHA = process.env.SEED_ADMIN_SENHA || "Oficina@2026";

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const { rows: usuariosExistentes } = await client.query("SELECT COUNT(*)::int AS total FROM usuarios");
    if (usuariosExistentes[0].total === 0) {
        const hash = await bcrypt.hash(SEED_ADMIN_SENHA, 10);
        await client.query("INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES ($1, $2, $3, 'admin')", [
            "Administrador",
            SEED_ADMIN_EMAIL,
            hash,
        ]);
        console.log(`[seed] Usuario admin criado: ${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_SENHA} (troque a senha apos o primeiro login)`);
    } else {
        console.log("[seed] Ja existem usuarios, pulando criacao do admin.");
    }

    const { rows: postosExistentes } = await client.query("SELECT COUNT(*)::int AS total FROM postos_trabalho");
    if (postosExistentes[0].total === 0) {
        await client.query("INSERT INTO postos_trabalho (nome, ativo) VALUES ('Elevador 1', true), ('Elevador 2', true)");
        console.log("[seed] Postos de trabalho padrao criados (Elevador 1, Elevador 2).");
    } else {
        console.log("[seed] Ja existem postos de trabalho, pulando.");
    }

    await client.end();
}

main().catch((erro) => {
    console.error("[seed] Falhou:", erro);
    process.exit(1);
});
