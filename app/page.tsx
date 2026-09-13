"use client";

import { useEffect } from 'react';
import { useTransitionRouter } from "next-transition-router";

export default function Home() {
	const router = useTransitionRouter();

	useEffect(() => {
		// Verificar si hay sesion activa en localStorage
		const isLogged = localStorage.getItem('hmtyauth_logged') === 'true';
		
		if (isLogged) {
			// Si hay sesion, redirigir a mainpage
			router.push('/mainpage');
		} else {
			// Si no hay sesion, redirigir a mainauth
			router.push('/mainauth');
		}
	}, [router]);

	return null; // No renderizar nada mientras se redirige
}
