import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import {
  FACTORY_TYPES,
  HUNGER_THRESHOLD,
  MAX_ENERGY,
  WORLD_GRID_TILES,
  effectiveTerrainAt,
  type FactoryInstance,
  type Worker,
  type WorldState,
} from '@aof/shared';
import { useGameStore } from '../state/gameStore.js';

const ISO_TILE_W = 64;
const ISO_TILE_H = 32;
const ISO_HW = ISO_TILE_W / 2;
const ISO_HH = ISO_TILE_H / 2;

function tileToScreen(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx - ty) * ISO_HW, y: (tx + ty) * ISO_HH };
}

function screenToTile(sx: number, sy: number): { x: number; y: number } {
  const a = sx / ISO_HW;
  const b = sy / ISO_HH;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

function footprintDiamond(tileX: number, tileY: number, w: number, h: number): number[] {
  const top = tileToScreen(tileX, tileY);
  const right = tileToScreen(tileX + w, tileY);
  const bottom = tileToScreen(tileX + w, tileY + h);
  const left = tileToScreen(tileX, tileY + h);
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

type PlacementCheck = 'ok' | 'oob' | 'stone' | 'overlap';

function checkPlacement(
  tileX: number,
  tileY: number,
  typeId: string,
  world: WorldState,
): PlacementCheck {
  const t = FACTORY_TYPES[typeId];
  if (!t) return 'oob';
  if (tileX < 0 || tileY < 0) return 'oob';
  if (tileX + t.baseFootprint.w > WORLD_GRID_TILES) return 'oob';
  if (tileY + t.baseFootprint.h > WORLD_GRID_TILES) return 'oob';
  for (let dy = 0; dy < t.baseFootprint.h; dy++) {
    for (let dx = 0; dx < t.baseFootprint.w; dx++) {
      if (effectiveTerrainAt(world, tileX + dx, tileY + dy) === 'stone') return 'stone';
    }
  }
  for (const f of world.factories) {
    const ft = FACTORY_TYPES[f.typeId];
    if (!ft) continue;
    if (
      tileX < f.worldX + ft.baseFootprint.w &&
      tileX + t.baseFootprint.w > f.worldX &&
      tileY < f.worldY + ft.baseFootprint.h &&
      tileY + t.baseFootprint.h > f.worldY
    ) {
      return 'overlap';
    }
  }
  return 'ok';
}

function hitFactory(
  tileX: number,
  tileY: number,
  factories: readonly FactoryInstance[],
): FactoryInstance | null {
  for (const f of factories) {
    const t = FACTORY_TYPES[f.typeId];
    if (!t) continue;
    if (
      tileX >= f.worldX &&
      tileX < f.worldX + t.baseFootprint.w &&
      tileY >= f.worldY &&
      tileY < f.worldY + t.baseFootprint.h
    ) {
      return f;
    }
  }
  return null;
}

const FACTORY_COLORS: Record<string, { fill: number; stroke: number }> = {
  farm: { fill: 0x8a7a3a, stroke: 0xd0bd6a },
  'lumber-factory': { fill: 0x4a8a4a, stroke: 0x6abe6a },
  'charcoal-burner': { fill: 0x6a4a3a, stroke: 0xae8a6a },
  bakery: { fill: 0xa07a4a, stroke: 0xd6a878 },
};

const FACTORY_SPRITES: Record<string, string> = {
  'lumber-factory': '/sprites/factories/machine-window.png',
  'charcoal-burner': '/sprites/factories/hopper-high-square.png',
};

// Sprites that tile per sub-cell instead of spanning the whole footprint
// (useful for crop fields, fenced lots, etc.).
const FACTORY_TILE_SPRITES: Record<string, string> = {
  farm: '/sprites/factories/crops_wheatStageB_SW.png',
};

const TERRAIN_SPRITES: Record<string, string> = {
  tree: '/sprites/terrain/tree_blocks_SW.png',
  stone: '/sprites/terrain/rock_smallA_SW.png',
};

export interface WorldPixi {
  destroy: () => void;
}

export async function createWorldPixi(container: HTMLElement): Promise<WorldPixi> {
  const app = new Application();
  await app.init({ background: '#1a1f2c', resizeTo: container, antialias: true });
  container.appendChild(app.canvas);

  const characterTextures = new Map<string, Texture>();
  const factoryTextures = new Map<string, Texture>();
  const terrainTextures = new Map<string, Texture>();
  await Promise.all([
    ...CHARACTER_KEYS.map(async (key) => {
      const texture = await Assets.load<Texture>(`/sprites/characters/character-${key}.png`);
      characterTextures.set(key, texture);
    }),
    ...Object.entries(FACTORY_SPRITES).map(async ([typeId, url]) => {
      const texture = await Assets.load<Texture>(url);
      factoryTextures.set(typeId, texture);
    }),
    ...Object.entries(FACTORY_TILE_SPRITES).map(async ([typeId, url]) => {
      const texture = await Assets.load<Texture>(url);
      factoryTextures.set(typeId, texture);
    }),
    ...Object.entries(TERRAIN_SPRITES).map(async ([kind, url]) => {
      const texture = await Assets.load<Texture>(url);
      terrainTextures.set(kind, texture);
    }),
  ]);

  const stage = app.stage;
  stage.eventMode = 'static';
  stage.hitArea = app.screen;

  // worldRoot offsets the iso projection so the world's left corner sits near x=0.
  const worldRoot = new Container();
  worldRoot.x = WORLD_GRID_TILES * ISO_HW;
  worldRoot.y = 0;
  stage.addChild(worldRoot);

  const gridLayer = new Graphics();
  for (let i = 0; i <= WORLD_GRID_TILES; i++) {
    const a = tileToScreen(i, 0);
    const b = tileToScreen(i, WORLD_GRID_TILES);
    gridLayer.moveTo(a.x, a.y).lineTo(b.x, b.y);
    const c = tileToScreen(0, i);
    const d = tileToScreen(WORLD_GRID_TILES, i);
    gridLayer.moveTo(c.x, c.y).lineTo(d.x, d.y);
  }
  gridLayer.stroke({ width: 1, color: 0x2c3344, alpha: 1 });
  worldRoot.addChild(gridLayer);

  // Single z-sorted layer so terrain, factories, and haulers occlude correctly.
  const entityLayer = new Container();
  entityLayer.sortableChildren = true;
  worldRoot.addChild(entityLayer);

  let renderedSeed: number | null = null;
  let renderedClearCount = -1;
  const renderTerrain = (world: WorldState) => {
    const clearCount = Object.keys(world.clearedTiles).length;
    if (world.seed === renderedSeed && clearCount === renderedClearCount) return;
    renderedSeed = world.seed;
    renderedClearCount = clearCount;
    for (let i = entityLayer.children.length - 1; i >= 0; i--) {
      const c = entityLayer.children[i];
      if (c && c.label === 'terrain') {
        entityLayer.removeChildAt(i);
        c.destroy();
      }
    }
    for (let y = 0; y < WORLD_GRID_TILES; y++) {
      for (let x = 0; x < WORLD_GRID_TILES; x++) {
        const t = effectiveTerrainAt(world, x, y);
        if (t === null) continue;
        const c = tileToScreen(x + 0.5, y + 0.5);
        const tex = terrainTextures.get(t);
        if (tex) {
          const sprite = new Sprite(tex);
          sprite.label = 'terrain';
          sprite.anchor.set(0.5, 0.65);
          sprite.x = c.x;
          sprite.y = c.y;
          const targetW = t === 'tree' ? ISO_TILE_W * 2 : ISO_TILE_W * 1.2;
          sprite.scale.set(targetW / sprite.texture.width);
          sprite.zIndex = x + y + 0.5;
          entityLayer.addChild(sprite);
        } else {
          // Fallback: simple shape if a texture failed to load.
          const fallback = new Graphics();
          fallback.label = 'terrain';
          if (t === 'tree') {
            fallback.circle(c.x, c.y, ISO_HH * 0.7);
            fallback.fill({ color: 0x2f6e3a });
            fallback.stroke({ width: 1, color: 0x1a4a22 });
          } else if (t === 'stone') {
            fallback.circle(c.x, c.y, ISO_HH * 0.55);
            fallback.fill({ color: 0x6e7080 });
            fallback.stroke({ width: 1, color: 0x40434f });
          }
          fallback.zIndex = x + y + 0.5;
          entityLayer.addChild(fallback);
        }
      }
    }
  };

  const renderFactories = (factories: readonly FactoryInstance[]) => {
    for (let i = entityLayer.children.length - 1; i >= 0; i--) {
      const c = entityLayer.children[i];
      if (c && c.label === 'factory') {
        entityLayer.removeChildAt(i);
        c.destroy();
      }
    }
    for (const f of factories) {
      const type = FACTORY_TYPES[f.typeId];
      if (!type) continue;
      const palette = FACTORY_COLORS[f.typeId] ?? { fill: 0x4a8a4a, stroke: 0x6abe6a };
      const isDemolishing = f.demolish !== null;
      const isSiteClearing = f.siteClearing.length > 0;
      const isConstructing = !f.construction.complete && !isSiteClearing && !isDemolishing;
      const w = type.baseFootprint.w;
      const h = type.baseFootprint.h;

      let alpha = 0.85;
      let strokeColor: number = palette.stroke;
      if (isDemolishing) {
        alpha = 0.5;
        strokeColor = 0xff5555;
      } else if (isSiteClearing) {
        alpha = 0.3;
        strokeColor = 0xe09a4a;
      } else if (isConstructing) {
        alpha = 0.35;
        strokeColor = 0xe0c060;
      }

      const node = new Container();
      node.label = 'factory';
      // Use the south corner (closest to camera) as depth key, slightly behind
      // a hauler that's exactly on the same iso row.
      node.zIndex = f.worldX + w + (f.worldY + h) - 0.1;

      const tex = factoryTextures.get(f.typeId);
      const tiled = FACTORY_TILE_SPRITES[f.typeId] !== undefined;
      const showSprite = tex !== undefined && !isConstructing && !isSiteClearing && !isDemolishing;
      if (showSprite && tex) {
        // Faint footprint diamond behind the sprite so the tile area is still readable.
        const footprintGfx = new Graphics();
        footprintGfx.poly(footprintDiamond(f.worldX, f.worldY, w, h));
        footprintGfx.fill({ color: palette.fill, alpha: 0.15 });
        footprintGfx.stroke({ width: 1, color: strokeColor, alpha: 0.5 });
        node.addChild(footprintGfx);

        if (tiled) {
          // Repeat the sprite across each sub-tile of the footprint.
          for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
              const sprite = new Sprite(tex);
              sprite.anchor.set(0.5, 0.6);
              const c = tileToScreen(f.worldX + dx + 0.5, f.worldY + dy + 0.5);
              sprite.x = c.x;
              sprite.y = c.y;
              const targetWidth = ISO_TILE_W * 1.4;
              sprite.scale.set(targetWidth / sprite.texture.width);
              node.addChild(sprite);
            }
          }
        } else {
          const sprite = new Sprite(tex);
          sprite.anchor.set(0.5, 1.0);
          const south = tileToScreen(f.worldX + w, f.worldY + h);
          sprite.x = south.x;
          sprite.y = south.y;
          const targetWidth = w * ISO_TILE_W;
          sprite.scale.set(targetWidth / sprite.texture.width);
          node.addChild(sprite);
        }
      } else {
        const body = new Graphics();
        body.poly(footprintDiamond(f.worldX, f.worldY, w, h));
        body.fill({ color: palette.fill, alpha });
        body.stroke({ width: 2, color: strokeColor });
        node.addChild(body);
      }

      let barRatio: number | null = null;
      let barColor = 0xe0c060;
      if (isDemolishing && f.demolish) {
        barRatio = Math.min(1, f.demolish.progress / f.demolish.total);
        barColor = 0xff5555;
      } else if (isConstructing) {
        const cost = type.constructionCost?.amount ?? 1;
        barRatio = Math.min(1, f.construction.received / cost);
        barColor = 0xe0c060;
      }
      if (barRatio !== null) {
        const south = tileToScreen(f.worldX + w, f.worldY + h);
        const barW = Math.max(20, w * ISO_TILE_W * 0.5);
        const bar = new Graphics();
        bar.rect(0, 0, barW, 4);
        bar.fill({ color: 0x222a3a });
        if (barRatio > 0) {
          bar.rect(0, 0, barW * barRatio, 4);
          bar.fill({ color: barColor });
        }
        bar.x = south.x - barW / 2;
        bar.y = south.y + 4;
        node.addChild(bar);
      }

      entityLayer.addChild(node);
    }
  };

  const haulerSprites = new Map<
    string,
    { sprite: Container; carryDot: Graphics; energyRing: Graphics }
  >();

  const updateHaulers = (workers: readonly Worker[]) => {
    const haulers = workers.filter((w) => w.role === 'hauler');
    const seen = new Set<string>();
    for (const h of haulers) {
      seen.add(h.id);
      let entry = haulerSprites.get(h.id);
      if (!entry) {
        const sprite = new Container();
        sprite.label = 'hauler';
        const energyRing = new Graphics();
        sprite.addChild(energyRing);
        const characterKey = pickCharacterFor(h.id);
        const texture = characterTextures.get(characterKey) ?? Texture.EMPTY;
        const body = new Sprite(texture);
        // Anchor near the feet so the character stands on the iso tile center.
        body.anchor.set(0.5, 0.85);
        body.width = ISO_TILE_W * 0.55;
        body.height = ISO_TILE_W * 0.55;
        sprite.addChild(body);
        const carryDot = new Graphics();
        carryDot.circle(0, 0, 4);
        carryDot.fill({ color: 0x6a3a1a });
        carryDot.stroke({ width: 1, color: 0x000000, alpha: 0.4 });
        carryDot.x = ISO_TILE_W * 0.18;
        carryDot.y = -ISO_TILE_W * 0.4;
        carryDot.visible = false;
        sprite.addChild(carryDot);
        entityLayer.addChild(sprite);
        entry = { sprite, carryDot, energyRing };
        haulerSprites.set(h.id, entry);
      }
      const screen = tileToScreen(h.position.x, h.position.y);
      entry.sprite.x = screen.x;
      entry.sprite.y = screen.y;
      entry.sprite.zIndex = h.position.x + h.position.y;
      entry.carryDot.visible = h.carrying !== null;

      entry.energyRing.clear();
      const isHungry = h.energy < HUNGER_THRESHOLD;
      const isIdle = h.assignedFactoryId === null;
      if (isHungry || isIdle) {
        const color = isHungry ? 0xff5555 : 0xfff066;
        // Ground halo: flat ellipse matching iso tile proportions.
        entry.energyRing.ellipse(0, 0, ISO_HW * 0.5, ISO_HH * 0.5);
        entry.energyRing.stroke({ width: 1.5, color, alpha: 0.9 });
      }
    }
    for (const [id, entry] of haulerSprites.entries()) {
      if (!seen.has(id)) {
        entry.sprite.destroy();
        haulerSprites.delete(id);
      }
    }
  };

  const previewLayer = new Graphics();
  previewLayer.visible = false;
  worldRoot.addChild(previewLayer);

  const selectionLayer = new Graphics();
  selectionLayer.visible = false;
  worldRoot.addChild(selectionLayer);

  const renderSelection = (factory: FactoryInstance | null) => {
    if (!factory) {
      selectionLayer.visible = false;
      return;
    }
    const type = FACTORY_TYPES[factory.typeId];
    if (!type) {
      selectionLayer.visible = false;
      return;
    }
    selectionLayer.clear();
    selectionLayer.poly(
      footprintDiamond(factory.worldX, factory.worldY, type.baseFootprint.w, type.baseFootprint.h),
    );
    selectionLayer.stroke({ width: 2, color: 0xffd060, alpha: 0.95 });
    selectionLayer.visible = true;
  };

  let lastTileX = -1;
  let lastTileY = -1;

  const updatePreview = () => {
    const state = useGameStore.getState();
    const world = state.world;
    if (
      !world ||
      state.buildMode.kind !== 'place-factory' ||
      lastTileX < 0 ||
      lastTileY < 0 ||
      lastTileX >= WORLD_GRID_TILES ||
      lastTileY >= WORLD_GRID_TILES
    ) {
      previewLayer.visible = false;
      return;
    }
    if (hitFactory(lastTileX, lastTileY, world.factories)) {
      previewLayer.visible = false;
      return;
    }
    const t = FACTORY_TYPES[state.buildMode.typeId];
    if (!t) {
      previewLayer.visible = false;
      return;
    }
    const result = checkPlacement(lastTileX, lastTileY, state.buildMode.typeId, world);
    const ok = result === 'ok';
    const color = ok ? 0x6abe6a : 0xc56a6a;
    previewLayer.clear();
    previewLayer.poly(
      footprintDiamond(lastTileX, lastTileY, t.baseFootprint.w, t.baseFootprint.h),
    );
    previewLayer.fill({ color, alpha: 0.25 });
    previewLayer.stroke({ width: 2, color, alpha: 0.9 });
    previewLayer.visible = true;
  };

  const pointerToTile = (e: FederatedPointerEvent) => {
    const local = worldRoot.toLocal(e.global);
    const t = screenToTile(local.x, local.y);
    return { tileX: Math.floor(t.x), tileY: Math.floor(t.y) };
  };

  const onPointerMove = (e: FederatedPointerEvent) => {
    const { tileX, tileY } = pointerToTile(e);
    if (tileX === lastTileX && tileY === lastTileY) return;
    lastTileX = tileX;
    lastTileY = tileY;
    updatePreview();
  };
  const onPointerLeave = () => {
    lastTileX = -1;
    lastTileY = -1;
    previewLayer.visible = false;
  };
  stage.on('pointermove', onPointerMove);
  stage.on('pointerleave', onPointerLeave);

  const initial = useGameStore.getState().world;
  if (initial) {
    renderTerrain(initial);
    renderFactories(initial.factories);
    updateHaulers(initial.workers);
  }
  const initialSelectedId = useGameStore.getState().selectedFactoryId;
  if (initialSelectedId && initial) {
    renderSelection(initial.factories.find((f) => f.id === initialSelectedId) ?? null);
  }

  let lastFactories = initial?.factories;
  let lastBuildMode = useGameStore.getState().buildMode;
  let lastSelectedId = initialSelectedId;
  const unsub = useGameStore.subscribe((s) => {
    const w = s.world;
    if (!w) return;
    renderTerrain(w);
    if (w.factories !== lastFactories) {
      renderFactories(w.factories);
      lastFactories = w.factories;
      updatePreview();
    }
    updateHaulers(w.workers);
    if (s.buildMode !== lastBuildMode) {
      lastBuildMode = s.buildMode;
      updatePreview();
    }
    if (s.selectedFactoryId !== lastSelectedId || w.factories !== lastFactories) {
      lastSelectedId = s.selectedFactoryId;
      renderSelection(
        s.selectedFactoryId ? (w.factories.find((f) => f.id === s.selectedFactoryId) ?? null) : null,
      );
    }
  });

  const onPointerDown = (e: FederatedPointerEvent) => {
    const { tileX, tileY } = pointerToTile(e);
    if (tileX < 0 || tileY < 0 || tileX >= WORLD_GRID_TILES || tileY >= WORLD_GRID_TILES) return;

    const state = useGameStore.getState();
    const world = state.world;
    if (!world) return;

    const hit = hitFactory(tileX, tileY, world.factories);
    if (hit) {
      state.setBuildMode({ kind: 'none' });
      state.selectFactory(hit.id);
      return;
    }

    if (state.buildMode.kind === 'place-factory') {
      const result = checkPlacement(tileX, tileY, state.buildMode.typeId, world);
      if (result !== 'ok') return;
      state.placeFactory(state.buildMode.typeId, tileX, tileY);
      updatePreview();
      return;
    }

    if (state.selectedFactoryId) {
      state.selectFactory(null);
    }
  };
  stage.on('pointerdown', onPointerDown);

  void MAX_ENERGY;

  return {
    destroy: () => {
      unsub();
      stage.off('pointerdown', onPointerDown);
      stage.off('pointermove', onPointerMove);
      stage.off('pointerleave', onPointerLeave);
      for (const entry of haulerSprites.values()) entry.sprite.destroy();
      haulerSprites.clear();
      app.destroy(true, { children: true });
    },
  };
}
