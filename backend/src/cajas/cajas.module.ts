import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Caja } from './entities/caja.entity';
import { MovimientoCaja } from './entities/movimiento-caja.entity';
import { CajasService } from './cajas.service';
import { CajasController } from './cajas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Caja, MovimientoCaja])],
  controllers: [CajasController],
  providers: [CajasService],
  exports: [CajasService], // lo usarán pagos y abonos en la Fase 4
})
export class CajasModule {}
