const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const https = require('https');
const { db, hashPassword, checkPassword, generateCode } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_CHAT = 'https://ollama.com/api/chat';
const ADMIN_SETUP_CODE = process.env.ADMIN_SETUP_CODE || 'ADMIN-SETUP';
const CLASS_CODE_LENGTH = 6;

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ap-gov-grader-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ─── Auth middleware ─────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    if (!roles.includes(req.session.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// ─── Auth routes ─────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { email, password, name, role, classCode, setupCode } = req.body || {};
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'Missing email, password, name, or role' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  if (role === 'student') {
    if (!classCode || typeof classCode !== 'string') return res.status(400).json({ error: 'Class code required for students' });
    const cls = db.prepare('SELECT id FROM classes WHERE class_code = ?').get(classCode.trim().toUpperCase());
    if (!cls) return res.status(400).json({ error: 'Invalid class code' });
    const id = db.prepare('INSERT INTO users (email, password_hash, name, role, class_id) VALUES (?, ?, ?, ?, ?)')
      .run(email.trim(), hashPassword(password), name.trim(), 'student', cls.id);
    req.session.userId = id.lastInsertRowid;
    req.session.role = 'student';
    req.session.name = name.trim();
    return res.json({ user: { id: id.lastInsertRowid, email: email.trim(), name: name.trim(), role: 'student', classId: cls.id } });
  }

  if (role === 'teacher') {
    if (!setupCode || typeof setupCode !== 'string') return res.status(400).json({ error: 'Setup code required for teachers' });
    const codeRow = db.prepare('SELECT id FROM teacher_codes WHERE code = ? AND used_at IS NULL').get(setupCode.trim().toUpperCase());
    if (!codeRow) return res.status(400).json({ error: 'Invalid or already used setup code' });
    const id = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
      .run(email.trim(), hashPassword(password), name.trim(), 'teacher');
    db.prepare('UPDATE teacher_codes SET used_at = datetime("now"), used_by = ? WHERE id = ?').run(id.lastInsertRowid, codeRow.id);
    req.session.userId = id.lastInsertRowid;
    req.session.role = 'teacher';
    req.session.name = name.trim();
    return res.json({ user: { id: id.lastInsertRowid, email: email.trim(), name: name.trim(), role: 'teacher' } });
  }

  if (role === 'admin') {
    if (!setupCode || setupCode.trim() !== ADMIN_SETUP_CODE) return res.status(400).json({ error: 'Invalid admin setup code' });
    const id = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
      .run(email.trim(), hashPassword(password), name.trim(), 'admin');
    req.session.userId = id.lastInsertRowid;
    req.session.role = 'admin';
    req.session.name = name.trim();
    return res.json({ user: { id: id.lastInsertRowid, email: email.trim(), name: name.trim(), role: 'admin' } });
  }

  return res.status(400).json({ error: 'Invalid role' });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT id, email, password_hash, name, role, class_id FROM users WHERE email = ?').get(email.trim());
  if (!user || !checkPassword(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.name = user.name;
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, classId: user.class_id || undefined } });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const user = db.prepare('SELECT id, email, name, role, class_id FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Session invalid' });
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, classId: user.class_id || undefined } });
});

// ─── Prompts (admin: CRUD; teacher/student: list) ────────────────────────
app.get('/api/prompts', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, title, body, essay_type, rubric_json, created_at FROM prompts ORDER BY essay_type, title').all();
  res.json({ prompts: rows.map(p => ({ ...p, rubric: JSON.parse(p.rubric_json || '{}') })) });
});

app.get('/api/prompts/:id', requireAuth, (req, res) => {
  const p = db.prepare('SELECT id, title, body, essay_type, rubric_json FROM prompts WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Prompt not found' });
  res.json({ ...p, rubric: JSON.parse(p.rubric_json || '{}') });
});

app.post('/api/prompts', requireRole('admin'), (req, res) => {
  const { title, body, essay_type, rubric } = req.body || {};
  if (!title || !body || !essay_type) return res.status(400).json({ error: 'Missing title, body, or essay_type' });
  const rubricJson = rubric ? JSON.stringify(rubric) : require('./db').defaultRubric;
  const id = db.prepare('INSERT INTO prompts (title, body, essay_type, rubric_json) VALUES (?, ?, ?, ?)')
    .run(title.trim(), body.trim(), essay_type, rubricJson);
  res.status(201).json({ id: id.lastInsertRowid, title: title.trim(), body: body.trim(), essay_type, rubric: typeof rubric === 'object' ? rubric : JSON.parse(rubricJson) });
});

