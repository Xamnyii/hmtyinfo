"use client";

import { useEffect } from 'react';
import { useTransitionRouter } from "next-transition-router";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
	const router = useTransitionRouter();

	useEffect(() => {
		// Verificar si hay sesion activa
		const isLogged = localStorage.getItem('hmtyauth_logged') === 'true';
		
		if (!isLogged) {
			// Si no hay sesion, redirigir a mainauth
			router.push('/mainauth');
		}
	}, [router]);

	// Si hay sesion, mostrar los hijos
	const isLogged = typeof window !== 'undefined' ? localStorage.getItem('hmtyauth_logged') === 'true' : false;
	
	if (!isLogged) {
		return null; // No mostrar nada mientras se redirige
	}

	return <>{children}</>;
}
