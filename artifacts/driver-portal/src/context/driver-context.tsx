import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { MOCK_DRIVERS, type DriverRecord } from '@/lib/mock-data';

const SESSION_KEY = 'driver-portal.token';

interface DriverContextValue {
  driver: DriverRecord | null;
  signIn: (token: string) => DriverRecord | null;
  signOut: () => void;
}

const DriverContext = createContext<DriverContextValue | null>(null);

export function DriverProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });

  const driver = useMemo(() => (token ? MOCK_DRIVERS[token] ?? null : null), [token]);

  const signIn = (candidateToken: string): DriverRecord | null => {
    const match = MOCK_DRIVERS[candidateToken] ?? null;
    if (match) {
      try {
        sessionStorage.setItem(SESSION_KEY, candidateToken);
      } catch {
        // sessionStorage unavailable — session just won't survive a refresh.
      }
      setToken(candidateToken);
    }
    return match;
  };

  const signOut = () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    setToken(null);
  };

  return (
    <DriverContext.Provider value={{ driver, signIn, signOut }}>
      {children}
    </DriverContext.Provider>
  );
}

export function useDriver() {
  const ctx = useContext(DriverContext);
  if (!ctx) throw new Error('useDriver must be used inside <DriverProvider>');
  return ctx;
}
