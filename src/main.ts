import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, Request, text, urlencoded } from 'express';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { StructuredLoggerInterceptor } from './common/interceptors/structured-logger.interceptor';
import { AppModule } from './app.module';
import { PrismaService } from './infra/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    cors: true,
  });
  app.enableCors();
  const configService = app.get(ConfigService);
  const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  let isShuttingDown = false;

  const bodySizeLimit = configService.get<string>('BODY_SIZE_LIMIT') ?? '5mb';
  app.use(
    '/payments/webhook/phonepe',
    text({
      type: '*/*',
      limit: bodySizeLimit,
      verify: (req: Request & { rawBody?: string }, _res, buf) => {
        if (buf?.length) {
          req.rawBody = buf.toString('utf8');
        }
      },
    }),
  );
  app.use(
    json({
      limit: bodySizeLimit,
      verify: (req: Request & { rawBody?: string }, _res, buf) => {
        if (buf?.length) {
          req.rawBody = buf.toString('utf8');
        }
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: bodySizeLimit }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new StructuredLoggerInterceptor(),
    app.get(AuditLogInterceptor),
  );

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Career Point Academy API')
    .setDescription('Backend API for Career Point Academy')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const shutdown = async (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    try {
      await app.close();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[Shutdown] Failed to close app on ${signal}:`, err);
    } finally {
      process.exit(0);
    }
  };

  shutdownSignals.forEach((signal) => {
    process.on(signal, () => void shutdown(signal));
  });

  const port = configService.get<number>('PORT') ?? 4000;
  await app.listen(port);
}
bootstrap();
