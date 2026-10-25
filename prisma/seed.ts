import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Seed Modules
  const authModule = await prisma.module.upsert({
    where: { prefix: 'AUTH' },
    update: {},
    create: {
      name: 'Authentication & Authorization',
      prefix: 'AUTH',
      description: 'User login, registration, and session management',
      status: 'active',
    },
  });

  const trxModule = await prisma.module.upsert({
    where: { prefix: 'TRX' },
    update: {},
    create: {
      name: 'Transaction & Payments',
      prefix: 'TRX',
      description: 'Checkout, payments, and order tracking',
      status: 'active',
    },
  });

  console.log(`✅ Modules seeded: ${authModule.prefix}, ${trxModule.prefix}`);

  // 2. Seed Features
  const authFeatures = [
    { name: 'Login & Registrasi', description: 'Fitur otentikasi pengguna dan pendaftaran akun baru' },
    { name: 'Reset Password', description: 'Fitur lupa password dan verifikasi email/OTP' },
  ];

  for (const f of authFeatures) {
    const existing = await prisma.feature.findFirst({
      where: { moduleId: authModule.id, name: f.name },
    });
    if (!existing) {
      await prisma.feature.create({
        data: {
          moduleId: authModule.id,
          name: f.name,
          description: f.description,
          status: 'active',
        },
      });
    }
  }

  const trxFeatures = [
    { name: 'Payment Gateway', description: 'Integrasi virtual account, e-wallet, dan QRIS' },
  ];

  for (const f of trxFeatures) {
    const existing = await prisma.feature.findFirst({
      where: { moduleId: trxModule.id, name: f.name },
    });
    if (!existing) {
      await prisma.feature.create({
        data: {
          moduleId: trxModule.id,
          name: f.name,
          description: f.description,
          status: 'active',
        },
      });
    }
  }

  console.log('✅ Features seeded for AUTH and TRX');

  // 3. Seed Sequences
  await prisma.tcSequence.upsert({
    where: { modulePrefix: 'AUTH' },
    update: {},
    create: { modulePrefix: 'AUTH', nextSeq: 1 },
  });

  await prisma.tcSequence.upsert({
    where: { modulePrefix: 'TRX' },
    update: {},
    create: { modulePrefix: 'TRX', nextSeq: 1 },
  });

  // 4. Log Activity
  await prisma.activityLog.create({
    data: {
      action: 'seed',
      entityType: 'database',
      description: 'Database initialized with baseline modules and features',
    },
  });

  console.log('🎉 Database seeding completed successfully!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
