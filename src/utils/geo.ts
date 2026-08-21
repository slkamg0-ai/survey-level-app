import proj4 from 'proj4';
import { ManholeMasterItem } from '../types/survey';
import { parseNum } from './storage';

/**
 * 현장 좌표계 ↔ 위경도 변환.
 *
 * 송산그린시티 계획평면도는 EPSG:5174 (Korean 1985 / Modified Central Belt, 베셀).
 * 03_측량 README에 5186으로 적혀 있던 것은 오기였고, 맨홀 250점을 변환해
 * 5174가 화성시 송산면에 떨어지는 것으로 확인했다 (5186은 약 90km 남쪽).
 *
 * towgs84 7파라미터가 반드시 있어야 한다. 빼면 베셀↔WGS84 데이텀 차이 때문에
 * 약 365m 어긋난다 (3파라미터로도 7.6m 차이). 7파라미터를 넣으면 pyproj의
 * EPSG:5174 결과와 0.05m 이내로 맞는다.
 */
export const FIELD_CRS = 'EPSG:5174';

proj4.defs(
  FIELD_CRS,
  '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 ' +
  '+ellps=bessel +units=m +no_defs ' +
  '+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43'
);

export interface LatLng { lat: number; lng: number; }

/** 도면 평면좌표 → 위경도. 변환 불가하면 null */
export function toLatLng(x: number, y: number): LatLng | null {
  try {
    const [lng, lat] = proj4(FIELD_CRS, 'EPSG:4326', [x, y]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/** 두 위경도 사이 지표 거리 (m) */
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
  limit = 8
): NearbyManhole[] {
  const out: NearbyManhole[] = [];
  manholes.forEach(m => {
    const x = parseNum(m.x);
    const y = parseNum(m.y);
    if (x === null || y === null) return;
    const ll = toLatLng(x, y);
    if (!ll) return;
    out.push({ item: m, distanceM: haversineM(here, ll) });
  });
  out.sort((a, b) => a.distanceM - b.distanceM);
  return out.slice(0, limit);
}
