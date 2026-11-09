interface D1Result<T> {
  results: T[];
  meta: { changes: number; last_row_id: number };
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1Statement;
  batch<T = unknown>(statements: D1Statement[]): Promise<D1Result<T>[]>;
}

interface Environment {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  BOOTSTRAP_ADMIN_TOKEN?: string;
}

interface Session {
  id: string;
  user_id: number | null;
  csrf_token: string;
  expires_at: number;
}

interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  role: 'resident' | 'ldrrmo_staff' | 'supervisor' | 'admin';
  is_active: number;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}

const SESSION_COOKIE = 'ldrrmo_session';
const SESSION_SECONDS = 60 * 60 * 24 * 14;
const ROLES = ['resident', 'ldrrmo_staff', 'supervisor', 'admin'] as const;
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
const EMERGENCY_TYPES = ['fire', 'flood', 'medical', 'accident', 'landslide', 'earthquake', 'other'] as const;
const SEVERITIES = ['low', 'moderate', 'high', 'critical'] as const;

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  responseHeaders.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function ok(data: unknown, status = 200, cookie?: string): Response {
  return json({ data }, status, cookie ? { 'Set-Cookie': cookie } : undefined);
}

function fail(message: string, status = 422): never {
  throw new ApiError(message, status);
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  for (const pair of cookie.split(';')) {
    const [key, ...value] = pair.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}

function sessionCookie(id: string, request: Request, maxAge = SESSION_SECONDS): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function randomHex(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function getSession(request: Request, db: D1Database): Promise<Session | null> {
  const id = cookieValue(request, SESSION_COOKIE);
  if (!id || !/^[a-f0-9]{64}$/.test(id)) return null;
  const session = await db
    .prepare('SELECT id,user_id,csrf_token,expires_at FROM app_sessions WHERE id=? AND expires_at>?')
    .bind(id, Math.floor(Date.now() / 1000))
    .first<Session>();
  return session;
}

async function ensureSession(request: Request, db: D1Database): Promise<{ session: Session; cookie?: string }> {
  const current = await getSession(request, db);
  if (current) return { session: current };
  const id = randomHex();
  const csrfToken = randomHex();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  await db
    .prepare('INSERT INTO app_sessions(id,user_id,csrf_token,expires_at) VALUES(?,NULL,?,?)')
    .bind(id, csrfToken, expiresAt)
    .run();
  return {
    session: { id, user_id: null, csrf_token: csrfToken, expires_at: expiresAt },
    cookie: sessionCookie(id, request),
  };
}

async function rotateSession(request: Request, db: D1Database, userId: number) {
  const oldId = cookieValue(request, SESSION_COOKIE);
  const id = randomHex();
  const csrfToken = randomHex();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const statements: D1Statement[] = [];
  if (oldId) statements.push(db.prepare('DELETE FROM app_sessions WHERE id=?').bind(oldId));
  statements.push(
    db.prepare('INSERT INTO app_sessions(id,user_id,csrf_token,expires_at) VALUES(?,?,?,?)')
      .bind(id, userId, csrfToken, expiresAt),
  );
  await db.batch(statements);
  return { csrf_token: csrfToken, cookie: sessionCookie(id, request) };
}

async function requireCsrf(request: Request, db: D1Database): Promise<Session> {
  const session = await getSession(request, db);
  const supplied = request.headers.get('X-CSRF-Token') ?? '';
  if (!session || !supplied || supplied.length !== session.csrf_token.length) {
    fail('Your session expired. Refresh and try again.', 403);
  }
  const expected = new TextEncoder().encode(session.csrf_token);
  const actual = new TextEncoder().encode(supplied);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ actual[i];
  if (mismatch !== 0) fail('Your session expired. Refresh and try again.', 403);
  return session;
}

async function requireUser(db: D1Database, session: Session | null): Promise<User> {
  if (!session?.user_id) fail('Sign in to continue.', 401);
  const user = await db
    .prepare('SELECT id,email,full_name,phone,address,role,is_active,avatar_url,created_at,updated_at FROM profiles WHERE id=?')
    .bind(session.user_id)
    .first<User>();
  if (!user || !user.is_active) fail('This account is inactive. Contact an administrator.', 401);
  return user;
}

function requireRole(user: User, roles: readonly User['role'][]): void {
  if (!roles.includes(user.role)) fail('You are not authorized to perform this action.', 403);
}

async function requestBody(request: Request, maxBytes = 65536): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > maxBytes) fail('The request body is too large.', 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) fail('The request body is too large.', 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    fail('A valid JSON request body is required.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('A valid JSON request body is required.', 400);
  return body as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 255, required = true): string | null {
  if (value === null && !required) return null;
  if (typeof value !== 'string') fail(`${label} is required.`);
  const trimmed = value.trim();
  if (!required && trimmed === '') return null;
  if (!trimmed || trimmed.length > max) fail(`${label} must be between 1 and ${max} characters.`);
  return trimmed;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) fail(`Select a valid ${label}.`);
  return value as T[number];
}

function numberValue(value: unknown, min: number, max: number, label: string, nullable = false): number | null {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) fail(`${label} is outside its valid range.`);
  return parsed;
}

