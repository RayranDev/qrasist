# Parámetros de asistencia

**Estado:** vigente desde la migración 038 (rama `feat/global-qr-rotation`; incluye lo entregado en los PR #51 y #52).
**Audiencia:** quien mantiene el código o la base de datos. La explicación para usuarios está en el manual de usuario (sección 4.6 y 4.7 de la versión 1.4).

Los parámetros de asistencia son **globales**: los define solo coordinación (rol ADMIN) desde **Dashboard → Configuración de asistencia**, y se aplican a todas las materias y clases. Ningún docente puede cambiarlos.

## Qué parámetros existen

| Parámetro | Columna | Por defecto | Rango | Quién lo edita | Desde cuándo aplica |
| --- | --- | --- | --- | --- | --- |
| Ventana de registro (minutos) | `app_settings.registration_window_minutes` | 30 | 1 a 60 | ADMIN | Clases que se inicien después del cambio (`sessions.expires_at` se calcula al abrir la clase) |
| Rotación del código QR (segundos) | `app_settings.qr_rotation_seconds` | 20 | 10 a 60 | ADMIN | Clases nuevas; las ya abiertas conservan su valor |
| Duración de clase por defecto (minutos) | `app_settings.default_class_minutes` | 120 | 30 a 360 | ADMIN | Clases nuevas que no caen en un bloque del horario |
| Tolerancia de tardanza (minutos) | `app_settings.late_after_minutes` | 20 | 1 a 180, o `NULL` = sin seguimiento | ADMIN | Inmediato en las materias que la heredan |
| Tardanzas por falta | `app_settings.lates_per_absence` | `NULL` (las tardanzas no se convierten en falta) | 1 a 10, o `NULL` | ADMIN | Inmediato en las materias que la heredan |
| Regla de faltas | `app_settings.absence_rule_type` | `PERCENTAGE` | `PERCENTAGE` o `FIXED_COUNT` | ADMIN | Inmediato en las materias que la heredan |
| Porcentaje máximo de faltas | `app_settings.max_absence_percentage` | 20 | 1 a 100 | ADMIN | Inmediato en las materias que la heredan |
| Cantidad máxima de faltas | `app_settings.max_absence_count` | `NULL` | 1 a 50; solo con `FIXED_COUNT` | ADMIN | Inmediato en las materias que la heredan |

**Nota de seguridad sobre la rotación.** Al escanear, `registerAttendance` y el preflight aceptan el código actual (`sessions.qr_token`) **y el anterior** (`sessions.previous_qr_token`), para no rechazar escaneos en el borde de una rotación. Por eso una foto del código puede seguir valiendo hasta cerca del **doble** del intervalo: unos 40 s con 20 s y unos 120 s con 60 s. Un intervalo más corto reduce esa ventana; uno más largo reduce la carga del servidor. El modal de configuración lo explica en el texto de ayuda del campo. Además, `createSession` rechaza a un cliente desactualizado con «Recarga la página e inténtalo de nuevo.»

`app_settings` es una tabla de **una sola fila** (`id = 1`). No tiene policies de escritura: se escribe con service role desde `src/lib/actions/appSettings.ts` (`updateAppSettings`), después de `checkAdmin()`.

`subjects.total_planned_sessions` **no** es global: depende del horario de cada materia y se sigue editando por materia.

### Por qué la ventana (30) supera la tolerancia (20)

Un escaneo cuenta como tarde solo si llega pasados `late_after_minutes` desde el inicio, pero se rechaza cuando se cierra la ventana. Con la ventana en 5 y la tolerancia en 15 (los valores anteriores) nadie podía quedar como tarde por QR. La migración 036 cambió los valores por defecto a 30 y 20. Si coordinación configura una ventana que no supera la tolerancia de alguna materia, el modal muestra un aviso (no bloqueante): en esas materias solo se puede marcar tarde de forma manual.

## Herencia y política personalizada

Las columnas de política de `subjects` (`late_after_minutes`, `lates_per_absence`, `absence_rule_type`, `max_absence_percentage`, `max_absence_count`) siguen siendo los valores **efectivos**: todo el código que las lee (asistencia, tableros, reportes, páginas del estudiante) no cambió. La base de datos fuerza la herencia:

- `subjects.policy_override` (boolean, por defecto `false`): `false` = la materia hereda la política global; `true` = política personalizada.
- Trigger `trg_subjects_apply_global_policy` (BEFORE INSERT OR UPDATE en `subjects`): si no hay `policy_override`, reescribe las cinco columnas con los valores de `app_settings` (lectura con `FOR SHARE`, que se serializa con un cambio concurrente de la política global). Si la fila `app_settings` no existe, falla con un mensaje claro.
- Trigger `trg_app_settings_propagate_policy` (AFTER UPDATE en `app_settings`): al cambiar un parámetro de política propaga el cambio a las materias con `policy_override = false`, en la misma transacción.
- Una materia con `policy_override = true` no cambia cuando cambia la política global.
- Solo un ADMIN elige entre «Usar política global» y «Política personalizada» al crear o editar una materia (`src/app/admin/subjects/SubjectPolicyFields.tsx`, `src/lib/actions/adminSubjects.ts`). La lista de materias muestra la etiqueta «Política personalizada» en las que tienen override.
- Una materia nueva hereda la política global por defecto.

## Motivo y auditoría

- Todo cambio en la configuración global exige un **motivo** (mínimo 5 y máximo 500 caracteres, `parseChangeReason` en `src/lib/settings/globalPolicy.ts`). Si no cambió ningún valor, no se escribe nada ni se audita.
- Se registra una fila en `audit_log` con acción `settings.update_attendance`, `entity_type = 'app_settings'` y `details = { changes, reason }`, donde `changes` es `{ columna: { before, after } }` solo con los campos modificados.
- Crear una materia con política personalizada, o cambiar su modo o sus valores propios, exige motivo y se audita con la acción `subject.update_policy` (`details.changes`, `details.reason`; en la creación `details.created = true`).
- La pantalla Auditoría (`/admin/audit`) muestra cada cambio con texto legible, por ejemplo «tolerancia de tardanza: 20 min → 25 min», y el motivo.
- Las acciones antiguas `policy.update_global_absence` y `policy.update_global_refused` ya no se registran; siguen en el tipo `AuditAction` y en `auditDisplay.ts` para poder leer registros históricos.
- Los cambios por SQL directo o service role no pasan por la acción y no dejan esta auditoría: hay que dejar constancia aparte.

## Protección en la base de datos

| Mecanismo | Migración | Qué impide |
| --- | --- | --- |
| `protect_subject_admin_columns` (ampliada) | 037 | Una sesión autenticada que no es ADMIN (por ejemplo, el docente dueño) cambie las cinco columnas de política o `policy_override` de una materia |
| `trg_sessions_apply_global_qr_rotation` (BEFORE INSERT en `sessions`) | 038 | Que una sesión nueva tenga una rotación distinta de la global: siempre toma `app_settings.qr_rotation_seconds`, aunque el INSERT traiga otro valor |
| `protect_session_qr_rotation` (BEFORE UPDATE en `sessions`) | 038 | Que un usuario autenticado que no es ADMIN cambie `qr_rotation_seconds` de una sesión existente |
| CHECK de `app_settings` | 037, 038 | Valores fuera de rango (los mismos rangos de la tabla de arriba) |

Service role y migraciones (`auth.uid()` nulo) quedan fuera de la restricción. `sessions` no tiene policies de escritura para usuarios (028), así que los triggers son una segunda barrera.

Compatibilidad: el código anterior sigue funcionando después de aplicar 037 y 038, pero sus ediciones de política en materias que heredan, y la rotación que insertaba por sesión, se reemplazan en silencio por el valor global.

## Orden de despliegue

**Aplica la migración antes de fusionar el código que lee la columna nueva.** `getAppSettings` y `getGlobalPolicy` devuelven los valores por defecto si la lectura falla, pero la pantalla de configuración mostraría esos valores como si fueran los vigentes y el cambio no se guardaría. Orden:

1. Revisar la migración y ejecutar, en solo lectura, la consulta informativa de su encabezado.
2. Aplicarla con `node scripts/db-apply.mjs supabase/migrations/<archivo>.sql` (una transacción; lee `DATABASE_URL` de `.env.local`).
3. Fusionar y desplegar el código.

Las migraciones 036, 037 y 038 son idempotentes. La 037 siembra los parámetros globales con la política que más materias activas comparten y marca `policy_override = true` en las materias cuya política difiere, para que nada cambie en silencio.

## Cómo verificarlo en local

Con el entorno de `docs/tecnica/verificacion-autonoma.md` (Supabase local en Docker, sin `db reset` si ya está cargado):

```bash
docker exec supabase_db_QR_Asist psql -U postgres -d postgres -c \
  "select registration_window_minutes, qr_rotation_seconds, late_after_minutes, lates_per_absence, absence_rule_type, max_absence_percentage, max_absence_count from app_settings;"
docker exec supabase_db_QR_Asist psql -U postgres -d postgres -c \
  "select code, policy_override, late_after_minutes from subjects order by code;"
```

1. Inicia sesión como coordinación, abre **Configuración de asistencia**, cambia un valor y comprueba que **Guardar** sigue deshabilitado hasta escribir el **Motivo del cambio**.
2. Guarda, abre **Auditoría** y comprueba la entrada con el valor anterior, el nuevo y el motivo.
3. Comprueba que las materias sin «Política personalizada» tomaron el nuevo valor (segunda consulta) y que las personalizadas no cambiaron.
4. Como docente, abre **Mis materias**: no debe existir «Ajustar rotación del código». Abre una clase y comprueba que `sessions.qr_rotation_seconds` es el valor global.
5. Para probar la protección, intenta desde SQL con un usuario autenticado que no sea ADMIN cambiar `subjects.late_after_minutes` o `sessions.qr_rotation_seconds`: debe fallar con «Solo un ADMIN puede modificar…». Revierte cualquier dato que cambies.
