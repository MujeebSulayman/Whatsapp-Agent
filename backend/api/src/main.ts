import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.useBodyParser('json', { limit: '3mb' }); // CSV imports
  await app.listen(Number(process.env.PORT ?? 4000));
  console.log('[api] listening on', process.env.PORT ?? 4000);
}
void bootstrap();
