export const INDIAN_PHONE_INPUT_REGEX = /^(?:\+91[\s-]?|91[\s-]?|0)?[6-9]\d{9}$/;

export function normalizeIndianPhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (/^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }

  if (/^0[6-9]\d{9}$/.test(digits)) {
    return `+91${digits.slice(1)}`;
  }

  if (/^91[6-9]\d{9}$/.test(digits)) {
    return `+91${digits.slice(2)}`;
  }

  throw new Error('Invalid Indian phone number');
}

export function getIndianPhoneAliases(value: string) {
  const normalized = normalizeIndianPhone(value);
  const nationalNumber = normalized.slice(3);
  return Array.from(
    new Set([
      normalized,
      nationalNumber,
      `0${nationalNumber}`,
      `91${nationalNumber}`,
    ]),
  );
}
