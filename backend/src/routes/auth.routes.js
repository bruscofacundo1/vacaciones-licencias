require('dotenv').config();
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { autenticar, requiereRol } = require('../middleware/auth.middleware');
const { emailRecuperarPassword } = require('../services/email.service');

const prisma = new PrismaClient();
const router = express.Router();

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login',
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').notEmpty().withMessage('Contraseña requerida'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const usuario = await prisma.usuario.findUnique({
        where: { email },
        include: { empleado: true, empresa: true },
      });

      if (!usuario || !usuario.activo) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      const passwordOk = await bcrypt.compare(password, usuario.password);
      if (!passwordOk) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      const payload = {
        id:         usuario.id,
        email:      usuario.email,
        rol:        usuario.rol,
        empresaId:  usuario.empresaId,
        empleadoId: usuario.empleadoId || null,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      });

      res.json({
        token,
        usuario: {
          id:      usuario.id,
          email:   usuario.email,
          rol:     usuario.rol,
          empresa: usuario.empresa.nombre,
          empleado: usuario.empleado ? {
            id:       usuario.empleado.id,
            nombre:   usuario.empleado.nombre,
            apellido: usuario.empleado.apellido,
            area:     usuario.empleado.area,
          } : null,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register',
  [
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('empresaNombre').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, empresaNombre } = req.body;
    try {
      const existente = await prisma.usuario.findUnique({ where: { email } });
      if (existente) return res.status(409).json({ error: 'Email ya registrado' });

      const hash = await bcrypt.hash(password, 10);
      const resultado = await prisma.$transaction(async (tx) => {
        const empresa = await tx.empresa.create({ data: { nombre: empresaNombre } });
        const usuario = await tx.usuario.create({
          data: { email, password: hash, rol: 'ADMIN', empresaId: empresa.id },
        });
        return { empresa, usuario };
      });

      res.status(201).json({ mensaje: 'Empresa y admin creados', empresaId: resultado.empresa.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// ── POST /api/auth/cambiar-password ──────────────────────────────────────────
router.post('/cambiar-password', autenticar, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body;
  if (!passwordActual || !passwordNueva) return res.status(400).json({ error: 'Faltan campos' });
  if (passwordNueva.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' });

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id } });
    const ok = await bcrypt.compare(passwordActual, usuario.password);
    if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

    const hash = await bcrypt.hash(passwordNueva, 10);
    await prisma.usuario.update({ where: { id: req.user.id }, data: { password: hash } });
    res.json({ mensaje: 'Contraseña actualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── POST /api/auth/recuperar ──────────────────────────────────────────────────
router.post('/recuperar', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { empleado: true },
    });

    // Siempre OK para no revelar si el email existe
    if (!usuario || !usuario.activo) {
      return res.json({ mensaje: 'Si el email existe, recibirás un link en breve' });
    }

    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await prisma.usuario.update({
      where: { id: usuario.id },
      data:  { resetToken: token, resetTokenExpiry: expiry },
    });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost'}/reset-password.html?token=${token}`;

    await emailRecuperarPassword({
      email:    usuario.email,
      nombre:   usuario.empleado?.nombre || 'Usuario',
      resetUrl,
    });

    res.json({ mensaje: 'Si el email existe, recibirás un link en breve' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, passwordNueva } = req.body;
  if (!token || !passwordNueva) return res.status(400).json({ error: 'Faltan campos' });
  if (passwordNueva.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' });

  try {
    const usuario = await prisma.usuario.findFirst({
      where: {
        resetToken:        token,
        resetTokenExpiry:  { gt: new Date() },
      },
    });

    if (!usuario) {
      return res.status(400).json({ error: 'El link es inválido o ya expiró. Solicitá uno nuevo.' });
    }

    const hash = await bcrypt.hash(passwordNueva, 10);
    await prisma.usuario.update({
      where: { id: usuario.id },
      data:  { password: hash, resetToken: null, resetTokenExpiry: null },
    });

    res.json({ mensaje: 'Contraseña actualizada. Ya podés iniciar sesión.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── GET /api/auth/usuarios ────────────────────────────────────────────────────
router.get('/usuarios', autenticar, requiereRol('ADMIN'), async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { empresaId: req.user.empresaId },
      select: {
        id: true, email: true, rol: true, activo: true, createdAt: true,
        empleado: { select: { nombre: true, apellido: true, area: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── POST /api/auth/usuarios ───────────────────────────────────────────────────
// Crear nuevo admin (sin empleado vinculado)
router.post('/usuarios', autenticar, requiereRol('ADMIN'),
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres'),
    body('rol').isIn(['ADMIN', 'EMPLEADO']).withMessage('Rol inválido'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, rol } = req.body;
    try {
      const existente = await prisma.usuario.findUnique({ where: { email } });
      if (existente) return res.status(409).json({ error: 'El email ya está registrado' });

      const hash    = await bcrypt.hash(password, 10);
      const usuario = await prisma.usuario.create({
        data: { email, password: hash, rol, empresaId: req.user.empresaId },
      });

      res.status(201).json({ id: usuario.id, email: usuario.email, rol: usuario.rol });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// ── PUT /api/auth/usuarios/:id ────────────────────────────────────────────────
router.put('/usuarios/:id', autenticar, requiereRol('ADMIN'), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'No podés modificar tu propia cuenta desde acá' });
  }
  const { rol, activo } = req.body;
  try {
    await prisma.usuario.updateMany({
      where: { id: req.params.id, empresaId: req.user.empresaId },
      data: {
        ...(rol    !== undefined && { rol }),
        ...(activo !== undefined && { activo }),
      },
    });
    res.json({ mensaje: 'Usuario actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── DELETE /api/auth/usuarios/:id ─────────────────────────────────────────────
router.delete('/usuarios/:id', autenticar, requiereRol('ADMIN'), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'No podés eliminar tu propia cuenta' });
  }
  try {
    await prisma.usuario.updateMany({
      where: { id: req.params.id, empresaId: req.user.empresaId },
      data:  { activo: false },
    });
    res.json({ mensaje: 'Usuario desactivado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── PUT /api/auth/usuarios/:id/vincular ──────────────────────────────────────
router.put('/usuarios/:id/vincular', autenticar, requiereRol('ADMIN'), async (req, res) => {
  const { empleadoId } = req.body;
  if (!empleadoId) return res.status(400).json({ error: 'empleadoId requerido' });

  try {
    // Verificar que el usuario pertenece a la empresa
    const usuario = await prisma.usuario.findFirst({
      where: { id: req.params.id, empresaId: req.user.empresaId },
    });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Verificar que el empleado pertenece a la empresa y no tiene usuario
    const empleado = await prisma.empleado.findFirst({
      where: { id: empleadoId, empresaId: req.user.empresaId },
      include: { usuario: true },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
    if (empleado.usuario) return res.status(400).json({ error: 'Ese empleado ya tiene un usuario vinculado' });

    await prisma.usuario.update({
      where: { id: req.params.id },
      data: { empleadoId },
    });
    res.json({ mensaje: 'Usuario vinculado al empleado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── DELETE /api/auth/usuarios/:id/eliminar ────────────────────────────────────
router.delete('/usuarios/:id/eliminar', autenticar, requiereRol('ADMIN'), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'No podés eliminar tu propia cuenta' });
  }
  try {
    const usuario = await prisma.usuario.findFirst({
      where: { id: req.params.id, empresaId: req.user.empresaId },
    });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    await prisma.usuario.delete({ where: { id: req.params.id } });
    res.json({ mensaje: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;