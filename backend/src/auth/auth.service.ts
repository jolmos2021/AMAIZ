import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsuariosService } from '../usuarios/usuarios.service';
import { EstadoUsuario } from '../usuarios/entities/usuario.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usuariosService.findByUsername(dto.username);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (user.estado !== EstadoUsuario.ACTIVO) {
      throw new UnauthorizedException('El usuario está inactivo');
    }

    const passwordValida = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = { sub: user.id, username: user.username, rol: user.rol };

    return {
      accessToken: this.jwtService.sign(payload),
      usuario: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        rol: user.rol,
      },
    };
  }
}
