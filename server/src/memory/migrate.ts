import { ensureSchema, closePool } from './db.js';

/**
 * One-shot migration runner: create the memory schema, then close the pool.
 * Run via `npm run migrate`.
 */
async function main(): Promise<void> {
  await ensureSchema();
  console.log('[migrate] nicole2_memory schema ensured.');
  await closePool();
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exitCode = 1;
  void closePool();
});
