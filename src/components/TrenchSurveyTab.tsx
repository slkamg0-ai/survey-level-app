import React, { useState, useEffect } from 'react';
import { TrenchSurveyData, TrenchRow, PipeType, ManholePhotoGPS } from '../types/survey';
import { PP_DOUBLE_SPECS, STORMWATER_SPECS, findPipeThickness } from '../data/pipeSpecs';
import { Download, Copy, RefreshCw, RotateCcw, FileSpreadsheet, Check, AlertCircle, Camera, MapPin, Sparkles, Database } from 'lucide-react';
import { getSavedManholes } from './ManholeDbModal';

interface Props {
  onUpdateHeader: (secName: string, ihVal: string, ihSub: string) => void;
  onToast: (msg: string) => void;
  loadedData?: TrenchSurveyData | null;
  onClearLoadedData?: () => void;
}

const STORAGE_KEY = 'survey_trench_data_v2';

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
  tol: '30',
  step: 5,
  surveyor: '홍길동',
  mdate: new Date().toISOString().split('T')[0],
  meas: {},
  targetHeightMode: 'CUT_BOTTOM'
};

export const TrenchSurveyTab: React.FC<Props> = ({ onUpdateHeader, onToast, loadedData, onClearLoadedData }) => {
  const [data, setData] = useState<TrenchSurveyData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_DATA;
    } catch {
      return DEFAULT_DATA;
    }
  });

  const [openDetail, setOpenDetail] = useState<Record<string, boolean>>({});
  const [armReset, setArmReset] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (loadedData) {
      setData(loadedData);
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

  // 수치 파싱
  const num = (v: string): number | null => {
    const parsed = parseFloat(v.replace(/[^0-9.+-]/g, ''));
    return isFinite(parsed) ? parsed : null;
  };

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
      rows: TrenchRow[];
    } = {
      ih, base, tol, dia, si, ei, L,
      slopePerM: 0, startCut: 0, drop: 0, rows: []
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

    out.rows = xs.map((d, i) => {
      const invEl = si - out.slopePerM * d;
      const topEl = dia !== null ? invEl + dia + t : null;
      const cutBottomEl = invEl - base; // 1. 관로 터파기 바닥고

      // 하이브리드 검측 목표 높이 계산 (현장 Layer 기준)
      let targetEl = cutBottomEl;
      const mode = data.targetHeightMode || 'CUT_BOTTOM';

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
        // 맨홀 1. 터파기 바닥고 (Inv - 콘크리트 - 골재)
        targetEl = invEl - (conc + agg);
      } else if (mode === 'MH_AGGREGATE') {
        // 맨홀 2. 골재 포설고 (Inv - 콘크리트)
        targetEl = invEl - conc;
      } else if (mode === 'MH_CONCRETE') {
        // 맨홀 3. 레미콘 타설고 (Inv)
        targetEl = invEl;
      } else if (mode === 'MH_INVERT') {
        // 맨홀 4. 내부 바닥고 (Inv)
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
        node: i === 0 ? 'start' : (i === xs.length - 1 ? 'end' : '')
      };
    });

    return out;
  };

  const computed = compute();

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

  // CSV 생성
  const buildCsv = () => {
    const c = computed;
    const nm = data.secName.trim() || '구간';
    const head = [
      ['관로 터파기 측량 야장'],
      ['구간명', nm, '측량일', data.mdate, '측량자', data.surveyor],
      ['기계고 I.H', fmt(c.ih), '시점 관저고', fmt(c.si), '종점 관저고', fmt(c.ei)],
      ['연장', fmt(c.L, 2), '관경', fmt(c.dia), '관두께', fmt(num(data.thick) || 0), '모래기초', fmt(num(data.sand) || 0), '콘크리트기초', fmt(num(data.conc) || 0)],
      [],
      ['측점', '누가거리(m)', '터파기고(EL)', '관저고(EL)', '목표읽음(m)', '실측읽음(m)', '편차(cm)', '판정']
    ];

    const body = c.rows.map(r => {
      const raw = data.meas[String(r.x)];
      const m = parseFloat(raw);
      let dev = '';
      let jd = '';
      if (isFinite(m) && r.target !== null) {
        const devM = m - r.target;
        dev = (devM * 100).toFixed(1);
        jd = Math.abs(devM) <= c.tol ? '적정' : (devM < 0 ? '더파기' : '되메움');
      }
      return [
        r.node === 'start' ? '시점' : (r.node === 'end' ? '종점' : `+${trimNum(r.x)}`),
        trimNum(r.x),
        fmt(r.cutEl),
        fmt(r.invEl),
        r.target === null ? '' : fmt(r.target),
        isFinite(m) ? String(m) : '',
        dev,
        jd
      ];
    });

    return head.concat(body).map(row => row.map(v => {
      const str = v === undefined || v === null ? '' : String(v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\r\n');
  };

  const handleDownloadCsv = () => {
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
      mode: 'tbm',
      tbmEl: '3.000',
      bs: '1.100',
      ihDirect: '',
      pipeType: 'PP_DOUBLE',
      secName: 'MH01 ~ MH02',
      startInv: '-0.430',
      endInv: '-0.190',
      len: '75',
      dia: '0.300',
      thick: '0.019',
      sand: '0.100',
      conc: '0.100',
      aggregate: '0.150',
      tol: '30',
      step: 5,
      surveyor: '홍길동',
      mdate: new Date().toISOString().split('T')[0],
      meas: {},
      targetHeightMode: 'CUT_BOTTOM'
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
      mode: 'tbm',
      tbmEl: '',
      bs: '',
      ihDirect: '',
      pipeType: 'PP_DOUBLE',
      secName: '',
      startInv: '',
      endInv: '',
      len: '',
      dia: '0.300',
      thick: '0.019',
      sand: '0.100',
      conc: '0.100',
      aggregate: '0.150',
      tol: '30',
      step: 5,
      surveyor: '',
      mdate: new Date().toISOString().split('T')[0],
      meas: {},
      targetHeightMode: 'CUT_BOTTOM'
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
                  맨홀 명칭 입력 & CAD 관저고(Inv EL) DB 연동
                </label>
                <button
                  type="button"
                  className="btn primary"
                  style={{ fontSize: '10.5px', padding: '3px 8px', minWidth: 'auto' }}
                  onClick={() => {
                    const mhList = getSavedManholes();
                    const sName = (data.startMhName || '').trim().toUpperCase();
                    const eName = (data.endMhName || '').trim().toUpperCase();

                    const startItem = mhList.find(m => m.name.toUpperCase() === sName);
                    const endItem = mhList.find(m => m.name.toUpperCase() === eName);

                    if (startItem || endItem) {
                      setData(prev => ({
                        ...prev,
                        startInv: startItem ? startItem.invertEl : prev.startInv,
                        endInv: endItem ? endItem.invertEl : prev.endInv,
                        secName: `${sName || '시점'} ~ ${eName || '종점'}`
                      }));
                      onToast(`⚡ 맨홀 DB 관저고 자동 불러오기 완료! (${startItem ? startItem.name + ':' + startItem.invertEl : ''} ${endItem ? endItem.name + ':' + endItem.invertEl : ''})`);
                    } else {
                      onToast(`맨홀 DB에 '${sName || '시점'}' 또는 '${eName || '종점'}' 관저고가 없습니다. 맨홀DB 버튼에서 등록해주세요.`);
                    }
                  }}
                >
                  ⚡ CAD 관저고 자동 불러오기
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div className="f">
                  <label style={{ fontSize: '11px' }}>시점 맨홀명</label>
                  <div className="ctrl">
                    <input
                      type="text"
                      placeholder="예: MH01"
                      value={data.startMhName || ''}
                      onChange={e => {
                        const val = e.target.value;
                        const sUpper = val.trim().toUpperCase();
                        const mhList = getSavedManholes();
                        const found = mhList.find(m => m.name.toUpperCase() === sUpper);

                        setData(prev => ({
                          ...prev,
                          startMhName: val,
                          startInv: found ? found.invertEl : prev.startInv,
                          secName: `${val || '시점'} ~ ${prev.endMhName || '종점'}`
                        }));
                        if (found) {
                          onToast(`✓ ${found.name} 관저고(${found.invertEl}m) 자동적용!`);
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="f">
                  <label style={{ fontSize: '11px' }}>종점 맨홀명</label>
                  <div className="ctrl">
                    <input
                      type="text"
                      placeholder="예: MH02"
                      value={data.endMhName || ''}
                      onChange={e => {
                        const val = e.target.value;
                        const eUpper = val.trim().toUpperCase();
                        const mhList = getSavedManholes();
                        const found = mhList.find(m => m.name.toUpperCase() === eUpper);

                        setData(prev => ({
                          ...prev,
                          endMhName: val,
                          endInv: found ? found.invertEl : prev.endInv,
                          secName: `${prev.startMhName || '시점'} ~ ${val || '종점'}`
                        }));
                        if (found) {
                          onToast(`✓ ${found.name} 관저고(${found.invertEl}m) 자동적용!`);
                        }
                      }}
                    />
                  </div>
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

        <div className="stat">
          <b>시점 터파기고</b>
          <span>{computed.rows.length ? fmt(computed.startCut) : '—'}</span>
          <em>관저고−기초</em>
        </div>

        <div className="stat">
          <b>종점 터파기고</b>
          <span>{computed.rows.length ? fmt(computed.rows[computed.rows.length - 1].cutEl) : '—'}</span>
          <em>{computed.rows.length ? `${computed.rows.length}측점 @${data.step}m` : '—'}</em>
        </div>

        <div className="stat">
          <b>기초 총두께</b>
          <span>{fmt(computed.base)}</span>
          <em>{fmt(num(data.thick) || 0)}+{fmt(num(data.sand) || 0)}+{fmt(num(data.conc) || 0)}+{fmt(num(data.aggregate) || 0)}</em>
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

        <div className={`stat check ${computed.rows.length && Math.abs((computed.rows[computed.rows.length - 1].cutEl + computed.base) - computed.ei!) >= 0.0005 ? 'bad' : ''}`}>
          <b>검산</b>
          <span>
            {computed.rows.length ? fmt(computed.rows[computed.rows.length - 1].cutEl + computed.base) : '—'}
          </span>
          <em>
            {computed.rows.length ? (
              `입력 ${fmt(computed.ei!)} ${Math.abs((computed.rows[computed.rows.length - 1].cutEl + computed.base) - computed.ei!) < 0.0005 ? '✓' : '✗'}`
            ) : '종점 관저고 역산'}
          </em>
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

      {/* 4. 야장 실측표 */}
      <section className="card">
        <h2>
          야장
          <button
            type="button"
            className="mini"
            onClick={() => {
              setData(prev => ({ ...prev, meas: {} }));
              onToast('실측값을 지웠습니다');
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
              {computed.rows.map((r, i) => {
                const key = String(r.x);
                const rawMeas = data.meas[key] || '';
                const measVal = parseFloat(rawMeas);
                const isDetailOpen = !!openDetail[key];
                const label = r.node === 'start' ? '시점' : (r.node === 'end' ? '종점' : `+${trimNum(r.x)}`);

                // 판정 계산
                let judgeClass = 'judge none';
                let judgeContent: React.ReactNode = '·';

                if (rawMeas && isFinite(measVal) && r.target !== null) {
                  const devM = measVal - r.target;
                  const cm = Math.abs(devM) * 100;
                  if (Math.abs(devM) <= computed.tol) {
                    judgeClass = 'judge ok';
                    judgeContent = <>적정 <small>{cm.toFixed(1)}</small></>;
                  } else if (devM < 0) {
                    judgeClass = 'judge cut';
                    judgeContent = <>▼{cm.toFixed(1)} <small>더파기</small></>;
                  } else {
                    judgeClass = 'judge fill';
                    judgeContent = <>▲{cm.toFixed(1)} <small>되메움</small></>;
                  }
                }

                return (
                  <React.Fragment key={key}>
                    <tr
                      className={r.node ? 'node' : ''}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('input')) return;
                        setOpenDetail(prev => ({ ...prev, [key]: !prev[key] }));
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
                            <dt>터파기고</dt>
                            <dd>{fmt(r.cutEl)} m = 관저고 − {fmt(computed.base)}</dd>
                            <dt>목표읽음</dt>
                            <dd>{r.target === null ? '기계고 입력 필요' : `${fmt(r.target)} m = I.H − 터파기고`}</dd>
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
