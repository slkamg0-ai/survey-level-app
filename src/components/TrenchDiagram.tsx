import React from 'react';
import { TargetHeightMode } from '../types/survey';

/**
 * 터파기 단면 층구성 그래픽.
 *
 * 바쁜 현장에서 숫자 표만으로는 지금 어느 면을 잡는 중인지 헷갈린다.
 * 실제 단면 그대로 아래에서 위로 쌓아 보여주고, 오늘 검측하는 면 하나만
 * 붉은 파선으로 가로지르게 해서 한눈에 잡히게 한다.
 *
 * 두께가 0인 층은 아예 그리지 않는다. 쓰지 않는 기초가 계산에만 남아 있는
 * 상태를 눈으로 잡아내는 것이 이 그림의 핵심 목적이다.
 */

interface Props {
  /** 시점 관저고 (m) — 그림의 기준 EL */
  invEl: number | null;
  sand: number;
  conc: number;
  agg: number;
  /** 관두께 (m) */
  t: number;
  /** 관경 (m) */
  dia: number | null;
  /** 맨홀 바닥 슬래브 두께 (m) */
  mhBase: number;
  mode: TargetHeightMode;
}

/* 도면 좌표 */
const W = 300;
const WALL_L = 22;      // 터파기 좌측 벽
const WALL_R = 104;     // 터파기 우측 벽
const GROUND_W = 16;    // 원지반 폭
const LABEL_X = 126;    // 라벨 시작
const EL_X = W - 4;     // EL 우측 정렬 기준
const TOP_PAD = 16;
const BOTTOM_PAD = 20;
const MIN_BAND = 22;
const MAX_BAND = 54;
const PX_PER_M = 150;
const LABEL_GAP = 13;   // 라벨끼리 최소 간격

interface Band {
  key: string;
  label: string;
  thickness: number;
  fill: string;
  /** 이 층 상단의 화면 y */
  topY: number;
  /** 이 층 상단의 EL */
  topEl: number;
  height: number;
}

const bandPx = (th: number) => Math.min(MAX_BAND, Math.max(MIN_BAND, th * PX_PER_M));

