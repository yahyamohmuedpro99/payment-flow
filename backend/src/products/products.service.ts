import { Injectable, Logger, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UnauthorizedProductAccessException } from '../common/exceptions/business.exceptions';

/**
 * Products Service
 * Handles product CRUD with Redis caching
 * - Cache product listings (TTL: 60s)
 * - Invalidate cache on mutations
 * - Only merchants can create/update/delete their own products
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly PRODUCT_LIST_CACHE_KEY = 'products:list';
  private readonly PRODUCT_CACHE_PREFIX = 'product:';
  private readonly CACHE_TTL = 60; // 60 seconds

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Create new product (merchant only)
   */
  async create(merchantId: string, createProductDto: CreateProductDto) {
    this.logger.log(`Creating product: ${createProductDto.name} by merchant ${merchantId}`);

    const product = await this.prisma.product.create({
      data: {
        ...createProductDto,
        merchantId,
        initialUnits: createProductDto.availableUnits,
      },
      include: {
        merchant: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Invalidate cache
    await this.invalidateCache();

    this.logger.log(`Product created: ${product.id}`);
    return product;
  }

  /**
   * Get all active products (public, with caching)
   */
  async findAll() {
    // Try cache first
    const cached = await this.cacheManager.get(this.PRODUCT_LIST_CACHE_KEY);
    if (cached) {
      this.logger.debug('Returning cached product list');
      return cached;
    }

    // Fetch from database
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        availableUnits: { gt: 0 },
      },
      include: {
        merchant: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Cache result
    await this.cacheManager.set(this.PRODUCT_LIST_CACHE_KEY, products, this.CACHE_TTL * 1000);

    this.logger.log(`Fetched ${products.length} products from database`);
    return products;
  }

  /**
   * Get single product by ID (with caching)
   */
  async findOne(id: string) {
    const cacheKey = `${this.PRODUCT_CACHE_PREFIX}${id}`;

    // Try cache first
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached product: ${id}`);
      return cached;
    }

    // Fetch from database
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        merchant: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    // Cache result
    await this.cacheManager.set(cacheKey, product, this.CACHE_TTL * 1000);

    return product;
  }

  /**
   * Update product (owner only)
   */
  async update(id: string, merchantId: string, updateProductDto: UpdateProductDto) {
    // Check ownership
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (product.merchantId !== merchantId) {
      throw new UnauthorizedProductAccessException();
    }

    // Update product
    const updated = await this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      include: {
        merchant: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Invalidate cache
    await this.invalidateCache();
    await this.cacheManager.del(`${this.PRODUCT_CACHE_PREFIX}${id}`);

    this.logger.log(`Product updated: ${id}`);
    return updated;
  }

  /**
   * Delete product (owner only)
   */
  async remove(id: string, merchantId: string) {
    // Check ownership
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (product.merchantId !== merchantId) {
      throw new UnauthorizedProductAccessException();
    }

    // Soft delete
    await this.prisma.product.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    // Invalidate cache
    await this.invalidateCache();
    await this.cacheManager.del(`${this.PRODUCT_CACHE_PREFIX}${id}`);

    this.logger.log(`Product deleted: ${id}`);
    return { message: 'Product deleted successfully' };
  }

  /**
   * Get merchant's products
   */
  async findByMerchant(merchantId: string) {
    return this.prisma.product.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Invalidate product list cache
   */
  private async invalidateCache() {
    await this.cacheManager.del(this.PRODUCT_LIST_CACHE_KEY);
    this.logger.debug('Product list cache invalidated');
  }
}
