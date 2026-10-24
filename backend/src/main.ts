import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Todas las rutas utilizan el prefijo /api
  app.setGlobalPrefix('api');

  // Validación global de datos
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // CORS habilitado para desarrollo
  app.enableCors();

  // Puerto configurable por entorno
  const port = Number(process.env.PORT || 3000);

  await app.listen(port);

  console.log(`Backend corriendo en http://localhost:${port}/api`);
}

bootstrap();
