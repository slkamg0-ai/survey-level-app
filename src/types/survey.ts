export type PipeType = 'PP_DOUBLE' | 'STORMWATER' | 'CUSTOM';

export interface PipeSpec {
  diameterMm: number; // 관경 (mm)
  diameterM: number;  // 관경 (m)
  thicknessM: number; // 관두께 (m)
  thicknessMm: number;// 관두께 (mm)
  outerDiameterMm?: number; // 관외경 / 기초폭 (mm)
}

export type TrenchMode = 'tbm' | 'direct';

export interface TrenchRow {
  x: number;          // 체인 / 누가거리 (m)
  seg: number;        // 구간 거리 (m)
  cutEl: number;      // 터파기고 EL (m)
  invEl: number;      // 관저고 EL (m)
  topEl: number | null; // 관상단고 EL (m)
  target: number | null; // 목표 읽음 (m)
  node: 'start' | 'end' | '';
}

export interface ManholePhotoGPS {
  photoUrl?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  timestamp?: string;
}

export type TargetHeightMode =
  | 'CUT_BOTTOM'    // 1. 관로 터파기 바닥고
  | 'AGGREGATE_TOP' // 2. 관로 골재 포설고
  | 'CONCRETE_TOP'  // 3. 관로 레미콘 타설고
  | 'SAND_TOP'      // 4. 관로 모래 포설고
  | 'INVERT'        // 5. 관저고 (Invert EL)
  | 'CROWN'         // 6. 관상단고 (Pipe Crown EL)
  | 'MH_CUT'        // 맨홀 1. 터파기 바닥고
  | 'MH_AGGREGATE'  // 맨홀 2. 골재 포설고
  | 'MH_CONCRETE'   // 맨홀 3. 레미콘 타설고
  | 'MH_INVERT'     // 맨홀 4. 내부 바닥고
  | 'CUSTOM';       // 검측용/사용자지정고 (Custom Offset)

/**
 * 3방·4방 합류(분기) 맨홀에서, 시점·종점 한 쌍으로 못 담는 "그 외" 연결관 하나.
 * 예: M2-91처럼 유입이 여러 갈래이거나, 야장의 시점/종점 흐름과 별도로
 * 추가로 들고 나는 관이 있는 합류 맨홀을 표시하기 위한 것이다.
 */
export interface ManholeBranch {
  name: string;        // 연결된 맨홀명(예: M2-91-1) 또는 방향 설명
  dir: 'in' | 'out';    // 유입 / 유출
  invertEl: string;     // 그 관 자체의 관저고(EL)
  dia?: string;         // 관경(mm, 선택)
}

export interface ManholeMasterItem {
  id: string;
  name: string;      // 맨홀 명칭 (예: MH01, MH02)
  invertEl: string;  // CAD 설계 관저고 — 유입측 (예: -0.430, 10.250)
  /**
   * 유출측 관저고. 낙차맨홀(유입관저고 ≠ 유출관저고)일 때만 입력한다.
   * 비어 있으면 일반 맨홀로 보고 invertEl을 유출측에도 그대로 쓴다.
   * 지선 합류 등으로 맨홀 내부에서 관저고가 꺾이는 경우를 담기 위한 필드 —
   * manholeInvertIn/manholeInvertOut로 읽고, 직접 이 값을 읽지 않는다.
   */
  invertElOut?: string;
  remarks?: string;  // 비고 (예: 오수1공구)
  /**
   * CAD 평면 좌표 (m). 거리 계산은 √(Δ²+Δ²) 이라 X·Y 입력 순서가 바뀌어도
   * 결과가 같으므로 도면 표기(N,E 또는 E,N) 그대로 넣어도 된다.
   */
  x?: string;
  y?: string;
  /** 도면 연장표상 다음 맨홀까지 거리 (m). 좌표 계산값과 대조하는 검산용 */
  distToNext?: string;
  /** 3방 이상 합류 맨홀의 추가 연결관 목록 — 없으면 일반(2방) 맨홀 */
  branches?: ManholeBranch[];
}

const BRANCH_SEP = ';';
const BRANCH_FIELD_SEP = ':';