app.put('/api/prompts/:id', requireRole('admin'), (req, res) => {
  const { title, body, essay_type, rubric } = req.body || {};
  const existing = db.prepare('SELECT id FROM prompts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Prompt not found' });
  if (title !== undefined) db.prepare('UPDATE prompts SET title = ? WHERE id = ?').run(title.trim(), req.params.id);
  if (body !== undefined) db.prepare('UPDATE prompts SET body = ? WHERE id = ?').run(body.trim(), req.params.id);
  if (essay_type !== undefined) db.prepare('UPDATE prompts SET essay_type = ? WHERE id = ?').run(essay_type, req.params.id);
  if (rubric !== undefined) db.prepare('UPDATE prompts SET rubric_json = ? WHERE id = ?').run(JSON.stringify(rubric), req.params.id);
  const p = db.prepare('SELECT id, title, body, essay_type, rubric_json FROM prompts WHERE id = ?').get(req.params.id);
  res.json({ ...p, rubric: JSON.parse(p.rubric_json || '{}') });
});

app.delete('/api/prompts/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM assignments WHERE prompt_id = ?').run(req.params.id);
  const r = db.prepare('DELETE FROM prompts WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Prompt not found' });
  res.json({ ok: true });
});

// ─── Teacher codes (admin only) ───────────────────────────────────────────
app.get('/api/teacher-codes', requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT tc.id, tc.code, tc.created_at, tc.used_at, u.name as used_by_name
    FROM teacher_codes tc
    LEFT JOIN users u ON tc.used_by = u.id
    ORDER BY tc.created_at DESC
  `).all();
  res.json({ codes: rows });
});

app.post('/api/teacher-codes', requireRole('admin'), (req, res) => {
  const code = generateCode();
  db.prepare('INSERT INTO teacher_codes (code, created_by) VALUES (?, ?)').run(code, req.session.userId);
  res.status(201).json({ code });
});

// ─── Classes (teacher: create/list; admin: list all) ───────────────────────
app.get('/api/classes', requireAuth, (req, res) => {
  if (req.session.role === 'admin') {
    const rows = db.prepare(`
      SELECT c.id, c.name, c.class_code, c.created_at, u.name as teacher_name, u.email as teacher_email
      FROM classes c
      JOIN users u ON c.teacher_id = u.id
      ORDER BY c.created_at DESC
    `).all();
    return res.json({ classes: rows });
  }
  if (req.session.role === 'teacher') {
    const rows = db.prepare('SELECT id, name, class_code, created_at FROM classes WHERE teacher_id = ? ORDER BY created_at DESC').all(req.session.userId);
    return res.json({ classes: rows });
  }
  return res.status(403).json({ error: 'Forbidden' });
});

app.post('/api/classes', requireRole('teacher'), (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM classes WHERE teacher_id = ?').get(req.session.userId);
  if (count.c >= 2) return res.status(400).json({ error: 'Maximum 2 classes allowed' });
  const name = (req.body && req.body.name) ? req.body.name.trim() : 'My Class';
  let classCode = '';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < CLASS_CODE_LENGTH; i++) classCode += chars[Math.floor(Math.random() * chars.length)];
  const existing = db.prepare('SELECT id FROM classes WHERE class_code = ?').get(classCode);
  if (existing) classCode = classCode.slice(0, -1) + chars[Math.floor(Math.random() * chars.length)];
  const id = db.prepare('INSERT INTO classes (teacher_id, name, class_code) VALUES (?, ?, ?)').run(req.session.userId, name, classCode);
  res.status(201).json({ id: id.lastInsertRowid, name, class_code: classCode });
});

app.get('/api/classes/:id', requireAuth, (req, res) => {
  const c = db.prepare('SELECT id, name, class_code, teacher_id, created_at FROM classes WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  if (req.session.role === 'admin' || c.teacher_id === req.session.userId) {
    const assignments = db.prepare('SELECT prompt_id FROM assignments WHERE class_id = ?').all(req.params.id);
    const students = db.prepare('SELECT id, name, email, created_at FROM users WHERE class_id = ? AND role = ?').all(req.params.id, 'student');
    return res.json({ ...c, assignmentPromptIds: assignments.map(a => a.prompt_id), students });
  }
  return res.status(403).json({ error: 'Forbidden' });
});

// ─── Assignments (teacher: assign prompt to class) ───────────────────────
app.get('/api/classes/:id/assignments', requireAuth, (req, res) => {
  const c = db.prepare('SELECT id, teacher_id FROM classes WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  if (req.session.role !== 'admin' && c.teacher_id !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
  const rows = db.prepare('SELECT a.prompt_id, a.assigned_at, p.title, p.essay_type FROM assignments a JOIN prompts p ON a.prompt_id = p.id WHERE a.class_id = ? ORDER BY a.assigned_at').all(req.params.id);
  res.json({ assignments: rows });
});

app.post('/api/classes/:id/assignments', requireRole('teacher'), (req, res) => {
  const { promptId } = req.body || {};
  const c = db.prepare('SELECT id, teacher_id FROM classes WHERE id = ?').get(req.params.id);
  if (!c || c.teacher_id !== req.session.userId) return res.status(404).json({ error: 'Class not found' });
  const prompt = db.prepare('SELECT id FROM prompts WHERE id = ?').get(promptId);
  if (!prompt) return res.status(400).json({ error: 'Prompt not found' });
  try {
    db.prepare('INSERT INTO assignments (class_id, prompt_id) VALUES (?, ?)').run(req.params.id, promptId);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Already assigned' });
    throw e;
  }
  res.status(201).json({ ok: true });
});

app.delete('/api/classes/:classId/assignments/:promptId', requireRole('teacher'), (req, res) => {
  const c = db.prepare('SELECT teacher_id FROM classes WHERE id = ?').get(req.params.classId);
  if (!c || c.teacher_id !== req.session.userId) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM assignments WHERE class_id = ? AND prompt_id = ?').run(req.params.classId, req.params.promptId);
  res.json({ ok: true });
});

// ─── Student: my assigned prompts ────────────────────────────────────────
app.get('/api/me/assigned-prompts', requireRole('student'), (req, res) => {
  const user = db.prepare('SELECT class_id FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.class_id) return res.json({ prompts: [] });
  const rows = db.prepare(`
    SELECT p.id, p.title, p.body, p.essay_type, a.assigned_at
    FROM assignments a
    JOIN prompts p ON a.prompt_id = p.id
    WHERE a.class_id = ?
    ORDER BY a.assigned_at
  `).all(user.class_id);
  res.json({ prompts: rows });
});

// ─── Teachers list (admin) ───────────────────────────────────────────────
app.get('/api/teachers', requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at,
           (SELECT COUNT(*) FROM classes WHERE teacher_id = u.id) as class_count
    FROM users u
    WHERE u.role = 'teacher'
    ORDER BY u.name
  `).all();
  res.json({ teachers: rows });
});

