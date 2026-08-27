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

## Sprint 4: Escalabilidad de Usuarios (completado)
- [x] ✅ Índices de búsqueda (`pg_trgm` + GIN) en `profiles.name` y `profiles.student_code` — `e9ce209`
- [x] ✅ Buscador por nombre/código con debounce, pensado para el caso real de llamado de lista (verificar identidad rápido, evitar suplantación) — `e5c80f9`
- [x] ✅ Filtro de carrera visible (antes solo alcanzable por URL desde el drill-down del dashboard) — `e5c80f9`
- [x] ✅ Corregida una condición de carrera real: la navegación se arma solo a partir de props conocidas, nunca leyendo `window.location` — `e5c80f9`

## Sprint 5: Antifraude en registro de asistencia (completado)
Contexto: el QR de asistencia es, en el fondo, un secreto compartido — cualquier control tiene que asumir que alguien va a intentar hacerse pasar por otro o registrar asistencia sin estar presente. Se pensaron todos los vectores de fraude razonables (foto del QR compartida por WhatsApp, copiar el token como texto, credenciales compartidas entre dos personas, invocación directa del Server Action, complicidad del profesor) antes de elegir las medidas.

- [x] ✅ Auditoría de IP: se muestra la IP ya capturada en cada asistencia (existía desde el inicio del proyecto, sin usarse) y se marca la que es *distinta* a la más común del grupo — no "misma IP = sospechoso", porque todo el salón comparte el WiFi institucional legítimamente — `2c88ae7`
- [x] ✅ Una sola sesión activa por cuenta (`admin.signOut(token, 'others')` tras cada login) — cierra el vector de credenciales compartidas usadas simultáneamente desde dos dispositivos — `9e34f62`
- [x] ✅ QR rotativo cada 20s con margen de gracia de una rotación (`previous_qr_token`) — una foto compartida por WhatsApp queda inútil casi al instante — `49dd79e`, `8f8dcee`
- [x] ✅ Cerrada una exposición real encontrada en el camino: `sessions_select` dejaba leer/enumerar el `qr_token` de cualquier clase vía la API REST propia de PostgREST con la clave de cualquier estudiante autenticado — `49dd79e`
- [x] ✅ Corregida una recursión infinita real entre `sessions_select` y `attendances_select` detectada durante la verificación (bloqueaba `createSession` para cualquier profesor) — `d459826`
- [x] ✅ Verificación de propiedad agregada en `/professor/session/[id]` (cualquier profesor podía ver el QR en vivo de una materia ajena si conocía el id) — `8f8dcee`
- [x] ✅ Geolocalización opcional y no bloqueante al generar el QR y al escanear, con umbral de 300m para marcar (no bloquear) un registro lejano — `596290e`, `5e4b513`

**Decisión descartada, explicada al usuario:** "un solo login por IP" no funciona en este contexto — en un salón de clase todo el mundo comparte la IP pública del WiFi institucional (NAT), así que esa regla o no filtra nada o bloquea a estudiantes reales. Se reemplazó por sesión única por cuenta + QR rotativo + auditoría de IP distinta al grupo, que atacan la misma preocupación sin ese falso positivo.

## Sprint 6: Pulido general (abierto)
- [ ] ⬜ Ítems que vayan surgiendo durante la revisión general

---

## Backlog de producto (fuera de esta ronda de UI)

Pendientes que el usuario dejó anotados el 2026-08-26, sin fecha ni prioridad definida todavía:

- [ ] ⬜ **Notificaciones por correo** — enviar email en eventos clave (ej. inscripción aprobada/rechazada, asistencia registrada). Sin definir: proveedor de envío, qué eventos disparan correo, plantillas.
- [ ] ⬜ **Manejo de horarios** — horario de clases tanto para profesor como para estudiante. Sin definir: modelo de datos (¿nueva tabla de horarios ligada a `subjects`/`sessions`?), si reemplaza o complementa el flujo actual de sesión-por-QR, vista de calendario vs. lista.

---

**Cómo usar este archivo:** al completar un ítem, marcarlo con `[x]` ✅ y anotar el hash del commit. Los sprints nuevos se agregan al final; no se reordena el historial ya completado.
