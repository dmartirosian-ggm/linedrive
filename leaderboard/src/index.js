// Linedrive leaderboard: GET /top, POST /score. Backed by Cloudflare D1.
const MAX_SPEED = 30;        // game top speed in metres per second
const SLACK = 25;            // metres of tolerance for timing jitter
const TAG_RE = /^[A-Z0-9 _\-.]{1,14}$/;
const ID_RE = /^[a-z0-9]{8,64}$/;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

export async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  if (request.method === 'GET' && url.pathname === '/top') {
    const id = url.searchParams.get('id') || '';
    const { results } = await env.DB.prepare('SELECT id, tag, best FROM scores ORDER BY best DESC, at ASC LIMIT 10').all();
    let you = null;
    if (ID_RE.test(id)) {
      const me = await env.DB.prepare('SELECT best FROM scores WHERE id = ?').bind(id).first();
      if (me) {
        const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE best > ?').bind(me.best).first();
        you = { rank: (r?.n ?? 0) + 1, best: me.best };
      }
    }
    return json({ top: results.map((r) => ({ tag: r.tag, best: r.best, me: r.id === id })), you });
  }

  if (request.method === 'POST' && url.pathname === '/score') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const id = String(body.id || '');
    const tag = String(body.tag || '').toUpperCase().trim();
    const best = Math.floor(Number(body.best));
    const dur = body.dur == null ? null : Number(body.dur);
    if (!ID_RE.test(id)) return json({ error: 'Invalid id' }, 400);
    if (!TAG_RE.test(tag)) return json({ error: 'Tag must be 1-14 letters, numbers, spaces, - _ or .' }, 400);
    if (!Number.isFinite(best) || best < 0 || best > 200000) return json({ error: 'Invalid score' }, 400);

    const existing = await env.DB.prepare('SELECT best FROM scores WHERE id = ?').bind(id).first();
    const now = Date.now();
    if (existing && best <= existing.best) {
      // Tag change only.
      await env.DB.prepare('UPDATE scores SET tag = ? WHERE id = ?').bind(tag, id).run();
      return json({ ok: true, best: existing.best });
    }
    // A new best must be physically possible for the run time reported.
    if (dur == null || !Number.isFinite(dur) || dur <= 0 || best > dur * MAX_SPEED + SLACK) {
      return json({ error: 'Score rejected' }, 422);
    }
    await env.DB.prepare(
      'INSERT INTO scores (id, tag, best, at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET tag = excluded.tag, best = excluded.best, at = excluded.at'
    ).bind(id, tag, best, now).run();
    return json({ ok: true, best });
  }

  return json({ error: 'Not found' }, 404);
}

export default { fetch: (request, env) => handle(request, env).catch(() => json({ error: 'Server error' }, 500)) };
