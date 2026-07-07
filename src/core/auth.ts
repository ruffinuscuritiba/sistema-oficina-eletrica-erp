import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

// Sem JWT_SECRET configurado, o app nao deve subir com um segredo previsivel
// em producao -- mas para nao travar o dev local sem .env, usa um fallback
// so quando NODE_ENV !== 'production'.
const JWT_SECRET =
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production" ? undefined : "dev-secret-trocar-em-producao");

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET nao configurado. Defina a variavel de ambiente antes de subir em producao.");
}

export interface TokenPayload {
    usuarioId: string;
    email: string;
    papel: string;
    /** null so para papel = 'super_admin' -- todo outro papel pertence a uma oficina. */
    oficinaId: string | null;
}

export function gerarToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "8h" });
}

export function verificarToken(token: string): TokenPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET as string) as TokenPayload;
    } catch {
        return null;
    }
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            usuario?: TokenPayload;
        }
    }
}

/** Middleware: exige cookie "admin_token" valido. Redireciona pro login se ausente/invalido. */
export function exigirAdmin(req: Request, res: Response, next: NextFunction): void {
    const token = req.cookies?.admin_token;
    const payload = token ? verificarToken(token) : null;

    if (!payload) {
        res.redirect("/admin/login");
        return;
    }

    req.usuario = payload;
    next();
}

/** Middleware: exige cookie "admin_token" valido com papel = 'super_admin'. */
export function exigirSuperAdmin(req: Request, res: Response, next: NextFunction): void {
    const token = req.cookies?.admin_token;
    const payload = token ? verificarToken(token) : null;

    if (!payload || payload.papel !== "super_admin") {
        res.redirect("/super-admin/login");
        return;
    }

    req.usuario = payload;
    next();
}
