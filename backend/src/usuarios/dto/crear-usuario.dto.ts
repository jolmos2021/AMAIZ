import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { RolUsuario } from '../entities/usuario.entity';

export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty({ message: 'El username es obligatorio' })
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MinLength(2)
  @MaxLength(100)
  nombre: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(50)
  password: string;

  @IsEnum(RolUsuario, {
    message: 'El rol debe ser ADMINISTRADOR, MESERO, COCINERO o CAJERO',
  })
  rol: RolUsuario;
}
