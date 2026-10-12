import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// Forma del usuario que la JwtStrategy inyecta en req.user
export interface UsuarioAutenticado {
  userId: number;
  username: string;
  rol: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('perfil')
  @UseGuards(JwtAuthGuard)
  getPerfil(@Request() req: { user: UsuarioAutenticado }) {
    return req.user;
  }
}
