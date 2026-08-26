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

## Sprint 1: Sistema de iconos
- [ ] ⬜ Instalar `lucide-react`
- [ ] ⬜ Reemplazar iconos emoji del dashboard (👑👨‍🏫🎓📚📅) por iconos Lucide
- [ ] ⬜ Reemplazar glifos de toast (✓ ✕ ℹ) por iconos Lucide
- [ ] ⬜ Reemplazar emoji de estado vacío (📚 "Aún no tienes materias") en vista de profesor
- [ ] ⬜ Reemplazar los ~36 `<svg>` copiados a mano (editar, archivar, cerrar, etc.) en los 16 archivos que los usan por componentes Lucide

## Sprint 2: Consistencia de header/nav en Profesor y Estudiante
- [ ] ⬜ Auditar headers actuales de `/professor/subjects`, `/professor/history`, `/professor/session/[id]`
- [ ] ⬜ Auditar headers de `/student/scanner`, `/student/history`
- [ ] ⬜ Definir si comparten un header con Admin o uno propio por rol
- [ ] ⬜ Extraer componente(s) de header/nav para Profesor y Estudiante
- [ ] ⬜ Verificar consistencia de radios (`rounded-xl/2xl/3xl`) y botones primarios entre roles

## Sprint 3: Pulido general (abierto)
- [ ] ⬜ Ítems que vayan surgiendo durante la revisión general

---

**Cómo usar este archivo:** al completar un ítem, marcarlo con `[x]` ✅ y anotar el hash del commit. Los sprints nuevos se agregan al final; no se reordena el historial ya completado.
