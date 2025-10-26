import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Wallets Controller
 * Protected endpoints for wallet operations
 */
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  async getWallet(@CurrentUser() user: any) {
    return this.walletsService.getWallet(user.id);
  }

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async deposit(@CurrentUser() user: any, @Body() depositDto: DepositDto) {
    return this.walletsService.deposit(user.id, depositDto);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  async withdraw(@CurrentUser() user: any, @Body() withdrawDto: WithdrawDto) {
    return this.walletsService.withdraw(user.id, withdrawDto);
  }

  @Get('transactions')
  async getTransactions(
    @CurrentUser() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.walletsService.getTransactions(
      user.id,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }
}
