const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json({ limit: '100mb' }));

// ===== DATABASE (sql.js) =====
const initSqlJs = require('sql.js');
let db;
const dataDir = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : __dirname);
const dbPath = path.join(dataDir, 'shorouk_online.db');

async function initDb() {
  const SQL = await initSqlJs({ locateFile: () => path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm') });
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS staff (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, name TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, data TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS daylog (date TEXT, idx INTEGER, entry TEXT, PRIMARY KEY (date, idx))');
  saveDb();
}
function saveDb() { fs.writeFileSync(dbPath, Buffer.from(db.export())); }
function q(sql, params) {
  const stmt = db.prepare(sql);
  if (sql.trim().toUpperCase().startsWith('SELECT')) {
    const rows = []; while (stmt.step()) rows.push(stmt.getAsObject(params)); stmt.free(); return rows;
  }
  stmt.run(params); stmt.free(); saveDb(); return { changes: db.getRowsModified() };
}
function q1(sql, params) { const rows = q(sql, params); return rows.length ? rows[0] : null; }

// ===== API ROUTES =====
app.get('/api/settings/:key', (req, res) => {
  const row = q1('SELECT value FROM settings WHERE key=?', [req.params.key]);
  res.json(row ? JSON.parse(row.value) : null);
});
app.post('/api/settings/:key', (req, res) => {
  q('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [req.params.key, JSON.stringify(req.body)]);
  res.json({ ok: true });
});
app.get('/api/staff', (req, res) => res.json(q('SELECT * FROM staff ORDER BY id')));
app.post('/api/staff', (req, res) => {
  try {
    q('INSERT INTO staff(username,password,name) VALUES(?,?,?)', [req.body.username, req.body.password, req.body.name]);
    res.json(q('SELECT * FROM staff ORDER BY id'));
  } catch(e) { res.status(409).json({ error: 'Username exists' }); }
});
app.put('/api/staff/:id/pw', (req, res) => {
  q('UPDATE staff SET password=? WHERE id=?', [req.body.password, parseInt(req.params.id)]);
  res.json({ ok: true });
});
app.delete('/api/staff/:id', (req, res) => {
  q('DELETE FROM staff WHERE id=?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});
app.get('/api/bookings', (req, res) => {
  res.json(q('SELECT data FROM bookings ORDER BY rowid DESC').map(r => JSON.parse(r.data)));
});
app.get('/api/bookings/:id', (req, res) => {
  const row = q1('SELECT data FROM bookings WHERE id=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(JSON.parse(row.data));
});
app.post('/api/bookings', (req, res) => {
  q('INSERT OR REPLACE INTO bookings(id,data) VALUES(?,?)', [req.body.id, JSON.stringify(req.body)]);
  res.json({ ok: true });
});
app.delete('/api/bookings/:id', (req, res) => {
  q('DELETE FROM bookings WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});
app.get('/api/daylog/:date', (req, res) => {
  const rows = q('SELECT * FROM daylog WHERE date=? ORDER BY idx', [req.params.date]);
  res.json(rows.map(r => JSON.parse(r.entry)));
});
app.post('/api/daylog/:date', (req, res) => {
  q('INSERT INTO daylog(date,idx,entry) VALUES(?,?,?)', [req.params.date, req.body.idx, JSON.stringify(req.body.entry)]);
  res.json({ ok: true });
});
app.delete('/api/daylog/:date/:idx', (req, res) => {
  q('DELETE FROM daylog WHERE date=? AND idx=?', [req.params.date, parseInt(req.params.idx)]);
  const rem = q('SELECT * FROM daylog WHERE date=? ORDER BY idx', [req.params.date]);
  for (let i = 0; i < rem.length; i++) { if (rem[i].idx !== i) q('UPDATE daylog SET idx=? WHERE date=? AND idx=?', [i, req.params.date, rem[i].idx]); }
  res.json({ ok: true });
});

// ===== STATIC FILES =====
app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ===== START =====
const PORT = process.env.PORT || 3000;
initDb().then(() => {
  console.log('✅ شغال على http://localhost:' + PORT);
  app.listen(PORT);
});
