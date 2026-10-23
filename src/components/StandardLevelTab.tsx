import React, { useState, useEffect } from 'react';
import { StandardSurveyData, StandardRow, StandardMethod } from '../types/survey';
import { Plus, Trash2, Download, Copy, RotateCcw, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { mergeWithDefaults, readStored, parseNum } from '../utils/storage';
import { NumericKeypad } from './NumericKeypad';

/** 지금 숫자 키패드가 편집 중인 대상 — 설정의 표고 둘, 또는 야장 행의 BS/IS/FS 중 하나 */
type KeypadTarget =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'row'; id: string; field: 'bs' | 'is' | 'fs' };

interface Props {
  onUpdateHeader: (secName: string, ihVal: string, ihSub: string) => void;
  onToast: (msg: string) => void;
  loadedData?: StandardSurveyData | null;
  onClearLoadedData?: () => void;
}

const STORAGE_KEY = 'survey_standard_data_v2';

const INITIAL_ROWS: StandardRow[] = [
  { id: '1', point: 'BM1', bs: '1.250', is: '', fs: '', gh: 10.000, remarks: '기준점 (EL.10.000)' },
  { id: '2', point: 'No.0', bs: '', is: '1.420', fs: '', remarks: '' },
  { id: '3', point: 'No.1', bs: '', is: '1.850', fs: '', remarks: '' },
  { id: '4', point: 'TP1', bs: '2.100', is: '', fs: '2.450', remarks: '이기점 1' },
  { id: '5', point: 'No.2', bs: '', is: '1.150', fs: '', remarks: '' },
  { id: '6', point: 'BM2', bs: '', is: '', fs: '1.980', remarks: '종점' },
];

const DEFAULT_DATA: StandardSurveyData = {
  method: 'ih',
  startBm: '10.000',
  endBm: '',
  title: '표준 레벨 야장',
  surveyor: '홍길동',
  mdate: new Date().toISOString().split('T')[0],
  rows: INITIAL_ROWS
};

const EMPTY_ROW: StandardRow = { id: '', point: '', bs: '', is: '', fs: '', remarks: '' };

/** 저장·불러오기로 들어온 데이터를 기본값과 병합하고 행 구조까지 정리한다 */
const normalize = (raw: unknown): StandardSurveyData => {
  const merged = mergeWithDefaults(DEFAULT_DATA, raw);
  if (!Array.isArray(merged.rows)) {
    merged.rows = INITIAL_ROWS;
  } else {
    // 행마다 필드가 빠져 있어도 계산이 죽지 않도록 채운다
    merged.rows = merged.rows.map((r, i) => ({
      ...EMPTY_ROW,
      ...mergeWithDefaults(EMPTY_ROW, r),
      id: (r && r.id) || `row-${i + 1}`
    }));
  }
  return merged;
};

