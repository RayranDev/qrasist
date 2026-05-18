# Guía de Uso Operativo (GUIA_USO.md)

Esta guía explica cómo levantar el proyecto localmente, poblar la base de datos y probar el flujo de la aplicación desde cada rol.

---

## 1. Levantar el entorno de desarrollo local

1. Asegúrate de haber completado la **FASE 0** del `README.md` (Node.js, Supabase, Git, Variables de entorno).
2. Clona el repositorio e instala las dependencias:
   ```bash
   git clone <tu-repositorio>
   cd qr-asist
   npm install
   ```
3. Ejecuta el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 2. Configurar la Base de Datos en Supabase (Migraciones y Seed)

Accede a tu panel de Supabase > SQL Editor y ejecuta en orden:

### 2.1 Esquema Inicial (Migración)
```sql
-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum para roles
CREATE TYPE user_role AS ENUM ('ADMIN', 'PROFESSOR', 'STUDENT');

-- Tabla de perfiles asociada a auth.users
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role user_role NOT NULL DEFAULT 'STUDENT',
  name TEXT NOT NULL
);

-- Tabla de materias
CREATE TABLE subjects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  professor_id UUID REFERENCES profiles(id)
);

-- Inscripciones
CREATE TABLE enrollments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(student_id, subject_id)
);

-- Sesiones
CREATE TABLE sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  duration_minutes INT DEFAULT 90,
  qr_token UUID DEFAULT uuid_generate_v4(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Asistencias
CREATE TABLE attendances (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address TEXT,
  UNIQUE(session_id, student_id)
);

-- Funciones y Triggers para crear perfil automático al hacer signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name)
  VALUES (new.id, 'STUDENT', new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

### 2.2 Configuración de RLS (Row Level Security)
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;

-- Ejemplo de política: Todos pueden ver materias, pero solo Admin puede insertar
CREATE POLICY "Public read subjects" ON subjects FOR SELECT USING (true);
-- (Las políticas completas se deben ajustar en función del código exacto).
```

### 2.3 Datos de Prueba (Seed)
Para poblar los usuarios, es necesario crearlos primero desde **Authentication > Users** en Supabase, ya que la tabla `profiles` depende de `auth.users`.

1. Crea 1 usuario admin (ej. `admin@test.com`).
2. Crea 2 profesores (ej. `profe1@test.com`, `profe2@test.com`).
3. Crea 5 estudiantes (ej. `student1@test.com` ...).
4. Luego, desde el SQL Editor, actualiza manualmente el campo `role` en la tabla `profiles` para el admin y los profesores.
5. Inserta materias, inscripciones y sesiones vinculando los UUIDs generados.

---

## 3. Guía de Pruebas por Rol

### Como Admin
1. Inicia sesión con las credenciales del admin.
2. Ve a `/admin`.
3. Crea una nueva materia y asígnale un profesor.
4. Inscribe a un par de estudiantes en esa materia.

### Como Profesor
1. Inicia sesión con el correo de un profesor.
2. Ve a `/professor/subjects` y selecciona la materia creada.
3. Haz clic en **Crear Sesión** e introduce una duración.
4. Se abrirá la vista con el **Código QR**. Mantén esta ventana abierta en tu pantalla.

### Como Estudiante (Simulación de Escaneo)
1. Usa **tu teléfono móvil** o abre una ventana de Incógnito en el escritorio.
2. Inicia sesión como estudiante inscrito.
3. Ve a `/student/scanner`.
4. El navegador pedirá permisos de cámara. Acéptalos.
5. Apunta la cámara al QR de la pantalla del profesor.
6. Deberías ver un Check verde de éxito. Si vuelves a escanear, probarás el **Error 4** (Asistencia ya registrada).

---

## 4. Limpieza de Sesión y Errores Comunes

- **Error: "Permiso de cámara denegado"**: Asegúrate de estar usando `localhost` o `https://` (la cámara en navegador bloquea `http` si no es localhost). Verifica que en las preferencias del navegador la cámara no esté bloqueada para el sitio.
- **Error: RLS violation**: Asegúrate de que las políticas de Supabase permiten la inserción (`INSERT`) en la tabla `attendances` para usuarios autenticados.
- **Para reiniciar la prueba**: Accede a Supabase, borra el registro de tu prueba en la tabla `attendances` y vuelve a escanear. Si expiró, genera un nuevo QR desde el panel del profesor.
