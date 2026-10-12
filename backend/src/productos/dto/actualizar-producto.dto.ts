import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsNumber,
  IsInt,
  IsBoolean,
  Min,
  IsPositive,
} from 'class-validator';

export class ActualizarProductoDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(150)
  nombre?: string;

  @IsNumber({}, { message: 'El precio debe ser un número' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  @IsOptional()
  precio?: number;

  @IsInt()
  @IsPositive()
  @IsOptional()
  categoriaId?: number;

  @IsBoolean()
  @IsOptional()
  manejaInventario?: boolean;

  // Corrección directa de stock (recepción de mercadería, inventario físico)
  @IsInt()
  @Min(0, { message: 'El stock no puede ser negativo' })
  @IsOptional()
  stockActual?: number;

  @IsBoolean()
  @IsOptional()
  disponibleMenuDia?: boolean;
}
