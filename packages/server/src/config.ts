const env = process.env;

const authMode = (env['AUTH_MODE'] ?? 'dev') as 'dev' | 'firebase';

export const config = {
  port: Number(env['PORT'] ?? 3001),
  databaseUrl: env['DATABASE_URL'] ?? 'postgres://aof:aof@localhost:5432/aof',
  nodeEnv: env['NODE_ENV'] ?? 'development',
  authMode,
  devAuthSecret: env['DEV_AUTH_SECRET'] ?? 'dev-only-not-for-prod',
  corsOrigins: (env['CORS_ORIGINS'] ?? 'http://localhost:5173').split(','),
} as const;
