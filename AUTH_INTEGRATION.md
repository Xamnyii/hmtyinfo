# Sistema de Autenticacion Completo con MongoDB

## Resumen

Se ha implementado un sistema completo de autenticacion profesional con las siguientes caracteristicas:

- **Conexion con MongoDB** para persistencia de usuarios
- **Proteccion de todas las rutas** (sin sesion no se puede acceder a nada)
- **Validacion estricta de correos** (solo empresas, no proveedores gratuitos)
- **Validacion segura de contrasenias** (8+ caracteres, mayuscula, simbolo)
- **Persistencia de sesion** en localStorage
- **Flujo de navegacion automatico** con redirecciones inteligentes
- **Animaciones fluidas** que no se reinician al interactuar
- **Perfil de usuario** con estadisticas y configuracion

## Flujo de Navegacion

### Ruta Raiz (localhost:3000 / /)
- **Sin sesion**: Redirige automaticamente a `/mainauth`
- **Con sesion**: Redirige automaticamente a `/main/mainpage`

### Rutas Protegidas
- Todas las rutas en el grupo `(main)` (ej: `/main/mainpage`, `/main/walk`) requieren autenticacion
- Si se intenta acceder sin sesion, se redirige a `/mainauth`

### Rutas de Autenticacion
- Todas las rutas en el grupo `(auth)` (ej: `/login`, `/register`, `/mainauth`) redirigen automaticamente a `/main/mainpage` si ya hay sesion activa

## Estructura Creada

## Estructura Creada

```
hmtyinfo/
├── .env.local                    # Configuracion de MongoDB
├── app/
│   ├── page.tsx                 # Redirige a mainauth o mainpage segun sesion
│   ├── api/
│   │   └── auth/
│   │       ├── login/
│   │       │   └── route.ts      # API endpoint para login
│   │       └── register/
│   │           └── route.ts      # API endpoint para registro
│   ├── (auth)/
│   │   ├── layout.tsx           # Layout: redirige a mainpage si hay sesion
│   │   ├── login/
│   │   │   └── page.tsx          # Pagina de login (funcional)
│   │   ├── register/
│   │   │   └── page.tsx          # Pagina de registro (funcional)
│   │   └── auth.module.css       # Estilos de autenticacion
│   └── (main)/
│       ├── layout.tsx           # Layout: protege rutas, redirige a mainauth si no hay sesion
│       ├── mainpage/
│       │   └── page.tsx          # Pagina principal con boton de logout
│       └── walk/
│           └── page.tsx          # Otra pagina protegida
├── lib/
│   ├── db.ts                    # Conexion a MongoDB
│   └── auth.ts                  # Logica de autenticacion
├── models/
│   └── User.ts                  # Interfaces TypeScript
├── hooks/
│   └── useAuth.ts               # Hooks de autenticacion
└── types/
    └── user.d.ts                # Tipos globales
```

## Archivos Modificados

1. **package.json** - Se agregaron dependencias:
   - `mongodb` - Driver oficial de MongoDB
   - `bcryptjs` - Para hashear contrasenias
   - `@types/bcryptjs` - Tipos TypeScript para bcryptjs

2. **app/(auth)/auth.module.css** - Se agregaron estilos para formularios

## Configuracion

### Variables de Entorno (.env.local)

```
MONGODB_URI=mongodb://localhost:27017/hmtyauth
MONGODB_DB=hmtyauth
```

Puedes cambiar la URI de MongoDB segun tu configuracion:
- Local: `mongodb://localhost:27017/hmtyauth`
- MongoDB Atlas: `mongodb+srv://<usuario>:<password>@cluster.mongodb.net/hmtyauth?retryWrites=true&w=majority`

### Conexion a MongoDB

El archivo `lib/db.ts` maneja la conexion a la base de datos con caching para optimizar el rendimiento.

## API Endpoints

### POST /api/auth/register

Registro de nuevos usuarios.

**Request Body:**
```json
{
  "name": "Nombre del usuario",
  "email": "correo@ejemplo.com",
  "password": "contraseña123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "user": {
    "_id": "...",
    "name": "Nombre del usuario",
    "email": "correo@ejemplo.com",
    "createdAt": "..."
  },
  "message": "Usuario registrado correctamente"
}
```

