const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { autenticar, requiereRol } = require('../middleware/auth.middleware');
const { calcularDiasHabilesEntreFechas, calcularSaldoEmpleado } = require('../services/calculo.service');
const {
  emailLicenciaAprobada,
  emailLicenciaRechazada,
  emailNuevaSolicitud,
  emailLicenciaFirmada,
} = require('../services/email.service');

const prisma = new PrismaClient();
const router = express.Router();
router.use(autenticar);

// Helper: obtener email del empleado via su usuario vinculado
async function getEmailEmpleado(empleadoId) {
  const usuario = await prisma.usuario.findFirst({
    where: { empleadoId },
    select: { email: true },
  });
  return usuario?.email || null;
}

// Helper: obtener email del admin de la empresa
async function getEmailAdmin(empresaId) {
  const admin = await prisma.usuario.findFirst({
    where: { empresaId, rol: 'ADMIN' },
    select: { email: true },
  });
  return admin?.email || null;
}

// ── GET /api/licencias ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { estado, tipo, anio } = req.query;
    const esAdmin = req.user.rol === 'ADMIN';

    const where = {
      empleado: { empresaId: req.user.empresaId },
      ...(estado && { estado }),
      ...(tipo   && { tipo }),
      ...(anio   && {
        fechaInicio: {
          gte: new Date(parseInt(anio), 0, 1),
          lte: new Date(parseInt(anio), 11, 31),
        },
      }),
    };
    if (!esAdmin) where.empleadoId = req.user.empleadoId;

    const licencias = await prisma.licencia.findMany({
      where,
      include: {
        empleado: { select: { nombre: true, apellido: true, area: true } },
        aprobacion: true,
        firma: { select: { fecha: true, usuarioId: true } },
      },
      orderBy: { fechaInicio: 'desc' },
    });

    res.json(licencias);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener licencias' });
  }
});

// ── POST /api/licencias ───────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('empleadoId').notEmpty(),
    body('fechaInicio').isISO8601(),
    body('fechaFin').isISO8601(),
    body('tipo').isIn(['VACACIONES', 'PERMISO', 'LICENCIA_MEDICA', 'AUSENCIA']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { empleadoId, fechaInicio, fechaFin, tipo, observaciones } = req.body;
    const esAdmin = req.user.rol === 'ADMIN';

    if (!esAdmin && req.user.empleadoId !== empleadoId) {
      return res.status(403).json({ error: 'Solo podés solicitar licencias para vos mismo' });
    }

    try {
      const empleado = await prisma.empleado.findFirst({
        where: { id: empleadoId, empresaId: req.user.empresaId },
        include: { empresa: { include: { feriados: true } } },
      });
      if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

      const ini = new Date(fechaInicio);
      const fin = new Date(fechaFin);
      if (fin < ini) return res.status(400).json({ error: 'Fecha fin no puede ser anterior al inicio' });

      const feriados = empleado.empresa.feriados.map(f => f.fecha);
      const diasHabiles = calcularDiasHabilesEntreFechas(ini, fin, feriados);

      if (tipo === 'VACACIONES') {
        const saldo = await calcularSaldoEmpleado(empleadoId, ini.getFullYear());
        if (saldo.saldoTotal < diasHabiles) {
          return res.status(400).json({
            error: `Saldo insuficiente. Disponible: ${saldo.saldoTotal} días, solicitado: ${diasHabiles} días`,
            saldo,
          });
        }
      }

      const licencia = await prisma.licencia.create({
        data: { empleadoId, fechaInicio: ini, fechaFin: fin, diasHabiles, tipo, observaciones, estado: 'PENDIENTE' },
        include: { empleado: { select: { nombre: true, apellido: true, area: true } } },
      });

      // Notificar al admin que hay una nueva solicitud (sin await — no bloquea la respuesta)
      const adminEmail = await getEmailAdmin(req.user.empresaId);
      if (adminEmail) {
        emailNuevaSolicitud({
          adminEmail,
          empleado: licencia.empleado,
          licencia,
        }).catch(console.error);
      }

      res.status(201).json(licencia);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear licencia' });
    }
  }
);

