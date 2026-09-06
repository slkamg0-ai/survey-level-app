import proj4 from 'proj4';
import { ManholeMasterItem } from '../types/survey';
import { parseNum } from './storage';

/**
 * 한국 주요 좌표계 (CRS) 정의.
 *
 * 1. EPSG:5174: Korean 1985 / Modified Central Belt (베셀 타원체).
 *    과거 도면, 송산그린시티 및 다수의 산업단지/택지개발 CAD 도면.
 *    towgs84 7파라미터 필수 (없으면 365m 데이텀 오차 발생).
 * 2. EPSG:5186: Korea 2000 / Central Belt 2010 (GRS80 타원체).
 *    최근 표준 공공측량, 지적재조사, 신설 택지개발 표준 도면.
 * 3. EPSG:5179: Korea 2000 / UTM-K (GRS80 타원체).
 *    국토지리정보원 국토정보플랫폼, 네이버 지도 좌표계.
 * 4. EPSG:5181: Korea 1985 / Central Belt (카카오 지도 좌표계).
 */
export type SupportedCRS = 'EPSG:5174' | 'EPSG:5186' | 'EPSG:5179' | 'EPSG:5181' | 'EPSG:4326';

export interface CRSInfo {
  code: SupportedCRS;
  name: string;
  description: string;
}

export const SUPPORTED_CRS_LIST: CRSInfo[] = [
  { code: 'EPSG:5174', name: '중부원점 (Bessel 보정 / EPSG:5174)', description: '송산그린시티, 구도면 등' },
  { code: 'EPSG:5186', name: '중부원점 (GRS80 2010 / EPSG:5186)', description: '최근 신규 CAD 도면, 표준 공공측량' },
  { code: 'EPSG:5179', name: 'UTM-K (GRS80 / EPSG:5179)', description: '국토정보플랫폼, 네이버 지도' },
  { code: 'EPSG:5181', name: '카카오 중부원점 (EPSG:5181)', description: '카카오맵 로컬 평면 직교 좌표계' },
  { code: 'EPSG:4326', name: 'WGS84 위경도 (EPSG:4326)', description: 'GPS 위도/경도 직접 표기 도면' }
];

export const FIELD_CRS = 'EPSG:5174';

// 1. EPSG:5174 (Bessel 보정 중부원점)
proj4.defs(
  'EPSG:5174',
  '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 ' +
  '+ellps=bessel +units=m +no_defs ' +
  '+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43'
);

// 2. EPSG:5186 (GRS80 2010 중부원점)
proj4.defs(
  'EPSG:5186',
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 ' +
  '+ellps=GRS80 +units=m +no_defs'
);

// 3. EPSG:5179 (UTM-K)
proj4.defs(
  'EPSG:5179',
  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 ' +
  '+ellps=GRS80 +units=m +no_defs'
);

// 4. EPSG:5181 (카카오 중부원점)
proj4.defs(
  'EPSG:5181',
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 ' +
  '+ellps=bessel +units=m +no_defs ' +
  '+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43'
);

export interface LatLng {
  lat: number;
  lng: number;
}

