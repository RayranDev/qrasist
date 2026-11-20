# QR-Asist — Sistema de Control de Asistencia por QR

Plataforma web académica para gestión de asistencia universitaria mediante códigos QR. Construida con **Next.js 16**, **Supabase** y desplegada en **Vercel**.

---

## Stack Tecnológico

| Capa          | Tecnología                                    |
| ------------- | --------------------------------------------- |
| Frontend      | Next.js 16 (App Router), React 19, TypeScript |
| Estilos       | Tailwind CSS 4                                |
| Base de datos | PostgreSQL (Supabase)                         |
| Auth          | Supabase Auth (SSR)                           |
| QR Scanner    | html5-qrcode                                  |
| QR Generator  | qrcode.react                                  |
| Deploy        | Vercel                                        |

---

## Roles y Rutas

| Rol       | Ruta inicial          | Descripción                                                                                                                            |
| --------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ADMIN     | `/admin/dashboard`    | Coordinación: panel, usuarios, estructura académica, materias, asistencia, justificaciones, reportes, auditoría y configuración global |
| PROFESSOR | `/professor/subjects` | Materias asignadas, generación de QR, solicitudes de inscripción, historial                                                            |
| STUDENT   | `/student/scanner`    | Escaneo QR, materias, historial y justificaciones                                                                                      |

---

## Estructura de Rutas

```
/login                           — Login / Registro de estudiantes
/forgot-password, /reset-password — Recuperación de contraseña
/dashboard                       — Redirect según rol

/admin/dashboard                 — Panel de coordinación + Configuración de asistencia (parámetros globales)
/admin/users                     — Gestión de usuarios, cambio de rol, carga masiva desde Excel
/admin/academic                  — Carreras, pénsum, períodos y cortes
/admin/subjects                  — Materias (horario, política global o personalizada)
/admin/subjects/[id]/enrollments — Inscribir/quitar estudiantes
/admin/enrollment-requests       — Solicitudes de inscripción (por materia / por estudiante, aprobación masiva)
/admin/attendance                — Asistencia pasada (lista y calendario), panel «IP y ubicación»
/admin/omissions                 — Clases no registradas y suspendidas
/admin/justifications            — Justificaciones y excusas (aprobar, cambiar decisión, aprobar en lote)
/admin/audit                     — Bitácora de auditoría
/admin/import-template           — Plantillas de Excel con listas desplegables (descarga)
/admin/reports/*                 — Reportes en PDF y Excel (por corte, por rango, por usuario)

/professor/subjects              — Materias del docente + saludo personalizado
/professor/session/[id]          — Vista QR activo con countdown y lista en vivo
/professor/requests              — Solicitudes de inscripción de sus materias
/professor/history               — Historial drill-down por materia/sesión
/professor/justifications        — Estado de las justificaciones de sus estudiantes (solo lectura)

/student/scanner                 — Scanner QR + últimas 5 asistencias
/student/subjects                — Materias de su carrera, inscripción y justificaciones
/student/history                 — Historial completo del estudiante

/api/health, /api/cron/maintenance — Salud de la base de datos y mantenimiento diario
```

---

## Esquema de Base de Datos

```sql
profiles       — id, role (ADMIN|PROFESSOR|STUDENT), name, student_code
subjects       — id, name, code, professor_id
enrollments    — student_id, subject_id  [UNIQUE]
sessions       — id, subject_id, date, qr_token, expires_at, qr_rotation_seconds, modality
attendances    — id, session_id, student_id, scanned_at, ip_address  [UNIQUE por sesión+estudiante]
app_settings   — fila única (id = 1) con los parámetros globales de asistencia (ver abajo)
```

La lista completa de tablas y migraciones (001–038) está en `supabase/migrations/`.

**Trigger automático:** Al crear un usuario en Supabase Auth, se genera su `profile` con rol `STUDENT`.

---

## Parámetros globales de asistencia

Los define solo coordinación (ADMIN) en **Dashboard → Configuración de asistencia**. Cada cambio exige un motivo y queda en la auditoría con el valor anterior y el nuevo. Detalle completo en [`docs/tecnica/parametros-de-asistencia.md`](docs/tecnica/parametros-de-asistencia.md).

