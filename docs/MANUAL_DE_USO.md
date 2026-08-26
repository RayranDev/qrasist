# Manual de Uso — QR-Asist

Guía de operación día a día para administradores, docentes y estudiantes.

---

## ¿La app sigue funcionando si apago el PC?

- **Versión en Vercel (producción):** ✅ Sí. Los servidores de Vercel y Supabase están siempre activos. Los usuarios pueden entrar 24/7 desde cualquier dispositivo.
- **Localhost (desarrollo):** ❌ No. Si cierras la terminal o apagas el PC, `localhost:3000` deja de funcionar. Para volver a levantarlo: abre VS Code, abre la terminal y escribe `npm run dev`.

---

## Cómo publicar cambios en producción

```bash
git add .
git commit -m "descripción del cambio"
git push origin main
```
Vercel detecta el push y despliega en ~2 minutos automáticamente.

---

## Perfil: Administrador

Al iniciar sesión, el administrador llega al **Dashboard General**.

### Dashboard
Muestra en tiempo real:
- Cantidad de administradores, docentes, estudiantes y materias
- Sesiones (clases) del día actual
- Tabla de docentes con número de materias asignadas
- Tabla de materias con número de estudiantes inscritos
- Tabla de estudiantes con número de materias en las que están inscritos

### Gestión de Materias (`/admin/subjects`)
1. **Crear materia:** Completa nombre, código único (ej. `MAT-301`) y asigna un docente. Todos los campos son obligatorios.
2. **Editar materia:** Clic en el ícono de lápiz junto a la materia.
3. **Eliminar materia:** Clic en el ícono de basura. Se borran en cascada todas sus sesiones y asistencias.
4. **Gestionar estudiantes:** Clic en "Gestionar Estudiantes" dentro de cada materia para inscribir o quitar estudiantes.

### Gestión de Usuarios (`/admin/users`)
1. **Crear usuario:** Completa nombre, correo, contraseña, código institucional (12 dígitos numéricos, obligatorio) y rol.
2. **Cambiar rol:** Usa el selector de rol en la tabla (cambio inmediato).
3. **Editar usuario:** Clic en el ícono de lápiz → puedes cambiar nombre, código institucional o contraseña.
4. **Eliminar usuario:** Clic en el ícono de basura → se abre un modal de confirmación. **Debes escribir el nombre exacto del usuario** para poder confirmar el borrado. Esto evita eliminaciones accidentales.

> **Nota para usuarios mobile:** Al entrar desde un celular, verás un banner que recomienda usar un computador para mejor experiencia. La app sigue siendo funcional en mobile.

---

## Perfil: Docente

Al iniciar sesión, el docente ve su panel con saludo personalizado: "Hola, [Nombre] 👋" y el número de materias asignadas.

### Editar Perfil
Clic en el ícono de perfil (silueta de persona) en la esquina superior derecha. Puedes cambiar tu nombre y contraseña.

### Registrar Asistencia (Generar QR)
1. En la pantalla principal, elige la materia para la cual quieres registrar asistencia.
2. Cada materia muestra la cantidad de estudiantes inscritos.
3. Clic en **"Iniciar Sesión (Generar QR)"**.
4. Se abre la pantalla con el código QR activo:
   - El QR es válido por **15 minutos** (hay un contador regresivo).
   - Proyecta este QR en el televisor o video beam del salón.
   - Los estudiantes escanean desde su celular.
   - Una vez que expire, el QR ya no acepta registros.

### Ver Historial (`/professor/history`)
El historial está organizado en tres niveles:
1. **Materias** → Selecciona una materia
2. **Sesiones** → Selecciona una fecha/clase
3. **Asistentes** → Ve la lista de estudiantes regulares (inscritos) e invitados, con nombre, código institucional, fecha y hora exacta.

Desde la lista de asistentes puedes exportar a **CSV** con un clic.

Para eliminar una sesión por error, clic en el ícono de basura junto a la fecha de la sesión (dentro del nivel 2).

---

## Perfil: Estudiante

### Registro de Cuenta
En la pantalla de login, clic en **"Regístrate aquí"**. Todos los campos son obligatorios:
- **Nombre Completo**
- **Código Estudiantil:** exactamente **12 dígitos numéricos** (ej. `202301234567`). No se aceptan letras ni códigos de diferente longitud.
- **Correo Electrónico**
- **Contraseña:** mínimo 6 caracteres

### Escanear QR (Registrar Asistencia)
1. Al entrar, la cámara se activa automáticamente.
2. Apunta al QR que el profesor proyecta en el salón.
3. Al escanear, verás uno de estos resultados:
   - ✅ **Verde — "¡Asistencia Registrada!"**: Muestra la materia, código y hora exacta del registro.
   - ⚠️ **Naranja — "Registro de Invitado"**: Tu asistencia quedó guardada pero no estás inscrito oficialmente en esa materia. Habla con el administrador.
   - ❌ **Rojo — "Error de Registro"**: Puede ser que el QR expiró, ya registraste asistencia para esa materia hoy, o hubo un problema de red. Lee el mensaje para saber el motivo exacto.

> **Regla anti-duplicados:** Solo puedes registrar una asistencia por materia por día. Si intentas escanear de nuevo el mismo día para la misma materia, el sistema lo rechazará.

### Historial
Debajo del scanner puedes ver tus **últimas 5 asistencias** registradas con nombre de la materia, código y hora.

Para ver el historial completo, clic en **"Ver todo →"** o en el ícono del reloj.

---

## Consejos Generales

| Situación | Solución |
|-----------|----------|
| Olvidé mi contraseña | El Administrador puede cambiártela desde Gestión de Usuarios → Editar |
| El QR no me escanea | Verifica que la cámara tenga permisos. Pide al docente que genere un nuevo QR si expiró. |
| Ya registré mi asistencia pero quiero registrar de nuevo | No es posible registrar dos veces la misma materia en el mismo día. |
| El código de registro no me acepta | Debe tener exactamente 12 dígitos numéricos, sin letras ni espacios. |
| Soy docente y no veo mis materias | El Administrador debe asignarte las materias desde el panel de Materias. |
| Soy docente y quiero acceder desde el celular | La app funciona, pero se recomienda usar un computador para las funciones de gestión. |
