const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function getToken(): string | null {
  return localStorage.getItem('comercia_token');
}

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem('comercia_token', token);
  else localStorage.removeItem('comercia_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error || 'Error de servidor', res.status);
  }
  return data as T;
}

async function download(path: string): Promise<{ blob: Blob; filename: string }> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError((data as { error?: string }).error || 'Error de servidor', res.status);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  return { blob: await res.blob(), filename: m ? decodeURIComponent(m[1]) : 'reporte' };
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export interface ApiStore {
  id: string;
  name: string;
  category: string;
  address: string;
  location: { lat: number; lng: number; x: number; y: number };
  employees: number;
  yearsInBusiness: number;
  avgDailyClients: number;
  sensitivityFactors: string[];
  description: string;
  dataRecords: number;
  status: 'Activo' | 'Pendiente' | 'Inactivo';
  /** Comercio de prueba con datos inventados */
  isTest: boolean;
}

export interface ApiDayPrediction {
  date: string;
  clients: number;
  clientsMin: number;
  clientsMax: number;
  flowLevel: 'bajo' | 'normal' | 'alto' | 'crítico';
  confidence: number;
  confidenceLabel: 'Alta confianza' | 'Confianza moderada' | 'Baja confianza';
  temperature: number;
  temperatureMin: number;
  precipitation: number;
  humidity: number;
  condition: string;
  /** forecast = pronóstico Open-Meteo, archive = observado, climatology = promedio histórico */
  weatherSource: 'archive' | 'forecast' | 'climatology';
  isQuincena: boolean;
  isEndOfMonth: boolean;
  isHoliday: boolean;
  holidayName?: string;
  event?: string;
  schoolBreak?: string;
  isSeason: string;
  factors: { name: string; impact: number; type: 'positive' | 'negative' }[];
  modelVersion: string;
  /** Aviso cuando el comercio aún no tiene datos suficientes para una predicción confiable */
  dataWarning?: string;
}

export const WEATHER_SOURCE_LABEL: Record<ApiDayPrediction['weatherSource'], string> = {
  forecast: 'Pronóstico Open-Meteo',
  archive: 'Clima observado',
  climatology: 'Promedio histórico (sin pronóstico aún)',
};

export interface HistoricalRow {
  date: string;
  real: number;
  predicted: number | null;
  error: number | null;
  predictedBy: string | null;
  estimated: boolean;
  promotion: boolean | null;
  observations: string | null;
  temperature: number | null;
  precipitation: number | null;
  humidity: number | null;
  condition: string | null;
}

/** Qué pasó con el aprendizaje del sistema después de guardar datos (server/src/jobs.ts) */
export interface LearningStatus {
  /** started: empezó a aprender · waiting: faltan días nuevos · busy: ya estaba aprendiendo · excluded: comercio de prueba */
  status: 'started' | 'waiting' | 'busy' | 'excluded';
  newRecords: number;
  threshold: number;
  /** true si aún no hay ningún modelo (el primero necesita `threshold` días en total) */
  firstModel: boolean;
}

export interface ImportResult {
  valid: number;
  imported: number;
  totalRecords: number;
  errors: { line: number; message: string }[];
  /** Días del archivo que no estaban registrados */
  newDays: number;
  /** Días del archivo que ya estaban registrados y se reemplazan */
  updatedDays: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Solo al importar (no en la revisión previa) */
  learning?: LearningStatus;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'comerciante' | 'admin' | 'analista';
  storeId: string | null;
  store: ApiStore | null;
  mustChangePassword: boolean;
  /** true durante 15 min tras entrar con código por correo: puede crear contraseña sin la actual */
  canResetPasswordWithoutCurrent?: boolean;
  createdAt?: string;
}

export interface UserSettings {
  emailNotif: boolean;
  smsNotif: boolean;
  pushNotif: boolean;
  weeklyReport: boolean;
  monthlyReport: boolean;
}

