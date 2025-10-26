import { IsString, IsNumber, IsPositive, IsInt, Min, IsOptional, IsBoolean } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  availableUnits?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
