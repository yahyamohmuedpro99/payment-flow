import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres123@localhost:5432/payment_flow_test?schema=public',
    },
  },
});

/**
 * Setup test database
 * Run migrations and seed data before tests
 */
export async function setupTestDatabase() {
  try {
    // Clean database
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');

    console.log('✓ Test database cleaned');
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw error;
  }
}

/**
 * Cleanup test database
 * Clear all data between tests
 */
export async function cleanupTestDatabase() {
  const tables = ['orders', 'wallet_transactions', 'wallets', 'products', 'users'];

  try {
    for (const table of tables) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    }
    console.log('✓ Test database cleaned');
  } catch (error) {
    console.error('Error cleaning test database:', error);
  }
}

/**
 * Disconnect from database
 */
export async function disconnectDatabase() {
  await prisma.$disconnect();
}

/**
 * Create test user
 */
export async function createTestUser(data: {
  email: string;
  password: string;
  role?: 'USER' | 'MERCHANT';
}) {
  return prisma.user.create({
    data: {
      email: data.email,
      password: data.password, // Should be hashed in real scenario
      role: data.role || 'USER',
      wallet: {
        create: {
          balance: 0,
          currency: 'USD',
        },
      },
    },
    include: {
      wallet: true,
    },
  });
}

/**
 * Create test product
 */
export async function createTestProduct(merchantId: string, data?: Partial<any>) {
  return prisma.product.create({
    data: {
      name: data?.name || 'Test Product',
      description: data?.description || 'Test Description',
      price: data?.price || 99.99,
      currency: 'USD',
      availableUnits: data?.availableUnits || 10,
      initialUnits: data?.initialUnits || 10,
      merchantId,
    },
  });
}

export { prisma };