export const StandardLevelTab: React.FC<Props> = ({ onUpdateHeader, onToast, loadedData, onClearLoadedData }) => {
  const [data, setData] = useState<StandardSurveyData>(() =>
    normalize(readStored(STORAGE_KEY, DEFAULT_DATA))
  );

  const [showSettings, setShowSettings] = useState(false);
  // 중시(IS)는 기본 숨김 — 평소엔 NO/BS/FS/IH/GH만 보여 칸이 안 뭉치고,
  // 중간 시야점을 써야 하는 측점에서만 펼쳐 쓴다. 데이터는 숨겨도 그대로 남는다.
  const [showIs, setShowIs] = useState(false);
  const [keypadTarget, setKeypadTarget] = useState<KeypadTarget | null>(null);

  useEffect(() => {
    if (loadedData) {
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

  const num = parseNum;

  const fmt = (v: number | null | undefined, d = 3): string => {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return v.toFixed(d);
  };

  // 측점 행 계산
  const computeRows = () => {
    let currentGh = num(data.startBm) ?? 10.000;
    let currentIh: number | null = null;
    let prevSight: number | null = null; // 승강식 계산용 직전 읽음값

    const calculated: (StandardRow & {
      calcIh: number | null;
      calcRise: number | null;
      calcFall: number | null;
      calcGh: number | null;
    })[] = [];

    let sumBs = 0;
    let sumFs = 0;

    data.rows.forEach((r, idx) => {
      const bsVal = num(r.bs);
      const isVal = num(r.is);
      const fsVal = num(r.fs);

      if (bsVal !== null) sumBs += bsVal;
      if (fsVal !== null) sumFs += fsVal;

      let calcIh: number | null = null;
      let calcRise: number | null = null;
      let calcFall: number | null = null;
      let calcGh: number | null = null;

      if (idx === 0) {
        calcGh = currentGh;
        if (bsVal !== null) {
          currentIh = calcGh + bsVal;
          calcIh = currentIh;
        }
        prevSight = bsVal !== null ? bsVal : (isVal !== null ? isVal : fsVal);
      } else {
        const sight = isVal !== null ? isVal : fsVal;

        // 1) 기계고식 (I.H 방식)
        if (data.method === 'ih') {
          if (currentIh !== null && sight !== null) {
            calcGh = currentIh - sight;
            currentGh = calcGh;
          }
          // 해당 행에서 산출된 calcGh가 없더라도, 이전 행에서 확정된 currentGh를 베이스로 신규 기계고 산출 (2행 분리 TP 지원)
          const baseGhForIh = calcGh !== null ? calcGh : currentGh;
          if (bsVal !== null && baseGhForIh !== null) {
            currentIh = baseGhForIh + bsVal;
            calcIh = currentIh;
          }
        } else {
          // 2) 승강식 (Rise & Fall 방식)
          if (prevSight !== null && sight !== null) {
            const diff = prevSight - sight;
            if (diff >= 0) calcRise = diff;
            else calcFall = Math.abs(diff);

            calcGh = currentGh + diff;
            currentGh = calcGh;
          }
          if (bsVal !== null) {
            prevSight = bsVal;
          } else if (sight !== null) {
            prevSight = sight;
          }
        }
      }

      calculated.push({
        ...r,
        calcIh,
        calcRise,
        calcFall,
        calcGh
      });
    });

    // 검산식: ∑BS - ∑FS = 최종표고 - 최초표고
    const firstGh = calculated.length ? calculated[0].calcGh : null;
    const lastGh = calculated.length ? calculated[calculated.length - 1].calcGh : null;
    const diffSight = sumBs - sumFs;
    const diffGh = (lastGh !== null && firstGh !== null) ? lastGh - firstGh : null;
    const pageCheckPass = diffGh !== null && Math.abs(diffSight - diffGh) < 0.0005;

    return {
      rows: calculated,
      sumBs,
      sumFs,
      diffSight,
      diffGh,
      firstGh,
      lastGh,
      pageCheckPass
    };
  };

  const computed = computeRows();

  // 헤더 업데이트
  useEffect(() => {
    const activeIh = computed.rows.find(r => r.calcIh !== null)?.calcIh ?? null;
    onUpdateHeader(
      data.title || '표준 레벨 야장',
      activeIh !== null ? fmt(activeIh) : '—',
      data.method === 'ih' ? '기계고식 (I.H)' : '승강식 (Rise&Fall)'
    );
  }, [data, computed]);

  // 행 조작
  const handleAddRow = () => {
    const newId = (Date.now() + Math.random()).toString();
    const prevPoint = data.rows.length ? data.rows[data.rows.length - 1].point : 'No.0';
    let nextPointName = 'No.' + data.rows.length;
    if (prevPoint.startsWith('No.')) {
      const idx = parseInt(prevPoint.replace('No.', ''), 10);
      if (isFinite(idx)) nextPointName = `No.${idx + 1}`;
    }

    setData(prev => ({
      ...prev,
      rows: [...prev.rows, { id: newId, point: nextPointName, bs: '', is: '', fs: '', remarks: '' }]
    }));
  };

  const handleDeleteRow = (id: string) => {
    if (data.rows.length <= 1) {
      onToast('최소 1개의 행이 필요합니다');
      return;
    }
    setData(prev => ({
      ...prev,
      rows: prev.rows.filter(r => r.id !== id)
    }));
  };

  const handleRowChange = (id: string, field: keyof StandardRow, val: string) => {
    setData(prev => {
      const updatedRows = prev.rows.map(r => r.id === id ? { ...r, [field]: val } : r);

      // 마지막 행에 값이 입력되면 자동으로 다음 행 추가
      const isLastRow = prev.rows[prev.rows.length - 1].id === id;
      const hasValue = val.trim() !== '';

      if (isLastRow && hasValue) {
        const newId = (Date.now() + Math.random()).toString();
        const lastPoint = updatedRows[updatedRows.length - 1].point;
        let nextPointName = 'No.' + updatedRows.length;

        if (lastPoint.startsWith('No.')) {
          const numPart = lastPoint.replace('No.', '');
          const idx = parseInt(numPart, 10);
          if (isFinite(idx)) nextPointName = `No.${idx + 1}`;
        }

        return {
          ...prev,
          rows: [...updatedRows, { id: newId, point: nextPointName, bs: '', is: '', fs: '', remarks: '' }]
        };
      }

      return {
        ...prev,
        rows: updatedRows
      };
    });
  };

  // 숫자 키패드 ↔ 실제 필드 연결. 행 필드는 기존 handleRowChange 를 그대로 타서
  // "마지막 행에 값이 들어오면 다음 행 자동 추가" 동작이 네이티브 입력과 똑같이 유지된다.
  const FIELD_LABEL: Record<'bs' | 'is' | 'fs', string> = { bs: '후시(BS)', is: '중시(IS)', fs: '전시(FS)' };

  const keypadLabel = (t: KeypadTarget): string => {
    if (t.kind === 'start') return '기준점(BM1) 최초표고';
    if (t.kind === 'end') return '종점 알려진 표고';
    const row = data.rows.find(r => r.id === t.id);
    return `${row?.point || '측점'} · ${FIELD_LABEL[t.field]}`;
  };

  const keypadValue = (t: KeypadTarget): string => {
    if (t.kind === 'start') return data.startBm;
    if (t.kind === 'end') return data.endBm;
    return data.rows.find(r => r.id === t.id)?.[t.field] || '';
  };

  const keypadChange = (t: KeypadTarget, next: string) => {
    if (t.kind === 'start') { setData(prev => ({ ...prev, startBm: next })); return; }
    if (t.kind === 'end') { setData(prev => ({ ...prev, endBm: next })); return; }
    handleRowChange(t.id, t.field, next);
  };

  // CSV 생성 (동적 엑셀 수식 포함)
  const buildCsv = () => {
    const isIh = data.method === 'ih';
    const head = [
      ['표준 레벨 측량 야장'],
      ['사업/노선명', data.title, '측량일', data.mdate, '측량자', data.surveyor],
      ['계산 방식', isIh ? '기계고식 (I.H)' : '승강식 (Rise & Fall)', '최초표고 (BM1)', num(data.startBm) ?? 10.0],
      [],
      isIh
        ? ['측점', '후시 BS (m)', '중시 IS (m)', '전시 FS (m)', '기계고 IH (m)', '지반고 GH (m)', '비고']
        : ['측점', '후시 BS (m)', '중시 IS (m)', '전시 FS (m)', '승 Rise (m)', '강 Fall (m)', '지반고 GH (m)', '비고']
    ];

    const body = computed.rows.map((r, i) => {
      const rNum = 6 + i; // 데이터 6행 시작

      if (isIh) {
        // 기계고식 (I.H)
        const ghFormula = i === 0
          ? `=$D$3`
          : `=IF(NOT(ISBLANK(D${rNum})), E${rNum - 1} - D${rNum}, IF(NOT(ISBLANK(C${rNum})), E${rNum - 1} - C${rNum}, ""))`;

        const ihFormula = `=IF(ISBLANK(B${rNum}), "", F${rNum} + B${rNum})`;

        return [
          r.point,
          r.bs,
          r.is,
          r.fs,
          ihFormula,
          ghFormula,
          r.remarks
        ];
      } else {
        // 승강식 (Rise & Fall)
        const ghFormula = i === 0
          ? `=$D$3`
          : `=IF(NOT(ISBLANK(E${rNum})), G${rNum - 1} + E${rNum}, IF(NOT(ISBLANK(F${rNum})), G${rNum - 1} - F${rNum}, G${rNum - 1}))`;

        const riseStr = r.calcRise !== null && r.calcRise !== undefined ? `+${fmt(r.calcRise)}` : '';
        const fallStr = r.calcFall !== null && r.calcFall !== undefined ? `-${fmt(r.calcFall)}` : '';

        return [
          r.point,
          r.bs,
          r.is,
          r.fs,
          riseStr,
          fallStr,
          ghFormula,
          r.remarks
        ];
      }
    });

    const lastRow = computed.rows.length > 0 ? 6 + computed.rows.length - 1 : 6;
    const sumRow = lastRow + 2;
    const ghRow = lastRow + 3;
    const ghCol = isIh ? 'F' : 'G';

    const footer = [
      [],
      ['합계 ∑BS', `=SUM(B6:B${lastRow})`, '합계 ∑FS', `=SUM(D6:D${lastRow})`, '∑BS - ∑FS', `=B${sumRow}-D${sumRow}`],
      ['최초표고', `=${ghCol}6`, '최종표고', `=${ghCol}${lastRow}`, '최종 - 최초', `=D${ghRow}-B${ghRow}`],
      ['검산 결과', `=IF(ABS(F${sumRow}-F${ghRow})<0.001, "검산 일치 (정상)", "오류 발생")`]
    ];

    return head.concat(body).concat(footer).map(row => row.map(v => {
      const str = v === undefined || v === null ? '' : String(v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\r\n');
  };


  const handleDownloadCsv = async () => {
    const csv = '\uFEFF' + buildCsv();
    const nm = (data.title.trim() || '표준레벨야장').replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `${nm}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });

    // 1. 모바일 Web Share API 우선 지원
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: 'text/csv' })] })) {
      try {
        await navigator.share({
          files: [new File([blob], fileName, { type: 'text/csv' })],
          title: fileName,
        });
        onToast('공유/저장 창을 열었습니다');
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }

    // 2. 브라우저 파일 다운로드
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
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
    const csv = buildCsv();
    const tsv = csv
      .split('\r\n')
      .map(row => row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"'))
        .join('\t')
      )
      .join('\r\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(() => onToast('표를 클립보드에 복사했습니다'));
    } else {
      onToast('복사 미지원 브라우저입니다');
    }
  };

  return (
    <main>
      {/* 1. 기본 설정 및 계산 방식 (접기/펼치기) */}
      <section className="card">
        <h2>
          표준 레벨 설정
          <button type="button" className="mini" onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? '▲ 접기' : '⚙️ 방식/설정 변경'}
          </button>
        </h2>

        {!showSettings ? (
          <div className="settings-summary-bar" onClick={() => setShowSettings(true)}>
            <div className="badges">
              <span className="badge">{data.method === 'ih' ? '기계고식(I.H)' : '승강식(Rise&Fall)'}</span>
              <span className="badge">BM1: {data.startBm}m</span>
              <span className="badge">{data.title || '표준 레벨 야장'}</span>
              {data.endBm && <span className="badge">종점BM: {data.endBm}m</span>}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>⚙️ 변경</span>
          </div>
        ) : (
          <div className="card-body">
            <div className="f wide">
              <label>계산 방식 선택</label>
              <div className="seg">
                <button
                  type="button"
                  aria-pressed={data.method === 'ih'}
                  onClick={() => setData(prev => ({ ...prev, method: 'ih' }))}
                >
                  기계고식 (I.H 방식)
                </button>
                <button
                  type="button"
                  aria-pressed={data.method === 'rise_fall'}
                  onClick={() => setData(prev => ({ ...prev, method: 'rise_fall' }))}
                >
                  승강식 (Rise & Fall)
                </button>
              </div>
            </div>

            <div className="f wide">
              <label>사업 / 노선명</label>
              <div className="ctrl">
                <input
                  type="text"
                  className="t-name"
                  placeholder="00지구 수준측량"
                  value={data.title}
                  onChange={e => setData({ ...data, title: e.target.value })}
                />
              </div>
            </div>

            <div className="f">
              <label>기준점(BM1) 최초표고 <i>m</i></label>
              <div className="ctrl">
                <input
                  type="text"
                  inputMode="none"
                  readOnly
                  placeholder="-1.230"
                  value={data.startBm}
                  onFocus={() => setKeypadTarget({ kind: 'start' })}
                />
              </div>
            </div>

            <div className="f">
              <label>종점 알려진 표고(선택) <i>폐합오차</i></label>
              <div className="ctrl">
                <input
                  type="text"
                  inputMode="none"
                  readOnly
                  placeholder="-1.230"
                  value={data.endBm}
                  onFocus={() => setKeypadTarget({ kind: 'end' })}
                />
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

      {/* 2. 검산 통계 스트립 */}
      <section className="summary">
        <div className="stat">
          <b>합계 ∑BS</b>
          <span>{fmt(computed.sumBs)}</span>
          <em>후시 읽음 총합</em>
        </div>

        <div className="stat">
          <b>합계 ∑FS</b>
          <span>{fmt(computed.sumFs)}</span>
          <em>전시 읽음 총합</em>
        </div>

        <div className="stat">
          <b>∑BS − ∑FS</b>
          <span>{fmt(computed.diffSight)}</span>
          <em>표고 차이</em>
        </div>

        <div className="stat">
          <b>최초 → 최종 표고차</b>
          <span>{fmt(computed.diffGh)}</span>
          <em>최종GH − 최초GH</em>
        </div>

        <div className={`stat check ${!computed.pageCheckPass ? 'bad' : ''}`}>
          <b>야장 검산 (Page Check)</b>
          <span style={{ fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {computed.pageCheckPass ? (
              <><CheckCircle2 size={15} /> 검산 일치</>
            ) : (
              <><AlertCircle size={15} /> 불일치</>
            )}
          </span>
          <em>∑BS − ∑FS = GH차이</em>
        </div>

        {data.endBm && computed.lastGh !== null && (
          <div className="stat">
            <b>폐합 오차</b>
            <span>{fmt((computed.lastGh - (num(data.endBm) || 0)) * 1000, 1)} mm</span>
            <em>실측GH − 알려진GH</em>
          </div>
        )}
      </section>

      {/* 3. 표준 레벨 야장 표 */}
      <section className="card">
        <h2>
          측량 야장표
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" className="mini" aria-pressed={showIs} onClick={() => setShowIs(v => !v)}>
              {showIs ? '중시(IS) 숨기기' : '중시(IS) 표시'}
            </button>
            <button type="button" className="mini" onClick={handleAddRow}>
              + 행 추가
            </button>
          </div>
        </h2>

        <div className="table-wrap">
          {/* width:100% 를 강제하지 않는다 — 관로 야장표(TrenchSurveyTab)와 같은 패턴으로,
              칸이 모자라면 .table-wrap 가로 스크롤이 받아내게 한다. 100%로 묶으면
              IS 열까지 켠 6열이 좁은 폰 화면에 압축되며 숫자 끝자리가 잘린다 */}
          <table>
            <thead>
              <tr>
                {/* 표 auto-layout 은 <input> 의 CSS min-width 를 열 폭 계산에 안 쳐준다 —
                    <th>/<td> 자체에 minWidth 를 줘야 "−1.230" 같은 값이 안 잘린다.
                    모자라면 table-wrap 가로 스크롤이 받는다 (관로 야장표와 동일 패턴) */}
                <th className="c" style={{ width: '48px', padding: '6px 2px' }}>측점</th>
                <th className="n" style={{ minWidth: '62px', padding: '6px 2px' }}>후시(BS)</th>
                {showIs && <th className="n" style={{ minWidth: '62px', padding: '6px 2px' }}>중시(IS)</th>}
                <th className="n" style={{ minWidth: '62px', padding: '6px 2px' }}>전시(FS)</th>
                {data.method === 'ih' ? (
                  <th className="n" style={{ minWidth: '60px', padding: '6px 2px' }}>기계고(IH)</th>
                ) : (
                  <>
                    <th className="n" style={{ minWidth: '56px', padding: '6px 2px' }}>승(+)</th>
                    <th className="n" style={{ minWidth: '56px', padding: '6px 2px' }}>강(−)</th>
                  </>
                )}
                <th className="n" style={{ minWidth: '62px', padding: '6px 2px' }}>지반고(GH)</th>
                <th className="c" style={{ width: '28px', padding: '6px 0' }}></th>
              </tr>
            </thead>
            <tbody>
              {computed.rows.map((r, i) => (
                <tr key={r.id}>
                  {/* 측점 입력: 축소된 공간 & 11px 폰트 */}
                  <td className="c" style={{ width: '48px', padding: '4px 1px' }}>
                    <input
                      type="text"
                      className="point-input"
                      value={r.point}
                      onChange={e => handleRowChange(r.id, 'point', e.target.value)}
                    />
                  </td>

                  {/* 후시 BS — readOnly + 앱 자체 숫자 키패드. 네이티브 키보드를 완전히
                      대체해 기종과 무관하게 "-"가 항상 보장된다 (NumericKeypad 참고) */}
                  <td className="n" style={{ padding: '4px 2px' }}>
                    <input
                      type="text"
                      className="meas-input"
                      inputMode="none"
                      readOnly
                      placeholder="BS"
                      value={r.bs}
                      onFocus={() => setKeypadTarget({ kind: 'row', id: r.id, field: 'bs' })}
                    />
                  </td>

                  {/* 중시 IS — 기본 숨김, "중시(IS) 표시" 토글로만 노출 */}
                  {showIs && (
                    <td className="n" style={{ padding: '4px 2px' }}>
                      <input
                        type="text"
                        className="meas-input"
                        inputMode="none"
                        readOnly
                        placeholder="IS"
                        value={r.is}
                        onFocus={() => setKeypadTarget({ kind: 'row', id: r.id, field: 'is' })}
                      />
                    </td>
                  )}

                  {/* 전시 FS */}
                  <td className="n" style={{ padding: '4px 2px' }}>
                    <input
                      type="text"
                      className="meas-input"
                      inputMode="none"
                      readOnly
                      placeholder="FS"
                      value={r.fs}
                      onFocus={() => setKeypadTarget({ kind: 'row', id: r.id, field: 'fs' })}
                    />
                  </td>

                  {/* 방식별 자동 계산 열 */}
                  {data.method === 'ih' ? (
                    <td className="n grade" style={{ padding: '4px 2px', fontSize: '13.5px', fontWeight: 600 }}>{fmt(r.calcIh)}</td>
                  ) : (
                    <>
                      <td className="n grade" style={{ padding: '4px 2px', fontSize: '13px', color: 'var(--ok)', fontWeight: 600 }}>{r.calcRise ? `+${fmt(r.calcRise)}` : '—'}</td>
                      <td className="n grade" style={{ padding: '4px 2px', fontSize: '13px', color: 'var(--cut)', fontWeight: 600 }}>{r.calcFall ? `-${fmt(r.calcFall)}` : '—'}</td>
                    </>
                  )}

                  {/* 표고/지반고 GH */}
                  <td className="n target" style={{ padding: '4px 2px', fontSize: '14px', fontWeight: 700 }}>{fmt(r.calcGh)}</td>

                  {/* 삭제 버튼 */}
                  <td className="c">
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer' }}
                      onClick={() => handleDeleteRow(r.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="btn ghost" style={{ minWidth: 'auto', padding: '8px 12px' }} onClick={handleAddRow}>
            <Plus size={16} /> 행 추가
          </button>
          <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
            총 {computed.rows.length}개 측점
          </span>
        </div>
      </section>

      {/* 4. 하단 액션 버튼 */}
      <div className="actions">
        <button type="button" className="btn primary" onClick={handleDownloadCsv}>
          <Download size={16} /> CSV 저장
        </button>
        <button type="button" className="btn" onClick={handleCopyTable}>
          <Copy size={16} /> 표 복사
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setData(DEFAULT_DATA);
            onToast('기본값으로 초기화했습니다');
          }}
        >
          <RotateCcw size={16} /> 초기화
        </button>
      </div>

      {/* BS/IS/FS, 최초표고/종점표고 전용 — 숫자 키패드 (네이티브 키보드 대체) */}
      <NumericKeypad
        isOpen={keypadTarget !== null}
        label={keypadTarget ? keypadLabel(keypadTarget) : ''}
        value={keypadTarget ? keypadValue(keypadTarget) : ''}
        onChange={next => keypadTarget && keypadChange(keypadTarget, next)}
        onClose={() => setKeypadTarget(null)}
      />
    </main>
  );
};
