require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Eliminar el usuario de prueba duplicado
  const deleted = await prisma.usuario.deleteMany({
    where: { email: 'bruscofacundo1@gmail.com' }
  });
  console.log(`Usuario duplicado eliminado: ${deleted.count}`);

  // 2. Asignar tu email al admin real
  const updated = await prisma.usuario.updateMany({
    where: { rol: 'ADMIN' },
    data:  { email: 'bruscofacundo1@gmail.com' }
  });
  console.log(`Admin actualizado: ${updated.count} registro`);
  console.log('Listo! Entrá con bruscofacundo1@gmail.com / admin1234');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
