import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type OtpAuthenticator = {
  generateSecret: () => string;
  keyuri: (account: string, service: string, secret: string) => string;
  verify: (opts: { token: string; secret: string }) => boolean;
};

@Injectable()
export class AuthService {
  private readonly authenticator: OtpAuthenticator;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const otplib = require('otplib') as { authenticator: OtpAuthenticator };
    this.authenticator = otplib.authenticator;
  }

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email déjà utilisé');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = this.userRepository.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash,
    });
    await this.userRepository.save(user);

    return { message: 'Compte créé avec succès' };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return { accessToken };
  }

  async enableTotp(
    userId: string,
  ): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.userRepository.findOneOrFail({
      where: { id: userId },
    });

    const secret = this.authenticator.generateSecret();
    const otpauthUrl = this.authenticator.keyuri(
      user.email,
      'NaborServices',
      secret,
    );

    user.totpSecret = secret;
    await this.userRepository.save(user);

    return { secret, otpauthUrl };
  }

  async verifyTotp(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOneOrFail({
      where: { id: userId },
    });

    if (!user.totpSecret) {
      throw new UnauthorizedException('TOTP non configuré');
    }

    const valid = this.authenticator.verify({
      token: code,
      secret: user.totpSecret,
    });
    if (!valid) {
      throw new UnauthorizedException('Code TOTP invalide');
    }

    await this.userRepository.save(user);

    return { message: 'MFA activé avec succès' };
  }

  async generateDesktopToken(
    userId: string,
  ): Promise<{ desktopToken: string }> {
    const user = await this.userRepository.findOneOrFail({
      where: { id: userId },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'desktop',
    };
    const desktopToken = this.jwtService.sign(payload, {
      expiresIn: 60 * 60 * 24 * 30,
    });

    return { desktopToken };
  }
}