| Parámetro                     | Por defecto      | Rango                                       |
| ----------------------------- | ---------------- | ------------------------------------------- |
| Ventana de registro por QR    | 30 min           | 1 a 60 min                                  |
| Rotación del código QR        | 20 s             | 10 a 60 s                                   |
| Duración de clase por defecto | 120 min          | 30 a 360 min                                |
| Tolerancia de tardanza        | 20 min           | 1 a 180 min (o sin seguimiento)             |
| Tardanzas por falta           | sin conversión   | 1 a 10 (o vacío)                            |
| Regla de faltas               | Porcentaje, 20 % | Porcentaje 1 a 100 % o cantidad fija 1 a 50 |

La política de asistencia (tolerancia, tardanzas por falta y regla de faltas) la heredan todas las materias; un ADMIN puede dar a una materia una política personalizada, con motivo. Los docentes no pueden cambiar ninguno de estos valores. Las sesiones ya iniciadas conservan la ventana y la rotación con que se abrieron.

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

- Dashboard con lo que requiere acción hoy, presentismo institucional, reportes por corte y consolidados paginados
- Configuración de asistencia global (ventana de registro, rotación del QR, duración de clase y política de asistencia) con motivo obligatorio y auditoría
- Estructura académica: carreras, pénsum, períodos y cortes
- Crear/editar/archivar materias (con profesor, horario, modalidad y política global o personalizada)
- Crear/editar/desactivar usuarios con roles; cambio de rol que desvincula lo del rol anterior
- Carga masiva desde Excel (usuarios, materias, inscripciones) con plantillas que traen listas desplegables de carreras, períodos, docentes, materias y estudiantes
- Solicitudes de inscripción por materia o por estudiante, con aprobación o rechazo masivo
- Corrección de asistencia de clases pasadas (lista y calendario), registro de clases pasadas, suspensiones y clases no registradas
- Justificaciones: aprobar, rechazar, cambiar una decisión ya tomada (con motivo) y aprobar hasta 50 en lote; registro de excusas
- Panel «IP y ubicación» por clase presencial y reportes en Excel con la opción «Incluir IP y ubicación» (queda auditado)
- Reportes por corte, por rango de fechas y por usuario en PDF y Excel; bitácora de auditoría
- Banner de recomendación para usuarios mobile

### Docente

- Saludo personalizado con nombre y conteo de estudiantes por materia
- Edición de propio perfil (nombre, contraseña)
- Generación de QR por sesión: la ventana de registro (30 min por defecto) y la rotación del código (20 s por defecto) las define coordinación; el docente no las ajusta. Countdown en tiempo real
- Solicitudes de inscripción de sus materias, por materia o por estudiante, con aprobación masiva
- Historial drill-down: Materias → Sesiones → Asistentes (regulares + invitados)
- Descargar el reporte de asistencia de cada materia en **PDF** (todo el período o un corte): estudiantes, porcentaje por corte, estado, clases y observaciones. Los docentes descargan reportes solo en PDF (no Excel)
- Eliminar sesiones erróneas

### Estudiante

- Escaneo QR con cámara (feedback detallado: materia + código + hora). La IP y la ubicación se capturan solo en clases presenciales, nunca en las virtuales
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

## Documentación

Los documentos del proyecto están organizados en [`docs/`](docs/README.md): entregables, registro de cambios de software, guías técnicas, referencias y material archivado.

---

## Paleta de Colores

Identidad institucional, definida en [`src/app/globals.css`](src/app/globals.css).

| Token       | Valor                             | Uso                                   |
| ----------- | --------------------------------- | ------------------------------------- |
| Navy        | `navy-900` `#002849`              | Encabezados, navegación, texto fuerte |
| Brand       | `brand-600` `#ab1b26` (vinotinto) | Botones, acentos, links               |
| Brand hover | `brand-700` `#a2121c`             | Estado hover/activo de los acentos    |
| Background  | `#FFFFFF`                         | Fondo general y tarjetas              |
| Surface     | `#F7F7F5`                         | Fondo de secciones detrás de tarjetas |
| Success     | `emerald-500`                     | Registro exitoso                      |
| Warning     | `amber-500`                       | Invitado, alertas                     |
| Error       | `red-600`                         | Errores de registro                   |

Cada color tiene una escala completa (`navy-50` a `navy-950`, `brand-50` a `brand-950`). La interfaz es solo en modo claro.
