import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Producto } from './entities/producto.entity';
import { CrearProductoDto } from './dto/crear-producto.dto';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto';
import { AjustarStockDto } from './dto/ajustar-stock.dto';

@Injectable()
export class ProductosService {
  constructor(
    @InjectRepository(Producto)
    private readonly repo: Repository<Producto>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async listar(incluirInactivos = false): Promise<Producto[]> {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.categoria', 'c')
      .orderBy('c.nombre', 'ASC')
      .addOrderBy('p.nombre', 'ASC');

    if (!incluirInactivos) {
      qb.andWhere('p.disponible_menu_dia = :disponible', {
        disponible: true,
      });
    }
    return qb.getMany();
  }

  async obtenerPorId(id: number): Promise<Producto> {
    const producto = await this.repo.findOne({
      where: { id },
      relations: { categoria: true },
    });
    if (!producto) {
      throw new NotFoundException(`No existe un producto con id ${id}`);
    }
    return producto;
  }

  async crear(dto: CrearProductoDto): Promise<Producto> {
    // 1. La categoría referenciada debe existir (error amigable)
    const categoriaExiste = await this.dataSource.query(
      'SELECT id FROM categorias WHERE id = $1',
      [dto.categoriaId],
    );
    if (!categoriaExiste || categoriaExiste.length === 0) {
      throw new BadRequestException(
        `No existe la categoría ${dto.categoriaId}`,
      );
    }

    // 2. Regla de inventario: si NO maneja inventario, stock SIEMPRE es 0
    const stockInicial = dto.manejaInventario ? (dto.stockInicial ?? 0) : 0;

    const nuevo = this.repo.create({
      nombre: dto.nombre,
      precio: dto.precio,
      categoriaId: dto.categoriaId,
      manejaInventario: dto.manejaInventario,
      stockActual: stockInicial,
      disponibleMenuDia: dto.disponibleMenuDia ?? true,
    });
    return this.repo.save(nuevo);
  }

  async actualizar(id: number, dto: ActualizarProductoDto): Promise<Producto> {
    const producto = await this.obtenerPorId(id);

    // Validación de coherencia de inventario
    if (
      dto.manejaInventario === false &&
      producto.stockActual !== 0 &&
      dto.stockActual === undefined
    ) {
      throw new BadRequestException(
        `El producto tiene stock ${producto.stockActual}; asígnale stock 0 para desactivar el control de inventario`,
      );
    }

    if (dto.nombre) producto.nombre = dto.nombre;
    if (dto.precio !== undefined) producto.precio = dto.precio;
    if (dto.categoriaId) producto.categoriaId = dto.categoriaId;
    if (dto.manejaInventario !== undefined)
      producto.manejaInventario = dto.manejaInventario;
    if (dto.stockActual !== undefined) producto.stockActual = dto.stockActual;
    if (dto.disponibleMenuDia !== undefined)
      producto.disponibleMenuDia = dto.disponibleMenuDia;

    return this.repo.save(producto);
  }

  /**
   * Ajuste de stock por delta (recepción de mercadería / merma).
   * Atómico a nivel BD: el UPDATE con condición evita que dos
   * operaciones simultáneas dejen stock negativo.
   */
  async ajustarStock(id: number, dto: AjustarStockDto): Promise<Producto> {
    const producto = await this.obtenerPorId(id);

    if (!producto.manejaInventario) {
      throw new BadRequestException(
        `'${producto.nombre}' no maneja inventario`,
      );
    }

    const resultado = await this.repo
      .createQueryBuilder()
      .update(Producto)
      .set({
        stockActual: () => 'stock_actual + :delta',
      })
      .where('id = :id AND stock_actual + :delta >= 0', {
        id,
        delta: dto.delta,
      })
      .execute();

    if (!resultado.affected) {
      throw new BadRequestException(
        `Ajuste rechazado: el stock quedaría negativo (stock actual: ${producto.stockActual}, delta: ${dto.delta})`,
      );
    }

    // Releer para devolver el estado final real
    return this.obtenerPorId(id);
  }

  /** Menú del día (Fase 3): solo productos disponibles */
  async menuDelDia(): Promise<Producto[]> {
    return this.listar(false);
  }
}
