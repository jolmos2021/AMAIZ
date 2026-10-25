import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum TipoCliente {
  NORMAL = 'NORMAL',
  VIP = 'VIP',
}

export class CrearClienteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @IsEnum(TipoCliente)
  tipo?: TipoCliente;
}
