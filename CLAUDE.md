# Sistema de Licencias y Vacaciones — GerenciAndo Canales

## Contexto del proyecto

Sistema web para gestionar licencias y vacaciones de empleados, desarrollado para **Expo Color** como cliente de **GerenciAndo Canales** (empresa de consultoría de Hollman León). Reemplaza un Excel complejo que Hollman había armado manualmente.

El sistema fue construido desde cero en conversación con Facundo Brusco (bruscofacundo1@gmail.com), que es el admin principal.

---

## Stack tecnológico

### Backend
- **Runtime:** Node.js v24
- **Framework:** Express.js
- **ORM:** Prisma
- **Base de datos:** PostgreSQL en Neon.tech (región São Paulo)
- **Auth:** JWT + bcrypt
- **Email:** Nodemailer con Gmail (contraseña de aplicación de Google)
- **Validación:** express-validator

### Frontend
- **Tecnología:** HTML + CSS + JavaScript vanilla (sin frameworks)
- **Fuentes:** Syne + DM Sans (Google Fonts)
- **Librerías CDN:**
  - `signature_pad` — firma digital en canvas
  - `xlsx` (SheetJS) — importar/exportar Excel

### Estructura de carpetas
```
proyecto-vacaciones/
├── backend/                  ← Node.js API
│   ├── src/
│   │   ├── index.js          ← servidor Express, puerto 3000
│   │   ├── middleware/
│   │   │   └── auth.middleware.js   ← JWT verify + requiereRol()
│   │   ├── routes/
│   │   │   ├── auth.routes.js       ← login, register, recuperar, reset, usuarios
│   │   │   ├── empleado.routes.js   ← CRUD empleados + importar masivo
│   │   │   ├── licencia.routes.js   ← CRUD licencias + aprobar/rechazar/firmar
│   │   │   └── feriado.routes.js    ← feriados + saldos + cierre de año + empresa
│   │   └── services/
│   │       ├── calculo.service.js   ← lógica LCT argentina
│   │       └── email.service.js     ← templates de email con Nodemailer
│   ├── prisma/
│   │   └── schema.prisma
│   ├── scripts/
│   │   ├── seed.js           ← carga datos iniciales (14 empleados reales)
│   │   ├── fix-admin.js      ← script para arreglar email del admin
│   │   └── update-admin.js
│   ├── .env                  ← DATABASE_URL, JWT_SECRET, EMAIL_USER, EMAIL_PASS, FRONTEND_URL
│   └── package.json
│
└── frontend/                 ← HTML estático
    ├── login.html            ← login + recuperar contraseña
    ├── dashboard.html        ← panel principal admin + vista empleado
    ├── empleados.html        ← ABM empleados + importar Excel
    ├── usuarios.html         ← gestión de usuarios y roles
    └── reset-password.html   ← página para elegir nueva contraseña (desde link de email)
```

---

## Variables de entorno (.env)

```env
DATABASE_URL="postgresql://..."           # Neon.tech
JWT_SECRET="string-secreto-largo"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
EMAIL_USER="cuenta@gmail.com"             # cuenta Gmail para enviar emails
EMAIL_PASS="xxxx xxxx xxxx xxxx"          # contraseña de aplicación de Google (16 chars)
FRONTEND_URL="http://localhost"           # para los links de recuperar contraseña
```

---

## Modelos de base de datos (Prisma)

```
Empresa          → tiene Usuarios, Empleados, Feriados
Usuario          → email, password (bcrypt), rol (ADMIN|EMPLEADO), resetToken, resetTokenExpiry
                   puede estar vinculado a un Empleado (1:1)
Empleado         → nombre, apellido, documento, cuil, fechaIngreso, area, activo
                   tiene Licencias, SaldoAnual, Usuario
Licencia         → fechaInicio, fechaFin, diasHabiles, tipo, estado, observaciones
                   tipos: VACACIONES | PERMISO | LICENCIA_MEDICA | AUSENCIA
                   estados: PENDIENTE | APROBADA | RECHAZADA | CUMPLIDA
Aprobacion       → vinculada a Licencia (1:1), estado + motivo
Firma            → imagenBase64 (PNG canvas), vinculada a Licencia (1:1)
SaldoAnual       → empleadoId + anio (unique), diasAsignados, diasTomados, diasPendientes
                   resuelve el problema multi-año del Excel
Feriado          → fecha, nombre, tipo, anio, empresaId
```

