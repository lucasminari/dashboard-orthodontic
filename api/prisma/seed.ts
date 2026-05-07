import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Seed inicial de usuarios. Roda com: npm run seed
 *
 * Senhas vem de SEED_PASSWORD (env), padrao 'trocar123' (alterar no primeiro login).
 * Idempotente: se email ja existe, nao recria.
 */

const prisma = new PrismaClient();

const SENHA = process.env.SEED_PASSWORD || 'trocar123';

const usuarios = [
  { email: 'admin@orthodontic.com.br',           nome: 'Admin',                  role: 'admin',   unidadeId: null },
  { email: 'gerente.centro@orthodontic.com.br',  nome: 'Gerente Centro',         role: 'gerente', unidadeId: 1 },
  { email: 'gerente.varzea@orthodontic.com.br',  nome: 'Gerente Varzea Paulista', role: 'gerente', unidadeId: 2 },
  { email: 'gerente.horto@orthodontic.com.br',   nome: 'Gerente Hortolandia',    role: 'gerente', unidadeId: 3 },
];

async function main() {
  console.log(`Seed: criando ${usuarios.length} usuarios (senha: "${SENHA}")`);
  const senhaHash = await bcrypt.hash(SENHA, 10);

  for (const u of usuarios) {
    const existe = await prisma.trackingUser.findUnique({ where: { email: u.email } });
    if (existe) {
      console.log(`  ja existe: ${u.email}`);
      continue;
    }
    await prisma.trackingUser.create({
      data: {
        email: u.email,
        nome: u.nome,
        role: u.role,
        unidadeId: u.unidadeId,
        senhaHash,
      },
    });
    console.log(`  criado: ${u.email}`);
  }

  console.log('\nSeed concluido. ALTERAR SENHAS no primeiro login.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
