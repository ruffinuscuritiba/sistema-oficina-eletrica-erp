import { Pool } from "pg";

/**
 * Pool unico de conexoes, compartilhado por todos os modulos.
 * DATABASE_URL vem do docker-compose (local) ou das env vars do VPS (prod).
 */
export const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});
