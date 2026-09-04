import React, { useState } from 'react';
import { ManholeMasterItem, matchManholeByNameOrNumber, manholeInvertIn, manholeInvertOut, manholeDropM, decodeBranches, manholeIsJunction, branchParseIssues } from '../types/survey';
import { Database, Plus, Trash2, X, FileText, Upload, Search } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
  onSelectManholes?: (startMh: ManholeMasterItem | null, endMh: ManholeMasterItem | null) => void;
  onSelectManhole?: (type: 'start' | 'end', item: ManholeMasterItem) => void;
}

export const MANHOLE_DB_KEY = 'survey_manhole_master_db_v1';

export function getSavedManholes(): ManholeMasterItem[] {
  try {
    const saved = localStorage.getItem(MANHOLE_DB_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 배열이 아닌 값이 저장돼 있으면 호출부의 filter/map 에서 앱이 죽는다
      if (Array.isArray(parsed)) {
        const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
        return parsed
          .filter(item => item && typeof item === 'object')
          .map((item, i) => ({
            id: String(item.id ?? `mh-${i + 1}`),
            name: String(item.name ?? ''),
            invertEl: String(item.invertEl ?? ''),
            invertElOut: str(item.invertElOut),
            remarks: str(item.remarks),
            x: str(item.x),
            y: str(item.y),
            distToNext: str(item.distToNext),
            branches: Array.isArray(item.branches)
              ? item.branches
                  .filter((b: any) => b && typeof b === 'object' && b.name && b.invertEl)
                  .map((b: any) => ({
                    name: String(b.name),
                    dir: b.dir === 'out' ? 'out' : 'in',
                    invertEl: String(b.invertEl),
                    dia: str(b.dia)
                  }))
              : undefined,
            branchIssues: Array.isArray(item.branchIssues)
              ? item.branchIssues.map((s: any) => String(s)).filter(Boolean)
              : undefined
          }));
      }
      console.error('맨홀 DB가 배열이 아닙니다. 기본값으로 대체합니다.');
    }
  } catch (e) {
    console.error(e);
  }
  // 기본 샘플 데이터
  return [
    { id: '1', name: 'MH01', invertEl: '-0.430', remarks: '오수 시점맨홀' },
    { id: '2', name: 'MH02', invertEl: '-0.190', remarks: '오수 중간맨홀' },
    { id: '3', name: 'MH03', invertEl: '0.120', remarks: '오수 종점맨홀' },
    { id: '4', name: 'MH04', invertEl: '0.450', remarks: '우수 1호' }
  ];
}

/**
 * 한 줄을 맨홀 항목으로 파싱한다.
 *
 * 헤더 행이 있으면 열 이름으로 잡고, 없으면 기존 방식(이름·관저고·비고)을 유지한다.
 * 좌표는 6자리 이상 큰 수라 관저고와 섞일 일이 없지만, 열 이름이 있으면 그쪽을 믿는다.
 */
export interface ColumnMap {
  name: number; invertEl: number; x: number; y: number; dist: number; remarks: number; branches: number;
}

const HEADER_PATTERNS: { key: keyof ColumnMap; re: RegExp }[] = [
  { key: 'name', re: /맨홀|번호|명칭|^name$|^mh$/i },
  { key: 'invertEl', re: /관저|인버트|invert|^el$|바닥고/i },
  { key: 'x', re: /^x$|x좌표|경도|easting|^e$/i },
  { key: 'y', re: /^y$|y좌표|위도|northing|^n$/i },
  { key: 'dist', re: /거리|연장|간격|length|dist/i },
  { key: 'remarks', re: /비고|remark|note/i },
  // 3방·4방 합류 맨홀의 추가 연결관 목록 — "이름:in|out:관저고:관경;..." 형식 한 칸
  { key: 'branches', re: /분기|합류|branch/i }
];

export function detectColumns(cells: string[]): ColumnMap | null {
  const map: ColumnMap = { name: -1, invertEl: -1, x: -1, y: -1, dist: -1, remarks: -1, branches: -1 };
  let hits = 0;
  cells.forEach((cell, i) => {
    const c = cell.trim();
    HEADER_PATTERNS.forEach(p => {
      if (map[p.key] === -1 && p.re.test(c)) { map[p.key] = i; hits++; }
    });
  });
  // 맨홀명과 관저고를 못 찾으면 헤더가 아니다
  return hits >= 2 && map.name >= 0 && map.invertEl >= 0 ? map : null;
}

