export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  AI_MODE: string;
  GEMINI_MODEL: string;
  GEMINI_API_STYLE?: string;
  GEMINI_API_KEY?: string;
  AUTH_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}