**Response (Error):**
```json
{
  "error": "El correo electronico ya esta en uso"
}
```

### POST /api/auth/login

Inicio de sesion.

**Request Body:**
```json
{
  "email": "correo@ejemplo.com",
  "password": "contraseña123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "user": {
    "_id": "...",
    "name": "Nombre del usuario",
    "email": "correo@ejemplo.com"
  },
  "message": "Inicio de sesion exitoso"
}
```

**Response (Error):**
```json
{
  "error": "Correo electronico o contraseña incorrectos"
}
```

## Funcionalidades de las Paginas

### Login Page (/login)

- Formulario con campos: email y password
- Validacion de campos obligatorios
- Mensajes de error y exito
- Al iniciar sesion exitosamente:
  - Guarda usuario en localStorage
  - Marca sesion como activa
  - Redirige a /main/mainpage

### Register Page (/register)

- Formulario con campos: nombre, email y password
- Validacion de campos obligatorios
- Mensajes de error y exito
- Verificacion de email unico
- Al registrar exitosamente:
  - Redirige a /login

## Seguridad

- Las contrasenias se hashean con bcryptjs (cost factor: 10)
- Nunca se envian contrasenias en texto plano en las respuestas
- Se usa conexion SSL con MongoDB (si usas Atlas)

## Hooks de Autenticacion

### useAuth()

Hook para verificar estado de autenticacion actual:

```tsx
"use client";
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { user, isLogged, isLoading, error } = useAuth();
  
  if (isLoading) return <div>Cargando...</div>;
  if (!isLogged) return <div>Por favor inicia sesion</div>;
  
  return <div>Bienvenido, {user?.name}</div>;
}
```

### useLogin(email, password)

Funcion para iniciar sesion programaticamente:

```tsx
const handleLogin = async () => {
  const result = await useLogin(email, password);
  if (result.success) {
    // Redirigir o mostrar mensaje de exito
  } else {
    // Mostrar error
    console.error(result.error);
  }
};
```

### useRegister(name, email, password)

Funcion para registrar usuario programaticamente:

```tsx
const handleRegister = async () => {
  const result = await useRegister(name, email, password);
  if (result.success) {
    // Redirigir a login
  } else {
    // Mostrar error
    console.error(result.error);
  }
};
```

### logout()

Funcion para cerrar sesion:

```tsx
import { logout } from '@/hooks/useAuth';

<button onClick={logout}>Cerrar sesion</button>
```

## Base de Datos MongoDB

### Coleccion: users

Documento de usuario:
```json
{
  "_id": ObjectId("..."),
  "name": "Nombre del usuario",
  "email": "correo@ejemplo.com",
  "password": "$2a$10$..." (hashed),
  "createdAt": ISODate("2026-09-12T00:00:00Z")
}
```

### Indices Recomendados

```javascript
// Crea indice unico para email
db.users.createIndex({ email: 1 }, { unique: true });
```

## Uso Local

Para probar localmente:

1. Instala MongoDB Community Server en tu maquina
2. Crea una base de datos llamada `hmtyauth`
3. Ejecuta el proyecto: `npm run dev`

O usa MongoDB Atlas para pruebas en la nube.

## Solucion de Problemas

### Error: MongoDB connection refused
- Verifica que MongoDB este corriendo
- Verifica la URI en .env.local
- Verifica que el puerto 27017 este abierto

### Error: Email already exists
- El email debe ser unico en la coleccion users
- Puedes eliminar la base de datos y empezar de nuevo

### Error: Invalid credentials
- Verifica que el email y password sean correctos
- El password debe ser el mismo con el que te registraste

## Solucion al Bug de Animacion

### Problema
La animacion del ColorBends se reiniciaba cada vez que se escribia en los inputs del formulario.

### Causa
El componente ColorBends dependia de todas sus props en el useEffect, y cada vez que el componente padre (login/register) se re-renderizaba por cambios de estado (email, password, etc.), el ColorBends se desmontaba y volvia a montar, reiniciando la animacion.

### Solucion
1. **React.memo en ColorBends**: Se envolvio el componente ColorBends en `React.memo` para evitar re-renders innecesarios.
2. **Componentes memoizados en paginas**: Cada pagina (login, register) tiene su AnimationSection como componente memoizado que contiene el ColorBends.

