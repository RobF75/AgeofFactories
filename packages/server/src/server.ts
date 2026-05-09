import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { healthRoute } from './routes/health.js';
import { wsRoute } from './routes/ws.js';

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(websocket);
  await app.register(healthRoute);
  await app.register(wsRoute);
  return app;
}
