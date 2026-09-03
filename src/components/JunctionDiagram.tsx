import React from 'react';
import { ManholeMasterItem } from '../types/survey';

/**
 * 3방·4방 합류(분기) 맨홀 방사형 다이어그램.
 *
 * M2-91처럼 한 맨홀에 유입·유출관이 여러 갈래이고 관저고까지 제각각이면,
 * 시점/종점 두 값만 보는 야장 화면에서는 "이 맨홀에 조심할 게 있다"는 사실
 * 자체를 놓치기 쉽다. 맨홀DB의 X·Y 좌표로 각 연결관의 실제 방향을 계산해
 * 화살표(유입=안으로, 유출=밖으로)와 관저고를 한 그림에 모아 보여준다.
 * 좌표를 모르면 균등 배치로 대체한다 — 방향은 부정확해도 "몇 개가, 각각
 * 얼마 높이로 붙어 있는지"는 여전히 한눈에 들어온다.
 */

interface Props {
  /** 다이어그램 중심 맨홀 */
  center: ManholeMasterItem;
  /** 좌표 조회용 — 전체 맨홀DB */
  allManholes: ManholeMasterItem[];
  /** 강조 표시할 상대 맨홀명 — 지금 야장에서 측량 중인 구간의 반대쪽 */
  highlightNames?: string[];
}

const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2 + 6;
const HUB_R = 26;
const IN_R = 36;
const OUT_R = 108;
const LABEL_R = 122;

const num = (v?: string) => {
  const n = parseFloat(v || '');
  return isFinite(n) ? n : null;
};

/**
 * 두 맨홀 좌표로 각도(라디안, 수학 관습 — 오른쪽 0°, 위쪽 +90°)를 구한다.
 * 좌표가 없으면 null. 중심점과 사실상 같은 위치(신뢰 못 할 보간·중복 좌표 —
 * 실측 관로는 대개 수십m 이상 떨어져 있으므로 몇 m 이내면 좌표 오류로 본다)도
 * null로 처리해 fallback 균등 배치를 쓰게 한다 — 안 그러면 다른 정상 분기와
 * 거의 같은 각도가 나와 화살표가 겹쳐서 안 보이는 문제가 생긴다.
 */
const MIN_RELIABLE_DIST_M = 5;

function coordAngle(center: ManholeMasterItem, otherName: string, all: ManholeMasterItem[]): number | null {
  const cx = num(center.x);
  const cy = num(center.y);
  if (cx === null || cy === null) return null;
  const other = all.find(m => m.name.toUpperCase() === otherName.toUpperCase().trim());
  if (!other) return null;
  const ox = num(other.x);
  const oy = num(other.y);
  if (ox === null || oy === null) return null;
  const dx = ox - cx;
  const dy = oy - cy;
  if (Math.hypot(dx, dy) < MIN_RELIABLE_DIST_M) return null;
  return Math.atan2(dy, dx);
}

/** 좌표를 모르는 분기는 원래 배열 순서대로 원 둘레에 균등 배치한다 (12시 방향에서 시계방향) */
function fallbackAngle(index: number, total: number): number {
  const deg = 90 - (360 / Math.max(1, total)) * index;
  return (deg * Math.PI) / 180;
}

const pt = (angle: number, r: number) => ({
  x: CX + r * Math.cos(angle),
  y: CY - r * Math.sin(angle)
});

export const JunctionDiagram: React.FC<Props> = ({ center, allManholes, highlightNames }) => {
  const branches = center.branches || [];
  if (branches.length === 0) return null;

  const hl = new Set((highlightNames || []).filter(Boolean).map(n => n.toUpperCase().trim()));

  const entries = branches.map((b, i) => {
    const angle = coordAngle(center, b.name, allManholes) ?? fallbackAngle(i, branches.length);
    const inner = pt(angle, IN_R);
    const outer = pt(angle, OUT_R);
    const label = pt(angle, LABEL_R);
    const isIn = b.dir === 'in';
    const active = hl.has(b.name.toUpperCase().trim());
    // 유입은 바깥→안, 유출은 안→바깥으로 그어 화살표가 실제 흐름 방향을 가리키게 한다
    const [x1, y1, x2, y2] = isIn ? [outer.x, outer.y, inner.x, inner.y] : [inner.x, inner.y, outer.x, outer.y];
    // 라벨이 선을 가로지르지 않도록 방향에 맞춰 정렬
    const cos = Math.cos(angle);
    const anchor: 'start' | 'end' | 'middle' = cos > 0.35 ? 'start' : cos < -0.35 ? 'end' : 'middle';
    return { branch: b, angle, x1, y1, x2, y2, label, isIn, active, anchor, key: `${b.name}-${b.dir}-${i}` };
  });

  return (
    <svg
      className="junction-diagram"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={`${center.name} 합류 맨홀 방사형 다이어그램`}
    >
      <defs>
        <marker id="jd-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="jd-arrowhead" />
        </marker>
        <marker id="jd-arrow-hl" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="jd-arrowhead active" />
        </marker>
      </defs>

      {entries.map(e => (
        <line
          key={e.key}
          x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
          className={`jd-pipe ${e.isIn ? 'in' : 'out'} ${e.active ? 'active' : ''}`}
          markerEnd={`url(#${e.active ? 'jd-arrow-hl' : 'jd-arrow'})`}
        />
      ))}

      {/* 맨홀 허브 */}
      <circle cx={CX} cy={CY} r={HUB_R} className="jd-hub" />
      <text x={CX} y={CY + 4} textAnchor="middle" className="jd-hub-label">{center.name}</text>

      {entries.map(e => (
        <g key={`lbl-${e.key}`} className={`jd-label-g ${e.active ? 'active' : ''}`}>
          <text x={e.label.x} y={e.label.y - 3} textAnchor={e.anchor} className="jd-name">
            {e.active ? '🎯 ' : ''}{e.branch.name}
          </text>
          <text x={e.label.x} y={e.label.y + 11} textAnchor={e.anchor} className="jd-el">
            {e.isIn ? '유입' : '유출'} {parseFloat(e.branch.invertEl).toFixed(3)}
            {e.branch.dia ? ` · D${e.branch.dia}` : ''}
          </text>
        </g>
      ))}
    </svg>
  );
};

export default JunctionDiagram;
