const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'taskflow.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#4A90D9',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      assignee_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      created_by_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'not_started'
        CHECK(status IN ('not_started','wip','stuck','delayed','completed','parked')),
      deadline TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// ── Members ────────────────────────────────────────────────────────────────

function getAllMembers() {
  return getDb().prepare('SELECT * FROM members ORDER BY name ASC').all();
}

function getMemberById(id) {
  return getDb().prepare('SELECT * FROM members WHERE id = ?').get(id);
}

function createMember({ name, color }) {
  const stmt = getDb().prepare('INSERT INTO members (name, color) VALUES (?, ?)');
  const result = stmt.run(name, color || '#4A90D9');
  return getMemberById(result.lastInsertRowid);
}

function deleteMember(id) {
  return getDb().prepare('DELETE FROM members WHERE id = ?').run(id);
}

// ── Tasks ──────────────────────────────────────────────────────────────────

function computeEffectiveStatus(task) {
  if (task.status === 'completed' || task.status === 'parked') {
    return task.status;
  }
  if (task.deadline) {
    const today = new Date().toISOString().split('T')[0];
    if (task.deadline < today) {
      return 'delayed';
    }
  }
  return task.status;
}

function getAllTasks() {
  const rows = getDb().prepare(`
    SELECT
      t.*,
      m.name  AS assignee_name,
      m.color AS assignee_color,
      c.name  AS created_by_name,
      (SELECT COUNT(*) FROM comments WHERE task_id = t.id) AS comment_count
    FROM tasks t
    LEFT JOIN members m ON t.assignee_id  = m.id
    LEFT JOIN members c ON t.created_by_id = c.id
    ORDER BY t.created_at DESC
  `).all();

  return rows.map(row => ({
    ...row,
    effective_status: computeEffectiveStatus(row)
  }));
}

function getTaskById(id) {
  const row = getDb().prepare(`
    SELECT
      t.*,
      m.name  AS assignee_name,
      m.color AS assignee_color,
      c.name  AS created_by_name,
      (SELECT COUNT(*) FROM comments WHERE task_id = t.id) AS comment_count
    FROM tasks t
    LEFT JOIN members m ON t.assignee_id  = m.id
    LEFT JOIN members c ON t.created_by_id = c.id
    WHERE t.id = ?
  `).get(id);

  if (!row) return null;
  return { ...row, effective_status: computeEffectiveStatus(row) };
}

function createTask({ title, description, assignee_id, created_by_id, deadline }) {
  const stmt = getDb().prepare(`
    INSERT INTO tasks (title, description, assignee_id, created_by_id, deadline)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    title,
    description || '',
    assignee_id || null,
    created_by_id || null,
    deadline || null
  );
  return getTaskById(result.lastInsertRowid);
}

function updateTask(id, fields) {
  const allowed = ['title', 'description', 'assignee_id', 'status', 'deadline'];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      updates.push(`${key} = ?`);
      values.push(fields[key] === undefined ? null : fields[key]);
    }
  }

  if (updates.length === 0) return getTaskById(id);

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  getDb().prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getTaskById(id);
}

function deleteTask(id) {
  return getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

// ── Comments ───────────────────────────────────────────────────────────────

function getCommentsByTaskId(taskId) {
  return getDb().prepare(`
    SELECT
      c.*,
      m.name  AS author_name,
      m.color AS author_color
    FROM comments c
    LEFT JOIN members m ON c.author_id = m.id
    WHERE c.task_id = ?
    ORDER BY c.created_at ASC
  `).all(taskId);
}

function createComment({ task_id, author_id, content }) {
  const stmt = getDb().prepare(
    'INSERT INTO comments (task_id, author_id, content) VALUES (?, ?, ?)'
  );
  const result = stmt.run(task_id, author_id || null, content);
  return getDb().prepare(`
    SELECT c.*, m.name AS author_name, m.color AS author_color
    FROM comments c
    LEFT JOIN members m ON c.author_id = m.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
}

function deleteComment(id) {
  return getDb().prepare('DELETE FROM comments WHERE id = ?').run(id);
}

module.exports = {
  getAllMembers,
  getMemberById,
  createMember,
  deleteMember,
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getCommentsByTaskId,
  createComment,
  deleteComment
};
