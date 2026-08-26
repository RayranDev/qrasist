# QR-Asist
## Sistema Digital de Control de Asistencia Académica

**Universidad Republicana · 2025**

---

# DIAPOSITIVA 1 — Portada

```
╔══════════════════════════════════════════════════════╗
║                                                      ║
║         [ Icono QR ]                                 ║
║                                                      ║
║              QR-Asist                                ║
║   Sistema de Control de Asistencia por Código QR     ║
║                                                      ║
║         Universidad Republicana · 2025               ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
```

**Qué decir:**
> *"QR-Asist es una plataforma web que digitaliza el control de asistencia en la Universidad Republicana usando códigos QR temporales. Hoy les voy a explicar el problema que resuelve, cómo funciona y qué lo hace diferente."*

---

# DIAPOSITIVA 2 — El Problema

## ¿Cómo se toma asistencia hoy?

| Método actual | Problema |
|---------------|----------|
| Lista en papel | Se pierde, se daña, tarda en digitalizarse |
| El docente llama nombres | Consume 10-15 min de clase |
| Hoja firmada | Fácil de falsificar — un estudiante firma por otro |
| Excel manual | El docente debe digitar todo después de clase |

### El resultado:
- ⏱ Tiempo de clase perdido
- 📄 Datos desorganizados o inexistentes
- 🎭 Fraude de asistencia difícil de detectar
- 📊 Sin reportes consolidados para seguimiento académico

**Qué decir:**
> *"Todos hemos vivido esto. El docente llama la lista, algunos responden por los que no están, y al final nadie tiene los datos organizados. QR-Asist resuelve exactamente eso."*

---

# DIAPOSITIVA 3 — La Solución

## QR-Asist: 3 pasos, menos de 1 minuto

```
  DOCENTE                        ESTUDIANTE
     │                               │
     │  1. Abre la app               │
     │  2. Clic en "Generar QR"      │
     │  3. Proyecta el código ──────►│  4. Escanea con el celular
     │                               │  5. ✅ Asistencia registrada
     │                               │
     ▼                               ▼
  Sistema registra automáticamente con hora, fecha e IP
```

**Sin listas. Sin papel. Sin fraude fácil.**

El QR **expira en 15 minutos** → solo quien está en clase puede registrarse.
El sistema **no permite duplicados** → un escaneo por materia por día.

**Qué decir:**
> *"El docente genera el QR con un clic, lo proyecta, los estudiantes lo escanean desde sus celulares y listo. En menos de un minuto, todos registrados, datos en la nube, sin papel."*

---

# DIAPOSITIVA 4 — ¿Cómo funciona? (Demo visual)

## Flujo completo en 5 pasos

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  [1] Admin crea       [2] Docente genera    [3] QR en   │
│      al docente           la sesión             pantalla│
│      y la materia         ↓                    ↓        │
│      ↓              ┌─────────────┐    ┌──────────────┐ │
│  ┌──────────┐       │  QR activo  │    │ ████ ██ ████ │ │
│  │ Gestión  │       │  15 min     │    │ █  █    █  █ │ │
│  │ usuarios │       │  countdown  │    │ ████ ██ ████ │ │
│  └──────────┘       └─────────────┘    └──────────────┘ │
│                                                         │
│  [4] Estudiante       [5] Confirmación     [6] Historial│
│      escanea              instantánea          del      │
│      ↓                    ↓                   docente  │
│  ┌──────────┐       ┌─────────────┐    ┌──────────────┐ │
│  │ 📷 Cámara│       │ ✅ Registrado│    │ 18/05 · 12   │ │
│  │  activa  │       │ POO-201     │    │ 19/05 · 15   │ │
│  └──────────┘       │ 10:32 AM    │    │ 20/05 · 11   │ │
│                     └─────────────┘    └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Qué decir:**
> *"Veamos el flujo completo. El administrador ya creó las materias y los usuarios. El docente genera el QR, lo proyecta, y el estudiante lo escanea. El sistema confirma con el nombre de la materia y la hora exacta. El docente después puede ver el consolidado."*

---

# DIAPOSITIVA 5 — Tres Perfiles, Tres Experiencias

## Diseñado para cada usuario

### 👑 Administrador
- Panel de control con estadísticas en tiempo real
- Gestión de usuarios, materias e inscripciones
- Visualización de consolidados académicos
- Acceso recomendado desde computador

### 👨‍🏫 Docente
- Genera QR con un clic
- Ve cuántos estudiantes tiene por materia
- Historial detallado exportable a Excel (CSV)
- Puede editar su propio perfil

### 🎓 Estudiante
- Diseñado 100% para celular
- Escanea → confirmación instantánea con detalle
- Ve su historial de asistencias sin ir a otro menú
- Registro propio con código institucional de 12 dígitos

