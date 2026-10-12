import { SetMetadata } from '@nestjs/common';
import { RolUsuario } from '../../usuarios/entities/usuario.entity';

export const ROLES_KEY = 'roles';

// Declara los roles permitidos para un endpoint o controller completo
// Ejemplo: @Roles(RolUsuario.ADMINISTRADOR)
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);
