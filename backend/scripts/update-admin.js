/**
 * Actualiza el email del admin existente.
 * Ejecutar con: node scripts/update-admin.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const EMAIL_NUEVO = 'bruscofacundo1@gmail.com';
  const EMAIL_VIEJO = 'admin@expocolor.com';
  const PASS        = 'admin1234';

  let admin = await prisma.usuario.findUnique({ where: { email: EMAIL_VIEJO } });

  if (admin) {
    const hash = await bcrypt.hash(PASS, 10);
    await prisma.usuario.update({
      where: { email: EMAIL_VIEJO },
      data:  { email: EMAIL_NUEVO, password: hash },
    });
    console.log('Actualizado: ' + EMAIL_NUEVO + ' / ' + PASS);
    return;
  }

  admin = await prisma.usuario.findUnique({ where: { email: EMAIL_NUEVO } });
  if (admin) {
    console.log('Ya existe admin con: ' + EMAIL_NUEVO);
    return;
  }

  const empresa = await prisma.empresa.findFirst();
  const hash = await bcrypt.hash(PASS, 10);
  await prisma.usuario.create({
    data: { email: EMAIL_NUEVO, password: hash, rol: 'ADMIN', empresaId: empresa.id },
  });
  console.log('Creado: ' + EMAIL_NUEVO + ' / ' + PASS);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());