export function parseManholeLine(
  parts: string[], idx: number, cols: ColumnMap | null
): ManholeMasterItem | null {
  const at = (i: number) => (i >= 0 && i < parts.length ? parts[i].trim() : '');

  if (cols) {
    const name = at(cols.name).toUpperCase();
    const el = at(cols.invertEl);
    if (!name || !isFinite(parseFloat(el))) return null;
    return {
      id: `${Date.now()}_${idx}`,
      name,
      invertEl: el,
      x: at(cols.x) || undefined,
      y: at(cols.y) || undefined,
      distToNext: at(cols.dist) || undefined,
      remarks: at(cols.remarks) || undefined,
      branches: decodeBranches(at(cols.branches)),
      branchIssues: (() => {
        const issues = branchParseIssues(at(cols.branches));
        return issues.length ? issues : undefined;
      })()
    };
  }

  // 헤더 없음 — 이름, 관저고, [X, Y], [거리], 나머지는 비고
  if (parts.length < 2) return null;
  const name = parts[0].trim().toUpperCase();
  const el = parts[1].trim();
  if (!name || !isFinite(parseFloat(el))) return null;

  const rest = parts.slice(2).map(p => p.trim());
  // 좌표는 만 단위 이상의 큰 수로 나란히 오는 경우만 좌표로 본다
  const isCoord = (v: string) => isFinite(parseFloat(v)) && Math.abs(parseFloat(v)) >= 10000;
  let x: string | undefined;
  let y: string | undefined;
  let consumed = 0;
  if (rest.length >= 2 && isCoord(rest[0]) && isCoord(rest[1])) {
    x = rest[0]; y = rest[1]; consumed = 2;
  }
  let dist: string | undefined;
  if (rest.length > consumed && isFinite(parseFloat(rest[consumed])) && !isCoord(rest[consumed])) {
    dist = rest[consumed];
    consumed++;
  }

  return {
    id: `${Date.now()}_${idx}`,
    name,
    invertEl: el,
    x, y,
    distToNext: dist,
    remarks: rest.slice(consumed).join(' ').trim() || undefined
  };
}

/** 붙여넣기 텍스트나 파일 내용 전체를 맨홀 목록으로 파싱한다 */
export function parseManholeBlock(content: string): ManholeMasterItem[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  // 쉼표·탭으로 나뉜 파일은 빈 칸도 자리를 지켜야 한다.
  // 빈 칸을 걸러내면 뒤 열이 앞으로 밀려 좌표가 관저고 자리에 들어간다.
  const split = (l: string) =>
    /[,\t]/.test(l) ? l.split(/[,\t]/) : l.split(/\s+/).filter(Boolean);

  // 첫 줄이 헤더인지 판단
  const cols = detectColumns(split(lines[0]));
  const body = cols ? lines.slice(1) : lines;

  const out: ManholeMasterItem[] = [];
  body.forEach((line, idx) => {
    // 헤더를 못 잡았는데 머리글처럼 보이는 줄은 건너뛴다
    if (!cols && /맨홀|관저고|invert/i.test(line) && !/-?\d/.test(line.replace(/[^\d.-]/g, ''))) return;
    const item = parseManholeLine(split(line), idx, cols);
    if (item) out.push(item);
  });
  return out;
}

export function saveManholeList(list: ManholeMasterItem[]) {
  try {
    localStorage.setItem(MANHOLE_DB_KEY, JSON.stringify(list));
  } catch (e) {
    console.error(e);
  }
}

