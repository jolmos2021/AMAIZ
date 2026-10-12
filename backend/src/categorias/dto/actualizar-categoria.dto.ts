import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class ActualizarCategoriaDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  descripcion?: string;
}
