import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CajasService } from './cajas.service';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';
import { CrearMovimientoCajaDto } from './dto/crear-movimiento-caja.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../usuarios/entities/usuario.entity';

// La "caja actual" del sistema — abierta por el cajero/administrador de turno
@Controller('cajas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CajasController {
  constructor(private readonly cajasService: CajasService) {}

  // ----- ESTADO ACTUAL (todo el personal autenticado) -----

  @Get('actual')
  obtenerCajaAbierta() {
    return this.cajasService.obtenerCajaAbierta();
  }

  // ----- OPERACIONES DE DINERO (CAJERO / ADMINISTRADOR) -----

  // req.user pasa de dato de seguridad a DATO DE NEGOCIO:
  // la caja queda abierta a nombre de quien llama
  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Post('abrir')
  abrir(
    @Request() req: { user: { userId: number; rol: string } },
    @Body() dto: AbrirCajaDto,
  ) {
    return this.cajasService.abrir(req.user.userId, dto);
  }

  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Patch(':id/cerrar')
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: { userId: number; rol: string } },
    @Body() dto: CerrarCajaDto,
  ) {
    return this.cajasService.cerrar(id, req.user.userId, req.user.rol, dto);
  }

  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Post(':id/movimientos')
  registrarMovimiento(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: { userId: number; rol: string } },
    @Body() dto: CrearMovimientoCajaDto,
  ) {
    return this.cajasService.registrarMovimiento(id, req.user.userId, req.user.rol, dto);
  }

  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Get(':id/movimientos')
  listarMovimientos(@Param('id', ParseIntPipe) id: number) {
    return this.cajasService.listarMovimientos(id);
  }

  // ----- INFORMACIÓN (todo / restringido según endpoint) -----

  @Get()
  listar() {
    return this.cajasService.listar();
  }

  @Get(':id')
  obtenerPorId(@Param('id', ParseIntPipe) id: number) {
    return this.cajasService.obtenerPorId(id);
  }

  @Get(':id/resumen')
  resumen(@Param('id', ParseIntPipe) id: number) {
    return this.cajasService.resumen(id);
  }
}
