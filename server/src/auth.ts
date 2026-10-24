import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string | null;
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
const domain = () => process.env.AUTH0_DOMAIN;
const audience = () => process.env.AUTH0_AUDIENCE;

export const authConfigured = () => Boolean(domain() && audience());

async function verify(token: string): Promise<string | null> {
  if (!authConfigured()) return null;
  jwks ??= createRemoteJWKSet(new URL(`https://${domain()}/.well-known/jwks.json`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${domain()}/`, audience: audience() });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

const bearer = (req: Request) => req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ?? null;

/** Sets req.userId when a valid token is present; otherwise the request stays anonymous. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const t = bearer(req);
  req.userId = t ? await verify(t) : null;
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const t = bearer(req);
  const sub = t ? await verify(t) : null;
  if (!sub) return res.status(401).json({ error: "Log in to use this." });
  req.userId = sub;
  next();
}
