import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import type { MorningSweep } from './hot-deals';

const TMP_SWEEP = '/tmp/sweep-state.json';

export function getSweepState(): MorningSweep | null {
  try {
    if (existsSync(TMP_SWEEP)) {
      return JSON.parse(readFileSync(TMP_SWEEP, 'utf-8')) as MorningSweep;
    }
  } catch {}
  return null;
}

export function saveSweepState(sweep: MorningSweep): void {
  writeFileSync(TMP_SWEEP, JSON.stringify(sweep, null, 2), 'utf-8');
}

export function clearSweepState(): void {
  try {
    if (existsSync(TMP_SWEEP)) {
      unlinkSync(TMP_SWEEP);
    }
  } catch {}
}
