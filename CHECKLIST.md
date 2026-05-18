# Checklist de Progreso del Proyecto

Utiliza este checklist para dar seguimiento a las tareas del plan de implementación. 
Actualiza el estado de cada tarea conforme se vaya avanzando.

**Estados:**
- ✅ Completada
- 🔄 En progreso
- ⬜ Pendiente

---

## Fase 1: Fundación y Auth (Semana 1)
- [ ] ⬜ Inicialización del repositorio Git y conexión a GitHub.
- [ ] ⬜ Creación del proyecto en Vercel y configuración de variables de entorno base.
- [ ] ⬜ Creación del proyecto en Supabase (generación de URL y anon key).
- [ ] ⬜ Configuración del entorno Next.js con App Router, TypeScript y Tailwind CSS.
- [ ] ⬜ Configuración de fuente (Inter) y paleta de colores base en `tailwind.config.ts`.
- [ ] ⬜ Diseño y ejecución de migraciones de la Base de Datos (perfiles, materias, etc.).
- [ ] ⬜ Implementación de Supabase Auth (pantalla de Login).
- [ ] ⬜ Lógica de protección de rutas y redirección según rol (middleware).
- [ ] ⬜ Ejecución del Seed con datos de prueba (1 Admin, 2 Profes, 5 Alumnos).

## Fase 2: Core Funcional (Semana 2)
### Rol: Admin
- [ ] ⬜ UI y lógica para crear/listar/editar profesores y alumnos.
- [ ] ⬜ UI y lógica para crear/listar materias y asignarles un profesor.
- [ ] ⬜ UI y lógica para gestionar inscripciones (asignar estudiantes a materias).
- [ ] ⬜ Vista de reportes de asistencia globales (solo lectura/estadísticas).

### Rol: Profesor
- [ ] ⬜ UI de dashboard (visualizar materias asignadas).
- [ ] ⬜ Lógica para crear nueva sesión de clase (materia, fecha, hora, duración).
- [ ] ⬜ Endpoint / Server Action: Generación de token único y registro de la sesión en BD.
- [ ] ⬜ UI para consultar historial de asistencias de sus materias.

### Rol: Estudiante
- [ ] ⬜ UI de dashboard (materias inscritas).
- [ ] ⬜ UI para ver el historial de sus asistencias pasadas.

## Fase 3: Escaneo QR, Refinamiento y UX (Semana 3)
- [ ] ⬜ **Profesor:** Integración de `qrcode.react` para generar la vista en vivo del QR de la sesión.
- [ ] ⬜ **Profesor:** Añadir cronómetro/cuenta regresiva de 15 minutos en la vista del QR y botón de "Regenerar QR".
- [ ] ⬜ **Estudiante:** Integración de `html5-qrcode` o equivalente para la cámara web/móvil en `/student/scanner`.
- [ ] ⬜ Manejo de Error 1: Permiso de cámara denegado por usuario/navegador.
- [ ] ⬜ Manejo de Error 2: QR inválido / formato incorrecto de UUID.
- [ ] ⬜ Server Action para registrar asistencia con captura de IP.
- [ ] ⬜ Manejo de Error 3: Token expirado (> 15 min).
- [ ] ⬜ Manejo de Error 4: Asistencia ya registrada previamente por este estudiante en esta sesión.
- [ ] ⬜ Manejo de Error 5: Fallo de red (sin conexión/error 500).
- [ ] ⬜ Implementación de Feedback Visual: Check verde animado o Toast de error rojo en la UI de escaneo.
- [ ] ⬜ Refinamiento visual: tarjetas, sombras, microinteracciones y espaciados siguiendo el Design System.
- [ ] ⬜ Despliegue final en producción y pruebas E2E del flujo completo.
