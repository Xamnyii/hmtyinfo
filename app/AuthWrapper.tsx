"use client";

import { useEffect, useState } from 'react';
import { useTransitionRouter } from "next-transition-router";

// Rutas publicas que no requieren autenticacion
const PUBLIC_PATHS = ['/', '/login', '/register', '/mainauth', '/api/auth/login', '/api/auth/register'];

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const router = useTransitionRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isLogged, setIsLogged] = useState(false);

  useEffect(() => {
    // Verificar estado de autenticacion
    const checkAuth = () => {
      if (typeof window !== 'undefined') {
        const logged = localStorage.getItem('hmtyauth_logged') === 'true';
        setIsLogged(logged);
        setIsLoading(false);
      }
    };

    checkAuth();

    // Escuchar cambios en localStorage (por si se hace login/logout en otra pestaña)
    window.addEventListener('storage', checkAuth);

    return () => {
      window.removeEventListener('storage', checkAuth);
    };
  }, [router]);

  useEffect(() => {
    // Cuando el estado de autenticacion cambia, redirigir si es necesario
    if (isLoading) return;

    const currentPath = window.location.pathname;

    // Verificar si la ruta actual es publica
    const isPublicPath = PUBLIC_PATHS.includes(currentPath) ||
      PUBLIC_PATHS.some(path => currentPath.startsWith(`${path}/`));

    if (!isPublicPath && !isLogged) {
      // Redirigir a mainauth si se intenta acceder a una ruta protegida sin sesion
      router.push('/mainauth');
    }

    if (isPublicPath && isLogged && !currentPath.startsWith('/api/')) {
      // Redirigir a mainpage si se intenta acceder a una ruta publica con sesion activa
      // (excepto las rutas de API)
      if (currentPath === '/' || currentPath === '/login' || currentPath === '/register' || currentPath === '/mainauth') {
        router.push('/main/mainpage');
      }
    }
  }, [isLoading, isLogged, router]);

  // Mostrar loading mientras se verifica la autenticacion
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Cargando...</div>
      </div>
    );
  }

  // Si todo esta bien, mostrar los hijos
  return <>{children}</>;
}
