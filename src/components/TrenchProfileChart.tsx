import React from 'react';
import { TrenchRow } from '../types/survey';
import { classifyMeasurement, JudgeStatus } from '../utils/judge';

/**
 * 점간 현황 그림.
 *
 * 표는 측점 하나씩 줄로 읽어야 어디가 문제인지 안다. 여기서는 구간 전체를
 * 한 그림으로 이어 붙여 실측이 계획 대비 어디서 뜨고 가라앉았는지 한눈에 보게 한다.
 *
 * 두 그림을 함께 둔다.
 *   1) 종단면 프로파일 — 계획선(검측 목표 EL) 위에 실측 표고를 점으로 찍는다.
 *      계획선은 판정 색(적정/더파기/되메움)과 겹치지 않도록 강조색을 쓴다.
 *   2) 편차 막대 — 측점마다 목표 대비 편차(m)를 막대로 세워 크기를 비교한다.
 *
 * 실측하지 않은 측점은 점을 찍지 않고 계획선만 지나간다 — 아직 안 잰 것을
 * "적정"처럼 보이게 하지 않기 위해서다. 판정은 표와 같은 classifyMeasurement 를 써서
 * 두 그림이 서로 다른 기준으로 어긋나는 일이 없게 한다.
 */

interface Props {
  rows: TrenchRow[];
  meas: Record<string, string>;
  measKeyOf: (x: number) => string;
  tol: number;
  labelOf: (r: TrenchRow, i: number) => string;
}

const STATUS_VAR: Record<JudgeStatus, string> = {
  ok: 'var(--ok)',
  cut: 'var(--cut)',
  fill: 'var(--fill)',
  none: 'var(--ink-3)'
};

const W = 320;
const PAD_L = 42;
const PAD_R = 12;
const PROFILE_H = 140;
const PROFILE_PAD_T = 14;
const PROFILE_PAD_B = 20;
const BAR_H = 110;
const BAR_PAD_T = 10;
const BAR_PAD_B = 22;
const GAP = 22;

