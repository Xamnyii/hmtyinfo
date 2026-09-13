"use client";

import { useState, useEffect } from 'react';

interface User {
  _id?: string;
  name: string;
  email: string;
  createdAt?: string;
}

interface AuthState {
  user: User | null;
  isLogged: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLogged: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    // Check localStorage for user session
    const checkAuth = () => {
      try {
        if (typeof window !== 'undefined') {
          const userStr = localStorage.getItem('hmtyauth_user');
          const isLogged = localStorage.getItem('hmtyauth_logged') === 'true';

          if (userStr && isLogged) {
            const user: User = JSON.parse(userStr);
            setAuthState({
              user,
              isLogged: true,
              isLoading: false,
              error: null,
            });
          } else {
            setAuthState({
              user: null,
              isLogged: false,
              isLoading: false,
              error: null,
            });
          }
        }
      } catch {
        setAuthState({
          user: null,
          isLogged: false,
          isLoading: false,
          error: 'Error al verificar autenticacion',
        });
      }
    };

    checkAuth();

    // Listen for storage changes (optional)
    window.addEventListener('storage', checkAuth);

    return () => {
      window.removeEventListener('storage', checkAuth);
    };
  }, []);

  return authState;
}

// Hook for login
export async function useLogin(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Error al iniciar sesion' };
    }

    if (data.success) {
      localStorage.setItem('hmtyauth_user', JSON.stringify(data.user));
      localStorage.setItem('hmtyauth_logged', 'true');
      return { success: true, user: data.user };
    }

    return { success: false, error: 'Credenciales invalidas' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al iniciar sesion' };
  }
}

// Hook for register
export async function useRegister(name: string, email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Error al registrar usuario' };
    }

    if (data.success) {
      return { success: true, user: data.user };
    }

    return { success: false, error: 'Error al registrar usuario' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al registrar usuario' };
  }
}

// Function to logout
export function logout(): void {
  localStorage.removeItem('hmtyauth_user');
  localStorage.removeItem('hmtyauth_logged');
  window.location.replace(new URL('/mainpage', window.location.origin));
}
