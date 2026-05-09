const env = process.env;

export const config = {
  port: Number(env['PORT'] ?? 3001),
  databaseUrl: env['DATABASE_URL'] ?? 'postgres://aof:aof@localhost:5432/aof',
  nodeEnv: env['NODE_ENV'] ?? 'development',
} as const;
