import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';

export class PagoCombinadoItemDto {
  @IsInt()
  @Min(1)
  metodoPagoId: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  valor: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  clienteId?: number;
}

export class RegistrarPagoCombinadoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PagoCombinadoItemDto)
  pagos: PagoCombinadoItemDto[];
}
