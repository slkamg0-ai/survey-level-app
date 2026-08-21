import { APP_VERSION } from '../version';

/**
 * 전체 백업.
 *
 * 이 앱의 데이터는 전부 localStorage 에만 있다. 파일로 남지 않으므로
 * 사이트 데이터 삭제·앱 삭제·폰 분실이면 맨홀DB와 노선, 저장한 작업이
 * 한꺼번에 사라지고 복구할 방법이 없다. 기기 간 이동 수단도 없다.
 * 그래서 통째로 내보내고 되돌릴 수 있게 한다.
 */

export const BACKUP_KIND = 'survey-level-app-backup';

export const BACKUP_KEYS = {
  jobs: 'survey_jobs_sessions_v1',
  manholes: 'survey_manhole_master_db_v1',
  routes: 'survey_routes_v1',
  trench: 'survey_trench_data_v2',
  standard: 'survey_standard_data_v2'
} as const;

export type BackupPart = keyof typeof BACKUP_KEYS;

export interface BackupFile {
  kind: string;
  appVersion: string;
  exportedAt: string;
  data: Partial<Record<BackupPart, unknown>>;
}

function readKey(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function buildBackup(): BackupFile {
  const data: Partial<Record<BackupPart, unknown>> = {};
  (Object.keys(BACKUP_KEYS) as BackupPart[]).forEach(part => {
    const v = readKey(BACKUP_KEYS[part]);
    if (v !== null) data[part] = v;
  });
  return {
    kind: BACKUP_KIND,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data
  };
}

/** 백업에 무엇이 몇 개 들었는지 (내보내기 전·되돌리기 전 확인용) */
export function summarize(b: BackupFile): string {
  const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const parts: string[] = [];
  if (b.data.jobs) parts.push(`작업 ${n(b.data.jobs)}건`);
  if (b.data.manholes) parts.push(`맨홀 ${n(b.data.manholes)}개`);
  if (b.data.routes) parts.push(`노선 ${n(b.data.routes)}개`);
  if (b.data.trench) parts.push('관로 야장');
  if (b.data.standard) parts.push('표준 야장');
  return parts.length ? parts.join(' · ') : '내용 없음';
}

export function parseBackup(text: string): BackupFile | null {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.kind !== BACKUP_KIND || !parsed.data || typeof parsed.data !== 'object') return null;
    return parsed as BackupFile;
  } catch {
    return null;
  }
}

/** 이름(맨홀·노선·작업)으로 중복을 판단해 합친다. 기존 값을 남긴다 */
function mergeList(existing: unknown, incoming: unknown, nameOf: (v: any) => string): unknown[] {
  const cur = Array.isArray(existing) ? existing : [];
  const inc = Array.isArray(incoming) ? incoming : [];
  const seen = new Set(cur.map(nameOf));
  return [...cur, ...inc.filter(v => !seen.has(nameOf(v)))];
}

export type RestoreMode = 'merge' | 'replace';

export interface RestoreResult {
  restored: BackupPart[];
  note: string;
}

export function applyBackup(b: BackupFile, mode: RestoreMode): RestoreResult {
  const restored: BackupPart[] = [];

  const write = (part: BackupPart, value: unknown) => {
    try {
      localStorage.setItem(BACKUP_KEYS[part], JSON.stringify(value));
      restored.push(part);
    } catch (e) {
      console.error(e);
    }
  };

  // 목록형은 합치기를 지원한다
  if (b.data.manholes !== undefined) {
    write('manholes', mode === 'replace'
      ? b.data.manholes
      : mergeList(readKey(BACKUP_KEYS.manholes), b.data.manholes, v => String(v?.name ?? '')));
  }
  if (b.data.routes !== undefined) {
    write('routes', mode === 'replace'
      ? b.data.routes
      : mergeList(readKey(BACKUP_KEYS.routes), b.data.routes, v => String(v?.name ?? '')));
  }
  if (b.data.jobs !== undefined) {
    write('jobs', mode === 'replace'
      ? b.data.jobs
      : mergeList(readKey(BACKUP_KEYS.jobs), b.data.jobs, v => String(v?.name ?? '')));
  }

  // 현재 야장은 하나뿐이라 합칠 수 없다. 덮어쓰기일 때만 되돌린다
  if (mode === 'replace') {
    if (b.data.trench !== undefined) write('trench', b.data.trench);
    if (b.data.standard !== undefined) write('standard', b.data.standard);
  }

  return {
    restored,
    note: mode === 'replace'
      ? '백업 내용으로 덮어썼습니다'
      : '기존 데이터는 그대로 두고 없는 것만 추가했습니다 (현재 야장은 건드리지 않음)'
  };
}
