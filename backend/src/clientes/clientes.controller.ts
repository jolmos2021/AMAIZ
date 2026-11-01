import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ClientesService } from './clientes.service';
import { CrearClienteDto } from './dto/crear-cliente.dto';
import { EditarClienteDto } from './dto/editar-cliente.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../usuarios/entities/usuario.entity';

@Controller('clientes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  buscar(@Query('q') termino?: string) {
    return this.clientesService.buscar(termino ?? '');
  }

  @Post()
  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  crear(@Body() dto: CrearClienteDto) {
    return this.clientesService.crear(dto.nombre, dto.telefono, dto.tipo);
  }

  @Patch(':id')
  @Roles(RolUsuario.CAJERO, RolUsuario.ADMINISTRADOR)
  editar(@Param('id') id: string, @Body() dto: EditarClienteDto) {
    return this.clientesService.editar(id, dto);
  }

  @Delete(':id')
  @Roles(RolUsuario.ADMINISTRADOR)
  eliminar(@Param('id') id: string) {
    return this.clientesService.eliminar(id);
  }
}
