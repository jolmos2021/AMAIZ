import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { MesasService } from './mesas.service';
import { CrearMesaDto } from './dto/crear-mesa.dto';
import { ActualizarMesaDto } from './dto/actualizar-mesa.dto';
import { MoverMesaDto } from './dto/mover-mesa.dto';
import { CambiarEstadoMesaDto } from './dto/cambiar-estado-mesa.dto';
import { ActualizarDisposicionDto } from './dto/actualizar-disposicion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../usuarios/entities/usuario.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mesas')
export class MesasController {
  constructor(private readonly mesasService: MesasService) {}

  // ----- LECTURA: todo el personal autenticado (meseros la verán en Fase 3) -----

  @Get()
  listar() {
    return this.mesasService.listar();
  }

  @Get(':id')
  obtenerPorId(@Param('id', ParseIntPipe) id: number) {
    return this.mesasService.obtenerPorId(id);
  }

  // ----- ADMINISTRACIÓN DEL SALÓN: solo ADMINISTRADOR -----
  // ⚠️ ORDEN CRÍTICO: rutas FIJAS ('disposicion') van ANTES que
  // parametrizadas (':id') — si no, Nest interpreta la palabra como id

  // Guardado masivo de toda la disposición (transaccional)
  @Roles(RolUsuario.ADMINISTRADOR)
  @Patch('disposicion')
  actualizarDisposicion(@Body() dto: ActualizarDisposicionDto) {
    return this.mesasService.actualizarDisposicion(dto);
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Post()
  crear(@Body() dto: CrearMesaDto) {
    return this.mesasService.crear(dto);
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarMesaDto,
  ) {
    return this.mesasService.actualizar(id, dto);
  }

  // Drag-and-drop individual (el diseñador del admin)
  @Roles(RolUsuario.ADMINISTRADOR)
  @Patch(':id/posicion')
  mover(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoverMesaDto,
  ) {
    return this.mesasService.mover(id, dto);
  }

  // Reservar / liberar manualmente (nunca OCUPADA — regla de negocio)
  @Roles(RolUsuario.ADMINISTRADOR)
  @Patch(':id/estado')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoMesaDto,
  ) {
    return this.mesasService.cambiarEstado(id, dto);
  }

  @Roles(RolUsuario.ADMINISTRADOR)
  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.mesasService.eliminar(id);
  }
}
