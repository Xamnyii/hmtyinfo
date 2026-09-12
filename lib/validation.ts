/**
 * Validaciones de seguridad para autenticacion
 */

// Lista de dominios de correo NO permitidos (servicios gratuitos, temporales, etc.)
const BLOCKED_EMAIL_DOMAINS = [
  // Proveedores de correo cifrado/privado
  'protonmail.com', 'proton.me', 'pm.me',
  'tutanota.com', 'tuta.io',
  'riseup.net',
  'disroot.org',
  'mailfence.com',
  'skiff.com',
  
  // Proveedores populares gratuitos
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'aol.com', 'aim.com',
  'icloud.com', 'me.com', 'mac.com',
  'zoho.com',
  'yandex.com',
  'mail.com',
  'gmx.com', 'gmx.us', 'gmx.de', 'gmx.fr',
  'fastmail.com',
  'hushmail.com',
  
  // Dominios de correo temporal (mask emails)
  'mailinator.com', 'mailinator2.com', 'temp-mail.org', 'tempmail.com',
  'tempmail.net', 'temp-mail.io', '10minutemail.com',
  'guerrillamail.com', 'guerrillamailblock.com',
  'throwawaymail.com', 'tempinbox.com', 'fakeinbox.com',
  'maildrop.cc', 'getnada.com', 'nospam.ze.tc',
  'nospam.ze.tc', 'nospam4.us', 'nospamfor.us',
  'tempmail.pro', 'tempmail.address', 'temp-mail.org',
  '10minutemail.net', '20minutemail.com',
  '33mail.com', 'emailondeck.com', 'mohmal.com',
  'jetable.org', 'mailexpire.com', 'mytrashmail.com',
  'notmailinator.com', 'nowmymail.com',
  'sibmail.com', 'spam4.me', 'spambox.us',
  'spamex.com', 'spamfree.eu', 'spamgourmet.com',
  'trash-mail.com', 'trashmail.com', 'trashmail.net',
  'trashymail.com', 'trbvm.com',
];

// Patrones de dominios temporales adicional
const TEMP_EMAIL_PATTERNS = [
  /\.tk$/,       // Dominios .tk gratuitos
  /\.ml$/,       // Dominios .ml
  /\.ga$/,       // Dominios .ga
  /\.cf$/,       // Dominios .cf
  /\.gq$/,       // Dominios .gq
];

/**
 * Verifica si un correo electronico es valido para registro
 * Solo permite correos de dominios de empresas/negocios personalizados
 */
export function isValidBusinessEmail(email: string): { valid: boolean; reason?: string } {
  // Validar formato de email
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return { valid: false, reason: 'Formato de correo electronico invalido' };
  }

  // Extraer dominio
  const domain = email.split('@')[1].toLowerCase();

  // Verificar si el dominio esta bloqueado
  if (BLOCKED_EMAIL_DOMAINS.includes(domain)) {
    return { 
      valid: false, 
      reason: 'No se permiten correos de proveedores gratuitos o personales. Usa un correo de tu empresa.' 
    };
  }

  // Verificar patrones de dominios temporales
  for (const pattern of TEMP_EMAIL_PATTERNS) {
    if (pattern.test(domain)) {
      return { 
        valid: false, 
        reason: 'No se permiten correos temporales. Usa un correo de tu empresa.' 
      };
    }
  }

  // Verificar si es un dominio genérico de primer nivel que no suele ser de empresa
  // (gmail.com, yahoo.com, etc. ya están bloqueados arriba, pero bloqueamos más)
  const freeDomains = ['com', 'net', 'org', 'io', 'co', 'ai', 'app', 'dev', 'tech', 'online'];
  const domainParts = domain.split('.');
  
  // Si el dominio tiene solo 2 partes (ej: empresa.com) y la segunda parte es genérica
  // pero NO está en nuestra lista de bloqueados, entonces probablemente es valido
  // Sin embargo, si el dominio tiene formato de subdominio gratuito (ej: usuario.github.io), bloquear
  if (domainParts.length > 2) {
    // Verificar si el dominio principal está bloqueado
    const mainDomain = domainParts.slice(-2).join('.');
    if (BLOCKED_EMAIL_DOMAINS.includes(mainDomain)) {
      return { 
        valid: false, 
        reason: 'No se permiten correos de proveedores gratuitos o personales. Usa un correo de tu empresa.' 
      };
    }
  }

  return { valid: true };
}

/**
 * Verifica si una contraseña cumple con los requisitos de seguridad
 * - Minimo 8 caracteres
 * - Al menos 1 mayuscula
 * - Al menos 1 simbolo
 */
export function isValidPassword(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) {
    return { valid: false, reason: 'La contraseña debe tener al menos 8 caracteres' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'La contraseña debe contener al menos una mayuscula' };
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, reason: 'La contraseña debe contener al menos un simbolo (!@#$%^&*)' };
  }

  return { valid: true };
}

/**
 * Valida un usuario completo antes de registrar
 */
export function validateUserInput(name: string, email: string, password: string): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!name || name.trim().length === 0) {
    errors.name = 'El nombre es obligatorio';
  }

  if (!email || email.trim().length === 0) {
    errors.email = 'El correo electronico es obligatorio';
  } else {
    const emailValidation = isValidBusinessEmail(email);
    if (!emailValidation.valid) {
      errors.email = emailValidation.reason || 'Correo electronico invalido';
    }
  }

  if (!password || password.trim().length === 0) {
    errors.password = 'La contraseña es obligatoria';
  } else {
    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      errors.password = passwordValidation.reason || 'Contraseña invalida';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
