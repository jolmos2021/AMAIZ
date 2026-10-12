import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolUsuario } from '../../usuarios/entities/usuario.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Leer los roles declarados con @Roles() en el endpoint (o su controller)
    const requeridos = this.reflector.getAllAndOverride<RolUsuario[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 2. Sin @Roles() declarado → endpoint sin restricción de rol (solo requiere token)
    if (!requeridos || requeridos.length === 0) {
      return true;
    }

    // 3. El JwtAuthGuard ya cargó req.user (con el rol del token)
    const { user } = context.switchToHttp().getRequest();

    if (!requeridos.includes(user.rol as RolUsuario)) {
      throw new ForbiddenException(
        'No tiene permisos para realizar esta acción',
      );
    }
    return true;
  }
}
