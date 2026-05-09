import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { signDevToken } from '../auth/dev.js';
import { findOrCreateUser } from '../db/users.js';

export const authRoute: FastifyPluginAsync = async (app) => {
  if (config.authMode !== 'dev') return;

  app.post('/auth/dev-login', async (req, reply) => {
    const body = (req.body ?? {}) as { displayName?: unknown };
    const displayName =
      typeof body.displayName === 'string' && body.displayName.trim().length > 0
        ? body.displayName.trim()
        : 'Dev Player';

    const authProviderId = `dev-${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const email = `${authProviderId}@dev.local`;

    const user = await findOrCreateUser({ authProviderId, email, displayName });
    const token = signDevToken({ authProviderId, email, displayName });

    return reply.send({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  });
};
