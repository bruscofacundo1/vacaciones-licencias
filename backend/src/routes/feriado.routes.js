const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { autenticar, requiereRol } = require('../middleware/auth.middleware');
const { cerrarAnioEmpleado, calcularSaldoEmpleado } = require('../services/calculo.service');

const prisma = new PrismaClient();

// ── FERIADOS ─────────────────────────────────────────────────────────────────
const feriadoRouter = express.Router();
feriadoRouter.use(autenticar);

// GET /api/feriados?anio=2026
feriadoRouter.get('/', async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const feriados = await prisma.feriado.findMany({
    where: { empresaId: req.user.empresaId, anio },
    orderBy: { fecha: 'asc' },
  });
  res.json(feriados);
});

// POST /api/feriados — carga manual
feriadoRouter.post('/', requiereRol('ADMIN'), async (req, res) => {
  const { fecha, nombre, tipo, anio } = req.body;
  try {
    const feriado = await prisma.feriado.create({
      data: {
        fecha: new Date(fecha + 'T12:00:00'),
        nombre,
        tipo: tipo || 'NACIONAL',
        anio: parseInt(anio),
        empresaId: req.user.empresaId,
      },
    });
    res.status(201).json(feriado);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Feriado ya cargado' });
    res.status(500).json({ error: 'Error al crear feriado' });
  }
});

// POST /api/feriados/sincronizar?anio=2026
// Trae feriados oficiales argentinos desde nager.date
feriadoRouter.post('/sincronizar', requiereRol('ADMIN'), async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  try {
    const url = `https://date.nager.at/api/v3/PublicHolidays/${anio}/AR`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo conectar con la API de feriados');

    const feriadosAPI = await response.json();

    const data = feriadosAPI.map(f => ({
      fecha: new Date(f.date + 'T12:00:00'),
      nombre: f.localName || f.name,
      tipo: f.global ? 'NACIONAL' : 'PROVINCIAL',
      anio,
      empresaId: req.user.empresaId,
    }));

    const result = await prisma.feriado.createMany({ data, skipDuplicates: true });

    res.json({
      mensaje: 'Sincronizacion completada',
      importados: result.count,
      total: data.length,
      anio,
      feriados: data.map(f => ({
        fecha: f.fecha.toISOString().split('T')[0],
        nombre: f.nombre,
        tipo: f.tipo
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al sincronizar: ' + err.message });
  }
});

// POST /api/feriados/importar — carga masiva desde array
feriadoRouter.post('/importar', requiereRol('ADMIN'), async (req, res) => {
  const { anio, feriados } = req.body;
  if (!Array.isArray(feriados) || !anio) {
    return res.status(400).json({ error: 'Formato invalido' });
  }
  try {
    const data = feriados.map(f => ({
      fecha: new Date(f.fecha + 'T12:00:00'),
      nombre: f.nombre,
      tipo: f.tipo || 'NACIONAL',
      anio: parseInt(anio),
      empresaId: req.user.empresaId,
    }));
    const result = await prisma.feriado.createMany({ data, skipDuplicates: true });
    res.json({ importados: result.count });
  } catch (err) {
    res.status(500).json({ error: 'Error al importar feriados' });
  }
});

// DELETE /api/feriados/:id
feriadoRouter.delete('/:id', requiereRol('ADMIN'), async (req, res) => {
  await prisma.feriado.deleteMany({
    where: { id: req.params.id, empresaId: req.user.empresaId },
  });
  res.json({ mensaje: 'Feriado eliminado' });
});


// ── SALDOS ────────────────────────────────────────────────────────────────────
const saldoRouter = express.Router();
saldoRouter.use(autenticar);

saldoRouter.get('/:empleadoId', async (req, res) => {
  const { empleadoId } = req.params;
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const esAdmin = req.user.rol === 'ADMIN';
  if (!esAdmin && req.user.empleadoId !== empleadoId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    const saldo = await calcularSaldoEmpleado(empleadoId, anio);
    res.json(saldo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

saldoRouter.post('/cerrar-anio', requiereRol('ADMIN'), async (req, res) => {
  const anio = parseInt(req.body.anio) || new Date().getFullYear();
  try {
    const empleados = await prisma.empleado.findMany({
      where: { empresaId: req.user.empresaId, activo: true },
    });
    await Promise.all(empleados.map(e => cerrarAnioEmpleado(e.id, anio)));
    res.json({ mensaje: `Anio ${anio} cerrado para ${empleados.length} empleados` });
  } catch (err) {
    res.status(500).json({ error: 'Error al cerrar anio' });
  }
});


// ── EMPRESA ───────────────────────────────────────────────────────────────────
const empresaRouter = express.Router();
empresaRouter.use(autenticar, requiereRol('ADMIN'));

empresaRouter.get('/mi-empresa', async (req, res) => {
  const empresa = await prisma.empresa.findUnique({ where: { id: req.user.empresaId } });
  res.json(empresa);
});

empresaRouter.put('/mi-empresa', async (req, res) => {
  const { nombre, logo } = req.body;
  const empresa = await prisma.empresa.update({
    where: { id: req.user.empresaId },
    data: { nombre, logo },
  });
  res.json(empresa);
});


module.exports = { feriadoRouter, saldoRouter, empresaRouter };