import {
  IsEnum,
  IsInt,
  IsPositive,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoConsumo } from '../entities/orden.entity';

/** Una línea de la comanda */
export class CrearItemOrdenDto {
  @IsInt()
  @IsPositive({ message: 'productoId debe ser un id válido' })
  productoId: number;

  @IsInt()
  @IsPositive({ message: 'La cantidad debe ser al menos 1' })
  cantidad: number;

  // La nota del cliente: "sin cebolla", "extra queso"...
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notas?: string;
}

export class CrearOrdenDto {
  @IsEnum(TipoConsumo, {
    message: 'tipoConsumo debe ser MESA, LLEVAR o MOSTRADOR',
  })
  tipoConsumo: TipoConsumo;

  // Obligatorio SOLO si tipoConsumo = MESA.
  // Se valida en el SERVICE (no en el DTO) para dar un mensaje claro:
  // "Una orden de MESA requiere mesaId" es mejor que un 400 críptico
  @IsOptional()
  @IsInt()
  @IsPositive()
  mesaId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  clienteId?: number;

  // Validación anidada — mismo patrón que la disposición de mesas (2.4a)
  @IsArray()
  @ArrayMinSize(1, { message: 'La orden necesita al menos un producto' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CrearItemOrdenDto)
  items: CrearItemOrdenDto[];
}
