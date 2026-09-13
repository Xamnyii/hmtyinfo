"use client";

import { useEffect } from 'react';
import { useTransitionRouter } from "next-transition-router";

export default function Home() {
	const router = useTransitionRouter();

	useEffect(() => {
		router.push('/mainpage');
	}, [router]);

	return null; // No renderizar nada mientras se redirige
}
