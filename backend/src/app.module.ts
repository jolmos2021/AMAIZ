import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { UsuariosModule } from './usuarios/usuarios.module';
import { AuthModule } from './auth/auth.module';
import { CategoriasModule } from './categorias/categorias.module';
import { ProductosModule } from './productos/productos.module';
import { MesasModule } from './mesas/mesas.module';
import { CajasModule } from './cajas/cajas.module';
import { RealtimeModule } from './realtime/realtime.module';
import { OrdenesModule } from './ordenes/ordenes.module';
import { CobrosModule } from './cobros/cobros.module';
import { ClientesModule } from './clientes/clientes.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
      }),
    }),

    UsuariosModule,
    AuthModule,
    CategoriasModule,
    ProductosModule,
    MesasModule,
    CajasModule,
    RealtimeModule,
    OrdenesModule,
    ClientesModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
