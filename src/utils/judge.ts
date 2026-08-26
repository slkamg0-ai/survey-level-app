/**
 * 실측 판정 — 야장 표와 점간 현황 그림이 같은 기준으로 판정하도록 여기 하나로 모은다.
 *
 * devM = 실측읽음 − 목표읽음. 읽음값과 표고는 반비례(읽음 = I.H − 표고)라
 * devM > 0(실측이 더 큼)은 그 지점 표고가 목표보다 낮다는 뜻 → 되메움(과굴착),
 * devM < 0 은 표고가 목표보다 높다는 뜻 → 더파기(굴착 부족).
 */
export type JudgeStatus = 'ok' | 'cut' | 'fill' | 'none';

export interface JudgeResult {
  status: JudgeStatus;
  /** 실측읽음 − 목표읽음 (m). 판정 없음이면 null */
  devM: number | null;
  /** |devM| (cm) */
  cm: number | null;
}

const NONE: JudgeResult = { status: 'none', devM: null, cm: null };

export function classifyMeasurement(
  rawMeas: string | undefined,
  target: number | null,
  tol: number
): JudgeResult {
  const measVal = rawMeas === undefined ? NaN : parseFloat(rawMeas);
  if (!rawMeas || !isFinite(measVal) || target === null) return NONE;

  const devM = measVal - target;
  const cm = Math.abs(devM) * 100;

  // 허용오차와 정확히 같은 값이 부동소수점 오차로 부적합이 되지 않게 한다
  // (4.929 - 4.899 = 0.03000000000000025 > 0.03)
  if (Math.abs(devM) <= tol + 1e-9) return { status: 'ok', devM, cm };
  return { status: devM < 0 ? 'cut' : 'fill', devM, cm };
}