// ── POST /api/licencias/:id/aprobar ──────────────────────────────────────────
router.post('/:id/aprobar', requiereRol('ADMIN'), async (req, res) => {
  const { motivo } = req.body;
  try {
    const licencia = await prisma.licencia.findFirst({
      where: { id: req.params.id, empleado: { empresaId: req.user.empresaId } },
      include: { empleado: true },
    });
    if (!licencia) return res.status(404).json({ error: 'Licencia no encontrada' });
    if (licencia.estado !== 'PENDIENTE') {
      return res.status(400).json({ error: `La licencia ya está ${licencia.estado}` });
    }

    await prisma.$transaction([
      prisma.licencia.update({ where: { id: req.params.id }, data: { estado: 'APROBADA' } }),
      prisma.aprobacion.create({ data: { licenciaId: req.params.id, estado: 'APROBADA', motivo } }),
    ]);

    // Enviar email al empleado
    const emailEmp = await getEmailEmpleado(licencia.empleadoId);
    if (emailEmp) {
      emailLicenciaAprobada({
        empleado: { ...licencia.empleado, email: emailEmp },
        licencia,
      }).catch(console.error);
    }

    res.json({ mensaje: 'Licencia aprobada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al aprobar' });
  }
});

// ── POST /api/licencias/:id/rechazar ─────────────────────────────────────────
router.post('/:id/rechazar', requiereRol('ADMIN'), async (req, res) => {
  const { motivo } = req.body;
  try {
    const licencia = await prisma.licencia.findFirst({
      where: { id: req.params.id, empleado: { empresaId: req.user.empresaId } },
      include: { empleado: true },
    });
    if (!licencia) return res.status(404).json({ error: 'No encontrada' });

    await prisma.$transaction([
      prisma.licencia.update({ where: { id: req.params.id }, data: { estado: 'RECHAZADA' } }),
      prisma.aprobacion.create({ data: { licenciaId: req.params.id, estado: 'RECHAZADA', motivo } }),
    ]);

    // Enviar email al empleado
    const emailEmp = await getEmailEmpleado(licencia.empleadoId);
    if (emailEmp) {
      emailLicenciaRechazada({
        empleado: { ...licencia.empleado, email: emailEmp },
        licencia,
        motivo,
      }).catch(console.error);
    }

    res.json({ mensaje: 'Licencia rechazada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al rechazar' });
  }
});

// ── POST /api/licencias/:id/firmar ────────────────────────────────────────────
router.post('/:id/firmar', async (req, res) => {
  const { imagenBase64 } = req.body;
  if (!imagenBase64) return res.status(400).json({ error: 'Firma requerida' });

  try {
    const licencia = await prisma.licencia.findFirst({
      where: { id: req.params.id, empleado: { empresaId: req.user.empresaId } },
      include: { empleado: true },
    });
    if (!licencia) return res.status(404).json({ error: 'No encontrada' });
    if (licencia.estado !== 'APROBADA') {
      return res.status(400).json({ error: 'Solo se pueden firmar licencias aprobadas' });
    }

    await prisma.$transaction([
      prisma.firma.create({ data: { licenciaId: req.params.id, imagenBase64, usuarioId: req.user.id } }),
      prisma.licencia.update({ where: { id: req.params.id }, data: { estado: 'CUMPLIDA' } }),
    ]);

    // Notificar al empleado que quedó todo registrado
    const emailEmp = await getEmailEmpleado(licencia.empleadoId);
    if (emailEmp) {
      emailLicenciaFirmada({
        empleado: { ...licencia.empleado, email: emailEmp },
        licencia,
      }).catch(console.error);
    }

    res.json({ mensaje: 'Licencia firmada y marcada como cumplida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al firmar' });
  }
});

module.exports = router;

// ── DELETE /api/licencias/:id ─────────────────────────────────────────────────
router.delete('/:id', requiereRol('ADMIN'), async (req, res) => {
  try {
    const licencia = await prisma.licencia.findFirst({
      where: { id: req.params.id, empleado: { empresaId: req.user.empresaId } },
    });
    if (!licencia) return res.status(404).json({ error: 'Licencia no encontrada' });

    await prisma.$transaction([
      prisma.firma.deleteMany({ where: { licenciaId: req.params.id } }),
      prisma.aprobacion.deleteMany({ where: { licenciaId: req.params.id } }),
      prisma.licencia.delete({ where: { id: req.params.id } }),
    ]);

    res.json({ mensaje: 'Licencia eliminada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar licencia' });
  }
});