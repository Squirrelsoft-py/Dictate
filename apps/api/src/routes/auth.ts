import { Hono } from 'hono';
import type { Auth } from '../lib/auth.js';
import type { Variables } from '../middleware/auth.js';

export function authRoutes(auth: Auth) {
  const router = new Hono<{ Variables: Variables }>();

  router.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));

  return router;
}