/** 분기 목록을 CSV 한 칸에 담을 문자열로 직렬화한다: "이름:in|out:관저고:관경;..." */
export function encodeBranches(branches?: ManholeBranch[]): string {
  if (!branches || branches.length === 0) return '';
  return branches
    .filter(b => b.name.trim() && isFinite(parseFloat(b.invertEl)))
    .map(b => [b.name.trim(), b.dir === 'out' ? 'out' : 'in', b.invertEl.trim(), (b.dia || '').trim()].join(BRANCH_FIELD_SEP))
    .join(BRANCH_SEP);
}

/** encodeBranches의 역변환. 형식에 안 맞는 토큰은 조용히 건너뛴다. */
export function decodeBranches(raw?: string): ManholeBranch[] | undefined {
  if (!raw || !raw.trim()) return undefined;
  const out: ManholeBranch[] = [];
  raw.split(BRANCH_SEP).forEach(token => {
    const t = token.trim();
    if (!t) return;
    const parts = t.split(BRANCH_FIELD_SEP);
    const name = (parts[0] || '').trim();
    const invertEl = (parts[2] || '').trim();
    if (!name || !isFinite(parseFloat(invertEl))) return;
    out.push({
      name,
      dir: (parts[1] || '').trim() === 'out' ? 'out' : 'in',
      invertEl,
      dia: (parts[3] || '').trim() || undefined
    });
  });
  return out.length ? out : undefined;
}

/** 3방 이상 합류 맨홀인지 — 시점/종점 한 쌍 외에 추가 연결관이 있는지 */
export function manholeIsJunction(item: ManholeMasterItem): boolean {
  return !!(item.branches && item.branches.length > 0);
}

/** 맨홀로 흘러 들어오는 쪽(상류 구간의 종점)에서 쓸 관저고 */
export function manholeInvertIn(item: ManholeMasterItem): string {
  return item.invertEl;
}

/**
 * 맨홀에서 흘러 나가는 쪽(하류 구간의 시점)에서 쓸 관저고.
 * invertElOut이 비어 있으면 낙차 없는 일반 맨홀이므로 invertEl을 그대로 쓴다.
 */
export function manholeInvertOut(item: ManholeMasterItem): string {
  return item.invertElOut && item.invertElOut.trim() ? item.invertElOut.trim() : item.invertEl;
}

/**
 * 유입-유출 관저고 차이(낙차, m). 부호는 (유출 - 유입) — 음수면 유출측이 더 깊다는 뜻.
 * invertElOut이 없거나 두 값이 사실상 같으면(0.5mm 이내) 낙차맨홀이 아니므로 null.
 */
export function manholeDropM(item: ManholeMasterItem): number | null {
  if (!item.invertElOut || !item.invertElOut.trim()) return null;
  const a = parseFloat(item.invertEl);
  const b = parseFloat(item.invertElOut);
  if (!isFinite(a) || !isFinite(b)) return null;
  const d = b - a;
  return Math.abs(d) > 0.0005 ? d : null;
}

/** 노선 — 맨홀을 상류에서 하류 순서대로 담는다. 연속한 두 맨홀이 한 구간이 된다 */
export interface SurveyRoute {
  id: string;
  name: string;
  manholeIds: string[];
  updatedAt: string;
}

/** 노선에서 파생된 한 구간 */
export interface RouteSpan {
  index: number;
  start: ManholeMasterItem;
  end: ManholeMasterItem;
  /** 좌표로 계산한 거리 (좌표가 없으면 null) */
  coordLength: number | null;
  /** 도면 연장표에 적힌 거리 (없으면 null) */
  sheetLength: number | null;
  /** 실제로 쓸 연장 — 좌표값 우선, 없으면 도면값 */
  length: number | null;
}

