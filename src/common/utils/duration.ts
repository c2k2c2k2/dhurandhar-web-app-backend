import ms = require('ms');
import type { StringValue } from 'ms';

export function parseDurationToSeconds(
  value: string | undefined,
  fallbackSeconds: number,
): number {
  if (!value) {
    return fallbackSeconds;
  }

  if (/^\\d+$/.test(value)) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return Math.floor(asNumber);
    }
  }

  const parsedMs = ms(value as StringValue);
  if (typeof parsedMs === 'number' && parsedMs > 0) {
    return Math.max(1, Math.floor(parsedMs / 1000));
  }

  return fallbackSeconds;
}
