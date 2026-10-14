import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { OrdenesService } from './ordenes.service';
import { CrearOrdenDto } from './dto/crear-orden.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../usuarios/entities/usuario.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ordenes')
export class OrdenesController {
  constructor(private readonly ordenesService: OrdenesService) {}

  /**
   * EL endpoint del mesero: tomar la comanda.
   * req.user (del token) identifica QUIÉN toma la orden —
   * mismo patrón de "identidad = dato de negocio" que la caja.
   */
  @Roles(RolUsuario.MESERO, RolUsuario.ADMINISTRADOR)
  @Post()
  crear(
    @Request() req: { user: { userId: number; rol: string } },
    @Body() dto: CrearOrdenDto,
  ) {
    return this.ordenesService.crear(req.user.userId, dto);
  }

  // Órdenes vivas — la consumirá la pantalla de cocina (3.3)
  // y el mapa de mesas del mesero
  @Get('activas')
  listarActivas() {
    return this.ordenesService.listarActivas();
  }

  // Rutas fijas ANTES de :id (regla del fix de 2.4c)
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
}
