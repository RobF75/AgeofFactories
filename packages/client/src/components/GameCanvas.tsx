import { useEffect, useRef } from 'react';
import type { Application } from 'pixi.js';
import { createPixiApp } from '../pixi/createApp.js';

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let app: Application | null = null;
    let cancelled = false;

    void createPixiApp(container).then((created) => {
      if (cancelled) {
        created.destroy(true, { children: true });
        return;
      }
      app = created;
    });

    return () => {
      cancelled = true;
      if (app) {
        app.destroy(true, { children: true });
        app = null;
      }
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
