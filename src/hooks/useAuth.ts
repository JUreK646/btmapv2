import { useEffect, useState, useCallback } from 'react';
import { api, post } from '../lib/api';
import type { User } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api<User | null>('/auth/me')
      .then(setUser)
      .catch(() => {});

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS' && event.data?.user) {
        setUser(event.data.user);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const authenticate = useCallback(async (mode: 'login' | 'register', data: unknown) => {
    const u = await post<User>(`/auth/${mode}`, data);
    setUser(u);
    return u;
  }, []);

  const loginWithGoogle = useCallback(async (payload: { credential?: string; devUser?: { email: string; name?: string; picture?: string } }) => {
    const u = await post<User>('/auth/google', payload);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await post('/auth/logout', {});
    setUser(null);
  }, []);

  return {
    user,
    setUser,
    authenticate,
    loginWithGoogle,
    logout,
  };
}
