import { ManholeMasterItem, SurveyRoute, RouteSpan } from '../types/survey';
import { parseNum } from './storage';

/**
 * 노선과 구간.
 *
 * 맨홀-맨홀 한 구간만 다루던 구조를 노선(맨홀 순서 목록) 위로 올린다.
 * 연속한 두 맨홀이 한 구간이 되므로, 맨홀 N개를 등록하면 구간 N-1개가 나온다.
 *
 * 연장은 좌표로 계산한 값을 우선 쓴다. 도면 연장표 값이 함께 있으면 대조해서
 * 어긋날 때 경고한다 — 좌표를 잘못 넣었거나 도면이 개정된 경우를 잡기 위해서다.
 */

export const ROUTES_KEY = 'survey_routes_v1';

/** 평면 거리. X·Y 입력 순서가 바뀌어도 같은 값이 나온다 */
export function planeDistance(
  x1: number | null, y1: number | null,
  x2: number | null, y2: number | null
): number | null {
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
  const d = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  return isFinite(d) ? d : null;
}

export function loadRoutes(): SurveyRoute[] {
  try {
    const raw = localStorage.getItem(ROUTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(r => r && typeof r === 'object' && Array.isArray(r.manholeIds))
      .map((r, i) => ({
        id: String(r.id ?? `route-${i + 1}`),
        name: String(r.name ?? `노선 ${i + 1}`),
        manholeIds: r.manholeIds.map((v: unknown) => String(v)),
        updatedAt: String(r.updatedAt ?? '')
      }));
  } catch {
    return [];
  }
}

export function saveRoutes(list: SurveyRoute[]) {
  try {
    localStorage.setItem(ROUTES_KEY, JSON.stringify(list));
  } catch (e) {
    console.error(e);
  }
}

/** 노선을 연속한 맨홀 쌍으로 잘라 구간 목록을 만든다 */
export function buildSpans(route: SurveyRoute | null, manholes: ManholeMasterItem[]): RouteSpan[] {
  if (!route) return [];
  const byId = new Map(manholes.map(m => [m.id, m]));
  const ordered = route.manholeIds
    .map(id => byId.get(id))
    .filter((m): m is ManholeMasterItem => !!m);

  const spans: RouteSpan[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const start = ordered[i];
    const end = ordered[i + 1];
    const coordLength = planeDistance(
      parseNum(start.x), parseNum(start.y),
      parseNum(end.x), parseNum(end.y)
    );
    const sheetLength = parseNum(start.distToNext);
    spans.push({
      index: i,
      start,
      end,
      coordLength,
      sheetLength,
      length: coordLength !== null ? coordLength : sheetLength
    });
  }
  return spans;
}

/** 좌표 계산 연장과 도면 연장표 값의 차이 (둘 다 있을 때만) */
export function lengthDiscrepancy(span: RouteSpan): number | null {
  if (span.coordLength === null || span.sheetLength === null) return null;
  return span.coordLength - span.sheetLength;
}
