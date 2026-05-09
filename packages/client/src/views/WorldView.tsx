import { useEffect, useRef } from 'react';
import { createWorldPixi, type WorldPixi } from '../pixi/worldRenderer.js';

export function WorldView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let pixi: WorldPixi | null = null;

    void createWorldPixi(container).then((p) => {
      if (cancelled) {
        p.destroy();
        return;
      }
      pixi = p;
    });

    return () => {
      cancelled = true;
      pixi?.destroy();
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
