const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Verifica que el request tenga un JWT válido y que el usuario siga activo en la DB.
 * Si es válido, adjunta el payload al objeto req.user.
 */
async function autenticar(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar que el usuario sigue existiendo y activo en la DB
    const usuarioDb = await prisma.usuario.findUnique({
      where: { id: payload.id },
      select: { activo: true },
    });
    if (!usuarioDb || !usuarioDb.activo) {
      return res.status(401).json({ error: 'Sesión inválida' });
    }

    req.user = payload; // { id, email, rol, empresaId, empleadoId }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Fábrica de middleware: verifica que el usuario tenga uno de los roles permitidos.
 * Uso: soloAdmin  = requiereRol('ADMIN')
 *      ambosRoles = requiereRol('ADMIN', 'EMPLEADO')
 */
function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tenés permiso para esta acción' });
    }
    next();
  };
}

/**
 * Un empleado solo puede ver sus propios datos.
 * Un admin puede ver los de cualquier empleado de su empresa.
 * Uso: en rutas como GET /empleados/:id
 */
function soloPropio(req, res, next) {
  const { rol, empleadoId } = req.user;
  if (rol === 'ADMIN') return next();
  if (empleadoId === req.params.id) return next();
  return res.status(403).json({ error: 'Solo podés ver tus propios datos' });
}

module.exports = { autenticar, requiereRol, soloPropio };
