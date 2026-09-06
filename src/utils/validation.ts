import { TrenchSurveyData, TargetHeightMode, foundationSignature } from '../types/survey';

/**
 * 현장 오입력 경고 규칙.
 *
 * 이 앱의 계산은 입력값이 맞다는 전제 위에서만 옳다. 기초 두께는 현장마다 다른데
 * 접힌 설정 패널 안에 있어 측량 중에는 보이지 않았고, 이전 현장 값이 그대로 남아
 * 잘못된 목표고로 측량이 진행되는 사고가 있었다. 그래서 "조용히 틀리는" 조건을
 * 전부 규칙으로 만들어 화면 위로 끌어올린다.
 */

export type WarnLevel = 'danger' | 'warn';

export interface SurveyWarning {
  id: string;
  level: WarnLevel;
  title: string;
  detail: string;
}

export interface ComputedLike {
  ih: number | null;
  si: number | null;
  ei: number | null;
  L: number | null;
  dia: number | null;
  t: number;
  sand: number;
  conc: number;
  agg: number;
  mhBase: number;
  drop: number;
  rows: { invEl: number }[];
  /** 시·종점 맨홀 좌표로 계산한 연장 (좌표가 없으면 null) */
  coordLength?: number | null;
}

/** 검측 모드가 어느 층의 두께에 의존하는지 */
const MODE_REQUIRES: Partial<Record<TargetHeightMode, { key: 'sand' | 'conc' | 'agg' | 'mhBase'; label: string }>> = {
  SAND_TOP: { key: 'sand', label: '모래기초' },
  CONCRETE_TOP: { key: 'conc', label: '콘크리트기초' },
  AGGREGATE_TOP: { key: 'agg', label: '골재/잡석' },
  MH_AGGREGATE: { key: 'agg', label: '골재/잡석' },
  MH_CONCRETE: { key: 'conc', label: '콘크리트기초' },
  MH_INVERT: { key: 'mhBase', label: '맨홀 바닥두께' }
};

export function isSpecConfirmed(data: TrenchSurveyData): boolean {
  if (!data.specConfirmedSignature) return false;
  return data.specConfirmedSignature === foundationSignature(data);
}

