const normalizeRuntimeToken = (value: string | undefined) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const PRINT_QUEUE_BASE_NAME = 'print-jobs';
export const PRINT_RUNTIME_ENV =
  normalizeRuntimeToken(process.env.NODE_ENV) || 'development';
export const PRINT_QUEUE_NAME =
  PRINT_RUNTIME_ENV === 'production'
    ? PRINT_QUEUE_BASE_NAME
    : `${PRINT_QUEUE_BASE_NAME}-${PRINT_RUNTIME_ENV}`;
export const PRINT_QUEUE_IS_SHARED =
  PRINT_QUEUE_NAME === PRINT_QUEUE_BASE_NAME;
