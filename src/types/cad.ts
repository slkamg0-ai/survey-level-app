/**
 * CAD 벡터 객체 (선, 폴리라인, 원, 호) 타입 정의
 */

export type CadEntityType = 'line' | 'polyline' | 'circle' | 'arc';

export interface CadLine {
  type: 'line';
  id: string;
  layer: string;
  start: [number, number]; // [CAD X, CAD Y]
  end: [number, number];   // [CAD X, CAD Y]
  color?: string;          // Hex 색상 (예: #3B82F6)
  lengthM?: number;        // 2D 길이 (m)
}

export interface CadPolyline {
  type: 'polyline';
  id: string;
  layer: string;
  vertices: [number, number][]; // [[CAD X, CAD Y], ...]
  closed: boolean;
  color?: string;
  lengthM?: number;        // 전체 연장 (m)
}

export interface CadCircle {
  type: 'circle';
  id: string;
  layer: string;
  center: [number, number]; // [CAD X, CAD Y]
  radius: number;           // 반경 (m)
  color?: string;
}

export interface CadArc {
  type: 'arc';
  id: string;
  layer: string;
  center: [number, number]; // [CAD X, CAD Y]
  radius: number;           // 반경 (m)
  startAngle: number;       // 시작 각도 (도, 0-360)
  endAngle: number;         // 끝 각도 (도, 0-360)
  color?: string;
}

export type CadEntity = CadLine | CadPolyline | CadCircle | CadArc;

export interface CadLayerSummary {
  name: string;
  color: string;
  count: number;
  lineCount: number;
  circleCount: number;
  visible: boolean;
}

export interface CadDrawingData {
  id: string;
  fileName: string;
  uploadedAt: string;
  layers: string[];
  layerColors: Record<string, string>;
  visibleLayers: Record<string, boolean>;
  entities: CadEntity[];
  stats: {
    total: number;
    lines: number;
    polylines: number;
    circles: number;
    arcs: number;
  };
}
