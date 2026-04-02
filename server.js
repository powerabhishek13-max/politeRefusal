const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Members ────────────────────────────────────────────────────────────────

app.get('/api/members', (req, res) => {
  try {
    res.json(db.getAllMembers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/members', (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const member = db.createMember({ name: name.trim(), color });
    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/members/:id', (req, res) => {
  try {
    const result = db.deleteMember(Number(req.params.id));
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tasks ──────────────────────────────────────────────────────────────────

app.get('/api/tasks', (req, res) => {
  try {
    res.json(db.getAllTasks());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = db.getTaskById(Number(req.params.id));
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', (req, res) => {
  try {
    const { title, description, assignee_id, created_by_id, deadline } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const task = db.createTask({ title: title.trim(), description, assignee_id, created_by_id, deadline });
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', (req, res) => {
  try {
    const task = db.getTaskById(Number(req.params.id));
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const updated = db.updateTask(Number(req.params.id), req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  try {
    const result = db.deleteTask(Number(req.params.id));
    if (result.changes === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Comments ───────────────────────────────────────────────────────────────

app.get('/api/tasks/:id/comments', (req, res) => {
  try {
    const task = db.getTaskById(Number(req.params.id));
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(db.getCommentsByTaskId(Number(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/comments', (req, res) => {
  try {
    const { author_id, content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    const task = db.getTaskById(Number(req.params.id));
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const comment = db.createComment({
      task_id: Number(req.params.id),
      author_id: author_id || null,
      content: content.trim()
    });
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/comments/:id', (req, res) => {
  try {
    const result = db.deleteComment(Number(req.params.id));
    if (result.changes === 0) return res.status(404).json({ error: 'Comment not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Serve SPA for all other routes ─────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`TaskFlow running at http://localhost:${PORT}`);
});
