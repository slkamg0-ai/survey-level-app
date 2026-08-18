import React, { useState, useEffect } from 'react';
import { StandardSurveyData, StandardRow, StandardMethod } from '../types/survey';
import { Plus, Trash2, Download, Copy, RotateCcw, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';

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

export const StandardLevelTab: React.FC<Props> = ({ onUpdateHeader, onToast, loadedData, onClearLoadedData }) => {
  const [data, setData] = useState<StandardSurveyData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_DATA;
    } catch {
      return DEFAULT_DATA;
    }
  });

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

  const num = (v: string): number | null => {
    const parsed = parseFloat(v.replace(/[^0-9.+-]/g, ''));
    return isFinite(parsed) ? parsed : null;
  };

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
          if (bsVal !== null && calcGh !== null) {
            currentIh = calcGh + bsVal;
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
          } else {
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


  const handleDownloadCsv = () => {
    const csv = '\uFEFF' + buildCsv();
    const nm = (data.title.trim() || '표준레벨야장').replace(/[\\/:*?"<>|]/g, '_');
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
                  inputMode="decimal"
                  placeholder="10.000"
                  value={data.startBm}
                  onChange={e => setData({ ...data, startBm: e.target.value })}
                />
              </div>
            </div>

            <div className="f">
              <label>종점 알려진 표고(선택) <i>폐합오차</i></label>
              <div className="ctrl">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="10.000"
                  value={data.endBm}
                  onChange={e => setData({ ...data, endBm: e.target.value })}
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
          <button type="button" className="mini" onClick={handleAddRow}>
            + 행 추가
          </button>
        </h2>

        <div className="table-wrap">
          <table style={{ tableLayout: 'auto', width: '100%' }}>
            <thead>
              <tr>
                <th className="c" style={{ width: '48px', padding: '6px 2px' }}>측점</th>
                <th className="n" style={{ padding: '6px 2px' }}>후시(BS)</th>
                <th className="n" style={{ padding: '6px 2px' }}>중시(IS)</th>
                <th className="n" style={{ padding: '6px 2px' }}>전시(FS)</th>
                {data.method === 'ih' ? (
                  <th className="n" style={{ padding: '6px 2px' }}>기계고(IH)</th>
                ) : (
                  <>
                    <th className="n" style={{ padding: '6px 2px' }}>승(+)</th>
                    <th className="n" style={{ padding: '6px 2px' }}>강(−)</th>
                  </>
                )}
                <th className="n" style={{ padding: '6px 2px' }}>지반고(GH)</th>
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

                  {/* 후시 BS */}
                  <td className="n" style={{ padding: '4px 2px' }}>
                    <input
                      type="text"
                      className="meas-input"
                      inputMode="decimal"
                      placeholder="BS"
                      value={r.bs}
                      onChange={e => handleRowChange(r.id, 'bs', e.target.value)}
                    />
                  </td>

                  {/* 중시 IS */}
                  <td className="n" style={{ padding: '4px 2px' }}>
                    <input
                      type="text"
                      className="meas-input"
                      inputMode="decimal"
                      placeholder="IS"
                      value={r.is}
                      onChange={e => handleRowChange(r.id, 'is', e.target.value)}
                    />
                  </td>

                  {/* 전시 FS */}
                  <td className="n" style={{ padding: '4px 2px' }}>
                    <input
                      type="text"
                      className="meas-input"
                      inputMode="decimal"
                      placeholder="FS"
                      value={r.fs}
                      onChange={e => handleRowChange(r.id, 'fs', e.target.value)}
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
    </main>
  );
};
