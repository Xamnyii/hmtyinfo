"use client";

import { useEffect } from 'react';
import { useTransitionRouter } from "next-transition-router";

const AUTH_ENTRY_PATHS = ['/', '/login', '/register', '/mainauth'];

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const router = useTransitionRouter();

  useEffect(() => {
    const currentPath = window.location.pathname;

    if (AUTH_ENTRY_PATHS.includes(currentPath)) {
      router.push('/mainpage');
    }
  }, [router]);

  return <>{children}</>;
}
