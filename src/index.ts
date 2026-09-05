export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface FlightRecord {
  id?: string;
  date?: string | null;
  year?: number | string | null;
  aircraft?: string | null;
  ident?: string | null;
  from?: string | null;
  to?: string | null;
  duration?: number | string | null;
  dayLandings?: number | string | null;
  nightLandings?: number | string | null;
  source?: string | null;
  logbook?: string | null;
  remarks?: string | null;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });
}

function rowToFlight(row: Record<string, unknown>) {
  return {
    id: row.id,
    date: row.date,
    year: row.year,
    aircraft: row.aircraft,
    ident: row.ident,
    from: row.from_airport,
    to: row.to_airport,
    duration: row.duration,
    dayLandings: row.day_landings,
    nightLandings: row.night_landings,
    source: row.source,
    logbook: row.logbook,
    remarks: row.remarks,
  };
}

function parseYear(yearInput: unknown, dateInput?: unknown): number | null {
  // Prefer a trailing year embedded in a full date, e.g. "4/16/2003" or "4/16/03"
  // — this is what the dashboard's "Add flight" form actually submits, since it
  // has a single free-text Date field and no separate Year field.
  if (dateInput !== null && dateInput !== undefined) {
    const ds = String(dateInput).trim();
    const m = ds.match(/^\d{1,2}\/\d{1,2}\/(\d{2,4})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      return m[1].length === 2 ? 2000 + y : y;
    }
  }
  // Otherwise fall back to an explicit year field, e.g. "2002" or "2005/2006".
  if (yearInput !== null && yearInput !== undefined) {
    const ys = String(yearInput);
    const m = ys.match(/\d{4}/) || ys.match(/^\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}

function num(input: unknown, fallback = 0): number {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function newId(): string {
  // "fNNNN" style id, timestamp-based so it never collides.
  return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function listFlights(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM flights ORDER BY year IS NULL, year, date'
  ).all();
  return json((results || []).map(rowToFlight));
}

async function createFlight(env: Env, body: FlightRecord): Promise<Response> {
  const id = body.id && String(body.id).trim() ? String(body.id).trim() : newId();
  const year = parseYear(body.year, body.date);
  await env.DB.prepare(
    `INSERT INTO flights
      (id, date, year, aircraft, ident, from_airport, to_airport, duration, day_landings, night_landings, source, logbook, remarks, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      id,
      body.date ?? null,
      year,
      body.aircraft ?? null,
      body.ident ?? null,
      body.from ?? null,
      body.to ?? null,
      num(body.duration, 0),
      num(body.dayLandings, 0),
      num(body.nightLandings, 0),
      body.source ?? null,
      body.logbook ?? null,
      body.remarks ?? null
    )
    .run();

  const row = await env.DB.prepare('SELECT * FROM flights WHERE id = ?').bind(id).first();
  return json(rowToFlight(row as Record<string, unknown>), { status: 201 });
}

async function updateFlight(env: Env, id: string, body: FlightRecord): Promise<Response> {
  const existing = await env.DB.prepare('SELECT * FROM flights WHERE id = ?').bind(id).first();
  if (!existing) return json({ error: 'not found' }, { status: 404 });

  const merged = { ...rowToFlight(existing as Record<string, unknown>), ...body };
  const year = parseYear(merged.year, merged.date);

  await env.DB.prepare(
    `UPDATE flights SET
       date = ?, year = ?, aircraft = ?, ident = ?, from_airport = ?, to_airport = ?,
       duration = ?, day_landings = ?, night_landings = ?, source = ?, logbook = ?, remarks = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      merged.date ?? null,
      year,
      merged.aircraft ?? null,
      merged.ident ?? null,
      merged.from ?? null,
      merged.to ?? null,
      num(merged.duration, 0),
      num(merged.dayLandings, 0),
      num(merged.nightLandings, 0),
      merged.source ?? null,
      merged.logbook ?? null,
      merged.remarks ?? null,
      id
    )
    .run();

  const row = await env.DB.prepare('SELECT * FROM flights WHERE id = ?').bind(id).first();
  return json(rowToFlight(row as Record<string, unknown>));
}

async function deleteFlight(env: Env, id: string): Promise<Response> {
  await env.DB.prepare('DELETE FROM flights WHERE id = ?').bind(id).run();
  return new Response(null, { status: 204 });
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function exportCsv(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM flights ORDER BY year IS NULL, year, date'
  ).all();
  const cols = ['date', 'year', 'aircraft', 'ident', 'from', 'to', 'duration', 'dayLandings', 'nightLandings', 'source', 'remarks'];
  const rows = (results || []).map(rowToFlight);
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(cols.map((c) => csvEscape((r as Record<string, unknown>)[c])).join(','));
  }
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="rice-flight-log.csv"',
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname === '/api/flights' && request.method === 'GET') {
        return await listFlights(env);
      }
      if (pathname === '/api/flights' && request.method === 'POST') {
        const body = (await request.json()) as FlightRecord;
        return await createFlight(env, body);
      }
      const flightMatch = pathname.match(/^\/api\/flights\/([^/]+)$/);
      if (flightMatch && request.method === 'PUT') {
        const body = (await request.json()) as FlightRecord;
        return await updateFlight(env, flightMatch[1], body);
      }
      if (flightMatch && request.method === 'DELETE') {
        return await deleteFlight(env, flightMatch[1]);
      }
      if (pathname === '/api/export.csv' && request.method === 'GET') {
        return await exportCsv(env);
      }
      if (pathname.startsWith('/api/')) {
        return json({ error: 'not found' }, { status: 404 });
      }
    } catch (err) {
      return json({ error: String((err as Error)?.message || err) }, { status: 500 });
    }

    // Fall through to static assets (the dashboard frontend).
    return env.ASSETS.fetch(request);
  },
};
