import { Express, Router } from "express";

export interface Modulo {
    /** Prefixo de rota do modulo, ex.: "/cadastros" */
    prefixo: string;
    /** Router do Express com as rotas do modulo */
    router: Router;
}

/**
 * Registra uma lista de modulos na aplicacao.
 *
 * Isso existe para que src/index.ts nunca precise saber COMO cada modulo
 * funciona por dentro -- só que ele expõe um prefixo e um router.
 * Assim, um módulo novo (ex.: "agendamento-online" ou "fidelidade")
 * se pluga sem exigir nenhuma mudança em código já existente.
 */
export function registrarModulos(app: Express, modulos: Modulo[]): void {
    for (const modulo of modulos) {
        app.use(modulo.prefixo, modulo.router);
        console.log(`Modulo registrado: ${modulo.prefixo}`);
    }
}
