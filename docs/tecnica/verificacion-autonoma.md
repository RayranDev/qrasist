# Verificación autónoma de la aplicación

**Estado:** vigente desde 2026-10-28.
**Objetivo:** que Claude (o cualquier agente) pueda probar la aplicación, sacar capturas y verificar flujos **sin pedirle nada al propietario**, y sin escribir nada en producción.

## Regla de fondo

Las cuentas de demostración (coordinador, docentes y estudiantes `*.demo`) viven en **producción**. Un agente no escribe contraseñas para iniciar sesión en un sitio real: es un límite fijo del entorno donde corre Claude y no se puede levantar desde el chat. Por eso la verificación no se hace contra producción.

La salida es un **entorno de pruebas local**: la misma aplicación, apuntando a un Supabase local en Docker, con cuentas semilla que el propio repositorio define. En `localhost` con credenciales de prueba sí se puede iniciar sesión sin intervención, y los datos se pueden crear y borrar sin consecuencias.

| Entorno | ¿Un agente inicia sesión? | ¿Se pueden crear datos? |
| --- | --- | --- |
| Local (`localhost` + Supabase en Docker) | Sí, con las cuentas semilla | Sí, sin riesgo |
| Producción (`qrasist.vercel.app`) | No: la sesión la abre el propietario una vez | Solo lo que el propietario autorice |

## Qué ya existe en el repositorio

- `supabase/config.toml`, `supabase/migrations/` y `supabase/seed.sql`: el esquema completo.
- `e2e/seed/seed.ts` y `e2e/seed/testUsers.ts`: crean las cuentas y datos de prueba. **Las credenciales están en `testUsers.ts`; no se copian a otros documentos.**
- `e2e/utils/supabaseLocal.ts`: lee la URL y las claves del stack local y se niega a ejecutarse contra cualquier host que no sea `127.0.0.1` o `localhost`.
- `playwright.config.ts` y `.github/workflows/e2e.yml`: la suite automática, que corre solo contra el stack local.

## Procedimiento

Requisitos: Docker Desktop en ejecución y Node.

1. **Levantar Supabase local.**
   ```bash
   npx -y supabase@2.121.0 start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,supavisor,mailpit
   ```
2. **Aplicar migraciones y semilla.**
   ```bash
   npx -y supabase@2.121.0 db reset
   npm run e2e:seed
   ```
3. **Levantar la aplicación apuntando al stack local.** Las variables de entorno ya definidas tienen prioridad sobre `.env.local`, así que producción no se toca. Los valores salen de `npx supabase status -o env` (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`).
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=<API_URL> \
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY> \
   SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> \
   npx next dev -p 3010 > next-dev.log 2>&1
   ```
4. **Iniciar sesión** en `http://localhost:3010/login` con las cuentas de `e2e/seed/testUsers.ts` (administrador, docente, estudiantes A y B).
5. **Probar o capturar.** Para pantallas que dependen de datos (solicitudes de inscripción pendientes, justificaciones pendientes, cambios de rol) se crean en la base local; ver la sección siguiente.
6. **Apagar** al terminar: `npx supabase stop`.

## Preparar datos con aspecto de demostración

Se hace con SQL sobre el contenedor local (`supabase_db_<project_id>`):

```bash
docker exec supabase_db_QR_Asist psql -U postgres -d postgres -c "<sentencia>"
```

- `profiles.name` es una **columna generada**: se cambia con `first_name` y `last_name`, nunca con `name`.
- Una solicitud pendiente: `insert into enrollment_requests(student_id, subject_id, status) values (..., ..., 'pending')`.
- Las ventanas guiadas del cambio de rol solo aparecen al confirmar un cambio real; en local se puede hacer y deshacer libremente. La lista de materias asignables solo muestra materias **sin docente** y de las carreras del usuario (`professor_careers` / `student_careers`).

## Problemas conocidos

- **Puertos ocupados.** Si otro proyecto con Supabase local está corriendo (arranca solo con Docker Desktop), los puertos 54321 a 54329 ya están en uso y `supabase start` falla con `port is already allocated`. No se detiene el otro proyecto: se copia `supabase/` (configuración, migraciones y semilla) a una carpeta temporal fuera del repositorio, se cambian los puertos `543xx` por `553xx` en su `config.toml` y los comandos de Supabase se ejecutan desde esa carpeta. La aplicación usa entonces `http://127.0.0.1:55321`.
- **La semilla con puertos cambiados.** `npm run e2e:seed` busca el stack con `npx supabase status` en la carpeta actual, y el `config.toml` del repositorio usa `543xx`. Con la carpeta temporal se ejecuta desde ella: `cd <carpeta-temporal> && <repo>/node_modules/.bin/tsx <repo>/e2e/seed/seed.ts`. Antes de `db reset` se copian de nuevo las migraciones del repositorio a esa carpeta.
- **Docker Desktop detenido.** Se inicia con `Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'` y se espera hasta que `docker info` responda.
- **Archivos de prueba para la carga masiva.** Los códigos de estudiante tienen exactamente 12 dígitos, y la fila de ejemplo de la plantilla se rechaza a propósito: se borra o se reemplaza.
- **No encadenar el servidor de desarrollo a `| head`.** Si la tubería se cierra, `next dev` queda colgado. Se redirige la salida a un archivo.
- **Primera ejecución lenta.** Docker descarga las imágenes de Supabase la primera vez.
- **Insignia de Next.js en las capturas.** El modo desarrollo dibuja un círculo "N" abajo a la izquierda; se tapa o se recorta antes de insertar la imagen en un documento.
- **Ventana del navegador.** El área visible de las capturas es de 1568×698 px.

## Límites

- Esto verifica la lógica y la interfaz, pero **no reemplaza** una comprobación en producción cuando el cambio depende de algo que solo existe allí (datos reales, variables de entorno de Vercel, migraciones aplicadas al proyecto real).
- Las capturas locales usan datos de prueba. Si una figura debe mostrar datos reales, la sesión en producción la abre el propietario.
