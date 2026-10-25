import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { OrdenesService } from './ordenes.service';
import { CrearOrdenDto } from './dto/crear-orden.dto';
import { AgregarItemsOrdenDto } from './dto/agregar-items-orden.dto';
import { CambiarEstadoItemDto } from './dto/cambiar-estado-item.dto';
import { EstadoItem } from './entities/detalle-orden.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../usuarios/entities/usuario.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ordenes')
export class OrdenesController {
  constructor(private readonly ordenesService: OrdenesService) {}

  // ==================== CREACIÓN ====================

  @Roles(RolUsuario.MESERO, RolUsuario.ADMINISTRADOR)
  @Post()
  crear(
    @Request() req: { user: { userId: number; rol: string } },
    @Body() dto: CrearOrdenDto,
  ) {
    return this.ordenesService.crear(req.user.userId, dto);
  }

  // ==================== AGREGAR PRODUCTOS ====================

  @Roles(RolUsuario.MESERO, RolUsuario.ADMINISTRADOR)
  @Post(':id/items')
  agregarItems(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: { userId: number; rol: string } },
    @Body() dto: AgregarItemsOrdenDto,
  ) {
    return this.ordenesService.agregarItems(id, req.user.userId, dto);
  }

  // ==================== CONSULTAS ====================

  @Get('activas')
  listarActivas() {
    return this.ordenesService.listarActivas();
  }

  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO)
  @Get()
  listar(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.ordenesService.listar(
      desde ? new Date(desde) : undefined,
      hasta ? new Date(hasta) : undefined,
    );
  }

  @Get(':id')
  obtenerPorId(@Param('id', ParseIntPipe) id: number) {
    return this.ordenesService.obtenerPorId(id);
  }

  // ==================== FLUJO DE COCINA (Paso 3.3) ====================

  // Avanzar un item: EN_PREPARACION / LISTO (cocina) o ENTREGADO (mesero)
  @Roles(RolUsuario.COCINERO, RolUsuario.MESERO, RolUsuario.ADMINISTRADOR)
  @Patch(':id/items/:itemId/estado')
  cambiarEstadoItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Request() req: { user: { rol: string } },
    @Body() dto: CambiarEstadoItemDto,
  ) {
    return this.ordenesService.cambiarEstadoItem(
      id,
      itemId,
      dto.estadoItem,
      req.user.rol,
    );
  }

  // Anular un item (cocina): devuelve stock, recalcula la orden
  @Roles(RolUsuario.COCINERO, RolUsuario.ADMINISTRADOR)
  @Patch(':id/items/:itemId/anular')
  anularItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.ordenesService.anularItem(id, itemId);
  }

  // El mesero entrega la orden completa (debe estar LISTA)
  @Roles(RolUsuario.MESERO, RolUsuario.ADMINISTRADOR)
  @Patch(':id/entregar')
  entregar(@Param('id', ParseIntPipe) id: number) {
    return this.ordenesService.entregar(id);
  }

  // Anular la orden completa — EXCLUSIVO del administrador
  @Roles(RolUsuario.ADMINISTRADOR)
  @Patch(':id/anular')
  anular(@Param('id', ParseIntPipe) id: number) {
    return this.ordenesService.anular(id);
  }
}
