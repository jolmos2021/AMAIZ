import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsNumber,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  IsPositive,
} from 'class-validator';

export class CrearProductoDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MinLength(2)
  @MaxLength(150)
  nombre: string;

  @IsNumber({}, { message: 'El precio debe ser un número' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  precio: number;

  @IsInt({ message: 'categoriaId debe ser un número entero' })
  @IsPositive({ message: 'categoriaId debe ser un id válido' })
  categoriaId: number;

  // Decisión obligatoria al crear: ¿este producto controla stock?
  @IsBoolean()
  manejaInventario: boolean;

  // Solo aplica si manejaInventario = true (el service lo normaliza)
  @IsOptional()
  @IsInt({ message: 'El stock inicial debe ser un entero' })
  @Min(0, { message: 'El stock inicial no puede ser negativo' })
  stockInicial?: number;

  @IsOptional()
  @IsBoolean()
  disponibleMenuDia?: boolean;
}
