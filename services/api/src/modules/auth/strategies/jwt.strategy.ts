import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { JwtPayload, RequestUser } from '../interfaces/auth.interfaces';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => req?.query?.token ?? null,
      ]),
      secretOrKey: config.get<string>('JWT_SECRET')!,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    if (user.deletedAt !== null) {
      throw new UnauthorizedException('Compte supprimé');
    }

    if (user.isSuspended) {
      throw new UnauthorizedException('Compte suspendu');
    }

    if (user.passwordChangedAt) {
      const iatDate = new Date(payload.iat * 1000);
      if (user.passwordChangedAt.getTime() > iatDate.getTime()) {
        throw new UnauthorizedException(
          'Mot de passe changé, veuillez vous reconnecter',
        );
      }
    }

    return {
      sub: user.id,
      role: user.role,
      locale: user.locale,
    };
  }
}
