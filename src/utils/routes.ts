import { ManholeMasterItem, ManholeSystem, SurveyRoute, RouteSpan, manholeInvertIn, manholeInvertOut } from '../types/survey';
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
        updatedAt: String(r.updatedAt ?? ''),
        pipeDiaMm: Array.isArray(r.pipeDiaMm)
          ? r.pipeDiaMm.map((v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null))
          : undefined
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
      length: coordLength !== null ? coordLength : sheetLength,
      diaMm: route.pipeDiaMm?.[i] ?? null
    });
  }
  return spans;
}

/**
 * 이름으로 맨홀 찾기 (대소문자·앞뒤공백 무시).
 *
 * CAD 쪽 명명 규칙이 시설마다 독립적이라 같은 이름이 다른 시설에도 실제로 존재할 수 있다
 * (예: 우수 M1-128과 오수 M1-128은 서로 다른 맨홀). preferSystem을 주면 그 시설과 일치하는
 * 쪽을 우선 반환하고, 없으면 기존처럼 먼저 찾은 것을 반환한다.
 */
export function findManholeByName(
  list: ManholeMasterItem[],
  name?: string,
  preferSystem?: ManholeSystem
): ManholeMasterItem | null {
  if (!name || !name.trim()) return null;
  const n = name.trim().toUpperCase();
  const matches = list.filter(m => (m.name || '').trim().toUpperCase() === n);
  if (matches.length === 0) return null;
  if (preferSystem) {
    const scoped = matches.find(m => m.system === preferSystem);
    if (scoped) return scoped;
  }
  return matches[0];
}

/** 두 맨홀의 좌표 거리. 한쪽이라도 좌표가 없으면 null */
export function coordDistanceBetween(
  a: ManholeMasterItem | null,
  b: ManholeMasterItem | null
): number | null {
  if (!a || !b) return null;
  return planeDistance(parseNum(a.x), parseNum(a.y), parseNum(b.x), parseNum(b.y));
}

/**
 * 맨홀을 시점/종점으로 지정할 때 연장까지 함께 정한다.
 *
 * 이름과 관저고만 바꾸고 연장을 두면 이전 구간 값이 남아 그 거리로 계산된다.
 * 화면에 숫자가 떠 있으니 사용자는 맞는 값으로 믿게 되므로, 좌표로 계산되면
 * 그 값을 넣고 계산할 수 없으면 비워서 직접 넣도록 드러낸다.
 */
export function applyManholePick<T extends {
  startMhName?: string; endMhName?: string;
  startInv?: string; endInv?: string; endMhOutInv?: string; secName?: string; len?: string;
}>(current: T, type: 'start' | 'end', item: ManholeMasterItem, all: ManholeMasterItem[]): T & { len: string } {
  const next = {
    ...current,
    startMhName: type === 'start' ? item.name : (current.startMhName || ''),
    // 시점 맨홀은 이 구간으로 물이 "나가는" 쪽 — 낙차맨홀이면 유출관저고를 써야 한다
    startInv: type === 'start' ? manholeInvertOut(item) : (current.startInv || ''),
    endMhName: type === 'end' ? item.name : (current.endMhName || ''),
    // 종점 맨홀은 이 구간에서 물이 "들어오는" 쪽 — 유입관저고를 쓴다
    endInv: type === 'end' ? manholeInvertIn(item) : (current.endInv || ''),
    // 종점 맨홀 자신의 구조(터파기·바닥) 측량 기준 — 낙차맨홀이면 유입(endInv)이 아니라
    // 그 맨홀의 유출관저고(더 낮은 값)가 기준이 된다
    endMhOutInv: type === 'end' ? manholeInvertOut(item) : (current.endMhOutInv || '')
  };
  (next as any).secName = `${next.startMhName || '시점'} ~ ${next.endMhName || '종점'}`;

  const d = coordDistanceBetween(
    findManholeByName(all, next.startMhName),
    findManholeByName(all, next.endMhName)
  );
  return { ...next, len: d !== null ? d.toFixed(2) : '' };
}

export interface RouteImportResult {
  routes: SurveyRoute[];
  missingNames: string[];
  dropped: number;
}

/**
 * 노선 파일 가져오기.
 *
 * 종단면도는 각 노선을 이어진 순서대로 그리므로 거기서 뽑은 맨홀 순서를 그대로 받는다.
 * 특히 우수는 이름 연번이 노선 순서가 아니라 손으로 담으면 엉뚱한 구간이 만들어진다.
 *
 * 형식: { "routes": [ { "name": "...", "manholes": ["M1-45","M1-46", ...] } ] }
 * 맨홀은 이름으로 맨홀DB와 맞춘다. DB에 없는 이름은 건너뛰고 몇 개인지 알려준다.
 */
