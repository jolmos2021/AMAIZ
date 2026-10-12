import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  Usuario,
  RolUsuario,
  EstadoUsuario,
} from './usuarios/entities/usuario.entity';

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'restaurante_admin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'restaurante',
    entities: [__dirname + '/**/*.entity.js'],
    synchronize: false,
  });

  await dataSource.initialize();
  const repo = dataSource.getRepository(Usuario);
  const existe = await repo.findOne({ where: { username: 'admin' } });

  if (existe) {
    console.log('El usuario admin ya existe — nada que hacer.');
  } else {
    const admin = repo.create({
      username: 'admin',
      nombre: 'Administrador del Sistema',
      passwordHash: await bcrypt.hash('Admin123!', 10),
      rol: RolUsuario.ADMINISTRADOR,
      estado: EstadoUsuario.ACTIVO,
    });
    await repo.save(admin);
    console.log('✅ Usuario admin creado | username: admin | password: Admin123!');
  }

  await dataSource.destroy();
}

main().catch((error) => {
  console.error('Seed falló:', error);
  process.exit(1);
});
