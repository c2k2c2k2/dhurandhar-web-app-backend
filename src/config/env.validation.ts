import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  APP_NAME: Joi.string().default('CareerPointAcademy'),
  APP_URL: Joi.string().uri().required(),
  FRONTEND_URL: Joi.string().uri().required(),
  ADMIN_FRONTEND_URL: Joi.string().uri().required(),

  DATABASE_URL: Joi.string().required(),

  REDIS_URL: Joi.string().optional(),
  REDIS_HOST: Joi.string().optional(),
  REDIS_PORT: Joi.number().port().optional(),
  REDIS_PASSWORD: Joi.string().allow('', null).optional(),

  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),

  SUPERADMIN_EMAIL: Joi.string().email().required(),
  SUPERADMIN_PASSWORD: Joi.string().required(),

  MINIO_ENDPOINT: Joi.string().required(),
  MINIO_PORT: Joi.number().port().default(9000),
  MINIO_ACCESS_KEY: Joi.string().required(),
  MINIO_SECRET_KEY: Joi.string().required(),
  MINIO_BUCKET: Joi.string().required(),
  MINIO_USE_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  MINIO_REGION: Joi.string().allow('', null).optional(),
  MINIO_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(false),
  MINIO_SKIP_BUCKET_CHECK: Joi.boolean().truthy('true').falsy('false').default(false),
  MINIO_DEBUG_ERRORS: Joi.boolean().truthy('true').falsy('false').default(false),

  MAX_PDF_BYTES: Joi.number().integer().default(52428800),
  MAX_IMAGE_BYTES: Joi.number().integer().default(2097152),

  WATERMARK_SECRET: Joi.string().required(),
  NOTE_VIEW_SESSION_TTL_MINUTES: Joi.number().integer().default(30),
  NOTE_VIEW_MAX_SESSIONS: Joi.number().integer().default(2),
  NOTE_ACCESS_RATE_LIMIT: Joi.number().integer().default(60),
  NOTE_ACCESS_RATE_WINDOW_SECONDS: Joi.number().integer().default(120),

  THROTTLE_TTL_SECONDS: Joi.number().integer().default(60),
  THROTTLE_LIMIT: Joi.number().integer().default(120),
  AUTH_THROTTLE_LIMIT: Joi.number().integer().default(10),
  PAYMENTS_THROTTLE_LIMIT: Joi.number().integer().default(5),
  SEARCH_THROTTLE_LIMIT: Joi.number().integer().default(60),

  PHONEPE_API_BASE_URL: Joi.string().uri().required(),
  PHONEPE_PAY_PATH: Joi.string().required(),
  PHONEPE_STATUS_PATH: Joi.string().required(),
  PHONEPE_MERCHANT_ID: Joi.string().required(),
  PHONEPE_SALT_KEY: Joi.string().required(),
  PHONEPE_SALT_INDEX: Joi.number().integer().required(),
  PHONEPE_CALLBACK_URL: Joi.string().uri().required(),
  PHONEPE_REDIRECT_URL: Joi.string().uri().required(),
  PHONEPE_WEBHOOK_BASIC_USER: Joi.string().allow('', null).optional(),
  PHONEPE_WEBHOOK_BASIC_PASS: Joi.string().allow('', null).optional(),

  SUBSCRIPTION_STACKING: Joi.boolean().truthy('true').falsy('false').default(true),
  PENDING_ORDER_EXPIRE_MINUTES: Joi.number().integer().default(30),
  PAYMENTS_RECONCILE_INTERVAL_SECONDS: Joi.number().integer().default(60),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().integer().default(587),
  SMTP_USER: Joi.string().required(),
  SMTP_PASS: Joi.string().required(),
  SMTP_FROM: Joi.string().required(),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),

  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent').default('info'),
  LOG_NOTE_ACCESS_SAMPLE_RATE: Joi.number().min(0).max(1).default(0.3),

  ENABLE_PG_TRGM: Joi.boolean().truthy('true').falsy('false').default(true),

  CMS_PUBLIC_KEYS: Joi.string().allow('', null).optional(),
  CMS_STUDENT_KEYS: Joi.string().allow('', null).optional(),

  PRINT_WORKER_CONCURRENCY: Joi.number().integer().default(1),
  PRINT_MAX_QUESTIONS: Joi.number().integer().default(200),
  PRINT_MAX_EMBEDDED_IMAGE_BYTES: Joi.number().integer().default(20971520),
  PRINT_FAKE_PDF: Joi.boolean().truthy('true').falsy('false').default(false),

  REQUEST_ID_HEADER: Joi.string().default('X-Request-Id'),
  BODY_SIZE_LIMIT: Joi.string().default('5mb'),
}).unknown(true);
