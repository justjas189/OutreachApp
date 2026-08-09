export const EMAIL_BATCH_SIZE_MIN = 1;
export const EMAIL_BATCH_SIZE_MAX = 50;
export const EMAIL_BATCH_SIZE_DEFAULT = 5;
export const LIVE_BATCH_CONFIRMATION_DELTA = 5;

export function isHighImpactLiveBatchIncrease(current: number, next: number): boolean {
  return next >= current + LIVE_BATCH_CONFIRMATION_DELTA;
}
