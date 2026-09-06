import { describe, it, expect } from 'vitest';
import { formatStationX, spanKeyOf } from '../components/TrenchSurveyTab';
import { TrenchSurveyData } from '../types/survey';

const measKey = (spanKey: string, mode: string, x: number | string) =>
  `${spanKey}|${mode}@${formatStationX(x)}`;

describe('구간 및 현장 전환 시 데이터 격리 시뮬레이션', () => {
  it('실측값 격리 및 보존: 맨홀 구간을 수시로 전환해도 실측값이 상호 간섭 없이 완전 격리되고 복원됨', () => {

    const section1: TrenchSurveyData = {
      mode: 'tbm',
      ihDirect: '',
      pipeType: 'PP_DOUBLE',
      dia: '300',
      tbmEl: '5.000',
      bs: '1.000',
      secName: 'M2-212 ~ M2-213',
      startMhName: 'M2-212',
      endMhName: 'M2-213',
      startInv: '-1.170',
      endInv: '-1.430',
      len: '74.43',
      thick: '0.030',
      sand: '0.050',
      conc: '0.100',
      aggregate: '0.100',
      tol: '30',
      step: 5,
      surveyor: '홍길동',
      mdate: '2026-09-06',
      meas: {}
    };

    const spanKey1 = spanKeyOf(section1);
    expect(spanKey1).toBe('M2-212->M2-213');

    // M2-212 구간 0m 지점 실측값 4.120 입력
    section1.meas[measKey(spanKey1, 'CUT_BOTTOM', 0)] = '4.120';

    // 2. 두 번째 구간 (M2-233 ~ M2-234)으로 전환
    const section2: TrenchSurveyData = {
      ...section1,
      secName: 'M2-233 ~ M2-234',
      startMhName: 'M2-233',
      endMhName: 'M2-234',
      startInv: '-2.100',
      endInv: '-2.350',
      len: '35.20'
    };

    const spanKey2 = spanKeyOf(section2);
    expect(spanKey2).toBe('M2-233->M2-234');

    // 새 구간의 0m 지점 실측값 확인: 깨끗하게 비어있음 (누출 0%)!
    const newSectionReading = section2.meas[measKey(spanKey2, 'CUT_BOTTOM', 0)];
    expect(newSectionReading).toBeUndefined();

    // 새 구간(M2-233)의 0m 지점 실측값 5.090 입력
    section2.meas[measKey(spanKey2, 'CUT_BOTTOM', 0)] = '5.090';

    // 3. 다시 첫 번째 구간(M2-212 ~ M2-213)으로 복귀
    const restoredKey1 = spanKeyOf(section1);
    const restoredReading1 = section1.meas[measKey(restoredKey1, 'CUT_BOTTOM', 0)];

    // 원래 구간의 실측값 4.120이 조금도 훼손되지 않고 완벽히 보존됨!
    expect(restoredReading1).toBe('4.120');
  });

  it('공정 모드 격리: 동일 구간에서 검측 모드(터파기 vs 골재 vs 레미콘) 변경 시에도 실측값 완전 분리', () => {
    const section: TrenchSurveyData = {
      mode: 'tbm',
      ihDirect: '',
      pipeType: 'PP_DOUBLE',
      dia: '300',
      tbmEl: '5.000',
      bs: '1.000',
      secName: 'M2-212 ~ M2-213',
      startMhName: 'M2-212',
      endMhName: 'M2-213',
      startInv: '-1.170',
      endInv: '-1.430',
      len: '74.43',
      thick: '0.030',
      sand: '0.050',
      conc: '0.100',
      aggregate: '0.100',
      tol: '30',
      step: 5,
      surveyor: '홍길동',
      mdate: '2026-09-06',
      meas: {}
    };

    const spanKey = spanKeyOf(section);

    // 1. 관로 터파기(CUT_BOTTOM) 실측값 입력
    section.meas[measKey(spanKey, 'CUT_BOTTOM', 0)] = '4.120';

    // 2. 골재 포설(AGGREGATE_TOP)로 모드 전환
    // 터파기 실측값이 골재 포설 실측값에 나타나지 않아야 함
    expect(section.meas[measKey(spanKey, 'AGGREGATE_TOP', 0)]).toBeUndefined();

    // 골재 포설 실측값 입력
    section.meas[measKey(spanKey, 'AGGREGATE_TOP', 0)] = '4.020';

    // 3. 다시 터파기(CUT_BOTTOM) 확인 시 4.120 유지
    expect(section.meas[measKey(spanKey, 'CUT_BOTTOM', 0)]).toBe('4.120');
    // 골재 포설 실측값 4.020도 그대로 유지
    expect(section.meas[measKey(spanKey, 'AGGREGATE_TOP', 0)]).toBe('4.020');
  });
});
