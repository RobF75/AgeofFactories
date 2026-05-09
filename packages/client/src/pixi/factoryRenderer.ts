import { Application, Container, Graphics } from 'pixi.js';
import { FACTORY_TYPES, type FactoryInstance, type Worker } from '@aof/shared';
import { useGameStore } from '../state/gameStore.js';

const TILE_SIZE = 48;

export interface FactoryPixi {
  destroy: () => void;
}

export async function createFactoryPixi(
  container: HTMLElement,
  factoryId: string,
): Promise<FactoryPixi> {
  const app = new Application();
  await app.init({ background: '#181d28', resizeTo: container, antialias: true });
  container.appendChild(app.canvas);

  const initFactory = useGameStore.getState().world?.factories.find((f) => f.id === factoryId);
  const type = initFactory ? FACTORY_TYPES[initFactory.typeId] : null;
  if (!initFactory || !type) {
    return { destroy: () => app.destroy(true, { children: true }) };
  }

  const gridW = type.innerGrid.w;
  const gridH = type.innerGrid.h;
  const totalW = gridW * TILE_SIZE;
  const totalH = gridH * TILE_SIZE;

  const layer = new Container();
  app.stage.addChild(layer);

  const centerLayer = () => {
    layer.x = Math.round((app.screen.width - totalW) / 2);
    layer.y = Math.round((app.screen.height - totalH) / 2);
  };
  centerLayer();
  const onResize = () => centerLayer();
  window.addEventListener('resize', onResize);

  const bg = new Graphics();
  bg.rect(0, 0, totalW, totalH);
  bg.fill({ color: 0x232838 });
  layer.addChild(bg);

  const grid = new Graphics();
  for (let x = 0; x <= gridW; x++) {
    grid.moveTo(x * TILE_SIZE, 0).lineTo(x * TILE_SIZE, totalH);
  }
  for (let y = 0; y <= gridH; y++) {
    grid.moveTo(0, y * TILE_SIZE).lineTo(totalW, y * TILE_SIZE);
  }
  grid.stroke({ width: 1, color: 0x3a4258, alpha: 1 });
  layer.addChild(grid);

  const tilesLayer = new Graphics();
  layer.addChild(tilesLayer);

  const renderTiles = (factory: FactoryInstance) => {
    tilesLayer.clear();
    for (let y = 0; y < factory.innerLayout.length; y++) {
      const row = factory.innerLayout[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        const tile = row[x];
        if (!tile) continue;
        if (tile.kind === 'bay') {
          const isInput = tile.side === 'W';
          tilesLayer.rect(
            x * TILE_SIZE + 4,
            y * TILE_SIZE + 4,
            TILE_SIZE - 8,
            TILE_SIZE - 8,
          );
          tilesLayer.fill({ color: isInput ? 0x3a5a8a : 0x8a5a3a });
        } else if (tile.kind === 'machine') {
          tilesLayer.rect(
            x * TILE_SIZE + 6,
            y * TILE_SIZE + 6,
            TILE_SIZE - 12,
            TILE_SIZE - 12,
          );
          tilesLayer.fill({ color: 0x6a7a4a });
          tilesLayer.stroke({ width: 2, color: 0x9aaa6a });
        }
      }
    }
  };
  renderTiles(initFactory);

  const workerSprite = new Graphics();
  workerSprite.circle(0, 0, TILE_SIZE * 0.2);
  workerSprite.fill({ color: 0xfff066 });
  workerSprite.stroke({ width: 1, color: 0x000000, alpha: 0.4 });
  layer.addChild(workerSprite);

  const carryDot = new Graphics();
  carryDot.circle(0, 0, TILE_SIZE * 0.1);
  carryDot.fill({ color: 0xa46a3a });
  carryDot.visible = false;
  workerSprite.addChild(carryDot);

  const updateWorker = (worker: Worker | null) => {
    if (!worker) {
      workerSprite.visible = false;
      return;
    }
    workerSprite.visible = true;
    workerSprite.x = worker.position.x * TILE_SIZE;
    workerSprite.y = worker.position.y * TILE_SIZE;
    carryDot.visible = worker.carrying !== null;
  };

  const findCurrent = (): { factory: FactoryInstance | null; worker: Worker | null } => {
    const w = useGameStore.getState().world;
    return {
      factory: w?.factories.find((f) => f.id === factoryId) ?? null,
      worker: w?.workers.find((wk) => wk.assignedFactoryId === factoryId) ?? null,
    };
  };

  updateWorker(findCurrent().worker);

  let lastFactoryRef: FactoryInstance | null = initFactory;
  const unsub = useGameStore.subscribe(() => {
    const { factory, worker } = findCurrent();
    if (factory && factory !== lastFactoryRef) {
      renderTiles(factory);
      lastFactoryRef = factory;
    }
    updateWorker(worker);
  });

  return {
    destroy: () => {
      unsub();
      window.removeEventListener('resize', onResize);
      app.destroy(true, { children: true });
    },
  };
}
