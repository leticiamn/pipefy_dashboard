export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  WEBHOOK_SECRET: string;
  ALLOWED_PIPE_IDS: string;
  ALLOWED_ORIGINS?: string;
  PIPEFY_API_URL?: string;
}

const csv = (value: string | undefined) =>
  new Set(
    (value ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const allowedPipes = (env: Env) => csv(env.ALLOWED_PIPE_IDS);
export const allowedOrigins = (env: Env) => csv(env.ALLOWED_ORIGINS);
