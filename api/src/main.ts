import 'reflect-metadata';

// Permite que BigInt seja serializado para JSON nas respostas HTTP.
// Sem isto, JSON.stringify lanca "Do not know how to serialize a BigInt".
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: false,
    rawBody: true,
  });

  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  if (corsOrigin) {
    app.enableCors({
      origin: corsOrigin.split(',').map(s => s.trim()),
      credentials: true,
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api', { exclude: ['/', '/health'] });

  const swagger = new DocumentBuilder()
    .setTitle('OrthoDontic API')
    .setDescription('API do sistema de acompanhamento OrthoDontic')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('api/docs', app, doc);

  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port);
  console.log(`OrthoDontic API rodando em http://localhost:${port}`);
  console.log(`Swagger em http://localhost:${port}/api/docs`);
}

bootstrap().catch(err => {
  console.error('Falha ao subir API:', err);
  process.exit(1);
});