**Qué decir:**
> *"Cada perfil tiene una experiencia diferente, diseñada para su necesidad. El estudiante solo necesita abrir la app, la cámara se activa sola y escanea. El docente tiene el historial completo con exportación a Excel."*

---

# DIAPOSITIVA 6 — Seguridad y Confiabilidad

## ¿Por qué no se puede hacer trampa?

| Mecanismo | ¿Qué previene? |
|-----------|----------------|
| QR expira en 15 min | Compartir el QR por WhatsApp no sirve |
| Un escaneo por materia por día | No se puede registrar dos veces |
| Registro de IP | Trazabilidad de dónde se registró |
| Soft delete | Los datos nunca se borran, solo se archivan |
| Código de 12 dígitos único | No hay dos estudiantes con el mismo código |
| Dominio `@urepublicana.edu.co` | Solo usuarios institucionales |
| Sesiones archivadas | Un QR archivado no acepta registros |

**Qué decir:**
> *"El sistema tiene múltiples capas de seguridad. La más importante es el tiempo de expiración: si alguien le manda el QR a un amigo por WhatsApp, ya habrá expirado antes de que pueda escanearlo."*

---

# DIAPOSITIVA 7 — Tecnología

## Stack moderno y profesional

```
┌────────────────────────────────────────┐
│            FRONTEND                    │
│  Next.js 16  ·  React 19  ·  TypeScript│
│  Tailwind CSS 4  ·  Lucide Icons       │
└───────────────────┬────────────────────┘
                    │
┌───────────────────▼────────────────────┐
│            BACKEND                     │
│  Next.js Server Actions (sin API REST) │
│  Lógica 100% en servidor               │
└───────────────────┬────────────────────┘
                    │
┌───────────────────▼────────────────────┐
│          BASE DE DATOS                 │
│  PostgreSQL via Supabase               │
│  Autenticación JWT · RLS               │
└────────────────────────────────────────┘
                    │
┌───────────────────▼────────────────────┐
│            DEPLOY                      │
│  Vercel (serverless, global CDN)       │
│  Disponible 24/7 sin servidor propio   │
└────────────────────────────────────────┘
```

**Sin costo de infraestructura** — planes gratuitos de Vercel y Supabase cubren el uso universitario inicial.

**Qué decir:**
> *"Usamos tecnología de nivel empresarial. El mismo stack que usan empresas como Notion, Linear y Vercel internamente. La app vive en la nube, no necesita servidor físico, y está disponible 24/7."*

---

# DIAPOSITIVA 8 — Estadísticas en Tiempo Real

## El Admin siempre sabe qué está pasando

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│    👑    │  │   👨‍🏫   │  │    🎓   │  │    📚   │  │    📅   │
│    2     │  │    8     │  │   120    │  │    8     │  │    3     │
│  Admins  │  │ Docentes │  │Estudiants│  │ Materias │  │ Hoy      │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘

┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐
│   DOCENTES     │  │    MATERIAS     │  │   ESTUDIANTES    │
│ Juan P.   · 3  │  │ Algoritmos · 25 │  │ Ana G.    · 4    │
│ María L.  · 2  │  │ POO        · 18 │  │ Carlos M. · 3    │
│ Pedro R.  · 2  │  │ Base Datos · 22 │  │ Laura S.  · 5    │
│ ...            │  │ ...             │  │ ...              │
└────────────────┘  └─────────────────┘  └──────────────────┘
```

**Qué decir:**
> *"El administrador tiene una vista de todo en tiempo real: cuántos docentes hay, cuántas clases pasaron hoy, cuántos estudiantes tiene cada materia. No hay que pedirle nada a nadie, está todo en pantalla."*

---

# DIAPOSITIVA 9 — Casos de Uso Reales

## Escenarios que resuelve QR-Asist

**Caso 1: Clase normal**
> El docente llega al salón, abre la app, genera el QR y lo proyecta. Los 25 estudiantes escanean en 2 minutos. El docente empieza la clase sin perder tiempo.

**Caso 2: Estudiante llega tarde**
> El QR sigue activo hasta 15 minutos después de generado. El estudiante que llega a los 10 minutos todavía puede registrarse.

**Caso 3: Estudiante de otra materia**
> Un estudiante de otro grupo entra equivocado y escanea. El sistema lo registra como "invitado" y el docente puede verlo diferenciado en el historial.

**Caso 4: Docente necesita el listado para el decano**
> Dos clics: entra al historial, selecciona la fecha, descarga el CSV. Listo para entregar.

**Caso 5: Estudiante dado de baja**
> El admin desactiva el usuario. El estudiante no puede volver a iniciar sesión. Sus registros históricos se conservan.

**Qué decir:**
> *"Estos son casos reales que pasan todos los días. El sistema está pensado para la realidad del salón de clase colombiano."*

---

# DIAPOSITIVA 10 — Diferenciadores

## ¿Por qué QR-Asist y no otra solución?

| | QR-Asist | Lista en papel | Google Forms | App genérica |
|--|:---:|:---:|:---:|:---:|
| Tiempo de registro | < 1 min | 10-15 min | Variable | Variable |
| Sin papel | ✅ | ❌ | ✅ | ✅ |
| Anti-fraude | ✅ | ❌ | ❌ | Parcial |
| Datos organizados | ✅ | ❌ | Parcial | Parcial |
| Exportación CSV | ✅ | ❌ | ✅ | Parcial |
| Hecho para la U. Rep. | ✅ | ❌ | ❌ | ❌ |
| Sin instalar app | ✅ | ✅ | ✅ | ❌ |
| Funciona offline | ❌ | ✅ | ❌ | Parcial |
| Costo | Gratuito | Papel | Gratuito | Variable |

**Qué decir:**
> *"La gran ventaja frente a soluciones genéricas es que QR-Asist fue construido específicamente para la Universidad Republicana: con el dominio institucional, los códigos estudiantiles de 12 dígitos, y los flujos que necesita la institución."*

---

# DIAPOSITIVA 11 — Roadmap (Lo que viene)

## Próximas funcionalidades

### Corto plazo
- [ ] Notificaciones push cuando el docente genera el QR
- [ ] Porcentaje de asistencia por estudiante (alerta de riesgo académico)
- [ ] Importación masiva de usuarios desde Excel

### Mediano plazo
- [ ] Reportes automáticos por período académico
- [ ] Panel de estadísticas con gráficas de tendencias
- [ ] Modo sin conexión (PWA con sync posterior)

### Largo plazo
- [ ] Integración con sistema académico institucional
- [ ] QR con geolocalización (validar que el estudiante está en el campus)
- [ ] Reconocimiento facial opcional como capa adicional

**Qué decir:**
> *"La aplicación está funcionando y lista para usarse. Estas son las funcionalidades que vendrán en las siguientes versiones según las necesidades que vayan surgiendo."*

---

# DIAPOSITIVA 12 — Demo en Vivo

## Veámoslo funcionar

### Guión sugerido para la demo:

1. **Abrir** `qrasist.vercel.app` desde el computador
2. **Ingresar como Admin** → mostrar el dashboard con estadísticas
3. **Ir a Gestión de Usuarios** → mostrar la tabla con filtros
4. **Ir a Materias** → mostrar las 8 materias creadas
5. **Cerrar sesión** → ingresar como Docente
6. **Mostrar** el saludo personalizado y las materias asignadas
7. **Generar QR** para una materia → mostrar el countdown
8. **Desde celular**, abrir `qrasist.vercel.app` como Estudiante
9. **Escanear el QR** → mostrar la confirmación con materia y hora
10. **Volver al docente** → mostrar el historial con el registro reciente

**Qué decir:**
> *"Les voy a mostrar el sistema funcionando en tiempo real. Voy a necesitar que alguien saque el celular para que veamos el escaneo en vivo."*

---

# DIAPOSITIVA 13 — Cierre

## QR-Asist está listo

```
                    ██████  █████████
                   ██    ████       ██
                  ██   ████  █████   ██
                 ██   ██ ██ ██   ██   ██
                ██   ██  ████     ██   ██
               ██   ██   ████      ██   ██
              ████████████████████████████

              Menos papel. Más datos. Más clase.
```

**Accede ahora:**
🌐 `qrasist.vercel.app`

**Repositorio:**
💻 `github.com/RayranDev/qrasist`

---

> *"QR-Asist no es un proyecto a futuro. Está funcionando hoy, en producción, disponible para toda la universidad. Solo falta empezar a usarlo."*

---

## Preguntas frecuentes para la presentación

**¿Qué pasa si el estudiante no tiene internet?**
> Necesita conexión para escanear. Pero en el campus hay WiFi disponible, y los datos móviles consumen menos de 50KB por registro.

**¿Qué pasa si el docente no tiene cómo proyectar el QR?**
> El docente puede mostrar la pantalla del computador directamente o incluso mostrar el celular si el salón es pequeño. En el futuro se puede agregar modo offline.

**¿Los datos son seguros?**
> Sí. Todo corre sobre Supabase (infraestructura de AWS) con conexiones HTTPS cifradas. Los datos nunca se eliminan, solo se archivan.

**¿Cuánto cuesta?**
> Actualmente corre en planes gratuitos de Vercel y Supabase, suficientes para el volumen de la universidad en esta etapa.

**¿Se puede usar desde iPhone?**
> Sí. Funciona en cualquier navegador moderno (Chrome, Safari, Firefox) en iOS y Android. No requiere instalar ninguna aplicación.

---

*QR-Asist · Universidad Republicana · 2025*
*Desarrollado con Next.js, Supabase y Vercel*
