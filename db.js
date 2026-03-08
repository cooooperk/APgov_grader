const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'data', 'app.db');

function ensureDir(dir) {
  const fs = require('fs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(path.dirname(dbPath));

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER,
    name TEXT NOT NULL,
    class_code TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student','teacher','admin')),
    class_id INTEGER REFERENCES classes(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS teacher_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    created_by INTEGER REFERENCES users(id),
    used_at TEXT,
    used_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    essay_type TEXT NOT NULL CHECK(essay_type IN ('frq','arg','dbq')),
    rubric_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assignments (
    class_id INTEGER NOT NULL REFERENCES classes(id),
    prompt_id INTEGER NOT NULL REFERENCES prompts(id),
    assigned_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (class_id, prompt_id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_class ON users(class_id);
  CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
  CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
`);

// Re-add FK to users after classes exist (for bootstrap)
try {
  db.exec(`PRAGMA foreign_keys = ON;`);
} catch (_) {}

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}
function checkPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const defaultRubric = JSON.stringify({
  criteria: [
    { id: 'thesis', name: 'Thesis / Claim', maxPoints: 1, description: 'Responds with a defensible thesis that establishes a line of reasoning.' },
    { id: 'context', name: 'Contextualization', maxPoints: 1, description: 'Describes broader context and connects it to the argument.' },
    { id: 'evidence', name: 'Evidence', maxPoints: 2, description: 'Uses specific evidence; second point for supporting reasoning.' },
    { id: 'analysis', name: 'Analysis & Reasoning', maxPoints: 2, description: 'Uses historical reasoning; complexity point for sophisticated understanding.' }
  ],
  totalMax: 6
});

const defaultPrompts = [
  { title: 'Federalism & State Power', essay_type: 'frq', body: 'Explain how the federal system divides power between the national and state governments. In your response, describe ONE constitutional provision that supports federalism and explain how the relationship between federal and state authority has changed over time.' },
  { title: 'Civil Liberties vs. National Security', essay_type: 'frq', body: 'Explain how the tension between civil liberties and national security has shaped government policy. Describe ONE Supreme Court case and evaluate how well the government has balanced these competing interests.' },
  { title: 'Congressional Gridlock', essay_type: 'frq', body: 'Explain why congressional gridlock occurs and describe TWO structural features of Congress that contribute to legislative inaction.' },
  { title: 'Federalism and Individual Rights', essay_type: 'arg', body: 'Develop an argument that evaluates whether federalism today protects or undermines individual rights. Use at least ONE piece of specific evidence from your knowledge of U.S. Government and Politics.' },
  { title: 'Supreme Court and Civil Liberties', essay_type: 'arg', body: 'Develop an argument that evaluates the extent to which the Supreme Court has effectively protected civil liberties against government overreach. Use specific evidence to support your claim.' },
  { title: 'Congress and Representation', essay_type: 'arg', body: 'Develop an argument that evaluates whether Congress adequately represents the American public in the modern era.' },
  { title: 'Federal-State Relations Since New Deal', essay_type: 'dbq', body: 'Using the documents provided and your knowledge of U.S. Government, explain how federal-state relations have evolved since the New Deal era and evaluate the significance of this change for individual rights.' },
  { title: 'Civil Liberties in Crisis', essay_type: 'dbq', body: 'Using the documents provided and your knowledge of course content, assess the degree to which civil liberties have been restricted during periods of national crisis.' },
  { title: 'Partisan Polarization and Congress', essay_type: 'dbq', body: 'Using the documents provided, evaluate the extent to which partisan polarization has contributed to congressional dysfunction.' }
];

function seedPrompts() {
  const count = db.prepare('SELECT COUNT(*) as c FROM prompts').get();
  if (count.c > 0) return;
  const ins = db.prepare('INSERT INTO prompts (title, body, essay_type, rubric_json) VALUES (?, ?, ?, ?)');
  for (const p of defaultPrompts) {
    ins.run(p.title, p.body, p.essay_type, defaultRubric);
  }
}
seedPrompts();

module.exports = {
  db,
  hashPassword,
  checkPassword,
  generateCode,
  defaultRubric
};
