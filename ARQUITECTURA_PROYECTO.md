# Arquitectura y Diseño del Sistema QR-Asist

Este documento explica de forma detallada cómo está construida la aplicación **QR-Asist**, desde la interfaz de usuario hasta la base de datos y el despliegue en la nube. Está diseñado para que cualquier desarrollador del equipo pueda entender rápidamente las tecnologías y la lógica de negocio detrás del proyecto.

---

## 1. El Stack Tecnológico (Stack Moderno)

La aplicación utiliza el **Stack T3 (modificado)**, un estándar en la industria para aplicaciones web rápidas, seguras y escalables.

*   **Next.js 16 (App Router):** Es el corazón del proyecto. En lugar de usar React clásico donde todo se renderiza en el navegador, Next.js permite **Server-Side Rendering (SSR)**. Esto significa que las páginas se construyen en el servidor antes de llegar al usuario, haciéndolas ultra rápidas y seguras.
*   **TypeScript:** Es JavaScript pero con superpoderes (tipado estricto). Evita que cometamos errores tontos (como tratar de leer una propiedad que no existe) mientras programamos.
*   **Tailwind CSS:** Framework de diseño. En lugar de escribir archivos `.css` larguísimos, usamos clases directamente en el HTML (ej. `bg-white text-indigo-600 rounded-xl`).
*   **Supabase:** Nuestro "Backend as a Service". Es una alternativa Open Source a Firebase que nos provee una base de datos relacional robusta (PostgreSQL) y el sistema de Autenticación de usuarios.
*   **Vercel:** Nuestra plataforma de despliegue y alojamiento (Hosting) en la nube, optimizada específicamente para Next.js.

---

## 2. Base de Datos (Supabase / PostgreSQL)

Supabase no es solo una base de datos, maneja nuestra seguridad y usuarios. Nuestra estructura es puramente relacional:

### Modelo de Datos (Tablas Clave)
1.  **`auth.users`:** Tabla interna e invisible de Supabase que maneja los correos y contraseñas de forma encriptada. Solo los Administradores con permisos especiales (`service_role`) pueden manipularla.
2.  **`public.profiles`:** Tabla pública enlazada a `auth.users`. Cuando alguien se registra, un *Trigger* automático (una función en la base de datos) crea su perfil aquí. Tiene los campos: `id` (UUID), `name` y `role` (ADMIN, PROFESSOR, STUDENT).
3.  **`public.subjects`:** Las materias. Tienen nombre, código y están asignadas a un `professor_id`.
4.  **`public.enrollments`:** Tabla puente (Relación Muchos a Muchos). Conecta a un `student_id` con un `subject_id`. Esto define qué alumno ve qué materias en su panel.
5.  **`public.sessions`:** Las clases/sesiones dictadas por los profesores. Al crearse, generan un `qr_token` único (UUID) y un tiempo de expiración (`expires_at`).
6.  **`public.attendances`:** El registro final. Conecta el ID de la sesión con el ID del estudiante, guardando la IP y la hora exacta del escaneo (`scanned_at`).

> **💡 Borrado en Cascada:** Todas las tablas están configuradas con `ON DELETE CASCADE`. Si un administrador borra una materia, la base de datos automáticamente destruye todas sus sesiones y asistencias vinculadas para no dejar "datos huérfanos".

---

## 3. Lógica de Componentes y Funciones Core

### Generación y Lectura de QR
*   **Generación (Profesor):** Usamos la librería `qrcode.react`. El profesor crea la sesión y la base de datos devuelve un UUID único. Ese UUID se renderiza como un código QR en tiempo real.
*   **Lectura (Estudiante):** Usamos `html5-qrcode`. Un componente en Next.js abre la cámara trasera del dispositivo móvil, lee los píxeles, extrae el UUID y lo envía al servidor.

### Next.js Server Actions
Todo el "backend" del proyecto vive en la carpeta `src/lib/actions/`. En lugar de crear APIs tradicionales (`/api/register`), usamos **Server Actions** (`'use server'`). 
Cuando el estudiante escanea el QR, su navegador llama a la función `registerAttendance(qrToken)`. Esta función **se ejecuta 100% en el servidor seguro**, verifica la IP, busca el token en la BD, comprueba si expiró el tiempo, revisa si el alumno pertenece a la clase y registra la asistencia. 

---

## 4. Los Tres Roles y sus Permisos

El sistema se adapta visual y funcionalmente dependiendo de quién inicie sesión:

1.  **ADMIN (El Gestor Total):**
    *   Usa permisos de `service_role` (una llave maestra secreta en `.env.local`) que le permite crear nuevos usuarios saltándose los bloqueos de seguridad de Supabase.
    *   Controla el CRUD completo: Crear/Borrar Usuarios, Crear/Borrar Materias, Asignar Profesores a Materias y Matricular Estudiantes (`EnrollmentManager.tsx`).
2.  **PROFESSOR (El Ejecutor):**
    *   Entra a su panel interactivo. Visualiza sus materias asignadas.
    *   Crea clases con límite de tiempo (15 minutos).
    *   Posee un "Drill-Down" (Navegación Profunda) en su historial: Navega de *Materias* -> *Fechas de Clase* -> *Tabla tipo Excel de Asistentes*.
3.  **STUDENT (El Cliente):**
    *   Interfaz móvil minimalista. Solo ve la cámara.
    *   **Manejo de "Colados":** Si un estudiante escanea el QR de una clase a la que no está inscrito, el sistema guarda su asistencia de todos modos (para que el profe tenga evidencia), pero advierte al estudiante que no pertenece al grupo.

---

## 5. Hosting e Integración Continua (Vercel y GitHub)

El proyecto tiene **CI/CD (Integración Continua y Despliegue Continuo)** nativo gracias a Vercel.

1.  **El Código Vive en GitHub:** Cada vez que el desarrollador hace un `git push origin main`, el nuevo código se sube al repositorio.
2.  **Vercel Escucha a GitHub:** Vercel está conectado al repositorio. En cuanto detecta un nuevo "push", descarga el código, instala las librerías (`npm install`), y compila todo Next.js.
3.  **Variables de Entorno en Vercel:** Para que Vercel pueda conectarse a Supabase, configuramos nuestras llaves (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) directamente en los ajustes del proyecto de Vercel.
4.  **Despliegue a Producción:** En menos de 2 minutos, el código está en vivo en una URL pública, protegido con certificados SSL automáticos y redes de distribución globales (CDN) para que cargue instantáneamente en cualquier país.

---

### Resumen Visual de una Petición de Asistencia:
`Cámara Móvil Alumno (Cliente)` ➡️ `Extrae Token` ➡️ `Llama a Server Action (Vercel Server)` ➡️ `Verifica en Supabase (PostgreSQL)` ➡️ `Responde OK` ➡️ `Muestra Animación Verde en el Móvil.`
