import { PipeSpec } from '../types/survey';

// PP 이중벽관 규격 (이미지 1 명세)
export const PP_DOUBLE_SPECS: PipeSpec[] = [
  { diameterMm: 150, diameterM: 0.15, thicknessM: 0.007, thicknessMm: 7.0 },
  { diameterMm: 200, diameterM: 0.20, thicknessM: 0.014, thicknessMm: 14.0 },
  { diameterMm: 300, diameterM: 0.30, thicknessM: 0.019, thicknessMm: 19.0 },
  { diameterMm: 400, diameterM: 0.40, thicknessM: 0.025, thicknessMm: 25.0 },
  { diameterMm: 600, diameterM: 0.60, thicknessM: 0.039, thicknessMm: 39.0 },
  { diameterMm: 700, diameterM: 0.70, thicknessM: 0.044, thicknessMm: 44.0 },
  { diameterMm: 800, diameterM: 0.80, thicknessM: 0.016, thicknessMm: 16.0 },
  { diameterMm: 900, diameterM: 0.90, thicknessM: 0.018, thicknessMm: 18.0 },
  { diameterMm: 1100, diameterM: 1.10, thicknessM: 0.022, thicknessMm: 22.0 },
];

// 우수공관 규격 (이미지 2 명세)
export const STORMWATER_SPECS: PipeSpec[] = [
  { diameterMm: 450, diameterM: 0.45, thicknessM: 0.0210, thicknessMm: 21.0, outerDiameterMm: 492.0 },
  { diameterMm: 500, diameterM: 0.50, thicknessM: 0.0210, thicknessMm: 21.0, outerDiameterMm: 542.0 },
  { diameterMm: 600, diameterM: 0.60, thicknessM: 0.0210, thicknessMm: 21.0, outerDiameterMm: 643.4 },
  { diameterMm: 700, diameterM: 0.70, thicknessM: 0.0210, thicknessMm: 21.0, outerDiameterMm: 743.4 },
  { diameterMm: 800, diameterM: 0.80, thicknessM: 0.0217, thicknessMm: 21.7, outerDiameterMm: 843.4 },
  { diameterMm: 900, diameterM: 0.90, thicknessM: 0.0217, thicknessMm: 21.7, outerDiameterMm: 943.4 },
  { diameterMm: 1000, diameterM: 1.00, thicknessM: 0.0217, thicknessMm: 21.7, outerDiameterMm: 1043.4 },
  { diameterMm: 1100, diameterM: 1.10, thicknessM: 0.0217, thicknessMm: 21.7, outerDiameterMm: 1143.4 },
  { diameterMm: 1200, diameterM: 1.20, thicknessM: 0.0217, thicknessMm: 21.7, outerDiameterMm: 1243.4 },
  { diameterMm: 1350, diameterM: 1.35, thicknessM: 0.0217, thicknessMm: 21.7, outerDiameterMm: 1393.4 },
  { diameterMm: 1500, diameterM: 1.50, thicknessM: 0.0217, thicknessMm: 21.7, outerDiameterMm: 1543.4 },
];

export function findPipeThickness(type: 'PP_DOUBLE' | 'STORMWATER', diaMmOrM: number): PipeSpec | null {
  const specs = type === 'PP_DOUBLE' ? PP_DOUBLE_SPECS : STORMWATER_SPECS;
  // 입력이 m 단위(e.g., 0.3)일 경우 mm(300) 변환 후 매칭
  const mm = diaMmOrM < 20 ? Math.round(diaMmOrM * 1000) : Math.round(diaMmOrM);
  return specs.find(s => s.diameterMm === mm) || null;
}