function pageParams(url: URL, defaultSize = 50) {
  const page = Math.max(1, Math.min(1_000_000, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
  const size = Math.max(1, Math.min(200, Number.parseInt(url.searchParams.get('per_page') ?? String(defaultSize), 10) || defaultSize));
  return { page, size, offset: (page - 1) * size };
}

async function hashPassword(password: string): Promise<string> {
  if (password.length < 8 || new TextEncoder().encode(password).byteLength > 72) {
    fail('Password must be between 8 and 72 bytes.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120000 },
    key,
    256,
  );
  return `pbkdf2$120000$${Array.from(salt, byte => byte.toString(16).padStart(2, '0')).join('')}$${Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expectedText] = encoded.split('$');
  if (algorithm !== 'pbkdf2' || !iterationsText || !saltText || !expectedText) return false;
  const iterations = Number.parseInt(iterationsText, 10);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 500000) return false;
  const salt = new Uint8Array(saltText.match(/.{2}/g)?.map(byte => Number.parseInt(byte, 16)) ?? []);
  if (salt.length !== 16 || !/^[a-f0-9]{64}$/.test(expectedText)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  const actual = new Uint8Array(bits);
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) {
    mismatch |= actual[i] ^ Number.parseInt(expectedText.slice(i * 2, i * 2 + 2), 16);
  }
  return mismatch === 0;
}

async function audit(
  db: D1Database,
  userId: number | null,
  action: string,
  table?: string,
  recordId?: number | string,
  values?: unknown,
  ip?: string,
): Promise<void> {
  await db.prepare(
    'INSERT INTO audit_logs(user_id,action,table_name,record_id,new_values,ip_address) VALUES(?,?,?,?,?,?)',
  ).bind(userId, action, table ?? null, recordId == null ? null : String(recordId), values == null ? null : JSON.stringify(values), ip ?? null).run();
}

const REPORT_SELECT = `SELECT r.*,p.full_name AS reporter_name,p.phone AS reporter_phone,
  json_object('full_name',p.full_name,'phone',p.phone) AS profiles,
  CASE WHEN a.id IS NULL THEN NULL ELSE json_object('full_name',a.full_name) END AS assigned_profile
  FROM emergency_reports r JOIN profiles p ON p.id=r.reporter_id
  LEFT JOIN profiles a ON a.id=r.assigned_to`;

function decodeReport<T extends Record<string, unknown>>(report: T): T {
  for (const key of ['profiles', 'assigned_profile']) {
    const value = report[key];
    if (typeof value === 'string') {
      try {
        report[key] = JSON.parse(value) as T[keyof T];
      } catch {
        report[key] = null as T[keyof T];
      }
    }
  }
  report.is_caller_report = Boolean(report.is_caller_report) as T[keyof T];
  report.location = (report.address_text ?? null) as T[keyof T];
  return report;
}

async function getUserById(db: D1Database, id: number): Promise<User | null> {
  return db.prepare('SELECT id,email,full_name,phone,address,role,is_active,avatar_url,created_at,updated_at FROM profiles WHERE id=?')
    .bind(id).first<User>();
}

async function dispatch(request: Request, env: Environment): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? '';
  const method = request.method.toUpperCase();
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';

  if (action === 'health' && method === 'GET') {
    await env.DB.prepare('SELECT 1').first();
    return ok({ status: 'ok' });
  }

  if (action === 'session' && method === 'GET') {
    const { session, cookie } = await ensureSession(request, env.DB);
    const user = session.user_id ? await getUserById(env.DB, session.user_id) : null;
    return ok({ authenticated: Boolean(user?.is_active), user: user?.is_active ? user : null, csrf_token: session.csrf_token }, 200, cookie);
  }

  if (action === 'bootstrap-admin' && method === 'POST') {
    if (!env.BOOTSTRAP_ADMIN_TOKEN) fail('Administrator setup is not enabled.', 404);
    const suppliedToken = request.headers.get('X-Admin-Bootstrap-Token') ?? '';
    const expectedHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.BOOTSTRAP_ADMIN_TOKEN));
    const suppliedHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(suppliedToken));
    const expected = new Uint8Array(expectedHash);
    const supplied = new Uint8Array(suppliedHash);
    let mismatch = suppliedToken.length ^ env.BOOTSTRAP_ADMIN_TOKEN.length;
    for (let index = 0; index < expected.length; index++) mismatch |= expected[index] ^ supplied[index];
    if (mismatch !== 0) fail('Administrator setup token is invalid.', 403);
    const body = await requestBody(request);
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM profiles WHERE role='admin'").first<{ count: number }>();
    if ((count?.count ?? 0) > 0) fail('An administrator already exists.', 409);
    const name = text(body.full_name, 'Full name', 120)!;
    const email = text(body.email, 'Email', 254)!.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
    const passwordHash = await hashPassword(String(body.password ?? ''));
    const result = await env.DB.prepare(
      'INSERT INTO profiles(email,full_name,password_hash,role) VALUES(?,?,?,?)',
    ).bind(email, name, passwordHash, 'admin').run();
    await audit(env.DB, null, 'initial_admin_created', 'profiles', result.meta.last_row_id, { email }, ip);
    return ok({ created: true }, 201);
  }

  if (action === 'device-reading' && method === 'POST') {
    return json({ error: { message: 'IoT ingestion migration is not complete yet.' } }, 501);
  }

  const session = await getSession(request, env.DB);
  if (method !== 'GET' && !(action === 'login' || action === 'register')) await requireCsrf(request, env.DB);

  if (action === 'login' && method === 'POST') {
    await requireCsrf(request, env.DB);
    const body = await requestBody(request);
    const email = text(body.email, 'Email', 254)!.toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('DELETE FROM login_attempts WHERE attempted_at<?').bind(now - 86400).run();
    const attempts = await env.DB.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE ip_address=? AND attempted_at>?')
      .bind(ip, now - 900).first<{ count: number }>();
    if ((attempts?.count ?? 0) >= 10) fail('Too many sign-in attempts. Wait 15 minutes and try again.', 429);
    const user = await env.DB.prepare(
      'SELECT id,email,full_name,role,is_active,password_hash FROM profiles WHERE email=?',
    ).bind(email).first<User & { password_hash: string }>();
    if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash))) {
      await env.DB.prepare('INSERT INTO login_attempts(email,ip_address,attempted_at) VALUES(?,?,?)')
        .bind(email, ip, now).run();
      fail('Email or password is incorrect.', 401);
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE email=? OR ip_address=?').bind(email, ip).run();
    const nextSession = await rotateSession(request, env.DB, user.id);
    await audit(env.DB, user.id, 'login', 'session', undefined, undefined, ip);
    return ok({
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
      csrf_token: nextSession.csrf_token,
    }, 200, nextSession.cookie);
  }

  if (action === 'register' && method === 'POST') {
    await requireCsrf(request, env.DB);
    const body = await requestBody(request);
    const name = text(body.full_name, 'Full name', 120)!;
    const email = text(body.email, 'Email', 254)!.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
    const phone = text(body.phone, 'Phone', 40, false);
    const address = text(body.address, 'Address', 255, false);
    const passwordHash = await hashPassword(String(body.password ?? ''));
    let result: D1Result<unknown>;
    try {
      result = await env.DB.prepare(
        "INSERT INTO profiles(email,full_name,phone,address,password_hash,role) VALUES(?,?,?,?,?,'resident')",
      ).bind(email, name, phone, address, passwordHash).run();
    } catch (error) {
      if (String(error).toLowerCase().includes('unique')) fail('An account with that email already exists.', 409);
      throw error;
    }
    const id = result.meta.last_row_id;
    const nextSession = await rotateSession(request, env.DB, id);
    await audit(env.DB, id, 'resident_registered', 'profiles', id, undefined, ip);
    return ok({
      user: { id, email, full_name: name, role: 'resident' },
      csrf_token: nextSession.csrf_token,
    }, 201, nextSession.cookie);
  }

  if (action === 'logout' && method === 'POST') {
    const user = await requireUser(env.DB, session);
    await audit(env.DB, user.id, 'logout', 'session', undefined, undefined, ip);
    if (session) await env.DB.prepare('DELETE FROM app_sessions WHERE id=?').bind(session.id).run();
    const cookie = sessionCookie('', request, 0);
    return ok({ csrf_token: randomHex() }, 200, cookie);
  }

  if (action === 'profile' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    return ok(user);
  }
  if (action === 'profile' && method === 'PATCH') {
    const user = await requireUser(env.DB, session);
    const body = await requestBody(request);
    const allowed = ['full_name', 'phone', 'address', 'avatar_url'] as const;
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of allowed) {
      if (!Object.hasOwn(body, key)) continue;
      fields.push(`${key}=?`);
      values.push(text(body[key], key, key === 'full_name' ? 120 : key === 'address' ? 255 : 500, key === 'full_name'));
    }
    if (!fields.length) fail('No profile fields were provided.');
    values.push(user.id);
    await env.DB.prepare(`UPDATE profiles SET ${fields.join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values).run();
    await audit(env.DB, user.id, 'profile_updated', 'profiles', user.id, undefined, ip);
    return ok(await getUserById(env.DB, user.id));
  }

  if (action === 'reports' && method === 'GET' || action === 'my-reports' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    const { size, offset } = pageParams(url, action === 'my-reports' ? 20 : 50);
    const filters = ['status', 'emergency_type', 'severity'] as const;
    const where: string[] = [];
    const args: unknown[] = [];
    if (action === 'my-reports' || user.role === 'resident') {
      where.push('r.reporter_id=?');
      args.push(user.id);
    }
    for (const key of filters) {
      const value = url.searchParams.get(key);
      if (!value) continue;
      const values = key === 'status' ? STATUSES : key === 'severity' ? SEVERITIES : EMERGENCY_TYPES;
      where.push(`r.${key}=?`);
      args.push(enumValue(value, values, key));
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const total = await env.DB.prepare(`SELECT COUNT(*) AS count FROM emergency_reports r${clause}`)
      .bind(...args).first<{ count: number }>();
    const rows = await env.DB.prepare(`${REPORT_SELECT}${clause} ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`)
      .bind(...args, size, offset).all<Record<string, unknown>>();
    return ok({ items: rows.results.map(decodeReport), total: total?.count ?? 0 });
  }

  if (action === 'active-reports' && method === 'GET') {
    const rows = await env.DB.prepare(
      "SELECT id,emergency_type,severity,status,latitude,longitude,address_text,created_at FROM emergency_reports WHERE status IN ('open','in_progress') AND latitude IS NOT NULL ORDER BY created_at DESC LIMIT 200",
    ).all<Record<string, unknown>>();
    return ok(rows.results.map(row => ({ ...row, location: row.address_text })));
  }

  if (action === 'report' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    const id = Number(url.searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) fail('A valid report ID is required.');
    const row = await env.DB.prepare(`${REPORT_SELECT} WHERE r.id=?`).bind(id).first<Record<string, unknown>>();
    if (!row) fail('Report not found.', 404);
    if (user.role === 'resident' && Number(row.reporter_id) !== user.id) fail('You are not authorized to view this report.', 403);
    return ok(decodeReport(row));
  }

  if (action === 'reports' && method === 'POST') {
    const user = await requireUser(env.DB, session);
    const body = await requestBody(request);
    const type = enumValue(body.emergency_type ?? 'other', EMERGENCY_TYPES, 'emergency type');
    const severity = enumValue(body.severity ?? 'moderate', SEVERITIES, 'severity');
    const description = text(body.description ?? null, 'Description', 5000, false);
    const latitude = numberValue(body.latitude, -90, 90, 'Latitude', true);
    const longitude = numberValue(body.longitude, -180, 180, 'Longitude', true);
    if ((latitude === null) !== (longitude === null)) fail('Provide both coordinates, or leave both empty.');
    const address = text(body.address_text ?? body.location ?? null, 'Location', 255, false);
    if (!address && latitude === null) fail('Provide a location or coordinates.');
    const photo = text(body.photo_url ?? null, 'Photo path', 200, false);
    if (photo) {
      const staged = await env.DB.prepare('SELECT 1 FROM report_media WHERE path=? AND user_id=?').bind(photo, user.id).first();
      if (!staged) fail('The uploaded photo is invalid.', 403);
    }
    const created = await env.DB.prepare(
      'INSERT INTO emergency_reports(reporter_id,emergency_type,severity,description,latitude,longitude,address_text,photo_url) VALUES(?,?,?,?,?,?,?,?)',
    ).bind(user.id, type, severity, description, latitude, longitude, address, photo).run();
    const id = created.meta.last_row_id;
    const title = `New Emergency Report: ${type.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())}`;
    const location = latitude !== null
      ? ` at GPS coordinates ${latitude.toFixed(6)}, ${longitude?.toFixed(6)}`
      : address ? ` for ${address}` : ' at an unspecified location';
    const bodyText = `A ${severity} severity report was submitted${location}.`;
    await env.DB.batch([
      ...(['ldrrmo_staff', 'supervisor', 'admin'] as const).map(role => env.DB.prepare(
        "INSERT INTO notifications(title,body,channel,status,target_role,sent_at) VALUES(?,?,'in_app','sent',?,CURRENT_TIMESTAMP)",
      ).bind(title, bodyText, role)),
      env.DB.prepare('INSERT INTO audit_logs(user_id,action,table_name,record_id,ip_address) VALUES(?,?,?,?,?)')
        .bind(user.id, 'report_created', 'emergency_reports', String(id), ip),
    ]);
    const row = await env.DB.prepare(`${REPORT_SELECT} WHERE r.id=?`).bind(id).first<Record<string, unknown>>();
    if (!row) throw new Error('The saved report could not be loaded.');
    return ok(decodeReport(row), 201);
  }

  if (action === 'report-status' && method === 'PATCH') {
    const user = await requireUser(env.DB, session);
    requireRole(user, ['ldrrmo_staff', 'supervisor', 'admin']);
    const id = Number(url.searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) fail('A valid report ID is required.');
    const body = await requestBody(request);
    const status = enumValue(body.status, STATUSES, 'status');
    if (['resolved', 'closed'].includes(status)) requireRole(user, ['supervisor', 'admin']);
    if (Object.hasOwn(body, 'after_action_report')) requireRole(user, ['supervisor', 'admin']);
    const report = await env.DB.prepare('SELECT status,after_action_report FROM emergency_reports WHERE id=?')
      .bind(id).first<{ status: string; after_action_report: string | null }>();
    if (!report) fail('The report does not exist.', 404);
    const afterAction = Object.hasOwn(body, 'after_action_report')
      ? text(body.after_action_report, 'After-action report', 5000, false)
      : report.after_action_report;
    if (status === 'closed' && !afterAction) fail('An after-action report is required before closing an incident.');
    const statements: D1Statement[] = [
      env.DB.prepare('UPDATE emergency_reports SET status=?,after_action_report=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .bind(status, afterAction, id),
    ];
    if (report.status !== status) {
      statements.push(env.DB.prepare('INSERT INTO status_updates(report_id,updated_by,old_status,new_status,notes) VALUES(?,?,?,?,?)')
        .bind(id, user.id, report.status, status, text(body.notes ?? null, 'Notes', 5000, false)));
      if (['resolved', 'closed'].includes(status)) {
        statements.push(env.DB.prepare('UPDATE safe_routes SET is_active=0 WHERE report_id=? AND is_active=1').bind(id));
      }
      statements.push(env.DB.prepare('INSERT INTO audit_logs(user_id,action,table_name,record_id,ip_address) VALUES(?,?,?,?,?)')
        .bind(user.id, 'report_status_changed', 'emergency_reports', String(id), ip));
    }
    await env.DB.batch(statements);
    const updated = await env.DB.prepare(`${REPORT_SELECT} WHERE r.id=?`).bind(id).first<Record<string, unknown>>();
    if (!updated) throw new Error('The updated report could not be loaded.');
    return ok(decodeReport(updated));
  }

  if (action === 'staff-profiles' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    requireRole(user, ['ldrrmo_staff', 'supervisor', 'admin']);
    const rows = await env.DB.prepare(
      "SELECT id,email,full_name,phone,role,is_active,created_at,updated_at FROM profiles WHERE is_active=1 AND role IN ('ldrrmo_staff','supervisor','admin') ORDER BY full_name",
    ).all();
    return ok(rows.results);
  }

  if (action === 'operations-summary' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    requireRole(user, ['ldrrmo_staff', 'supervisor', 'admin']);
    const rows = await env.DB.prepare(`${REPORT_SELECT} ORDER BY r.created_at DESC LIMIT 5`).all<Record<string, unknown>>();
    const counts = await env.DB.prepare('SELECT status,COUNT(*) AS count FROM emergency_reports GROUP BY status').all<{ status: string; count: number }>();
    const total = await env.DB.prepare('SELECT COUNT(*) AS count FROM emergency_reports').first<{ count: number }>();
    const summary: Record<string, number> = { open: 0, in_progress: 0, resolved: 0, total: total?.count ?? 0 };
    for (const row of counts.results) summary[row.status] = row.count;
    return ok({ reports: rows.results.map(decodeReport), counts: summary });
  }

  if (action === 'dashboard' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    requireRole(user, ['ldrrmo_staff', 'supervisor', 'admin']);
    const stats = await env.DB.prepare(
      `SELECT
        SUM(CASE WHEN status IN ('open','in_progress') THEN 1 ELSE 0 END) AS active_incidents,
        (SELECT COUNT(*) FROM iot_devices WHERE sensor_type='water_level' AND status='active') AS flood_sensors,
        (SELECT COUNT(*) FROM profiles WHERE is_active=1 AND role IN ('ldrrmo_staff','supervisor','admin')) AS total_responders,
        COUNT(*) AS total_reports
       FROM emergency_reports`,
    ).first<Record<string, number>>();
    const reportRows = await env.DB.prepare(`${REPORT_SELECT} ORDER BY r.created_at DESC LIMIT 6`).all<Record<string, unknown>>();
    const mapRows = await env.DB.prepare(
      'SELECT id,emergency_type,severity,status,description,address_text AS location,latitude,longitude,created_at FROM emergency_reports WHERE latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 200',
    ).all<Record<string, unknown>>();
    const sensors = await env.DB.prepare(
      `SELECT id,device_code,name,sensor_type,alert_unit AS unit,latitude,longitude,alert_threshold,status,last_reading,last_reading_at,
        CASE WHEN last_reading>=alert_threshold THEN 1 ELSE 0 END AS is_alert FROM iot_devices ORDER BY created_at DESC`,
    ).all<Record<string, unknown>>();
    const reports = reportRows.results.map(row => {
      const report = decodeReport(row);
      return {
        id: report.id,
        emergency_type: report.emergency_type,
        severity: report.severity,
        status: report.status,
        description: report.description,
        location: report.location,
        latitude: report.latitude,
        longitude: report.longitude,
        created_at: report.created_at,
        reporter_name: report.reporter_name,
      };
    });
    return ok({
      stats: {
        active_incidents: stats?.active_incidents ?? 0,
        flood_sensors: stats?.flood_sensors ?? 0,
        total_responders: stats?.total_responders ?? 0,
        total_reports: stats?.total_reports ?? 0,
      },
      reports,
      map_reports: mapRows.results,
      sensors: sensors.results.map(sensor => ({ ...sensor, is_alert: Boolean(sensor.is_alert) })),
    });
  }

  if (action === 'evacuation-centers' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM evacuation_centers ORDER BY name').all();
    return ok(rows.results);
  }

  if (action === 'safe-routes' && method === 'GET') {
    const routes = await env.DB.prepare(
      `SELECT s.id,s.report_id,s.title,s.path_json,s.is_active,s.created_by,s.created_at
       FROM safe_routes s JOIN emergency_reports r ON r.id=s.report_id
       WHERE s.is_active=1 AND r.status IN ('open','in_progress') ORDER BY s.created_at DESC LIMIT 100`,
    ).all<Record<string, unknown>>();
    return ok(routes.results.map(route => {
      let path: unknown;
      try {
        path = JSON.parse(String(route.path_json));
      } catch {
        throw new Error('A saved alternate route contains invalid coordinates.');
      }
      return {
        ...route,
        report_id: Number(route.report_id),
        created_by: route.created_by === null ? null : Number(route.created_by),
        is_active: Boolean(route.is_active),
        path,
      };
    }));
  }

  if (action === 'report-assignments' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    requireRole(user, ['ldrrmo_staff', 'supervisor', 'admin']);
    const id = Number(url.searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) fail('A valid report ID is required.');
    const rows = await env.DB.prepare(
      `SELECT a.*,json_object('full_name',p.full_name,'role',p.role) AS profiles
       FROM report_assignments a JOIN profiles p ON p.id=a.responder_id
       WHERE a.report_id=? ORDER BY a.created_at DESC`,
    ).bind(id).all<Record<string, unknown>>();
    return ok(rows.results.map(row => ({ ...row, profiles: JSON.parse(String(row.profiles)) })));
  }

  if (action === 'report-status-history' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    requireRole(user, ['ldrrmo_staff', 'supervisor', 'admin']);
    const id = Number(url.searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) fail('A valid report ID is required.');
    const rows = await env.DB.prepare(
      `SELECT s.*,json_object('full_name',p.full_name) AS profiles
       FROM status_updates s JOIN profiles p ON p.id=s.updated_by
       WHERE s.report_id=? ORDER BY s.created_at DESC`,
    ).bind(id).all<Record<string, unknown>>();
    return ok(rows.results.map(row => ({ ...row, profiles: JSON.parse(String(row.profiles)) })));
  }

  if (action === 'locations' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    requireRole(user, ['ldrrmo_staff', 'supervisor', 'admin']);
    const rows = await env.DB.prepare(
      `SELECT l.* FROM location_updates l
       JOIN (SELECT user_id,MAX(id) AS id FROM location_updates GROUP BY user_id) latest ON latest.id=l.id
       ORDER BY l.created_at DESC`,
    ).all();
    return ok(rows.results);
  }

  if (action === 'notifications' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    const { size, offset } = pageParams(url, 30);
    const rows = await env.DB.prepare(
      `SELECT n.*,CASE WHEN nr.id IS NULL THEN 0 ELSE 1 END AS is_read
       FROM notifications n LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=?
       WHERE n.target_user_id=? OR n.target_role=? OR (n.target_user_id IS NULL AND n.target_role IS NULL)
       ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
    ).bind(user.id, user.id, user.role, size, offset).all<Record<string, unknown>>();
    return ok(rows.results.map(row => ({ ...row, is_read: Boolean(row.is_read) })));
  }

  if (action === 'system-config' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    requireRole(user, ['admin']);
    const rows = await env.DB.prepare('SELECT key,value,description,updated_at FROM system_config ORDER BY key').all();
    return ok(rows.results);
  }

  if (action === 'iot-devices' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    requireRole(user, ['ldrrmo_staff', 'supervisor', 'admin']);
    const rows = await env.DB.prepare(
      'SELECT d.*,0 AS is_alert FROM iot_devices d ORDER BY d.name',
    ).all<Record<string, unknown>>();
    return ok(rows.results.map(row => ({ ...row, is_alert: false })));
  }

  if (action === 'sensor-readings' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    requireRole(user, ['ldrrmo_staff', 'supervisor', 'admin']);
    const deviceId = Number(url.searchParams.get('device_id'));
    if (!Number.isInteger(deviceId) || deviceId < 1) fail('A valid device ID is required.');
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
    const rows = await env.DB.prepare(
      'SELECT * FROM sensor_readings WHERE device_id=? ORDER BY recorded_at DESC LIMIT ?',
    ).bind(deviceId, limit).all();
    return ok(rows.results);
  }

  if (action === 'report-media' && method === 'POST') {
    const user = await requireUser(env.DB, session);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) fail('Choose a valid image to upload.');
    if (file.size > 1_000_000) fail('Photo must be under 1MB on the free pilot.', 413);
    const signatures: Record<string, { extension: string; bytes: number[] }> = {
      'image/jpeg': { extension: 'jpg', bytes: [0xff, 0xd8, 0xff] },
      'image/png': { extension: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
      'image/gif': { extension: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
      'image/webp': { extension: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] },
    };
    const signature = signatures[file.type];
    const data = new Uint8Array(await file.arrayBuffer());
    if (!signature || !signature.bytes.every((byte, index) => data[index] === byte)) {
      fail('Only valid JPEG, PNG, WebP, and GIF images are accepted.');
    }
    const path = `${user.id}/${randomHex(24)}.${signature.extension}`;
    await env.DB.prepare('INSERT INTO report_media(path,user_id,mime_type,body) VALUES(?,?,?,?)')
      .bind(path, user.id, file.type, data).run();
    return ok({ path }, 201);
  }

  if (action === 'report-media' && method === 'GET') {
    const user = await requireUser(env.DB, session);
    const path = url.searchParams.get('path') ?? '';
    if (!new RegExp(`^${user.id}/[a-f0-9]{48}\\.(jpg|png|webp|gif)$`).test(path)) fail('File not found.', 404);
    const result = await env.DB.prepare(
      `SELECT m.mime_type,m.body,r.reporter_id FROM report_media m
       JOIN emergency_reports r ON r.photo_url=m.path WHERE m.path=?`,
    ).bind(path).first<{ mime_type: string; body: ArrayBuffer; reporter_id: number }>();
    if (!result || (result.reporter_id !== user.id && !['ldrrmo_staff', 'supervisor', 'admin'].includes(user.role))) {
      fail('File not found.', 404);
    }
    return new Response(result.body, {
      headers: {
        'Content-Type': result.mime_type,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  return json({ error: { message: 'This API action has not been migrated yet.' } }, 501);
}

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    try {
      return await dispatch(request, env);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: { message: error.message } }, error.status);
      console.error('[LDRRMO Worker]', error);
      return json({ error: { message: 'The server could not complete this request.' } }, 500);
    }
  },
};
