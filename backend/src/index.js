require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes     = require('./routes/auth.routes');
const empleadoRoutes = require('./routes/empleado.routes');
const licenciaRoutes = require('./routes/licencia.routes');
const { feriadoRouter, saldoRouter, empresaRouter } = require('./routes/feriado.routes');

const app = express();

// ── Seguridad ─────────────────────────────────────────────────────────────────
app.use(helmet());

const isDev = process.env.NODE_ENV !== 'production';
app.use(cors({
  origin: isDev
    ? (origin, cb) => cb(null, true) // en desarrollo acepta cualquier origen (file://, localhost:*)
    : process.env.FRONTEND_URL,      // en producción solo el dominio configurado
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: { error: 'Demasiados intentos. Intentá en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login',          authLimiter);
app.use('/api/auth/recuperar',      authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// ── Middlewares globales ──────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' })); // 5mb para admitir imágenes de firma en base64

// ── Rutas ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/empleados', empleadoRoutes);
app.use('/api/licencias', licenciaRoutes);
app.use('/api/feriados',  feriadoRouter);
app.use('/api/saldos',    saldoRouter);
app.use('/api/empresas',  empresaRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '1.0.0', env: process.env.NODE_ENV });
});

// ── Manejo de errores global ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
  });
});

// ── Iniciar ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ API corriendo en http://localhost:${PORT}`);
});
