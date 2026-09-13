"use client";

import { useState, FormEvent, memo } from 'react';
import ColorBends from "../../components/ColorBends";
import { ArrowLeft } from "lucide-react";
import { Link as TransitionLink, useTransitionRouter } from "next-transition-router";
import styles from "../auth.module.css";
import { isValidBusinessEmail, isValidPassword } from "@/lib/validation";

// Componente memoizado para la animacion
const AnimationSection = memo(() => (
	<section className={styles.artwork}>
		<ColorBends className={styles.bends} colors={["#43b97d", "#9ee0ae", "#77cbb0", "#1d6573"]} rotation={198} speed={0.52} scale={2.4} frequency={0.9} warpStrength={1.05} mouseInfluence={0.7} parallax={0.8} noise={0.04} intensity={1.35} bandWidth={2.8} />
		<div className={styles.artCopy}><h2>Valida cada factura con confianza.</h2></div>
	</section>
));
AnimationSection.displayName = "AnimationSection";

export default function RegisterPage() {
	const router = useTransitionRouter();
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState<string | null>(null);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setErrors({});
		setSuccess(null);
		setIsLoading(true);

		// Validaciones del lado del cliente
		const validationErrors: Record<string, string> = {};
		
		if (!name || name.trim().length === 0) {
			validationErrors.name = 'El nombre es obligatorio';
		}
		
		if (!email || email.trim().length === 0) {
			validationErrors.email = 'El correo electronico es obligatorio';
		} else {
			const emailValidation = isValidBusinessEmail(email);
			if (!emailValidation.valid) {
				validationErrors.email = emailValidation.reason || 'Correo electronico invalido';
			}
		}
		
		if (!password || password.trim().length === 0) {
			validationErrors.password = 'La contraseña es obligatoria';
		} else {
			const passwordValidation = isValidPassword(password);
			if (!passwordValidation.valid) {
				validationErrors.password = passwordValidation.reason || 'Contraseña invalida';
			}
		}
		
		if (Object.keys(validationErrors).length > 0) {
			setErrors(validationErrors);
			setIsLoading(false);
			return;
		}

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
				throw new Error(data.error || 'Error al registrar el usuario');
			}

			if (data.success) {
				setSuccess('Registro exitoso. Redirigiendo a inicio de sesion...');
				
				setTimeout(() => {
					router.push('/login');
				}, 2000);
			}
		} catch (err) {
			setErrors({ general: err instanceof Error ? err.message : 'Error al registrar el usuario' });
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
					<h1 className={styles.title}>Crear cuenta</h1>
					<p className={styles.intro}>Activa controles para detectar irregularidades en tus facturas.</p>
					
					{errors.general && <div className={styles.errorMessage}>{errors.general}</div>}
					{success && <div className={styles.successMessage}>{success}</div>}
					
					<form onSubmit={handleSubmit} className={styles.form}>
						<div className={styles.formGroup}>
							<label htmlFor="name" className={styles.label}>Nombre de la empresa</label>
							<input
								type="text"
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
								required
								placeholder="Nombre de tu empresa"
							/>
							{errors.name && <p className={styles.errorText}>{errors.name}</p>}
						</div>
						<div className={styles.formGroup}>
							<label htmlFor="email" className={styles.label}>Correo electronico de empresa</label>
							<input
								type="email"
								id="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
								required
								placeholder="tu@tuempresa.com"
							/>
							{errors.email && <p className={styles.errorText}>{errors.email}</p>}
						</div>
						<div className={styles.formGroup}>
							<label htmlFor="password" className={styles.label}>Contraseña</label>
							<input
								type="password"
								id="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
								required
								placeholder="........"
							/>
							{errors.password && <p className={styles.errorText}>{errors.password}</p>}
							<p className={styles.passwordHint}>Minimo 8 caracteres, 1 mayuscula, 1 simbolo (!@#$%^&*)</p>
						</div>
						<button type="submit" className={styles.submitButton} disabled={isLoading}>
							{isLoading ? 'Registrando...' : 'Crear cuenta'}
						</button>
					</form>
					
					<div className={styles.rule} />
					<p className={styles.footnote}>Solo se aceptan correos de empresas. Comienza a identificar señales de riesgo desde hoy.</p>
					<p className={styles.loginLink}>
						Ya tienes cuenta? <TransitionLink href="/login">Iniciar sesion</TransitionLink>
					</p>
				</div>
			</section>
		</main>
	);
}
