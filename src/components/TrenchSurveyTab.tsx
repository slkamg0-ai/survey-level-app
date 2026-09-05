import React, { useState, useEffect } from 'react';
import { TrenchSurveyData, TrenchRow, PipeType, ManholePhotoGPS, matchManholeByNameOrNumber, foundationSignature, manholeInvertIn, manholeInvertOut, manholeDropM } from '../types/survey';
import { buildWarnings, isSpecConfirmed } from '../utils/validation';
import { classifyMeasurement } from '../utils/judge';
import { TrenchProfileChart } from './TrenchProfileChart';
import { SpecGuard, LayerRow } from './SpecGuard';
import { JunctionDiagram } from './JunctionDiagram';
import { loadRoutes, buildSpans, findManholeByName, coordDistanceBetween } from '../utils/routes';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PP_DOUBLE_SPECS, STORMWATER_SPECS, findPipeThickness } from '../data/pipeSpecs';
import { Download, Copy, RefreshCw, RotateCcw, FileSpreadsheet, Check, AlertCircle, Camera, MapPin, Sparkles, Database, Search } from 'lucide-react';
import { getSavedManholes } from './ManholeDbModal';
import { mergeWithDefaults, readStored, parseNum } from '../utils/storage';

interface Props {
  onUpdateHeader: (secName: string, ihVal: string, ihSub: string) => void;
  onToast: (msg: string) => void;
  loadedData?: TrenchSurveyData | null;
  onClearLoadedData?: () => void;
}

const STORAGE_KEY = 'survey_trench_data_v2';

const MODE_LABELS: Record<string, string> = {
  CUT_BOTTOM: '관로 터파기 바닥고',
  AGGREGATE_TOP: '관로 골재 포설고',
  CONCRETE_TOP: '관로 레미콘 타설고',
  SAND_TOP: '관로 모래 포설고',
  INVERT: '관저고',
  CROWN: '관상단고',
  MH_CUT: '맨홀 터파기 바닥고',
  MH_AGGREGATE: '맨홀 골재 포설고',
  MH_CONCRETE: '맨홀 레미콘 타설고',
  MH_INVERT: '맨홀 내부 바닥고',
  CUSTOM: '사용자 지정고'
};

const DEFAULT_DATA: TrenchSurveyData = {
  mode: 'tbm',
  tbmEl: '3.000',
  bs: '1.100',
  ihDirect: '',
  pipeType: 'PP_DOUBLE',
  secName: 'MH01 ~ MH02',
  startMhName: 'MH01',
  endMhName: 'MH02',
  startInv: '-0.430',
  endInv: '-0.190',
  len: '75',
  dia: '0.300',
  thick: '0.019',
  sand: '0.100',
  conc: '0.100',
  aggregate: '0.150',
  mhBase: '0.200',
  tol: '30',
  step: 5,
  surveyor: '홍길동',
  mdate: new Date().toISOString().split('T')[0],
  meas: {},
  targetHeightMode: 'CUT_BOTTOM'
};

/**
 * 실측값 저장 키.
 *
 * 측점 거리만으로 키를 잡으면 검측 기준을 바꿔도 같은 칸을 공유해,
 * 터파기 검측값이 레미콘 검측 목표와 비교되어 오판정이 난다.
 * 현장은 터파기 → 골재 → 레미콘 → 바닥 순으로 같은 지점을 여러 번 재므로
 * 기준별로 따로 남겨야 공정별 검측 이력이 보존된다.
 */
const measKey = (spanKey: string, mode: string, x: number | string) => `${spanKey}|${mode}@${x}`;

/** 노선 구간을 구분하는 키. 단일 구간 측량은 'single' */
const spanKeyOf = (d: TrenchSurveyData) =>
  d.routeId && d.spanIndex !== undefined ? `${d.routeId}#${d.spanIndex}` : 'single';

/** 저장·불러오기로 들어온 데이터를 항상 기본값과 병합하고 타입을 정리한다 */
const normalize = (raw: unknown): TrenchSurveyData => {
  const merged = mergeWithDefaults(DEFAULT_DATA, raw);
  if (!merged.meas || typeof merged.meas !== 'object') merged.meas = {};

  // 구버전 실측값 키 승격:
  //   "0"            → 거리만 (기준·구간 없음)
  //   "MODE@0"       → 기준까지만
  //   "span|MODE@0"  → 현재 형식
  const legacyMode = merged.targetHeightMode || 'CUT_BOTTOM';
  const legacySpan = merged.routeId && merged.spanIndex !== undefined
    ? `${merged.routeId}#${merged.spanIndex}` : 'single';
  const migrated: Record<string, string> = {};
  Object.keys(merged.meas).forEach(k => {
    let key = k;
    if (key.indexOf('@') < 0) key = `${legacyMode}@${key}`;
    if (key.indexOf('|') < 0) key = `${legacySpan}|${key}`;
    migrated[key] = merged.meas[k];
  });
  merged.meas = migrated;
  // 구버전 저장분에는 step이 문자열로 남아 있을 수 있다 (문자열이면 누가거리 누적이 문자열 연결로 깨진다)
  const step = Number(merged.step);
  merged.step = isFinite(step) && step > 0 ? step : 5;
  return merged;
};

