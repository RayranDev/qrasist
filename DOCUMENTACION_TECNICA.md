# QR-Asist — Documentación Técnica

**Sistema de Control de Asistencia Académica mediante Código QR**
**Universidad Republicana · 2025**

---

## Índice

1. [Descripción General](#1-descripción-general)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Stack Tecnológico](#3-stack-tecnológico)
4. [Estructura del Proyecto](#4-estructura-del-proyecto)
5. [Base de Datos](#5-base-de-datos)
6. [Roles y Permisos](#6-roles-y-permisos)
7. [Funcionalidades por Rol](#7-funcionalidades-por-rol)
8. [Flujos Principales](#8-flujos-principales)
9. [Server Actions (API interna)](#9-server-actions-api-interna)
10. [Componentes Clave](#10-componentes-clave)
11. [Variables de Entorno](#11-variables-de-entorno)
12. [Despliegue](#12-despliegue)
13. [Migraciones SQL](#13-migraciones-sql)
14. [Reglas de Negocio](#14-reglas-de-negocio)
15. [Guía de Desarrollo Local](#15-guía-de-desarrollo-local)

---

## 1. Descripción General

QR-Asist es una plataforma web progresiva (PWA-compatible) diseñada para digitalizar y automatizar el control de asistencia en entornos académicos universitarios. Reemplaza las listas físicas por un flujo rápido basado en códigos QR temporales:

1. El docente genera un QR único para cada sesión de clase.
2. Los estudiantes escanean el QR desde su celular.
3. El sistema valida, registra y consolida la asistencia en tiempo real.

**Institución objetivo:** Universidad Republicana
**Dominio institucional:** `@urepublicana.edu.co`
**URL de producción:** https://qrasist.vercel.app

---

## 2. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────┐
│                    Cliente (Navegador)                   │
│         React 19 · Next.js App Router · Tailwind CSS     │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│              Servidor (Vercel Edge / Node)               │
│    Next.js 16 Server Components · Server Actions         │
│    SSR · Streaming · Route Handlers                      │
└──────────┬───────────────────────────┬──────────────────┘
           │                           │
┌──────────▼──────────┐   ┌────────────▼────────────────┐
│   Supabase Auth      │   │   Supabase Database          │
│   GoTrue (JWT)       │   │   PostgreSQL 15              │
│   Session cookies    │   │   Row Level Security         │
└─────────────────────┘   └─────────────────────────────┘
```

**Principios de diseño:**
- **Server-first:** toda la lógica sensible corre en el servidor (Server Actions)
- **Sin API REST expuesta:** no hay endpoints públicos, todo va por Server Actions firmadas
- **Sin estado global en cliente:** la sesión vive en cookies SSR de Supabase
- **Soft delete:** los datos nunca se borran, se marcan como inactivos (`is_active = false`)

---

## 3. Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.6 |
| UI Library | React | 19.2.4 |
| Lenguaje | TypeScript | 5.x |
| Estilos | Tailwind CSS | 4.x |
| Base de datos | PostgreSQL (Supabase) | 15 |
| Autenticación | Supabase Auth (GoTrue) | 2.x |
| SDK cliente | @supabase/supabase-js | 2.106.0 |
| SSR Auth | @supabase/ssr | 0.10.3 |
| Scanner QR | html5-qrcode | 2.3.8 |
| Generador QR | qrcode.react | 4.2.0 |
| Fechas | date-fns (locale ES) | 4.2.1 |
| Iconos | Lucide React / SVG inline | 1.16.0 |
| Deploy | Vercel | — |

---

## 4. Estructura del Proyecto

```
src/
├── app/
│   ├── layout.tsx                    ← Layout raíz (NavigationProgress)
│   ├── page.tsx                      ← Redirect a /login
│   ├── globals.css                   ← Tailwind + keyframes CSS
│   │
│   ├── (auth)/login/                 ← Login + Registro estudiantes
│   │   ├── page.tsx
│   │   ├── AuthForm.tsx              ← Formulario con toggle login/signup
│   │   └── actions.ts                ← Server Actions: login(), signup()
│   │
│   ├── auth/signout/route.ts         ← POST handler para cerrar sesión
│   ├── dashboard/page.tsx            ← Redirect según rol
│   │
│   ├── admin/
│   │   ├── dashboard/page.tsx        ← Dashboard con consolidados
│   │   ├── subjects/
│   │   │   ├── page.tsx              ← Gestión de materias
│   │   │   ├── SubjectComponents.tsx ← Formularios crear/editar/archivar
│   │   │   └── [id]/enrollments/
│   │   │       ├── page.tsx          ← Inscribir estudiantes
│   │   │       └── EnrollmentManager.tsx
│   │   └── users/
│   │       ├── page.tsx              ← Gestión de usuarios
│   │       ├── AdminUserList.tsx     ← Tabla con filtros
│   │       ├── UserComponents.tsx    ← Crear/editar/desactivar usuarios
│   │       └── RoleSelect.tsx        ← Selector de rol inline
│   │
│   ├── professor/
│   │   ├── subjects/
│   │   │   ├── page.tsx              ← Mis materias + saludo
│   │   │   ├── SessionButton.tsx     ← Generar sesión QR
│   │   │   └── ProfileModal.tsx      ← Editar perfil docente
│   │   ├── session/[id]/page.tsx     ← QR en pantalla con countdown
│   │   └── history/
│   │       ├── page.tsx              ← Historial por materia
│   │       └── HistoryDrillDown.tsx  ← Drill-down: materia→sesión→asistentes
│   │
│   └── student/
│       ├── scanner/page.tsx          ← Scanner QR + últimas asistencias
│       └── history/page.tsx          ← Historial completo
│
├── components/
│   ├── LocalTime.tsx                 ← Hora en zona horaria local (SSR-safe)
│   ├── MobileWarningBanner.tsx       ← Banner "usar en PC" (solo admin)
│   ├── NavigationProgress.tsx        ← Animación QR entre páginas
│   └── qr/
│       ├── QRDisplay.tsx             ← Renderiza QR + countdown
│       └── QRScanner.tsx             ← Cámara + validación + feedback
│
└── lib/
    ├── supabase/
    │   ├── server.ts                 ← Cliente SSR (cookies)
    │   ├── client.ts                 ← Cliente browser
    │   └── adminClient.ts            ← Cliente service role (server-only)
    └── actions/
        ├── admin.ts                  ← CRUD usuarios + roles
        ├── adminSubjects.ts          ← CRUD materias
        ├── enrollments.ts            ← Inscribir/quitar estudiantes
        ├── session.ts                ← Crear sesión QR
        ├── attendance.ts             ← Registrar asistencia
        ├── professorHistory.ts       ← Archivar/reactivar sesiones
        └── profile.ts                ← Editar perfil propio
```

---

## 5. Base de Datos

### Esquema

```sql
-- Perfil público de cada usuario
profiles (
  id            UUID  PK → auth.users(id)
  role          ENUM  'ADMIN' | 'PROFESSOR' | 'STUDENT'
  name          TEXT  NOT NULL
  student_code  TEXT  UNIQUE
  email         TEXT
  is_active     BOOL  DEFAULT true
)

-- Materias académicas
subjects (
  id            UUID  PK
  name          TEXT  NOT NULL
  code          TEXT  UNIQUE NOT NULL
  professor_id  UUID  → profiles(id)
  is_active     BOOL  DEFAULT true
)

-- Inscripciones de estudiantes en materias
enrollments (
  id          UUID  PK
  student_id  UUID  → profiles(id)
  subject_id  UUID  → subjects(id)
  UNIQUE(student_id, subject_id)
)

-- Sesiones de clase con QR
sessions (
  id               UUID  PK
  subject_id       UUID  → subjects(id)
  date             TIMESTAMPTZ  DEFAULT NOW()
  duration_minutes INT   DEFAULT 90
  qr_token         UUID  UNIQUE (token del QR)
  expires_at       TIMESTAMPTZ
  is_active        BOOL  DEFAULT true
)

-- Registro de asistencias
attendances (
  id          UUID  PK
  session_id  UUID  → sessions(id)
  student_id  UUID  → profiles(id)
  scanned_at  TIMESTAMPTZ  DEFAULT NOW()
  ip_address  TEXT
  UNIQUE(session_id, student_id)
)
```

### Trigger automático

```sql
-- Al crear un usuario en auth.users, se crea su perfil automáticamente
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, role, name, student_code, email)
  VALUES (
    new.id, 'STUDENT',
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'student_code',
    new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Constraint de dominio institucional

```sql
ALTER TABLE profiles ADD CONSTRAINT chk_email_domain CHECK (
  role = 'ADMIN' OR email IS NULL OR email LIKE '%@urepublicana.edu.co'
);
```

---

## 6. Roles y Permisos

| Acción | ADMIN | PROFESSOR | STUDENT |
|--------|:-----:|:---------:|:-------:|
| Ver dashboard consolidado | ✅ | ❌ | ❌ |
| Crear/editar/archivar materias | ✅ | ❌ | ❌ |
| Inscribir/quitar estudiantes | ✅ | ❌ | ❌ |
| Crear/editar/desactivar usuarios | ✅ | ❌ | ❌ |
| Cambiar roles | ✅ | ❌ | ❌ |
| Ver mis materias | ❌ | ✅ | ❌ |
| Generar QR para sesión | ❌ | ✅ | ❌ |
| Ver historial de asistencia | ❌ | ✅ | ❌ |
| Exportar CSV de asistencia | ❌ | ✅ | ❌ |
| Archivar sesiones propias | ❌ | ✅ | ❌ |
| Editar perfil propio | ❌ | ✅ | ❌ |
| Escanear QR | ❌ | ❌ | ✅ |
| Ver propio historial | ❌ | ❌ | ✅ |

---

## 7. Funcionalidades por Rol

### Administrador

- **Dashboard:** tarjetas con totales (admins, docentes, estudiantes, materias, sesiones del día). Consolidados: docentes → materias asignadas, materias → estudiantes inscritos, estudiantes → materias inscritas.
- **Gestión de usuarios:** crear con correo `@urepublicana.edu.co`, código institucional de 12 dígitos, rol y contraseña. Editar nombre/código/contraseña. Desactivar (soft delete) con confirmación por nombre. Reactivar usuarios inactivos. Filtros por rol y estado.
- **Gestión de materias:** crear con nombre y código único. Asignar docente. Archivar/reactivar. Gestionar inscripciones de estudiantes por materia.
- **Acceso recomendado:** escritorio (banner visible en mobile).

### Docente

- **Panel de materias:** saludo personalizado, cantidad de estudiantes por materia.
- **Generación de QR:** crea una sesión de 15 min por defecto con QR único. Countdown en tiempo real. El QR se puede proyectar en pantalla para que los estudiantes escaneen.
- **Historial:** navegación drill-down en 3 niveles: materias → sesiones → asistentes. Diferencia entre estudiantes regulares (inscritos) e invitados. Exporta CSV por sesión. Puede archivar/reactivar sesiones.
- **Perfil:** editar nombre y contraseña desde la misma pantalla.

### Estudiante

- **Pantalla principal:** saludo con nombre y código institucional. Scanner QR activo al entrar. Últimas 5 asistencias visibles sin navegación extra.
- **Registro:** escanea el QR del docente → el sistema valida token, expiración, inscripción y duplicado del día → muestra confirmación con nombre de materia, código y hora exacta.
- **Historial completo:** lista cronológica de todas sus asistencias con materia, código y hora.

---

## 8. Flujos Principales

### Flujo de registro de asistencia

```
Estudiante abre /student/scanner
        ↓
Cámara activa (html5-qrcode)
        ↓
Escanea QR → extrae UUID token
        ↓
Validación frontend: ¿formato UUID válido?
        ↓ sí
Server Action: registerAttendance(token)
        ↓
¿Sesión existe? → NO → Error "QR inválido"
        ↓ sí
¿Sesión is_active? → NO → Error "Sesión archivada"
        ↓ sí
¿Token expirado? → SI → Error "QR expirado"
        ↓ no
¿Ya registró esta materia hoy? → SI → Error "Duplicado"
        ↓ no
¿Estudiante inscrito en la materia?
        ↓
INSERT attendances → UNIQUE constraint protege doble-insert
        ↓
Inscrito → ✅ "Asistencia registrada · Materia · Hora"
No inscrito → ⚠️ "Registrado como invitado"
```

### Flujo de generación de QR

```
Docente en /professor/subjects
        ↓
Clic en "Iniciar Sesión (Generar QR)"
        ↓
Server Action: createSession(subjectId)
  → INSERT sessions con qr_token = uuid_generate_v4()
  → expires_at = NOW() + 15 min
        ↓
Redirect a /professor/session/[id]
        ↓
QRDisplay renderiza el token como QR SVG
Countdown actualiza cada 1 segundo
        ↓
Al expirar → QR se muestra como inactivo
```

---

## 9. Server Actions (API interna)

### `src/lib/actions/attendance.ts`
| Función | Descripción |
|---------|-------------|
| `registerAttendance(qrToken)` | Valida y registra asistencia. Retorna resultado detallado con nombre de materia y hora. |

### `src/lib/actions/session.ts`
| Función | Descripción |
|---------|-------------|
| `createSession(subjectId, duration?)` | Crea sesión con QR único. Default: 15 min. |

### `src/lib/actions/admin.ts`
| Función | Descripción |
|---------|-------------|
| `createUserAccount(formData)` | Crea usuario con validación de dominio `@urepublicana.edu.co` |
| `updateUserAccount(userId, data)` | Edita nombre, código y/o contraseña |
| `deleteUserAccount(userId)` | Soft delete: `is_active = false` |
| `reactivateUser(userId)` | Reactiva usuario inactivo |
| `updateUserRole(userId, role)` | Cambia rol (protege auto-degradación del admin) |

### `src/lib/actions/adminSubjects.ts`
| Función | Descripción |
|---------|-------------|
| `createSubject(formData)` | Crea materia con nombre, código y profesor |
| `updateSubject(id, data)` | Edita materia |
| `deleteSubject(id)` | Soft delete de materia |
| `reactivateSubject(id)` | Reactiva materia archivada |

### `src/lib/actions/professorHistory.ts`
| Función | Descripción |
|---------|-------------|
| `deleteSession(id)` | Archiva sesión (solo el docente propietario) |
| `reactivateSession(id)` | Reactiva sesión archivada |

### `src/lib/actions/profile.ts`
| Función | Descripción |
|---------|-------------|
| `updateOwnProfile(data)` | Docente actualiza su propio nombre/contraseña |

---

## 10. Componentes Clave

### `QRScanner.tsx`
- Usa `html5-qrcode` para acceder a la cámara trasera
- Valida formato UUID antes de llamar al servidor
- Estados: `idle` → `loading` → `success | guest | error`
- Marcadores de esquina verdes animados
- Botón "Escanear de nuevo" en todos los estados finales

### `QRDisplay.tsx`
- Renderiza el token como SVG con `qrcode.react`
- Countdown client-side que actualiza cada segundo
- Indicador "Activo" con punto pulsante verde
- Al expirar: pantalla de QR expirado

### `HistoryDrillDown.tsx`
- Nivel 1: cards de materias (activas y archivadas diferenciadas)
- Nivel 2: sesiones activas y archivadas con botón archivar/reactivar
- Nivel 3: tabla de asistentes con columnas nombre, código, fecha, hora
- Exporta CSV completo por sesión

### `NavigationProgress.tsx`
- Detecta cambios de ruta con `usePathname`
- Muestra un mini overlay con el ícono QR de la app y línea de escaneo animada
- Duración: 800ms, no invasivo

---

## 11. Variables de Entorno

```env
# .env.local (nunca subir a git)
NEXT_PUBLIC_SUPABASE_URL=https://[proyecto].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   ← solo servidor, nunca exponer al cliente
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**En Vercel:** configurar las mismas variables en Settings → Environment Variables.

---

## 12. Despliegue

### Vercel (producción)
```bash
git push origin main   # Vercel detecta el push y despliega automáticamente
```

### Local (desarrollo)
```bash
npm install
npm run dev            # http://localhost:3000
```

### Build de producción
```bash
npm run build
npm start
```

---

## 13. Migraciones SQL

Ejecutar en orden en el SQL Editor de Supabase:

| Archivo | Descripción |
|---------|-------------|
| `RESET_DATABASE.sql` | Reconstruye la BD completa desde cero (solo desarrollo) |
| `UPDATE_SCHEMA.sql` | Agrega `student_code` a profiles |
| `SOFT_DELETE_MIGRATION.sql` | Agrega `is_active` a profiles, subjects, sessions |
| `ADD_EMAIL_MIGRATION.sql` | Agrega `email` a profiles y actualiza trigger |
| `SETUP_INICIAL.sql` | Limpia datos de prueba, crea materias y constraint de dominio |

---

## 14. Reglas de Negocio

1. **Dominio institucional:** docentes y estudiantes deben usar `@urepublicana.edu.co`. Admins pueden usar cualquier dominio.
2. **Código institucional:** exactamente 12 dígitos numéricos, único por usuario.
3. **QR temporal:** cada sesión tiene un token UUID único que expira en 15 minutos.
4. **Anti-duplicados diarios:** un estudiante no puede registrar asistencia en la misma materia más de una vez por día.
5. **Invitados:** si el estudiante escanea un QR de una materia en la que no está inscrito, queda registrado como "invitado".
6. **Soft delete:** usuarios, materias y sesiones nunca se eliminan físicamente. Se marcan como `is_active = false`. Sus datos históricos se conservan.
7. **Bloqueo de inactivos:** un usuario con `is_active = false` no puede iniciar sesión (se hace signOut automático).
8. **Sesiones archivadas:** no aceptan nuevos registros de asistencia.
9. **Auto-protección admin:** el admin no puede cambiar su propio rol ni desactivarse a sí mismo.
10. **Registro de IP:** cada asistencia guarda la IP del dispositivo para auditoría.

---

## 15. Guía de Desarrollo Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/RayranDev/qrasist.git
cd qrasist

# 2. Instalar dependencias
npm install

# 3. Crear .env.local con las variables de Supabase

# 4. Ejecutar migraciones en Supabase SQL Editor (en orden)

# 5. Iniciar servidor de desarrollo
npm run dev

# 6. Abrir http://localhost:3000
```

### Convenciones de código
- Componentes de servidor: `page.tsx`, `layout.tsx` (sin `'use client'`)
- Componentes de cliente: archivos con interactividad (`useState`, `useEffect`)
- Server Actions: archivos en `src/lib/actions/` con `'use server'`
- Estilos: solo clases de Tailwind, sin CSS custom salvo `globals.css`

---

*Documentación generada para QR-Asist v1.0 · Universidad Republicana · 2025*
