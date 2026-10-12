import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from './entities/usuario.entity';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly repo: Repository<Usuario>,
  ) {}

  findByUsername(username: string): Promise<Usuario | null> {
    return this.repo.findOne({ where: { username } });
  }

  findById(id: number): Promise<Usuario | null> {
    return this.repo.findOne({ where: { id } });
  }
}