export const ManholeDbModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onToast,
  onSelectManhole
}) => {
  const [items, setItems] = useState<ManholeMasterItem[]>(() => getSavedManholes());
  const [mhName, setMhName] = useState('');
  const [invertEl, setInvertEl] = useState('');
  const [invertElOut, setInvertElOut] = useState('');
  const [remarks, setRemarks] = useState('');
  const [coordX, setCoordX] = useState('');
  const [coordY, setCoordY] = useState('');
  const [distNext, setDistNext] = useState('');
  const [batchText, setBatchText] = useState('');
  const [showBatchInput, setShowBatchInput] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const handleAddItem = () => {
    if (!mhName.trim()) {
      onToast('맨홀 명칭(예: MH01)을 입력해주세요');
      return;
    }
    if (!invertEl.trim()) {
      onToast('관저고(EL)를 입력해주세요');
      return;
    }

    const newItem: ManholeMasterItem = {
      id: Date.now().toString(),
      name: mhName.trim().toUpperCase(),
      invertEl: invertEl.trim(),
      invertElOut: invertElOut.trim() || undefined,
      remarks: remarks.trim() || undefined,
      x: coordX.trim() || undefined,
      y: coordY.trim() || undefined,
      distToNext: distNext.trim() || undefined
    };

    const updated = [newItem, ...items.filter(i => i.name.toUpperCase() !== newItem.name)];
    setItems(updated);
    saveManholeList(updated);
    setMhName('');
    setInvertEl('');
    setInvertElOut('');
    setRemarks('');
    setCoordX('');
    setCoordY('');
    setDistNext('');
    const drop = manholeDropM(newItem);
    onToast(
      drop !== null
        ? `✅ '${newItem.name}' 등록 완료 — 낙차맨홀 (유입 ${newItem.invertEl} → 유출 ${newItem.invertElOut}m, Δ${Math.abs(drop).toFixed(2)}m)`
        : `✅ '${newItem.name}' 관저고(${newItem.invertEl}m) 등록 완료`
    );
  };

  const handleBatchImport = () => {
    if (!batchText.trim()) return;
    const newItems = parseManholeBlock(batchText);

    if (newItems.length === 0) {
      onToast('형식에 맞게 입력해주세요 (예: MH01 -0.430 195432.12 452110.45 75)');
      return;
    }

    // 이름 중복 제거 후 합치기
    const existingNames = new Set(newItems.map(i => i.name));
    const merged = [...newItems, ...items.filter(i => !existingNames.has(i.name))];

    setItems(merged);
    saveManholeList(merged);
    setBatchText('');
    setShowBatchInput(false);
    onToast(`🎉 ${newItems.length}개 CAD 맨홀 관저고 일괄 등록 완료!`);
  };

  /**
   * UTF-8로 먼저 시도하고, 유효하지 않은 바이트가 나오면 한글 윈도우 엑셀이 자주 저장하는
   * CP949/EUC-KR로 다시 디코딩한다. "CSV UTF-8(쉼표로 분리)"이 아니라 그냥 "CSV(쉼표로 분리)"나
   * "텍스트(탭으로 분리)"로 저장하면 실제로는 CP949 바이트인데, 이걸 UTF-8로 강제로 읽으면
   * 한글(비고·분기정보 등)이 마름모/물음표로 깨지고, 헤더 인식(예: "분기정보")도 실패해
   * 컬럼 매핑까지 어긋난다 — 파일명·확장자만으로는 실제 인코딩을 알 수 없어 내용으로 판별한다.
   */
  const decodeCsvBuffer = (buf: ArrayBuffer): string => {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      try {
        return new TextDecoder('euc-kr').decode(buf);
      } catch {
        return new TextDecoder('utf-8').decode(buf);
      }
    }
  };

  // CSV/TXT 파일 읽기 핸들러
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer | null;
      if (!buf) return;
      const content = decodeCsvBuffer(buf);
      if (!content) return;

      const newItems = parseManholeBlock(content);

      if (newItems.length === 0) {
        onToast('파일에서 유효한 맨홀 데이터를 찾지 못했습니다 (형식: MH01, -0.430, X, Y, 거리)');
        return;
      }

      const existingNames = new Set(newItems.map(i => i.name));
      const merged = [...newItems, ...items.filter(i => !existingNames.has(i.name))];

      setItems(merged);
      saveManholeList(merged);
      onToast(`📁 '${file.name}' 파일에서 ${newItems.length}개 맨홀 DB 등록 완료!`);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDeleteItem = (id: string, name: string) => {
    const updated = items.filter(i => i.id !== id);
    setItems(updated);
    saveManholeList(updated);
    onToast(`삭제되었습니다: ${name}`);
  };

  const handleApplyToSurvey = (type: 'start' | 'end', item: ManholeMasterItem) => {
    if (onSelectManhole) {
      // 연장이 함께 정해지므로 안내는 호출한 쪽이 띄운다.
      // 여기서 또 띄우면 연장 정보를 담은 메시지를 덮어쓴다.
      onSelectManhole(type, item);
      return;
    }
    // 시점(start)은 이 구간으로 물이 나가는 쪽 → 유출관저고, 종점(end)은 들어오는 쪽 → 유입관저고.
    // 낙차맨홀이 아니면 두 값이 같아 기존과 동일하게 동작한다.
    const applied = type === 'start' ? manholeInvertOut(item) : manholeInvertIn(item);
    {
      try {
        const saved = localStorage.getItem('survey_trench_data_v2');
        const data = saved ? JSON.parse(saved) : {};
        if (type === 'start') {
          data.startMhName = item.name;
          data.startInv = applied;
        } else {
          data.endMhName = item.name;
          data.endInv = applied;
          // 종점 맨홀 자신의 터파기/바닥 측량 기준(MH_* 모드용) — 낙차맨홀이면 유출관저고가 더 낮다
          data.endMhOutInv = manholeInvertOut(item);
        }
        data.secName = `${data.startMhName || '시점'} ~ ${data.endMhName || '종점'}`;
        localStorage.setItem('survey_trench_data_v2', JSON.stringify(data));
        window.dispatchEvent(new Event('storage'));
      } catch (e) {
        console.error(e);
      }
    }
    onToast(`⚡ '${item.name}' 관저고(${applied}m)가 야장 ${type === 'start' ? '시점' : '종점'}으로 적용되었습니다!`);
  };

  const filteredItems = items.filter(i =>
    matchManholeByNameOrNumber(searchTerm, i.name, i.remarks)
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 110,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0 0 calc(12px + env(safe-area-inset-bottom)) 0'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          backgroundColor: 'var(--surface)',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          border: '1px solid var(--line)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--line-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '15px' }}>
            <Database size={18} className="text-blue-500" />
            CAD 맨홀 관저고(Inv EL) DB 관리
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-2)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 바디 내용 */}
        <div style={{ padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 새 맨홀 등록폼 */}
          <div style={{ background: 'var(--surface-2)', padding: '12px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-2)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
              <span>➕ 맨홀 관저고 신규 등록</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <label className="btn mini" style={{ fontSize: '10.5px', padding: '2px 8px', cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <FileText size={12} /> 📁 CSV/TXT 파일 업로드
                  <input
                    type="file"
                    accept=".csv,.txt,.tsv"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setShowBatchInput(!showBatchInput)}
                  style={{ fontSize: '10.5px' }}
                >
                  {showBatchInput ? '개별 입력' : '📋 텍스트 붙여넣기'}
                </button>
              </div>
            </div>

            {showBatchInput ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  rows={4}
                  placeholder={`CAD 수치 붙여넣기 — 헤더가 있으면 열 이름으로 자동 인식합니다.\n\n맨홀명, 관저고, X, Y, 거리, 비고\nMH01, -0.430, 195432.12, 452110.45, 75, 오수시점\nMH02, -0.190, 195480.33, 452168.10, 62\n\n헤더 없이 'MH01 -0.430' 두 열만 넣어도 됩니다.`}
                  value={batchText}
                  onChange={e => setBatchText(e.target.value)}
                  style={{ width: '100%', fontSize: '12px', padding: '8px', borderRadius: '6px', border: '1px solid var(--line)' }}
                />
                <button className="btn primary" onClick={handleBatchImport} style={{ height: '36px' }}>
                  <Upload size={14} /> CAD 맨홀 관저고 일괄 등록
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="맨홀명 (예: MH01)"
                  value={mhName}
                  onChange={e => setMhName(e.target.value)}
                  style={{ height: '36px', fontSize: '13px' }}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="관저고 (예: -0.430)"
                  value={invertEl}
                  onChange={e => setInvertEl(e.target.value)}
                  style={{ height: '36px', fontSize: '13px' }}
                />
                <input
                  type="text"
                  placeholder="비고 (선택)"
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  style={{ height: '36px', fontSize: '13px' }}
                />
                <button className="btn primary" onClick={handleAddItem} style={{ height: '36px', padding: '0 10px', minWidth: 'auto' }}>
                  <Plus size={16} /> 등록
                </button>

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="유출관저고 (낙차맨홀만, 선택)"
                  value={invertElOut}
                  onChange={e => setInvertElOut(e.target.value)}
                  title="유입관저고와 다르면 낙차맨홀로 처리됩니다. 비워두면 일반 맨홀입니다."
                  style={{ height: '36px', fontSize: '13px', gridColumn: 'span 3' }}
                />

                {/* 좌표·연장 — 구간 연장 자동 산출용 */}
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="X 좌표 (선택)"
                  value={coordX}
                  onChange={e => setCoordX(e.target.value)}
                  style={{ height: '36px', fontSize: '13px' }}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Y 좌표 (선택)"
                  value={coordY}
                  onChange={e => setCoordY(e.target.value)}
                  style={{ height: '36px', fontSize: '13px' }}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="다음 맨홀까지 거리 (선택)"
                  value={distNext}
                  onChange={e => setDistNext(e.target.value)}
                  style={{ height: '36px', fontSize: '13px', gridColumn: 'span 2' }}
                />
              </div>
            )}
          </div>

          {/* 저장된 맨홀 검색 및 리스트 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-2)' }}>
                📍 등록된 맨홀 DB ({items.length}개)
              </span>
              <div style={{ position: 'relative', width: '180px' }}>
                <input
                  type="text"
                  placeholder="검색 (이름 또는 숫자 예: 1, 01)..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ height: '28px', fontSize: '11px', paddingLeft: '22px', width: '100%' }}
                />
                <Search size={12} style={{ position: 'absolute', left: '6px', top: '8px', color: 'var(--ink-3)' }} />
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--ink-3)', fontSize: '12.5px' }}>
                검색된 맨홀 데이터가 없습니다. (숫자로 검색: 예: 1, 01)
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '350px', overflowY: 'auto' }}>
                {filteredItems.map(item => {
                  const drop = manholeDropM(item);
                  const junction = manholeIsJunction(item);
                  return (
                  <div
                    key={item.id}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'var(--surface-2)',
                      border: drop !== null ? '1px solid var(--fill)' : '1px solid var(--line)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '6px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--primary)', minWidth: '55px' }}>
                        {item.name}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                        관저고 EL <b style={{ color: 'var(--ink)', fontSize: '14px' }}>
                          {drop !== null ? `${item.invertEl} → ${item.invertElOut}` : item.invertEl} m
                        </b>
                      </span>
                      {drop !== null && (
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '999px',
                            border: '1px solid var(--fill)',
                            background: 'var(--fill-bg)',
                            color: 'var(--fill)'
                          }}
                          title="유입관저고와 유출관저고가 달라 낙차가 있는 맨홀입니다"
                        >
                          ⚡ 낙차맨홀 Δ{Math.abs(drop).toFixed(2)}m
                        </span>
                      )}
                      {junction && (
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '999px',
                            border: '1px solid var(--primary)',
                            background: 'var(--primary-bg)',
                            color: 'var(--primary)'
                          }}
                          title={`추가 연결관 ${item.branches!.length}개 — 야장 화면의 방사형 다이어그램에서 확인`}
                        >
                          🔀 합류 {item.branches!.length}
                        </span>
                      )}
                      {item.branchIssues && item.branchIssues.length > 0 && (
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '999px',
                            border: '1px solid var(--cut)',
                            background: 'var(--cut-bg)',
                            color: 'var(--cut)'
                          }}
                          title={`분기정보 형식이 안 맞아 건너뛴 항목 — 관저고 값을 확인하세요: ${item.branchIssues.join(', ')}`}
                        >
                          ⚠️ 분기정보 오류 {item.branchIssues.length}
                        </span>
                      )}
                      {item.remarks && (
                        <span style={{ fontSize: '11px', color: 'var(--ink-3)' }}>
                          ({item.remarks})
                        </span>
                      )}
                      {(item.x || item.distToNext) && (
                        <span style={{ fontSize: '10.5px', color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                          {item.x && item.y ? '📐 좌표' : ''}
                          {item.distToNext ? ` ↔ ${item.distToNext}m` : ''}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => handleApplyToSurvey('start', item)}
                        style={{
                          fontSize: '11px',
                          padding: '3px 7px',
                          borderRadius: '5px',
                          border: '1px solid var(--primary)',
                          background: 'var(--primary-bg)',
                          color: 'var(--primary)',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                        title="야장 시점 맨홀로 전송 적용"
                      >
                        🚩 시점 적용
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyToSurvey('end', item)}
                        style={{
                          fontSize: '11px',
                          padding: '3px 7px',
                          borderRadius: '5px',
                          border: '1px solid var(--ok)',
                          background: 'rgba(34, 197, 94, 0.1)',
                          color: 'var(--ok)',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                        title="야장 종점 맨홀로 전송 적용"
                      >
                        🏁 종점 적용
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id, item.name)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--ink-3)',
                          padding: '4px',
                          cursor: 'pointer'
                        }}
                        title="삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

