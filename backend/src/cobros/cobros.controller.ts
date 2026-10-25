import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CobrosService } from './cobros.service';
import { DividirCuentaDto } from './dto/dividir-cuenta.dto';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { RegistrarPagoCombinadoDto } from './dto/registrar-pago-combinado.dto';
import { RegistrarCreditoDto } from './dto/registrar-credito.dto';
import { RegistrarAbonoDto } from './dto/registrar-abono.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../usuarios/entities/usuario.entity';

@Controller('cobros')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CobrosController {
  constructor(private readonly cobrosService: CobrosService) {}

  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Get('metodos')
  obtenerMetodos() {
    return this.cobrosService.obtenerMetodos();
  }

  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Get('orden/:id')
  obtenerResumenOrden(@Param('id', ParseIntPipe) id: number) {
    return this.cobrosService.obtenerResumenOrden(id);
  }

  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Get('orden/:id/subcuentas')
  obtenerSubcuentas(@Param('id', ParseIntPipe) id: number) {
    return this.cobrosService.obtenerSubcuentas(id);
  }

  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Get('creditos')
  obtenerCreditos() {
    return this.cobrosService.obtenerCreditos();
  }

  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Post('orden/:id/dividir')
  dividirCuenta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DividirCuentaDto,
  ) {
    return this.cobrosService.dividirCuenta(id, dto);
  }
  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Post('orden/:id/pagar')
  registrarPago(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarPagoDto,
  ) {
    return this.cobrosService.registrarPago(id, dto);
  }
  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Post('orden/:id/pagar-combinado')
  registrarPagoCombinado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarPagoCombinadoDto,
  ) {
    return this.cobrosService.registrarPagoCombinado(id, dto);
  }

  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Post('orden/:id/credito')
  registrarCredito(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarCreditoDto,
  ) {
    return this.cobrosService.registrarCredito(id, dto);
  }
  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Post('orden/:id/liquidar')
  liquidarOrden(@Param('id', ParseIntPipe) id: number) {
    return this.cobrosService.liquidarOrden(id);
  }

  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  @Post('creditos/:creditoId/abonos')
  registrarAbono(
    @Param('creditoId', ParseIntPipe) creditoId: number,
    @Body() dto: RegistrarAbonoDto,
  ) {
    return this.cobrosService.registrarAbono(creditoId, dto);
  }
}