export interface ModelRun {
  id: string;
  version: string;
  algorithm: string;
  algorithmKey: string;
  mae: number;
  rmse: number;
  r2: number;
  mape: number;
  /** métricas del método empírico: promedio del mismo día de la semana */
  baselineMae: number;
  baselineRmse: number;
  baselineMape: number;
  /** días evaluados fuera de muestra (validación walk-forward) */
  evaluated: number;
  records: number;
  excludeEstimated: boolean;
  /** Entrenado también con comercios de prueba (datos inventados) */
  includesTestData: boolean;
  importances: { feature: string; importance: number }[];
  trainedThrough: string;
  durationMs: number;
  active: boolean;
  createdAt: string;
}

/** Participación de un comercio en un entrenamiento y su error en la validación */
export interface StoreRunSummary {
  version: string;
  algorithm: string;
  createdAt: string;
  trainedThrough: string;
  active: boolean;
  included: boolean;
  excludedReason: string | null;
  /** Registros de este comercio usados en el entrenamiento */
  recordsUsed: number;
  /** Registros de todos los comercios */
  totalRecords: number;
  evaluatedDays: number;
  mae: number | null;
  /** null en modelos entrenados antes de guardar el método empírico por día */
  baselineMae: number | null;
  within2Pct: number | null;
  globalMae: number;
  globalBaselineMae: number;
  durationMs: number;
  includesTestData: boolean;
  excludeEstimated: boolean;
}

export interface StoreTraining {
  store: { id: string; name: string; isTest: boolean };
  live: {
    running: boolean;
    stage: 'preparando' | 'entrenando' | 'guardando' | null;
    startedAt: string | null;
    algorithm: string | null;
    trigger: 'manual' | 'automatico' | null;
    storeRecords: number | null;
    storesInTraining: number | null;
  };
  lastFailure: { at: string; trigger: 'manual' | 'automatico'; message: string | null } | null;
  active: StoreRunSummary | null;
  data: {
    records: number;
    estimated: number;
    firstDate: string | null;
    lastDate: string | null;
    minRecords: number;
    initialWindowDays: number;
  };
  nextRetrain: { threshold: number; newRecords: number; newRecordsStore: number; lastCheck: string | null };
  history: StoreRunSummary[];
  /** Datos del propio comercio para explicar cómo aprende el sistema */
  explain: {
    /** Clientes en un día normal (promedio de todo lo registrado) */
    storeAverage: number | null;
    /** Último día registrado con clima, con las etiquetas que le pone el sistema */
    example: { date: string; clients: number; tmax: number; precip: number; condition: string; tags: string[] } | null;
    /** Lo que más pesa en el modelo activo (todos los comercios juntos), de 0 a 1 */
    factors: { feature: string; importance: number }[];
    /** Últimos días de la prueba: lo que calculó sin mirar frente a lo que pasó */
    checks: { date: string; real: number; predicted: number; baseline: number | null }[];
  };
}

export interface PlatformStatus {
  startedAt: string;
  services: {
    api: { ok: boolean };
    database: { ok: boolean };
    ml: { ok: boolean };
    mail: { ok: boolean; configured: boolean; lastError: string | null };
    weather: { ok: boolean; lastSync: string | null; message: string; days: number; forecastUntil: string | null };
  };
  jobs: { lastRun: string | null; lastRetrain: string | null; alertsCreated: number; lastError: string | null };
  model: ModelRun | null;
  notifications: number;
  reports: number;
  backups: { name: string; sizeKb: number }[];
}

export interface Feedback {
  easeOfUse: number;
  usefulness: number;
  accuracy: number;
  noHelp: boolean;
  comment: string;
}

export interface FeedbackSummary {
  n: number;
  easeOfUse: number | null;
  usefulness: number | null;
  accuracy: number | null;
  noHelpPct: number | null;
  comments: string[];
}

