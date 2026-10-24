import React, { useState } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Route as RouteIcon, Play, Upload } from 'lucide-react';
import { ManholeMasterItem, ManholeSystem, MANHOLE_SYSTEMS, SurveyRoute } from '../types/survey';
import { loadRoutes, saveRoutes, buildSpans, lengthDiscrepancy, parseRouteImport } from '../utils/routes';
import { getSavedManholes } from './ManholeDbModal';

/**
 * 노선 관리.
 *
 * 맨홀을 상류에서 하류 순서대로 담으면 연속한 두 맨홀이 한 구간이 된다.
 * 맨홀 N개 → 구간 N-1개. 구간 연장은 좌표로 계산하고, 도면 연장표 값이
 * 함께 있으면 대조해서 어긋날 때 표시한다.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
  /** 노선의 특정 구간으로 측량 시작 */
  onStartSpan: (routeId: string, spanIndex: number) => void;
}

export const RouteModal: React.FC<Props> = ({ isOpen, onClose, onToast, onStartSpan }) => {
  const [routes, setRoutes] = useState<SurveyRoute[]>(() => loadRoutes());
  const [manholes] = useState<ManholeMasterItem[]>(() => getSavedManholes());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [pickerTerm, setPickerTerm] = useState('');
  // 노선 파일의 맨홀명이 다른 시설과 겹칠 때(예: 우수/오수 둘 다 "M1-128") 어느 쪽으로
  // 연결할지 — 비워두면(자동) 기존처럼 먼저 찾은 쪽으로 연결된다.
  const [importSystem, setImportSystem] = useState<ManholeSystem | ''>('');

  if (!isOpen) return null;

  const editing = routes.find(r => r.id === editingId) || null;
  const spans = buildSpans(editing, manholes);

  const persist = (list: SurveyRoute[]) => {
    setRoutes(list);
    saveRoutes(list);
  };

  const touch = (r: SurveyRoute): SurveyRoute => {
    const now = new Date();
    return { ...r, updatedAt: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` };
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      const res = content ? parseRouteImport(content, manholes, importSystem || undefined) : null;
      if (!res) {
        onToast('노선 파일 형식이 아닙니다 (routes 목록이 있는 JSON)');
        return;
      }
      if (res.routes.length === 0) {
        onToast(
          res.missingNames.length
            ? `맨홀DB에 없는 이름뿐입니다 (${res.missingNames.length}종). 맨홀DB를 먼저 올리세요`
            : '가져올 노선이 없습니다'
        );
        return;
      }
      // 노선 파일(특히 종단면도 자동추출) 안에 이름은 같은데 실제로는 전혀 다른 구간인
      // 경우가 실제로 있었다(같은 "OO노선-2"가 서로 다른 맨홀 순서로 2~3번 등장).
      // 이름만 보고 중복 판정하면 목록/3D 노선 선택에서 어느 게 어느 건지 구별이 안 되고,
      // 다음 가져오기 때는 "이미 있는 이름"으로 보여 새 구간이 조용히 무시될 수 있다.
      // 그래서 "완전히 같은 노선(이름+맨홀 순서 둘 다 동일)"만 재가져오기로 보고 건너뛰고,
      // 이름만 같고 내용이 다르면 둘 다 남기되 이름 뒤에 번호를 붙여 구별되게 한다.
      // 식별은 맨홀 순서(manholeIds)만으로 한다 — 이름은 포함하지 않는다. 포함하면,
      // 중복 이름이라 "(2)"를 붙인 뒤에는 원본 이름으로 다시 들어오는 같은 노선을
      // (이름이 달라졌으니) 다른 걸로 오인해 매번 "(3)", "(4)"... 로 계속 새로 붙인다.
      const manholeKey = (r: SurveyRoute) => r.manholeIds.join(',');
      const usedNames = new Set(routes.map(r => r.name));
      const usedManholeKeys = new Set(routes.map(manholeKey));
      const add: SurveyRoute[] = [];
      let skippedExact = 0, renamed = 0;
      for (const r of res.routes) {
        if (usedManholeKeys.has(manholeKey(r))) { skippedExact++; continue; }
        let name = r.name;
        if (usedNames.has(name)) {
          let n = 2;
          while (usedNames.has(`${r.name} (${n})`)) n++;
          name = `${r.name} (${n})`;
          renamed++;
        }
        usedNames.add(name);
        usedManholeKeys.add(manholeKey(r));
        add.push(name === r.name ? r : { ...r, name });
      }
      persist([...add, ...routes]);

      const notes = [`노선 ${add.length}개 추가`];
      if (renamed > 0) notes.push(`이름 중복 ${renamed}개는 번호 붙여 구분`);
      if (skippedExact > 0) notes.push(`완전히 같은 노선 ${skippedExact}개 건너뜀`);
      if (res.dropped > 0) notes.push(`맨홀 부족 ${res.dropped}개 제외`);
      if (res.missingNames.length) notes.push(`DB에 없는 맨홀 ${res.missingNames.length}종`);
      onToast(notes.join(' · '));
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleCreate = () => {
    if (!newName.trim()) {
      onToast('노선 이름을 입력하세요 (예: 오수 간선 1공구)');
      return;
    }
    const route = touch({ id: `route_${Date.now()}`, name: newName.trim(), manholeIds: [], updatedAt: '' });
    persist([route, ...routes]);
    setEditingId(route.id);
    setNewName('');
    onToast(`노선 '${route.name}' 생성 — 맨홀을 순서대로 추가하세요`);
  };

  const updateEditing = (fn: (r: SurveyRoute) => SurveyRoute) => {
    if (!editing) return;
    persist(routes.map(r => (r.id === editing.id ? touch(fn(r)) : r)));
  };

  const addManhole = (mh: ManholeMasterItem) => {
    updateEditing(r => ({ ...r, manholeIds: [...r.manholeIds, mh.id] }));
  };

  const removeAt = (i: number) => {
    updateEditing(r => ({ ...r, manholeIds: r.manholeIds.filter((_, idx) => idx !== i) }));
  };

  const move = (i: number, dir: -1 | 1) => {
    updateEditing(r => {
      const ids = [...r.manholeIds];
      const j = i + dir;
      if (j < 0 || j >= ids.length) return r;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...r, manholeIds: ids };
    });
  };

  const orderedManholes = editing
    ? editing.manholeIds
      .map(id => manholes.find(m => m.id === id))
      .filter((m): m is ManholeMasterItem => !!m)
    : [];

  const candidates = manholes.filter(m =>
    !pickerTerm.trim() || m.name.toLowerCase().includes(pickerTerm.trim().toLowerCase())
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <b><RouteIcon size={15} /> 노선 · 다구간 측량</b>
          <button type="button" className="modal-x" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>

        <div className="modal-body">
          {!editing ? (
            <>
              <div className="route-create">
                <input
                  type="text"
                  placeholder="새 노선 이름 (예: 오수 간선 1공구)"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
                <button type="button" className="btn primary" onClick={handleCreate}>
                  <Plus size={15} /> 만들기
                </button>
              </div>

              {/* 종단면도에서 뽑은 노선 순서를 그대로 받는다 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--ink-2)', fontWeight: 600 }}>맨홀명 겹치면 우선 시설</span>
                <select
                  value={importSystem}
                  onChange={e => setImportSystem(e.target.value as ManholeSystem | '')}
                  style={{ height: '28px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid var(--line)' }}
                  title="이 노선 파일의 맨홀명이 다른 시설에도 같은 이름으로 있으면 여기서 고른 시설 쪽에 연결합니다. 비워두면 먼저 찾은 쪽으로 연결됩니다."
                >
                  <option value="">자동</option>
                  {MANHOLE_SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <label className="btn route-import">
                <Upload size={15} /> 노선 파일 불러오기 (.json)
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                    e.target.value = '';
                  }}
                />
              </label>

              {routes.length === 0 ? (
                <p className="route-empty">
                  아직 노선이 없습니다. 맨홀을 상류에서 하류 순서대로 담으면
                  구간이 자동으로 만들어집니다.
                </p>
              ) : (
                <div className="route-list">
                  {routes.map(r => {
                    const s = buildSpans(r, manholes);
                    return (
                      <div key={r.id} className="route-item">
                        <button type="button" className="route-open" onClick={() => setEditingId(r.id)}>
                          <b>{r.name}</b>
                          <span>맨홀 {r.manholeIds.length}개 · 구간 {s.length}개{r.updatedAt ? ` · ${r.updatedAt}` : ''}</span>
                        </button>
                        <button
                          type="button"
                          className="route-del"
                          onClick={() => {
                            persist(routes.filter(x => x.id !== r.id));
                            onToast(`노선 '${r.name}' 삭제`);
                          }}
                          aria-label={`${r.name} 삭제`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <button type="button" className="route-back" onClick={() => setEditingId(null)}>
                ← 노선 목록
              </button>

              <h3 className="route-title">{editing.name}</h3>

              {/* 노선에 담긴 맨홀 순서 */}
              <div className="route-order">
                {orderedManholes.length === 0 ? (
                  <p className="route-empty">아래에서 맨홀을 순서대로 추가하세요.</p>
                ) : orderedManholes.map((m, i) => (
                  <div key={`${m.id}-${i}`} className="route-node">
                    <span className="route-idx">{i + 1}</span>
                    <span className="route-name">{m.name}</span>
                    <span className="route-el">EL {m.invertEl}</span>
                    <div className="route-node-actions">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로"><ArrowUp size={14} /></button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === orderedManholes.length - 1} aria-label="아래로"><ArrowDown size={14} /></button>
                      <button type="button" onClick={() => removeAt(i)} aria-label="제거"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 구간 목록 */}
              {spans.length > 0 && (
                <div className="span-list">
                  <div className="span-head">구간 {spans.length}개 — 눌러서 측량 시작</div>
                  {spans.map(sp => {
                    const diff = lengthDiscrepancy(sp);
                    const mismatch = diff !== null && Math.abs(diff) > 0.5;
                    return (
                      <button
                        key={sp.index}
                        type="button"
                        className="span-item"
                        onClick={() => {
                          onStartSpan(editing.id, sp.index);
                          onClose();
                        }}
                      >
                        <span className="span-no">{sp.index + 1}</span>
                        <span className="span-name">{sp.start.name} ~ {sp.end.name}</span>
                        <span className="span-len">
                          {sp.length === null ? '연장 없음' : `${sp.length.toFixed(2)} m`}
                          {sp.coordLength !== null && <em> 좌표</em>}
                          {sp.coordLength === null && sp.sheetLength !== null && <em> 도면</em>}
                        </span>
                        {mismatch && (
                          <span className="span-warn">
                            도면 {sp.sheetLength!.toFixed(2)}m와 {Math.abs(diff!).toFixed(2)}m 차이
                          </span>
                        )}
                        <Play size={14} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 맨홀 추가 */}
              <div className="route-picker">
                <input
                  type="text"
                  placeholder="맨홀 검색해서 순서대로 추가..."
                  value={pickerTerm}
                  onChange={e => setPickerTerm(e.target.value)}
                />
                <div className="picker-grid">
                  {candidates.slice(0, 40).map(m => (
                    <button key={m.id} type="button" onClick={() => addManhole(m)}>
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RouteModal;
