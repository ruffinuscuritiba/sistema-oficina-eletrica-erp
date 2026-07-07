/**
 * Seed inicial: cria o primeiro super_admin (login do painel /super-admin,
 * bootstrap unico -- criar novas lojas depois disso e responsabilidade do
 * painel super-admin), o admin da oficina "seed" (a que ja existia antes da
 * migration multi-tenant, id fixo '00000000-0000-0000-0000-000000000001")
 * e os postos de trabalho padrao dela.
 *
 * Uso: DATABASE_URL=... node scripts/seed.js
 * Senhas customizaveis via env vars (recomendado em producao).
 */
const { Client } = require("pg");
const bcrypt = require("bcryptjs");

const OFICINA_SEED_ID = "00000000-0000-0000-0000-000000000001";

const SEED_SUPERADMIN_EMAIL = process.env.SEED_SUPERADMIN_EMAIL || "superadmin@oficina.com";
const SEED_SUPERADMIN_SENHA = process.env.SEED_SUPERADMIN_SENHA || "SuperAdmin@2026";

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@oficina.com";
const SEED_ADMIN_SENHA = process.env.SEED_ADMIN_SENHA || "Oficina@2026";

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const { rows: superAdminsExistentes } = await client.query(
        "SELECT COUNT(*)::int AS total FROM usuarios WHERE papel = 'super_admin'"
    );
    if (superAdminsExistentes[0].total === 0) {
        const hash = await bcrypt.hash(SEED_SUPERADMIN_SENHA, 10);
        await client.query(
            "INSERT INTO usuarios (nome, email, senha_hash, papel, oficina_id) VALUES ($1, $2, $3, 'super_admin', NULL)",
            ["Super Admin", SEED_SUPERADMIN_EMAIL, hash]
        );
        console.log(`[seed] Super admin criado: ${SEED_SUPERADMIN_EMAIL} / ${SEED_SUPERADMIN_SENHA} (login em /super-admin/login)`);
    } else {
        console.log("[seed] Ja existe super_admin, pulando.");
    }

    const { rows: oficinaExiste } = await client.query("SELECT 1 FROM oficinas WHERE id = $1", [OFICINA_SEED_ID]);
    if (oficinaExiste.length === 0) {
        console.log("[seed] Oficina seed ainda nao existe -- rode a migration 007 antes deste script.");
    } else {
        const { rows: usuariosExistentes } = await client.query(
            "SELECT COUNT(*)::int AS total FROM usuarios WHERE oficina_id = $1",
            [OFICINA_SEED_ID]
        );
        if (usuariosExistentes[0].total === 0) {
            const hash = await bcrypt.hash(SEED_ADMIN_SENHA, 10);
            await client.query(
                "INSERT INTO usuarios (nome, email, senha_hash, papel, oficina_id) VALUES ($1, $2, $3, 'admin', $4)",
                ["Administrador", SEED_ADMIN_EMAIL, hash, OFICINA_SEED_ID]
            );
            console.log(`[seed] Usuario admin criado: ${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_SENHA} (troque a senha apos o primeiro login)`);
        } else {
            console.log("[seed] Ja existem usuarios nessa oficina, pulando criacao do admin.");
        }

        const { rows: postosExistentes } = await client.query(
            "SELECT COUNT(*)::int AS total FROM postos_trabalho WHERE oficina_id = $1",
            [OFICINA_SEED_ID]
        );
        if (postosExistentes[0].total === 0) {
            await client.query(
                "INSERT INTO postos_trabalho (nome, ativo, oficina_id) VALUES ('Elevador 1', true, $1), ('Elevador 2', true, $1)",
                [OFICINA_SEED_ID]
            );
            console.log("[seed] Postos de trabalho padrao criados (Elevador 1, Elevador 2).");
        } else {
            console.log("[seed] Ja existem postos de trabalho, pulando.");
        }
    }

    await client.end();
}

main().catch((erro) => {
    console.error("[seed] Falhou:", erro);
    process.exit(1);
});
