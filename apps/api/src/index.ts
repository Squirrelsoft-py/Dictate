import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadEnv } from './lib/env.js';
import { runMigrations } from './lib/migrations.js';
import { getRedis } from './lib/redis.js';
import { createAuth } from './lib/auth.js';
import { authRoutes } from './routes/auth.js';
import { uploadRoutes } from './routes/uploads.js';
import { tagRoutes } from './routes/tags.js';
import { speakerRoutes } from './routes/speakers.js';
import { jobRoutes } from './routes/jobs.js';
import { progressRoutes } from './routes/progress.js';
import { exportRoutes } from './routes/export.js';

const env = loadEnv();
runMigrations(env);

const redis = getRedis(env);
const auth = createAuth(env);

const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: [env.WEB_ORIGIN],
    credentials: true,
  }),
);

app.get('/health', (c) => c.json({ ok: true, name: 'dictate-api' }));

app.route('/api/auth', authRoutes(auth));
app.route('/api/uploads', uploadRoutes(env, redis, auth));
app.route('/api/tags', tagRoutes(env, auth));
app.route('/api/speakers', speakerRoutes(env, auth));
app.route('/api/jobs', jobRoutes(env, auth));
app.route('/api/progress', progressRoutes(env, auth));
app.route('/api/exports', exportRoutes(env, auth));

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('[api] error:', err);
  return c.json({ error: err.message }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});