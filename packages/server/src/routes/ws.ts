import type { FastifyPluginAsync } from 'fastify';

export const wsRoute: FastifyPluginAsync = async (app) => {
  app.get('/ws', { websocket: true }, (socket) => {
    app.log.info('ws client connected');
    socket.send(JSON.stringify({ type: 'hello', ts: Date.now() }));

    socket.on('message', (raw: Buffer) => {
      const text = raw.toString();
      app.log.info({ raw: text }, 'ws message received');
      socket.send(JSON.stringify({ type: 'echo', payload: text }));
    });

    socket.on('close', () => {
      app.log.info('ws client disconnected');
    });
  });
};
