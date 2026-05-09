import { Application, Graphics } from 'pixi.js';

export async function createPixiApp(container: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    background: '#1a1f2c',
    resizeTo: container,
    antialias: true,
  });
  container.appendChild(app.canvas);

  const grid = new Graphics();
  const tileSize = 32;
  const tilesX = 40;
  const tilesY = 40;

  for (let x = 0; x <= tilesX; x++) {
    grid.moveTo(x * tileSize, 0).lineTo(x * tileSize, tilesY * tileSize);
  }
  for (let y = 0; y <= tilesY; y++) {
    grid.moveTo(0, y * tileSize).lineTo(tilesX * tileSize, y * tileSize);
  }
  grid.stroke({ width: 1, color: 0x2c3344, alpha: 1 });

  grid.x = 40;
  grid.y = 40;
  app.stage.addChild(grid);

  return app;
}
