import { buildServer } from './server.js';
import { config } from './config.js';

const server = await buildServer();

try {
  await server.listen({ port: config.port, host: '0.0.0.0' });
  server.log.info(`server listening on http://localhost:${config.port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
