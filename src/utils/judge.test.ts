import { describe, it, expect } from 'vitest';
import { classifyMeasurement } from './judge';

/**
 * target=4.899, tol=0.03 는 실제 야장 계산에서 나온 값(엑셀 원본 규칙 대조 시 검증됨)을
 * 그대로 쓴다 — 임의 숫자가 아니라 이 프로젝트의 실제 계산 결과라는 뜻.
 */
const TARGET = 4.899;
const TOL = 0.03;

describe('classifyMeasurement — 판정 없음', () => {
  it('실측값이 없으면(undefined) none', () => {
    expect(classifyMeasurement(undefined, TARGET, TOL).status).toBe('none');
  });

  it('실측값이 빈 문자열이면 none', () => {
    expect(classifyMeasurement('', TARGET, TOL).status).toBe('none');
  });

  it('실측값이 숫자가 아니면(공백) none', () => {
    expect(classifyMeasurement('   ', TARGET, TOL).status).toBe('none');
  });

  it('실측값이 숫자가 아니면(문자열) none', () => {
    expect(classifyMeasurement('abc', TARGET, TOL).status).toBe('none');
  });

  it('목표읽음이 없으면(기계고 미입력) 실측값이 있어도 none', () => {
    expect(classifyMeasurement('4.899', null, TOL).status).toBe('none');
  });
});

describe('classifyMeasurement — 적정 판정', () => {
  it('실측이 목표와 정확히 같으면 적정, 편차 0', () => {
    const r = classifyMeasurement(String(TARGET), TARGET, TOL);
    expect(r.status).toBe('ok');
    expect(r.devM).toBe(0);
    expect(r.cm).toBe(0);
  });

  it('허용오차 경계값과 부동소수점으로 정확히 같은 값(회귀 테스트)', () => {
    // 4.929 - 4.899 = 0.03000000000000025 (0.03 초과) — 예전엔 이게 부적합으로 잘못 판정됐다
    const measured = TARGET + TOL;
    expect(measured - TARGET).toBeGreaterThan(TOL); // 부동소수점 오차가 실제로 재현되는지 먼저 확인
    const r = classifyMeasurement(String(measured), TARGET, TOL);
    expect(r.status).toBe('ok');
  });

  it('허용오차 음의 경계값도 적정', () => {
    const measured = TARGET - TOL;
    const r = classifyMeasurement(String(measured), TARGET, TOL);
    expect(r.status).toBe('ok');
  });

  it('허용오차 이내(양)면 적정', () => {
    expect(classifyMeasurement(String(TARGET + 0.02), TARGET, TOL).status).toBe('ok');
  });

  it('허용오차 이내(음)면 적정', () => {
    expect(classifyMeasurement(String(TARGET - 0.02), TARGET, TOL).status).toBe('ok');
  });
});

describe('classifyMeasurement — 더파기 / 되메움', () => {
  it('실측이 목표보다 작으면 더파기(굴착 부족 — 표고가 목표보다 높음)', () => {
    const r = classifyMeasurement(String(TARGET - 0.10), TARGET, TOL);
    expect(r.status).toBe('cut');
    expect(r.devM).toBeCloseTo(-0.10, 6);
    expect(r.cm).toBeCloseTo(10, 6);
  });

  it('실측이 목표보다 크면 되메움(과굴착 — 표고가 목표보다 낮음)', () => {
    const r = classifyMeasurement(String(TARGET + 0.10), TARGET, TOL);
    expect(r.status).toBe('fill');
    expect(r.devM).toBeCloseTo(0.10, 6);
    expect(r.cm).toBeCloseTo(10, 6);
  });

  it('허용오차를 살짝 넘으면(양) 되메움', () => {
    expect(classifyMeasurement(String(TARGET + 0.031), TARGET, TOL).status).toBe('fill');
  });

  it('허용오차를 살짝 넘으면(음) 더파기', () => {
    expect(classifyMeasurement(String(TARGET - 0.031), TARGET, TOL).status).toBe('cut');
  });
});
