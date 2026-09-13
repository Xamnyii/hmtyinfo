"use client";

import { useEffect } from 'react';
import { useTransitionRouter } from "next-transition-router";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
	const router = useTransitionRouter();

	useEffect(() => {
		const isLogged = localStorage.getItem('hmtyauth_logged') === 'true';
		if (isLogged) {
			router.push('/mainpage');
		}
	}, [router]);

	const isLogged = typeof window !== 'undefined' ? localStorage.getItem('hmtyauth_logged') === 'true' : false;
	
	if (isLogged) {
		return null;
	}

	return <>{children}</>;
}
