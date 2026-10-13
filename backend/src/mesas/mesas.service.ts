import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Mesa, EstadoMesa } from './entities/mesa.entity';
import { CrearMesaDto } from './dto/crear-mesa.dto';
import { ActualizarMesaDto } from './dto/actualizar-mesa.dto';
import { MoverMesaDto } from './dto/mover-mesa.dto';
import { CambiarEstadoMesaDto } from './dto/cambiar-estado-mesa.dto';
import {
  ActualizarDisposicionDto,
} from './dto/actualizar-disposicion.dto';

@Injectable()
export class MesasService {
  constructor(
    @InjectRepository(Mesa)
    private readonly repo: Repository<Mesa>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ---------- Lectura ----------

  /** Mapa completo del salón (con posiciones) — lo consumirá el diseñador y la app de meseros */
  async listar(): Promise<Mesa[]> {
    return this.repo.find({ order: { numero: 'ASC' } });
  }

  async obtenerPorId(id: number): Promise<Mesa> {
    const mesa = await this.repo.findOne({ where: { id } });
    if (!mesa) {
      throw new NotFoundException(`No existe una mesa con id ${id}`);
    }
    return mesa;
  }

  // ---------- Creación / edición ----------

  async crear(dto: CrearMesaDto): Promise<Mesa> {
    // Regla 1: número de mesa único
    const existe = await this.repo.findOne({ where: { numero: dto.numero } });
    if (existe) {
      throw new ConflictException(`La mesa número ${dto.numero} ya existe`);
    }

    const nueva = this.repo.create({
      numero: dto.numero,
      capacidadMaxima: dto.capacidadMaxima,
      coordenadaX: dto.coordenadaX ?? 0,
      coordenadaY: dto.coordenadaY ?? 0,
      estado: EstadoMesa.LIBRE,
    });
    return this.repo.save(nueva);
  }

  async actualizar(id: number, dto: ActualizarMesaDto): Promise<Mesa> {
    const mesa = await this.obtenerPorId(id);

    // Regla 1 (si cambia el número, sigue siendo único)
    if (dto.numero && dto.numero !== mesa.numero) {
      const duplicado = await this.repo.findOne({
        where: { numero: dto.numero },
      });
      if (duplicado) {
        throw new ConflictException(
          `La mesa número ${dto.numero} ya existe`,
        );
      }
      mesa.numero = dto.numero;
    }

    if (dto.capacidadMaxima !== undefined)
      mesa.capacidadMaxima = dto.capacidadMaxima;
    if (dto.coordenadaX !== undefined) mesa.coordenadaX = dto.coordenadaX;
    if (dto.coordenadaY !== undefined) mesa.coordenadaY = dto.coordenadaY;

    return this.repo.save(mesa);
  }

  // ---------- Operaciones del diseñador gráfico ----------

  /** Drag-and-drop individual: mueve UNA mesa (solo coordenadas) */
  async mover(id: number, dto: MoverMesaDto): Promise<Mesa> {
    const mesa = await this.obtenerPorId(id);
    mesa.coordenadaX = dto.coordenadaX;
    mesa.coordenadaY = dto.coordenadaY;
    return this.repo.save(mesa);
  }

  /**
   * Guardado masivo de la disposición del salón.
   * TRANSACCIONAL: o se guardan todas las posiciones, o ninguna.
   * Además valida que TODOS los ids existan ANTES de tocar la BD.
   */
  async actualizarDisposicion(dto: ActualizarDisposicionDto): Promise<Mesa[]> {
    // Regla 2: todos los ids deben existir (validación previa completa)
    const idsEnviados = dto.mesas.map((m) => m.id);
    const encontradas = await this.repo.find({
      where: idsEnviados.map((id) => ({ id })),
    });
    if (encontradas.length !== dto.mesas.length) {
      // Identificamos exactamente cuáles faltan (mensaje útil)
      const idsEncontrados = new Set(encontradas.map((m) => m.id));
      const faltantes = idsEnviados.filter((id) => !idsEncontrados.has(id));
      throw new BadRequestException(
        `Mesas inexistentes en la disposición: ${faltantes.join(', ')}`,
      );
    }

    // Regla 3: transacción — todo o nada
    return this.dataSource.transaction(async (manager) => {
      for (const posicion of dto.mesas) {
        await manager.update(
          Mesa,
          { id: posicion.id },
          {
            coordenadaX: posicion.coordenadaX,
            coordenadaY: posicion.coordenadaY,
          },
        );
      }
      // Devuelve el mapa completo ya persistido
      return this.listar();
    });
  }

  // ---------- Estados ----------

  /**
   * Cambio MANUAL de estado (solo admin).
   * Regla 4: OCUPADA no se asigna a mano — la establece el sistema
   * al abrir una orden (Fase 3). El mapa del salón jamás miente.
   */
  async cambiarEstado(id: number, dto: CambiarEstadoMesaDto): Promise<Mesa> {
    const mesa = await this.obtenerPorId(id);

    if (dto.estado === EstadoMesa.OCUPADA) {
      throw new BadRequestException(
        'El estado OCUPADA solo lo establece el sistema al abrir una orden',
      );
    }

    // Regla 5: no se libera manualmente una mesa "ocupada"
    if (mesa.estado === EstadoMesa.OCUPADA && dto.estado === EstadoMesa.LIBRE) {
      throw new BadRequestException(
        'La mesa está OCUPADA: se liberará automáticamente al cerrar la orden en caja (Fase 3)',
      );
    }

    mesa.estado = dto.estado;
    return this.repo.save(mesa);
  }

  // ---------- Eliminación ----------

  /**
   * Borrado FÍSICO de mesa (permitido: las mesas no tienen historial
   * propio — las órdenes guardan FK, y la BD las mantiene).
   * Solo se elimina si está LIBRE.
   */
  async eliminar(id: number): Promise<{ mensaje: string }> {
    const mesa = await this.obtenerPorId(id);

    if (mesa.estado !== EstadoMesa.LIBRE) {
      throw new BadRequestException(
        `Solo se pueden eliminar mesas LIBRES (estado actual: ${mesa.estado})`,
      );
    }

    // ¿Tiene órdenes históricas? (conteo SQL parametrizado — patrón del Paso 2.3)
    const filas: { total: number }[] = await this.dataSource.query(
      'SELECT COUNT(*)::int AS total FROM ordenes WHERE mesa_id = $1',
      [id],
    );
    if ((filas[0]?.total ?? 0) > 0) {
      throw new BadRequestException(
        'No se puede eliminar: la mesa tiene órdenes en su historial. Considere desactivarla o conservarla',
      );
    }

    await this.repo.remove(mesa);
    return { mensaje: `Mesa ${id} eliminada` };
  }
}
