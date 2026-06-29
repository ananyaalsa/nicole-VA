import 'dotenv/config';

/**
 * Central config. Reads env once, validates, and exposes a typed object.
 * The Gemini API key lives ONLY here (server-side) and never reaches the browser.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  userId: process.env.NICOLE_USER_ID ?? 'local-user',
  geminiApiKey: required('GEMINI_API_KEY'),
  liveModel: process.env.GEMINI_LIVE_MODEL ?? 'gemini-3.1-flash-live-preview',
  summarizerModel: process.env.GEMINI_SUMMARIZER_MODEL ?? 'gemini-2.5-flash',
  databaseUrl: required('DATABASE_URL'),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  /** Public base URL of THIS server, used to build OAuth redirect URIs. */
  serverUrl: process.env.SERVER_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
} as const;

export type Config = typeof config;

/**
 * Integration credentials are OPTIONAL — absent values leave that provider
 * "not configured" so the whole stack degrades gracefully until the operator
 * adds keys. Never use required() here. See MORNING-SETUP.md for where each
 * value comes from.
 */
export const integrationsConfig = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  },
  notion: {
    clientId: process.env.NOTION_CLIENT_ID ?? '',
    clientSecret: process.env.NOTION_CLIENT_SECRET ?? '',
  },
  todoist: {
    clientId: process.env.TODOIST_CLIENT_ID ?? '',
    clientSecret: process.env.TODOIST_CLIENT_SECRET ?? '',
  },
  slack: {
    clientId: process.env.SLACK_CLIENT_ID ?? '',
    clientSecret: process.env.SLACK_CLIENT_SECRET ?? '',
  },
} as const;

export type IntegrationsConfig = typeof integrationsConfig;
