import { Controller, Get, Put, Body, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-users.dto';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Request() req: { user: JwtPayload }) {
    return this.usersService.getProfile(req.user.sub);
  }

  @Put('me')
  async updateMe(
    @Request() req: { user: JwtPayload },
    @Body() dto: UpdateUserDto,
  ) {
    await this.usersService.updateProfile(req.user.sub, dto);
    return this.usersService.getProfile(req.user.sub);
  }
}