export const TrenchSurveyTab: React.FC<Props> = ({ onUpdateHeader, onToast, loadedData, onClearLoadedData }) => {
  const [data, setData] = useState<TrenchSurveyData>(() =>
    normalize(readStored(STORAGE_KEY, DEFAULT_DATA))
  );

  const [openDetail, setOpenDetail] = useState<Record<string, boolean>>({});
  // 맨홀(MH) 검측 모드에서 층 구성 다이어그램/게이지가 시점·종점 중 어느 맨홀 기준인지 —
  // 예전엔 시점 관저고로 고정돼 종점 맨홀은 선택도, 자동 전환도 안 됐다.
  const [diagramNode, setDiagramNode] = useState<'start' | 'end'>('start');
  // 구간(시점·종점 맨홀 쌍)이 바뀌면 이전 구간에서 골라둔 '종점' 선택이 새 구간까지
  // 따라오지 않도록 시점으로 되돌린다.
  useEffect(() => {
    setDiagramNode('start');
  }, [data.startMhName, data.endMhName]);
  const [armReset, setArmReset] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // 맨홀 검색 자동완성 팝업 상태
  const [showStartMhPopup, setShowStartMhPopup] = useState(false);
  const [showEndMhPopup, setShowEndMhPopup] = useState(false);

  useEffect(() => {
    const handleStorageChange = () => {
      if (localStorage.getItem(STORAGE_KEY)) {
        setData(normalize(readStored(STORAGE_KEY, DEFAULT_DATA)));
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);


  useEffect(() => {
    if (loadedData) {
      // 예전 버전에서 저장된 세션에도 신규 필드가 없을 수 있다
      setData(normalize(loadedData));
      if (onClearLoadedData) onClearLoadedData();
    }
  }, [loadedData]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error(e);
    }
  }, [data]);

  // 수치 파싱 (문자열이 아닌 값이 들어와도 던지지 않는다)
  const num = parseNum;

  const fmt = (v: number | null | undefined, d = 3): string => {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return v.toFixed(d);
  };

  const trimNum = (v: number): string => (Math.round(v * 1000) / 1000).toString();

  // 관경 변경 시 관두께 자동 설정 함수
  const handleDiaChange = (newDiaStr: string, pipeType: PipeType) => {
    const diaVal = parseFloat(newDiaStr);
    let newThick = data.thick;

    if (pipeType !== 'CUSTOM' && isFinite(diaVal)) {
      const spec = findPipeThickness(pipeType, diaVal);
      if (spec) {
        newThick = spec.thicknessM.toString();
        onToast(`${pipeType === 'PP_DOUBLE' ? 'PP 이중벽관' : '우수공관'} ${spec.diameterMm}mm → 관두께 ${spec.thicknessMm}mm 자동입력`);
      }
    }

    setData(prev => ({ ...prev, dia: newDiaStr, thick: newThick, pipeType }));
  };

  // 관종 변경 시
  const handlePipeTypeChange = (newType: PipeType) => {
    let defaultDia = data.dia;
    let defaultThick = data.thick;

    if (newType === 'PP_DOUBLE') {
      defaultDia = '0.300';
      defaultThick = '0.019';
    } else if (newType === 'STORMWATER') {
      defaultDia = '0.600';
      defaultThick = '0.021';
    }

    handleDiaChange(defaultDia, newType);
  };

  // 부호 (+ / −) 토글
  const toggleSign = (field: 'tbmEl' | 'ihDirect' | 'startInv' | 'endInv', sign: '-' | '+') => {
    const val = data[field].trim().replace(/^[-+]/, '');
    if (!val) {
      setData(prev => ({ ...prev, [field]: sign === '-' ? '-' : '' }));
      return;
    }
    const newVal = sign === '-' ? `-${val}` : val;
    setData(prev => ({ ...prev, [field]: newVal }));
  };

  // 실측 읽음 입력 필터링
  const handleMeasInput = (key: string, rawVal: string) => {
    let clean = rawVal.replace(/[^0-9.\-]/g, '');
    const neg = clean.charAt(0) === '-';
    clean = clean.replace(/-/g, '');
    const parts = clean.split('.');
    if (parts.length > 2) clean = parts.shift() + '.' + parts.join('');
    clean = (neg ? '-' : '') + clean;

    setData(prev => {
      const updated = { ...prev.meas };
      if (!clean.trim()) delete updated[key];
      else updated[key] = clean.trim();
      return { ...prev, meas: updated };
    });
  };

  // GPS 하버사인 거리 계산기 (m)
  const calcGpsDistanceM = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  };

  // 맨홀 사진 촬영 & GPS 위치 획득
  const handleCaptureManhole = (type: 'start' | 'end', file: File | null) => {
    if (!navigator.geolocation) {
      onToast('기기가 위치(GPS) 서비스를 지원하지 않습니다');
    }

    onToast(`📍 ${type === 'start' ? '시점(MH01)' : '종점(MH02)'} 위치(GPS) 획득 중...`);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        let photoUrl: string | undefined = undefined;

        const processPhoto = () => {
          const newGpsData: ManholePhotoGPS = {
            photoUrl,
            lat: latitude,
            lng: longitude,
            accuracy: Math.round(accuracy * 10) / 10,
            timestamp: new Date().toLocaleTimeString('ko-KR')
          };

          setData(prev => {
            const mhStart = type === 'start' ? newGpsData : prev.mhStartPhoto;
            const mhEnd = type === 'end' ? newGpsData : prev.mhEndPhoto;
            let dist: number | undefined = prev.gpsDistanceM;

            if (mhStart?.lat && mhStart?.lng && mhEnd?.lat && mhEnd?.lng) {
              dist = calcGpsDistanceM(mhStart.lat, mhStart.lng, mhEnd.lat, mhEnd.lng);
            }

            const label = type === 'start' ? '시점(MH01)' : '종점(MH02)';
            onToast(`📷 ${label} 사진 및 GPS(±${Math.round(accuracy)}m) 측정 완료!`);

            return {
              ...prev,
              mhStartPhoto: mhStart,
              mhEndPhoto: mhEnd,
              gpsDistanceM: dist
            };
          });
        };

        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            photoUrl = e.target?.result as string;
            processPhoto();
          };
          reader.readAsDataURL(file);
        } else {
          processPhoto();
        }
      },
      (err) => {
        console.error(err);
        onToast('GPS 위치 획득 실패. 기기 위치(GPS) 권한을 켜주세요.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // 주요 계산 로직
  const compute = () => {
    const ih = data.mode === 'direct'
      ? num(data.ihDirect)
      : (num(data.tbmEl) !== null && num(data.bs) !== null ? num(data.tbmEl)! + num(data.bs)! : null);

    const si = num(data.startInv);
    const ei = num(data.endInv);
    const L = num(data.len);
    const t = num(data.thick) || 0;
    const sand = num(data.sand) || 0;
    const conc = num(data.conc) || 0;
    const agg = num(data.aggregate) || 0;
    // 0을 넣었는데 조용히 0.200으로 바뀌면 맨홀 터파기 바닥고가 20cm 깊어진다.
    // 입력한 값을 그대로 쓰고, 0이면 경고로 알린다 (기본 0.200은 DEFAULT_DATA가 제공)
    const mhBase = num(data.mhBase) ?? 0;
    const dia = num(data.dia);
    const base = t + sand + conc + agg; // 기초 총두께 (관두께+모래+콘크리트+골재)
    const step = data.step > 0 ? data.step : 5;
    const tol = (num(data.tol) === null ? 30 : num(data.tol)!) / 1000;

    const out: {
      ih: number | null;
      base: number;
      tol: number;
      dia: number | null;
      si: number | null;
      ei: number | null;
      L: number | null;
      slopePerM: number;
      startCut: number;
      drop: number;
      mhBase: number;
      conc: number;
      agg: number;
      sand: number;
      t: number;
      rows: TrenchRow[];
    } = {
      ih, base, tol, dia, si, ei, L,
      slopePerM: 0, startCut: 0, drop: 0,
      mhBase, conc, agg, sand, t,
      rows: []
    };

    if (si === null || ei === null || L === null || L <= 0) return out;

    out.slopePerM = (si - ei) / L;
    out.startCut = si - base;
    out.drop = si - ei;

    const xs: number[] = [];
    let x = 0;
    let guard = 0;
    while (x < L - 1e-9 && guard++ < 2000) {
      xs.push(x);
      x += step;
    }
    xs.push(L);

    // 종점 맨홀 "자신"의 터파기/바닥 기준 — 낙차맨홀이면 이 구간 유입관저고(ei)가 아니라
    // 그 맨홀의 유출관저고(더 낮은 값, next 구간으로 나가는 값)가 기준이 된다.
    // 없으면(구버전 데이터·수동입력 등) ei를 그대로 쓴다 — 낙차 없는 일반 맨홀과 동일 결과.
    const endMhOutInv = num(data.endMhOutInv);

    out.rows = xs.map((d, i) => {
      const pipeInvEl = si - out.slopePerM * d; // 관로 보간 관저고 — 관로 Layer(1~6)와 관상단고 계산에 쓴다
      const nodeType: 'start' | 'end' | '' = i === 0 ? 'start' : (i === xs.length - 1 ? 'end' : '');
      const mode = data.targetHeightMode || 'CUT_BOTTOM';
      // 맨홀 Layer(MH_*)는 관로 보간이 아니라 그 맨홀 자신의 기준고를 쓴다.
      // 시점은 si(이미 유출관저고), 종점은 그 맨홀의 유출관저고(endMhOutInv)를 쓴다 —
      // 종점 맨홀이 낙차맨홀이면 ei(유입)로는 실제 터파기/바닥 깊이보다 얕게 나온다.
      const invEl = mode.startsWith('MH_') && nodeType === 'end' && endMhOutInv !== null
        ? endMhOutInv
        : pipeInvEl;
      const topEl = dia !== null ? pipeInvEl + dia + t : null;
      const cutBottomEl = invEl - base; // 1. 관로 터파기 바닥고

      // 하이브리드 검측 목표 높이 계산 (현장 Layer 기준)
      let targetEl = cutBottomEl;

      if (mode === 'AGGREGATE_TOP') {
        // 2. 관로 골재 포설고 (관저고 - 관두께 - 모래 - 콘크리트)
        targetEl = invEl - (t + sand + conc);
      } else if (mode === 'CONCRETE_TOP') {
        // 3. 관로 레미콘 타설고 (관저고 - 관두께 - 모래)
        targetEl = invEl - (t + sand);
      } else if (mode === 'SAND_TOP') {
        // 4. 관로 모래 포설고 (관저고 - 관두께)
        targetEl = invEl - t;
      } else if (mode === 'INVERT') {
        // 5. 관저고
        targetEl = invEl;
      } else if (mode === 'CROWN') {
        // 6. 관상단고 (관저고 + 관경 + 관두께)
        targetEl = topEl !== null ? topEl : invEl + (dia || 0) + t;
      } else if (mode === 'MH_CUT') {
        // 맨홀 1. 터파기 바닥고 (Inv - 맨홀바닥두께 0.2m - 콘크리트 - 골재)
        targetEl = invEl - (mhBase + conc + agg);
      } else if (mode === 'MH_AGGREGATE') {
        // 맨홀 2. 골재 포설고 (Inv - 맨홀바닥두께 0.2m - 콘크리트)
        targetEl = invEl - (mhBase + conc);
      } else if (mode === 'MH_CONCRETE') {
        // 맨홀 3. 레미콘 타설고 (Inv - 맨홀바닥두께 0.2m)
        targetEl = invEl - mhBase;
      } else if (mode === 'MH_INVERT') {
        // 맨홀 4. 내부 바닥고 / 인버트고 (Inv)
        targetEl = invEl;
      } else if (mode === 'CUSTOM') {
        const offset = parseFloat(data.customOffsetM || '0') || 0;
        targetEl = invEl + offset;
      }

      return {
        x: d,
        seg: i === 0 ? 0 : d - xs[i - 1],
        cutEl: targetEl, // 현재 선택된 검측 목표 EL
        invEl,
        topEl,
        target: ih === null ? null : ih - targetEl,
        node: nodeType
      };
    });

    return out;
  };

  const computed = compute();

  const mode = data.targetHeightMode || 'CUT_BOTTOM';
  const isMhMode = mode.startsWith('MH_');
  // 맨홀 검측은 시·종점 두 점만 다룬다 — 야장 표와 점간 현황 그림이 같은 배열을 쓴다
  const tableRows = isMhMode
    ? computed.rows.filter((_, idx) => idx === 0 || idx === computed.rows.length - 1)
    : computed.rows;
  // 시·종점 맨홀 좌표로 계산한 연장 — 입력된 연장과 대조해 경고한다
  const coordLength = React.useMemo(() => {
    const all = getSavedManholes();
    return coordDistanceBetween(
      findManholeByName(all, data.startMhName),
      findManholeByName(all, data.endMhName)
    );
  }, [data.startMhName, data.endMhName]);

  /** 합류(분기) 다이어그램용 — 지금 diagramNode로 보고 있는 맨홀의 DB 항목과, 좌표 조회용 전체 목록 */
  const allManholesForJunction = React.useMemo(() => getSavedManholes(), [data.startMhName, data.endMhName]);
  const junctionCenter = React.useMemo(() => {
    const name = diagramNode === 'end' ? data.endMhName : data.startMhName;
    return findManholeByName(allManholesForJunction, name);
  }, [allManholesForJunction, diagramNode, data.startMhName, data.endMhName]);

  /**
   * 시점·종점 맨홀 자체가 낙차맨홀인지 — 판정에는 이미 반영되고 있지만(manholeInvertIn/Out)
   * 화면 어디에도 "이 맨홀은 낙차맨홀"이라는 표시가 없어 현장에서 놓치기 쉬웠다.
   * 값은 맨홀DB의 관저고(유출측)-유입관저고 차이(manholeDropM)를 그대로 쓴다.
   */
  const startMhDrop = React.useMemo(() => {
    if (!isMhMode) return null;
    const item = findManholeByName(allManholesForJunction, data.startMhName);
    return item ? manholeDropM(item) : null;
  }, [allManholesForJunction, isMhMode, data.startMhName]);
  const endMhDrop = React.useMemo(() => {
    if (!isMhMode) return null;
    const item = findManholeByName(allManholesForJunction, data.endMhName);
    return item ? manholeDropM(item) : null;
  }, [allManholesForJunction, isMhMode, data.endMhName]);

  /** 도면 연장표에 적힌 값 (시점 맨홀의 '다음까지 거리') */
  const sheetLength = React.useMemo(() => {
    const start = findManholeByName(getSavedManholes(), data.startMhName);
    return start ? parseNum(start.distToNext) : null;
  }, [data.startMhName]);

  /** 입력 연장을 대조할 수 있는 값과 비교한다. 대조 자료가 없으면 ✓ 를 띄우지 않는다 */
  const lenCheck = (() => {
    const L = computed.L;
    const ref = coordLength !== null ? coordLength : sheetLength;
    const src = coordLength !== null ? '좌표' : '도면';
    if (L === null || L <= 0) return { state: 'none', value: '—', note: '연장 미입력' };
    if (ref === null) return { state: 'none', value: fmt(L, 2), note: '대조 자료 없음 (좌표·도면 연장 없음)' };
    const diff = L - ref;
    return {
      state: Math.abs(diff) <= 0.5 ? 'ok' : 'bad',
      value: `${fmt(ref, 2)} m`,
      note: `${src} 대비 ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} m ${Math.abs(diff) <= 0.5 ? '✓' : '✗'}`
    };
  })();

  const warnings = buildWarnings(data, { ...computed, coordLength });
  const specConfirmed = isSpecConfirmed(data);

  /**
   * 기초 층 구성. 아래에서 위로 쌓아 보여준다.
   * 각 층의 topEl 은 compute() 의 검측 목표고 산식과 같은 식을 쓴다.
   * 맨홀(MH) 모드는 시점·종점 맨홀의 관저고가 서로 다를 수 있어(낙차맨홀 등)
   * diagramNode 선택에 따라 기준점을 바꾼다 — 관로 모드는 여러 중간점을 다루므로 항상 시점 기준.
   */
  const layers: LayerRow[] = (() => {
    const refRow = isMhMode && diagramNode === 'end' && computed.rows.length > 1
      ? computed.rows[computed.rows.length - 1]
      : computed.rows[0];
    const ref = computed.rows.length ? refRow.invEl : null;
    const el = (offset: number) => (ref === null ? null : ref - offset);
    const { t, sand, conc, agg, mhBase, dia } = computed;

    if (mode.startsWith('MH_')) {
      return [
        { key: 'mh-cut', label: '터파기 바닥', thickness: null, topEl: el(mhBase + conc + agg), active: mode === 'MH_CUT' },
        { key: 'mh-agg', label: '골재/잡석', thickness: agg, topEl: el(mhBase + conc), active: mode === 'MH_AGGREGATE' },
        { key: 'mh-conc', label: '콘크리트기초', thickness: conc, topEl: el(mhBase), active: mode === 'MH_CONCRETE' },
        { key: 'mh-slab', label: '맨홀 바닥슬래브', thickness: mhBase, topEl: el(0), active: mode === 'MH_INVERT' }
      ];
    }

    const rows: LayerRow[] = [
      { key: 'cut', label: '터파기 바닥', thickness: null, topEl: el(t + sand + conc + agg), active: mode === 'CUT_BOTTOM' },
      { key: 'agg', label: '골재/잡석', thickness: agg, topEl: el(t + sand + conc), active: mode === 'AGGREGATE_TOP' },
      { key: 'conc', label: '콘크리트기초', thickness: conc, topEl: el(t + sand), active: mode === 'CONCRETE_TOP' },
      { key: 'sand', label: '모래기초', thickness: sand, topEl: el(t), active: mode === 'SAND_TOP' },
      { key: 'pipe', label: '관 (관저고)', thickness: t, topEl: el(0), active: mode === 'INVERT' }
    ];
    if (dia !== null) {
      rows.push({
        key: 'crown',
        label: '관상단',
        thickness: dia,
        topEl: ref === null ? null : ref + dia + t,
        active: mode === 'CROWN'
      });
    }
    return rows;
  })();

  /* ── 다구간 노선 ─────────────────────────────── */
  const routeSpans = React.useMemo(() => {
    if (!data.routeId) return [];
    const route = loadRoutes().find(r => r.id === data.routeId) || null;
    return buildSpans(route, getSavedManholes());
  }, [data.routeId, data.spanIndex]);

  const currentSpan = data.spanIndex !== undefined ? routeSpans[data.spanIndex] : undefined;

  /** 구간을 옮기면 그 구간의 시·종점 관저고와 연장을 야장에 밀어넣는다 */
  const goToSpan = (idx: number) => {
    const sp = routeSpans[idx];
    if (!sp) return;
    setData(prev => ({
      ...prev,
      spanIndex: idx,
      startMhName: sp.start.name,
      endMhName: sp.end.name,
      secName: `${sp.start.name} ~ ${sp.end.name}`,
      startInv: manholeInvertOut(sp.start),
      endInv: manholeInvertIn(sp.end),
      endMhOutInv: manholeInvertOut(sp.end),
      len: sp.length !== null ? sp.length.toFixed(2) : prev.len
    }));
    onToast(`${sp.start.name} ~ ${sp.end.name} 구간으로 이동`);
  };

  const handleConfirmSpec = () => {
    const now = new Date();
    setData(prev => ({
      ...prev,
      specConfirmedSignature: foundationSignature(prev),
      specConfirmedAt: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    }));
    onToast('기초 제원을 확정했습니다');
  };

  // 상단 헤더 업데이트
  useEffect(() => {
    const ihStr = computed.ih === null ? '—' : fmt(computed.ih);
    const ihSub = data.mode === 'direct'
      ? '직접입력'
      : (num(data.tbmEl) !== null && num(data.bs) !== null
        ? `${fmt(num(data.tbmEl))} + ${fmt(num(data.bs))}`
        : 'TBM표고 + 후시');
    onUpdateHeader(data.secName.trim() || '구간 미지정', ihStr, ihSub);
  }, [data, computed.ih]);

  // CSV 생성 (동적 엑셀 수식 포함)
  const buildCsv = () => {
    const c = computed;
    const nm = data.secName.trim() || '구간';
    const csvMode = data.targetHeightMode || 'CUT_BOTTOM';
    const isMhCsv = csvMode.startsWith('MH_');
    const modeName = MODE_LABELS[csvMode] || '터파기 바닥고';

    // 맨홀 검측은 구간이 아니라 시점·종점 맨홀 두 지점만 대상이다 (화면 야장과 동일)
    const csvRows = isMhCsv
      ? c.rows.filter((_, idx) => idx === 0 || idx === c.rows.length - 1)
      : c.rows;

    const head = [
      [isMhCsv ? '맨홀 검측 야장' : '관로 터파기 측량 야장'],
      ['구간명', nm, '측량일', data.mdate, '측량자', data.surveyor],
      ['검측 기준', modeName],
      ['기계고 I.H', c.ih !== null ? c.ih : '', '시점 관저고', c.si !== null ? c.si : '', '종점 관저고', c.ei !== null ? c.ei : '', '허용오차(mm)', (num(data.tol) === null ? 30 : num(data.tol)!)],
      isMhCsv
        ? ['맨홀 바닥두께', c.mhBase, '콘크리트기초', c.conc, '골재/잡석', c.agg]
        : ['연장', c.L !== null ? c.L : '', '관경', c.dia !== null ? c.dia : '', '관두께', c.t, '모래기초', c.sand, '콘크리트기초', c.conc, '골재/잡석', c.agg],
      [],
      [isMhCsv ? '맨홀' : '측점', '누가거리(m)', `${modeName}(EL)`, '관저고(EL)', '목표읽음(m)', '실측읽음(m)', '편차(cm)', '판정']
    ];

    const body = csvRows.map((r, i) => {
      // 헤더가 7행이므로 데이터는 8행부터.
      // 참조 셀: B4=기계고, D4=시점관저고, F4=종점관저고, H4=허용오차, B5=연장(관로만)
      const rNum = 8 + i;
      const rawMeas = data.meas[measKey(spanKeyOf(data), csvMode, r.x)];
      const measVal = rawMeas !== undefined && rawMeas.trim() !== '' ? rawMeas.trim() : '';

      // 오프셋 (검측 목표 EL − 관저고 EL) — 기준이 바뀌어도 관저고에서 이만큼 떨어져 있다
      const targetOffset = r.cutEl - r.invEl;
      const offsetStr = (targetOffset >= 0 ? '+' : '') + targetOffset.toFixed(4);

      // D열 (관저고): 관로는 연장 기준 경사 보간, 맨홀은 각 맨홀 고유값이라 보간하지 않는다
      const invElFormula = !isMhCsv && c.si !== null && c.ei !== null && c.L && c.L > 0
        ? `=IF(ISBLANK($B$5), ${r.invEl.toFixed(3)}, $D$4 - (($D$4 - $F$4) / $B$5) * B${rNum})`
        : r.invEl.toFixed(3);

      // C열 (검측 목표 EL): 관저고 + 오프셋
      const cutElFormula = `=IF(ISBLANK(D${rNum}), ${r.cutEl.toFixed(3)}, D${rNum}${offsetStr})`;

      // E열 (목표읽음 m): 기계고 I.H($B$4) - 목표 EL(C열)
      const targetFormula = `=IF(OR(ISBLANK($B$4), ISBLANK(C${rNum})), "", $B$4 - C${rNum})`;

      // G열 (편차 cm): (실측F - 목표E) * 100
      const devFormula = `=IF(OR(ISBLANK(F${rNum}), ISBLANK(E${rNum})), "", ROUND((F${rNum} - E${rNum}) * 100, 1))`;

      // H열 (판정): ABS((F - E) * 1000) <= 허용오차 H4 이면 적정, F > E 더파기, 아니면 되메움
      // ROUND 를 씌워야 허용오차와 정확히 같은 값이 부동소수점 오차로 부적합이 되지 않는다
      const jdFormula = `=IF(OR(ISBLANK(F${rNum}), ISBLANK(E${rNum})), "", IF(ROUND(ABS((F${rNum} - E${rNum}) * 1000), 6) <= $H$4, "적정", IF(F${rNum} > E${rNum}, "더파기", "되메움")))`;

      const label = isMhCsv
        ? (r.node === 'start' ? (data.startMhName || '시점 MH') : (data.endMhName || '종점 MH'))
        : (r.node === 'start' ? '시점' : (r.node === 'end' ? '종점' : `+${trimNum(r.x)}`));

      return [
        label,
        r.x,
        cutElFormula,
        invElFormula,
        targetFormula,
        measVal,
        devFormula,
        jdFormula
      ];
    });

    return head.concat(body).map(row => row.map(v => {
      const str = v === undefined || v === null ? '' : String(v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\r\n');
  };


  const handleDownloadCsv = () => {
    // \uD655\uC815\uB418\uC9C0 \uC54A\uC740 \uAE30\uCD08 \uC81C\uC6D0\uC73C\uB85C \uB9CC\uB4E0 \uC57C\uC7A5\uC774 \uC131\uACFC\uD488\uC73C\uB85C \uB098\uAC00\uB294 \uAC83\uC744 \uB9C9\uB294\uB2E4
    if (!isSpecConfirmed(data)) {
      onToast('\uAE30\uCD08 \uC81C\uC6D0\uC744 \uBA3C\uC800 \uD655\uC815\uD558\uC138\uC694 (\uAE30\uCD08 \uCE35 \uAD6C\uC131 \u00B7 \uD655\uC778)');
      return;
    }
    const csv = '\uFEFF' + buildCsv();
    const nm = (data.secName.trim() || '관로터파기야장').replace(/[\\/:*?"<>|]/g, '_');
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nm}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onToast('CSV 파일을 저장했습니다');
    } catch {
      onToast('저장에 실패했습니다');
    }
  };

  const handleCopyTable = () => {
    const text = buildCsv().replace(/,/g, '\t');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => onToast('표를 클립보드에 복사했습니다'));
    } else {
      onToast('복사 기능 미지원 브라우저입니다');
    }
  };

  const handleLoadSample = () => {
    setData({
      ...DEFAULT_DATA,
      mdate: new Date().toISOString().split('T')[0],
      meas: {}
    });
    onToast('샘플 데이터를 적용했습니다');
  };

  const handleReset = () => {
    if (!armReset) {
      setArmReset(true);
      setTimeout(() => setArmReset(false), 3500);
      return;
    }
    setArmReset(false);
    setData({
      ...DEFAULT_DATA,
      tbmEl: '',
      bs: '',
      secName: '',
      startMhName: '',
      endMhName: '',
      startInv: '',
      endInv: '',
      len: '',
      surveyor: '',
      mdate: new Date().toISOString().split('T')[0],
      meas: {}
    });
    onToast('초기화되었습니다');
  };

  // 현 규격 정보 얻기
  const currentSpec = findPipeThickness(data.pipeType as any, parseFloat(data.dia));

  return (
    <main>
      {/* 1. 기준점 및 관로제원 설정 (접기/펼치기) */}
      <section className="card">
        <h2>
          기준점 · 제원 스펙
          <button type="button" className="mini" onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? '▲ 접기' : '⚙️ 스펙/설정 변경'}
          </button>
        </h2>

        {!showSettings ? (
          <div className="settings-summary-bar" onClick={() => setShowSettings(true)}>
            <div className="badges">
              <span className="badge">I.H {fmt(computed.ih)}m</span>
              <span className="badge">{data.secName || '구간'}</span>
              <span className="badge">{data.pipeType === 'PP_DOUBLE' ? 'PP이중벽' : (data.pipeType === 'STORMWATER' ? '우수공' : '직접')} D{data.dia}m</span>
              <span className="badge">시점:{data.startInv}m → 종점:{data.endInv}m</span>
              <span className="badge">L:{data.len}m</span>
              {startMhDrop !== null && (
                <span
                  className="badge"
                  style={{ borderColor: 'var(--fill)', background: 'var(--fill-bg)', color: 'var(--fill)' }}
                  title="시점 맨홀 자체가 낙차맨홀입니다 — 유입측과 유출측 관저고가 다릅니다"
                >
                  ⚡ 시점 낙차 Δ{Math.abs(startMhDrop).toFixed(2)}m
                </span>
              )}
              {endMhDrop !== null && (
                <span
                  className="badge"
                  style={{ borderColor: 'var(--fill)', background: 'var(--fill-bg)', color: 'var(--fill)' }}
                  title="종점 맨홀 자체가 낙차맨홀입니다 — 유입측과 유출측 관저고가 다릅니다"
                >
                  ⚡ 종점 낙차 Δ{Math.abs(endMhDrop).toFixed(2)}m
                </span>
              )}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>⚙️ 변경</span>
          </div>
        ) : (
          <div className="card-body">
            <div className="f wide">
              <label>기계고 설정 방식</label>
              <div className="seg" role="group">
                <button
                  type="button"
                  aria-pressed={data.mode === 'tbm'}
                  onClick={() => setData(prev => ({ ...prev, mode: 'tbm' }))}
                >
                  TBM + 후시(B.S)
                </button>
                <button
                  type="button"
                  aria-pressed={data.mode === 'direct'}
                  onClick={() => setData(prev => ({
                    ...prev,
                    mode: 'direct',
                    ihDirect: prev.ihDirect || (computed.ih !== null ? fmt(computed.ih) : '')
                  }))}
                >
                  기계고(I.H) 직접입력
                </button>
              </div>
            </div>

            {data.mode === 'tbm' ? (
              <>
                <div className="f">
                  <label>TBM 표고 <i>m</i></label>
                  <div className="ctrl signed">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="3.000"
                      value={data.tbmEl}
                      onChange={e => setData({ ...data, tbmEl: e.target.value })}
                    />
                    <div className="signseg">
                      <button type="button" data-sign="+" aria-pressed={!data.tbmEl.startsWith('-')} onClick={() => toggleSign('tbmEl', '+')}>+</button>
                      <button type="button" data-sign="-" aria-pressed={data.tbmEl.startsWith('-')} onClick={() => toggleSign('tbmEl', '-')}>−</button>
                    </div>
                  </div>
                </div>

                <div className="f">
                  <label>후시 B.S <i>m</i></label>
                  <div className="ctrl">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="1.100"
                      value={data.bs}
                      onChange={e => setData({ ...data, bs: e.target.value })}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="f wide">
                <label>기계고 I.H <i>m</i></label>
                <div className="ctrl signed">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="4.100"
                    value={data.ihDirect}
                    onChange={e => setData({ ...data, ihDirect: e.target.value })}
                  />
                  <div className="signseg">
                    <button type="button" data-sign="+" aria-pressed={!data.ihDirect.startsWith('-')} onClick={() => toggleSign('ihDirect', '+')}>+</button>
                    <button type="button" data-sign="-" aria-pressed={data.ihDirect.startsWith('-')} onClick={() => toggleSign('ihDirect', '-')}>−</button>
                  </div>
                </div>
              </div>
            )}

            <div className="f wide">
              <label>구간명</label>
              <div className="ctrl">
                <input
                  type="text"
                  className="t-name"
                  placeholder="MH01 ~ MH02"
                  value={data.secName}
                  onChange={e => setData({ ...data, secName: e.target.value })}
                />
              </div>
            </div>

            {/* 관종 선택 */}
            <div className="f wide">
              <label>관종 선택 <i>관두께 자동지정</i></label>
              <div className="seg">
                <button
                  type="button"
                  aria-pressed={data.pipeType === 'PP_DOUBLE'}
                  onClick={() => handlePipeTypeChange('PP_DOUBLE')}
                >
                  PP 이중벽관
                </button>
                <button
                  type="button"
                  aria-pressed={data.pipeType === 'STORMWATER'}
                  onClick={() => handlePipeTypeChange('STORMWATER')}
                >
                  우수공관
                </button>
                <button
                  type="button"
                  aria-pressed={data.pipeType === 'CUSTOM'}
                  onClick={() => handlePipeTypeChange('CUSTOM')}
                >
                  직접 입력
                </button>
              </div>
            </div>

            {/* 규격 선택 / 관경 입력 */}
            <div className="f">
              <label>
                관경 D <i>{data.pipeType === 'CUSTOM' ? 'm' : '규격선택'}</i>
              </label>
              <div className="ctrl">
                {data.pipeType === 'PP_DOUBLE' ? (
                  <select
                    value={data.dia}
                    onChange={e => handleDiaChange(e.target.value, 'PP_DOUBLE')}
                  >
                    {PP_DOUBLE_SPECS.map(s => (
                      <option key={s.diameterMm} value={s.diameterM.toString()}>
                        D {s.diameterMm}mm (t={s.thicknessMm}mm)
                      </option>
                    ))}
                  </select>
                ) : data.pipeType === 'STORMWATER' ? (
                  <select
                    value={data.dia}
                    onChange={e => handleDiaChange(e.target.value, 'STORMWATER')}
                  >
                    {STORMWATER_SPECS.map(s => (
                      <option key={s.diameterMm} value={s.diameterM.toString()}>
                        D {s.diameterMm}mm (t={s.thicknessMm}mm)
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.300"
                    value={data.dia}
                    onChange={e => setData({ ...data, dia: e.target.value })}
                  />
                )}
              </div>
            </div>

            {/* 관두께 t */}
            <div className="f">
              <label>관두께 t <i>m</i></label>
              <div className="ctrl">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.019"
                  value={data.thick}
                  onChange={e => setData({ ...data, thick: e.target.value })}
                />
              </div>
            </div>

            {/* 우수공관 선택시 관외경/기초폭 보조 안내 */}
            {data.pipeType === 'STORMWATER' && currentSpec && currentSpec.outerDiameterMm && (
              <div className="f wide" style={{ fontSize: '11px', color: 'var(--primary)', padding: '4px 6px', background: 'var(--primary-bg)', borderRadius: '5px' }}>
                ℹ️ 우수공관 D{currentSpec.diameterMm}mm 명세: 관외경/기초폭(Bd) = <b>{currentSpec.outerDiameterMm}mm</b>
              </div>
            )}

            {/* 맨홀 명칭 입력 & CAD 설계 관저고(EL) DB 자동 연동 카드 */}
            <div className="f wide" style={{ background: 'var(--surface-3)', padding: '10px', borderRadius: '8px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                <label style={{ color: 'var(--ink)', fontWeight: 700, fontSize: '11.5px', margin: 0 }}>
                  <Database size={13} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                  맨홀 명칭 입력 & CAD 관저고(Inv EL) DB 연동 (숫자만 입력 가능)
                </label>
                <button
                  type="button"
                  className="btn primary"
                  style={{ fontSize: '10.5px', padding: '3px 8px', minWidth: 'auto' }}
                  onClick={() => {
                    const mhList = getSavedManholes();
                    const sName = (data.startMhName || '').trim();
                    const eName = (data.endMhName || '').trim();

                    const startItem = mhList.find(m => matchManholeByNameOrNumber(sName, m.name, m.remarks));
                    const endItem = mhList.find(m => matchManholeByNameOrNumber(eName, m.name, m.remarks));

                    if (startItem || endItem) {
                      setData(prev => ({
                        ...prev,
                        startMhName: startItem ? startItem.name : prev.startMhName,
                        startInv: startItem ? manholeInvertOut(startItem) : prev.startInv,
                        endMhName: endItem ? endItem.name : prev.endMhName,
                        endInv: endItem ? manholeInvertIn(endItem) : prev.endInv,
                        endMhOutInv: endItem ? manholeInvertOut(endItem) : prev.endMhOutInv,
                        secName: `${(startItem ? startItem.name : prev.startMhName) || '시점'} ~ ${(endItem ? endItem.name : prev.endMhName) || '종점'}`
                      }));
                      onToast(`⚡ 맨홀 DB 관저고 불러오기 완료! (${startItem ? startItem.name + ':' + manholeInvertOut(startItem) + 'm' : ''} ${endItem ? endItem.name + ':' + manholeInvertIn(endItem) + 'm' : ''})`);
                    } else {
                      onToast(`맨홀 DB에서 '${sName || '시점'}' 또는 '${eName || '종점'}' 매칭 데이터를 찾지 못했습니다.`);
                    }
                  }}
                >
                  ⚡ CAD 관저고 자동 불러오기
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {/* 시점 맨홀 입력 */}
                <div className="f" style={{ position: 'relative' }}>
                  <label style={{ fontSize: '11px' }}>시점 맨홀명 (예: 1, 01, MH01)</label>
                  <div className="ctrl">
                    <input
                      type="text"
                      placeholder="예: 1 또는 MH01"
                      value={data.startMhName || ''}
                      onFocus={() => setShowStartMhPopup(true)}
                      onBlur={() => setTimeout(() => setShowStartMhPopup(false), 200)}
                      onChange={e => {
                        const val = e.target.value;
                        const mhList = getSavedManholes();
                        const found = val.trim() ? mhList.find(m => matchManholeByNameOrNumber(val, m.name, m.remarks)) : null;

                        setData(prev => ({
                          ...prev,
                          startMhName: val,
                          startInv: found ? manholeInvertOut(found) : prev.startInv,
                          secName: `${found ? found.name : val || '시점'} ~ ${prev.endMhName || '종점'}`
                        }));
                        setShowStartMhPopup(true);
                      }}
                    />
                  </div>

                  {/* 시점 맨홀 자동완성 팝업 */}
                  {showStartMhPopup && (() => {
                    const mhList = getSavedManholes();
                    const val = (data.startMhName || '').trim();
                    const filtered = mhList.filter(m => matchManholeByNameOrNumber(val, m.name, m.remarks));
                    if (filtered.length === 0) return null;

                    return (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 60,
                          backgroundColor: 'var(--surface)',
                          border: '1px solid var(--primary)',
                          borderRadius: '8px',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                          maxHeight: '180px',
                          overflowY: 'auto',
                          marginTop: '4px'
                        }}
                      >
                        <div style={{ padding: '4px 8px', fontSize: '10px', color: 'var(--ink-3)', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
                          🔍 추천 맨홀 ({filtered.length}개) - 터치시 적용
                        </div>
                        {filtered.map(m => (
                          <div
                            key={m.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setData(prev => ({
                                ...prev,
                                startMhName: m.name,
                                startInv: manholeInvertOut(m),
                                secName: `${m.name} ~ ${prev.endMhName || '종점'}`
                              }));
                              setShowStartMhPopup(false);
                              onToast(`✓ 시점 '${m.name}' (관저고 ${manholeInvertOut(m)}m) 적용 완료!`);
                            }}
                            style={{
                              padding: '8px 10px',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--line-2)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '12px'
                            }}
                          >
                            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{m.name}</span>
                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{m.invertEl} m</span>
                            {m.remarks && <span style={{ color: 'var(--ink-3)', fontSize: '10.5px' }}>({m.remarks})</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* 종점 맨홀 입력 */}
                <div className="f" style={{ position: 'relative' }}>
                  <label style={{ fontSize: '11px' }}>종점 맨홀명 (예: 2, 02, MH02)</label>
                  <div className="ctrl">
                    <input
                      type="text"
                      placeholder="예: 2 또는 MH02"
                      value={data.endMhName || ''}
                      onFocus={() => setShowEndMhPopup(true)}
                      onBlur={() => setTimeout(() => setShowEndMhPopup(false), 200)}
                      onChange={e => {
                        const val = e.target.value;
                        const mhList = getSavedManholes();
                        const found = val.trim() ? mhList.find(m => matchManholeByNameOrNumber(val, m.name, m.remarks)) : null;

                        setData(prev => ({
                          ...prev,
                          endMhName: val,
                          endInv: found ? manholeInvertIn(found) : prev.endInv,
                          endMhOutInv: found ? manholeInvertOut(found) : prev.endMhOutInv,
                          secName: `${prev.startMhName || '시점'} ~ ${found ? found.name : val || '종점'}`
                        }));
                        setShowEndMhPopup(true);
                      }}
                    />
                  </div>

                  {/* 종점 맨홀 자동완성 팝업 */}
                  {showEndMhPopup && (() => {
                    const mhList = getSavedManholes();
                    const val = (data.endMhName || '').trim();
                    const filtered = mhList.filter(m => matchManholeByNameOrNumber(val, m.name, m.remarks));
                    if (filtered.length === 0) return null;

                    return (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 60,
                          backgroundColor: 'var(--surface)',
                          border: '1px solid var(--ok)',
                          borderRadius: '8px',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                          maxHeight: '180px',
                          overflowY: 'auto',
                          marginTop: '4px'
                        }}
                      >
                        <div style={{ padding: '4px 8px', fontSize: '10px', color: 'var(--ink-3)', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
                          🔍 추천 맨홀 ({filtered.length}개) - 터치시 적용
                        </div>
                        {filtered.map(m => (
                          <div
                            key={m.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setData(prev => ({
                                ...prev,
                                endMhName: m.name,
                                endInv: manholeInvertIn(m),
                                endMhOutInv: manholeInvertOut(m),
                                secName: `${prev.startMhName || '시점'} ~ ${m.name}`
                              }));
                              setShowEndMhPopup(false);
                              onToast(`✓ 종점 '${m.name}' (관저고 ${manholeInvertIn(m)}m) 적용 완료!`);
                            }}
                            style={{
                              padding: '8px 10px',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--line-2)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '12px'
                            }}
                          >
                            <span style={{ fontWeight: 700, color: 'var(--ok)' }}>{m.name}</span>
                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{m.invertEl} m</span>
                            {m.remarks && <span style={{ color: 'var(--ink-3)', fontSize: '10.5px' }}>({m.remarks})</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>


            <div className="f wide">
              <label>시점 관저고 <i>m</i></label>
              <div className="ctrl signed">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="-0.430"
                  value={data.startInv}
                  onChange={e => setData({ ...data, startInv: e.target.value })}
                />
                <div className="signseg">
                  <button type="button" data-sign="+" aria-pressed={!data.startInv.startsWith('-')} onClick={() => toggleSign('startInv', '+')}>+</button>
                  <button type="button" data-sign="-" aria-pressed={data.startInv.startsWith('-')} onClick={() => toggleSign('startInv', '-')}>−</button>
                </div>
              </div>
            </div>

            <div className="f wide">
              <label>종점 관저고 <i>m</i></label>
              <div className="ctrl signed">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="-0.190"
                  value={data.endInv}
                  onChange={e => setData({ ...data, endInv: e.target.value })}
                />
                <div className="signseg">
                  <button type="button" data-sign="+" aria-pressed={!data.endInv.startsWith('-')} onClick={() => toggleSign('endInv', '+')}>+</button>
                  <button type="button" data-sign="-" aria-pressed={data.endInv.startsWith('-')} onClick={() => toggleSign('endInv', '-')}>−</button>
                </div>
              </div>
            </div>

            <div className="f">
              <label>연장 L <i>m</i></label>
              <div className="ctrl">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="75"
                  value={data.len}
                  onChange={e => setData({ ...data, len: e.target.value })}
                />
              </div>
            </div>

            {/* 맨홀 사진 촬영 & GPS 자동 연장(L) 측정 카드 */}
            <div className="f wide" style={{ background: 'var(--surface-3)', padding: '10px', borderRadius: '8px', marginTop: '4px' }}>
              <label style={{ color: 'var(--ink)', fontWeight: 700, fontSize: '11.5px', marginBottom: '6px' }}>
                <Camera size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                맨홀 사진 촬영 & GPS 측량 연장(L) 자동계산
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {/* 시점 MH01 촬영 */}
                <div style={{ background: 'var(--surface-2)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>시점 MH01</div>
                  {data.mhStartPhoto?.photoUrl && (
                    <img src={data.mhStartPhoto.photoUrl} alt="MH01" style={{ width: '100%', height: '55px', objectFit: 'cover', borderRadius: '4px', marginBottom: '4px' }} />
                  )}
                  {data.mhStartPhoto?.lat ? (
                    <div style={{ fontSize: '9.5px', color: 'var(--ok)', marginBottom: '4px' }}>
                      ✓ GPS측정 (±{data.mhStartPhoto.accuracy}m)
                    </div>
                  ) : (
                    <div style={{ fontSize: '9.5px', color: 'var(--ink-3)', marginBottom: '4px' }}>사진/위치 미측정</div>
                  )}
                  <label className="btn" style={{ fontSize: '11px', padding: '6px 4px', width: '100%', minWidth: 'auto', margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <Camera size={13} /> {data.mhStartPhoto?.lat ? 'MH01 재촬영' : 'MH01 촬영'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={(e) => handleCaptureManhole('start', e.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                {/* 종점 MH02 촬영 */}
                <div style={{ background: 'var(--surface-2)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>종점 MH02</div>
                  {data.mhEndPhoto?.photoUrl && (
                    <img src={data.mhEndPhoto.photoUrl} alt="MH02" style={{ width: '100%', height: '55px', objectFit: 'cover', borderRadius: '4px', marginBottom: '4px' }} />
                  )}
                  {data.mhEndPhoto?.lat ? (
                    <div style={{ fontSize: '9.5px', color: 'var(--ok)', marginBottom: '4px' }}>
                      ✓ GPS측정 (±{data.mhEndPhoto.accuracy}m)
                    </div>
                  ) : (
                    <div style={{ fontSize: '9.5px', color: 'var(--ink-3)', marginBottom: '4px' }}>사진/위치 미측정</div>
                  )}
                  <label className="btn" style={{ fontSize: '11px', padding: '6px 4px', width: '100%', minWidth: 'auto', margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <Camera size={13} /> {data.mhEndPhoto?.lat ? 'MH02 재촬영' : 'MH02 촬영'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={(e) => handleCaptureManhole('end', e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>

              {/* 두 맨홀 사이 계산된 거리 표시 & 입력창 자동 반영 버튼 */}
              {data.gpsDistanceM !== undefined && (
                <div style={{ marginTop: '8px', padding: '6px 10px', background: 'var(--primary-bg)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--ink)' }}>
                    📍 두 맨홀 간 GPS 거리: <b style={{ color: 'var(--primary)', fontSize: '14px' }}>{data.gpsDistanceM} m</b>
                  </div>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ padding: '4px 8px', fontSize: '11px', minWidth: 'auto' }}
                    onClick={() => {
                      setData(prev => ({ ...prev, len: prev.gpsDistanceM!.toString() }));
                      onToast(`연장 L에 GPS 측량 거리 ${data.gpsDistanceM}m 적용 완료!`);
                    }}
                  >
                    <Sparkles size={12} /> 연장 L에 적용
                  </button>
                </div>
              )}
            </div>

            <div className="f">
              <label>허용오차 <i>± mm</i></label>
              <div className="ctrl">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="30"
                  value={data.tol}
                  onChange={e => setData({ ...data, tol: e.target.value })}
                />
              </div>
            </div>

            <div className="f">
              <label>모래기초 <i>m</i></label>
              <div className="ctrl">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.100"
                  value={data.sand}
                  onChange={e => setData({ ...data, sand: e.target.value })}
                />
              </div>
            </div>

            <div className="f">
              <label>콘크리트기초 <i>m</i></label>
              <div className="ctrl">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.100"
                  value={data.conc}
                  onChange={e => setData({ ...data, conc: e.target.value })}
                />
              </div>
            </div>

            <div className="f">
              <label>골재/잡석두께 <i>m</i></label>
              <div className="ctrl">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.150 (없으면 0)"
                  value={data.aggregate || ''}
                  onChange={e => setData({ ...data, aggregate: e.target.value })}
                />
              </div>
            </div>

            <div className="f">
              <label>맨홀 바닥두께 <i>m</i></label>
              <div className="ctrl">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.200 (20cm)"
                  value={data.mhBase !== undefined ? data.mhBase : '0.200'}
                  onChange={e => setData({ ...data, mhBase: e.target.value })}
                />
              </div>
            </div>


            <div className="f wide">
              <label>측점 간격 <i>m</i></label>
              <div className="chips">
                {[3, 5, 10, 20].map(s => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={data.step === s}
                    onClick={() => setData(prev => ({ ...prev, step: s }))}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="f">
              <label>측량일</label>
              <div className="ctrl">
                <input
                  type="date"
                  value={data.mdate}
                  onChange={e => setData({ ...data, mdate: e.target.value })}
                />
              </div>
            </div>

            <div className="f">
              <label>측량자</label>
              <div className="ctrl">
                <input
                  type="text"
                  className="t-name"
                  placeholder="홍길동"
                  value={data.surveyor}
                  onChange={e => setData({ ...data, surveyor: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. 요약 통계 */}
      <section className="summary">
        <div className="stat">
          <b>구배</b>
          <span>
            {computed.rows.length ? `${Math.abs((computed.drop / (computed.L || 1)) * 1000).toFixed(2)}‰` : '—'}
          </span>
          <em>
            {computed.rows.length ? (
              <>
                {Math.abs(computed.drop) > 0.0001 ? `1/${Math.round(computed.L! / Math.abs(computed.drop))} · ` : ''}
                {computed.drop > 0 ? '하향' : computed.drop < 0 ? '상향' : '수평'}
              </>
            ) : '시점→종점'}
          </em>
        </div>

        {/* 시점·종점 모두 현재 선택된 검측기준(cutEl)으로 맞춘다.
            시점만 startCut(터파기 바닥 고정)을 쓰면 다른 모드에서 두 값의 기준이 어긋난다 */}
        <div className="stat">
          <b>시점 목표고</b>
          <span>{computed.rows.length ? fmt(computed.rows[0].cutEl) : '—'}</span>
          <em>선택 검측기준</em>
        </div>

        <div className="stat">
          <b>종점 목표고</b>
          <span>{computed.rows.length ? fmt(computed.rows[computed.rows.length - 1].cutEl) : '—'}</span>
          <em>{computed.rows.length ? `${computed.rows.length}측점 @${data.step}m` : '—'}</em>
        </div>

        <div className="stat">
          <b>{data.targetHeightMode?.startsWith('MH_') ? '맨홀 기초두께' : '관로 기초두께'}</b>
          <span>
            {data.targetHeightMode?.startsWith('MH_')
              ? fmt(computed.mhBase + computed.conc + computed.agg)
              : fmt(computed.base)} m
          </span>
          <em>
            {data.targetHeightMode?.startsWith('MH_')
              ? `맨홀바닥(${fmt(computed.mhBase)})+레미콘(${fmt(computed.conc)})+골재(${fmt(computed.agg)})`
              : `관두께(${fmt(computed.t)})+모래(${fmt(computed.sand)})+레미콘(${fmt(computed.conc)})+골재(${fmt(computed.agg)})`}
          </em>
        </div>

        <div className="stat">
          <b>목표읽음 범위</b>
          <span>
            {computed.rows.length && computed.ih !== null
              ? `${fmt(computed.rows[0].target)} → ${fmt(computed.rows[computed.rows.length - 1].target)}`
              : '—'}
          </span>
          <em>시점 → 종점</em>
        </div>

        {/* 연장 검증 — 입력 연장을 맨홀 좌표 거리 또는 도면 연장과 대조한다.
            예전의 '검산'은 종점 관저고를 역산해 보여줬는데,
            그 값은 시점·종점·연장으로 만든 결과라 입력값과 항상 같아지는 항등식이었다.
            종점에 99.999 를 넣어도 ✓ 가 떠서 검증된 것처럼 보였다. */}
        <div className={`stat check ${lenCheck.state === 'bad' ? 'bad' : ''}`}>
          <b>연장 검증</b>
          <span>{lenCheck.value}</span>
          <em>{lenCheck.note}</em>
        </div>
      </section>

      {/* 하이브리드 검측 높이 선택 바 (관로 토공 Layer & 맨홀 Layer) */}
      <section className="card" style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-2)', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>🎯 검측 목표 높이 선택 (현장 Layer)</span>
          <span style={{ fontSize: '10.5px', color: 'var(--primary)', fontWeight: 600 }}>
            {(!data.targetHeightMode || data.targetHeightMode === 'CUT_BOTTOM') && '1. 관로 터파기 바닥고 기준'}
            {data.targetHeightMode === 'AGGREGATE_TOP' && '2. 관로 골재 포설고 기준'}
            {data.targetHeightMode === 'CONCRETE_TOP' && '3. 관로 레미콘 타설고 기준'}
            {data.targetHeightMode === 'SAND_TOP' && '4. 관로 모래 포설고 기준'}
            {data.targetHeightMode === 'INVERT' && '5. 관저고 (Inv EL) 기준'}
            {data.targetHeightMode === 'CROWN' && '6. 관상단고 (Top EL) 기준'}
            {data.targetHeightMode === 'MH_CUT' && '맨홀 1. 터파기 바닥고 기준'}
            {data.targetHeightMode === 'MH_AGGREGATE' && '맨홀 2. 골재 포설고 기준'}
            {data.targetHeightMode === 'MH_CONCRETE' && '맨홀 3. 레미콘 타설고 기준'}
            {data.targetHeightMode === 'MH_INVERT' && '맨홀 4. 내부 바닥고 기준'}
            {data.targetHeightMode === 'CUSTOM' && `사용자 지정 (+${data.customOffsetM || '0'}m) 기준`}
          </span>
        </div>

        {/* 관로 토공 Layer 세트 */}
        <div style={{ fontSize: '10px', color: 'var(--ink-3)', fontWeight: 600, marginBottom: '3px' }}>관로 토공 Layer:</div>
        <div className="chips" style={{ gap: '3px', marginBottom: '6px' }}>
          <button type="button" aria-pressed={!data.targetHeightMode || data.targetHeightMode === 'CUT_BOTTOM'} onClick={() => setData(prev => ({ ...prev, targetHeightMode: 'CUT_BOTTOM' }))}>
            1.터파기바닥
          </button>
          <button type="button" aria-pressed={data.targetHeightMode === 'AGGREGATE_TOP'} onClick={() => setData(prev => ({ ...prev, targetHeightMode: 'AGGREGATE_TOP' }))}>
            2.골재포설
          </button>
          <button type="button" aria-pressed={data.targetHeightMode === 'CONCRETE_TOP'} onClick={() => setData(prev => ({ ...prev, targetHeightMode: 'CONCRETE_TOP' }))}>
            3.레미콘타설
          </button>
          <button type="button" aria-pressed={data.targetHeightMode === 'SAND_TOP'} onClick={() => setData(prev => ({ ...prev, targetHeightMode: 'SAND_TOP' }))}>
            4.모래포설
          </button>
          <button type="button" aria-pressed={data.targetHeightMode === 'INVERT'} onClick={() => setData(prev => ({ ...prev, targetHeightMode: 'INVERT' }))}>
            5.관저고
          </button>
          <button type="button" aria-pressed={data.targetHeightMode === 'CROWN'} onClick={() => setData(prev => ({ ...prev, targetHeightMode: 'CROWN' }))}>
            6.관상단고
          </button>
        </div>

        {/* 맨홀 Layer 세트 */}
        <div style={{ fontSize: '10px', color: 'var(--ink-3)', fontWeight: 600, marginBottom: '3px' }}>맨홀 (MH) Layer:</div>
        <div className="chips" style={{ gap: '3px' }}>
          <button type="button" aria-pressed={data.targetHeightMode === 'MH_CUT'} onClick={() => setData(prev => ({ ...prev, targetHeightMode: 'MH_CUT' }))}>
            MH 1.터파기
          </button>
          <button type="button" aria-pressed={data.targetHeightMode === 'MH_AGGREGATE'} onClick={() => setData(prev => ({ ...prev, targetHeightMode: 'MH_AGGREGATE' }))}>
            MH 2.골재포설
          </button>
          <button type="button" aria-pressed={data.targetHeightMode === 'MH_CONCRETE'} onClick={() => setData(prev => ({ ...prev, targetHeightMode: 'MH_CONCRETE' }))}>
            MH 3.레미콘타설
          </button>
          <button type="button" aria-pressed={data.targetHeightMode === 'MH_INVERT'} onClick={() => setData(prev => ({ ...prev, targetHeightMode: 'MH_INVERT' }))}>
            MH 4.내부바닥
          </button>
          <button type="button" aria-pressed={data.targetHeightMode === 'CUSTOM'} onClick={() => setData(prev => ({ ...prev, targetHeightMode: 'CUSTOM' }))}>
            지정고
          </button>
        </div>

        {data.targetHeightMode === 'CUSTOM' && (
          <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--ink-2)' }}>관저고 대비 오프셋(m):</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="예: 0.150"
              style={{ width: '90px', minHeight: '30px', padding: '2px 6px', fontSize: '13px' }}
              value={data.customOffsetM || ''}
              onChange={e => setData({ ...data, customOffsetM: e.target.value })}
            />
          </div>
        )}
      </section>

      {/* 노선 구간 이동 — 다구간 측량 중일 때만 */}
      {currentSpan && (
        <div className="span-nav">
          <button
            type="button"
            onClick={() => goToSpan(data.spanIndex! - 1)}
            disabled={data.spanIndex === 0}
            aria-label="이전 구간"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="span-nav-body">
            <b>{currentSpan.start.name} ~ {currentSpan.end.name}</b>
            <span>
              구간 {data.spanIndex! + 1} / {routeSpans.length}
              {currentSpan.length !== null && ` · 연장 ${currentSpan.length.toFixed(2)} m`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => goToSpan(data.spanIndex! + 1)}
            disabled={data.spanIndex! >= routeSpans.length - 1}
            aria-label="다음 구간"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* 맨홀(MH) 검측 모드: 층 구성 다이어그램이 시점·종점 어느 맨홀 기준인지 선택.
          낙차맨홀 등에서는 두 맨홀의 관저고가 달라 하나로 고정하면 안 된다. */}
      {isMhMode && computed.rows.length > 1 && (
        <div className="chips" style={{ gap: '3px', margin: '0 0 6px' }}>
          <button
            type="button"
            aria-pressed={diagramNode === 'start'}
            onClick={() => setDiagramNode('start')}
          >
            📍 시점 맨홀 ({data.startMhName || '시점'}) 레이아웃
          </button>
          <button
            type="button"
            aria-pressed={diagramNode === 'end'}
            onClick={() => setDiagramNode('end')}
          >
            📍 종점 맨홀 ({data.endMhName || '종점'}) 레이아웃
          </button>
        </div>
      )}

      {/* 3방·4방 합류 맨홀(예: 4방향에서 유입·유출이 섞이는 맨홀) 방사형 다이어그램.
          맨홀DB에 분기 정보가 등록돼 있을 때만 나타난다 — 놓치기 쉬운 방향·관저고를
          한 그림에 모아 보여줘 착오를 줄인다. */}
      {isMhMode && junctionCenter && (junctionCenter.branches?.length ?? 0) > 0 && (
        <section className="card" style={{ padding: '8px 10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-2)', marginBottom: '2px' }}>
            🔀 {junctionCenter.name} 합류 맨홀 — 유입·유출 방향 및 관저고
          </div>
          <JunctionDiagram
            center={junctionCenter}
            allManholes={allManholesForJunction}
            highlightNames={[diagramNode === 'end' ? data.startMhName : data.endMhName].filter(Boolean) as string[]}
          />
          <p className="junction-cap">
            🎯 표시가 지금 야장에서 측량 중인 방향입니다. 좌표가 없는 분기는 방향이 실제와 다를 수 있어요 — 관저고 숫자로 확인하세요.
          </p>
        </section>
      )}

      {/* 분기정보는 있지만 형식이 안 맞아 전부 건너뛴 경우 — 그림이 안 뜬다고 "합류 없음"으로
          오인하지 않도록 알린다. 맨홀DB 관리 화면에서 ⚠️ 배지로도 확인할 수 있다. */}
      {isMhMode && junctionCenter && !junctionCenter.branches?.length && (junctionCenter.branchIssues?.length ?? 0) > 0 && (
        <section className="card" style={{ padding: '8px 10px', borderColor: 'var(--cut)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--cut)' }}>
            ⚠️ {junctionCenter.name}의 분기정보 형식이 안 맞아 표시하지 못했습니다 — 맨홀DB에서 관저고 값을 확인해주세요.
          </div>
        </section>
      )}

      {/* 기초 층 구성 확인 게이트 + 오입력 경고 */}
      <SpecGuard
        warnings={warnings}
        layers={layers}
        diagram={{
          invEl: computed.rows.length
            ? (isMhMode && diagramNode === 'end' ? computed.rows[computed.rows.length - 1].invEl : computed.rows[0].invEl)
            : null,
          sand: computed.sand,
          conc: computed.conc,
          agg: computed.agg,
          t: computed.t,
          dia: computed.dia,
          mhBase: computed.mhBase
        }}
        mode={mode}
        modeLabel={
          isMhMode
            ? `${diagramNode === 'end' ? (data.endMhName || '종점') : (data.startMhName || '시점')} · ${MODE_LABELS[mode] || '터파기 바닥고'}`
            : (MODE_LABELS[mode] || '터파기 바닥고')
        }
        confirmed={specConfirmed}
        confirmedAt={data.specConfirmedAt}
        onConfirm={handleConfirmSpec}
      />

      {/* 4. 야장 실측표 */}
      <section className="card">
        <h2>
          야장
          {data.targetHeightMode?.startsWith('MH_') && (
            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600, marginLeft: '6px' }}>
              📍 맨홀 검측 모드 (미터별 터파기고 없이 시점/종점 맨홀만 표시)
            </span>
          )}
          <button
            type="button"
            className="mini"
            onClick={() => {
              // 다른 구간·공정에서 잡아둔 실측값까지 날리지 않도록 현재 것만 비운다
              setData(prev => {
                const prefix = `${spanKeyOf(prev)}|${mode}@`;
                const kept: Record<string, string> = {};
                Object.keys(prev.meas).forEach(k => {
                  if (!k.startsWith(prefix)) kept[k] = prev.meas[k];
                });
                return { ...prev, meas: kept };
              });
              onToast(`${MODE_LABELS[mode] || '현재 기준'} 실측값을 지웠습니다`);
            }}
          >
            실측값 지우기
          </button>
        </h2>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="c">측점</th>
                <th className="n">
                  {(!data.targetHeightMode || data.targetHeightMode === 'CUT_BOTTOM') && '터파기고'}
                  {data.targetHeightMode === 'AGGREGATE_TOP' && '골재포설고'}
                  {data.targetHeightMode === 'CONCRETE_TOP' && '레미콘타설고'}
                  {data.targetHeightMode === 'SAND_TOP' && '모래포설고'}
                  {data.targetHeightMode === 'INVERT' && '관저고'}
                  {data.targetHeightMode === 'CROWN' && '관상단고'}
                  {data.targetHeightMode === 'MH_CUT' && 'MH 터파기고'}
                  {data.targetHeightMode === 'MH_AGGREGATE' && 'MH 골재고'}
                  {data.targetHeightMode === 'MH_CONCRETE' && 'MH 레미콘고'}
                  {data.targetHeightMode === 'MH_INVERT' && 'MH 바닥고'}
                  {data.targetHeightMode === 'CUSTOM' && '검측지정고'}
                </th>
                <th className="n">목표읽음</th>
                <th className="c">실측읽음</th>
                <th className="c">판정</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => {
                const key = measKey(spanKeyOf(data), mode, r.x);
                const rawMeas = data.meas[key] || '';
                const isDetailOpen = !!openDetail[key];
                const label = isMhMode
                  ? (r.node === 'start' ? (data.startMhName || '시점 MH') : (data.endMhName || '종점 MH'))
                  : (r.node === 'start' ? '시점' : (r.node === 'end' ? '종점' : `+${trimNum(r.x)}`));

                const judge = classifyMeasurement(rawMeas, r.target, computed.tol);
                const judgeClass = `judge ${judge.status}`;
                const judgeContent: React.ReactNode =
                  judge.status === 'ok' ? <>적정 <small>{judge.cm!.toFixed(1)}</small></> :
                  judge.status === 'cut' ? <>▼{judge.cm!.toFixed(1)} <small>더파기</small></> :
                  judge.status === 'fill' ? <>▲{judge.cm!.toFixed(1)} <small>되메움</small></> :
                  '·';
                // 실측 레벨고 — 읽음 = I.H − 표고 이므로 표고 = I.H − 실측읽음.
                // 판정(목표와의 차이)만 보면 "그 점이 실제로 몇 EL인지"를 알 수 없어
                // 다른 도면·성과와 대조할 때 매번 암산해야 했다 — 여기서 바로 보여준다.
                const measVal = rawMeas === '' ? NaN : parseFloat(rawMeas);
                const measuredEl = computed.ih !== null && isFinite(measVal) ? computed.ih - measVal : null;

                return (
                  <React.Fragment key={key}>
                    <tr
                      className={r.node ? 'node' : ''}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('input')) return;
                        setOpenDetail(prev => ({ ...prev, [key]: !prev[key] }));
                        // 맨홀 모드에서 시점/종점 행을 열면 위 층 구성 다이어그램도 그 맨홀 기준으로 자동 전환
                        if (isMhMode && (r.node === 'start' || r.node === 'end')) setDiagramNode(r.node);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="sta c">{label}</td>
                      <td className="n grade">{fmt(r.cutEl)}</td>
                      <td className="n target">{r.target === null ? '—' : fmt(r.target)}</td>
                      <td className="c">
                        <input
                          type="text"
                          className="meas-input"
                          inputMode="decimal"
                          placeholder="읽음"
                          value={rawMeas}
                          onChange={e => handleMeasInput(key, e.target.value)}
                        />
                      </td>
                      <td className="c">
                        <span className={judgeClass}>{judgeContent}</span>
                        {measuredEl !== null && (
                          <div style={{ fontSize: '10px', color: 'var(--ink-3)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                            EL {fmt(measuredEl)}
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* 아코디언 세부 명세 */}
                    {isDetailOpen && (
                      <tr className="detail">
                        <td colSpan={5}>
                          <dl>
                            <dt>누가거리</dt>
                            <dd>{trimNum(r.x)} m (구간 {trimNum(r.seg)} m)</dd>
                            <dt>관저고</dt>
                            <dd>{fmt(r.invEl)} m</dd>
                            <dt>관상단고</dt>
                            <dd>{r.topEl === null ? '관경 입력 필요' : `${fmt(r.topEl)} m`}</dd>
                            <dt>
                              {(!data.targetHeightMode || data.targetHeightMode === 'CUT_BOTTOM') && '관로 터파기고'}
                              {data.targetHeightMode === 'AGGREGATE_TOP' && '골재 포설고'}
                              {data.targetHeightMode === 'CONCRETE_TOP' && '레미콘 타설고'}
                              {data.targetHeightMode === 'SAND_TOP' && '모래 포설고'}
                              {data.targetHeightMode === 'INVERT' && '관저고'}
                              {data.targetHeightMode === 'CROWN' && '관상단고'}
                              {data.targetHeightMode === 'MH_CUT' && 'MH 터파기고'}
                              {data.targetHeightMode === 'MH_AGGREGATE' && 'MH 골재포설고'}
                              {data.targetHeightMode === 'MH_CONCRETE' && 'MH 레미콘타설고'}
                              {data.targetHeightMode === 'MH_INVERT' && 'MH 바닥고'}
                              {data.targetHeightMode === 'CUSTOM' && '검측 지정고'}
                            </dt>
                            <dd>
                              <b>{fmt(r.cutEl)} m</b>
                              <span style={{ fontSize: '11px', color: 'var(--ink-2)', marginLeft: '6px' }}>
                                {(!data.targetHeightMode || data.targetHeightMode === 'CUT_BOTTOM') && `= 관저고(${fmt(r.invEl)}) − 관두께(${fmt(computed.t)}) − 모래(${fmt(computed.sand)}) − 콘크리트(${fmt(computed.conc)}) − 골재(${fmt(computed.agg)})`}
                                {data.targetHeightMode === 'AGGREGATE_TOP' && `= 관저고(${fmt(r.invEl)}) − 관두께(${fmt(computed.t)}) − 모래(${fmt(computed.sand)}) − 콘크리트(${fmt(computed.conc)})`}
                                {data.targetHeightMode === 'CONCRETE_TOP' && `= 관저고(${fmt(r.invEl)}) − 관두께(${fmt(computed.t)}) − 모래(${fmt(computed.sand)})`}
                                {data.targetHeightMode === 'SAND_TOP' && `= 관저고(${fmt(r.invEl)}) − 관두께(${fmt(computed.t)})`}
                                {data.targetHeightMode === 'INVERT' && `= 관저고(${fmt(r.invEl)})`}
                                {data.targetHeightMode === 'CROWN' && `= 관저고(${fmt(r.invEl)}) + 관경 + 관두께`}
                                {data.targetHeightMode === 'MH_CUT' && `= 관저고(${fmt(r.invEl)}) − 맨홀바닥(${fmt(computed.mhBase)}) − 콘크리트(${fmt(computed.conc)}) − 골재(${fmt(computed.agg)})`}
                                {data.targetHeightMode === 'MH_AGGREGATE' && `= 관저고(${fmt(r.invEl)}) − 맨홀바닥(${fmt(computed.mhBase)}) − 콘크리트(${fmt(computed.conc)})`}
                                {data.targetHeightMode === 'MH_CONCRETE' && `= 관저고(${fmt(r.invEl)}) − 맨홀바닥(${fmt(computed.mhBase)})`}
                                {data.targetHeightMode === 'MH_INVERT' && `= 관저고(${fmt(r.invEl)})`}
                                {data.targetHeightMode === 'CUSTOM' && `= 관저고(${fmt(r.invEl)}) + ${data.customOffsetM || '0'}`}
                              </span>
                            </dd>
                            <dt>목표읽음</dt>
                            <dd>{r.target === null ? '기계고 입력 필요' : `${fmt(r.target)} m = I.H − 검측목표고`}</dd>
                            <dt>실측 레벨고</dt>
                            <dd>
                              {measuredEl === null
                                ? (computed.ih === null ? '기계고 입력 필요' : '실측읽음 입력 필요')
                                : `${fmt(measuredEl)} m = I.H(${fmt(computed.ih)}) − 실측읽음(${fmt(measVal, 3)})`}
                            </dd>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {!computed.rows.length && (
          <div className="empty">시점·종점 관저고와 연장을 입력하면 야장이 계산됩니다.</div>
        )}

        <div className="legend">
          <span><i style={{ background: 'var(--cut)' }}></i>더파기 — 실측이 목표보다 작음(바닥 높음)</span>
          <span><i style={{ background: 'var(--fill)' }}></i>되메움 — 실측이 목표보다 큼(과굴착)</span>
          <span><i style={{ background: 'var(--ok)' }}></i>적정 — 허용오차 이내</span>
        </div>
      </section>

      {/* 점간 현황 — 야장 표와 같은 tableRows 를 그림으로 이어 보여준다 */}
      {tableRows.length > 0 && (
        <section className="card">
          <h2>점간 현황</h2>
          <TrenchProfileChart
            rows={tableRows}
            meas={data.meas}
            measKeyOf={x => measKey(spanKeyOf(data), mode, x)}
            tol={computed.tol}
            labelOf={(r) => isMhMode
              ? (r.node === 'start' ? (data.startMhName || '시점 MH') : (data.endMhName || '종점 MH'))
              : (r.node === 'start' ? '시점' : (r.node === 'end' ? '종점' : `+${trimNum(r.x)}`))}
          />
        </section>
      )}

      {/* 5. 하단 액션 버튼 */}
      <div className="actions">
        <button type="button" className="btn primary" onClick={handleDownloadCsv}>
          <Download size={16} /> CSV 저장
        </button>
        <button type="button" className="btn" onClick={handleCopyTable}>
          <Copy size={16} /> 표 복사
        </button>
        <button type="button" className="btn ghost" onClick={handleLoadSample}>
          <FileSpreadsheet size={16} /> 샘플 적용
        </button>
        <button type="button" className={`btn ghost ${armReset ? 'danger' : ''}`} data-armed={armReset} onClick={handleReset}>
          <RotateCcw size={16} /> {armReset ? '정말 초기화?' : '초기화'}
        </button>
      </div>
    </main>
  );
};