export const TrenchDiagram: React.FC<Props> = ({ invEl, sand, conc, agg, t, dia, mhBase, mode }) => {
  const isMh = mode.startsWith('MH_');

  if (invEl === null) {
    return (
      <div className="diagram-empty">
        관저고와 연장을 입력하면 터파기 단면이 표시됩니다.
      </div>
    );
  }

  /* ── 층 쌓기 (아래에서 위로) ─────────────────────── */
  const stack: { key: string; label: string; thickness: number; fill: string }[] = [];
  if (agg > 0) stack.push({ key: 'agg', label: '골재/잡석', thickness: agg, fill: 'var(--dg-agg)' });
  if (conc > 0) stack.push({ key: 'conc', label: '콘크리트기초', thickness: conc, fill: 'var(--dg-conc)' });
  if (!isMh && sand > 0) stack.push({ key: 'sand', label: '모래기초', thickness: sand, fill: 'var(--dg-sand)' });
  if (isMh && mhBase > 0) stack.push({ key: 'slab', label: '맨홀 바닥슬래브', thickness: mhBase, fill: 'var(--dg-conc)' });

  const tPx = Math.max(2, t * PX_PER_M);
  const diaPx = dia !== null && dia > 0 && dia < 3 ? Math.min(64, Math.max(26, dia * PX_PER_M)) : 30;
  const pipePx = isMh ? 46 : diaPx + tPx * 2;

  const stackPx = stack.reduce((s, b) => s + bandPx(b.thickness), 0);
  const H = TOP_PAD + pipePx + stackPx + BOTTOM_PAD;

  // 터파기 바닥
  const yCutBottom = H - BOTTOM_PAD;
  const elCutBottom = invEl - (isMh ? mhBase + conc + agg : t + sand + conc + agg);

  const bands: Band[] = [];
  let y = yCutBottom;
  let elAcc = elCutBottom;
  stack.forEach(b => {
    const h = bandPx(b.thickness);
    const topY = y - h;
    elAcc += b.thickness;
    bands.push({ ...b, topY, topEl: elAcc, height: h });
    y = topY;
  });

  // 관(또는 맨홀) 바닥이 놓이는 면
  const yBedTop = y;
  const yInvert = isMh ? yBedTop : yBedTop - tPx;
  const yCrown = yBedTop - pipePx;
  const elInvert = invEl;
  const elCrown = invEl + (dia !== null ? dia : 0) + t;

  /* ── 검측 대상면 ─────────────────────────────────── */
  const targetY = (() => {
    switch (mode) {
      case 'CUT_BOTTOM':
      case 'MH_CUT': return yCutBottom;
      case 'AGGREGATE_TOP':
      case 'MH_AGGREGATE': return bands.find(b => b.key === 'agg')?.topY ?? yCutBottom;
      case 'CONCRETE_TOP':
      case 'MH_CONCRETE': return bands.find(b => b.key === 'conc')?.topY ?? yCutBottom;
      case 'SAND_TOP': return bands.find(b => b.key === 'sand')?.topY ?? yBedTop;
      case 'INVERT':
      case 'MH_INVERT': return yInvert;
      case 'CROWN': return yCrown;
      default: return null;
    }
  })();

  /* ── 라벨 (겹치면 위로 밀어낸다) ──────────────────── */
  const labels: { key: string; text: string; el: number; y: number; anchorY: number; active: boolean }[] = [];
  const addLabel = (key: string, text: string, el: number, at: number, active: boolean) =>
    labels.push({ key, text, el, y: at, anchorY: at, active });

  addLabel('cut', '터파기 바닥', elCutBottom, yCutBottom, mode === 'CUT_BOTTOM' || mode === 'MH_CUT');
  bands.forEach(b => {
    addLabel(b.key, b.label, b.topEl, b.topY,
      (b.key === 'agg' && (mode === 'AGGREGATE_TOP' || mode === 'MH_AGGREGATE'))
      || (b.key === 'conc' && (mode === 'CONCRETE_TOP' || mode === 'MH_CONCRETE'))
      || (b.key === 'sand' && mode === 'SAND_TOP')
      || (b.key === 'slab' && mode === 'MH_INVERT'));
  });
  if (!isMh) {
    addLabel('inv', '관저고', elInvert, yInvert, mode === 'INVERT');
    if (dia !== null && dia > 0 && dia < 3) {
      addLabel('crown', '관상단', elCrown, yCrown, mode === 'CROWN');
    }
  }

  // 아래에서 위로 훑으며 최소 간격 확보 (anchorY 는 실제 면 위치라 건드리지 않는다)
  labels.sort((a, b) => b.y - a.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i - 1].y - labels[i].y < LABEL_GAP) {
      labels[i].y = labels[i - 1].y - LABEL_GAP;
    }
  }

  const cx = (WALL_L + WALL_R) / 2;

  return (
    <svg
      className="trench-diagram"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="터파기 단면 층 구성"
    >
      {/* 원지반 (터파기 양옆) */}
      <rect x={WALL_L - GROUND_W} y={TOP_PAD} width={GROUND_W} height={yCutBottom - TOP_PAD} fill="var(--dg-ground)" />
      <rect x={WALL_R} y={TOP_PAD} width={GROUND_W} height={yCutBottom - TOP_PAD} fill="var(--dg-ground)" />

      {/* 터파기 벽·바닥 윤곽 */}
      <path
        d={`M ${WALL_L} ${TOP_PAD} L ${WALL_L} ${yCutBottom} L ${WALL_R} ${yCutBottom} L ${WALL_R} ${TOP_PAD}`}
        fill="none"
        stroke="var(--dg-outline)"
        strokeWidth="1.5"
      />

      {/* 기초 층 */}
      {bands.map(b => (
        <rect
          key={b.key}
          x={WALL_L}
          y={b.topY}
          width={WALL_R - WALL_L}
          height={b.height}
          fill={b.fill}
          stroke="var(--dg-outline)"
          strokeWidth="0.75"
        />
      ))}

      {/* 관 또는 맨홀 */}
      {isMh ? (
        <g>
          <rect x={WALL_L + 8} y={yCrown} width={WALL_R - WALL_L - 16} height={pipePx}
            fill="none" stroke="var(--dg-outline)" strokeWidth="1.5" />
          <rect x={WALL_L + 8} y={yCrown} width={9} height={pipePx} fill="var(--dg-conc)" />
          <rect x={WALL_R - 17} y={yCrown} width={9} height={pipePx} fill="var(--dg-conc)" />
        </g>
      ) : (
        <g>
          <circle cx={cx} cy={yBedTop - pipePx / 2} r={pipePx / 2}
            fill="var(--dg-pipe)" stroke="var(--dg-outline)" strokeWidth="1.5" />
          <circle cx={cx} cy={yBedTop - pipePx / 2} r={Math.max(2, diaPx / 2)}
            fill="var(--dg-pipe-in)" stroke="var(--dg-outline)" strokeWidth="0.75" />
        </g>
      )}

      {/* 오늘 잡는 면. 라벨 글씨를 가리지 않도록 라벨 열 앞에서 끊는다 */}
      {targetY !== null && (
        <g>
          <line x1={12} y1={targetY} x2={LABEL_X - 10} y2={targetY}
            stroke="var(--dg-target)" strokeWidth="2" strokeDasharray="6 4" />
          <polygon points={`2,${targetY - 4.5} 12,${targetY} 2,${targetY + 4.5}`} fill="var(--dg-target)" />
        </g>
      )}

      {/* 라벨 */}
      {labels.map(l => (
        <g key={l.key}>
          {/* 라벨이 겹쳐 밀려났을 수 있으므로 실제 면(anchorY)에서 라벨로 잇는다 */}
          <line
            x1={WALL_R + GROUND_W} y1={l.anchorY}
            x2={LABEL_X - 4} y2={l.y}
            stroke="var(--dg-leader)" strokeWidth="0.75" strokeDasharray="2 2"
          />
          <text
            x={LABEL_X} y={l.y + 3.5}
            className={`dg-label ${l.active ? 'active' : ''}`}
          >
            {l.text}
          </text>
          <text
            x={EL_X} y={l.y + 3.5} textAnchor="end"
            className={`dg-el ${l.active ? 'active' : ''}`}
          >
            {l.el.toFixed(3)}
          </text>
        </g>
      ))}
    </svg>
  );
};

export default TrenchDiagram;
