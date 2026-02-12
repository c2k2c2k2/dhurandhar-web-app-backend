import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MINIO_CONNECTION, NestMinioService } from 'nestjs-minio';
import { MODULE_OPTIONS_TOKEN } from 'nestjs-minio/dist/nest-minio.module-definition';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MODULE_OPTIONS_TOKEN,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const endpoint = configService.get<string>('MINIO_ENDPOINT') ?? '';
        const useSslEnv = configService.get<boolean | string>('MINIO_USE_SSL');
        const url = endpoint.startsWith('http') ? new URL(endpoint) : new URL(`http://${endpoint}`);

        const port = Number(configService.get<number>('MINIO_PORT') ?? url.port ?? 9000);
        const useSSL =
          typeof useSslEnv === 'boolean'
            ? useSslEnv
            : useSslEnv
              ? useSslEnv === 'true'
              : url.protocol === 'https:';
        const pathStyleEnv = configService.get<boolean | string>('MINIO_PATH_STYLE');
        const pathStyle = typeof pathStyleEnv === 'boolean' ? pathStyleEnv : pathStyleEnv === 'true';

        return {
          endPoint: url.hostname,
          port,
          useSSL,
          accessKey: configService.get<string>('MINIO_ACCESS_KEY') ?? '',
          secretKey: configService.get<string>('MINIO_SECRET_KEY') ?? '',
          region: configService.get<string>('MINIO_REGION') || undefined,
          pathStyle,
        };
      },
    },
    NestMinioService,
    {
      provide: MINIO_CONNECTION,
      inject: [NestMinioService],
      useFactory: (service: NestMinioService) => service.getMinio(),
    },
  ],
  exports: [NestMinioService, MINIO_CONNECTION],
})
export class MinioModule {}
