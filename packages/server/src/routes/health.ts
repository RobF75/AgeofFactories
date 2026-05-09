import type { FastifyPluginAsync } from 'fastify';

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    ts: Date.now(),
  }));
};
