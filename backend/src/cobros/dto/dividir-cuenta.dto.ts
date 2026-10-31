import {
  IsArray, ArrayMinSize, ArrayMaxSize, IsEnum, IsInt,
  IsOptional, IsString, MaxLength, Min, Max, IsNumber, ValidateIf, ValidateNested,
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

  // Unidades completas (compatibilidad con la modalidad PRODUCTOS existente).
  @ValidateIf((o) => o.cantidad !== undefined)
  @IsInt()
  @Min(1)
  cantidad?: number;

  // Participación monetaria, con máximo dos decimales.
  @ValidateIf((o) => o.importeAsignado !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  importeAsignado?: number;

  // Participación porcentual sobre el importe total de esta línea de pedido.
  @ValidateIf((o) => o.porcentaje !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  porcentaje?: number;
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
