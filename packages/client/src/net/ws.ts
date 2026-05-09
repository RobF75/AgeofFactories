import type { AuthUserPayload, ClientMessage, SavePayload, ServerMessage, WorldState } from '@aof/shared';

const WS_URL = (import.meta.env['VITE_WS_URL'] as string | undefined) ?? 'ws://localhost:3001/ws';

export interface WsClientHandlers {
  onAuthOk: (user: AuthUserPayload, save: SavePayload | null) => void;
  onSaveOk: (ts: number) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

export class WsClient {
  private ws: WebSocket | null = null;

  connect(token: string, handlers: WsClientHandlers) {
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.send({ type: 'auth', token });
    });
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      const msg = JSON.parse(ev.data) as ServerMessage;
      switch (msg.type) {
        case 'auth-ok':
          handlers.onAuthOk(msg.user, msg.save);
          break;
        case 'save-ok':
          handlers.onSaveOk(msg.ts);
          break;
        case 'error':
          handlers.onError(msg.message);
          break;
      }
    });
    ws.addEventListener('close', () => {
      handlers.onClose();
    });
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  saveState(state: WorldState) {
    this.send({ type: 'save', state });
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }
}
