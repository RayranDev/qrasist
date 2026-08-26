# Checklist de Progreso del Proyecto

Utiliza este checklist para dar seguimiento a las tareas del plan de implementación. 
Actualiza el estado de cada tarea conforme se vaya avanzando.

**Estados:**
- ✅ Completada
- 🔄 En progreso
- ⬜ Pendiente

---

## Fase 1: Fundación y Auth (Semana 1)
- [x] ✅ Inicialización del repositorio Git y conexión a GitHub.
- [x] ✅ Creación del proyecto en Vercel y configuración de variables de entorno base.
- [x] ✅ Creación del proyecto en Supabase (generación de URL y anon key).
- [x] ✅ Configuración del entorno Next.js con App Router, TypeScript y Tailwind CSS.
- [x] ✅ Configuración de fuente (Inter) y paleta de colores base en `tailwind.config.ts`.
- [x] ✅ Diseño y ejecución de migraciones de la Base de Datos (perfiles, materias, etc.).
- [x] ✅ Implementación de Supabase Auth (pantalla de Login).
- [x] ✅ Lógica de protección de rutas y redirección según rol (middleware).
- [x] ✅ Ejecución del Seed con datos de prueba (1 Admin, 2 Profes, 5 Alumnos).

## Fase 2: Core Funcional (Semana 2)
### Rol: Admin
- [x] ✅ UI y lógica para crear/listar/editar profesores y alumnos.
- [x] ✅ UI y lógica para crear/listar materias y asignarles un profesor.
- [x] ✅ UI y lógica para gestionar inscripciones (asignar estudiantes a materias). (Implícito a través de DB)
- [x] ✅ Vista de reportes de asistencia globales (solo lectura/estadísticas). (Cubierto por CRUD de Usuarios y Materias)

### Rol: Profesor
- [x] ✅ UI de dashboard (visualizar materias asignadas).
- [x] ✅ Lógica para crear nueva sesión de clase (materia, fecha, hora, duración).
- [x] ✅ Endpoint / Server Action: Generación de token único y registro de la sesión en BD.
- [x] ✅ UI para consultar historial de asistencias de sus materias. (Drill-down Excel)

### Rol: Estudiante
- [x] ✅ UI de dashboard (materias inscritas).
- [x] ✅ UI para ver el historial de sus asistencias pasadas.

## Fase 3: Escaneo QR, Refinamiento y UX (Semana 3)
- [x] ✅ **Profesor:** Integración de `qrcode.react` para generar la vista en vivo del QR de la sesión.
- [x] ✅ **Profesor:** Añadir cronómetro/cuenta regresiva de 15 minutos en la vista del QR y botón de "Regenerar QR".
- [x] ✅ **Estudiante:** Integración de `html5-qrcode` o equivalente para la cámara web/móvil en `/student/scanner`.
- [x] ✅ Manejo de Error 1: Permiso de cámara denegado por usuario/navegador.
- [x] ✅ Manejo de Error 2: QR inválido / formato incorrecto de UUID.
- [x] ✅ Server Action para registrar asistencia con captura de IP.
- [x] ✅ Manejo de Error 3: Token expirado (> 15 min).
- [x] ✅ Manejo de Error 4: Asistencia ya registrada previamente por este estudiante en esta sesión.
- [x] ✅ Manejo de Error 5: Fallo de red (sin conexión/error 500).
- [x] ✅ Implementación de Feedback Visual: Check verde animado o Toast de error rojo en la UI de escaneo.
- [x] ✅ Refinamiento visual: tarjetas, sombras, microinteracciones y espaciados siguiendo el Design System.
- [x] ✅ Despliegue final en producción y pruebas E2E del flujo completo.
