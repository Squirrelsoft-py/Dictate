import type { Context, MiddlewareHandler } from 'hono';
import type { Auth } from '../lib/auth.js';

export type Variables = {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
};

export function requireAuth(auth: Auth): MiddlewareHandler<{ Variables: Variables }> {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('user', session.user as Variables['user']);
    c.set('session', session.session as Variables['session']);
    await next();
    return;
  };
}

export type AppContext = Context<{ Variables: Variables }>;