export function parseRouteImport(
  text: string,
  manholes: ManholeMasterItem[],
  importSystem?: ManholeSystem
): RouteImportResult | null {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : parsed && parsed.routes;
  if (!Array.isArray(list)) return null;

  const missing = new Set<string>();
  const routes: SurveyRoute[] = [];
  let dropped = 0;
  const now = new Date();
  const stamp = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  list.forEach((r: any, i: number) => {
    const names: string[] = Array.isArray(r && r.manholes) ? r.manholes.map((v: any) => String(v)) : [];
    // 도면분석 routes.json 의 diametersMm — manholes[i]~manholes[i+1] 구간 관경(mm), 없으면 구간 수 없음
    const srcDia: unknown[] = Array.isArray(r && r.diametersMm) ? r.diametersMm : [];
    const ids: string[] = [];
    const keptOrigIdx: number[] = []; // 살아남은 맨홀의 원래(가져오기 파일 기준) 순번
    names.forEach((n, origIdx) => {
      const item = findManholeByName(manholes, n, importSystem);
      if (item) { ids.push(item.id); keptOrigIdx.push(origIdx); }
      else missing.add(n.trim().toUpperCase());
    });
    // 맨홀이 둘 미만이면 구간이 안 나온다
    if (ids.length < 2) {
      dropped++;
      return;
    }
    // 중간 맨홀이 DB에 없어 건너뛰면 그 자리의 구간 관경은 원래 구간과 더 이상 안 맞으므로 비운다
    const pipeDiaMm: (number | null)[] = [];
    for (let k = 0; k < keptOrigIdx.length - 1; k++) {
      const a = keptOrigIdx[k], b = keptOrigIdx[k + 1];
      const v = b === a + 1 ? srcDia[a] : undefined;
      pipeDiaMm.push(typeof v === 'number' && isFinite(v) ? v : null);
    }
    routes.push({
      id: `route_${now.getTime()}_${i}`,
      name: String((r && r.name) || `노선 ${i + 1}`),
      manholeIds: ids,
      updatedAt: stamp,
      pipeDiaMm: pipeDiaMm.some(v => v !== null) ? pipeDiaMm : undefined
    });
  });

  return { routes, missingNames: Array.from(missing), dropped };
}

/**
 * 노선 구간 문맥을 실제 시·종점과 맞춘다.
 *
 * 노선 측량 중에 맨홀을 따로 고르면 야장은 바뀌는데 routeId/spanIndex 는 그대로 남는다.
 * 그러면 구간 네비게이터가 실제와 다른 구간을 가리키고, 실측값도 그 구간 기록으로
 * 저장돼 나중에 진짜 그 구간을 열었을 때 엉뚱한 값이 들어 있게 된다.
 * 지금 쌍이 노선의 어느 구간과 같으면 그 번호로 맞추고, 아니면 노선에서 벗어난 것으로 본다.
 */
export function reconcileRouteContext<T extends {
  routeId?: string; spanIndex?: number; startMhName?: string; endMhName?: string;
}>(data: T, routes: SurveyRoute[], manholes: ManholeMasterItem[]): T {
  if (!data.routeId) return data;

  const route = routes.find(r => r.id === data.routeId) || null;
  const spans = buildSpans(route, manholes);
  const same = (a?: string, b?: string) =>
    (a || '').trim().toUpperCase() === (b || '').trim().toUpperCase();

  const idx = spans.findIndex(
    sp => same(sp.start.name, data.startMhName) && same(sp.end.name, data.endMhName)
  );

  if (idx >= 0) return { ...data, spanIndex: idx };
  const next = { ...data };
  delete next.routeId;
  delete next.spanIndex;
  return next;
}

/**
 * 연장이 자동 계산되지 않는 이유를 짚는다.
 * 어느 쪽이 문제인지 정확히 지목해야 손을 쓸 수 있으므로 양쪽을 각각 본다.
 */
export function describeLengthGap(
  startName: string | undefined,
  endName: string | undefined,
  all: ManholeMasterItem[]
): string | null {
  const check = (label: string, name?: string): string | null => {
    if (!name || !name.trim()) return `${label} 미지정`;
    const item = findManholeByName(all, name);
    if (!item) return `${label} '${name}' 맨홀DB에 없음`;
    if (parseNum(item.x) === null || parseNum(item.y) === null) return `${label} '${name}' 좌표 없음`;
    return null;
  };

  const reasons = [check('시점', startName), check('종점', endName)].filter(Boolean) as string[];
  return reasons.length ? reasons.join(' · ') : null;
}

/** 좌표 계산 연장과 도면 연장표 값의 차이 (둘 다 있을 때만) */
export function lengthDiscrepancy(span: RouteSpan): number | null {
  if (span.coordLength === null || span.sheetLength === null) return null;
  return span.coordLength - span.sheetLength;
}