export function buildWarnings(data: TrenchSurveyData, c: ComputedLike): SurveyWarning[] {
  const w: SurveyWarning[] = [];
  const mode = data.targetHeightMode || 'CUT_BOTTOM';
  const isMh = mode.startsWith('MH_');
  const layerTotal = c.sand + c.conc + c.agg;

  // 1. 기초 제원 확정 여부 — 현장이 바뀌면 반드시 다시 확인시킨다
  if (!isSpecConfirmed(data)) {
    w.push({
      id: 'spec-unconfirmed',
      level: 'danger',
      title: '기초 제원이 확정되지 않았습니다',
      detail: `현재 값으로 계산 중입니다 — 모래 ${c.sand.toFixed(3)} · 콘크리트 ${c.conc.toFixed(3)} · 골재 ${c.agg.toFixed(3)} · 관두께 ${c.t.toFixed(3)} m. 도면과 대조한 뒤 아래에서 확정하세요.`
    });
  }

  // 2. 선택한 검측 기준이 두께 0인 층을 가리키는 경우
  const need = MODE_REQUIRES[mode];
  if (need) {
    const value = need.key === 'sand' ? c.sand : need.key === 'conc' ? c.conc : need.key === 'agg' ? c.agg : c.mhBase;
    if (value <= 0) {
      w.push({
        id: 'layer-zero',
        level: 'danger',
        title: `${need.label} 두께가 0인데 그 층을 검측 중입니다`,
        detail: `${need.label}가 0.000 m이면 이 층은 존재하지 않아 목표고가 바로 아래(또는 위) 층과 같아집니다. 두께를 넣거나 검측 기준을 바꾸세요.`
      });
    }
  }

  // 3. 모래·콘크리트·골재 3층 동시 적용 (연약지반 복합기초 안내)
  if (!isMh && c.sand > 0 && c.conc > 0 && c.agg > 0) {
    w.push({
      id: 'three-layers',
      level: 'warn',
      title: '연약지반 복합기초(골재+콘크리트+모래) 적용 중',
      detail: `터파기 바닥이 관저고보다 ${(c.t + layerTotal).toFixed(3)} m 아래로 내려갑니다 (모래 ${c.sand.toFixed(3)}m + 콘크리트 ${c.conc.toFixed(3)}m + 골재 ${c.agg.toFixed(3)}m). 일반 단일기초 현장이라면 쓰지 않는 층을 0으로 두세요.`
    });
  }

  // 4. 기초 두께 총합이 상식 범위를 벗어난 경우
  if (!isMh && layerTotal > 0.8) {
    w.push({
      id: 'base-too-thick',
      level: 'warn',
      title: `기초 총두께가 ${layerTotal.toFixed(3)} m입니다`,
      detail: '관두께를 제외한 기초층 합이 0.8 m을 넘습니다. 단위(m/mm)를 잘못 넣지 않았는지 확인하세요.'
    });
  }
  if (!isMh && layerTotal === 0 && mode === 'CUT_BOTTOM') {
    w.push({
      id: 'base-zero',
      level: 'warn',
      title: '기초층 두께가 모두 0입니다',
      detail: '터파기 바닥고가 관 외저면과 같아집니다. 기초가 없는 현장이 맞는지 확인하세요.'
    });
  }

  // 5. 단위 오입력 (mm 값을 m 칸에 넣는 사고)
  if (c.dia !== null && c.dia > 3) {
    w.push({
      id: 'dia-unit',
      level: 'danger',
      title: `관경이 ${c.dia} 입니다 — 단위를 확인하세요`,
      detail: '관경은 m 단위로 입력합니다. 300mm는 0.300으로 넣어야 합니다.'
    });
  }
  if (c.t > 0.3) {
    w.push({
      id: 'thick-unit',
      level: 'warn',
      title: `관두께가 ${c.t.toFixed(3)} m입니다`,
      detail: '관두께는 m 단위입니다. 19mm는 0.019입니다.'
    });
  }

  // 6. 기계고 미입력 — 목표읽음이 나오지 않는다
  if (c.ih === null) {
    w.push({
      id: 'no-ih',
      level: 'danger',
      title: '기계고(I.H)가 입력되지 않았습니다',
      detail: 'TBM 표고와 후시를 넣거나 기계고를 직접 입력해야 목표읽음이 계산됩니다.'
    });
  }

  // 7. (삭제) 종점 관저고 역산 검산
  //
  // invEl(L) = si − ((si−ei)/L)·L = ei 라 항상 일치하는 항등식이었다.
  // 종점에 99.999 를 넣어도 ✓ 가 떠서 검증된 것처럼 보였을 뿐, 아무것도 걸러내지 못했다.
  // 실제 대조가 가능한 것은 연장(좌표 거리·도면 연장)뿐이라 8-1 규칙으로 대체했다.

  // 8. 구배 이상
  if (c.L !== null && c.L > 0 && c.si !== null && c.ei !== null) {
    const permil = Math.abs(c.drop / c.L) * 1000;
    if (permil === 0) {
      w.push({
        id: 'slope-zero',
        level: 'warn',
        title: '구배가 0입니다 (수평)',
        detail: '시점과 종점 관저고가 같습니다. 관저고를 잘못 넣지 않았는지 확인하세요.'
      });
    } else if (permil > 100) {
      w.push({
        id: 'slope-steep',
        level: 'warn',
        title: `구배가 ${permil.toFixed(1)}‰ 로 과대합니다`,
        detail: '관저고 또는 연장 입력을 확인하세요. 일반 오수관 구배는 수‰ 수준입니다.'
      });
    }
  }

  // 8-1. 입력된 연장이 맨홀 좌표 거리와 다른 경우.
  //      맨홀만 바꾸고 연장이 이전 구간 값으로 남으면 화면에 숫자가 떠 있어
  //      맞는 값처럼 보이는 채로 전 측점의 목표고가 틀어진다.
  if (c.coordLength !== null && c.coordLength !== undefined && c.L !== null && c.L > 0) {
    const gap = c.L - c.coordLength;
    if (Math.abs(gap) > 0.5) {
      w.push({
        id: 'len-vs-coord',
        level: 'danger',
        title: `연장이 맨홀 좌표 거리와 ${Math.abs(gap).toFixed(2)} m 다릅니다`,
        detail: `입력된 연장 ${c.L.toFixed(2)} m, 두 맨홀 좌표 거리 ${c.coordLength.toFixed(2)} m. 다른 구간의 연장이 남아 있지 않은지 확인하세요.`
      });
    }
  }

  // 9. 연장 이상
  if (c.L === null || c.L <= 0) {
    w.push({
      id: 'len-missing',
      level: 'danger',
      title: '연장이 입력되지 않았습니다',
      detail: c.coordLength !== null && c.coordLength !== undefined
        ? `맨홀 좌표로는 ${c.coordLength.toFixed(2)} m입니다. 연장칸에 넣으세요.`
        : '시·종점 맨홀에 좌표가 없어 자동 계산되지 않습니다. 도면 연장을 직접 넣으세요.'
    });
  } else {
    if (c.L > 500) {
      w.push({
        id: 'len-long',
        level: 'warn',
        title: `연장이 ${c.L} m입니다`,
        detail: '맨홀 간 연장으로는 과대합니다. 구간을 나눠 입력했는지 확인하세요.'
      });
    }
  }

  // 10. 허용오차 이상
  const tolMm = parseFloat(data.tol);
  if (isFinite(tolMm)) {
    if (tolMm <= 0) {
      w.push({
        id: 'tol-zero',
        level: 'warn',
        title: '허용오차가 0입니다',
        detail: '모든 실측값이 부적합으로 판정됩니다.'
      });
    } else if (tolMm > 100) {
      w.push({
        id: 'tol-loose',
        level: 'warn',
        title: `허용오차가 ±${tolMm} mm입니다`,
        detail: '0.100m(100mm)를 넘는 허용오차는 검측 의미가 없습니다.'
      });
    }
  }

  // 11. 맨홀 바닥두께 0 — 맨홀은 바닥슬래브 상단이 곧 맨홀 바닥고(관저고)라
  //     두께가 0이면 레미콘 타설고가 바닥고와 같아지고 터파기 바닥도 그만큼 얕아진다
  if (isMh && c.mhBase <= 0) {
    w.push({
      id: 'mhbase-zero',
      level: 'danger',
      title: '맨홀 바닥두께가 0입니다',
      detail: '맨홀 바닥슬래브 상단이 맨홀 바닥고(관저고)입니다. 두께가 0이면 레미콘 타설고가 바닥고와 같아지고 터파기 바닥도 그만큼 얕게 나옵니다. 보통 0.200 m입니다.'
    });
  }

  // 12. 맨홀 모드에서 관로 전용 제원(모래기초·관두께)은 계산에 쓰이지 않는다
  if (isMh && c.sand > 0) {
    w.push({
      id: 'mh-sand-ignored',
      level: 'warn',
      title: '맨홀 검측에서는 모래기초가 계산에 쓰이지 않습니다',
      detail: `맨홀은 터파기 바닥 → 골재 → 콘크리트 → 맨홀 바닥슬래브 순으로 쌓입니다. 입력된 모래기초 ${c.sand.toFixed(3)} m는 관로 검측에만 반영됩니다.`
    });
  }

  return w;
}
