import type { FastifyPluginAsync } from 'fastify';
import type { ClientMessage, ServerMessage } from '@aof/shared';
import { verifyToken } from '../auth/verify.js';
import { findOrCreateUser } from '../db/users.js';
import { loadSave, upsertSave } from '../db/saves.js';

export const wsRoute: FastifyPluginAsync = async (app) => {
  app.get('/ws', { websocket: true }, (socket) => {
    let userId: string | null = null;
    app.log.info('ws client connected');

    const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg));

    socket.on('message', async (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        send({ type: 'error', message: 'invalid json' });
        socket.close();
        return;
      }

      try {
        if (msg.type === 'auth') {
          if (userId) {
            send({ type: 'error', message: 'already authenticated' });
            return;
          }
          const verified = verifyToken(msg.token);
          const user = await findOrCreateUser(verified);
          userId = user.id;
          const save = await loadSave(user.id);
          send({
            type: 'auth-ok',
            user: { id: user.id, email: user.email, displayName: user.displayName },
            save,
          });
          return;
        }

        if (!userId) {
          send({ type: 'error', message: 'not authenticated' });
          socket.close();
          return;
        }

        if (msg.type === 'save') {
          const updatedAt = await upsertSave(userId, msg.state);
          send({ type: 'save-ok', ts: updatedAt.getTime() });
          return;
        }

        send({ type: 'error', message: 'unknown message type' });
      } catch (err) {
        app.log.error(err);
        send({
          type: 'error',
          message: err instanceof Error ? err.message : 'internal error',
        });
      }
    });

    socket.on('close', () => {
      app.log.info({ userId }, 'ws client disconnected');
    });
  });
};
