import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { AuthenticatedUser } from './types.js';

const ISSUER = 'aof-dev';

export function signDevToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      sub: user.authProviderId,
      email: user.email,
      name: user.displayName ?? '',
    },
    config.devAuthSecret,
    { issuer: ISSUER, expiresIn: '7d' },
  );
}

export function verifyDevToken(token: string): AuthenticatedUser {
  const decoded = jwt.verify(token, config.devAuthSecret, { issuer: ISSUER });
  if (typeof decoded === 'string') throw new Error('invalid token payload');
  const sub = decoded.sub;
  const email = (decoded as { email?: unknown }).email;
  const name = (decoded as { name?: unknown }).name;
  if (typeof sub !== 'string' || typeof email !== 'string') {
    throw new Error('missing required claims');
  }
  return {
    authProviderId: sub,
    email,
    displayName: typeof name === 'string' && name.length > 0 ? name : null,
  };
}