/** 도면 평면좌표 → 위경도. 변환 불가하면 null. CRS를 선택할 수 있음 */
export function toLatLng(x: number, y: number, crs: SupportedCRS = 'EPSG:5174'): LatLng | null {
  try {
    if (crs === 'EPSG:4326') {
      // 이미 위경도인 경우 (x: 경도, y: 위도 또는 x: 위도, y: 경도)
      if (Math.abs(x) <= 90 && Math.abs(y) <= 180) return { lat: x, lng: y };
      if (Math.abs(y) <= 90 && Math.abs(x) <= 180) return { lat: y, lng: x };
      return null;
    }
    const [lng, lat] = proj4(crs, 'EPSG:4326', [x, y]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/** 위경도 → 지정 평면좌표계 변환 */
export function fromLatLng(lat: number, lng: number, crs: SupportedCRS = 'EPSG:5174'): [number, number] | null {
  try {
    if (crs === 'EPSG:4326') return [lng, lat];
    const [x, y] = proj4('EPSG:4326', crs, [lng, lat]);
    if (!isFinite(x) || !isFinite(y)) return null;
    return [x, y];
  } catch {
    return null;
  }
}

/** 두 위경도 사이 지표 구면 거리 (m) */
export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearbyManhole {
  item: ManholeMasterItem;
  distanceM: number;
}

/** 현재 위치에서 가까운 순으로 맨홀을 고른다. 좌표 없는 맨홀은 제외 */
export function findNearby(
  here: LatLng,
  manholes: ManholeMasterItem[],
  limit = 8,
  crs: SupportedCRS = 'EPSG:5174'
): NearbyManhole[] {
  const out: NearbyManhole[] = [];
  manholes.forEach(m => {
    const x = parseNum(m.x);
    const y = parseNum(m.y);
    if (x === null || y === null) return;
    const ll = toLatLng(x, y, crs);
    if (!ll) return;
    out.push({ item: m, distanceM: haversineM(here, ll) });
  });
  out.sort((a, b) => a.distanceM - b.distanceM);
  return out.slice(0, limit);
}

/**
 * 2점 기준점(Control Points) 기반 2D 헬머트 아핀 변환 (Helmert 2D Transformation).
 *
 * 도면 상의 2점(픽셀 비율 x, y: 0~1)과 실제 지도 상의 2개 위경도 좌표(Lat, Lng)가 주어지면,
 * 이미지의 4개 모서리(좌상단, 우상단, 우하단, 좌하단)의 실제 위경도 좌표를 산출한다.
 * 도면의 회전(Rotation), 크기(Scale), 위치(Translation)가 달라도 지도에 100% 정합시킬 수 있다.
 */
export interface ImagePoint {
  u: number; // 이미지 너비 대비 상대 좌표 (0.0 ~ 1.0)
  v: number; // 이미지 높이 대비 상대 좌표 (0.0 ~ 1.0)
}

export interface HelmertCalibrationResult {
  southWest: LatLng;
  northEast: LatLng;
  corners: [LatLng, LatLng, LatLng, LatLng]; // 좌상, 우상, 우하, 좌하
  rotationDeg: number;
  scaleMetersPerUnit: number;
}

export function calibrateBlueprint2Points(
  imgPt1: ImagePoint,
  worldPt1: LatLng,
  imgPt2: ImagePoint,
  worldPt2: LatLng,
  imageWidth: number,
  imageHeight: number
): HelmertCalibrationResult | null {
  // 1. Web Mercator(EPSG:3857) 평면 미터 좌표로 변환하여 평면 기하학 계산
  const toMercator = (ll: LatLng): [number, number] => {
    const [x, y] = proj4('EPSG:4326', 'EPSG:3857', [ll.lng, ll.lat]);
    return [x, y];
  };
  const toWgs84 = (mx: number, my: number): LatLng => {
    const [lng, lat] = proj4('EPSG:3857', 'EPSG:4326', [mx, my]);
    return { lat, lng };
  };

  const [mX1, mY1] = toMercator(worldPt1);
  const [mX2, mY2] = toMercator(worldPt2);

  // 이미지 픽셀 좌표 (y는 위에서 아래로 증가하므로 뒤집음)
  const px1_x = imgPt1.u * imageWidth;
  const px1_y = (1 - imgPt1.v) * imageHeight;
  const px2_x = imgPt2.u * imageWidth;
  const px2_y = (1 - imgPt2.v) * imageHeight;

  const dImgX = px2_x - px1_x;
  const dImgY = px2_y - px1_y;
  const dImg = Math.sqrt(dImgX * dImgX + dImgY * dImgY);
  if (dImg < 1e-6) return null;

  const dRealX = mX2 - mX1;
  const dRealY = mY2 - mY1;
  const dReal = Math.sqrt(dRealX * dRealX + dRealY * dRealY);
  if (dReal < 1e-6) return null;

  // 스케일 및 회전각 (라디안)
  const scale = dReal / dImg;
  const thetaImg = Math.atan2(dImgY, dImgX);
  const thetaReal = Math.atan2(dRealY, dRealX);
  const rotation = thetaReal - thetaImg;

  // 픽셀 -> 메르카토르 변환 함수
  const pxToMercator = (px: number, py: number): [number, number] => {
    const dx = px - px1_x;
    const dy = py - px1_y;
    const rx = scale * (dx * Math.cos(rotation) - dy * Math.sin(rotation));
    const ry = scale * (dx * Math.sin(rotation) + dy * Math.cos(rotation));
    return [mX1 + rx, mY1 + ry];
  };

  // 이미지 4개 모서리 (좌상: (0, H), 우상: (W, H), 우하: (W, 0), 좌하: (0, 0))
  const cTL_m = pxToMercator(0, imageHeight);
  const cTR_m = pxToMercator(imageWidth, imageHeight);
  const cBR_m = pxToMercator(imageWidth, 0);
  const cBL_m = pxToMercator(0, 0);

  const corners: [LatLng, LatLng, LatLng, LatLng] = [
    toWgs84(cTL_m[0], cTL_m[1]),
    toWgs84(cTR_m[0], cTR_m[1]),
    toWgs84(cBR_m[0], cBR_m[1]),
    toWgs84(cBL_m[0], cBL_m[1])
  ];

  const lats = corners.map(c => c.lat);
  const lngs = corners.map(c => c.lng);

  return {
    southWest: { lat: Math.min(...lats), lng: Math.min(...lngs) },
    northEast: { lat: Math.max(...lats), lng: Math.max(...lngs) },
    corners,
    rotationDeg: (rotation * 180) / Math.PI,
    scaleMetersPerUnit: scale
  };
}
