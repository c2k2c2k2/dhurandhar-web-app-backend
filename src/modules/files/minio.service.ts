import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMinio } from 'nestjs-minio';
import type { Client } from 'minio';
import { inspect } from 'util';

@Injectable()
export class MinioService implements OnModuleInit {
  private static loggedConfig = false;
  private readonly client: Client;
  private readonly bucket: string;
  private readonly debugErrors: boolean;
  private readonly logger = new Logger(MinioService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectMinio() client: Client,
  ) {
    this.bucket =
      this.configService.get<string>('MINIO_BUCKET') ?? 'academy-dev';
    this.client = client;
    const debugEnv = this.configService.get<boolean | string>('MINIO_DEBUG_ERRORS');
    this.debugErrors = typeof debugEnv === 'boolean' ? debugEnv : debugEnv === 'true';
  }

  async onModuleInit(): Promise<void> {
    const skipEnv = this.configService.get<boolean | string>('MINIO_SKIP_BUCKET_CHECK');
    const skipBucketCheck = typeof skipEnv === 'boolean' ? skipEnv : skipEnv === 'true';
    this.logResolvedConfigOnce(skipBucketCheck);
    if (skipBucketCheck) return;

    try {
      // Only a lightweight call to verify creds + connectivity
      await this.client.listBuckets();
      this.logger.log('[MinIO] Connected');
    } catch (e: any) {
      this.logger.error(`[MinIO] init failed (continuing): ${e?.message || e}`);
    }
  }
  // async onModuleInit(): Promise<void> {
  //   const skipBucketCheck = this.configService.get<string>('MINIO_SKIP_BUCKET_CHECK') === 'true';

  //   if (skipBucketCheck) {
  //     return;
  //   }
  //   try {
  //     await this.ensureBucketExists();
  //   } catch (e: any) {
  //     console.error('[MinIO] init failed (app will continue):', e?.message || e);
  //   }
  // }

  async ensureBucketExists() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(
          this.bucket,
          this.configService.get('MINIO_REGION') || 'us-east-1',
        );
      }
    } catch (err: any) {
      // minio SDK uses S3Error with fields like code, message, resource, requestid
      const details = {
        bucket: this.bucket,
        code: err?.code,
        message: err?.message,
        statusCode: err?.statusCode,
        resource: err?.resource,
        requestId: err?.requestid || err?.amzRequestid,
        host: err?.host,
      };
      this.logger.error(`[MinIO] ensureBucketExists failed: ${JSON.stringify(details)}`);
      throw err;
    }
  }

  async getPresignedPutUrl(objectKey: string, expiresInSeconds = 900) {
    try {
      return await this.client.presignedPutObject(
        this.bucket,
        objectKey,
        expiresInSeconds,
      );
    } catch (err: any) {
      throw this.wrapMinioError('MINIO_PRESIGN_PUT_FAILED', err);
    }
  }

  async getPresignedGetUrl(objectKey: string, expiresInSeconds = 900) {
    try {
      return await this.client.presignedGetObject(
        this.bucket,
        objectKey,
        expiresInSeconds,
      );
    } catch (err: any) {
      throw this.wrapMinioError('MINIO_PRESIGN_GET_FAILED', err);
    }
  }

  async statObject(objectKey: string) {
    return this.client.statObject(this.bucket, objectKey);
  }

  async getObjectStream(objectKey: string) {
    return this.client.getObject(this.bucket, objectKey);
  }

  async getPartialObject(objectKey: string, offset: number, length: number) {
    return this.client.getPartialObject(this.bucket, objectKey, offset, length);
  }

  async uploadObject(objectKey: string, buffer: Buffer, contentType?: string) {
    const meta = contentType ? { 'Content-Type': contentType } : undefined;
    try {
      await this.client.putObject(
        this.bucket,
        objectKey,
        buffer,
        buffer.length,
        meta,
      );
    } catch (err: any) {
      if (err?.code === 'NoSuchBucket') {
        try {
          await this.ensureBucketExists();
          await this.client.putObject(
            this.bucket,
            objectKey,
            buffer,
            buffer.length,
            meta,
          );
          return;
        } catch (retryErr: any) {
          throw this.wrapMinioError('MINIO_UPLOAD_FAILED', retryErr);
        }
      }
      throw this.wrapMinioError('MINIO_UPLOAD_FAILED', err);
    }
  }

  getBucketName() {
    return this.bucket;
  }

  async ping() {
    try {
      const bucketExists = await this.client.bucketExists(this.bucket);
      return {
        ok: true,
        bucket: this.bucket,
        bucketExists,
      };
    } catch (err: any) {
      throw this.wrapMinioError('MINIO_PING_FAILED', err);
    }
  }

  private wrapMinioError(code: string, err: any) {
    return new BadRequestException({
      code,
      message: err?.message || 'MinIO request failed.',
      details: {
        bucket: this.bucket,
        code: err?.code,
        statusCode: err?.statusCode,
        resource: err?.resource,
        requestId: err?.requestid || err?.amzRequestid,
        host: err?.host,
        debug: this.debugErrors ? inspect(err, { depth: 4 }) : undefined,
      },
    });
  }

  private logResolvedConfigOnce(skipBucketCheck: boolean) {
    if (MinioService.loggedConfig) return;
    MinioService.loggedConfig = true;

    const endpoint = this.configService.get<string>('MINIO_ENDPOINT') ?? '';
    const url = endpoint.startsWith('http') ? new URL(endpoint) : new URL(`http://${endpoint}`);
    const port = Number(this.configService.get<number>('MINIO_PORT') ?? url.port ?? 9000);
    const useSslEnv = this.configService.get<boolean | string>('MINIO_USE_SSL');
    const useSSL =
      typeof useSslEnv === 'boolean'
        ? useSslEnv
        : useSslEnv
          ? useSslEnv === 'true'
          : url.protocol === 'https:';
    const pathStyleEnv = this.configService.get<boolean | string>('MINIO_PATH_STYLE');
    const pathStyle = typeof pathStyleEnv === 'boolean' ? pathStyleEnv : pathStyleEnv === 'true';
    const region = this.configService.get<string>('MINIO_REGION') || undefined;

    const accessKey = this.configService.get<string>('MINIO_ACCESS_KEY') ?? '';
    const secretKey = this.configService.get<string>('MINIO_SECRET_KEY') ?? '';

    const payload = {
      endpoint,
      port,
      useSSL,
      pathStyle,
      region,
      bucket: this.bucket,
      skipBucketCheck,
      debugErrors: this.debugErrors,
      accessKey: this.redact(accessKey),
      secretKey: this.redact(secretKey),
    };

    this.logger.log(`[MinIO] Resolved config ${JSON.stringify(payload)}`);
  }

  private redact(value: string) {
    if (!value) return undefined;
    if (value.length <= 8) return '***';
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
  }
}
