# QR-Asist: Sistema de Control de Asistencia mediante QR

Bienvenido a la documentación arquitectónica y de planificación para QR-Asist, una aplicación web moderna construida con Next.js, Supabase y Vercel, diseñada para gestionar la asistencia universitaria de forma rápida y segura.

---

## FASE 0 — Preparación del entorno local

Antes de escribir cualquier línea de código, sigue esta guía paso a paso para preparar tu entorno de desarrollo.

### 0.1 Software y herramientas a instalar
- **Node.js**: Descarga e instala la versión LTS (recomendado 20.x o superior). Incluye `npm`/`pnpm`.
- **Git**: Instala Git y configura tu identidad:
  ```bash
  git config --global user.name "Tu Nombre"
  git config --global user.email "tu@email.com"
  ```
- **Visual Studio Code (VS Code)**: Editor de código recomendado.
  - *Extensiones sugeridas*: ESLint, Prettier, Tailwind CSS IntelliSense, Supabase.
- **Supabase CLI**: Opcional pero recomendado para ejecutar migraciones locales y generar tipos.
  ```bash
  npm install -g supabase
  ```

### 0.2 Cuentas a crear
- **GitHub**: Crea una cuenta gratuita si no tienes una.
- **Supabase**: Crea una cuenta, inicia un nuevo proyecto (plan gratuito) y anota la `Project URL` y la `anon/public key`.
- **Vercel**: Crea una cuenta usando tu inicio de sesión de GitHub.

### 0.3 Configuración de GitHub y Proyecto Base
1. Inicializa el proyecto Next.js:
   ```bash
   npx create-next-app@latest qr-asist
   # Opciones: TypeScript (Sí), ESLint (Sí), Tailwind CSS (Sí), `src/` (Sí), App Router (Sí).
   cd qr-asist
   ```
2. Inicializa Git y haz el primer commit:
   ```bash
   git init
   git add .
   git commit -m "chore: initial Next.js setup"
   ```
3. Crea un repositorio en GitHub y asócialo:
   ```bash
   git branch -M main
   git remote add origin https://github.com/tu-usuario/qr-asist.git
   git push -u origin main
   ```
4. **Estructura de ramas sugerida**:
   - `main`: Código estable de producción.
   - `develop`: Integración de desarrollo.
   - `feature/*`: Ramas para nuevas características (ej. `feature/qr-scanner`).

### 0.4 Variables de entorno
Crea un archivo `.env.local` en la raíz. **Nunca subas este archivo a GitHub**.

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=tu_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
> **Nota Vercel**: Estas variables deben configurarse en la sección "Environment Variables" en Vercel.

---

## 1. Diagrama de Arquitectura General

```mermaid
architecture-beta
    group frontend(Frontend Next.js - Vercel)
    group backend(Supabase Backend)

    service client(Cliente Web\nMobile/Desktop) in frontend
    service server_actions(Next.js App Router\nServer Actions) in frontend
    service auth(Supabase Auth) in backend
    service db(PostgreSQL DB) in backend

    client:L -- R:server_actions
    client:B -- T:auth
    server_actions:B -- T:db
    server_actions:R -- L:auth
```

---

## 2. Esquema de Base de Datos PostgreSQL

*(Las migraciones SQL y seed se detallan en el archivo GUIA_USO.md)*

### Tablas y Relaciones
- **users**: Gestionada por Supabase Auth.
- **profiles**: `id` (uuid, FK users), `role` (enum: ADMIN, PROFESSOR, STUDENT), `name` (text).
- **subjects**: `id` (uuid), `name` (text), `code` (text), `professor_id` (uuid, FK profiles).
- **enrollments**: `id` (uuid), `student_id` (uuid, FK profiles), `subject_id` (uuid, FK subjects).
- **sessions**: `id` (uuid), `subject_id` (uuid, FK subjects), `date` (timestamp), `duration_minutes` (int), `qr_token` (uuid), `expires_at` (timestamp).
- **attendances**: `id` (uuid), `session_id` (uuid, FK sessions), `student_id` (uuid, FK profiles), `scanned_at` (timestamp), `ip_address` (text).

