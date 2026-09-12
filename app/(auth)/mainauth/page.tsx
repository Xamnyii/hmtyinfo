"use client";

import { Sparkles } from "lucide-react";
import { useTransitionRouter } from "next-transition-router";
import { ShinyButton } from "@/components/ui/shiny-button";
import styles from "./page.module.css";

export default function MainAuthPage() {
	const router = useTransitionRouter();

	return (
		<main className={styles.page}>
			<div className={styles.frame} aria-hidden="true">
				<div className={styles.upper} />
				<div className={styles.center}>
					<div className={styles.sideLine} />
					<div className={styles.core}><div className={styles.point} /></div>
					<div className={styles.sideLine} />
				</div>
				<div className={styles.lower} />
			</div>

			<section className={styles.access} aria-labelledby="access-title">
				<div className={styles.logoPlaceholder} aria-label="Logo pendiente de definir">
					<Sparkles aria-hidden="true" size={28} strokeWidth={1.5} />
				</div>
				<h1 id="access-title">Protege tus facturas</h1>
				<p className={styles.description}>Inicia sesión para revisar alertas o crea una cuenta para detectar posibles fraudes.</p>
				<div className={styles.actions}>
					<ShinyButton onClick={() => router.push("/login")}>Iniciar sesión</ShinyButton>
					<ShinyButton onClick={() => router.push("/register")}>Crear cuenta</ShinyButton>
				</div>
			</section>
		</main>
	);
}
