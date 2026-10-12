import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { RolUsuario } from '../entities/usuario.entity';
import { EstadoUsuario } from '../entities/usuario.entity';

export class ActualizarUsuarioDto {
  // username NO se puede cambiar: es el identificador de login

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(50)
  password?: string;

  @IsEnum(RolUsuario)
  @IsOptional()
  rol?: RolUsuario;

  @IsEnum(EstadoUsuario)
  @IsOptional()
  estado?: EstadoUsuario;
}
