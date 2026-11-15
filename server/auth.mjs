import express from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = 'luna_session';
const AGE = 8 * 60 * 60;
const equal = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const sign = (payload, secret) => createHmac('sha256', secret).update('luna-login-v1:' + payload).digest('base64url');
export function issueSession(secret, now = Date.now()) {
  const payload = `${now + AGE * 1000}.${randomBytes(24).toString('base64url')}`;
  return `${payload}.${sign(payload, secret)}`;
}
export function validSession(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 200) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
  const expiry = Number(parts[0]);
  return expiry > now && expiry <= now + AGE * 1000 && equal(parts[2], sign(parts.slice(0, 2).join('.'), secret));
}
function page(error = '') {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>登入 Luna Live</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;background:#0a1417;color:#e6f2f0;font:16px system-ui;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}main{width:100%;max-width:400px;background:#112126;border:1px solid #304a50;border-radius:24px;padding:28px}h1{letter-spacing:.12em}p{color:#a9c1c6;line-height:1.6}label{display:block;margin:20px 0 8px}input,button{width:100%;font:inherit;border-radius:12px;min-height:50px;padding:12px}input{background:#0a1417;color:white;border:1px solid #58747b}button{margin-top:24px;background:#b6e8db;color:#102a29;border:0;font-weight:700;cursor:pointer}input:focus-visible,button:focus-visible{outline:3px solid #a9d2ff;outline-offset:3px}.error{color:#ffb6b6}</style></head><body><main><h1>LUNA LIVE</h1><p>登入後，繼續與 Luna 對話。</p>${error ? `<p class="error" role="alert">${error}</p>` : ''}<form method="post" action="/login"><label for="username">帳號</label><input id="username" name="username" value="luna" autocomplete="username" autocapitalize="none" spellcheck="false" required><label for="password">密碼</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">登入</button></form><p>請使用原本的 Luna 帳密。登入有效時間為 8 小時。</p></main></body></html>`;
}
export function installAuth(app) {
  const attempts = new Map();
  const timer = setInterval(() => { for (const [ip, item] of attempts) if (Date.now() - item.time >= 60000) attempts.delete(ip); }, 60000);
  timer.unref();
  const key = req => req.socket.remoteAddress || 'unknown';
  const limited = req => { const item = attempts.get(key(req)); return item && Date.now() - item.time < 60000 && item.count >= 20; };
  const fail = req => { const ip = key(req), item = attempts.get(ip); if (attempts.size < 10000 || attempts.has(ip)) attempts.set(ip, {time:Date.now(), count:item && Date.now()-item.time<60000 ? item.count+1 : 1}); };
  const session = req => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const authenticated = req => Boolean(process.env.APP_PASSWORD && validSession(session(req), process.env.APP_PASSWORD));
  app.get('/login', (req, res) => authenticated(req) ? res.redirect(303, '/') : res.type('html').send(page()));
  app.post('/login', express.urlencoded({extended:false, limit:'4kb'}), (req, res) => {
    const origin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
    if (!origin || req.get('origin') !== new URL(origin).origin) return res.status(403).type('html').send(page('登入來源無效，請從本站重新登入。'));
    const secret = process.env.APP_PASSWORD;
    if (!secret) return res.status(503).type('html').send(page('登入服務尚未設定。'));
    if (limited(req)) return res.set('Retry-After','60').status(429).type('html').send(page('嘗試次數過多，請稍候 1 分鐘再試。'));
    if (req.body?.username !== 'luna' || typeof req.body?.password !== 'string' || !equal(req.body.password, secret)) {
      fail(req); return res.status(401).type('html').send(page('帳號或密碼不正確，請重新輸入。'));
    }
    attempts.delete(key(req));
    res.cookie(COOKIE, issueSession(secret), {httpOnly:true, secure:new URL(origin).protocol === 'https:', sameSite:'lax', path:'/', maxAge:AGE * 1000});
    res.redirect(303, '/');
  });
  app.use((req, res, next) => {
    const secret = process.env.APP_PASSWORD;
    if (!secret) return res.status(503).send('APP_PASSWORD is not configured.');
    if (authenticated(req)) return next();
    // Retain Basic credentials for existing API clients, without a browser challenge.
    const auth = req.get('authorization') || '';
    if (auth.startsWith('Basic ')) {
      const plain = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const split = plain.indexOf(':');
      if (plain.slice(0, split) === 'luna' && equal(plain.slice(split + 1), secret)) return next();
    }
    if (limited(req)) return res.set('Retry-After','60').status(429).json({error:'login_rate_limited'});
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.redirect(303, '/login');
    fail(req);
    res.status(401).json({error:'login_required'});
  });
}
