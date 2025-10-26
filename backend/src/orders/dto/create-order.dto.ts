import { IsString, IsEnum, IsUUID } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateOrderDto {
  @IsUUID()
  productId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
