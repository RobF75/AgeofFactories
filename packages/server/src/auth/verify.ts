import type { AuthenticatedUser } from './types.js';
import { verifyDevToken } from './dev.js';
import { config } from '../config.js';

export function verifyToken(token: string): AuthenticatedUser {
  if (config.authMode === 'dev') return verifyDevToken(token);
  throw new Error('only dev auth is implemented; firebase wiring pending');
}
