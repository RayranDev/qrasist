# Modo offline: propuesta de solución

**Estado:** propuesta, pendiente de decisión del propietario del producto (2026-10-27).
**Pregunta abierta:** ¿qué pérdida de trabajo preocupa más, la asistencia manual del docente o el escaneo del estudiante? La respuesta define el alcance de la fase 1.

## Problema

Cuando se cae el internet, el trabajo que el usuario estaba haciendo no debe perderse. La idea inicial es una base de datos local pequeña que guarde ese trabajo y lo envíe al servidor cuando vuelva la conexión.

## Recomendación

PWA con una **cola de operaciones pendientes** (outbox) en IndexedDB. No se recomienda una réplica completa de la base de datos en el dispositivo.

Cada acción hecha sin conexión se guarda localmente con un identificador único generado en el cliente (`client_op_id`). Al volver la conexión, la cola se envía en orden y el servidor descarta los duplicados usando ese identificador. Así un reintento nunca registra dos veces la misma asistencia.

### Por qué una cola y no una réplica

- El proyecto usa Supabase con RLS por rol. Las soluciones de réplica offline-first (PowerSync, RxDB, ElectricSQL) obligan a replicar las reglas de acceso y a resolver conflictos de todas las tablas. El costo y la complejidad no se justifican para el problema real.
- Lo que se pierde hoy son **escrituras** puntuales, no la necesidad de consultar toda la base sin conexión.
- `localStorage` se descarta: es síncrono, tiene poco espacio y no sirve para colas fiables.

## Alcance por flujo

| Flujo | ¿Offline? | Motivo |
| --- | --- | --- |
| Asistencia manual del docente | Sí, prioridad alta | Es una escritura simple por estudiante y clase. Se puede encolar y reconciliar sin riesgo de fraude. |
| Radicar una excusa (estudiante) | Sí, como borrador | Se guarda el texto y se envía al reconectar. |
| Escaneo de QR del estudiante | No por defecto | El QR rota y caduca, y la validación en servidor es la defensa antifraude. Validar un escaneo horas después abre la puerta a registrar asistencia sin estar presente. |
| Panel de administración | Solo lectura en caché, opcional | El trabajo del administrador es de gestión, no de captura urgente. |

### Si se decide permitir el escaneo offline

Solo sería aceptable con estas condiciones, que debe aprobar el propietario porque cambian la regla antifraude actual:

- El escaneo guarda la marca de tiempo del dispositivo y el token leído.
- Al sincronizar, el servidor acepta el registro solo si el token era válido en esa ventana de tiempo y dentro de una tolerancia máxima definida (por ejemplo, minutos).
- Los registros que lleguen fuera de esa tolerancia quedan marcados como pendientes de revisión del docente, no como asistencia confirmada.

## Diseño técnico

### Cliente

- **Service worker:** precarga el shell de la aplicación y cachea las lecturas necesarias (lista de la clase actual del docente). Las rutas de mutación nunca se cachean.
- **Outbox en IndexedDB** (con una librería ligera como Dexie): cada registro guarda `client_op_id`, tipo de operación, carga útil, fecha de creación, intentos y estado (`pendiente`, `enviando`, `error`).
- **Sincronización:** se dispara con el evento `online`, al volver la pestaña a primer plano y con un reintento con espera creciente. La Background Sync API no está disponible en Safari ni en Firefox, así que no puede ser el único disparador.
- **Interfaz:** indicador visible de estado (sin conexión, N pendientes, sincronizado) y, por cada registro, si está pendiente, confirmado o rechazado. El usuario nunca debe creer que algo quedó guardado en el servidor cuando solo está en el dispositivo.

### Servidor

- Columna `client_op_id` con restricción única en las tablas que reciben escrituras offline (asistencia manual, excusas). Requiere una migración.
- Los endpoints de sincronización deben ser idempotentes: si el `client_op_id` ya existe, responden éxito sin duplicar.
- Política de conflictos: si el estudiante ya tiene asistencia registrada para esa clase por otra vía, gana lo que ya está en el servidor y el cliente recibe el aviso. Las clases suspendidas o archivadas rechazan la operación con un motivo claro.

### Seguridad y privacidad

- Los datos guardados en el dispositivo incluyen nombres y códigos de estudiantes. Deben borrarse al cerrar sesión y no guardarse más de lo necesario.
- La sesión puede caducar mientras no hay conexión. Al reconectar, la cola espera a que el usuario inicie sesión de nuevo y no descarta nada.
- Los navegadores pueden limpiar el almacenamiento local de sitios poco usados. Instalar la PWA reduce ese riesgo y debe recomendarse a los docentes.

## Fases propuestas

1. **Asistencia manual del docente offline:** caché de la lista de la clase, outbox, migración de idempotencia, indicador de estado.
2. **Excusas como borrador offline** y caché de lectura de pantallas frecuentes.
3. **Escaneo del estudiante,** solo si el propietario aprueba las condiciones antifraude descritas arriba.

## Riesgos y puntos por validar

- El comportamiento de IndexedDB y del service worker varía entre navegadores móviles; hay que probar en los dispositivos que realmente usan docentes y estudiantes.
- La política antifraude para el escaneo diferido es una decisión de producto, no técnica.
- Hay que decidir cuánto tiempo conserva el dispositivo una operación pendiente antes de pedir al usuario que la revise.

## Contexto del repositorio

La pantalla del escáner del estudiante ya detecta si hay conexión (corrección de hidratación del PR #27), lo que sirve de base para el indicador de estado.
