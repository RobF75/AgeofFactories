# Age of Factories

Browser-based factory game with human tech-era progression. Single-player with cloud saves.

## Stack

- TypeScript monorepo (pnpm workspaces)
- **Client:** React + Vite + PixiJS
- **Server:** Fastify + WebSocket + Drizzle ORM
- **DB:** Postgres (Cloud SQL in prod, local Docker in dev)
- **Auth:** GCP Identity Platform — Google / Microsoft / Facebook OAuth (wiring lands in a follow-up)

## Local development

### One-time setup

```sh
# Enable pnpm via corepack (bundled with Node 20+)
corepack enable

# Install dependencies
pnpm install

# Start local Postgres
pnpm db:up
```

### Run dev servers

```sh
pnpm dev
```

This runs the client (Vite, http://localhost:5173) and the server (Fastify, http://localhost:3001) in parallel.

### Other scripts

- `pnpm typecheck` — TypeScript across all packages
- `pnpm lint` — ESLint across the repo
- `pnpm format` — Prettier write
- `pnpm db:down` — stop local Postgres

## Layout

```
packages/
  shared/   # types and game-data shared between client and server
  client/   # browser game (Vite + React + PixiJS)
  server/   # game server (Fastify + WebSocket + Postgres)
```
