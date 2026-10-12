import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api'); // todas las rutas: /api/...
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableCors(); // abierto en desarrollo; lo restringiremos al hotspot en producción
  await app.listen(3000);
  console.log('Backend corriendo en http://localhost:3000/api');
}
bootstrap();
