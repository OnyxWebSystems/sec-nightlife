import { PrismaClient } from '@prisma/client';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import ws from 'ws';

const log =
  process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'];

/**
 * Default: standard PrismaClient (library engine) with DATABASE_URL.
 * Neon pooled URLs work with this in Node and typical serverless Node runtimes.
 *
 * Set USE_NEON_DRIVER_ADAPTER=true only if you need @prisma/adapter-neon; then you must
 * NOT set PRISMA_CLIENT_ENGINE_TYPE=binary (driver adapters require the library engine).
 */
function createPrisma() {
  if (process.env.USE_NEON_DRIVER_ADAPTER === 'true') {
    neonConfig.webSocketConstructor = ws;
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaNeon(pool);
    return new PrismaClient({ adapter, log });
  }
  return new PrismaClient({ log });
}

export const prisma = createPrisma();
