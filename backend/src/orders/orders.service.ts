import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { StripeService } from '../common/services/stripe.service';
import { PaymentMethod, OrderStatus, Prisma } from '@prisma/client';
import {
  ProductOutOfStockException,
  ProductNotFoundException,
  DuplicateOrderException,
} from '../common/exceptions/business.exceptions';
import { CreateOrderDto } from './dto/create-order.dto';
import { randomUUID } from 'crypto';

/**
 * Orders Service
 * Handles order creation with atomic stock management
 * - Wallet payments: Complete transaction in one atomic operation
 * - Gateway payments: Create pending order, complete on webhook
 * - Uses pessimistic locking (SELECT FOR UPDATE) to prevent race conditions
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletsService: WalletsService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create order with wallet payment
   * Complete atomic transaction:
   * 1. Lock product row
   * 2. Check stock
   * 3. Deduct from user wallet
   * 4. Credit merchant wallet
   * 5. Decrement stock
   * 6. Create order
   */
  async createWalletOrder(userId: string, createOrderDto: CreateOrderDto) {
    this.logger.log(`Creating wallet order: User ${userId}, Product ${createOrderDto.productId}`);

    const idempotencyKey = randomUUID();

    const order = await this.prisma.$transaction(
      async (tx) => {
        // Lock product row (CRITICAL: Prevents race conditions)
        const product = await tx.$queryRaw<any[]>`
          SELECT * FROM products
          WHERE id = ${createOrderDto.productId}
          FOR UPDATE
        `;

        if (!product || product.length === 0) {
          throw new ProductNotFoundException(createOrderDto.productId);
        }

        const lockedProduct = product[0];

        // Check stock availability
        if (lockedProduct.available_units <= 0) {
          throw new ProductOutOfStockException(lockedProduct.name);
        }

        if (!lockedProduct.is_active) {
          throw new BadRequestException('Product is not active');
        }

        const amount = Number(lockedProduct.price);
        const merchantId = lockedProduct.merchant_id;

        // Deduct from user wallet
        await this.walletsService.deductFromWallet(
          tx,
          userId,
          amount,
          'order',
          idempotencyKey,
          `Purchase: ${lockedProduct.name}`,
        );

        // Credit merchant wallet
        await this.walletsService.creditToWallet(
          tx,
          merchantId,
          amount,
          'order',
          idempotencyKey,
          `Sale: ${lockedProduct.name}`,
        );

        // Decrement stock
        await tx.product.update({
          where: { id: createOrderDto.productId },
          data: {
            availableUnits: {
              decrement: 1,
            },
          },
        });

        // Create order
        const newOrder = await tx.order.create({
          data: {
            userId,
            productId: createOrderDto.productId,
            merchantId,
            paymentMethod: PaymentMethod.WALLET,
            status: OrderStatus.COMPLETED,
            amount,
            currency: 'USD',
            idempotencyKey,
            completedAt: new Date(),
          },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        });

        this.logger.log(`Wallet order completed: ${newOrder.id}`);
        return newOrder;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000, // 10 seconds
      },
    );

    return order;
  }

  /**
   * Create order with gateway payment
   * Creates pending order, returns payment session URL
   * Order will be completed by webhook
   */
  async createGatewayOrder(userId: string, createOrderDto: CreateOrderDto) {
    this.logger.log(`Creating gateway order: User ${userId}, Product ${createOrderDto.productId}`);

    const idempotencyKey = randomUUID();

    // Get product details
    const product = await this.prisma.product.findUnique({
      where: { id: createOrderDto.productId },
      include: {
        merchant: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!product) {
      throw new ProductNotFoundException(createOrderDto.productId);
    }

    if (!product.isActive) {
      throw new BadRequestException('Product is not active');
    }

    if (product.availableUnits <= 0) {
      throw new ProductOutOfStockException(product.name);
    }

    // Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const amount = Number(product.price);

    // Create Stripe checkout session
    const session = await this.stripeService.createCheckoutSession(
      product.id,
      product.name,
      amount,
      1, // quantity (currently only support 1 unit per order)
      userId,
      user.email,
    );

    // Create pending order in database
    const order = await this.prisma.order.create({
      data: {
        userId,
        productId: createOrderDto.productId,
        merchantId: product.merchantId,
        paymentMethod: PaymentMethod.GATEWAY,
        status: OrderStatus.PENDING,
        amount,
        currency: 'USD',
        idempotencyKey,
        stripeSessionId: session.id,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(`Gateway order created: ${order.id}, Stripe session: ${session.id}`);

    return {
      order,
      checkoutUrl: session.url,
      sessionId: session.id,
    };
  }

  /**
   * Main entry point for creating orders
   */
  async create(userId: string, createOrderDto: CreateOrderDto) {
    if (createOrderDto.paymentMethod === PaymentMethod.WALLET) {
      return this.createWalletOrder(userId, createOrderDto);
    } else {
      return this.createGatewayOrder(userId, createOrderDto);
    }
  }

  /**
   * Complete gateway order after successful payment
   * Called by webhook handler
   */
  async completeGatewayOrder(sessionId: string, paymentIntentId: string) {
    this.logger.log(`Completing gateway order for session: ${sessionId}`);

    const order = await this.prisma.order.findFirst({
      where: { stripeSessionId: sessionId },
      include: {
        product: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order not found for session ${sessionId}`);
    }

    if (order.status === OrderStatus.COMPLETED) {
      this.logger.warn(`Order ${order.id} already completed`);
      return order;
    }

    // Complete order in transaction
    const completedOrder = await this.prisma.$transaction(
      async (tx) => {
        // Lock product row
        const product = await tx.$queryRaw<any[]>`
          SELECT * FROM products
          WHERE id = ${order.productId}
          FOR UPDATE
        `;

        if (!product || product.length === 0) {
          throw new ProductNotFoundException(order.productId);
        }

        const lockedProduct = product[0];

        // Check stock
        if (lockedProduct.available_units <= 0) {
          throw new ProductOutOfStockException(lockedProduct.name);
        }

        // Credit merchant wallet
        await this.walletsService.creditToWallet(
          tx,
          order.merchantId,
          Number(order.amount),
          'order',
          order.idempotencyKey || randomUUID(),
          `Sale: ${order.product.name} (Stripe)`,
        );

        // Decrement stock
        await tx.product.update({
          where: { id: order.productId },
          data: {
            availableUnits: {
              decrement: 1,
            },
          },
        });

        // Update order status
        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.COMPLETED,
            stripePaymentIntentId: paymentIntentId,
            completedAt: new Date(),
          },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        });

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(`Gateway order completed: ${completedOrder.id}`);
    return completedOrder;
  }

  /**
   * Get user's orders
   */
  async findUserOrders(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get merchant's orders (sales)
   */
  async findMerchantOrders(merchantId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { merchantId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where: { merchantId } }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single order
   */
  async findOne(id: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        OR: [
          { userId },
          { merchantId: userId }, // Merchant can see their sales
        ],
      },
      include: {
        product: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }
}
