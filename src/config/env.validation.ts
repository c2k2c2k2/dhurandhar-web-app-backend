import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
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
  STUDENT_SINGLE_SESSION_ENFORCEMENT: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  STUDENT_SINGLE_SESSION_STRATEGY: Joi.string()
    .valid('FORCE_LOGOUT_EXISTING', 'DENY_NEW_LOGIN')
    .default('FORCE_LOGOUT_EXISTING'),

  SUPERADMIN_EMAIL: Joi.string().email().required(),
  SUPERADMIN_PASSWORD: Joi.string().required(),
  SEED_ON_BOOT: Joi.boolean().truthy('true').falsy('false').optional(),
  SEED_DEFAULT_CATALOG: Joi.boolean().truthy('true').falsy('false').optional(),
  SEED_SAMPLE_DATA: Joi.boolean().truthy('true').falsy('false').optional(),
  DEMO_STUDENT_EMAIL: Joi.string().email().optional(),
  DEMO_STUDENT_PASSWORD: Joi.string().optional(),

  MINIO_ENDPOINT: Joi.string().required(),
  MINIO_PORT: Joi.number().port().default(9000),
  MINIO_ACCESS_KEY: Joi.string().required(),
  MINIO_SECRET_KEY: Joi.string().required(),
  MINIO_BUCKET: Joi.string().required(),
  MINIO_USE_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  MINIO_REGION: Joi.string().allow('', null).optional(),
  MINIO_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(false),
  MINIO_SKIP_BUCKET_CHECK: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  MINIO_DEBUG_ERRORS: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),

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

  PHONEPE_CLIENT_ID: Joi.string().required(),
  PHONEPE_CLIENT_SECRET: Joi.string().required(),
  PHONEPE_CLIENT_VERSION: Joi.number().integer().min(1).default(1),
  PHONEPE_ENV: Joi.string().valid('SANDBOX', 'PRODUCTION').default('SANDBOX'),
  PHONEPE_REDIRECT_URL: Joi.string().uri().required(),
  PHONEPE_PAYMENT_MESSAGE: Joi.string().allow('', null).optional(),
  PHONEPE_DISABLE_PAYMENT_RETRY: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  PHONEPE_PUBLISH_EVENTS: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  PHONEPE_CALLBACK_USERNAME: Joi.string().allow('', null).optional(),
  PHONEPE_CALLBACK_PASSWORD: Joi.string().allow('', null).optional(),
  PHONEPE_WEBHOOK_BASIC_USER: Joi.string().allow('', null).optional(),
  PHONEPE_WEBHOOK_BASIC_PASS: Joi.string().allow('', null).optional(),
  PHONEPE_SUBSCRIPTION_SETUP_FLOW_TYPE: Joi.string().default(
    'SUBSCRIPTION_CHECKOUT_SETUP',
  ),
  PHONEPE_SUBSCRIPTION_TYPE: Joi.string().default('RECURRING'),
  PHONEPE_SUBSCRIPTION_PRODUCT_TYPE: Joi.string().default('UPI_MANDATE'),
  PHONEPE_SUBSCRIPTION_AUTH_WORKFLOW_TYPE: Joi.string().default('TRANSACTION'),
  PHONEPE_SUBSCRIPTION_AMOUNT_TYPE: Joi.string()
    .valid('FIXED', 'VARIABLE')
    .default('FIXED'),
  PHONEPE_SUBSCRIPTION_FREQUENCY: Joi.string().default('ON_DEMAND'),
  PHONEPE_SUBSCRIPTION_REDEMPTION_FLOW_TYPE: Joi.string().default(
    'SUBSCRIPTION_REDEMPTION',
  ),
  PHONEPE_SUBSCRIPTION_RETRY_STRATEGY: Joi.string().default('STANDARD_RETRY'),
  PHONEPE_SUBSCRIPTION_AUTO_DEBIT: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  PHONEPE_SUBSCRIPTION_NOTIFY_BEFORE_EXECUTE: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  PHONEPE_SUBSCRIPTION_MANDATE_VALIDITY_DAYS: Joi.number()
    .integer()
    .min(30)
    .default(3650),

  SUBSCRIPTION_STACKING: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  SUBSCRIPTION_RENEWAL_WINDOW_DAYS: Joi.number().integer().min(0).default(7),
  SUBSCRIPTION_LIFETIME_DAYS: Joi.number().integer().min(365).default(36500),
  PENDING_ORDER_EXPIRE_MINUTES: Joi.number().integer().default(30),
  PAYMENTS_RECONCILE_INTERVAL_SECONDS: Joi.number().integer().default(60),
  PAYMENTS_AUTOPAY_INTERVAL_SECONDS: Joi.number().integer().min(10).default(300),
  PAYMENTS_AUTOPAY_RETRY_MINUTES: Joi.number().integer().min(1).default(60),
  PAYMENTS_AUTOPAY_REMINDER_HOURS: Joi.number().integer().min(1).default(24),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().integer().default(587),
  SMTP_USER: Joi.string().required(),
  SMTP_PASS: Joi.string().required(),
  SMTP_FROM: Joi.string().required(),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),

  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
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