### Políticas RLS (Row Level Security) Sugeridas
- **profiles**: Lectura pública, escritura solo ADMIN.
- **subjects**: Lectura estudiantes inscritos y profesores, escritura solo ADMIN.
- **enrollments**: Lectura involucrados, escritura solo ADMIN.
- **sessions**: Lectura involucrados, escritura solo PROFESSOR propietario.
- **attendances**: Lectura profesor y estudiante propio. Inserción permitida para estudiante validado.

---

## 3. Estructura de Carpetas (App Router)

```text
src/
├── app/
│   ├── (auth)/             # Grupo de rutas de autenticación
│   │   └── login/
│   ├── admin/              # Panel de Administrador
│   │   ├── users/
│   │   └── subjects/
│   ├── professor/          # Panel de Profesor
│   │   ├── subjects/
│   │   └── session/[id]/   # Vista con el QR generado
│   ├── student/            # Panel de Estudiante
│   │   ├── scanner/        # Cámara para escanear QR
│   │   └── history/
│   ├── api/                # Route Handlers
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/                 # Componentes genéricos
│   ├── qr/                 # Lógica QR
│   └── layout/             # Navbar, Sidebar
├── lib/
│   ├── supabase/           # Clientes de Supabase
│   ├── actions/            # Server actions
│   └── utils.ts            # Utilidades
└── types/                  # Tipos TypeScript
```

---

## 4. Endpoints de API / Server Actions

1. `createSession(subjectId, duration)`: Crea sesión, genera `qr_token` (UUID) y `expires_at`.
2. `registerAttendance(qrToken)`: 
   - Valida el token.
   - Verifica expiración y duplicidad.
   - Registra asistencia y captura IP.
3. `manageEnrollments(studentId, subjectIds[])`: (Admin) Asigna materias.
4. `getStudentHistory(studentId)`: Obtiene histórico.

---

## 5. Flujo de Escaneo QR (Estudiante)

1. **Entrada a `/student/scanner`**.
2. **Permisos**: Solicita cámara. Si denegado → "Permiso de cámara denegado." (Error 1).
3. **Escaneo**: Extrae `qrToken`.
4. **Validación UI**: ¿Formato UUID válido? Si no → "QR inválido." (Error 2).
5. **Server Action `registerAttendance(qrToken)`**:
   - *Fallo red* → "Fallo de red." (Error 5).
   - *Token expirado* → "Token expirado." (Error 3).
   - *Ya registrado* → "Asistencia ya registrada." (Error 4).
6. **Éxito**: Check animado y resumen.

---

## 6. Sistema de Diseño Ligero

**Tema**: Exclusivamente claro. Minimalista, profesional.

- **Colores (tailwind.config.ts)**:
  - Background: `#FAFAFA` (Blanco hueso)
  - Surface: `#FFFFFF` 
  - Primary (Acento): `#4F46E5` (Indigo) o `#6366F1`
  - Success: `#10B981` (Menta suave)
  - Error: `#EF4444`
  - Text Primary: `#111827`, Secondary: `#6B7280`

- **Tipografía**: `Inter` o `Outfit`.
- **UI**: Tarjetas con `rounded-2xl`, sombras sutiles (`shadow-sm`). Botones con estados hover suaves y transiciones.

---

## 7. Componentes React Principales

- `QRScanner`: Maneja cámara con `html5-qrcode`.
- `QRDisplay`: Renderiza QR con `qrcode.react`, incluye cuenta regresiva.
- `SubjectCard`: Metáfora visual de la materia.
- `FeedbackModal`: Toast animado para éxito/error.

---

## 8. Plan de Implementación (3 Semanas)

- **Semana 1: Fundación y Auth**. Repo, Vercel, BD Supabase, Next.js UI base, Auth.
- **Semana 2: Core Funcional**. Admin y Profesor (CRUDs y creación de sesiones).
- **Semana 3: Escaneo QR**. Integración cámara, validación QR, manejo exhaustivo de errores y UI final.