---

## Lógica de negocio central — LCT Argentina

### Cálculo de días de vacaciones (`calculo.service.js`)

Replicación exacta de la calculadora de Ignacio (usada por Expo Color):

```
Antigüedad < 5 años:
  - Si acumuló > 6 meses de días hábiles → 14 días
  - Si no → proporcional: round(diasHabiles / 20)

5 a 10 años  → 21 días
10 a 20 años → 28 días
Más de 20    → 35 días
```

- Se calcula al 31/12 del año de análisis
- Los **domingos** se excluyen siempre
- Los **feriados** de la empresa se excluyen
- Los **sábados SÍ cuentan** (igual que NETWORKDAYS.INTL con "0000001" en Excel)

### Saldo multi-año
- Problema del Excel original: solo calculaba un año
- Solución: tabla `SaldoAnual` acumula saldos entre años
- Endpoint `POST /api/saldos/cerrar-anio` cierra el año al 31/12

---

## Autenticación y roles

### Roles
- **ADMIN:** ve dashboard completo, crea/edita empleados, aprueba licencias, firma, gestiona usuarios
- **EMPLEADO:** ve solo su propio panel (saldo, historial), puede solicitar licencias, puede firmar su conformidad

### Flujo de login
1. `POST /api/auth/login` → devuelve JWT con `{ id, email, rol, empresaId, empleadoId }`
2. JWT va en header `Authorization: Bearer <token>` en cada request
3. Middleware `autenticar` verifica el token
4. Middleware `requiereRol('ADMIN')` protege rutas sensibles

### Contraseña inicial de empleados
- Se establece automáticamente = DNI del empleado al crearlo desde el formulario
- El empleado puede cambiarla desde su panel

### Recuperación de contraseña
1. `POST /api/auth/recuperar` → genera token, guarda en DB, envía email con link
2. Link lleva a `reset-password.html?token=xxx`
3. `POST /api/auth/reset-password` → valida token (expira en 1h), actualiza contraseña

---

## API — Endpoints principales

```
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/cambiar-password      (autenticado)
POST   /api/auth/recuperar
POST   /api/auth/reset-password
GET    /api/auth/usuarios              (ADMIN)
POST   /api/auth/usuarios              (ADMIN) — crear admin sin empleado vinculado
PUT    /api/auth/usuarios/:id          (ADMIN) — cambiar rol o reactivar
DELETE /api/auth/usuarios/:id          (ADMIN) — baja lógica

GET    /api/empleados                  (ADMIN) — lista con saldos calculados
GET    /api/empleados/:id              (ADMIN o propio empleado)
POST   /api/empleados                  (ADMIN) — crear empleado + usuario vinculado
POST   /api/empleados/importar         (ADMIN) — carga masiva desde array JSON
PUT    /api/empleados/:id              (ADMIN)
DELETE /api/empleados/:id              (ADMIN) — baja lógica

GET    /api/licencias                  (ADMIN: todas | EMPLEADO: las suyas)
POST   /api/licencias                  — crear solicitud
POST   /api/licencias/:id/aprobar      (ADMIN)
POST   /api/licencias/:id/rechazar     (ADMIN)
POST   /api/licencias/:id/firmar       — firma base64 del canvas
DELETE /api/licencias/:id              (ADMIN)

GET    /api/feriados                   ?anio=2026
POST   /api/feriados/sincronizar       (ADMIN) — trae de nager.date (API oficial AR)
POST   /api/feriados/importar          (ADMIN) — carga masiva
DELETE /api/feriados/:id               (ADMIN)

GET    /api/saldos/:empleadoId         ?anio=2026
POST   /api/saldos/cerrar-anio         (ADMIN)

GET    /api/health
```

---

## Frontend — páginas y funcionalidad

