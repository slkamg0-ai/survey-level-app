/**
 * 저장데이터 방어 유틸
 *
 * 저장키를 유지한 채 필드를 추가하면, 그 이전에 저장된 데이터에는 신규 필드가 없다.
 * 병합 없이 JSON.parse 결과를 그대로 상태로 쓰면 신규 필드가 undefined가 되고
 * 계산 중 undefined.replace() 같은 호출에서 앱 전체가 죽는다.
 * 죽은 데이터는 localStorage에 그대로 남아 재실행해도 계속 죽으므로 반드시 병합해서 읽는다.
 */

/** null/undefined 값은 버리고 기본값 위에 덮어쓴다 */
export function mergeWithDefaults<T extends object>(defaults: T, raw: unknown): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...defaults };

  const merged: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  Object.keys(raw as Record<string, unknown>).forEach(key => {
    const value = (raw as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) merged[key] = value;
  });

  return merged as T;
}

/** 파싱 실패나 손상된 값에도 절대 던지지 않는 localStorage 읽기 */
export function readStored<T extends object>(key: string, defaults: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return { ...defaults };
    return mergeWithDefaults(defaults, JSON.parse(saved));
  } catch {
    return { ...defaults };
  }
}

/** 문자열이 아닌 값(undefined, 숫자, 손상된 값)이 들어와도 던지지 않는 수치 파싱 */
export function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const parsed = parseFloat(v.replace(/[^0-9.+-]/g, ''));
  return isFinite(parsed) ? parsed : null;
}
