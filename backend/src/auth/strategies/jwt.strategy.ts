import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: number;
  username: string;
  rol: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // "!" afirma que existe: JWT_SECRET está definido en backend/.env
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    return { userId: payload.sub, username: payload.username, rol: payload.rol };
  }
}
