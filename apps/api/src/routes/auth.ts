import { Hono } from 'hono';
import type { Auth } from '../lib/auth.js';
import type { Variables } from '../middleware/auth.js';

export function authRoutes(auth: Auth) {
  const router = new Hono<{ Variables: Variables }>();

  // Mounted at /api/auth in the parent app, so relative match is '/*'.
  // Better-Auth's default basePath is /api/auth, so the full request
  // (e.g. /api/auth/sign-up/email) reaches this handler with the right
  // path intact in c.req.raw.
  router.on(['GET', 'POST'], '/*', (c) => auth.handler(c.req.raw));

  return router;
}