import { IsNumber, Min } from 'class-validator';

/** Drag-and-drop individual: nueva posición de UNA mesa */
export class MoverMesaDto {
  @IsNumber()
  @Min(0, { message: 'La coordenada no puede ser negativa' })
  coordenadaX: number;

  @IsNumber()
  @Min(0, { message: 'La coordenada no puede ser negativa' })
  coordenadaY: number;
}
