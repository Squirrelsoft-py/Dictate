import { loadEnv } from './lib/env.js';
import { startWorker } from './jobs/process-upload.js';

const env = loadEnv();
startWorker(env);

process.on('SIGTERM', () => {
  console.log('[worker] received SIGTERM, shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[worker] received SIGINT, shutting down');
  process.exit(0);
});