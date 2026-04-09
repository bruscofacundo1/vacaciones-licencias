const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { autenticar, requiereRol } = require('../middleware/auth.middleware');
const { calcularSaldoEmpleado } = require('../services/calculo.service');

const prisma = new PrismaClient();
const router = express.Router();
router.use(autenticar);

// ── GET /api/empleados ────────────────────────────────────────────────────────
router.get('/', requiereRol('ADMIN'), async (req, res) => {
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();
    const empleados = await prisma.empleado.findMany({
      where: { empresaId: req.user.empresaId, activo: true },
      orderBy: { apellido: 'asc' },
    });
    const resultado = await Promise.all(
      empleados.map(async (emp) => {
        const saldo = await calcularSaldoEmpleado(emp.id, anio);
        return { ...emp, ...saldo, anio };
      })
    );
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
});

// ── GET /api/empleados/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const esAdmin = req.user.rol === 'ADMIN';
    if (!esAdmin && req.user.empleadoId !== req.params.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    const anio = parseInt(req.query.anio) || new Date().getFullYear();
    const empleado = await prisma.empleado.findFirst({
      where: { id: req.params.id, empresaId: req.user.empresaId },
      include: {
        licencias: {
          orderBy: { fechaInicio: 'desc' },
          include: { aprobacion: true, firma: true },
        },
        saldos: { orderBy: { anio: 'desc' } },
        usuario: { select: { email: true, rol: true } },
      },
    });
    if (!empleado) return res.status(404).json({ error: 'No encontrado' });
    const saldo = await calcularSaldoEmpleado(empleado.id, anio);
    res.json({ ...empleado, saldo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener empleado' });
  }
});

// ── POST /api/empleados ───────────────────────────────────────────────────────
router.post(
  '/',
  requiereRol('ADMIN'),
  [
    body('nombre').notEmpty().withMessage('Nombre requerido'),
    body('apellido').notEmpty().withMessage('Apellido requerido'),
    body('fechaIngreso').isISO8601().withMessage('Fecha de ingreso inválida'),
    body('area').notEmpty().withMessage('Área requerida'),
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('Contraseña mínimo 6 caracteres'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      nombre, apellido, documento, cuil, telefono,
      fechaNacimiento, fechaIngreso, area, email, password,
    } = req.body;

    try {
      const existente = await prisma.usuario.findUnique({ where: { email } });
      if (existente) return res.status(409).json({ error: 'El email ya está registrado' });

      console.log(`[CREAR EMPLEADO] email=${email} password='${password}' len=${password?.length}`);
      const hash = await bcrypt.hash(password, 10);

      const resultado = await prisma.$transaction(async (tx) => {
        const empleado = await tx.empleado.create({
          data: {
            nombre,
            apellido,
            documento:       documento || null,
            cuil:            cuil || null,
            telefono:        telefono || null,
            fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
            fechaIngreso:    new Date(fechaIngreso),
            area,
            empresaId:       req.user.empresaId,
          },
        });
        const usuario = await tx.usuario.create({
          data: {
            email,
            password:  hash,
            rol:       'EMPLEADO',
            empresaId: req.user.empresaId,
            empleadoId: empleado.id,
          },
        });
        return { empleado, usuario };
      });

      res.status(201).json(resultado.empleado);
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ error: 'Email ya en uso' });
      console.error(err);
      res.status(500).json({ error: 'Error al crear empleado' });
    }
  }
);

// ── POST /api/empleados/importar ──────────────────────────────────────────────
// Importación masiva desde Excel (el frontend parsea el xlsx y envía un array)
router.post('/importar', requiereRol('ADMIN'), async (req, res) => {
  const { empleados } = req.body;
  if (!Array.isArray(empleados) || empleados.length === 0) {
    return res.status(400).json({ error: 'Array de empleados requerido' });
  }

  const resultados = { creados: 0, errores: [] };

  for (const emp of empleados) {
    try {
      if (!emp.nombre || !emp.apellido || !emp.fechaIngreso || !emp.area || !emp.email) {
        resultados.errores.push({ empleado: `${emp.nombre} ${emp.apellido}`, error: 'Faltan campos obligatorios' });
        continue;
      }

      const existente = await prisma.usuario.findUnique({ where: { email: emp.email } });
      if (existente) {
        resultados.errores.push({ empleado: `${emp.nombre} ${emp.apellido}`, error: 'Email ya registrado' });
        continue;
      }

      // Contraseña por defecto: DNI o "cambiar1234"
      const passDefault = emp.documento || 'cambiar1234';
      const hash = await bcrypt.hash(passDefault, 10);

      await prisma.$transaction(async (tx) => {
        const empleado = await tx.empleado.create({
          data: {
            nombre:          emp.nombre.trim(),
            apellido:        emp.apellido.trim(),
            documento:       emp.documento || null,
            cuil:            emp.cuil || null,
            telefono:        emp.telefono || null,
            fechaNacimiento: emp.fechaNacimiento ? new Date(emp.fechaNacimiento) : null,
            fechaIngreso:    new Date(emp.fechaIngreso),
            area:            emp.area.trim(),
            empresaId:       req.user.empresaId,
          },
        });
        await tx.usuario.create({
          data: {
            email:      emp.email.trim().toLowerCase(),
            password:   hash,
            rol:        'EMPLEADO',
            empresaId:  req.user.empresaId,
            empleadoId: empleado.id,
          },
        });
      });

      resultados.creados++;
    } catch (err) {
      resultados.errores.push({
        empleado: `${emp.nombre || ''} ${emp.apellido || ''}`.trim(),
        error: err.message,
      });
    }
  }

  res.json({
    mensaje: `${resultados.creados} empleados importados correctamente`,
    ...resultados,
  });
});

// ── PUT /api/empleados/:id ────────────────────────────────────────────────────
router.put('/:id', requiereRol('ADMIN'), async (req, res) => {
  try {
    const { nombre, apellido, documento, cuil, telefono, fechaNacimiento, fechaIngreso, area } = req.body;
    await prisma.empleado.updateMany({
      where: { id: req.params.id, empresaId: req.user.empresaId },
      data: {
        nombre, apellido, area,
        documento:       documento || null,
        cuil:            cuil || null,
        telefono:        telefono || null,
        fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
        fechaIngreso:    fechaIngreso ? new Date(fechaIngreso) : undefined,
      },
    });
    res.json({ mensaje: 'Empleado actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// ── DELETE /api/empleados/:id (baja lógica) ───────────────────────────────────
router.delete('/:id', requiereRol('ADMIN'), async (req, res) => {
  try {
    await prisma.$transaction([
      prisma.empleado.updateMany({
        where: { id: req.params.id, empresaId: req.user.empresaId },
        data: { activo: false },
      }),
      prisma.usuario.updateMany({
        where: { empleadoId: req.params.id },
        data: { activo: false },
      }),
    ]);
    res.json({ mensaje: 'Empleado dado de baja' });
  } catch (err) {
    res.status(500).json({ error: 'Error al dar de baja' });
  }
});

module.exports = router;