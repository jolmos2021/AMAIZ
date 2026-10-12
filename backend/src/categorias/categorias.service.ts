import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Categoria } from './entities/categoria.entity';
import { CrearCategoriaDto } from './dto/crear-categoria.dto';
import { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto';

@Injectable()
export class CategoriasService {
  constructor(
    @InjectRepository(Categoria)
    private readonly repo: Repository<Categoria>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async listar(): Promise<Categoria[]> {
    return this.repo.find({ order: { nombre: 'ASC' } });
  }

  async obtenerPorId(id: number): Promise<Categoria> {
    const categoria = await this.repo.findOne({ where: { id } });
    if (!categoria) {
      throw new NotFoundException(`No existe una categoría con id ${id}`);
    }
    return categoria;
  }

  async crear(dto: CrearCategoriaDto): Promise<Categoria> {
    const existe = await this.repo.findOne({
      where: { nombre: dto.nombre },
    });
    if (existe) {
      throw new ConflictException(`La categoría '${dto.nombre}' ya existe`);
    }
    const nueva = this.repo.create(dto);
    return this.repo.save(nueva);
  }

  async actualizar(id: number, dto: ActualizarCategoriaDto): Promise<Categoria> {
    const categoria = await this.obtenerPorId(id);

    if (dto.nombre && dto.nombre !== categoria.nombre) {
      const duplicado = await this.repo.findOne({
        where: { nombre: dto.nombre },
      });
      if (duplicado) {
        throw new ConflictException(`La categoría '${dto.nombre}' ya existe`);
      }
      categoria.nombre = dto.nombre;
    }
    if (dto.descripcion !== undefined) {
      categoria.descripcion = dto.descripcion;
    }

    return this.repo.save(categoria);
  }

  async eliminar(id: number): Promise<{ mensaje: string }> {
    const categoria = await this.obtenerPorId(id);

    // Regla del blueprint: una categoría con productos NO se elimina.
    // Conteo directo por SQL parametrizado ($1 = a prueba de inyección SQL)
    const filas: { total: number }[] = await this.dataSource.query(
      'SELECT COUNT(*)::int AS total FROM productos WHERE categoria_id = $1',
      [id],
    );
    const total = filas[0]?.total ?? 0;

    if (total > 0) {
      throw new BadRequestException(
        'No se puede eliminar: la categoría tiene productos asociados',
      );
    }

    await this.repo.remove(categoria);
    return { mensaje: `Categoría ${id} eliminada` };
  }
}
