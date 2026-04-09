const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * ─────────────────────────────────────────────────────────────
 *  MOTOR DE CÁLCULO DE DÍAS DE VACACIONES
 *  Replica exactamente la lógica del Excel de Hollman
 *  + resuelve el problema multi-año con saldo histórico
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Calcula los días de vacaciones que le corresponden a un empleado
 * para un año determinado, según la Ley de Contrato de Trabajo argentina.
 *
 * Reglas (LCT Art. 150):
 * - Menos de 5 años    → 14 días (si tiene al menos 6 meses; sino proporcional)
 * - 5 a 10 años        → 21 días
 * - 10 a 20 años       → 28 días
 * - Más de 20 años     → 35 días
 *
 * @param {Date}   fechaIngreso
 * @param {number} anioCalculo  - el año para el cual calcular (ej: 2026)
 * @returns {number} días de vacaciones
 */
function calcularDiasVacaciones(fechaIngreso, anioCalculo) {
  // La antigüedad se mide al 31 de diciembre del año de cálculo
  const fechaCorte = new Date(anioCalculo, 11, 31);
  const msAnio = 365.25 * 24 * 60 * 60 * 1000;
  const antiguedadAnios = (fechaCorte - fechaIngreso) / msAnio;

  // Empleados con más de 5 años: escala fija
  if (antiguedadAnios > 20) return 35;
  if (antiguedadAnios > 10) return 28;
  if (antiguedadAnios > 5)  return 21;

  // Menos de 5 años: verificar si cumplió al menos 6 meses de días hábiles
  const diasHabilesAcumulados = calcularDiasHabilesEntreFechas(
    fechaIngreso,
    fechaCorte,
    []  // sin feriados para este cálculo base (como hace la calculadora de Ignacio)
  );

  const mesesHabiles = diasHabilesAcumulados / 30;

  if (mesesHabiles > 6) {
    return 14; // período completo
  } else {
    // Proporcional: días hábiles / 20, redondeado
    return Math.round(diasHabilesAcumulados / 20);
  }
}

/**
 * Cuenta los días hábiles entre dos fechas, excluyendo domingos y feriados.
 * Los sábados SÍ se cuentan (como hace NETWORKDAYS.INTL con "0000001").
 *
 * @param {Date}   inicio
 * @param {Date}   fin
 * @param {Date[]} feriados  - array de fechas de feriados a excluir
 * @returns {number}
 */
function calcularDiasHabilesEntreFechas(inicio, fin, feriados = []) {
  // Normalizar feriados a string YYYY-MM-DD para comparación rápida
  const feriadosSet = new Set(
    feriados.map(f => toDateStr(new Date(f)))
  );

  let dias = 0;
  const cur = new Date(inicio);
  cur.setHours(0, 0, 0, 0);

  const finNorm = new Date(fin);
  finNorm.setHours(23, 59, 59, 999);

  while (cur <= finNorm) {
    const esDomingo  = cur.getDay() === 0;
    const esFeriado  = feriadosSet.has(toDateStr(cur));

    if (!esDomingo && !esFeriado) {
      dias++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return dias;
}

function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Obtiene el saldo real de días disponibles para un empleado.
 * Suma años anteriores no gozados + días del año actual - días ya tomados.
 *
 * @param {string} empleadoId
 * @param {number} anio  - año actual (por defecto el año en curso)
 * @returns {object} { diasAsignados, diasTomados, saldoAnterior, saldoTotal }
 */
async function calcularSaldoEmpleado(empleadoId, anio = new Date().getFullYear()) {
  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    include: {
      saldos: { orderBy: { anio: 'asc' } },
      licencias: {
        where: {
          estado: { in: ['APROBADA', 'CUMPLIDA'] },
          fechaInicio: {
            gte: new Date(anio, 0, 1),
            lte: new Date(anio, 11, 31),
          },
        },
      },
      empresa: {
        include: {
          feriados: { where: { anio } },
        },
      },
    },
  });

  if (!empleado) throw new Error('Empleado no encontrado');

  // 1. Días asignados para el año actual
  const diasAsignados = calcularDiasVacaciones(empleado.fechaIngreso, anio);

  // 2. Días ya tomados este año
  const diasTomados = empleado.licencias
    .filter(l => l.tipo === 'VACACIONES')
    .reduce((acc, l) => acc + l.diasHabiles, 0);

  // 3. Saldo arrastrado de años anteriores (días pendientes no gozados)
  const saldoAnterior = empleado.saldos
    .filter(s => s.anio < anio && !s.cerrado)
    .reduce((acc, s) => acc + s.diasPendientes, 0);

  const saldoTotal = diasAsignados + saldoAnterior - diasTomados;

  return {
    diasAsignados,
    diasTomados,
    saldoAnterior,
    saldoTotal,
    detallePorAnio: empleado.saldos,
  };
}

/**
 * Cierre de año: congela el saldo del año que termina y
 * lo deja disponible para el siguiente.
 * Llamar el 31/12 o manualmente desde el panel admin.
 *
 * @param {string} empleadoId
 * @param {number} anio  - el año a cerrar
 */
async function cerrarAnioEmpleado(empleadoId, anio) {
  const { diasAsignados, diasTomados, saldoTotal } = await calcularSaldoEmpleado(empleadoId, anio);

  await prisma.saldoAnual.upsert({
    where: { empleadoId_anio: { empleadoId, anio } },
    update: {
      diasAsignados,
      diasTomados,
      diasPendientes: Math.max(0, saldoTotal),
      cerrado: true,
    },
    create: {
      empleadoId,
      anio,
      diasAsignados,
      diasTomados,
      diasPendientes: Math.max(0, saldoTotal),
      cerrado: true,
    },
  });
}

module.exports = {
  calcularDiasVacaciones,
  calcularDiasHabilesEntreFechas,
  calcularSaldoEmpleado,
  cerrarAnioEmpleado,
};
