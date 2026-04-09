# 🗓 Vacaciones API — GerenciAndo Canales

Backend para gestión de licencias y vacaciones. Node.js + Express + PostgreSQL (Prisma).

---

## 📁 Estructura del proyecto

```
vacaciones-api/
├── prisma/
│   └── schema.prisma        ← modelos de DB (empleados, licencias, usuarios, etc.)
├── scripts/
│   └── seed.js              ← carga datos iniciales (14 empleados del Excel)
├── src/
│   ├── index.js             ← servidor Express
│   ├── middleware/
│   │   └── auth.middleware.js  ← JWT + verificación de roles
│   ├── routes/
│   │   ├── auth.routes.js      ← login, register
│   │   ├── empleado.routes.js  ← CRUD empleados
│   │   ├── licencia.routes.js  ← licencias, aprobar, rechazar, firmar
│   │   └── feriado.routes.js   ← feriados, saldos, cierre de año
│   └── services/
│       └── calculo.service.js  ← lógica de días (LCT Argentina), saldo multi-año
├── .env.example
└── package.json
```

---

## 🚀 Instalación paso a paso

### 1. Clonar e instalar dependencias

```bash
npm install
```

### 2. Crear base de datos PostgreSQL

**Opción gratuita recomendada: [Neon.tech](https://neon.tech)**
1. Crear cuenta en neon.tech
2. Crear un nuevo proyecto
3. Copiar la connection string (empieza con `postgresql://...`)

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con tu connection string:

```env
DATABASE_URL="postgresql://usuario:password@host/vacaciones_db"
JWT_SECRET="un-string-muy-largo-y-aleatorio-aqui"
```

### 4. Crear las tablas en la DB

```bash
npx prisma db push
```

### 5. Cargar datos iniciales (14 empleados del Excel)

```bash
node scripts/seed.js
```

### 6. Iniciar el servidor

```bash
# Desarrollo (con auto-reload)
npm run dev

# Producción
npm start
```

El servidor corre en `http://localhost:3000`

---

## 🔑 Endpoints principales

### Auth
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login con email + password |
| POST | `/api/auth/register` | Crear primera empresa + admin |

### Empleados (requiere token)
| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/api/empleados` | ADMIN | Lista con saldos de todos |
| GET | `/api/empleados/:id` | ADMIN / propio | Ficha completa |
| POST | `/api/empleados` | ADMIN | Crear empleado |
| PUT | `/api/empleados/:id` | ADMIN | Editar |
| DELETE | `/api/empleados/:id` | ADMIN | Baja lógica |

### Licencias
| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/api/licencias` | ambos | Las propias / todas |
| POST | `/api/licencias` | ambos | Solicitar licencia |
| POST | `/api/licencias/:id/aprobar` | ADMIN | Aprobar |
| POST | `/api/licencias/:id/rechazar` | ADMIN | Rechazar |
| POST | `/api/licencias/:id/firmar` | ADMIN | Firmar con imagen base64 |

### Saldos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/saldos/:empleadoId?anio=2026` | Saldo con histórico |
| POST | `/api/saldos/cerrar-anio` | Cierra el año y arrastra saldos |

### Feriados
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/feriados?anio=2026` | Lista feriados del año |
| POST | `/api/feriados` | Agregar feriado |
| POST | `/api/feriados/importar` | Carga masiva desde array |

---

## 🔐 Uso del token

Después del login, incluir el token en cada request:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

## 📝 Ejemplos de uso

### Login
```json
POST /api/auth/login
{
  "email": "admin@expocolor.com",
  "password": "admin1234"
}
```

### Solicitar licencia
```json
POST /api/licencias
{
  "empleadoId": "seed-lopez",
  "fechaInicio": "2026-07-01",
  "fechaFin": "2026-07-15",
  "tipo": "VACACIONES",
  "observaciones": "Vacaciones de invierno"
}
```

### Aprobar + firmar
```json
POST /api/licencias/:id/aprobar
{ "motivo": "Aprobado por RRHH" }

POST /api/licencias/:id/firmar
{ "imagenBase64": "data:image/png;base64,iVBOR..." }
```

### Saldo de un empleado
```
GET /api/saldos/seed-lopez?anio=2026

Respuesta:
{
  "diasAsignados": 28,
  "diasTomados": 14,
  "saldoAnterior": 3,
  "saldoTotal": 17
}
```

---

## 🏢 Multi-empresa

El sistema soporta múltiples empresas. Cada empresa tiene sus propios empleados, feriados y usuarios. Los datos nunca se mezclan — el token JWT lleva el `empresaId` y todas las queries filtran por él automáticamente.

Para agregar una segunda empresa:
```
POST /api/auth/register
{ "email": "admin@otraempresa.com", "password": "...", "empresaNombre": "Otra Empresa SA" }
```

---

## 🗓 Cierre de año

Al finalizar cada año, ejecutar:
```
POST /api/saldos/cerrar-anio
{ "anio": 2026 }
```

Esto guarda el saldo no gozado de cada empleado y lo suma automáticamente al año siguiente. Resuelve el problema que tenía el Excel.

---

## 🛠 Stack técnico

- **Runtime**: Node.js
- **Framework**: Express
- **ORM**: Prisma
- **DB**: PostgreSQL (Neon / Supabase / local)
- **Auth**: JWT + bcrypt
- **Validación**: express-validator
