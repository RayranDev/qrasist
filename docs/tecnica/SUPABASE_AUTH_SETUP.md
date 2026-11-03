# Configuración manual de Supabase Auth — recuperación de contraseña

Pasos que hay que hacer una sola vez en el dashboard de Supabase para que
el flujo de "¿Olvidaste tu contraseña?" (`/forgot-password` →
`/auth/confirm` → `/reset-password`) funcione en todos los entornos.

## 1. Redirect URLs permitidas

**Authentication → URL Configuration → Redirect URLs**. Agregar:

- `https://qrasist.vercel.app/auth/confirm` (producción)
- `https://*-rayrandev.vercel.app/auth/confirm` (previews de Vercel)
- `http://localhost:3000/auth/confirm` (desarrollo local)

Sin esto, Supabase rechaza el `redirectTo` que manda
`resetPasswordForEmail` y el enlace del correo no funciona.

## 2. SMTP personalizado (obligatorio para producción)

El SMTP por defecto de Supabase **solo entrega correos a las cuentas del
equipo del proyecto** y tiene un rate limit muy bajo (pensado para
pruebas). Para que estudiantes/docentes reales reciban el correo de
recuperación hay que configurar SMTP propio en:

**Project Settings → Auth → SMTP Settings**

Cualquier proveedor transaccional sirve (Resend, SendGrid, Amazon SES,
etc.). Sin esto, `resetPasswordForEmail` responde éxito pero el correo
nunca llega fuera del equipo del proyecto.

## 3. (Opcional) Plantilla de correo en formato `token_hash`

Por defecto la plantilla "Reset Password" de Supabase usa
`{{ .ConfirmationURL }}`, que apunta al endpoint hosteado de Supabase
(`/auth/v1/verify`) y de ahí redirige a nuestro `redirectTo`. Esto ya
funciona con `/auth/confirm` porque la ruta soporta el formato `code`
(PKCE) que genera ese flujo.

Si se prefiere que el enlace apunte directo a nuestro dominio (sin pasar
por el dominio de Supabase primero), cambiar la plantilla en
**Authentication → Email Templates → Reset Password** por:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
```

`/auth/confirm` soporta ambos formatos (`token_hash`+`type` y `code`),
así que este paso es opcional.

## 4. Variable de entorno opcional

`NEXT_PUBLIC_SITE_URL` (ej. `https://qrasist.vercel.app`) se usa como
respaldo para construir el `redirectTo` solo si la request no trae
header `host` (caso raro). En Vercel normalmente no hace falta
configurarla porque el header `host`/`x-forwarded-host` ya es correcto
en cada entorno (producción y cada preview).
