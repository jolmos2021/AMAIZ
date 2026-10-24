import {
  IsArray, ArrayMinSize, ArrayMaxSize, IsEnum, IsInt,
  IsOptional, IsString, MaxLength, Min, Max, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ModalidadDivision {
  IGUALES = 'IGUALES',
  PRODUCTOS = 'PRODUCTOS',
}

export class AsignacionProductoDto {
  @IsInt()
  @Min(1)
  detalleOrdenId: number;

  @IsInt()
  @Min(1)
  cantidad: number;
}

export class PersonaDivisionDto {
  @IsString()
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  clienteId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AsignacionProductoDto)
  items?: AsignacionProductoDto[];
}

export class DividirCuentaDto {
  @IsEnum(ModalidadDivision)
  modalidad: ModalidadDivision;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PersonaDivisionDto)
  personas: PersonaDivisionDto[];
}
