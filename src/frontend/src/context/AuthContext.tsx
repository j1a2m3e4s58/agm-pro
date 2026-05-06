import { createActor } from "@/backend";
import type { AppUser } from "@/backend";
import { buildClient } from "@/lib/backend-client";
import { storage } from "@/lib/storage";
import { useActor } from "@caffeineai/core-infrastructure";
import { createContext, useCallback, useEffect, useRef, useState } from "react";

export interface AuthContextValue {
  user: AppUser | null;
  sessionToken: string | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  login: (
    username: string,
    password: string,
  ) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_VALIDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const { actor, isFetching } = useActor(createActor);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAuth = useCallback(() => {
    storage.clearSession();
    setUser(null);
    setSessionToken(null);
    setMustChangePassword(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startSessionValidation = useCallback(
    (client: ReturnType<typeof buildClient>) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        try {
          await client.validateSession();
        } catch {
          clearAuth();
        }
      }, SESSION_VALIDATE_INTERVAL);
    },
    [clearAuth],
  );

  // Timeout fallback: if actor never resolves after 5s, stop loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading((prev) => {
        if (prev) return false;
        return prev;
      });
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Restore session on mount
  useEffect(() => {
    if (isFetching || !actor) return;
    const token = storage.getSessionToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    const client = buildClient(actor);
    client
      .validateSession()
      .then((session) => {
        setSessionToken(session.token);
        // Build minimal AppUser from session
        const cachedUser = storage.getUser<AppUser>();
        if (cachedUser) {
          setUser(cachedUser);
          setMustChangePassword(cachedUser.mustChangePassword);
        }
        startSessionValidation(client);
      })
      .catch(() => {
        clearAuth();
      })
      .finally(() => setIsLoading(false));
  }, [actor, isFetching, clearAuth, startSessionValidation]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const login = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<{ mustChangePassword: boolean }> => {
      if (!actor) throw new Error("Backend not ready");
      const client = buildClient(actor);
      const response = await client.login(username, password);
      storage.setSessionToken(response.token);
      setSessionToken(response.token);
      setMustChangePassword(response.mustChangePassword);
      // Build a partial AppUser from login response for immediate use
      const partialUser: AppUser = {
        principal: "",
        username: response.username,
        role: response.role,
        isActive: true,
        passwordHash: "",
        createdAt: BigInt(0),
        mustChangePassword: response.mustChangePassword,
      };
      storage.setUser(partialUser);
      setUser(partialUser);
      startSessionValidation(client);
      return { mustChangePassword: response.mustChangePassword };
    },
    [actor, startSessionValidation],
  );

  const logout = useCallback(async () => {
    if (actor) {
      const client = buildClient(actor);
      try {
        await client.logout();
      } catch {
        // ignore errors on logout
      }
    }
    clearAuth();
  }, [actor, clearAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        sessionToken,
        isLoading,
        mustChangePassword,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
