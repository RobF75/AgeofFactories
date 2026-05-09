import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { healthRoute } from './routes/health.js';
import { wsRoute } from './routes/ws.js';
import { authRoute } from './routes/auth.js';

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(websocket);
  await app.register(healthRoute);
  await app.register(authRoute);
  await app.register(wsRoute);
  return app;
}
