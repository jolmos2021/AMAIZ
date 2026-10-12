import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Usuario } from './entities/usuario.entity';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';

// Nunca exponemos el hash al exterior
export class UsuarioPublico {
  id: number;
  username: string;
  nombre: string;
  rol: string;
  estado: string;
}

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly repo: Repository<Usuario>,
  ) {}

  // ---------- Helpers ----------

  /** Convierte la entidad a su forma pública (sin passwordHash) */
  private aPublico(u: Usuario): UsuarioPublico {
    return {
      id: u.id,
      username: u.username,
      nombre: u.nombre,
      rol: u.rol,
      estado: u.estado,
    };
  }

  // ---------- Login (usa AuthModule) ----------

  findByUsername(username: string): Promise<Usuario | null> {
    return this.repo.findOne({ where: { username } });
  }

  findById(id: number): Promise<Usuario | null> {
    return this.repo.findOne({ where: { id } });
  }

  // ---------- CRUD para el ABM (control de personal) ----------

  /** Lista todo el personal, activos e inactivos */
  async listar(): Promise<UsuarioPublico[]> {
    const usuarios = await this.repo.find({
      order: { rol: 'ASC', nombre: 'ASC' },
    });
    return usuarios.map((u) => this.aPublico(u));
  }

  async obtenerPorId(id: number): Promise<UsuarioPublico> {
    const usuario = await this.repo.findOne({ where: { id } });
    if (!usuario) {
      throw new NotFoundException(`No existe un usuario con id ${id}`);
    }
    return this.aPublico(usuario);
  }

  async crear(dto: CrearUsuarioDto): Promise<UsuarioPublico> {
    // Regla de negocio: username único
    const existe = await this.findByUsername(dto.username);
    if (existe) {
      throw new ConflictException(
        `El username '${dto.username}' ya está en uso`,
      );
    }

    const nuevo = this.repo.create({
      username: dto.username,
      nombre: dto.nombre,
      passwordHash: await bcrypt.hash(dto.password, 10),
      rol: dto.rol,
    });
    const guardado = await this.repo.save(nuevo);
    return this.aPublico(guardado);
  }

  async actualizar(
    id: number,
    dto: ActualizarUsuarioDto,
  ): Promise<UsuarioPublico> {
    const usuario = await this.repo.findOne({ where: { id } });
    if (!usuario) {
      throw new NotFoundException(`No existe un usuario con id ${id}`);
    }

    // Se envió contraseña → se actualiza (con hash); si no, queda intacta
    if (dto.password) {
      usuario.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.nombre) usuario.nombre = dto.nombre;
    if (dto.rol) usuario.rol = dto.rol;
    if (dto.estado) usuario.estado = dto.estado;

    const guardado = await this.repo.save(usuario);
    return this.aPublico(guardado);
  }

  /**
   * Borrado LÓGICO: pasa el usuario a INACTIVO.
   * El personal jamás se borra físicamente (conserva historial de órdenes).
   */
  async desactivar(id: number): Promise<UsuarioPublico> {
    const usuario = await this.repo.findOne({ where: { id } });
    if (!usuario) {
      throw new NotFoundException(`No existe un usuario con id ${id}`);
    }
    usuario.estado = 'INACTIVO' as Usuario['estado'];
    const guardado = await this.repo.save(usuario);
    return this.aPublico(guardado);
  }
}