Esto garantiza que el ColorBends solo se monte una vez y la animacion continue sin interrupciones.

## Flujo de Autenticacion Completo

```
Usuario no autenticado:
1. Accede a localhost:3000 /
   └── Redirige a /mainauth
2. En /mainauth:
   ├── Clic en "Iniciar sesion" → /login
   └── Clic en "Crear cuenta" → /register
3. En /login:
   ├── Ingresa email y password
   ├── Submit → POST /api/auth/login
   │   ├── Credenciales validas → Guarda sesion en localStorage
   │   │   └── Redirige a /main/mainpage
   │   └── Credenciales invalidas → Muestra error
   └── Ya tiene sesion → Redirige a /main/mainpage
4. En /register:
   ├── Ingresa nombre, email y password
   ├── Submit → POST /api/auth/register
   │   ├── Registro exitoso → Redirige a /login
   │   └── Email ya existe → Muestra error
   └── Ya tiene sesion → Redirige a /main/mainpage

Usuario autenticado:
1. Accede a localhost:3000 /
   └── Redirige a /main/mainpage
2. En /main/mainpage:
   ├── Ve panel de control
   └── Clic en "Cerrar sesion" → Borra sesion de localStorage
       └── Redirige a /mainauth
3. Intentar acceder a /login, /register o /mainauth:
   └── Redirige automaticamente a /main/mainpage
4. Intentar acceder a /main/* (cualquier ruta del grupo main):
   └── Muestra el contenido (protegido)
```

## Componentes de Redireccion

### app/AuthWrapper.tsx
Componente wrapper global que protege TODAS las rutas:
- Verifica estado de autenticacion en cada cambio de ruta
- Redirige a `/mainauth` si no hay sesion y se intenta acceder a una ruta protegida
- Redirige a `/main/mainpage` si hay sesion y se intenta acceder a rutas publicas
- Muestra loading mientras verifica la autenticacion

### app/layout.tsx
Layout raiz que envuelve todo con AuthWrapper para proteccion global.

### app/page.tsx
Componente raiz que verifica sesion y redirige:
- Con sesion: `/main/mainpage`
- Sin sesion: `/mainauth`

### app/(auth)/layout.tsx
Layout del grupo auth que redirige si ya hay sesion:
- Si hay sesion: redirige a `/main/mainpage`
- Si no hay sesion: muestra los hijos (paginas de autenticacion)

### app/(main)/layout.tsx
Layout del grupo main que protege rutas:
- Si hay sesion: muestra los hijos (paginas protegidas)
- Si no hay sesion: redirige a `/mainauth`

## Validaciones de Seguridad

### Validacion de Correo Electronico

**Solo se aceptan correos de empresas/negocios personalizados.**

**Dominios BLOQUEADOS:**
- Proveedores cifrados: ProtonMail, Tutanota, Riseup, Mailfence, Skiff, Disroot
- Proveedores gratuitos: Gmail, Yahoo, Outlook, Hotmail, AOL, iCloud, Zoho, Yandex, GMX
- Correos temporales: Mailinator, Temp-Mail, Guerrilla Mail, Throwaway Mail, TrashMail, etc.

**Formato aceptado:** `tu@tuempresa.com` (cualquier dominio personalizado de empresa)

### Validacion de Contraseña

Requisitos minimos:
- **8 caracteres** como minimo
- **1 letra mayuscula** (A-Z)
- **1 simbolo** (!@#$%^&*()_+-=[]{};':"|,.<>/?)

### Libreria de Validacion

El archivo `lib/validation.ts` contiene:
- `isValidBusinessEmail(email)` - Valida que el correo sea de empresa
- `isValidPassword(password)` - Valida que la contraseña cumpla los requisitos
- `validateUserInput(name, email, password)` - Valida todos los campos de usuario

## Persistencia de Sesion

La sesion se guarda en:
- **localStorage**: `hmtyauth_user` (informacion del usuario)
- **localStorage**: `hmtyauth_logged` (estado de autenticacion)

La sesion persiste incluso despues de cerrar el navegador y volver a abrirlo.
