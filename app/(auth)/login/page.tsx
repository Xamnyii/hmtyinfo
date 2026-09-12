"use client";

import { useState, FormEvent, memo } from 'react';
import ColorBends from "../../components/ColorBends";
import { ArrowLeft } from "lucide-react";
import { Link as TransitionLink, useTransitionRouter } from "next-transition-router";
import styles from "../auth.module.css";

// Componente memoizado para la animacion
const AnimationSection = memo(() => (
	<section className={styles.artwork}>
		<ColorBends className={styles.bends} colors={["#2fae78", "#78d69b", "#63c5b1", "#2d6b74"]} rotation={164} speed={0.46} scale={2.1} frequency={1.05} warpStrength={0.9} mouseInfluence={0.65} parallax={0.7} noise={0.04} intensity={1.3} bandWidth={2.7} />
		<div className={styles.artCopy}><h2>Detecta fraudes antes de pagar.</h2></div>
	</section>
));

export default function LoginPage() {
	const router = useTransitionRouter();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState<string | null>(null);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setSuccess(null);
		setIsLoading(true);

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
				throw new Error(data.error || 'Error al iniciar sesion');
			}

			if (data.success) {
				setSuccess('Inicio de sesion exitoso. Redirigiendo...');
				localStorage.setItem('hmtyauth_user', JSON.stringify(data.user));
				localStorage.setItem('hmtyauth_logged', 'true');
				
				setTimeout(() => {
					router.push('/main/mainpage');
				}, 1500);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Error al iniciar sesion');
		}

		setIsLoading(false);
	};

	return (
		<main className={styles.page}>
			<AnimationSection />
			<section className={styles.panel}>
				<TransitionLink className={styles.backLink} href="/mainauth">
					<ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
					Volver
				</TransitionLink>
				<div className={styles.content}>
					<h1 className={styles.title}>Inicia sesion</h1>
					<p className={styles.intro}>Ingresa con tu correo y contraseña para consultar tus alertas de facturas.</p>
					
					{error && <div className={styles.errorMessage}>{error}</div>}
					{success && <div className={styles.successMessage}>{success}</div>}
					
					<form onSubmit={handleSubmit} className={styles.form}>
						<div className={styles.formGroup}>
							<label htmlFor="email" className={styles.label}>Correo electronico de empresa</label>
							<input
								type="email"
								id="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className={styles.input}
								required
								placeholder="tu@tuempresa.com"
							/>
						</div>
						<div className={styles.formGroup}>
							<label htmlFor="password" className={styles.label}>Contraseña</label>
							<input
								type="password"
								id="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className={styles.input}
								required
								placeholder="........"
							/>
							<p className={styles.passwordHint}>Minimo 8 caracteres, 1 mayuscula, 1 simbolo (!@#$%^&*)</p>
						</div>
						<button type="submit" className={styles.submitButton} disabled={isLoading}>
							{isLoading ? 'Iniciando sesion...' : 'Iniciar sesion'}
						</button>
					</form>
					
					<div className={styles.rule} />
					<p className={styles.footnote}>Solo se aceptan correos de empresas. Tus verificaciones y alertas se mantienen protegidas.</p>
					<p className={styles.registerLink}>
						No tienes cuenta? <TransitionLink href="/register">Crear cuenta</TransitionLink>
					</p>
				</div>
			</section>
		</main>
	);
}
