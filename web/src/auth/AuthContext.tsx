import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  preferredVoice: string;
  onboardingDone: boolean;
}

interface AuthCtx {
  user: AuthUser | null;
  token: string | null;
  login(token: string, user: AuthUser): void;
  logout(): void;
  updateUser(partial: Partial<AuthUser>): void;
}

const Ctx = createContext<AuthCtx | null>(null);

// The access token is SHORT-LIVED (24h) and kept in memory + localStorage for the
// Authorization: Bearer header. The durable session lives in an httpOnly refresh
// cookie the server set at login — JS can't read it, so XSS can't steal it. On
// load (and when the access token is missing/expired) we POST /api/auth/refresh
// with credentials so the cookie mints a fresh access token.
const TOKEN_KEY = 'nicole_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    /** Try to restore the session from the refresh cookie. Returns true on success. */
    async function tryRefresh(): Promise<boolean> {
      try {
        const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!r.ok) return false;
        const data = (await r.json()) as { token: string; user: AuthUser };
        if (!alive) return true;
        localStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setUser(data.user);
        return true;
      } catch {
        return false;
      }
    }

    (async () => {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) {
        // Validate the stored access token; if it's still good, use it.
        try {
          const r = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${stored}` },
            credentials: 'include',
          });
          if (r.ok) {
            const u = (await r.json()) as AuthUser;
            if (alive) { setToken(stored); setUser(u); }
            if (alive) setLoading(false);
            return;
          }
        } catch { /* fall through to refresh */ }
      }
      // No token, or it was rejected — try the refresh cookie before giving up.
      const ok = await tryRefresh();
      if (alive && !ok) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
      if (alive) setLoading(false);
    })();

    return () => { alive = false; };
    // Run once on mount. login()/logout() drive state changes after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(t: string, u: AuthUser) {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }

  function logout() {
    // Revoke the refresh token server-side + clear the cookie (best-effort).
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  function updateUser(partial: Partial<AuthUser>) {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <Ctx.Provider value={{ user, token, login, logout, updateUser }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