### `login.html`
- Login con email + contraseña
- Link "¿Olvidaste tu contraseña?" que muestra panel de recuperación inline
- Botones demo preconfigurados

### `dashboard.html`
- **Vista ADMIN:** stats, tabla de empleados con columnas del Excel original (F. Ingreso, Área, Antigüedad, Días a gozar, Días pendientes), panel de pendientes, para firmar
- **Vista EMPLEADO:** saldo propio, historial de licencias, botón firmar conformidad, cambiar contraseña
- Sidebar con: Dashboard, Empleados, Usuarios, Licencias, Feriados
- Feriados: toggle **Lista / Calendario** (12 meses, feriados marcados en púrpura)
- Notificaciones toast para todas las acciones

### `empleados.html`
- Tabla con DNI, Área, Fecha ingreso, Antigüedad, Saldo
- Formulario simplificado: Nombre, Apellido, DNI, Fecha ingreso, Área, Email
- Contraseña automática = DNI (se muestra aviso verde)
- Editar empleado (sin cambiar email/pass)
- Baja lógica con confirmación
- Importar desde Excel (.xlsx) con drag & drop y preview
- Descargar plantilla Excel con formato correcto
- Exportar CSV

### `usuarios.html`
- Lista todos los usuarios de la empresa
- Crear nuevos admins o empleados con contraseña manual
- Cambiar rol (Admin ↔ Empleado)
- Desactivar / reactivar usuarios

### `reset-password.html`
- Recibe el token por URL query param
- Valida y permite elegir nueva contraseña
- Redirige al login al completar

---

## Emails automáticos (Nodemailer)

Se envían automáticamente sin bloquear la respuesta HTTP (`.catch(console.error)`):

| Evento | Destinatario | Cuándo |
|--------|-------------|--------|
| Nueva solicitud | Admin | Empleado crea licencia |
| Licencia aprobada | Empleado | Admin aprueba |
| Licencia rechazada | Empleado | Admin rechaza + motivo |
| Licencia firmada | Empleado | Admin firma, estado → CUMPLIDA |
| Recuperar contraseña | Usuario | Solicita reset |

---

## Multi-empresa (multi-tenant)

El sistema soporta múltiples empresas. Cada empresa tiene sus propios empleados, feriados, licencias y usuarios. El `empresaId` viaja en el JWT y todas las queries filtran por él automáticamente. Para agregar una nueva empresa se usa `POST /api/auth/register`.

---

## Comandos útiles

```bash
# Levantar el backend en desarrollo
npm run dev

# Actualizar la DB después de cambiar schema.prisma
npx prisma db push

# Ver la DB en interfaz visual
npx prisma studio

# Cargar datos iniciales (14 empleados de Expo Color)
node scripts/seed.js

# Arreglar email del admin
node scripts/fix-admin.js
```

---

## Datos de prueba (después del seed)

- **Admin:** bruscofacundo1@gmail.com / admin1234
- **Empleado ejemplo:** analia@empresa.com / empleado1234
- **Empleados nuevos:** email configurado / DNI como contraseña

---

## Cosas pendientes / próximos pasos

- [ ] Recuperación de contraseña — backend listo, falta probar el flujo completo
- [ ] Deploy en Railway (backend) + Vercel (frontend) + Neon (ya está)
- [ ] Cierre de año automático al 31/12 (endpoint existe, falta tarea programada)
- [ ] Integración con Google Calendar (AppScript original de Hollman)
- [ ] Reportes en PDF por empleado
- [ ] Notificaciones push o WhatsApp

---

## Contexto de negocio

- **Cliente:** Expo Color (empresa con ~14 empleados en Argentina)
- **Responsable RRHH:** Mabel (la que usa el sistema en Expo Color)
- **Creador del Excel original:** Hollman León (consultor de GerenciAndo Canales)
- **Desarrollador:** Facundo Brusco (estudiante, está viendo HTML/CSS/JS/Node en la facultad)
- **Ley aplicada:** Ley de Contrato de Trabajo argentina (LCT) Art. 150 — días de vacaciones según antigüedad
- **Feriados:** Se sincronizan automáticamente desde nager.date (datos oficiales del Ministerio del Interior)