export interface TrenchSurveyData {
  mode: TrenchMode;
  tbmEl: string;
  bs: string;
  ihDirect: string;
  pipeType: PipeType;
  secName: string;
  startMhName?: string; // 시점 맨홀명 (예: MH01)
  endMhName?: string;   // 종점 맨홀명 (예: MH02)
  startInv: string;
  endInv: string;
  /**
   * 종점 맨홀 "자신"의 유출관저고(다음 구간으로 나가는 값).
   * endInv는 이 구간으로 들어오는 유입관저고라 낙차맨홀이면 그 맨홀의 실제
   * 터파기/바닥 기준(더 낮은 유출값)과 다르다 — 맨홀 자체 측량(MH_* 모드)에서만 쓴다.
   * 비어 있으면 endInv를 그대로 기준으로 쓴다(낙차 없는 일반 맨홀과 동일).
   */
  endMhOutInv?: string;
  len: string;
  dia: string;       // 관경 (m 또는 mm)
  thick: string;     // 관두께 (m)
  sand: string;      // 모래기초 (m)
  conc: string;      // 콘크리트기초 (m)
  aggregate: string; // 골재기초/쇄석 (m)
  mhBase?: string;   // 맨홀 바닥 슬래브 두께 (m, 기본 0.200m = 20cm)
  tol: string;       // 허용오차 (mm)
  step: number;      // 측점간격 (m)
  surveyor: string;
  mdate: string;
  meas: Record<string, string>; // 실측 읽음 { "0": "1.234" }
  mhStartPhoto?: ManholePhotoGPS;
  mhEndPhoto?: ManholePhotoGPS;
  gpsDistanceM?: number;
  targetHeightMode?: TargetHeightMode; // 하이브리드 검측 높이 모드
  customOffsetM?: string;             // 검측용 사용자 지정 오프셋 (m)
  specConfirmedSignature?: string;    // 확정 당시의 기초 제원 지문
  specConfirmedAt?: string;           // 기초 제원 확정 시각 (ISO)
  routeId?: string;                   // 다구간 측량 중인 노선
  spanIndex?: number;                 // 노선 내 현재 구간 번호 (0부터)
}

/**
 * 기초 제원 지문.
 * 층 두께가 하나라도 바뀌면 값이 달라져 "미확정" 상태로 되돌아간다.
 * 현장이 바뀌었는데 이전 현장의 기초 두께로 그대로 측량하는 사고를 막는 장치다.
 */
export function foundationSignature(d: {
  thick?: string; sand?: string; conc?: string; aggregate?: string; mhBase?: string; dia?: string;
}): string {
  return [d.dia, d.thick, d.sand, d.conc, d.aggregate, d.mhBase]
    .map(v => (v === undefined || v === null ? '' : String(v).trim()))
    .join('|');
}

export interface SavedJobSession {
  id: string;
  name: string;
  tab: 'trench' | 'standard';
  updatedAt: string;
  trenchData?: TrenchSurveyData;
  standardData?: StandardSurveyData;
}

export type StandardMethod = 'ih' | 'rise_fall';

export interface StandardRow {
  id: string;
  point: string;      // 측점명 (BM1, TP1, +10 등)
  bs: string;         // 후시 BS (m)
  is: string;         // 중시 IS (m)
  fs: string;         // 전시 FS (m)
  ih?: number | null; // 기계고 IH (m)
  rise?: number | null; // 승 (m)
  fall?: number | null; // 강 (m)
  gh?: number | null; // 표고/지반고 GH (m)
  remarks: string;    // 비고
}

export interface StandardSurveyData {
  method: StandardMethod;
  startBm: string;    // 시점 표고 (m)
  endBm: string;      // 검산용 종점 알려진 표고 (선택)
  title: string;      // 사업/노선명
  surveyor: string;   // 측량자
  mdate: string;      // 일자
  rows: StandardRow[];
}

/**
 * 맨홀명, 숫자, 비고 기반 유연 검색 헬퍼 함수
 * 예: '1' 또는 '01' 입력시 'MH01', 'MH1', 'MH-01' 등 유연 매칭
 */
export function matchManholeByNameOrNumber(searchTerm: string, mhName: string, remarks?: string): boolean {
  if (!searchTerm.trim()) return true;
  const term = searchTerm.trim().toLowerCase();
  const targetName = mhName.toLowerCase();
  const targetRemarks = (remarks || '').toLowerCase();

  // 1. 단순 문자열/비고 포함 여부
  if (targetName.includes(term) || targetRemarks.includes(term)) {
    return true;
  }

  // 2. 숫자(Digits) 추출 비교
  const termDigits = term.replace(/\D/g, '');
  const targetDigits = targetName.replace(/\D/g, '');

  if (termDigits.length > 0 && targetDigits.length > 0) {
    const termInt = parseInt(termDigits, 10);
    const targetInt = parseInt(targetDigits, 10);

    if (!isNaN(termInt) && !isNaN(targetInt)) {
      if (termInt === targetInt) return true;
      if (targetDigits.includes(termDigits)) return true;
    }
  }

  return false;
}

