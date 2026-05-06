// Local storage helpers for offline caching and session persistence

const SESSION_TOKEN_KEY = "agm_session_token";
const SESSION_USER_KEY = "agm_session_user";
const SETTINGS_CACHE_KEY = "agm_settings_cache";
const METRICS_CACHE_KEY = "agm_metrics_cache";

export const storage = {
  // Session
  getSessionToken(): string | null {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  },
  setSessionToken(token: string): void {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  },
  clearSession(): void {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
  },

  // User cache
  getUser<T>(): T | null {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setUser<T>(user: T): void {
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  },

  // Settings cache
  getSettingsCache<T>(): T | null {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setSettingsCache<T>(settings: T): void {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
  },

  // Metrics cache
  getMetricsCache<T>(): T | null {
    const raw = localStorage.getItem(METRICS_CACHE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setMetricsCache<T>(metrics: T): void {
    localStorage.setItem(METRICS_CACHE_KEY, JSON.stringify(metrics));
  },
};
