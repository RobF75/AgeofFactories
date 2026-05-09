import type { WorldState } from './world.js';

export interface ClientAuthMessage {
  type: 'auth';
  token: string;
}

export interface ClientSaveMessage {
  type: 'save';
  state: WorldState;
}

export type ClientMessage = ClientAuthMessage | ClientSaveMessage;

export interface AuthUserPayload {
  id: string;
  email: string;
  displayName: string | null;
}

export interface SavePayload {
  state: WorldState;
  updatedAt: number;
}

export interface ServerAuthOkMessage {
  type: 'auth-ok';
  user: AuthUserPayload;
  save: SavePayload | null;
}

export interface ServerSaveOkMessage {
  type: 'save-ok';
  ts: number;
}

export interface ServerErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage = ServerAuthOkMessage | ServerSaveOkMessage | ServerErrorMessage;
