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

## Sprint 3: Pulido general (abierto)
- [ ] ⬜ Ítems que vayan surgiendo durante la revisión general

---

**Cómo usar este archivo:** al completar un ítem, marcarlo con `[x]` ✅ y anotar el hash del commit. Los sprints nuevos se agregan al final; no se reordena el historial ya completado.
