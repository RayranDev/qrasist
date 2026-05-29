# QR-Asist — Sistema de Control de Asistencia por QR

Plataforma web académica para gestión de asistencia universitaria mediante códigos QR. Construida con **Next.js 16**, **Supabase** y desplegada en **Vercel**.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Estilos | Tailwind CSS 4 |
| Base de datos | PostgreSQL (Supabase) |
| Auth | Supabase Auth (SSR) |
| QR Scanner | html5-qrcode |
| QR Generator | qrcode.react |
| Deploy | Vercel |

---

## Roles y Rutas

| Rol | Ruta inicial | Descripción |
|-----|-------------|-------------|
| ADMIN | `/admin/dashboard` | Dashboard con consolidados, gestión de usuarios y materias |
| PROFESSOR | `/professor/subjects` | Materias asignadas, generación de QR, historial |
| STUDENT | `/student/scanner` | Escaneo QR + historial reciente |

---

## Estructura de Rutas

```
/login                          — Login / Registro de estudiantes
/dashboard                      — Redirect según rol
/admin/dashboard                — Dashboard general (Admin)
/admin/subjects                 — Gestión de materias
/admin/subjects/[id]/enrollments — Inscribir/quitar estudiantes
/admin/users                    — Gestión de usuarios
/professor/subjects             — Materias del docente + saludo personalizado
/professor/session/[id]         — Vista QR activo con countdown
/professor/history              — Historial drill-down por materia/sesión
/student/scanner                — Scanner QR + últimas 5 asistencias
/student/history                — Historial completo del estudiante
```

---

## Esquema de Base de Datos

```sql
profiles       — id, role (ADMIN|PROFESSOR|STUDENT), name, student_code
subjects       — id, name, code, professor_id
enrollments    — student_id, subject_id  [UNIQUE]
sessions       — id, subject_id, date, qr_token, expires_at
attendances    — id, session_id, student_id, scanned_at, ip_address  [UNIQUE por sesión+estudiante]
```

**Trigger automático:** Al crear un usuario en Supabase Auth, se genera su `profile` con rol `STUDENT`.

---

## Configuración Local

### Variables de entorno (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=tu_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

### Comandos

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo en localhost:3000
npm run build      # build de producción
npm start          # servidor de producción
```

---

## Funcionalidades por Rol

### Administrador
- Dashboard con resumen: total usuarios, materias, sesiones del día
- Consolidados: docentes → N materias, materias → N estudiantes, estudiantes → N materias
- Crear/editar/eliminar materias (con asignación de profesor)
- Crear/editar/eliminar usuarios con roles
- Cambio de rol en tiempo real
- Eliminación de usuario con confirmación por nombre (anti-accidental)
- Banner de recomendación para usuarios mobile

### Docente
- Saludo personalizado con nombre y conteo de estudiantes por materia
- Edición de propio perfil (nombre, contraseña)
- Generación de QR por sesión (15 min default) con countdown en tiempo real
- Historial drill-down: Materias → Sesiones → Asistentes (regulares + invitados)
- Exportar lista de asistencia a CSV por sesión
- Eliminar sesiones erróneas

### Estudiante
- Escaneo QR con cámara (feedback detallado: materia + código + hora)
- Historial de las últimas 5 asistencias visible en pantalla principal
- Historial completo paginado
- Registro con validación: código de 12 dígitos numéricos obligatorio

### Validaciones generales
- No se permiten duplicados de asistencia para la misma materia en el mismo día
- Código QR con validación de formato UUID antes de llamar al servidor
- Mensaje de error específico de la app (no alertas nativas del navegador)

---

## Deploy en Vercel

1. Conectar el repositorio en [vercel.com](https://vercel.com)
2. Configurar las variables de entorno en el panel de Vercel
3. Cada `git push origin main` genera un deploy automático

---

## Paleta de Colores

| Token | Valor | Uso |
|-------|-------|-----|
| Primary | `emerald-600` `#059669` | Botones, acentos, links |
| Background | `#F7F7F5` | Fondo general |
| Surface | `#FFFFFF` | Cards, modales |
| Success | `emerald-500` | Registro exitoso |
| Warning | `amber-500` | Invitado, alertas |
| Error | `red-600` | Errores de registro |
