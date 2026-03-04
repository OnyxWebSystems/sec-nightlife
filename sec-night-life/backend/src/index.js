const PORT = process.env.PORT || 4000;
import { app, logger } from './app.js';

const server = app.listen(PORT, () => {
  logger.info(`SEC Nightlife API started`, {
    port: PORT,
    env: process.env.NODE_ENV || 'development'
  });
});

export default server;
