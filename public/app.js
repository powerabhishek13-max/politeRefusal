/* ═══════════════════════════════════════════════════════════════════════
   TaskFlow – Frontend Application
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

// ── State ────────────────────────────────────────────────────────────────
const state = {
  members: [],
  tasks: [],
  currentUserId: null,   // "Acting as" selection
  activeTaskId: null,    // task open in the detail modal
  dragTaskId: null,      // drag-and-drop tracking
  selectedColor: '#4A90D9'
};

// ── Constants ─────────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'not_started', label: 'Not Started' },
  { key: 'wip',         label: 'WIP'          },
  { key: 'stuck',       label: 'Stuck & Need Support' },
  { key: 'delayed',     label: 'Delayed'      },
  { key: 'completed',   label: 'Completed'    },
  { key: 'parked',      label: 'Parked'       }
];

const STATUS_LABELS = {
  not_started: 'Not Started',
  wip:         'WIP',
  stuck:       'Stuck & Need Support',
  delayed:     'Delayed',
  completed:   'Completed',
  parked:      'Parked'
};

const AVATAR_COLORS = [
  '#4A90D9', '#E85D75', '#F5A623', '#7ED321',
  '#9013FE', '#50E3C2', '#D0021B', '#417505',
  '#4A4A4A', '#8B572A', '#BD10E0', '#0079BF'
];

// ── API helpers ───────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const GET    = (path)        => api('GET',    path);
const POST   = (path, body)  => api('POST',   path, body);
const PUT    = (path, body)  => api('PUT',    path, body);
const DELETE = (path)        => api('DELETE', path);

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  buildColorSwatches();
  attachStaticListeners();
  await loadAll();
  restoreCurrentUser();
});

async function loadAll() {
  const [members, tasks] = await Promise.all([
    GET('/api/members'),
    GET('/api/tasks')
  ]);
  state.members = members;
  state.tasks   = tasks;
  renderAll();
}

function renderAll() {
  renderMembersList();
  renderCurrentUserSelect();
  renderBoard();
}

// ── Color swatches ────────────────────────────────────────────────────────
function buildColorSwatches() {
  const container = document.getElementById('colorSwatches');
  AVATAR_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (color === state.selectedColor ? ' selected' : '');
    swatch.style.background = color;
    swatch.dataset.color = color;
    swatch.title = color;
    swatch.addEventListener('click', () => {
      state.selectedColor = color;
      container.querySelectorAll('.color-swatch').forEach(s =>
        s.classList.toggle('selected', s.dataset.color === color)
      );
    });
    container.appendChild(swatch);
  });
}

// ── Members ───────────────────────────────────────────────────────────────
function renderMembersList() {
  const list = document.getElementById('membersList');
  list.innerHTML = '';

  if (state.members.length === 0) {
    const li = document.createElement('li');
    li.style.cssText = 'padding:12px 16px; font-size:.8rem; color:var(--text-light); text-align:center';
    li.textContent = 'No team members yet';
    list.appendChild(li);
    return;
  }

  state.members.forEach(member => {
    const li = document.createElement('li');
    li.className = 'member-item';
    li.innerHTML = `
      <div class="member-avatar" style="background:${member.color}">${initials(member.name)}</div>
      <span class="member-name">${esc(member.name)}</span>
      <button class="btn-icon member-remove" data-id="${member.id}" title="Remove member">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
        </svg>
      </button>
    `;
    li.querySelector('.member-remove').addEventListener('click', e => {
      e.stopPropagation();
      removeMember(member.id, member.name);
    });
    list.appendChild(li);
  });
}

function renderCurrentUserSelect() {
  const sel = document.getElementById('currentUserSelect');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Select user —</option>';
  state.members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
  // Restore previous selection if still valid
  if (prev && state.members.find(m => String(m.id) === String(prev))) {
    sel.value = prev;
  } else if (state.currentUserId) {
    sel.value = state.currentUserId;
  }
}

async function addMember() {
  const nameInput = document.getElementById('newMemberName');
  const name = nameInput.value.trim();
  if (!name) { toast('Please enter a member name', 'error'); return; }

  try {
    const member = await POST('/api/members', { name, color: state.selectedColor });
    state.members.push(member);
    nameInput.value = '';
    hideAddMemberForm();
    renderMembersList();
    renderCurrentUserSelect();
    renderBoard(); // Refresh assignee options on any open tasks
    toast(`${member.name} added to the team`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function removeMember(id, name) {
  if (!confirm(`Remove ${name} from the team? Their tasks will become unassigned.`)) return;
  try {
    await DELETE(`/api/members/${id}`);
    state.members = state.members.filter(m => m.id !== id);
    // If this was the current user, clear it
    if (String(state.currentUserId) === String(id)) {
      state.currentUserId = null;
      localStorage.removeItem('taskflow_current_user');
    }
    // Reload tasks (assignee name fields need refresh)
    state.tasks = await GET('/api/tasks');
    renderAll();
    toast(`${name} removed`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function toggleAddMemberForm() {
  const form = document.getElementById('addMemberForm');
  const visible = form.style.display !== 'none';
  form.style.display = visible ? 'none' : 'block';
  if (!visible) document.getElementById('newMemberName').focus();
}

function hideAddMemberForm() {
  document.getElementById('addMemberForm').style.display = 'none';
}

// ── Board ─────────────────────────────────────────────────────────────────
function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  COLUMNS.forEach(col => {
    const colTasks = state.tasks.filter(t => t.effective_status === col.key);
    board.appendChild(buildColumn(col, colTasks));
  });
}

function buildColumn(col, tasks) {
  const div = document.createElement('div');
  div.className = 'column';
  div.dataset.status = col.key;

  div.innerHTML = `
    <div class="column-header">
      <div class="column-title-row">
        <div class="column-dot dot-${col.key}"></div>
        <span class="column-title">${esc(col.label)}</span>
        <span class="column-count">${tasks.length}</span>
      </div>
      ${col.key !== 'delayed'
        ? `<button class="column-add-btn" data-status="${col.key}" title="Add task">＋</button>`
        : '<span></span>'
      }
    </div>
    <div class="column-cards" data-status="${col.key}"></div>
  `;

  // Add-task button
  const addBtn = div.querySelector('.column-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => openAddTaskModal(col.key));

  // Cards
  const cardsContainer = div.querySelector('.column-cards');
  if (tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-column';
    empty.textContent = 'No tasks';
    cardsContainer.appendChild(empty);
  } else {
    tasks.forEach(task => cardsContainer.appendChild(buildCard(task)));
  }

  // Drag-and-drop on column
  cardsContainer.addEventListener('dragover', e => {
    e.preventDefault();
    cardsContainer.classList.add('drag-over');
  });
  cardsContainer.addEventListener('dragleave', e => {
    if (!cardsContainer.contains(e.relatedTarget)) {
      cardsContainer.classList.remove('drag-over');
    }
  });
  cardsContainer.addEventListener('drop', async e => {
    e.preventDefault();
    cardsContainer.classList.remove('drag-over');
    if (state.dragTaskId === null) return;
    const newStatus = col.key;
    if (newStatus === 'delayed') { toast('Cannot manually move tasks to Delayed', 'error'); return; }
    try {
      const updated = await PUT(`/api/tasks/${state.dragTaskId}`, { status: newStatus });
      const idx = state.tasks.findIndex(t => t.id === state.dragTaskId);
      if (idx !== -1) state.tasks[idx] = updated;
      renderBoard();
      toast(`Moved to ${STATUS_LABELS[newStatus]}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
    state.dragTaskId = null;
  });

  return div;
}

function buildCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.dataset.id = task.id;
  card.draggable = true;

  const deadlineHtml = task.deadline
    ? `<span class="card-deadline${isOverdue(task) ? ' overdue' : ''}">
         <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
           <path d="M5 .5a.5.5 0 0 1 .5.5v.5h5V1a.5.5 0 0 1 1 0v.5h1A1.5 1.5 0 0 1 14 3v10a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13V3A1.5 1.5 0 0 1 3.5 1.5h1V1a.5.5 0 0 1 .5-.5zm-1.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V4a.5.5 0 0 0-.5-.5h-9z"/>
         </svg>
         ${formatDate(task.deadline)}
       </span>`
    : '';

  const assigneeHtml = task.assignee_name
    ? `<div class="card-assignee">
         <div class="member-avatar xs" style="background:${task.assignee_color || '#ccc'}">${initials(task.assignee_name)}</div>
         <span class="card-assignee-name">${esc(task.assignee_name)}</span>
       </div>`
    : '<div class="card-assignee"><span class="card-assignee-name" style="color:var(--text-light)">Unassigned</span></div>';

  const descHtml = task.description
    ? `<div class="card-description">${esc(task.description)}</div>`
    : '';

  card.innerHTML = `
    <div class="card-top">
      <span class="card-status-badge status-${task.effective_status}">
        ${esc(STATUS_LABELS[task.effective_status] || task.effective_status)}
      </span>
      ${deadlineHtml}
    </div>
    <div class="card-title">${esc(task.title)}</div>
    ${descHtml}
    <div class="card-footer">
      ${assigneeHtml}
      <div class="card-comments">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2.678 11.894a1 1 0 0 1 .287.801 10.97 10.97 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8.06 8.06 0 0 0 8 14c3.996 0 7-2.807 7-6 0-3.192-3.004-6-7-6S1 4.808 1 8c0 1.468.617 2.83 1.678 3.894z"/>
        </svg>
        ${task.comment_count || 0}
      </div>
    </div>
  `;

  // Open modal on click
  card.addEventListener('click', () => openTaskModal(task.id));

  // Drag events
  card.addEventListener('dragstart', e => {
    state.dragTaskId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    state.dragTaskId = null;
    document.querySelectorAll('.column-cards').forEach(c => c.classList.remove('drag-over'));
  });

  return card;
}

// ── Task Detail Modal ─────────────────────────────────────────────────────
async function openTaskModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  state.activeTaskId = taskId;

  // Populate fields
  document.getElementById('modalTitle').value       = task.title;
  document.getElementById('modalDescription').value = task.description || '';
  document.getElementById('modalDeadline').value    = task.deadline || '';
  document.getElementById('modalStatusBadge').textContent   = STATUS_LABELS[task.effective_status] || '';
  document.getElementById('modalStatusBadge').className     = `modal-status-badge card-status-badge status-${task.effective_status}`;

  // Status select — use effective status for display, but stored status is what gets saved
  populateAssigneeSelect('modalAssignee', task.assignee_id);
  const statusSel = document.getElementById('modalStatus');
  statusSel.value = task.effective_status;

  // Meta info
  const meta = document.getElementById('modalMeta');
  const lines = [];
  if (task.created_by_name) lines.push(`Created by ${task.created_by_name}`);
  lines.push(`Created ${formatDateTime(task.created_at)}`);
  if (task.updated_at !== task.created_at) lines.push(`Updated ${formatDateTime(task.updated_at)}`);
  meta.innerHTML = lines.map(l => `<span>${esc(l)}</span>`).join('');

  // Load comments
  await loadComments(taskId);

  // Update comment author avatar
  updateCommentAuthorAvatar();

  document.getElementById('modalOverlay').style.display = 'flex';
  document.getElementById('modalTitle').focus();
}

function closeTaskModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  state.activeTaskId = null;
}

async function saveTask() {
  const id = state.activeTaskId;
  if (!id) return;

  const title = document.getElementById('modalTitle').value.trim();
  if (!title) { toast('Title is required', 'error'); return; }

  const payload = {
    title,
    description: document.getElementById('modalDescription').value.trim(),
    assignee_id: document.getElementById('modalAssignee').value || null,
    status:      document.getElementById('modalStatus').value,
    deadline:    document.getElementById('modalDeadline').value || null
  };

  try {
    const updated = await PUT(`/api/tasks/${id}`, payload);
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx !== -1) state.tasks[idx] = updated;
    closeTaskModal();
    renderBoard();
    toast('Task updated', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteTask() {
  const id = state.activeTaskId;
  if (!id) return;
  const task = state.tasks.find(t => t.id === id);
  if (!confirm(`Delete "${task?.title}"? This cannot be undone.`)) return;

  try {
    await DELETE(`/api/tasks/${id}`);
    state.tasks = state.tasks.filter(t => t.id !== id);
    closeTaskModal();
    renderBoard();
    toast('Task deleted', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Add Task Modal ────────────────────────────────────────────────────────
function openAddTaskModal(preselectedStatus) {
  document.getElementById('addTaskTitle').value       = '';
  document.getElementById('addTaskDescription').value = '';
  document.getElementById('addTaskDeadline').value    = '';
  populateAssigneeSelect('addTaskAssignee', null);
  const statusSel = document.getElementById('addTaskStatus');
  statusSel.value = preselectedStatus || 'not_started';

  document.getElementById('addTaskOverlay').style.display = 'flex';
  document.getElementById('addTaskTitle').focus();
}

function closeAddTaskModal() {
  document.getElementById('addTaskOverlay').style.display = 'none';
}

async function confirmAddTask() {
  const title = document.getElementById('addTaskTitle').value.trim();
  if (!title) { toast('Please enter a task title', 'error'); return; }

  const payload = {
    title,
    description:    document.getElementById('addTaskDescription').value.trim(),
    assignee_id:    document.getElementById('addTaskAssignee').value  || null,
    created_by_id:  state.currentUserId || null,
    deadline:       document.getElementById('addTaskDeadline').value  || null,
    status:         document.getElementById('addTaskStatus').value
  };

  // If deadline is in the past and status is not completed/parked, it'll be "delayed"
  try {
    const task = await POST('/api/tasks', payload);
    // Refetch to get computed effective_status
    state.tasks = await GET('/api/tasks');
    closeAddTaskModal();
    renderBoard();
    toast('Task created', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Comments ──────────────────────────────────────────────────────────────
async function loadComments(taskId) {
  const list = document.getElementById('commentsList');
  list.innerHTML = '<span style="color:var(--text-light);font-size:.8rem">Loading…</span>';

  try {
    const comments = await GET(`/api/tasks/${taskId}/comments`);
    renderComments(comments);
  } catch (err) {
    list.innerHTML = '<span style="color:var(--danger)">Failed to load comments</span>';
  }
}

function renderComments(comments) {
  const list = document.getElementById('commentsList');
  list.innerHTML = '';

  if (comments.length === 0) {
    list.innerHTML = '<div class="empty-comments">No comments yet. Be the first!</div>';
    return;
  }

  comments.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.dataset.id = c.id;

    const avatarStyle = c.author_color
      ? `background:${c.author_color}`
      : 'background:var(--border-dark)';

    item.innerHTML = `
      <div class="member-avatar xs" style="${avatarStyle}">${c.author_name ? initials(c.author_name) : '?'}</div>
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author">${esc(c.author_name || 'Anonymous')}</span>
          <span class="comment-time">${formatDateTime(c.created_at)}</span>
          <button class="comment-delete" data-id="${c.id}" title="Delete comment">✕</button>
        </div>
        <div class="comment-content">${esc(c.content)}</div>
      </div>
    `;

    item.querySelector('.comment-delete').addEventListener('click', () => deleteComment(c.id));
    list.appendChild(item);
  });

  // Scroll to bottom
  list.scrollTop = list.scrollHeight;
}

async function submitComment() {
  const input = document.getElementById('commentInput');
  const content = input.value.trim();
  if (!content) { toast('Please write a comment', 'error'); return; }
  if (!state.currentUserId) { toast('Select a user ("Acting as") to comment', 'error'); return; }

  try {
    const comment = await POST(`/api/tasks/${state.activeTaskId}/comments`, {
      author_id: state.currentUserId,
      content
    });
    input.value = '';

    // Update comment count in state
    const task = state.tasks.find(t => t.id === state.activeTaskId);
    if (task) task.comment_count = (task.comment_count || 0) + 1;

    // Re-render comments
    await loadComments(state.activeTaskId);

    // Refresh card on board (comment count)
    renderBoard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteComment(commentId) {
  try {
    await DELETE(`/api/comments/${commentId}`);
    // Update comment count in state
    const task = state.tasks.find(t => t.id === state.activeTaskId);
    if (task) task.comment_count = Math.max(0, (task.comment_count || 1) - 1);
    await loadComments(state.activeTaskId);
    renderBoard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function populateAssigneeSelect(selectId, currentAssigneeId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">Unassigned</option>';
  state.members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    if (String(m.id) === String(currentAssigneeId)) opt.selected = true;
    sel.appendChild(opt);
  });
}

function updateCommentAuthorAvatar() {
  const avatar = document.getElementById('commentAuthorAvatar');
  const user = state.members.find(m => String(m.id) === String(state.currentUserId));
  if (user) {
    avatar.style.background = user.color;
    avatar.textContent = initials(user.name);
  } else {
    avatar.style.background = 'var(--border-dark)';
    avatar.textContent = '?';
  }
}

function restoreCurrentUser() {
  const saved = localStorage.getItem('taskflow_current_user');
  if (saved && state.members.find(m => String(m.id) === saved)) {
    state.currentUserId = saved;
    document.getElementById('currentUserSelect').value = saved;
  }
}

function isOverdue(task) {
  if (!task.deadline) return false;
  const today = new Date().toISOString().split('T')[0];
  return task.deadline < today && task.status !== 'completed' && task.status !== 'parked';
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dtStr) {
  if (!dtStr) return '';
  try {
    const d = new Date(dtStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dtStr; }
}

function toast(msg, type = '') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .25s ease forwards';
    setTimeout(() => el.remove(), 250);
  }, 3000);
}

// ── Static event listeners ────────────────────────────────────────────────
function attachStaticListeners() {
  // Sidebar toggle
  document.getElementById('toggleAddMember').addEventListener('click', toggleAddMemberForm);
  document.getElementById('addMemberBtn').addEventListener('click', addMember);
  document.getElementById('cancelAddMember').addEventListener('click', hideAddMemberForm);

  document.getElementById('newMemberName').addEventListener('keydown', e => {
    if (e.key === 'Enter') addMember();
    if (e.key === 'Escape') hideAddMemberForm();
  });

  // "Acting as" selector
  document.getElementById('currentUserSelect').addEventListener('change', e => {
    state.currentUserId = e.target.value || null;
    if (state.currentUserId) {
      localStorage.setItem('taskflow_current_user', state.currentUserId);
    } else {
      localStorage.removeItem('taskflow_current_user');
    }
    updateCommentAuthorAvatar();
  });

  // Task detail modal
  document.getElementById('modalClose').addEventListener('click', closeTaskModal);
  document.getElementById('cancelModal').addEventListener('click', closeTaskModal);
  document.getElementById('saveTaskBtn').addEventListener('click', saveTask);
  document.getElementById('deleteTaskBtn').addEventListener('click', deleteTask);
  document.getElementById('submitComment').addEventListener('click', submitComment);
  document.getElementById('commentInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment();
  });

  // Status badge updates in real-time
  document.getElementById('modalStatus').addEventListener('change', e => {
    const val = e.target.value;
    document.getElementById('modalStatusBadge').textContent = STATUS_LABELS[val] || val;
    document.getElementById('modalStatusBadge').className = `modal-status-badge card-status-badge status-${val}`;
  });

  // Add task modal
  document.getElementById('addTaskClose').addEventListener('click', closeAddTaskModal);
  document.getElementById('cancelAddTask').addEventListener('click', closeAddTaskModal);
  document.getElementById('confirmAddTask').addEventListener('click', confirmAddTask);
  document.getElementById('addTaskTitle').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmAddTask();
    if (e.key === 'Escape') closeAddTaskModal();
  });

  // Close modals on overlay click
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeTaskModal();
  });
  document.getElementById('addTaskOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('addTaskOverlay')) closeAddTaskModal();
  });

  // Escape key closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('modalOverlay').style.display !== 'none') closeTaskModal();
      if (document.getElementById('addTaskOverlay').style.display !== 'none') closeAddTaskModal();
    }
  });
}
