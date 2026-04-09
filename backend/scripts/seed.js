/**
 * Seed: carga los datos reales del Excel en la base de datos.
 * Ejecutar con: node scripts/seed.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const empleadosExcel = [
  { nombre: 'Analia',     apellido: 'Lopez',       area: 'ADMINISTRACION', fechaIngreso: '2015-10-06', email: 'analia@empresa.com' },
  { nombre: 'Jorge',      apellido: 'Sigal',        area: 'DEPOSITO',       fechaIngreso: '2011-05-03', email: 'jorge@empresa.com' },
  { nombre: 'Leonardo',   apellido: 'Brusco',       area: 'TALLER',         fechaIngreso: '2015-05-04', email: 'leonardo@empresa.com' },
  { nombre: 'Juan',       apellido: 'Duran',        area: 'DEPOSITO',       fechaIngreso: '2016-12-01', email: 'juan@empresa.com' },
  { nombre: 'Monica',     apellido: 'Ruffino',      area: 'CAJAS',          fechaIngreso: '2017-02-01', email: 'monica@empresa.com' },
  { nombre: 'Guillermo',  apellido: 'Echeverria',   area: 'VENTAS',         fechaIngreso: '2017-08-03', email: 'guillermo@empresa.com' },
  { nombre: 'Carlos',     apellido: 'De Witt',      area: 'VENTAS',         fechaIngreso: '2018-05-02', email: 'carlos@empresa.com' },
  { nombre: 'Deximar',    apellido: 'Boza',         area: 'VENTAS',         fechaIngreso: '2020-09-01', email: 'deximar@empresa.com' },
  { nombre: 'Ezequiel',   apellido: 'Silva',        area: 'DEPOSITO',       fechaIngreso: '2021-08-02', email: 'ezequiel@empresa.com' },
  { nombre: 'Sebastian',  apellido: 'Carimando',    area: 'COMPRAS',        fechaIngreso: '2022-09-01', email: 'sebastian@empresa.com' },
  { nombre: 'Sofia',      apellido: 'Moreno',       area: 'MERCADO LIBRE',  fechaIngreso: '2025-09-01', email: 'sofia@empresa.com' },
  { nombre: 'Samuel',     apellido: 'Silguero',     area: 'DEPOSITO',       fechaIngreso: '2025-09-01', email: 'samuel@empresa.com' },
  { nombre: 'Claudio',    apellido: 'Rodriguez',    area: 'DEPOSITO',       fechaIngreso: '2025-10-01', email: 'claudio@empresa.com' },
  { nombre: 'Nazareth',   apellido: 'Ledezma',      area: 'VENTAS',         fechaIngreso: '2025-10-13', email: 'nazareth@empresa.com' },
];

// Feriados nacionales Argentina 2026
const feriadosArgentina2026 = [
  { fecha: '2026-01-01', nombre: 'Año Nuevo',                          tipo: 'NACIONAL' },
  { fecha: '2026-02-16', nombre: 'Carnaval',                           tipo: 'NACIONAL' },
  { fecha: '2026-02-17', nombre: 'Carnaval',                           tipo: 'NACIONAL' },
  { fecha: '2026-03-24', nombre: 'Día Nacional de la Memoria',         tipo: 'NACIONAL' },
  { fecha: '2026-04-02', nombre: 'Día del Veterano de Malvinas',       tipo: 'NACIONAL' },
  { fecha: '2026-04-03', nombre: 'Viernes Santo',                      tipo: 'NACIONAL' },
  { fecha: '2026-05-01', nombre: 'Día del Trabajador',                 tipo: 'NACIONAL' },
  { fecha: '2026-05-25', nombre: 'Día de la Revolución de Mayo',       tipo: 'NACIONAL' },
  { fecha: '2026-06-15', nombre: 'Paso a la Inmortalidad del Gral. Güemes', tipo: 'NACIONAL' },
  { fecha: '2026-06-20', nombre: 'Paso a la Inmortalidad del Gral. Belgrano', tipo: 'NACIONAL' },
  { fecha: '2026-07-09', nombre: 'Día de la Independencia',            tipo: 'NACIONAL' },
  { fecha: '2026-08-17', nombre: 'Paso a la Inmortalidad del Gral. San Martín', tipo: 'NACIONAL' },
  { fecha: '2026-10-12', nombre: 'Día del Respeto a la Diversidad Cultural', tipo: 'NACIONAL' },
  { fecha: '2026-11-20', nombre: 'Día de la Soberanía Nacional',       tipo: 'NACIONAL' },
  { fecha: '2026-12-08', nombre: 'Inmaculada Concepción de María',     tipo: 'NACIONAL' },
  { fecha: '2026-12-25', nombre: 'Navidad',                            tipo: 'NACIONAL' },
];

async function main() {
  console.log('🌱 Iniciando seed...');

  // 1. Crear empresa
  const empresa = await prisma.empresa.upsert({
    where: { id: 'expo-color-seed' },
    update: {},
    create: {
      id: 'expo-color-seed',
      nombre: 'Expo Color',
    },
  });
  console.log(`✅ Empresa: ${empresa.nombre}`);

  // 2. Crear admin
  const hashAdmin = await bcrypt.hash('admin1234', 10);
  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@expocolor.com' },
    update: {},
    create: {
      email: 'admin@expocolor.com',
      password: hashAdmin,
      rol: 'ADMIN',
      empresaId: empresa.id,
    },
  });
  console.log(`✅ Admin: ${admin.email} / contraseña: admin1234`);

  // 3. Crear empleados + usuario por cada uno
  const hashEmp = await bcrypt.hash('empleado1234', 10);

  for (const emp of empleadosExcel) {
    const empleado = await prisma.empleado.upsert({
      where: { id: `seed-${emp.apellido.toLowerCase().replace(/\s/g, '-')}` },
      update: {},
      create: {
        id: `seed-${emp.apellido.toLowerCase().replace(/\s/g, '-')}`,
        nombre: emp.nombre,
        apellido: emp.apellido,
        fechaIngreso: new Date(emp.fechaIngreso),
        area: emp.area,
        empresaId: empresa.id,
      },
    });

    await prisma.usuario.upsert({
      where: { email: emp.email },
      update: {},
      create: {
        email: emp.email,
        password: hashEmp,
        rol: 'EMPLEADO',
        empresaId: empresa.id,
        empleadoId: empleado.id,
      },
    });

    console.log(`   👤 ${emp.nombre} ${emp.apellido} — ${emp.email}`);
  }

  // 4. Cargar feriados 2026
  const feriadosData = feriadosArgentina2026.map(f => ({
    fecha: new Date(f.fecha),
    nombre: f.nombre,
    tipo: f.tipo,
    anio: 2026,
    empresaId: empresa.id,
  }));
  await prisma.feriado.createMany({ data: feriadosData, skipDuplicates: true });
  console.log(`✅ ${feriadosData.length} feriados 2026 cargados`);

  console.log('\n🎉 Seed completado!');
  console.log('   Login admin: admin@expocolor.com / admin1234');
  console.log('   Login empleado ejemplo: analia@empresa.com / empleado1234');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());