import { app } from '../src/app.js';

// Vercel Node.js Serverless entrypoint.
// Reuse the shared Express app so Prisma/Neon pool are shared across invocations.
export default app;

