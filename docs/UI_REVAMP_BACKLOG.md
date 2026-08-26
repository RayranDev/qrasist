# Backlog de mejoras de UI/UX

Trazabilidad de la revisión general de interfaz iniciada el 2026-08-26, organizada en sprints.
Cada item se marca al completarse, con el commit que lo resolvió.

**Estados:**
- ✅ Completado
- 🔄 En progreso
- ⬜ Pendiente

---

## Sprint 0: Header/nav de Admin (completado)
- [x] ✅ Extraer `AdminHeader` compartido para dashboard/materias/usuarios/carreras — `1ae2688`
- [x] ✅ Reubicar carga masiva a botones contextuales (Usuarios, Materias) — `1ae2688`
- [x] ✅ Nav activo visible en verde, sin desaparecer — `50a08d9`
- [x] ✅ Validación de fechas de período (inicio < fin) — `50a08d9`
- [x] ✅ Exponer y editar período/carrera/nivel desde Materias — `df44fd3`

## Sprint 1: Sistema de iconos (completado)
- [x] ✅ Instalar `lucide-react` — `f8aa039`
- [x] ✅ Reemplazar iconos emoji del dashboard (👑👨‍🏫🎓📚📅) por iconos Lucide — `f8aa039`
- [x] ✅ Reemplazar glifos de toast (✓ ✕ ℹ) por iconos Lucide — `f8aa039`
- [x] ✅ Reemplazar emoji de estado vacío (📚 "Aún no tienes materias") en vista de profesor — `f8aa039`
- [x] ✅ Reemplazar los ~36 `<svg>` copiados a mano (editar, archivar, cerrar, etc.) en los 19 archivos que los usan por componentes Lucide — `f8aa039`
- [x] ✅ `ConfirmModal` gana prop `icon` opcional (default `TriangleAlert`) al ser genérico y no solo para archivar — `f8aa039`

## Sprint 2: Consistencia de header/nav en Profesor y Estudiante (completado)
- [x] ✅ Auditado: Profesor/Estudiante ya tienen jerarquía hub (pill-nav) + detalle (back-link) coherente por diseño — no requería un header único con Admin — `d9b3c6f`
- [x] ✅ Extraído `BackLink` compartido (con icono `ArrowLeft`), usado en `professor/history`, `professor/session/[id]`, `student/history`, `admin/subjects/[id]/enrollments`, `admin/academic/[id]/pensum` — mismo patrón vivía duplicado también en Admin — `d9b3c6f`
- [x] ✅ Normalizado el peso de los títulos de página de detalle a `font-black` (igual que su hub), donde antes usaban `font-bold` — `d9b3c6f`
- [x] ✅ Decisión: Admin/Profesor/Estudiante mantienen headers propios por rol (escritorio multi-columna vs. app mobile-first) — solo se comparten piezas puntuales (`BackLink`), no un header único forzado

## Sprint 3: Reglas de negocio de carreras y jerarquía académica (completado)
- [x] ✅ Tabla `professor_careers` (un profesor puede pertenecer a varias carreras) — `2d6edfd`
- [x] ✅ Reglas A+B: materia necesita carrera antes de admitir profesor; profesor debe pertenecer a esa carrera — `53a4c38`
- [x] ✅ Reglas C+D: estudiante necesita carrera antes de inscribirse; debe coincidir con la de la materia — `3257c1b`
- [x] ✅ Asignación de carreras a profesores en Usuarios (`ProfessorCareersModal`) — `98e48b8`
- [x] ✅ Mismas reglas aplicadas a carga masiva de materias e inscripciones — `bf17d00`
- [x] ✅ Catálogo real sembrado: 91 materias de Ingeniería de Sistemas e Ingeniería Industrial, con materias compartidas en su nivel correcto por carrera (sembrado directo en producción, sin commit de código)
- [x] ✅ Dashboard: panel de Carreras con desglose estudiantes/materias y drill-down por clic hasta Usuarios filtrados; corregido bug de scroll en panel de Materias — `003926f`
- [x] ✅ Pénsum por carrera muestra sus propias estadísticas (antes no tenía ninguna) — `003926f`
- [x] ✅ Paginación y filtros (Carrera, Nivel, Profesor, Estado) en Materias — `1ef0beb`

## Sprint 4: Pulido general (abierto)
- [ ] ⬜ Ítems que vayan surgiendo durante la revisión general

---

## Backlog de producto (fuera de esta ronda de UI)

Pendientes que el usuario dejó anotados el 2026-08-26, sin fecha ni prioridad definida todavía:

- [ ] ⬜ **Notificaciones por correo** — enviar email en eventos clave (ej. inscripción aprobada/rechazada, asistencia registrada). Sin definir: proveedor de envío, qué eventos disparan correo, plantillas.
- [ ] ⬜ **Manejo de horarios** — horario de clases tanto para profesor como para estudiante. Sin definir: modelo de datos (¿nueva tabla de horarios ligada a `subjects`/`sessions`?), si reemplaza o complementa el flujo actual de sesión-por-QR, vista de calendario vs. lista.

---

**Cómo usar este archivo:** al completar un ítem, marcarlo con `[x]` ✅ y anotar el hash del commit. Los sprints nuevos se agregan al final; no se reordena el historial ya completado.