export const TrenchProfileChart: React.FC<Props> = ({ rows, meas, measKeyOf, tol, labelOf }) => {
  if (rows.length < 2) {
    return <div className="diagram-empty">측점이 2개 이상이면 점간 현황이 표시됩니다.</div>;
  }

  const points = rows.map((r, i) => {
    const raw = meas[measKeyOf(r.x)];
    const judge = classifyMeasurement(raw, r.target, tol);
    // measuredEl = 계획EL - devM. 읽음↔표고 반비례라 더파기(표고 높음)면 계획선 위,
    // 되메움(표고 낮음)이면 계획선 아래에 찍힌다.
    const measuredEl = judge.devM === null ? null : r.cutEl - judge.devM;
    return { x: r.x, label: labelOf(r, i), designEl: r.cutEl, measuredEl, judge };
  });

  const xs = points.map(p => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xSpan = Math.max(1e-6, xMax - xMin);
  const px = (x: number) => PAD_L + ((x - xMin) / xSpan) * (W - PAD_L - PAD_R);

  /* ── 1) 종단면 프로파일 ─────────────────────────── */
  const elVals = points.flatMap(p => (p.measuredEl === null ? [p.designEl] : [p.designEl, p.measuredEl]));
  const elMin = Math.min(...elVals);
  const elMax = Math.max(...elVals);
  const elSpan = Math.max(0.05, elMax - elMin);
  const elPadFrac = 0.15;
  const yTop = PROFILE_PAD_T;
  const yBot = PROFILE_H - PROFILE_PAD_B;
  const py = (el: number) =>
    yBot - ((el - (elMin - elSpan * elPadFrac)) / (elSpan * (1 + 2 * elPadFrac))) * (yBot - yTop);

  const designPath = points.map(p => `${px(p.x).toFixed(1)},${py(p.designEl).toFixed(1)}`).join(' L ');
  const measuredPts = points.filter(p => p.measuredEl !== null);

  /* ── 2) 편차 막대 ───────────────────────────────── */
  const diffVals = points.map(p => (p.judge.diffM === null ? 0 : p.judge.diffM));
  const diffMax = Math.max(0.20, ...diffVals) * 1.15; // 최소 0.200m 범위 확보
  const barTop = BAR_PAD_T;
  const barBot = BAR_H - BAR_PAD_B;
  const zeroY = (barTop + barBot) / 2;
  const diffScale = (barBot - barTop) / 2 / diffMax;
  const barW = Math.min(20, Math.max(6, ((W - PAD_L - PAD_R) / points.length) * 0.55));
  const tolPx = tol * diffScale;

  const measuredCount = measuredPts.length;

  return (
    <div className="profile-wrap">
      <div className="profile-block">
        <div className="profile-title">
          <span>종단면 프로파일</span>
          <span className="profile-title-sub">계획선 대비 실측 표고</span>
        </div>
        <svg className="profile-svg" viewBox={`0 0 ${W} ${PROFILE_H}`} role="img" aria-label="종단면 프로파일">
          {/* 계획선(검측 목표 EL) */}
          <path d={`M ${designPath}`} fill="none" stroke="var(--primary)" strokeWidth="1.75" />

          {/* 실측 표고 점 — 안 잰 측점은 점을 찍지 않는다 */}
          {measuredPts.map((p, i) => (
            <circle
              key={i}
              cx={px(p.x)}
              cy={py(p.measuredEl!)}
              r={3.4}
              fill={STATUS_VAR[p.judge.status]}
              stroke="var(--surface)"
              strokeWidth="1"
            />
          ))}

          {/* x축 측점 라벨 (시점/종점만 — 중간은 촘촘해서 생략) */}
          <text x={px(points[0].x)} y={PROFILE_H - 5} className="profile-axis" textAnchor="start">
            {points[0].label}
          </text>
          <text x={px(points[points.length - 1].x)} y={PROFILE_H - 5} className="profile-axis" textAnchor="end">
            {points[points.length - 1].label}
          </text>
        </svg>
        <div className="profile-legend-row">
          <span><i className="profile-swatch" style={{ background: 'var(--primary)' }} />계획선</span>
          <span><i className="profile-swatch dot" style={{ background: 'var(--ok)' }} />적정</span>
          <span><i className="profile-swatch dot" style={{ background: 'var(--cut)' }} />더파기</span>
          <span><i className="profile-swatch dot" style={{ background: 'var(--fill)' }} />되메움</span>
        </div>
      </div>

      <div className="profile-block">
        <div className="profile-title">
          <span>측점별 편차</span>
          <span className="profile-title-sub">
            {measuredCount === 0 ? '실측값 없음' : `실측 ${measuredCount}/${points.length}점`}
          </span>
        </div>
        {measuredCount === 0 ? (
          <div className="diagram-empty">실측값을 입력하면 측점별 편차가 표시됩니다.</div>
        ) : (
          <svg className="profile-svg" viewBox={`0 0 ${W} ${BAR_H}`} role="img" aria-label="측점별 편차 막대">
            {/* 허용오차 대역 */}
            <rect x={PAD_L} y={zeroY - tolPx} width={W - PAD_L - PAD_R} height={tolPx * 2}
              fill="var(--ok-bg)" opacity="0.55" />
            <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke="var(--line)" strokeWidth="1" />

            {points.map((p, i) => {
              if (p.judge.diffM === null) return null;
              const h = Math.min(barBot - barTop, p.judge.diffM * diffScale);
              const up = p.judge.devM! < 0; // 더파기 → 막대를 위로
              const y = up ? zeroY - h : zeroY;
              const x = px(p.x) - barW / 2;
              return (
                <rect key={i} x={x} y={y} width={barW} height={Math.max(1.5, h)}
                  fill={STATUS_VAR[p.judge.status]} rx="1.5" />
              );
            })}

            <text x={px(points[0].x)} y={BAR_H - 5} className="profile-axis" textAnchor="start">
              {points[0].label}
            </text>
            <text x={px(points[points.length - 1].x)} y={BAR_H - 5} className="profile-axis" textAnchor="end">
              {points[points.length - 1].label}
            </text>
          </svg>
        )}
        <div className="profile-legend-row">
          <span><i className="profile-swatch" style={{ background: 'var(--ok-bg)' }} />허용오차 ±{tol.toFixed(3)}m</span>
          <span className="profile-hint">위쪽=더파기(굴착 부족) · 아래쪽=되메움(과굴착)</span>
        </div>
      </div>
    </div>
  );
};

export default TrenchProfileChart;
