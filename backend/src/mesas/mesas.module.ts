import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mesa } from './entities/mesa.entity';
import { MesasService } from './mesas.service';
import { MesasController } from './mesas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Mesa])],
  controllers: [MesasController],
  providers: [MesasService],
  exports: [MesasService],
})
export class MesasModule {}
