import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import {
  FACTORY_TYPES,
  MACHINE_TYPES,
  isPerimeterTile,
  type FactoryInstance,
  type Machine,
  type Worker,
} from '@aof/shared';
import { useGameStore } from '../state/gameStore.js';

const ISO_RATIO = 2;

function isoToScreen(tx: number, ty: number, tileW: number): { x: number; y: number } {
  const tileH = tileW / ISO_RATIO;
  return { x: (tx - ty) * (tileW / 2), y: (tx + ty) * (tileH / 2) };
}

function isoToTile(sx: number, sy: number, tileW: number): { x: number; y: number } {
  const tileH = tileW / ISO_RATIO;
  const a = sx / (tileW / 2);
  const b = sy / (tileH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

function isoDiamond(
  tx: number,
  ty: number,
  w: number,
  h: number,
  tileW: number,
): number[] {
  const top = isoToScreen(tx, ty, tileW);
  const right = isoToScreen(tx + w, ty, tileW);
  const bottom = isoToScreen(tx + w, ty + h, tileW);
  const left = isoToScreen(tx, ty + h, tileW);
  return [top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y];
}

const CHARACTER_KEYS = [
  'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r',
] as const;

function pickCharacterFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return CHARACTER_KEYS[Math.abs(hash) % CHARACTER_KEYS.length] ?? CHARACTER_KEYS[0];
}

const MACHINE_SPRITE_URL = '/sprites/factories/machine.png';
const DOOR_SPRITE_URL = '/sprites/factories/door.png';

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

  const characterTextures = new Map<string, Texture>();
  let machineTexture: Texture = Texture.EMPTY;
  let doorTexture: Texture = Texture.EMPTY;
  await Promise.all([
    ...CHARACTER_KEYS.map(async (key) => {
      const tex = await Assets.load<Texture>(`/sprites/characters/character-${key}.png`);
      characterTextures.set(key, tex);
    }),
    (async () => {
      machineTexture = await Assets.load<Texture>(MACHINE_SPRITE_URL);
    })(),
    (async () => {
      doorTexture = await Assets.load<Texture>(DOOR_SPRITE_URL);
    })(),
  ]);

  // Iso world spans (gridW+gridH) tile-half-widths horizontally and the same
  // span as half that vertically. Pick tileSize that fits the canvas.
  const computeTileSize = () => {
    const padding = 24;
    const availW = Math.max(1, app.screen.width - padding * 2);
    const availH = Math.max(1, app.screen.height - padding * 2);
    const span = gridW + gridH;
    const byW = (2 * availW) / span;
    const byH = (4 * availH) / span;
    return Math.max(12, Math.min(80, Math.floor(Math.min(byW, byH))));
  };
  let tileSize = computeTileSize();

  const stage = app.stage;
  stage.eventMode = 'static';
  stage.hitArea = app.screen;

  const layer = new Container();
  app.stage.addChild(layer);

  // Center the iso diamond in the canvas. Layer origin is the diamond's top
  // corner; bottom corner sits (gridW+gridH)*tileH/2 below that.
  const recenter = () => {
    tileSize = computeTileSize();
    const span = gridW + gridH;
    const totalH = (span * tileSize) / 4;
    layer.x = Math.round(app.screen.width / 2 + ((gridH - gridW) * tileSize) / 4);
    layer.y = Math.round((app.screen.height - totalH) / 2);
  };
  recenter();

  const bgLayer = new Graphics();
  layer.addChild(bgLayer);

  const gridLayer = new Graphics();
  layer.addChild(gridLayer);

  const baysLayer = new Container();
  layer.addChild(baysLayer);

  const editHighlightLayer = new Graphics();
  layer.addChild(editHighlightLayer);

  // Z-sorted layer for machines + workers so they occlude correctly.
  const entityLayer = new Container();
  entityLayer.sortableChildren = true;
  layer.addChild(entityLayer);

  const renderBg = () => {
    bgLayer.clear();
    bgLayer.poly(isoDiamond(0, 0, gridW, gridH, tileSize));
    bgLayer.fill({ color: 0x232838 });
    bgLayer.stroke({ width: 1, color: 0x303a52, alpha: 0.6 });
  };

  const renderGrid = () => {
    gridLayer.clear();
    for (let i = 0; i <= gridW; i++) {
      const a = isoToScreen(i, 0, tileSize);
      const b = isoToScreen(i, gridH, tileSize);
      gridLayer.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    for (let i = 0; i <= gridH; i++) {
      const a = isoToScreen(0, i, tileSize);
      const b = isoToScreen(gridW, i, tileSize);
      gridLayer.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    gridLayer.stroke({ width: 1, color: 0x303a52, alpha: 0.6 });
  };

  const renderBays = (factory: FactoryInstance) => {
    baysLayer.removeChildren();
    for (let y = 0; y < factory.innerLayout.length; y++) {
      const row = factory.innerLayout[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        const tile = row[x];
        if (!tile || tile.kind !== 'bay') continue;
        const isInput = tile.side === 'W';
        const tint = isInput ? 0x6a9adc : 0xdc9a6a;

        // Diamond tile, color-coded for input vs output.
        const bg = new Graphics();
        bg.poly(isoDiamond(x, y, 1, 1, tileSize));
        bg.fill({ color: isInput ? 0x3a5a8a : 0x8a5a3a, alpha: 0.85 });
        bg.stroke({ width: 1, color: tint, alpha: 0.9 });
        baysLayer.addChild(bg);

        // Door overlay so it reads as a gate; tinted for input/output.
        const door = new Sprite(doorTexture);
        door.anchor.set(0.5, 0.85);
        const c = isoToScreen(x + 0.5, y + 0.5, tileSize);
        door.x = c.x;
        door.y = c.y;
        const doorTargetW = tileSize * 0.9;
        door.scale.set(doorTargetW / Math.max(1, door.texture.width));
        door.tint = tint;
        baysLayer.addChild(door);
      }
    }
  };

  const machineNodes = new Map<string, Container>();
  const machineKey = (m: Machine) => `${m.innerX},${m.innerY},${m.typeId}`;

  const renderMachines = (factory: FactoryInstance) => {
    for (const node of machineNodes.values()) node.destroy();
    machineNodes.clear();

    for (const m of factory.machines) {
      const mt = MACHINE_TYPES[m.typeId];
      if (!mt) continue;
      const isBuilding = m.status === 'building';

      const node = new Container();
      node.label = 'machine';
      node.zIndex = m.innerX + m.innerY;

      const sprite = new Sprite(machineTexture);
      sprite.anchor.set(0.5, 0.85);
      const c = isoToScreen(m.innerX + 0.5, m.innerY + 0.5, tileSize);
      sprite.x = c.x;
      sprite.y = c.y;
      const targetW = tileSize * 1.2;
      sprite.scale.set(targetW / Math.max(1, sprite.texture.width));
      sprite.alpha = isBuilding ? 0.45 : 1;
      node.addChild(sprite);

      if (isBuilding) {
        const ratio = Math.min(1, m.buildProgress / mt.buildTicks);
        const south = isoToScreen(m.innerX + 1, m.innerY + 1, tileSize);
        const barW = tileSize * 0.9;
        const bar = new Graphics();
        bar.rect(0, 0, barW, 3);
        bar.fill({ color: 0x222a3a });
        if (ratio > 0) {
          bar.rect(0, 0, barW * ratio, 3);
          bar.fill({ color: 0xe0c060 });
        }
        bar.x = south.x - barW / 2;
        bar.y = south.y + 2;
        node.addChild(bar);
      }

      entityLayer.addChild(node);
      machineNodes.set(machineKey(m), node);
    }
  };

  const renderEditHighlight = (factory: FactoryInstance) => {
    editHighlightLayer.clear();
    const mode = useGameStore.getState().factoryEditMode;
    if (mode.kind === 'none') return;

    if (mode.kind === 'move-bay') {
      const targetSide = mode.side;
      for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
          if (!isPerimeterTile(x, y, gridW, gridH)) continue;
          const tile = factory.innerLayout[y]?.[x];
          const isOpen =
            tile &&
            (tile.kind === 'empty' || (tile.kind === 'bay' && tile.side === targetSide));
          if (!isOpen) continue;
          editHighlightLayer.poly(isoDiamond(x, y, 1, 1, tileSize));
        }
      }
      const color = targetSide === 'W' ? 0x6a9adc : 0xdc9a6a;
      editHighlightLayer.fill({ color, alpha: 0.18 });
      editHighlightLayer.stroke({ width: 1, color, alpha: 0.6 });
      return;
    }

    if (mode.kind === 'place-machine') {
      const occupied = new Set(factory.machines.map((m) => `${m.innerX},${m.innerY}`));
      for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
          if (isPerimeterTile(x, y, gridW, gridH)) continue;
          if (occupied.has(`${x},${y}`)) continue;
          const tile = factory.innerLayout[y]?.[x];
          if (!tile || tile.kind !== 'empty') continue;
          editHighlightLayer.poly(isoDiamond(x, y, 1, 1, tileSize));
        }
      }
      editHighlightLayer.fill({ color: 0x6abe6a, alpha: 0.18 });
      editHighlightLayer.stroke({ width: 1, color: 0x6abe6a, alpha: 0.6 });
    }
  };

  type WorkerEntry = {
    root: Container;
    body: Sprite;
    carry: Graphics;
    textureKey: string | null;
  };
  const workerSprites = new Map<string, WorkerEntry>();

  const makeWorkerSprite = (): WorkerEntry => {
    const root = new Container();
    root.label = 'worker';
    const body = new Sprite(Texture.EMPTY);
    body.anchor.set(0.5, 0.85);
    root.addChild(body);
    const carry = new Graphics();
    carry.circle(0, 0, 3);
    carry.fill({ color: 0xa46a3a });
    carry.stroke({ width: 1, color: 0x000000, alpha: 0.4 });
    carry.visible = false;
    root.addChild(carry);
    entityLayer.addChild(root);
    return { root, body, carry, textureKey: null };
  };

  const updateWorkers = (workers: Worker[]) => {
    const seen = new Set<string>();
    for (const w of workers) {
      seen.add(w.id);
      let entry = workerSprites.get(w.id);
      if (!entry) {
        entry = makeWorkerSprite();
        workerSprites.set(w.id, entry);
      }
      const key = pickCharacterFor(w.id);
      if (key !== entry.textureKey) {
        const tex = characterTextures.get(key);
        if (tex) entry.body.texture = tex;
        entry.textureKey = key;
      }
      const bodyW = tileSize * 0.9;
      entry.body.scale.set(bodyW / Math.max(1, entry.body.texture.width));
      const c = isoToScreen(w.position.x, w.position.y, tileSize);
      entry.root.x = c.x;
      entry.root.y = c.y;
      entry.root.zIndex = w.position.x + w.position.y + 0.05;
      entry.carry.x = tileSize * 0.2;
      entry.carry.y = -tileSize * 0.5;
      entry.carry.visible = w.carrying !== null;
    }
    for (const [id, entry] of workerSprites) {
      if (seen.has(id)) continue;
      entityLayer.removeChild(entry.root);
      entry.root.destroy({ children: true });
      workerSprites.delete(id);
    }
  };

  const findCurrent = (): { factory: FactoryInstance | null; workers: Worker[] } => {
    const w = useGameStore.getState().world;
    return {
      factory: w?.factories.find((f) => f.id === factoryId) ?? null,
      workers:
        w?.workers.filter((wk) => wk.role === 'inner' && wk.assignedFactoryId === factoryId) ?? [],
    };
  };

  const rerenderAll = () => {
    const { factory, workers } = findCurrent();
    renderBg();
    renderGrid();
    if (factory) {
      renderBays(factory);
      renderMachines(factory);
      renderEditHighlight(factory);
    }
    updateWorkers(workers);
  };

  rerenderAll();

  const onResize = () => {
    recenter();
    rerenderAll();
  };
  window.addEventListener('resize', onResize);

  let lastFactoryRef: FactoryInstance | null = initFactory;
  let lastMachinesRef: readonly Machine[] = initFactory.machines;
  let lastEditMode = useGameStore.getState().factoryEditMode;
  const unsub = useGameStore.subscribe((s) => {
    const { factory, workers } = findCurrent();
    if (factory && factory !== lastFactoryRef) {
      renderBays(factory);
      lastFactoryRef = factory;
    }
    if (factory && factory.machines !== lastMachinesRef) {
      renderMachines(factory);
      lastMachinesRef = factory.machines;
    }
    if (s.factoryEditMode !== lastEditMode) {
      lastEditMode = s.factoryEditMode;
      if (factory) renderEditHighlight(factory);
    } else if (factory && factory !== lastFactoryRef) {
      renderEditHighlight(factory);
    }
    updateWorkers(workers);
  });

  const onPointerDown = (e: FederatedPointerEvent) => {
    const local = layer.toLocal(e.global);
    const t = isoToTile(local.x, local.y, tileSize);
    const tx = Math.floor(t.x);
    const ty = Math.floor(t.y);
    if (tx < 0 || ty < 0 || tx >= gridW || ty >= gridH) return;
    const mode = useGameStore.getState().factoryEditMode;
    if (mode.kind === 'move-bay') {
      useGameStore.getState().moveBay(factoryId, mode.side, tx, ty);
    } else if (mode.kind === 'place-machine') {
      useGameStore.getState().buildMachine(factoryId, mode.machineTypeId, tx, ty);
    }
  };
  stage.on('pointerdown', onPointerDown);

  return {
    destroy: () => {
      unsub();
      stage.off('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
      app.destroy(true, { children: true });
    },
  };
}
