import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orden } from './entities/orden.entity';
import { DetalleOrden } from './entities/detalle-orden.entity';
import { OrdenesService } from './ordenes.service';
import { OrdenesController } from './ordenes.controller';
import { CobrosModule } from '../cobros/cobros.module';

@Module({
  imports: [TypeOrmModule.forFeature([Orden, DetalleOrden]), CobrosModule],
  controllers: [OrdenesController], // ← ESTA LÍNEA es la que faltaba
  providers: [OrdenesService],
  exports: [OrdenesService],
})
export class OrdenesModule {}
