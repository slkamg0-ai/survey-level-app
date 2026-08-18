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

export interface ManholeMasterItem {
  id: string;
  name: string;      // 맨홀 명칭 (예: MH01, MH02)
  invertEl: string;  // CAD 설계 관저고 (예: -0.430, 10.250)
  remarks?: string;  // 비고 (예: 오수1공구)
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
  len: string;
  dia: string;       // 관경 (m 또는 mm)
  thick: string;     // 관두께 (m)
  sand: string;      // 모래기초 (m)
  conc: string;      // 콘크리트기초 (m)
  aggregate: string; // 골재기초/쇄석 (m)
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