// ─── Ollama proxy (keep for grader) ──────────────────────────────────────
app.post('/api/chat', (req, res) => {
  const payload = req.body;
  const apiKey = payload && payload.apiKey;
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'Missing apiKey' });
  }
  const { model, stream, messages } = payload;
  const body = JSON.stringify({ model: model || 'gpt-oss:20b-cloud', stream: stream !== false, messages: messages || [] });
  const opts = {
    hostname: 'ollama.com',
    port: 443,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'Content-Length': Buffer.byteLength(body, 'utf8')
    }
  };
  const proxyReq = https.request(opts, (proxyRes) => {
    res.status(proxyRes.statusCode);
    Object.keys(proxyRes.headers).forEach(k => res.setHeader(k, proxyRes.headers[k]));
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (e) => {
    res.status(502).json({ error: 'Proxy failed: ' + e.message });
  });
  proxyReq.write(body);
  proxyReq.end();
});

// ─── Static files ───────────────────────────────────────────────────────
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/grader', (req, res) => res.sendFile(path.join(publicDir, 'grader.html')));
// Legacy standalone grader
app.get('/ap-gov-grader.html', (req, res) => res.sendFile(path.join(__dirname, 'ap-gov-grader.html')));

app.listen(PORT, () => {
  console.log('AP Gov Essay Grader at http://localhost:' + PORT);
  console.log('First-time admin: register with role Admin and setup code:', ADMIN_SETUP_CODE);
});
