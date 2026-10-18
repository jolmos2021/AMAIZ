import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CrearItemOrdenDto } from './crear-orden.dto';

export class AgregarItemsOrdenDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Debes agregar al menos un producto' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CrearItemOrdenDto)
  items: CrearItemOrdenDto[];
}