export interface SavedReport {
  id: string;
  name: string;
  tipo: string;
  formato: string;
  fechaInicio: string;
  fechaFin: string;
  createdAt: string;
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),

  setupStatus: () => request<{ needsSetup: boolean }>('/auth/setup'),

  setup: (payload: { name: string; email: string; password: string }) =>
    request<{ token: string; user: AuthUser }>('/auth/setup', { method: 'POST', body: JSON.stringify(payload) }),

  requestLoginCode: (email: string) =>
    request<{ message: string }>('/auth/otp/request', { method: 'POST', body: JSON.stringify({ email }) }),

  verifyLoginCode: (email: string, code: string) =>
    request<{ token: string; user: AuthUser }>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),

  resetPassword: (userId: string) =>
    request<{ temporaryPassword: string }>(`/users/${userId}/reset-password`, { method: 'POST' }),

  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (payload: {
    email: string;
    password: string;
    name: string;
    store: {
      name: string;
      category: string;
      address: string;
      employees: number;
      yearsInBusiness: number;
      avgDailyClients: number;
      description?: string;
      lat?: number;
      lng?: number;
      mapX?: number;
      mapY?: number;
    };
  }) =>
    request<{ token: string; user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  me: () => request<AuthUser>('/auth/me'),

  updateMe: (payload: { name?: string; phone?: string }) =>
    request<AuthUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),

  changePassword: (currentPassword: string | undefined, newPassword: string) =>
    request<{ ok: boolean }>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  stats: () =>
    request<{
      stores: number;
      testStores: number;
      users: number;
      records: number;
      testRecords: number;
      estimatedRecords: number;
      activeStores: number;
      activity: { day: string; registros: number; promedioClientes: number }[];
      model: ModelRun | null;
    }>('/stats'),

  platform: () => request<PlatformStatus>('/platform'),

  myFeedback: () => request<Feedback | null>('/feedback/mine'),

  saveFeedback: (payload: Feedback) =>
    request<{ ok: boolean }>('/feedback/mine', { method: 'PUT', body: JSON.stringify(payload) }),

  feedbackSummary: () => request<FeedbackSummary>('/feedback/summary'),

  metrics: (storeId?: string) =>
    request<{ mae: number; rmse: number; r2: number; mape: number; n: number; records: number }>(
      storeId ? `/metrics?storeId=${encodeURIComponent(storeId)}` : '/metrics',
    ),

  stores: () => request<ApiStore[]>('/stores'),

  createStore: (payload: {
    name: string;
    category: string;
    address?: string;
    employees?: number;
    yearsInBusiness?: number;
    avgDailyClients?: number;
    description?: string;
  }) => request<ApiStore>('/stores', { method: 'POST', body: JSON.stringify(payload) }),

  updateStore: (
    id: string,
    payload: Partial<{
      name: string;
      category: string;
      address: string;
      employees: number;
      yearsInBusiness: number;
      avgDailyClients: number;
      description: string;
    }>,
  ) => request<ApiStore>(`/stores/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  updateStoreStatus: (id: string, status: 'Activo' | 'Pendiente' | 'Inactivo') =>
    request<ApiStore>(`/stores/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  predictDay: (storeId: string, date: string) =>
    request<ApiDayPrediction>(`/predictions/day?storeId=${encodeURIComponent(storeId)}&date=${encodeURIComponent(date)}`),

  predictWeek: (storeId: string, startDate: string) =>
    request<ApiDayPrediction[]>(
      `/predictions/week?storeId=${encodeURIComponent(storeId)}&startDate=${encodeURIComponent(startDate)}`,
    ),

  predictRange: (storeId: string, from: string, to: string) =>
    request<ApiDayPrediction[]>(
      `/predictions/range?storeId=${encodeURIComponent(storeId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),

  recommendations: (storeId: string, startDate: string) =>
    request<{ prediction: ApiDayPrediction; recommendations: string[] }[]>(
      `/predictions/recommendations?storeId=${encodeURIComponent(storeId)}&startDate=${encodeURIComponent(startDate)}`,
    ),

  historical: (storeId: string, days = 90) =>
    request<HistoricalRow[]>(`/historical?storeId=${encodeURIComponent(storeId)}&days=${days}`),

  addHistorical: (payload: {
    storeId: string;
    date: string;
    clients: number;
    promotion?: boolean;
    observations?: string;
  }) =>
    request<{ id: string; date: string; clients: number; predicted: number | null; totalRecords: number; learning: LearningStatus }>(
      '/historical',
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  /** Importa (o solo valida con dryRun) un archivo CSV o Excel (.xlsx). */
  importHistorical: async (storeId: string, file: File, dryRun = false) =>
    request<ImportResult>('/historical/import', {
      method: 'POST',
      body: JSON.stringify({
        storeId,
        dryRun,
        filename: file.name,
        ...(/\.xlsx$/i.test(file.name) ? { fileBase64: await fileToBase64(file) } : { csv: await file.text() }),
      }),
    }),

  notifications: () =>
    request<{ id: string; type: string; title: string; message: string; read: boolean; createdAt: string }[]>(
      '/notifications',
    ),

  markNotificationRead: (id: string) =>
    request(`/notifications/${id}/read`, { method: 'PATCH' }),

  users: () =>
    request<
      {
        id: string;
        name: string;
        email: string;
        role: string;
        roleKey: 'comerciante' | 'admin' | 'analista';
        status: string;
        lastAccess: string;
        store: string;
        storeId: string | null;
        locked: boolean;
      }[]
    >('/users'),

  updateUser: (
    id: string,
    payload: { name?: string; role?: 'comerciante' | 'admin' | 'analista'; storeId?: string | null },
  ) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  updateUserStatus: (id: string, status: 'Activo' | 'Pendiente' | 'Inactivo') =>
    request(`/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  createUser: (payload: {
    email: string;
    password: string;
    name: string;
    role: 'comerciante' | 'admin' | 'analista';
    storeId?: string;
  }) => request<{ id: string; email: string }>('/users', { method: 'POST', body: JSON.stringify(payload) }),

  alertSettings: (storeId: string) =>
    request<{ bajo: number; normalMin: number; normalMax: number; alto: number; critico: number }>(
      `/alerts/settings?storeId=${encodeURIComponent(storeId)}`,
    ),

  saveAlertSettings: (payload: {
    storeId: string;
    bajo: number;
    normalMin: number;
    normalMax: number;
    alto: number;
    critico: number;
  }) => request('/alerts/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  settings: () => request<UserSettings>('/settings'),

  saveSettings: (payload: UserSettings) =>
    request<UserSettings>('/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  reports: () => request<SavedReport[]>('/reports'),

  createReport: (payload: {
    tipo: string;
    formato: string;
    fechaInicio: string;
    fechaFin: string;
    storeId?: string;
  }) => request<SavedReport>('/reports', { method: 'POST', body: JSON.stringify(payload) }),

  getReport: (id: string) => request<SavedReport>(`/reports/${id}`),

  downloadReport: (id: string) => download(`/reports/${id}/download`),

  modelRuns: () => request<ModelRun[]>('/models'),

  activeModel: () => request<ModelRun | null>('/models/active'),

  trainModel: (algorithm: string, opts: { excludeEstimated?: boolean; includeTestData?: boolean } = {}) =>
    request<ModelRun>('/models/train', { method: 'POST', body: JSON.stringify({ algorithm, ...opts }) }),

  activateModel: (id: string) => request<ModelRun>(`/models/${id}/activate`, { method: 'POST' }),

  /** Entrenamiento visto desde un comercio: en curso, modelo activo y su error en ese comercio */
  storeTraining: (storeId: string) => request<StoreTraining>(`/training/store/${encodeURIComponent(storeId)}`),
};

/** Convierte respuesta API a Date local para UI existente */
export function predictionWithDate(p: ApiDayPrediction) {
  const [y, m, d] = p.date.split('-').map(Number);
  return { ...p, date: new Date(y, m - 1, d) };
}

export function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
