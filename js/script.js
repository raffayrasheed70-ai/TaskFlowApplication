/* =========================================================
   TaskFlow — Smart Task Management Dashboard
   Vanilla JavaScript application logic
   ========================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     1. CONSTANTS & APPLICATION STATE
  --------------------------------------------------------- */
  const KEYS = {
    tasks: 'taskflow.tasks',
    theme: 'taskflow.theme',
    seeded: 'taskflow.seeded' // set after the first visit so sample data is only added once
  };

  const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
  const STATUS_LABEL = { 'pending': 'Pending', 'in-progress': 'In Progress', 'completed': 'Completed' };
  const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
  const CATEGORY_META = {
    work:     { label: 'Work',     icon: 'bi-briefcase' },
    personal: { label: 'Personal', icon: 'bi-person' },
    study:    { label: 'Study',    icon: 'bi-book' },
    meeting:  { label: 'Meeting',  icon: 'bi-camera-video' },
    other:    { label: 'Other',    icon: 'bi-three-dots' }
  };
  const SORT_LABEL = {
    newest: 'Newest First', oldest: 'Oldest First', due: 'Due Date', priority: 'Priority', alpha: 'Alphabetical'
  };
  const VIEW_META = {
    dashboard: { title: 'Recent Tasks',    subtitle: 'Everything on your plate' },
    all:       { title: 'All Tasks',       subtitle: 'Every task in your workspace' },
    today:     { title: "Today's Tasks",   subtitle: 'Tasks due today' },
    upcoming:  { title: 'Upcoming Tasks',  subtitle: 'Open tasks due after today' },
    completed: { title: 'Completed Tasks', subtitle: 'Nice work — these are done' },
    important: { title: 'Important Tasks', subtitle: 'Tasks you starred' }
  };
  const TOAST_ICON = {
    success: 'bi-check-lg', danger: 'bi-trash3', info: 'bi-info-lg', warning: 'bi-exclamation-lg'
  };

  const state = {
    tasks: [],
    view: 'dashboard',  // dashboard | all | today | upcoming | completed | important
    status: 'all',      // all | pending | in-progress | completed
    priority: 'all',    // all | high | medium | low
    search: '',
    sort: 'newest',
    pendingDeleteId: null
  };

  /* ---------------------------------------------------------
     2. SMALL HELPERS
  --------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // LocalStorage wrapper that never throws (private mode / blocked storage)
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } }
  };

  const pad = (n) => String(n).padStart(2, '0');
  const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => toISODate(new Date());
  const daysFromToday = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return toISODate(d); };
  const parseISODate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

  // "18:00" -> "6:00 PM"
  function formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  // Prevent HTML injection from user-entered text
  function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Human friendly due-date info for a task
  function getDueInfo(task) {
    if (!task.dueDate) return { label: 'No due date', cls: '' };
    const diff = Math.round((parseISODate(task.dueDate) - parseISODate(todayISO())) / 86400000);
    let label;
    if (diff === 0) label = 'Today';
    else if (diff === 1) label = 'Tomorrow';
    else if (diff === -1) label = 'Yesterday';
    else {
      const sameYear = parseISODate(task.dueDate).getFullYear() === new Date().getFullYear();
      label = parseISODate(task.dueDate).toLocaleDateString('en-US',
        sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
    }
    if (task.dueTime) label += ` · ${formatTime(task.dueTime)}`;

    let cls = '';
    if (task.status !== 'completed') cls = diff < 0 ? 'overdue' : diff === 0 ? 'today' : '';
    return { label, cls };
  }

  /* ---------------------------------------------------------
     3. DOM REFERENCES
  --------------------------------------------------------- */
  const el = {};
  function cacheDOM() {
    const ids = [
      'sidebar', 'searchInput', 'searchClear', 'searchKbd', 'themeToggle', 'themeIcon', 'greeting', 'heroDate',
      'addTaskBtn', 'addTaskBtnSecondary', 'statTotal', 'statInProgress', 'statCompleted', 'statImportant',
      'statImportantSub', 'progressPercent', 'progressBar', 'progressTrack', 'progressText', 'progressMessage',
      'legendPending', 'legendProgress', 'legendDone', 'listTitle', 'listSubtitle', 'statusFilters',
      'priorityFilters', 'sortMenu', 'sortLabel', 'resultCount', 'clearFiltersBtn', 'taskList', 'emptyState',
      'emptyTitle', 'emptyText', 'emptyCreateBtn', 'emptyClearBtn', 'taskModal', 'taskForm', 'taskId',
      'taskTitle', 'taskDescription', 'taskDueDate', 'taskDueTime', 'taskCategory', 'taskStatus',
      'taskImportant', 'taskModalLabel', 'taskModalSub', 'taskModalIcon', 'taskSubmitBtn', 'deleteModal',
      'deleteTaskName', 'confirmDeleteBtn', 'settingsModal', 'settingsThemeSwitch', 'resetDataBtn',
      'clearAllBtn', 'toastContainer', 'notifBadge', 'notifList', 'notifSummary', 'taskPanel',
      'countAll', 'countToday', 'countUpcoming', 'countCompleted', 'countImportant', 'taskTitleError'
    ];
    ids.forEach((id) => { el[id] = document.getElementById(id); });
  }

  // Bootstrap component instances (created lazily)
  const modals = {};
  const getModal = (name) => modals[name] || (modals[name] = bootstrap.Modal.getOrCreateInstance(el[name]));

  /* ---------------------------------------------------------
     4. LOCAL STORAGE — saveTasks() / loadTasks()
  --------------------------------------------------------- */
  function saveTasks() {
    storage.set(KEYS.tasks, JSON.stringify(state.tasks));
  }

  function loadTasks() {
    const raw = storage.get(KEYS.tasks);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { /* corrupted data – fall through */ }
    }
    // First visit only: add sample tasks so the dashboard doesn't look empty
    if (!storage.get(KEYS.seeded)) {
      const samples = getSampleTasks();
      state.tasks = samples;
      saveTasks();
      storage.set(KEYS.seeded, '1');
      return samples;
    }
    return [];
  }

  // Sample tasks use dates relative to today so Today / Upcoming always look realistic
  function getSampleTasks() {
    const today = todayISO();
    return [
      { id: 1, title: 'Complete portfolio website', description: 'Finish the responsive portfolio design and deploy it to GitHub Pages.',
        dueDate: daysFromToday(3), dueTime: '18:00', priority: 'high', category: 'work', status: 'in-progress', important: true, createdAt: daysFromToday(-5) },
      { id: 2, title: 'Review internship task', description: 'Go through the mentor feedback and list the improvements to make.',
        dueDate: today, dueTime: '16:00', priority: 'high', category: 'work', status: 'pending', important: true, createdAt: daysFromToday(-4) },
      { id: 3, title: 'Learn JavaScript DOM manipulation', description: 'Practice selecting, creating and updating elements with events.',
        dueDate: today, dueTime: '20:30', priority: 'medium', category: 'study', status: 'in-progress', important: false, createdAt: daysFromToday(-3) },
      { id: 4, title: 'Update LinkedIn profile', description: 'Add new projects, refresh the headline and request two recommendations.',
        dueDate: daysFromToday(5), dueTime: '', priority: 'low', category: 'personal', status: 'pending', important: false, createdAt: daysFromToday(-2) },
      { id: 5, title: 'Finish project documentation', description: 'Write the README with setup steps, features and screenshots.',
        dueDate: daysFromToday(-1), dueTime: '12:00', priority: 'medium', category: 'work', status: 'completed', important: false, createdAt: daysFromToday(-6) },
      { id: 6, title: 'Practice responsive design', description: 'Rebuild a landing page using Bootstrap grid and custom media queries.',
        dueDate: daysFromToday(2), dueTime: '10:00', priority: 'medium', category: 'study', status: 'pending', important: true, createdAt: daysFromToday(-1) }
    ];
  }

  /* ---------------------------------------------------------
     5. CRUD — createTask / updateTask / deleteTask / toggles
  --------------------------------------------------------- */
  const nextId = () => state.tasks.reduce((max, t) => Math.max(max, Number(t.id) || 0), 0) + 1;
  const findTask = (id) => state.tasks.find((t) => String(t.id) === String(id));

  function createTask(data) {
    const task = {
      id: nextId(),
      title: data.title.trim(),
      description: (data.description || '').trim(),
      dueDate: data.dueDate || '',
      dueTime: data.dueTime || '',
      priority: data.priority || 'medium',
      category: data.category || 'other',
      status: data.status || 'pending',
      important: Boolean(data.important),
      createdAt: todayISO()
    };
    state.tasks.push(task);
    saveTasks();
    refresh();
    showToast('Task created successfully!', 'success');
    return task;
  }

  function updateTask(id, changes) {
    const task = findTask(id);
    if (!task) return;
    Object.assign(task, changes, { title: (changes.title ?? task.title).trim() });
    saveTasks();
    refresh();
    showToast('Task updated successfully!', 'success');
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter((t) => String(t.id) !== String(id));
    saveTasks();
    refresh();
    showToast('Task deleted successfully!', 'danger');
  }

  // Checkbox: pending / in-progress -> completed, completed -> pending
  function toggleTaskStatus(id) {
    const task = findTask(id);
    if (!task) return;
    const completing = task.status !== 'completed';
    task.status = completing ? 'completed' : 'pending';
    saveTasks();
    refresh();
    showToast(completing ? 'Task marked as completed!' : 'Task moved back to pending', completing ? 'success' : 'info');
  }

  function toggleImportant(id) {
    const task = findTask(id);
    if (!task) return;
    task.important = !task.important;
    saveTasks();
    refresh();
    // Little pop animation on the star that was just toggled
    const star = $(`.task-card[data-id="${id}"] .star`);
    if (star) star.classList.add('pop');
    showToast(task.important ? 'Added to important tasks' : 'Removed from important tasks', task.important ? 'warning' : 'info');
  }

  /* ---------------------------------------------------------
     6. FILTER / SEARCH / SORT PIPELINE
  --------------------------------------------------------- */
  // View (sidebar) + status chips + priority chips — all combined (AND)
  function filterTasks(tasks) {
    const today = todayISO();
    return tasks.filter((t) => {
      switch (state.view) {
        case 'today':     if (t.dueDate !== today) return false; break;
        case 'upcoming':  if (!t.dueDate || t.dueDate <= today || t.status === 'completed') return false; break;
        case 'completed': if (t.status !== 'completed') return false; break;
        case 'important': if (!t.important) return false; break;
        default: break; // dashboard / all
      }
      if (state.status !== 'all' && t.status !== state.status) return false;
      if (state.priority !== 'all' && t.priority !== state.priority) return false;
      return true;
    });
  }

  // Matches title, description, category, priority and status (raw + readable labels)
  function searchTasks(tasks, query = state.search) {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => {
      const haystack = [
        t.title, t.description,
        t.category, (CATEGORY_META[t.category] || {}).label,
        t.priority, PRIORITY_LABEL[t.priority],
        t.status, STATUS_LABEL[t.status], t.status.replace('-', ' ')
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  function sortTasks(tasks, key = state.sort) {
    const list = [...tasks];
    const byNewest = (a, b) => (b.createdAt.localeCompare(a.createdAt)) || (b.id - a.id);
    switch (key) {
      case 'oldest':
        return list.sort((a, b) => -byNewest(a, b));
      case 'due':
        // Earliest due date first; tasks without a date go last
        return list.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return byNewest(a, b);
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return (a.dueDate + (a.dueTime || '23:59')).localeCompare(b.dueDate + (b.dueTime || '23:59'));
        });
      case 'priority':
        return list.sort((a, b) => (PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]) || byNewest(a, b));
      case 'alpha':
        return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
      case 'newest':
      default:
        return list.sort(byNewest);
    }
  }

  const getVisibleTasks = () => sortTasks(searchTasks(filterTasks(state.tasks)));
  const hasActiveFilters = () => state.status !== 'all' || state.priority !== 'all' || state.search.trim() !== '';

  /* ---------------------------------------------------------
     7. RENDERING
  --------------------------------------------------------- */
  function taskCardHTML(task, index) {
    const cat = CATEGORY_META[task.category] || CATEGORY_META.other;
    const due = getDueInfo(task);
    const done = task.status === 'completed';
    const dueIcon = due.cls === 'overdue' ? 'bi-exclamation-circle' : 'bi-calendar-event';

    return `
      <article class="task-card priority-${task.priority} ${done ? 'is-completed' : ''}" data-id="${task.id}" style="--i:${Math.min(index, 12)}">
        <label class="task-check" title="${done ? 'Mark as pending' : 'Mark as completed'}">
          <input type="checkbox" data-action="toggle" ${done ? 'checked' : ''} aria-label="Mark &quot;${escapeHTML(task.title)}&quot; as completed">
          <span class="check-box"><i class="bi bi-check-lg"></i></span>
        </label>
        <div class="task-body">
          <div class="task-title-row">
            <h3 class="task-title">${escapeHTML(task.title)}</h3>
            ${task.important ? '<i class="bi bi-star-fill task-flag" title="Important"></i>' : ''}
          </div>
          <p class="task-desc">${escapeHTML(task.description)}</p>
          <div class="task-meta">
            <span class="tf-badge badge-cat"><i class="bi ${cat.icon}"></i>${cat.label}</span>
            <span class="tf-badge badge-prio-${task.priority}"><i class="bi bi-flag-fill"></i>${PRIORITY_LABEL[task.priority]}</span>
            <span class="tf-badge badge-status badge-status-${task.status}">${STATUS_LABEL[task.status]}</span>
            <span class="tf-badge badge-due ${due.cls}"><i class="bi ${dueIcon}"></i>${due.label}${due.cls === 'overdue' ? ' · Overdue' : ''}</span>
          </div>
        </div>
        <div class="task-actions">
          <button type="button" class="action-btn star ${task.important ? 'on' : ''}" data-action="important" title="${task.important ? 'Remove from important' : 'Mark as important'}" aria-label="Toggle important" aria-pressed="${task.important}">
            <i class="bi ${task.important ? 'bi-star-fill' : 'bi-star'}"></i>
          </button>
          <button type="button" class="action-btn edit" data-action="edit" title="Edit task" aria-label="Edit task"><i class="bi bi-pencil-square"></i></button>
          <button type="button" class="action-btn delete" data-action="delete" title="Delete task" aria-label="Delete task"><i class="bi bi-trash3"></i></button>
        </div>
      </article>`;
  }

  function renderTasks(animate = false) {
    const visible = getVisibleTasks();
    const meta = VIEW_META[state.view];

    el.listTitle.textContent = meta.title;
    el.listSubtitle.textContent = meta.subtitle;
    el.resultCount.textContent = `Showing ${visible.length} of ${filterTasks(state.tasks).length} task${visible.length === 1 ? '' : 's'}`;
    el.clearFiltersBtn.classList.toggle('d-none', !hasActiveFilters());
    el.taskList.classList.toggle('animate-in', animate);

    if (!visible.length) {
      el.taskList.innerHTML = '';
      renderEmptyState();
      return;
    }
    el.emptyState.classList.add('d-none');
    el.taskList.innerHTML = visible.map(taskCardHTML).join('');
  }

  function renderEmptyState() {
    const noTasksAtAll = state.tasks.length === 0;
    el.emptyTitle.textContent = 'No tasks found';
    el.emptyText.textContent = noTasksAtAll
      ? 'Create your first task and start getting things done.'
      : 'Nothing matches your current view, search or filters. Try changing them or create a new task.';
    el.emptyClearBtn.classList.toggle('d-none', noTasksAtAll || !hasActiveFilters());
    el.emptyState.classList.remove('d-none');
    // restart the entrance animation
    el.emptyState.style.animation = 'none'; void el.emptyState.offsetWidth; el.emptyState.style.animation = '';
  }

  // Counts up/down smoothly to the new number
  function animateNumber(node, to) {
    const from = Number(node.dataset.value ?? 0);
    node.dataset.value = to;
    if (from === to) { node.textContent = to; return; }
    const duration = 450, start = performance.now();
    node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump');
    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = Math.round(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(frame); else node.textContent = to;
    }
    requestAnimationFrame(frame);
  }

  function updateStatistics() {
    const today = todayISO();
    const tasks = state.tasks;
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
    const pending = tasks.filter((t) => t.status === 'pending').length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const important = tasks.filter((t) => t.important).length;
    const highPriority = tasks.filter((t) => t.priority === 'high' && t.status !== 'completed').length;
    const percent = total ? Math.round((completed / total) * 100) : 0;

    // Stat cards
    animateNumber(el.statTotal, total);
    animateNumber(el.statInProgress, inProgress);
    animateNumber(el.statCompleted, completed);
    animateNumber(el.statImportant, important);
    el.statImportantSub.textContent = `${highPriority} high priority open`;

    // Progress card
    animateNumber(el.progressPercent, percent);
    el.progressBar.style.width = `${percent}%`;
    el.progressTrack.setAttribute('aria-valuenow', percent);
    el.progressText.textContent = total ? `${completed} of ${total} task${total === 1 ? '' : 's'} completed` : 'No tasks yet';
    el.legendPending.textContent = pending;
    el.legendProgress.textContent = inProgress;
    el.legendDone.textContent = completed;
    el.progressMessage.textContent =
      !total ? 'Add a task to get started' :
      percent === 100 ? 'Everything is done — amazing! 🎉' :
      percent >= 60 ? "You're almost there, keep going!" :
      percent > 0 ? 'Good start — keep the momentum' : "Let's get the first one done";

    // Sidebar counters
    el.countAll.textContent = total;
    el.countToday.textContent = tasks.filter((t) => t.dueDate === today).length;
    el.countUpcoming.textContent = tasks.filter((t) => t.dueDate && t.dueDate > today && t.status !== 'completed').length;
    el.countCompleted.textContent = completed;
    el.countImportant.textContent = important;

    renderNotifications();
  }

  // Bell dropdown: overdue + due-today tasks that aren't completed
  function renderNotifications() {
    const today = todayISO();
    const alerts = state.tasks
      .filter((t) => t.status !== 'completed' && t.dueDate && t.dueDate <= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    el.notifBadge.textContent = alerts.length;
    el.notifBadge.classList.toggle('d-none', alerts.length === 0);
    el.notifSummary.textContent = alerts.length ? `${alerts.length} need attention` : 'All caught up';

    el.notifList.innerHTML = alerts.length
      ? alerts.map((t) => {
          const overdue = t.dueDate < today;
          return `
            <button type="button" class="notif-item" data-notif-id="${t.id}">
              <span class="notif-ico ${overdue ? 'overdue' : 'today'}"><i class="bi ${overdue ? 'bi-exclamation-triangle' : 'bi-alarm'}"></i></span>
              <span><strong>${escapeHTML(t.title)}</strong><small>${overdue ? 'Overdue · ' : 'Due today · '}${escapeHTML(getDueInfo(t).label)}</small></span>
            </button>`;
        }).join('')
      : '<div class="notif-empty"><i class="bi bi-check2-circle"></i>You have no overdue or due-today tasks.</div>';
  }

  // Reflect state in the filter chips / sidebar / sort dropdown
  function syncControls() {
    $$('.nav-item-btn[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    $$('#statusFilters .chip').forEach((b) => b.classList.toggle('active', b.dataset.status === state.status));
    $$('#priorityFilters .chip').forEach((b) => b.classList.toggle('active', b.dataset.priority === state.priority));
    $$('#sortMenu .dropdown-item').forEach((b) => b.classList.toggle('active', b.dataset.sort === state.sort));
    el.sortLabel.textContent = SORT_LABEL[state.sort];
    el.searchClear.classList.toggle('d-none', !state.search);
    el.searchKbd.classList.toggle('d-none', Boolean(state.search));
  }

  // Re-render everything that depends on the task data
  function refresh(animate = false) {
    renderTasks(animate);
    updateStatistics();
    syncControls();
  }

  /* ---------------------------------------------------------
     8. NAVIGATION, FILTERS & SORT
  --------------------------------------------------------- */
  function setView(view) {
    state.view = view;
    state.status = 'all'; // a status chip from another view could hide everything
    refresh(true);
    // Close the mobile drawer if it is open
    const sidebar = bootstrap.Offcanvas.getInstance(el.sidebar);
    if (sidebar && el.sidebar.classList.contains('show')) sidebar.hide();
  }

  function clearFilters() {
    state.status = 'all';
    state.priority = 'all';
    state.search = '';
    el.searchInput.value = '';
    refresh(true);
  }

  /* ---------------------------------------------------------
     9. ADD / EDIT MODAL & FORM VALIDATION
  --------------------------------------------------------- */
  function setPriorityRadio(value) {
    const radio = $(`input[name="taskPriority"][value="${value}"]`) || $('input[name="taskPriority"][value="medium"]');
    radio.checked = true;
  }
  const getPriorityRadio = () => ($('input[name="taskPriority"]:checked') || {}).value || 'medium';

  function clearValidation() {
    $$('.is-invalid', el.taskForm).forEach((n) => n.classList.remove('is-invalid'));
  }

  // Opens the same modal for both "create" (no argument) and "edit" (task id)
  function openTaskModal(id = null) {
    clearValidation();
    el.taskForm.reset();
    const task = id ? findTask(id) : null;

    if (task) {
      el.taskId.value = task.id;
      el.taskTitle.value = task.title;
      el.taskDescription.value = task.description || '';
      el.taskDueDate.value = task.dueDate || '';
      el.taskDueTime.value = task.dueTime || '';
      setPriorityRadio(task.priority);
      el.taskCategory.value = task.category;
      el.taskStatus.value = task.status;
      el.taskImportant.checked = Boolean(task.important);
      el.taskModalLabel.textContent = 'Edit Task';
      el.taskModalSub.textContent = 'Update the details and save your changes.';
      el.taskModalIcon.innerHTML = '<i class="bi bi-pencil-square"></i>';
      el.taskSubmitBtn.querySelector('span').textContent = 'Save Changes';
    } else {
      el.taskId.value = '';
      el.taskDueDate.value = todayISO();
      setPriorityRadio('medium');
      el.taskCategory.value = 'work';
      el.taskStatus.value = 'pending';
      el.taskModalLabel.textContent = 'Add New Task';
      el.taskModalSub.textContent = 'Fill in the details below to create a task.';
      el.taskModalIcon.innerHTML = '<i class="bi bi-plus-lg"></i>';
      el.taskSubmitBtn.querySelector('span').textContent = 'Create Task';
    }
    getModal('taskModal').show();
  }

  function validateTaskForm() {
    let valid = true;
    clearValidation();

    const title = el.taskTitle.value.trim();
    if (!title) {
      el.taskTitleError.textContent = 'Please enter a task title.';
      el.taskTitle.classList.add('is-invalid'); valid = false;
    } else if (title.length < 3) {
      el.taskTitleError.textContent = 'Title must be at least 3 characters.';
      el.taskTitle.classList.add('is-invalid'); valid = false;
    }
    // A time without a date is meaningless
    if (el.taskDueTime.value && !el.taskDueDate.value) {
      el.taskDueDate.classList.add('is-invalid'); valid = false;
    }
    if (!valid) {
      const firstInvalid = $('.is-invalid', el.taskForm);
      if (firstInvalid) firstInvalid.focus();
    }
    return valid;
  }

  function handleTaskSubmit(event) {
    event.preventDefault();
    if (!validateTaskForm()) return;

    const data = {
      title: el.taskTitle.value,
      description: el.taskDescription.value,
      dueDate: el.taskDueDate.value,
      dueTime: el.taskDueDate.value ? el.taskDueTime.value : '',
      priority: getPriorityRadio(),
      category: el.taskCategory.value,
      status: el.taskStatus.value,
      important: el.taskImportant.checked
    };

    if (el.taskId.value) updateTask(el.taskId.value, data);
    else createTask(data);

    getModal('taskModal').hide();
  }

  /* ---------------------------------------------------------
     10. DELETE CONFIRMATION
  --------------------------------------------------------- */
  function openDeleteModal(id) {
    const task = findTask(id);
    if (!task) return;
    state.pendingDeleteId = id;
    el.deleteTaskName.textContent = task.title;
    getModal('deleteModal').show();
  }

  /* ---------------------------------------------------------
     11. THEME (light / dark)
  --------------------------------------------------------- */
  function applyTheme(theme, persist = true) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    el.themeIcon.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
    el.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    el.themeToggle.title = theme === 'dark' ? 'Light mode' : 'Dark mode';
    el.settingsThemeSwitch.checked = theme === 'dark';
    if (persist) storage.set(KEYS.theme, theme);
  }
  const currentTheme = () => document.documentElement.getAttribute('data-bs-theme') || 'light';

  function toggleTheme() {
    el.themeToggle.classList.add('spin');
    setTimeout(() => el.themeToggle.classList.remove('spin'), 500);
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  /* ---------------------------------------------------------
     12. TOASTS
  --------------------------------------------------------- */
  function showToast(message, type = 'success') {
    const node = document.createElement('div');
    node.className = `toast tf-toast toast-${type} border-0`;
    node.setAttribute('role', 'status');
    node.innerHTML = `
      <span class="toast-ico"><i class="bi ${TOAST_ICON[type] || TOAST_ICON.info}"></i></span>
      <span class="toast-msg">${escapeHTML(message)}</span>
      <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>`;
    el.toastContainer.appendChild(node);
    const toast = new bootstrap.Toast(node, { delay: 2800 });
    node.addEventListener('hidden.bs.toast', () => node.remove());
    toast.show();
  }

  /* ---------------------------------------------------------
     13. HERO (greeting + date)
  --------------------------------------------------------- */
  function updateGreeting() {
    const hour = new Date().getHours();
    const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    el.greeting.textContent = `Good ${part} 👋`;
    el.heroDate.innerHTML = '<i class="bi bi-calendar3"></i> ' +
      new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  /* ---------------------------------------------------------
     14. EVENT LISTENERS
  --------------------------------------------------------- */
  function bindEvents() {
    // Open "Add task" modal from every entry point
    [el.addTaskBtn, el.addTaskBtnSecondary, el.emptyCreateBtn].forEach((b) => b.addEventListener('click', () => openTaskModal()));

    // Form
    el.taskForm.addEventListener('submit', handleTaskSubmit);
    el.taskTitle.addEventListener('input', () => el.taskTitle.classList.remove('is-invalid'));
    el.taskDueDate.addEventListener('input', () => el.taskDueDate.classList.remove('is-invalid'));
    el.taskModal.addEventListener('shown.bs.modal', () => { if (!el.taskId.value) el.taskTitle.focus(); });

    // Sidebar navigation
    $$('.nav-item-btn[data-view]').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));
    $('[data-view-link]').addEventListener('click', (e) => { e.preventDefault(); setView('dashboard'); });

    // Stat cards act as shortcuts
    $$('.stat-card').forEach((card) => card.addEventListener('click', () => {
      const stat = card.dataset.stat;
      if (stat === 'completed') setView('completed');
      else if (stat === 'important') setView('important');
      else {
        setView('all');
        if (stat === 'in-progress') { state.status = 'in-progress'; refresh(true); }
      }
      el.taskPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    // Live search
    el.searchInput.addEventListener('input', () => { state.search = el.searchInput.value; refresh(); });
    el.searchClear.addEventListener('click', () => { el.searchInput.value = ''; state.search = ''; refresh(); el.searchInput.focus(); });

    // Status / priority chips
    el.statusFilters.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-status]');
      if (!chip) return;
      state.status = chip.dataset.status; refresh(true);
    });
    el.priorityFilters.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-priority]');
      if (!chip) return;
      state.priority = chip.dataset.priority; refresh(true);
    });
    el.clearFiltersBtn.addEventListener('click', clearFilters);
    el.emptyClearBtn.addEventListener('click', clearFilters);

    // Sort dropdown
    el.sortMenu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-sort]');
      if (!item) return;
      state.sort = item.dataset.sort; refresh(true);
    });

    // Task card actions (event delegation)
    el.taskList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.dataset.action === 'toggle') return;
      const id = btn.closest('.task-card').dataset.id;
      if (btn.dataset.action === 'edit') openTaskModal(id);
      if (btn.dataset.action === 'delete') openDeleteModal(id);
      if (btn.dataset.action === 'important') toggleImportant(id);
    });
    el.taskList.addEventListener('change', (e) => {
      if (e.target.matches('[data-action="toggle"]')) toggleTaskStatus(e.target.closest('.task-card').dataset.id);
    });

    // Delete confirmation
    el.confirmDeleteBtn.addEventListener('click', () => {
      if (state.pendingDeleteId !== null) deleteTask(state.pendingDeleteId);
      state.pendingDeleteId = null;
      getModal('deleteModal').hide();
    });

    // Notifications -> open the task for editing
    el.notifList.addEventListener('click', (e) => {
      const item = e.target.closest('[data-notif-id]');
      if (!item) return;
      const dropdown = bootstrap.Dropdown.getInstance($('#notifBtn'));
      if (dropdown) dropdown.hide();
      openTaskModal(item.dataset.notifId);
    });

    // Theme
    el.themeToggle.addEventListener('click', toggleTheme);
    el.settingsThemeSwitch.addEventListener('change', () => applyTheme(el.settingsThemeSwitch.checked ? 'dark' : 'light'));

    // Settings actions
    el.resetDataBtn.addEventListener('click', () => {
      if (!window.confirm('Replace all tasks with the original sample tasks?')) return;
      state.tasks = getSampleTasks();
      saveTasks(); clearFilters(); getModal('settingsModal').hide();
      showToast('Sample data restored', 'info');
    });
    el.clearAllBtn.addEventListener('click', () => {
      if (!window.confirm('Delete ALL tasks? This cannot be undone.')) return;
      state.tasks = [];
      saveTasks(); refresh(true); getModal('settingsModal').hide();
      showToast('All tasks cleared', 'danger');
    });

    // Keyboard shortcuts: "/" focuses search, "N" opens the new-task modal
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal.show')) return;
      if (e.key === '/') { e.preventDefault(); el.searchInput.focus(); }
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); openTaskModal(); }
    });

    // Keep the greeting accurate and refresh date-based labels when the tab regains focus
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { updateGreeting(); refresh(); }
    });

    // Keep tasks in sync across tabs
    window.addEventListener('storage', (e) => {
      if (e.key === KEYS.tasks) { state.tasks = loadTasks(); refresh(); }
    });
  }

  /* ---------------------------------------------------------
     15. INIT
  --------------------------------------------------------- */
  function init() {
    cacheDOM();
    applyTheme(currentTheme(), false);
    updateGreeting();
    state.tasks = loadTasks();
    bindEvents();
    refresh(true);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
