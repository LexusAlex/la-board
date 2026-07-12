// ===== КОНФИГУРАЦИЯ КОЛОНОК =====
const DEFAULT_COLUMNS = [
    { id: 'backlog', title: 'Бэклог', color: '#6c757d', icon: 'inbox', collapsed: false, wipLimit: 0 },
    { id: 'todo', title: 'К выполнению', color: '#4361ee', icon: 'list-check', collapsed: false, wipLimit: 0 },
    { id: 'doing', title: 'В работе', color: '#ff9f1c', icon: 'spinner', collapsed: false, wipLimit: 0 },
    { id: 'review', title: 'На ревью', color: '#7209b7', icon: 'eye', collapsed: false, wipLimit: 0 },
    { id: 'done', title: 'Готово', color: '#06d6a0', icon: 'check-circle', collapsed: false, wipLimit: 0 },
];

const DEFAULT_CARDS = {
    backlog: [
        { id: genId(), title: 'Исследовать конкурентов', desc: 'Анализ 5 основных конкурентов на рынке', priority: 'low', label: '', dueDate: '', createdAt: Date.now(), checklists: [], assigneeId: '' },
        { id: genId(), title: 'Написать техническое задание', desc: 'Для модуля аналитики и дашборда', priority: 'high', label: 'feature', dueDate: '2026-07-20', createdAt: Date.now(), checklists: [{ text: 'Описать API', done: false }, { text: 'Согласовать с командой', done: false }], assigneeId: '' },
        { id: genId(), title: 'Дизайн иконок для мобильной версии', desc: '', priority: 'medium', label: 'improvement', dueDate: '', createdAt: Date.now(), checklists: [], assigneeId: '' },
    ],
    todo: [
        { id: genId(), title: 'Настроить CI/CD пайплайн', desc: 'GitHub Actions для автоматического деплоя', priority: 'high', label: 'feature', dueDate: '2026-07-15', createdAt: Date.now(), checklists: [], assigneeId: '' },
        { id: genId(), title: 'Рефакторинг модуля авторизации', desc: 'Вынести общую логику в отдельный сервис', priority: 'medium', label: 'improvement', dueDate: '', createdAt: Date.now(), checklists: [], assigneeId: '' },
    ],
    doing: [
        { id: genId(), title: 'Интеграция платёжной системы', desc: 'Stripe API, обработка вебхуков', priority: 'high', label: 'feature', dueDate: '2026-07-14', createdAt: Date.now(), checklists: [{ text: 'Подключить SDK', done: true }, { text: 'Обработать вебхуки', done: false }], assigneeId: '' },
        { id: genId(), title: 'Оптимизация SQL-запросов', desc: 'Ускорить загрузку дашборда в 3 раза', priority: 'medium', label: 'improvement', dueDate: '', createdAt: Date.now(), checklists: [], assigneeId: '' },
    ],
    review: [
        { id: genId(), title: 'Страница настроек профиля', desc: 'Аватар, имя, уведомления, тема', priority: 'low', label: 'feature', dueDate: '', createdAt: Date.now(), checklists: [], assigneeId: '' },
    ],
    done: [
        { id: genId(), title: 'Регистрация и вход пользователя', desc: 'Email + OAuth через Google', priority: 'high', label: 'feature', dueDate: '', createdAt: Date.now(), checklists: [], assigneeId: '' },
        { id: genId(), title: 'Базовый лейаут приложения', desc: 'Сайдбар, хедер, адаптив', priority: 'medium', label: 'improvement', dueDate: '', createdAt: Date.now(), checklists: [], assigneeId: '' },
    ],
};

// ===== СОСТОЯНИЕ =====
let columnsConfig = loadColumnsConfig();
let boardData = loadBoardData();
let currentColumnId = null;
let editingCardId = null;
let editingColumnId = null;
let draggedCardId = null;
let dragSourceColumnId = null;
let deleteConfirmCallback = null;
let searchQuery = '';
let previewCardId = null;
let previewColumnId = null;
let wipColumnId = null;

// Фильтры
let filters = { project: '', priority: '', label: '', due: '', assignee: '' };

// Undo/Redo
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50;

// Мультивыбор
let selectedCards = new Set();

// Навигация
let focusedCardId = null;
let focusedColumnId = null;

// Перетаскивание колонок
let draggedColumnId = null;

// Debounce
let searchDebounce = null;

// ===== УТИЛИТЫ =====
function genId() {
    return 'card_' + Math.random().toString(36).slice(2, 9);
}

function getPriorityLabel(p) {
    return { high: 'Высокий', medium: 'Средний', low: 'Низкий' }[p] || 'Средний';
}

function getPriorityClass(p) {
    return { high: 'priority-high', medium: 'priority-medium', low: 'priority-low' }[p] || 'priority-medium';
}

function getLabelName(l) {
    return { bug: 'Баг', feature: 'Фича', improvement: 'Улучшение', urgent: 'Срочно' }[l] || '';
}

function getLabelClass(l) {
    return { bug: 'label-bug', feature: 'label-feature', improvement: 'label-improvement', urgent: 'label-urgent' }[l] || '';
}

function getCardNumber(columnId, cardIndex) {
    const prefix = columnId.slice(0, 2).toUpperCase();
    return `${prefix}-${String(cardIndex + 1).padStart(2, '0')}`;
}

function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    const formatted = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    if (diff < 0) return { text: formatted, overdue: true };
    if (diff === 0) return { text: 'Сегодня', overdue: false };
    if (diff === 1) return { text: 'Завтра', overdue: false };
    return { text: formatted, overdue: false };
}

function getColumnId() {
    return 'col_' + Math.random().toString(36).slice(2, 7);
}

function getProjectId() {
    return 'proj_' + Math.random().toString(36).slice(2, 9);
}

function getProjectNameById(projectId) {
    const projects = loadProjects() || [];
    const project = projects.find(p => p.id === projectId);
    return project ? project.name : 'Неизвестный';
}

// ===== СОТРУДНИКИ =====
function loadAssignees() {
    const project = getCurrentProject();
    if (!project) return [];
    try {
        const data = localStorage.getItem('taskBoardAssignees_' + project.id);
        if (!data) return [];
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
        return parsed;
    } catch { return []; }
}

function saveAssignees(list) {
    const project = getCurrentProject();
    if (!project) return;
    try {
        localStorage.setItem('taskBoardAssignees_' + project.id, JSON.stringify(list));
    } catch (e) {
        showToast('⚠️ Ошибка сохранения сотрудников');
    }
}

function getAssigneeNameById(assigneeId) {
    if (!assigneeId) return '';
    const assignees = loadAssignees();
    const a = assignees.find(a => a.id === assigneeId);
    return a ? a.name : '';
}

function genAssigneeId() {
    return 'asm_' + Math.random().toString(36).substr(2, 7);
}

function populateAssigneeSelect(selectEl, selectedId) {
    const assignees = loadAssignees();
    selectEl.innerHTML = '<option value="">Не назначен</option>' +
        assignees.map(a => `<option value="${a.id}"${a.id === selectedId ? ' selected' : ''}>${escHtml(a.name)}</option>`).join('') +
        '<option value="__new__">+ Новый сотрудник...</option>';
}

function populateAssigneeFilter() {
    const select = document.getElementById('filterAssignee');
    const assignees = loadAssignees();
    const currentVal = select.value;
    select.innerHTML = '<option value="">Все</option>' +
        assignees.map(a => `<option value="${a.id}"${a.id === currentVal ? ' selected' : ''}>${escHtml(a.name)}</option>`).join('');
    if (currentVal && !assignees.some(a => a.id === currentVal)) {
        select.value = '';
        filters.assignee = '';
    }
}

// ===== ПРОЕКТЫ =====
function loadProjects() {
    try {
        const data = localStorage.getItem('taskBoardProjects');
        if (!data) return null;
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return null;
        return parsed;
    } catch { return null; }
}

function saveProjects(projects) {
    try { localStorage.setItem('taskBoardProjects', JSON.stringify(projects)); }
    catch (e) { showToast('⚠️ Не удалось сохранить проекты'); }
}

function loadCurrentProjectId() {
    try { return localStorage.getItem('taskBoardCurrentProject') || null; }
    catch { return null; }
}

function saveCurrentProjectId(id) {
    try { localStorage.setItem('taskBoardCurrentProject', id); }
    catch { showToast('⚠️ Ошибка сохранения текущего проекта'); }
}

function migrateOldData() {
    const projects = loadProjects();
    if (projects) return projects;

    const oldData = localStorage.getItem('taskBoardData');
    const oldCols = localStorage.getItem('taskBoardColumns');

    const defaultProject = {
        id: getProjectId(),
        name: 'Мой проект',
        color: '#4361ee',
        createdAt: Date.now()
    };

    if (oldData || oldCols) {
        try {
            localStorage.setItem('taskBoardData_' + defaultProject.id, oldData || JSON.stringify(DEFAULT_CARDS));
            localStorage.setItem('taskBoardColumns_' + defaultProject.id, oldCols || JSON.stringify(DEFAULT_COLUMNS));
        } catch {
            localStorage.setItem('taskBoardData_' + defaultProject.id, JSON.stringify(DEFAULT_CARDS));
            localStorage.setItem('taskBoardColumns_' + defaultProject.id, JSON.stringify(DEFAULT_COLUMNS));
        }
    } else {
        localStorage.setItem('taskBoardData_' + defaultProject.id, JSON.stringify(DEFAULT_CARDS));
        localStorage.setItem('taskBoardColumns_' + defaultProject.id, JSON.stringify(DEFAULT_COLUMNS));
    }

    localStorage.removeItem('taskBoardData');
    localStorage.removeItem('taskBoardColumns');

    saveProjects([defaultProject]);
    saveCurrentProjectId(defaultProject.id);
    return [defaultProject];
}

function getCurrentProject() {
    const projects = loadProjects() || migrateOldData();
    const currentId = loadCurrentProjectId();
    return projects.find(p => p.id === currentId) || projects[0];
}

function createProject(name, color) {
    const projects = loadProjects() || [];
    const newProject = { id: getProjectId(), name, color, createdAt: Date.now() };
    projects.push(newProject);
    saveProjects(projects);
    localStorage.setItem('taskBoardData_' + newProject.id, JSON.stringify(DEFAULT_CARDS));
    localStorage.setItem('taskBoardColumns_' + newProject.id, JSON.stringify(DEFAULT_COLUMNS));
    return newProject;
}

function deleteProject(projectId) {
    const projects = loadProjects() || [];
    if (projects.length <= 1) {
        showToast('⚠️ Нельзя удалить последний проект');
        return false;
    }
    const filtered = projects.filter(p => p.id !== projectId);
    saveProjects(filtered);
    localStorage.removeItem('taskBoardData_' + projectId);
    localStorage.removeItem('taskBoardColumns_' + projectId);
    if (loadCurrentProjectId() === projectId) {
        switchProject(filtered[0].id);
    }
    return true;
}

function renameProject(projectId, newName) {
    const projects = loadProjects() || [];
    const project = projects.find(p => p.id === projectId);
    if (project) {
        project.name = newName;
        saveProjects(projects);
    }
}

function switchProject(projectId) {
    saveCurrentProjectId(projectId);
    columnsConfig = loadColumnsConfig();
    boardData = loadBoardData();
    undoStack = [];
    redoStack = [];
    selectedCards.clear();
    focusedCardId = null;
    focusedColumnId = null;
    filters = { project: '', priority: '', label: '', due: '', assignee: '' };
    document.getElementById('filterProject').value = '';
    document.getElementById('filterPriority').value = '';
    document.getElementById('filterLabel').value = '';
    document.getElementById('filterDue').value = '';
    document.getElementById('filterAssignee').value = '';
    document.getElementById('searchInput').value = '';
    renderBoard();
    renderProjectSelector();
    updateUndoRedoButtons();
}

// ===== LOCALSTORAGE =====
function loadColumnsConfig() {
    const project = getCurrentProject();
    if (!project) return JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
    try {
        const data = localStorage.getItem('taskBoardColumns_' + project.id);
        if (!data) return JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) throw new Error('Invalid columns format');
        return parsed;
    } catch (e) {
        console.warn('Ошибка загрузки конфигурации колонок:', e);
        return JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
    }
}

function loadBoardData() {
    const project = getCurrentProject();
    if (!project) return JSON.parse(JSON.stringify(DEFAULT_CARDS));
    try {
        const data = localStorage.getItem('taskBoardData_' + project.id);
        if (!data) return JSON.parse(JSON.stringify(DEFAULT_CARDS));
        const parsed = JSON.parse(data);
        if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid board data format');
        return parsed;
    } catch (e) {
        console.warn('Ошибка загрузки данных доски:', e);
        return JSON.parse(JSON.stringify(DEFAULT_CARDS));
    }
}

function saveColumnsConfig() {
    const project = getCurrentProject();
    if (!project) return;
    try {
        localStorage.setItem('taskBoardColumns_' + project.id, JSON.stringify(columnsConfig));
    } catch (e) {
        console.error('Ошибка сохранения конфигурации:', e);
        showToast('⚠️ Не удалось сохранить — возможно, хранилище заполнено');
    }
}

function saveBoardData() {
    const project = getCurrentProject();
    if (!project) return;
    try {
        localStorage.setItem('taskBoardData_' + project.id, JSON.stringify(boardData));
    } catch (e) {
        console.error('Ошибка сохранения данных:', e);
        showToast('⚠️ Не удалось сохранить — возможно, хранилище заполнено');
    }
}

// ===== UNDO/REDO =====
function pushUndo() {
    undoStack.push(JSON.stringify({ boardData, columnsConfig }));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify({ boardData, columnsConfig }));
    const state = JSON.parse(undoStack.pop());
    boardData = state.boardData;
    columnsConfig = state.columnsConfig;
    saveBoardData();
    saveColumnsConfig();
    renderBoard();
    updateUndoRedoButtons();
    showToast('↩ Отмена действия');
}

function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify({ boardData, columnsConfig }));
    const state = JSON.parse(redoStack.pop());
    boardData = state.boardData;
    columnsConfig = state.columnsConfig;
    saveBoardData();
    saveColumnsConfig();
    renderBoard();
    updateUndoRedoButtons();
    showToast('↪ Повтор действия');
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('btnUndo');
    const redoBtn = document.getElementById('btnRedo');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

// ===== ТЕМА =====
function loadTheme() {
    try { return localStorage.getItem('taskBoardTheme') || 'light'; }
    catch { return 'light'; }
}

function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    try { localStorage.setItem('taskBoardTheme', theme); } catch {}
    const sun = document.getElementById('iconSun');
    const moon = document.getElementById('iconMoon');
    if (sun && moon) {
        sun.style.display = theme === 'dark' ? 'none' : 'block';
        moon.style.display = theme === 'dark' ? 'block' : 'none';
    }
}

function toggleTheme() {
    const current = loadTheme();
    setTheme(current === 'light' ? 'dark' : 'light');
}

// ===== КОМПАКТНЫЙ РЕЖИМ =====
function loadCompact() {
    try { return localStorage.getItem('taskBoardCompact') === 'true'; }
    catch { return false; }
}

function toggleCompact() {
    const compact = !loadCompact();
    try { localStorage.setItem('taskBoardCompact', compact); } catch {}
    document.body.classList.toggle('compact', compact);
    document.getElementById('btnCompact').classList.toggle('active', compact);
}

// ===== ФИЛЬТРЫ =====
function applyFilters(card) {
    if (filters.project && (card.projectId || getCurrentProject().id) !== filters.project) return false;
    if (filters.priority && card.priority !== filters.priority) return false;
    if (filters.label && card.label !== filters.label) return false;
    if (filters.assignee && (card.assigneeId || '') !== filters.assignee) return false;
    if (filters.due) {
        if (filters.due === 'none') {
            if (card.dueDate) return false;
        } else {
            if (!card.dueDate) return false;
            const dateInfo = formatDate(card.dueDate);
            if (filters.due === 'overdue' && !dateInfo.overdue) return false;
            if (filters.due === 'today' && dateInfo.text !== 'Сегодня') return false;
            if (filters.due === 'week') {
                const d = new Date(card.dueDate + 'T00:00:00');
                const now = new Date(); now.setHours(0,0,0,0);
                const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
                if (d < now || d > weekEnd) return false;
            }
        }
    }
    return true;
}

function matchesSearch(card) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (card.title.toLowerCase().includes(q)) return true;
    if (card.desc && card.desc.toLowerCase().includes(q)) return true;
    if (card.assigneeId) {
        const name = getAssigneeNameById(card.assigneeId).toLowerCase();
        if (name.includes(q)) return true;
    }
    return false;
}

function getFilteredCards(columnId) {
    const cards = boardData[columnId] || [];
    return cards.filter(c => applyFilters(c) && matchesSearch(c));
}

// ===== ПРОГРЕСС =====
function calcProgress() {
    const weights = {};
    const len = columnsConfig.length;
    columnsConfig.forEach((col, i) => {
        weights[col.id] = len > 1 ? i / (len - 1) * 100 : 0;
    });
    let total = 0, weighted = 0;
    columnsConfig.forEach(col => {
        const cards = boardData[col.id] || [];
        cards.forEach(() => { total++; weighted += (weights[col.id] || 0); });
    });
    return total === 0 ? 0 : Math.round(weighted / total);
}

// ===== РЕНДЕР =====
function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    document.querySelectorAll('.context-menu').forEach(m => m.remove());

    columnsConfig.forEach(col => {
        const allCards = boardData[col.id] || [];
        const filtered = getFilteredCards(col.id);
        const isCollapsed = col.collapsed;

        const wipClass = col.wipLimit > 0
            ? (allCards.length > col.wipLimit ? 'wip-limit-exceeded' : allCards.length === col.wipLimit ? 'wip-limit-reached' : '')
            : '';

        const colEl = document.createElement('div');
        colEl.className = `column ${isCollapsed ? 'collapsed' : ''} ${wipClass}`;
        colEl.dataset.columnId = col.id;

        colEl.innerHTML = `
            <div class="column-header" ${isCollapsed ? `onclick="toggleCollapse('${col.id}')"` : ''} draggable="false">
                <div class="column-header-left">
                    <div class="col-dot" style="background:${col.color};box-shadow:0 0 8px ${col.color}44;"></div>
                    <span class="column-title" data-column-id="${col.id}">${escHtml(col.title)}</span>
                    <span class="count-badge">${filtered.length}</span>
                </div>
                <div class="column-actions">
                    <button class="column-btn" draggable="false" onclick="toggleCollapse('${col.id}')" title="${isCollapsed ? 'Развернуть' : 'Свернуть'}" aria-label="${isCollapsed ? 'Развернуть' : 'Свернуть'} колонку">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${isCollapsed ? '<polyline points="9,18 15,12 9,6"/>' : '<polyline points="15,18 9,12 15,6"/>'}
                        </svg>
                    </button>
                    <button class="column-btn" draggable="false" onclick="openWipModal('${col.id}')" title="Лимит карточек" aria-label="Настроить лимит карточек">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                    </button>
                    <button class="column-btn" draggable="false" onclick="deleteColumn('${col.id}')" title="Удалить колонку" aria-label="Удалить колонку">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
            ${!isCollapsed && col.wipLimit > 0 ? `<div class="wip-indicator ${allCards.length >= col.wipLimit ? (allCards.length > col.wipLimit ? 'exceeded' : 'warning') : ''}">${allCards.length}/${col.wipLimit}</div>` : ''}
            <div class="column-body" data-column-id="${col.id}">
                ${filtered.length === 0 ? `
                    <div class="empty-state">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                        </svg>
                        <span>Перетащите карточку сюда</span>
                    </div>
                ` : filtered.map((card, i) => renderCard(card, col.id, i)).join('')}
            </div>
            <div class="column-footer">
                <button class="btn-add" onclick="openModal('${col.id}')" aria-label="Добавить карточку в ${col.title}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Добавить карточку
                </button>
            </div>
        `;

        board.appendChild(colEl);
    });

    // Кнопка добавления колонки
    const addColBtn = document.createElement('button');
    addColBtn.className = 'btn-add-column';
    addColBtn.onclick = addColumn;
    addColBtn.title = 'Добавить колонку';
    addColBtn.setAttribute('aria-label', 'Добавить колонку');
    addColBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    board.appendChild(addColBtn);

    // События drag & drop на тела колонок
    document.querySelectorAll('.column-body').forEach(body => {
        body.addEventListener('dragover', handleDragOver);
        body.addEventListener('dragenter', handleDragEnter);
        body.addEventListener('dragleave', handleDragLeave);
        body.addEventListener('drop', handleDrop);
    });

    // События на карточки
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('touchstart', handleTouchStart, { passive: false });
        card.addEventListener('touchmove', handleTouchMove, { passive: false });
        card.addEventListener('touchend', handleTouchEnd);
    });

    // События на колонки для перетаскивания
    document.querySelectorAll('.column:not(.collapsed)').forEach(col => {
        const header = col.querySelector('.column-header');
        header.addEventListener('mousedown', handleColumnMouseDown);
        header.addEventListener('mouseup', () => header.removeAttribute('draggable'));
        header.addEventListener('mouseleave', () => header.removeAttribute('draggable'));
        header.addEventListener('dragstart', handleColumnDragStart);
        header.addEventListener('dragend', handleColumnDragEnd);
        col.addEventListener('dragover', handleColumnDragOver);
        col.addEventListener('dragenter', handleColumnDragEnter);
        col.addEventListener('dragleave', handleColumnDragLeave);
        col.addEventListener('drop', handleColumnDrop);
        header.addEventListener('touchstart', handleColumnTouchStart, { passive: false });
        header.addEventListener('touchmove', handleColumnTouchMove, { passive: false });
        header.addEventListener('touchend', handleColumnTouchEnd);
    });

    updateTotalCount();
    updateMultiSelectBar();

    // Восстановить фокус
    if (focusedCardId && focusedColumnId) {
        const el = document.querySelector(`[data-card-id="${focusedCardId}"]`);
        if (el) el.classList.add('focused');
    }
}

function renderCard(card, columnId, index) {
    const dateInfo = formatDate(card.dueDate);
    const dateClass = dateInfo && dateInfo.overdue ? 'card-due overdue' : 'card-due';
    const isSelected = selectedCards.has(card.id);
    const isFocused = focusedCardId === card.id;

    // Прогресс чеклиста
    const checklists = card.checklists || [];
    const doneCount = checklists.filter(c => c.done).length;
    const totalCount = checklists.length;
    const checklistProgress = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;

    return `
        <div class="card ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}"
             draggable="true"
             data-card-id="${card.id}"
             data-column-id="${columnId}"
             role="article"
             aria-label="${escHtml(card.title)}">
            <button class="btn-card-action btn-preview" onclick="event.stopPropagation();openPreview('${columnId}','${card.id}')" aria-label="Просмотреть карточку">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn-card-action btn-edit" onclick="event.stopPropagation();editCard('${columnId}','${card.id}')" aria-label="Редактировать карточку">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-card-action btn-delete" onclick="event.stopPropagation();confirmDelete('${columnId}','${card.id}')" aria-label="Удалить карточку">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div class="card-id">${getCardNumber(columnId, index)}</div>
            <div class="card-title" data-card-id="${card.id}" data-column-id="${columnId}">${escHtml(card.title)}</div>
            ${card.desc ? `<div class="card-desc" onclick="event.stopPropagation();openPreview('${columnId}','${card.id}')">${escHtml(card.desc)}</div>` : ''}
            ${totalCount > 0 ? `
                <div class="card-checklist-progress">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <span>${doneCount}/${totalCount}</span>
                    <div class="checklist-bar"><div class="checklist-bar-fill" style="width:${checklistProgress}%"></div></div>
                </div>
            ` : ''}
            <div class="card-meta">
                <span class="priority-tag ${getPriorityClass(card.priority)}">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    ${getPriorityLabel(card.priority)}
                </span>
                ${card.label ? `<span class="label-tag ${getLabelClass(card.label)}">${getLabelName(card.label)}</span>` : ''}
                ${dateInfo ? `<span class="${dateClass}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    ${dateInfo.text}
                </span>` : ''}
                ${card.projectId && card.projectId !== getCurrentProject().id ? `<span class="project-tag">${getProjectNameById(card.projectId)}</span>` : ''}
            </div>
        </div>
    `;
}

function updateTotalCount() {
    let total = 0;
    for (const col of columnsConfig) {
        total += (boardData[col.id] || []).length;
    }
    document.getElementById('totalCards').textContent = `${total} задач`;

    const progress = calcProgress();
    const fill = document.getElementById('headerProgressFill');
    const text = document.getElementById('headerProgressText');
    if (fill) fill.style.width = progress + '%';
    if (text) text.textContent = progress + '%';
}

// ===== DRAG & DROP КАРТОЧЕК (MOUSE) =====
function handleDragStart(e) {
    const card = e.target.closest('.card');
    if (!card) return;
    draggedCardId = card.dataset.cardId;
    dragSourceColumnId = card.dataset.columnId;
    requestAnimationFrame(() => card.classList.add('dragging'));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedCardId);
}

function handleDragEnd(e) {
    const card = e.target.closest('.card');
    if (card) card.classList.remove('dragging');
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    document.querySelectorAll('.column.drag-over').forEach(el => el.classList.remove('drag-over'));
    draggedCardId = null;
    dragSourceColumnId = null;
}

function handleDragOver(e) {
    if (!draggedCardId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const body = e.currentTarget;
    body.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    const afterElement = getDragAfterElement(body, e.clientY);
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';
    if (afterElement) body.insertBefore(indicator, afterElement);
    else body.appendChild(indicator);
}

function handleDragEnter(e) {
    if (!draggedCardId) return;
    e.preventDefault();
    e.stopPropagation();
    const column = e.currentTarget.closest('.column');
    if (column) column.classList.add('drag-over');
}

function handleDragLeave(e) {
    const body = e.currentTarget;
    if (!body.contains(e.relatedTarget)) {
        body.querySelectorAll('.drop-indicator').forEach(el => el.remove());
        const column = body.closest('.column');
        if (column) column.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    if (!draggedCardId || !dragSourceColumnId) return;
    e.preventDefault();
    e.stopPropagation();
    const body = e.currentTarget;
    const targetColumnId = body.dataset.columnId;

    body.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    document.querySelectorAll('.column.drag-over').forEach(el => el.classList.remove('drag-over'));

    pushUndo();

    const srcCards = boardData[dragSourceColumnId];
    const cardIndex = srcCards.findIndex(c => c.id === draggedCardId);
    if (cardIndex === -1) return;

    const [card] = srcCards.splice(cardIndex, 1);
    const afterElement = getDragAfterElement(body, e.clientY);
    let insertIndex = (boardData[targetColumnId] || []).length;

    if (afterElement) {
        const afterCardId = afterElement.dataset.cardId;
        if (afterElement.dataset.columnId === targetColumnId) {
            insertIndex = boardData[targetColumnId].findIndex(c => c.id === afterCardId);
        }
    }

    if (!boardData[targetColumnId]) boardData[targetColumnId] = [];
    boardData[targetColumnId].splice(insertIndex, 0, card);

    saveBoardData();
    renderBoard();

    const movedCard = document.querySelector(`[data-card-id="${draggedCardId}"]`);
    if (movedCard) movedCard.classList.add('card-appear');

    if (dragSourceColumnId !== targetColumnId) {
        const tgtCol = columnsConfig.find(c => c.id === targetColumnId);
        showToast(`→ «${card.title.slice(0, 30)}» → ${tgtCol.title}`, true);
    }
}

function getDragAfterElement(container, y) {
    const elements = [...container.querySelectorAll('.card:not(.dragging)')];
    return elements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset, element: child };
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ===== DRAG & DROP КОЛОНОК =====
function handleColumnMouseDown(e) {
    const header = e.target.closest('.column-header');
    if (!header) return;
    if (e.target.closest('.column-btn') || e.target.closest('.column-title[contenteditable="true"]')) {
        header.removeAttribute('draggable');
        return;
    }
    header.setAttribute('draggable', 'true');
}

function getDragAfterColumnElement(board, x) {
    const columns = [...board.querySelectorAll('.column:not(.column-dragging):not(.column-drop-indicator)')];
    return columns.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) return { offset, element: child };
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function handleColumnDragStart(e) {
    const column = e.target.closest('.column');
    if (!column) return;
    if (e.target.closest('.column-title[contenteditable="true"]')) {
        e.preventDefault();
        return;
    }
    draggedColumnId = column.dataset.columnId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedColumnId);

    const header = column.querySelector('.column-header');
    const ghost = header.cloneNode(true);
    ghost.style.cssText = 'position:absolute;top:-9999px;max-width:300px;padding:12px 16px;background:var(--bg-raised);border:1px solid var(--accent);border-radius:8px;box-shadow:var(--shadow-md);';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, e.offsetX, e.offsetY);
    requestAnimationFrame(() => ghost.remove());

    requestAnimationFrame(() => column.classList.add('column-dragging'));
}

function handleColumnDragEnd(e) {
    const column = e.target.closest('.column');
    if (column) column.classList.remove('column-dragging');
    document.querySelectorAll('.column.column-drag-over').forEach(el => el.classList.remove('column-drag-over'));
    document.querySelectorAll('.column-drop-indicator').forEach(el => el.remove());
    draggedColumnId = null;
}

function handleColumnDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedColumnId) return;

    const board = document.getElementById('board');
    board.querySelectorAll('.column-drop-indicator').forEach(el => el.remove());

    const afterCol = getDragAfterColumnElement(board, e.clientX);
    const indicator = document.createElement('div');
    indicator.className = 'column-drop-indicator';
    if (afterCol) board.insertBefore(indicator, afterCol);
    else board.appendChild(indicator);
}

function handleColumnDragEnter(e) {
    e.preventDefault();
    if (!draggedColumnId) return;
    const column = e.target.closest('.column');
    if (column && column.dataset.columnId !== draggedColumnId) {
        column.classList.add('column-drag-over');
    }
}

function handleColumnDragLeave(e) {
    const column = e.target.closest('.column');
    if (column && !column.contains(e.relatedTarget)) {
        column.classList.remove('column-drag-over');
    }
}

function handleColumnDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedColumnId) return;

    const board = document.getElementById('board');
    board.querySelectorAll('.column-drop-indicator').forEach(el => el.remove());
    document.querySelectorAll('.column.column-drag-over').forEach(el => el.classList.remove('column-drag-over'));

    const afterCol = getDragAfterColumnElement(board, e.clientX);
    const fromIndex = columnsConfig.findIndex(c => c.id === draggedColumnId);
    let toIndex;

    if (afterCol) {
        toIndex = columnsConfig.findIndex(c => c.id === afterCol.dataset.columnId);
    } else {
        toIndex = columnsConfig.length;
    }

    if (fromIndex === -1 || toIndex === -1) return;
    if (fromIndex === toIndex || fromIndex === toIndex - 1) return;

    pushUndo();

    const [moved] = columnsConfig.splice(fromIndex, 1);
    const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    columnsConfig.splice(adjustedIndex, 0, moved);

    saveColumnsConfig();
    renderBoard();
    showToast('↕ Колонка перемещена', true);
}

// ===== DRAG & DROP (TOUCH) =====
let touchStartX, touchStartY, touchCard, touchClone;

function handleTouchStart(e) {
    const card = e.target.closest('.card');
    if (!card) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchCard = card;
    draggedCardId = card.dataset.cardId;
    dragSourceColumnId = card.dataset.columnId;
    touchCard.longPressTimer = setTimeout(() => {
        if (!document.body.contains(card)) { touchCard = null; draggedCardId = null; dragSourceColumnId = null; return; }
        touchCard.classList.add('dragging');
        touchClone = card.cloneNode(true);
        touchClone.style.cssText = 'position:fixed;z-index:1000;width:' + card.offsetWidth + 'px;opacity:0.8;pointer-events:none;transform:rotate(3deg) scale(1.05);';
        document.body.appendChild(touchClone);
        moveTouchClone(touch);
    }, 300);
}

function handleTouchMove(e) {
    if (!touchCard) return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - touchStartX) > 10 || Math.abs(touch.clientY - touchStartY) > 10) {
        clearTimeout(touchCard.longPressTimer);
    }
    if (!touchClone) return;
    e.preventDefault();
    moveTouchClone(touch);

    const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
    const columnBody = elements.find(el => el.classList.contains('column-body'));

    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    document.querySelectorAll('.column.drag-over').forEach(el => el.classList.remove('drag-over'));

    if (columnBody) {
        const column = columnBody.closest('.column');
        if (column) column.classList.add('drag-over');
        const afterElement = getDragAfterElement(columnBody, touch.clientY);
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        if (afterElement) columnBody.insertBefore(indicator, afterElement);
        else columnBody.appendChild(indicator);
    }
}

function handleTouchEnd(e) {
    if (!touchCard) return;
    clearTimeout(touchCard.longPressTimer);

    if (touchClone) {
        const touch = e.changedTouches[0];
        const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
        const columnBody = elements.find(el => el.classList.contains('column-body'));

        if (columnBody && draggedCardId && dragSourceColumnId) {
            const targetColumnId = columnBody.dataset.columnId;
            pushUndo();
            const srcCards = boardData[dragSourceColumnId];
            const cardIndex = srcCards.findIndex(c => c.id === draggedCardId);

            if (cardIndex !== -1) {
                const [card] = srcCards.splice(cardIndex, 1);
                const afterElement = getDragAfterElement(columnBody, touch.clientY);
                let insertIndex = (boardData[targetColumnId] || []).length;
                if (afterElement) {
                    insertIndex = boardData[targetColumnId].findIndex(c => c.id === afterElement.dataset.cardId);
                }
                if (!boardData[targetColumnId]) boardData[targetColumnId] = [];
                boardData[targetColumnId].splice(insertIndex, 0, card);
                saveBoardData();

                if (dragSourceColumnId !== targetColumnId) {
                    const tgtCol = columnsConfig.find(c => c.id === targetColumnId);
                    showToast(`→ «${card.title.slice(0, 30)}» → ${tgtCol.title}`, true);
                }
            }
        }

        touchClone.remove();
        touchClone = null;
    }

    touchCard.classList.remove('dragging');
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    document.querySelectorAll('.column.drag-over').forEach(el => el.classList.remove('drag-over'));
    touchCard = null;
    draggedCardId = null;
    dragSourceColumnId = null;
    renderBoard();
}

function moveTouchClone(touch) {
    if (!touchClone) return;
    touchClone.style.left = (touch.clientX - touchClone.offsetWidth / 2) + 'px';
    touchClone.style.top = (touch.clientY - 20) + 'px';
}

// ===== TOUCH DRAG & DROP КОЛОНОК =====
let touchColumnStartX, touchColumnStartY, touchColumn, touchColumnClone, touchColumnLongPress;

function handleColumnTouchStart(e) {
    const header = e.target.closest('.column-header');
    if (!header) return;
    if (e.target.closest('.column-btn') || e.target.closest('.column-title[contenteditable="true"]')) return;
    const column = header.closest('.column');
    if (!column || column.classList.contains('collapsed')) return;
    e.preventDefault();
    const touch = e.touches[0];
    touchColumnStartX = touch.clientX;
    touchColumnStartY = touch.clientY;
    touchColumn = column;
    touchColumnLongPress = setTimeout(() => {
        if (!document.body.contains(column)) { touchColumn = null; draggedColumnId = null; return; }
        draggedColumnId = column.dataset.columnId;
        column.classList.add('column-dragging');
        if (navigator.vibrate) navigator.vibrate(10);
        touchColumnClone = column.querySelector('.column-header').cloneNode(true);
        touchColumnClone.style.cssText = 'position:fixed;z-index:1000;pointer-events:none;max-width:300px;padding:12px 16px;background:var(--bg-raised);border:1px solid var(--accent);border-radius:8px;box-shadow:var(--shadow-md);opacity:0.85;transform:rotate(2deg) scale(1.05);';
        document.body.appendChild(touchColumnClone);
        moveTouchColumnClone(touch);
    }, 300);
}

function handleColumnTouchMove(e) {
    if (!touchColumn) return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - touchColumnStartX) > 10 || Math.abs(touch.clientY - touchColumnStartY) > 10) {
        clearTimeout(touchColumnLongPress);
    }
    if (!touchColumnClone) return;
    e.preventDefault();
    moveTouchColumnClone(touch);

    const board = document.getElementById('board');
    board.querySelectorAll('.column-drop-indicator:not([style*="position:fixed"])').forEach(el => el.remove());

    const afterCol = getDragAfterColumnElement(board, touch.clientX);
    const indicator = document.createElement('div');
    indicator.className = 'column-drop-indicator';
    if (afterCol) board.insertBefore(indicator, afterCol);
    else board.appendChild(indicator);
}

function handleColumnTouchEnd(e) {
    if (!touchColumn) return;
    clearTimeout(touchColumnLongPress);

    if (touchColumnClone && draggedColumnId) {
        const touch = e.changedTouches[0];
        const board = document.getElementById('board');
        const afterCol = getDragAfterColumnElement(board, touch.clientX);
        const fromIndex = columnsConfig.findIndex(c => c.id === draggedColumnId);
        let toIndex;

        if (afterCol) {
            toIndex = columnsConfig.findIndex(c => c.id === afterCol.dataset.columnId);
        } else {
            toIndex = columnsConfig.length;
        }

        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex && fromIndex !== toIndex - 1) {
            pushUndo();
            const [moved] = columnsConfig.splice(fromIndex, 1);
            const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
            columnsConfig.splice(adjustedIndex, 0, moved);
            saveColumnsConfig();
            if (navigator.vibrate) navigator.vibrate(10);
            showToast('↕ Колонка перемещена', true);
        }

        touchColumnClone.remove();
        touchColumnClone = null;
    }

    if (touchColumn) touchColumn.classList.remove('column-dragging');
    document.querySelectorAll('.column-drop-indicator').forEach(el => el.remove());
    document.querySelectorAll('.column.column-drag-over').forEach(el => el.classList.remove('column-drag-over'));
    touchColumn = null;
    draggedColumnId = null;
    renderBoard();
}

function moveTouchColumnClone(touch) {
    if (!touchColumnClone) return;
    touchColumnClone.style.left = (touch.clientX - touchColumnClone.offsetWidth / 2) + 'px';
    touchColumnClone.style.top = (touch.clientY - 20) + 'px';
}

// ===== INLINE-РЕДАКТИРОВАНИЕ =====
function startColumnEdit(colId) {
    const el = document.querySelector(`.column-title[data-column-id="${colId}"]`);
    if (!el) return;
    const col = columnsConfig.find(c => c.id === colId);
    if (!col) return;
    el.setAttribute('contenteditable', 'true');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finishEdit = () => {
        el.removeAttribute('contenteditable');
        const newTitle = el.textContent.trim();
        if (newTitle && newTitle !== col.title) {
            pushUndo();
            col.title = newTitle;
            saveColumnsConfig();
            showToast('✏️ Колонка переименована');
        } else {
            el.textContent = col.title;
        }
        renderBoard();
    };
    el.addEventListener('blur', finishEdit, { once: true });
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
        if (e.key === 'Escape') { el.textContent = col.title; el.blur(); }
    });
}

// ===== МОДАЛЬНЫЕ ОКНА =====
function openModal(columnId, cardId = null) {
    currentColumnId = columnId;
    editingCardId = cardId;
    editingColumnId = columnId;

    const overlay = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const submitBtn = document.getElementById('btnSubmit');

    if (cardId) {
        const card = boardData[columnId].find(c => c.id === cardId);
        if (!card) return;
        title.textContent = 'Редактировать карточку';
        submitBtn.textContent = 'Сохранить';
        document.getElementById('cardTitle').value = card.title;
        document.getElementById('cardDesc').value = card.desc || '';
        document.getElementById('cardPriority').value = card.priority;
        document.getElementById('cardLabel').value = card.label || '';
        document.getElementById('cardDueDate').value = card.dueDate || '';
        document.getElementById('cardProject').value = card.projectId || getCurrentProject().id;
        populateAssigneeSelect(document.getElementById('cardAssignee'), card.assigneeId || '');
    } else {
        title.textContent = 'Новая карточка';
        submitBtn.textContent = 'Создать';
        document.getElementById('cardTitle').value = '';
        document.getElementById('cardDesc').value = '';
        document.getElementById('cardPriority').value = 'medium';
        document.getElementById('cardLabel').value = '';
        document.getElementById('cardDueDate').value = '';
        document.getElementById('cardProject').value = getCurrentProject().id;
        populateAssigneeSelect(document.getElementById('cardAssignee'), '');
    }
    document.getElementById('assigneeAddRow').style.display = 'none';

    overlay.classList.add('active');
    setTimeout(() => document.getElementById('cardTitle').focus(), 100);
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('assigneeAddRow').style.display = 'none';
    document.getElementById('cardAssigneeNew').value = '';
    currentColumnId = null;
    editingCardId = null;
    editingColumnId = null;
}

function submitCard(e) {
    e.preventDefault();
    const title = document.getElementById('cardTitle').value.trim();
    const desc = document.getElementById('cardDesc').value.trim();
    const priority = document.getElementById('cardPriority').value;
    const label = document.getElementById('cardLabel').value;
    const dueDate = document.getElementById('cardDueDate').value;
    const projectId = document.getElementById('cardProject').value;
    const assigneeSelect = document.getElementById('cardAssignee');
    if (assigneeSelect.value === '__new__') {
        showToast('⚠️ Сначала добавьте сотрудника или выберите существующего');
        return;
    }
    const assigneeId = assigneeSelect.value;

    if (!title) {
        document.getElementById('cardTitle').style.borderColor = 'var(--danger)';
        document.getElementById('cardTitle').focus();
        setTimeout(() => document.getElementById('cardTitle').style.borderColor = '', 1500);
        return;
    }

    pushUndo();

    if (editingCardId) {
        const col = boardData[editingColumnId] || [];
        const card = col.find(c => c.id === editingCardId);
        if (card) {
            card.title = title;
            card.desc = desc;
            card.priority = priority;
            card.label = label;
            card.dueDate = dueDate;
            card.projectId = projectId;
            card.assigneeId = assigneeId;
            showToast(`✏️ «${title.slice(0, 30)}» обновлена`);
        }
    } else {
        if (!boardData[currentColumnId]) boardData[currentColumnId] = [];
        const newCard = { id: genId(), title, desc, priority, label, dueDate, projectId, assigneeId, createdAt: Date.now(), checklists: [] };
        boardData[currentColumnId].push(newCard);
        const col = columnsConfig.find(c => c.id === currentColumnId);
        showToast(`➕ Карточка добавлена в «${col ? col.title : 'колонку'}»`);
    }

    saveBoardData();
    closeModal();
    renderBoard();
}

function editCard(columnId, cardId) {
    openModal(columnId, cardId);
}

function copyCard(columnId, cardId) {
    const card = boardData[columnId].find(c => c.id === cardId);
    if (!card) return;

    pushUndo();
    const newCard = JSON.parse(JSON.stringify(card));
    newCard.id = genId();
    newCard.title = card.title + ' (копия)';
    newCard.createdAt = Date.now();

    if (!boardData[columnId]) boardData[columnId] = [];
    const index = boardData[columnId].findIndex(c => c.id === cardId);
    boardData[columnId].splice(index + 1, 0, newCard);

    saveBoardData();
    renderBoard();
    showToast(`📋 Карточка скопирована`);
}

// ===== ПРЕВЬЮ =====
function openPreview(columnId, cardId) {
    const card = boardData[columnId].find(c => c.id === cardId);
    if (!card) return;
    previewCardId = cardId;
    previewColumnId = columnId;

    const cardsInCol = boardData[columnId] || [];
    const cardIndex = cardsInCol.findIndex(c => c.id === cardId);

    document.getElementById('previewId').textContent = getCardNumber(columnId, cardIndex);
    document.getElementById('previewTitle').textContent = card.title;
    document.getElementById('previewDesc').textContent = card.desc || 'Нет описания';

    const dateInfo = formatDate(card.dueDate);
    const dateClass = dateInfo && dateInfo.overdue ? 'card-due overdue' : 'card-due';

    // Рендер чеклиста
    const checklists = card.checklists || [];
    let checklistHtml = '';
    if (checklists.length > 0) {
        const doneCount = checklists.filter(c => c.done).length;
        checklistHtml = `
            <div class="preview-checklist">
                <h4 style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:8px;">Чеклист (${doneCount}/${checklists.length})</h4>
                ${checklists.map((item, i) => `
                    <label class="checklist-item">
                        <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleChecklistItem('${columnId}','${cardId}',${i})">
                        <span class="${item.done ? 'checklist-done' : ''}">${escHtml(item.text)}</span>
                    </label>
                `).join('')}
            </div>
        `;
    }

    document.getElementById('previewMeta').innerHTML = `
        <div class="preview-meta-item">
            <span class="priority-tag ${getPriorityClass(card.priority)}">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                ${getPriorityLabel(card.priority)}
            </span>
        </div>
        ${card.label ? `<div class="preview-meta-item"><span class="label-tag ${getLabelClass(card.label)}">${getLabelName(card.label)}</span></div>` : ''}
        ${dateInfo ? `<div class="preview-meta-item"><span class="${dateClass}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${dateInfo.text}
        </span></div>` : ''}
        <div class="preview-meta-item" style="font-size:12px;color:var(--muted);">
            Создана: ${new Date(card.createdAt).toLocaleDateString('ru-RU')}
        </div>
        <div class="preview-meta-item" style="font-size:12px;color:var(--muted);">
            Колонка: ${columnsConfig.find(c => c.id === columnId)?.title || columnId}
        </div>
        ${card.projectId ? `<div class="preview-meta-item" style="font-size:12px;color:var(--muted);">
            Проект: ${getProjectNameById(card.projectId)}
        </div>` : ''}
        ${card.assigneeId ? `<div class="preview-meta-item" style="font-size:12px;color:var(--muted);">
            Сотрудник: ${getAssigneeNameById(card.assigneeId)}
        </div>` : ''}
        ${checklistHtml}
    `;

    document.getElementById('previewOverlay').classList.add('active');
}

function closePreview() {
    document.getElementById('previewOverlay').classList.remove('active');
    previewCardId = null;
    previewColumnId = null;
}

function toggleChecklistItem(columnId, cardId, itemIndex) {
    const card = boardData[columnId].find(c => c.id === cardId);
    if (!card || !card.checklists || !card.checklists[itemIndex]) return;

    pushUndo();
    card.checklists[itemIndex].done = !card.checklists[itemIndex].done;
    saveBoardData();
    openPreview(columnId, cardId);
    renderBoard();
}

// ===== ЧЕКЛИСТ =====
function openChecklistModal(columnId, cardId) {
    const card = boardData[columnId].find(c => c.id === cardId);
    if (!card) return;

    const items = card.checklists || [];
    const itemsHtml = items.map((item, i) => `
        <div class="checklist-edit-item">
            <input type="checkbox" ${item.done ? 'checked' : ''} disabled>
            <input type="text" value="${escHtml(item.text)}" data-index="${i}" class="checklist-edit-input">
            <button onclick="removeChecklistEditItem(${i})" class="checklist-remove-btn">✕</button>
        </div>
    `).join('');

    const overlay = document.getElementById('checklistOverlay');
    document.getElementById('checklistItems').innerHTML = itemsHtml;
    document.getElementById('checklistNewInput').value = '';
    overlay.classList.add('active');
    overlay.dataset.columnId = columnId;
    overlay.dataset.cardId = cardId;
    setTimeout(() => document.getElementById('checklistNewInput').focus(), 100);
}

function closeChecklistModal() {
    document.getElementById('checklistOverlay').classList.remove('active');
}

function addChecklistItem() {
    const input = document.getElementById('checklistNewInput');
    const text = input.value.trim();
    if (!text) return;

    const overlay = document.getElementById('checklistOverlay');
    const columnId = overlay.dataset.columnId;
    const cardId = overlay.dataset.cardId;
    const card = boardData[columnId].find(c => c.id === cardId);
    if (!card) return;

    pushUndo();
    if (!card.checklists) card.checklists = [];
    card.checklists.push({ text, done: false });

    input.value = '';
    openChecklistModal(columnId, cardId);
}

function removeChecklistEditItem(index) {
    const overlay = document.getElementById('checklistOverlay');
    const columnId = overlay.dataset.columnId;
    const cardId = overlay.dataset.cardId;
    const card = boardData[columnId].find(c => c.id === cardId);
    if (!card || !card.checklists) return;

    pushUndo();
    card.checklists.splice(index, 1);
    openChecklistModal(columnId, cardId);
}

function saveChecklist() {
    const overlay = document.getElementById('checklistOverlay');
    const columnId = overlay.dataset.columnId;
    const cardId = overlay.dataset.cardId;
    const card = boardData[columnId].find(c => c.id === cardId);
    if (!card) return;

    pushUndo();

    // Обновить тексты из инпутов
    const inputs = document.querySelectorAll('.checklist-edit-input');
    inputs.forEach(input => {
        const index = parseInt(input.dataset.index);
        if (card.checklists[index]) {
            card.checklists[index].text = input.value.trim() || card.checklists[index].text;
        }
    });

    saveBoardData();
    closeChecklistModal();
    renderBoard();
    showToast('✅ Чеклист сохранён');
}

// ===== УДАЛЕНИЕ =====
function confirmDelete(columnId, cardId) {
    const card = boardData[columnId].find(c => c.id === cardId);
    if (!card) return;

    deleteConfirmCallback = () => {
        pushUndo();
        const cards = boardData[columnId];
        const index = cards.findIndex(c => c.id === cardId);
        if (index === -1) return;

        const el = document.querySelector(`[data-card-id="${cardId}"]`);
        if (el) {
            el.style.transition = 'all 0.25s ease';
            el.style.opacity = '0';
            el.style.transform = 'scale(0.9) translateX(20px)';
            setTimeout(() => {
                cards.splice(index, 1);
                saveBoardData();
                renderBoard();
            }, 250);
        } else {
            cards.splice(index, 1);
            saveBoardData();
            renderBoard();
        }

        showToast(`🗑️ «${card.title.slice(0, 30)}» удалена`, true);
        closeConfirmModal();
    };

    document.getElementById('confirmOverlay').classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirmOverlay').classList.remove('active');
    deleteConfirmCallback = null;
}

// ===== КОЛОНКИ =====
function addColumn() {
    pushUndo();
    const newId = getColumnId();
    const colors = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#264653'];
    const color = colors[columnsConfig.length % colors.length];

    columnsConfig.push({
        id: newId, title: 'Новая колонка', color, icon: 'inbox', collapsed: false, wipLimit: 0,
    });
    boardData[newId] = [];

    saveColumnsConfig();
    saveBoardData();
    renderBoard();

    setTimeout(() => startColumnEdit(newId), 100);
    showToast('➕ Колонка добавлена');
}

function deleteColumn(colId) {
    const cards = boardData[colId] || [];
    const col = columnsConfig.find(c => c.id === colId);

    if (cards.length > 0) {
        if (!confirm(`Удалить колонку «${col.title}» с ${cards.length} карточками?`)) return;
    }

    pushUndo();
    columnsConfig = columnsConfig.filter(c => c.id !== colId);
    delete boardData[colId];
    selectedCards.forEach(id => {
        if (!Object.values(boardData).some(arr => arr.some(c => c.id === id))) {
            selectedCards.delete(id);
        }
    });

    saveColumnsConfig();
    saveBoardData();
    renderBoard();
    showToast(`🗑️ Колонка «${col.title}» удалена`);
}

function toggleCollapse(colId) {
    const col = columnsConfig.find(c => c.id === colId);
    if (col) {
        col.collapsed = !col.collapsed;
        saveColumnsConfig();
        renderBoard();
    }
}

// ===== WIP ЛИМИТ =====
function openWipModal(colId) {
    wipColumnId = colId;
    const col = columnsConfig.find(c => c.id === colId);
    document.getElementById('wipLimit').value = col.wipLimit || 0;
    document.getElementById('wipOverlay').classList.add('active');
    setTimeout(() => document.getElementById('wipLimit').focus(), 100);
}

function closeWipModal() {
    document.getElementById('wipOverlay').classList.remove('active');
    wipColumnId = null;
}

function saveWipLimit() {
    const limit = parseInt(document.getElementById('wipLimit').value) || 0;
    const col = columnsConfig.find(c => c.id === wipColumnId);
    if (col) {
        pushUndo();
        col.wipLimit = Math.max(0, limit);
        saveColumnsConfig();
        renderBoard();
        showToast(`🛡️ Лимит: ${limit || 'без лимита'}`);
    }
    closeWipModal();
}

// ===== МУЛЬТИВЫБОР =====
function toggleCardSelection(cardId) {
    if (selectedCards.has(cardId)) {
        selectedCards.delete(cardId);
    } else {
        selectedCards.add(cardId);
    }
    renderBoard();
}

function updateMultiSelectBar() {
    const bar = document.getElementById('multiSelectBar');
    const count = selectedCards.size;
    if (count > 0) {
        bar.classList.add('visible');
        document.getElementById('selectCount').textContent = `${count} выбрано`;
    } else {
        bar.classList.remove('visible');
    }
}

function clearSelection() {
    selectedCards.clear();
    renderBoard();
}

function deleteSelected() {
    if (!selectedCards.size) return;
    if (!confirm(`Удалить ${selectedCards.size} карточек?`)) return;

    pushUndo();
    for (const colId in boardData) {
        boardData[colId] = boardData[colId].filter(c => !selectedCards.has(c.id));
    }
    selectedCards.clear();
    saveBoardData();
    renderBoard();
    showToast('🗑️ Выбранные карточки удалены');
}

// ===== МОДАЛКА ПЕРЕМЕЩЕНИЯ =====
function openMoveModal() {
    if (!selectedCards.size) return;

    const overlay = document.getElementById('moveOverlay');
    const select = document.getElementById('moveTargetColumn');
    select.innerHTML = columnsConfig.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
    overlay.classList.add('active');
}

function closeMoveModal() {
    document.getElementById('moveOverlay').classList.remove('active');
}

function confirmMoveSelected() {
    const targetId = document.getElementById('moveTargetColumn').value;
    if (!targetId) return;

    pushUndo();
    const cardsToMove = [];

    for (const colId in boardData) {
        const remaining = [];
        for (const card of boardData[colId]) {
            if (selectedCards.has(card.id)) {
                cardsToMove.push(card);
            } else {
                remaining.push(card);
            }
        }
        boardData[colId] = remaining;
    }

    if (!boardData[targetId]) boardData[targetId] = [];
    boardData[targetId].push(...cardsToMove);

    const colTitle = columnsConfig.find(c => c.id === targetId)?.title;
    selectedCards.clear();
    saveBoardData();
    renderBoard();
    closeMoveModal();
    showToast(`→ ${cardsToMove.length} карточек → ${colTitle}`);
}

// ===== СБРОС =====
function resetBoard() {
    if (!confirm('Сбросить доску к начальному состоянию?')) return;
    pushUndo();
    boardData = JSON.parse(JSON.stringify(DEFAULT_CARDS));
    columnsConfig = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
    const currentProj = getCurrentProject();
    for (const colId in boardData) {
        boardData[colId].forEach(c => {
            c.id = genId();
            c.createdAt = Date.now();
            c.checklists = c.checklists || [];
            c.projectId = currentProj ? currentProj.id : '';
            c.assigneeId = '';
        });
    }
    selectedCards.clear();
    saveBoardData();
    saveColumnsConfig();
    renderBoard();
    showToast('🔄 Доска сброшена');
}

// ===== СОРТИРОВКА =====
function sortBy(field) {
    pushUndo();
    const order = { high: 0, medium: 1, low: 2 };
    for (const colId in boardData) {
        boardData[colId].sort((a, b) => {
            if (field === 'priority') {
                const d = order[a.priority] - order[b.priority];
                return d !== 0 ? d : a.title.localeCompare(b.title, 'ru');
            }
            if (field === 'date') {
                if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title, 'ru');
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                const d = a.dueDate.localeCompare(b.dueDate);
                return d !== 0 ? d : a.title.localeCompare(b.title, 'ru');
            }
            if (field === 'name') return a.title.localeCompare(b.title, 'ru');
            return 0;
        });
    }
    saveBoardData();
    renderBoard();
    document.getElementById('sortOverlay').classList.remove('active');
    showToast(`📊 Сортировка: ${field === 'priority' ? 'по приоритету' : field === 'date' ? 'по дате' : 'по имени'}`);
}

// ===== ЭКСПОРТ/ИМПОРТ =====
function exportData() {
    const projects = loadProjects() || [];
    const boards = {};
    const assignees = {};
    for (const p of projects) {
        try {
            const bd = localStorage.getItem('taskBoardData_' + p.id);
            const cc = localStorage.getItem('taskBoardColumns_' + p.id);
            const asm = localStorage.getItem('taskBoardAssignees_' + p.id);
            boards[p.id] = {
                boardData: bd ? JSON.parse(bd) : {},
                columnsConfig: cc ? JSON.parse(cc) : []
            };
            assignees[p.id] = asm ? JSON.parse(asm) : [];
        } catch {}
    }
    const data = { projects, boards, assignees };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-board-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 Данные экспортированы');
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (typeof data !== 'object' || data === null) {
                showToast('⚠️ Неверный формат файла');
                return;
            }

            // Новый формат: { projects, boards, assignees }
            if (data.projects && data.boards) {
                const importedProjects = data.projects;
                const boards = data.boards;
                const importedAssignees = data.assignees || {};
                if (!Array.isArray(importedProjects)) {
                    showToast('⚠️ Неверная структура: projects должен быть массивом');
                    return;
                }

                const existingProjects = loadProjects() || [];
                const merged = [...existingProjects];

                for (const proj of importedProjects) {
                    if (!proj.id || !proj.name) continue;
                    const existing = merged.find(p => p.id === proj.id);
                    if (!existing) merged.push(proj);

                    const board = boards[proj.id];
                    if (board && board.boardData && board.columnsConfig) {
                        for (const colId in board.boardData) {
                            if (!Array.isArray(board.boardData[colId])) continue;
                            board.boardData[colId].forEach(c => {
                                if (!c.checklists) c.checklists = [];
                                if (!c.id) c.id = genId();
                                if (!c.title) c.title = 'Без названия';
                                if (!c.projectId) c.projectId = proj.id;
                                if (!c.assigneeId) c.assigneeId = '';
                            });
                        }
                        localStorage.setItem('taskBoardData_' + proj.id, JSON.stringify(board.boardData));
                        localStorage.setItem('taskBoardColumns_' + proj.id, JSON.stringify(board.columnsConfig));
                    }

                    if (importedAssignees[proj.id] && Array.isArray(importedAssignees[proj.id])) {
                        try { localStorage.setItem('taskBoardAssignees_' + proj.id, JSON.stringify(importedAssignees[proj.id])); } catch {}
                    }
                }

                saveProjects(merged);
                if (!loadCurrentProjectId() || !merged.find(p => p.id === loadCurrentProjectId())) {
                    switchProject(merged[0].id);
                } else {
                    columnsConfig = loadColumnsConfig();
                    boardData = loadBoardData();
                    renderBoard();
                    renderProjectSelector();
                }
                const totalCards = merged.reduce((sum, p) => sum + getProjectCardCount(p.id), 0);
                showToast(`📤 Импортировано: ${importedProjects.length} проектов, ${totalCards} карточек`);
                return;
            }

            // Старый формат: { boardData, columnsConfig } — импорт в текущий проект
            if (data.boardData && data.columnsConfig) {
                if (!Array.isArray(data.columnsConfig)) {
                    showToast('⚠️ Неверная структура: columnsConfig должен быть массивом');
                    return;
                }
                for (const col of data.columnsConfig) {
                    if (!col.id || !col.title) {
                        showToast('⚠️ Неверная структура: колонка должна иметь id и title');
                        return;
                    }
                }
                if (typeof data.boardData !== 'object') {
                    showToast('⚠️ Неверная структура: boardData должен быть объектом');
                    return;
                }

                pushUndo();
                boardData = data.boardData;
                columnsConfig = data.columnsConfig;
            } else if (typeof data === 'object' && !data.boardData) {
                pushUndo();
                boardData = data;
                columnsConfig = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
            } else {
                showToast('⚠️ Неверный формат файла');
                return;
            }

            for (const colId in boardData) {
                if (!Array.isArray(boardData[colId])) {
                    showToast('⚠️ Неверная структура данных');
                    return;
                }
                boardData[colId].forEach(c => {
                    if (!c.checklists) c.checklists = [];
                    if (!c.id) c.id = genId();
                    if (!c.title) c.title = 'Без названия';
                    if (!c.projectId) c.projectId = getCurrentProject().id;
                    if (!c.assigneeId) c.assigneeId = '';
                });
            }

            saveBoardData();
            saveColumnsConfig();
            renderBoard();
            showToast(`📤 Импортировано: ${Object.values(boardData).flat().length} карточек`);
        } catch (err) {
            console.error('Ошибка импорта:', err);
            showToast('⚠️ Ошибка чтения файла: неверный JSON');
        }
    };
    reader.readAsText(file);
}

// ===== ПОИСК (DEBOUNCE) =====
function handleSearch(e) {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        searchQuery = e.target.value.trim();
        renderBoard();
    }, 200);
}

// ===== ТОСТЫ =====
function showToast(message, undoable = false) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${undoable ? 'undo-toast' : ''}`;

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    if (undoable) {
        const undoBtn = document.createElement('button');
        undoBtn.className = 'toast-undo-btn';
        undoBtn.textContent = 'Отменить';
        undoBtn.onclick = (e) => { e.stopPropagation(); undo(); toast.remove(); };
        toast.appendChild(undoBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close-btn';
    closeBtn.innerHTML = '✕';
    closeBtn.onclick = () => toast.remove();
    toast.appendChild(closeBtn);

    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
}

// ===== НАВИГАЦИЯ СТРЕЛКАМИ =====
function getAllVisibleCards() {
    const cards = [];
    columnsConfig.forEach(col => {
        if (col.collapsed) return;
        const filtered = getFilteredCards(col.id);
        filtered.forEach(card => cards.push({ card, columnId: col.id }));
    });
    return cards;
}

// Перемещение карточки между колонками (Ctrl+↑↓)
function moveCardUpDown(colId, cardId, direction) {
    const colIndex = columnsConfig.findIndex(c => c.id === colId);
    if (colIndex === -1) return;

    const targetIndex = direction === 'up' ? colIndex - 1 : colIndex + 1;
    if (targetIndex < 0 || targetIndex >= columnsConfig.length) return;

    const targetColId = columnsConfig[targetIndex].id;
    const srcCards = boardData[colId] || [];
    const cardIndex = srcCards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    pushUndo();
    const [card] = srcCards.splice(cardIndex, 1);
    if (!boardData[targetColId]) boardData[targetColId] = [];
    boardData[targetColId].push(card);

    focusedColumnId = targetColId;
    saveBoardData();
    renderBoard();

    const tgtCol = columnsConfig.find(c => c.id === targetColId);
    showToast(`→ «${card.title.slice(0, 20)}» → ${tgtCol.title}`, true);
}

function navigateCards(direction) {
    const allCards = getAllVisibleCards();
    if (!allCards.length) return;

    let currentIndex = allCards.findIndex(c => c.card.id === focusedCardId);
    if (currentIndex === -1) currentIndex = 0;

    if (direction === 'up') {
        currentIndex = Math.max(0, currentIndex - 1);
    } else if (direction === 'down') {
        currentIndex = Math.min(allCards.length - 1, currentIndex + 1);
    } else if (direction === 'left' || direction === 'right') {
        // Перейти в соседнюю колонку
        const currentColIndex = columnsConfig.findIndex(c => c.id === focusedColumnId);
        const targetColIndex = direction === 'left' ? Math.max(0, currentColIndex - 1) : Math.min(columnsConfig.length - 1, currentColIndex + 1);
        const targetCol = columnsConfig[targetColIndex];
        const targetCards = getFilteredCards(targetCol.id);
        if (targetCards.length > 0) {
            focusedCardId = targetCards[0].id;
            focusedColumnId = targetCol.id;
            renderBoard();
            scrollToFocused();
            return;
        }
    }

    const { card, columnId } = allCards[currentIndex];
    focusedCardId = card.id;
    focusedColumnId = columnId;
    renderBoard();
    scrollToFocused();
}

function scrollToFocused() {
    const el = document.querySelector(`.card.focused`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===== РЕНДЕР ПРОЕКТОВ =====
function renderProjectSelector() {
    const projects = loadProjects() || [];
    const current = getCurrentProject();
    const container = document.getElementById('projectList');
    if (!container) return;

    container.innerHTML = projects.map(p => `
        <div class="project-item ${p.id === current.id ? 'active' : ''}" data-project-id="${p.id}">
            <div class="project-color" style="background:${p.color}"></div>
            <span class="project-name">${escHtml(p.name)}</span>
            <span class="project-count">${getProjectCardCount(p.id)}</span>
            <button class="project-edit-btn" data-project-id="${p.id}" data-project-name="${escHtml(p.name)}" data-project-color="${p.color}" title="Редактировать">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
        </div>
    `).join('');

    // Обновить заголовок
    const titleEl = document.getElementById('currentProjectName');
    if (titleEl && current) titleEl.textContent = current.name;

    const dotEl = document.getElementById('currentProjectDot');
    if (dotEl && current) dotEl.style.background = current.color;

    // Обновить селект проекта в форме карточки
    const selectEl = document.getElementById('cardProject');
    if (selectEl) {
        selectEl.innerHTML = projects.map(p =>
            `<option value="${p.id}" ${p.id === current.id ? 'selected' : ''}>${escHtml(p.name)}</option>`
        ).join('');
    }

    // Обновить фильтр проектов
    const filterEl = document.getElementById('filterProject');
    if (filterEl) {
        filterEl.innerHTML = '<option value="">Все</option>' +
            projects.map(p => `<option value="${p.id}" ${p.id === current.id ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('');
    }

    // Обновить фильтр сотрудников
    populateAssigneeFilter();
}

function getProjectCardCount(projectId) {
    try {
        const data = localStorage.getItem('taskBoardData_' + projectId);
        if (!data) return 0;
        const parsed = JSON.parse(data);
        return Object.values(parsed).flat().length;
    } catch { return 0; }
}

function toggleProjectDropdown() {
    const dropdown = document.getElementById('projectDropdown');
    if (dropdown) dropdown.classList.toggle('visible');
}

function openProjectEdit(projectId, name, color) {
    document.getElementById('projectManageOverlay').classList.add('active');
    document.getElementById('projectManageTitle').textContent = 'Редактировать проект';
    document.getElementById('projectNameInput').value = name;
    document.getElementById('projectColorInput').value = color;
    document.getElementById('projectManageOverlay').dataset.editId = projectId;
    document.getElementById('projectDeleteBtn').style.display = 'inline-flex';
}

function openProjectCreate() {
    document.getElementById('projectManageOverlay').classList.add('active');
    document.getElementById('projectManageTitle').textContent = 'Новый проект';
    document.getElementById('projectNameInput').value = '';
    document.getElementById('projectColorInput').value = '#4361ee';
    document.getElementById('projectManageOverlay').dataset.editId = '';
    document.getElementById('projectDeleteBtn').style.display = 'none';
    setTimeout(() => document.getElementById('projectNameInput').focus(), 100);
}

function closeProjectManage() {
    document.getElementById('projectManageOverlay').classList.remove('active');
}

function saveProject() {
    const overlay = document.getElementById('projectManageOverlay');
    const editId = overlay.dataset.editId;
    const name = document.getElementById('projectNameInput').value.trim();
    const color = document.getElementById('projectColorInput').value;

    if (!name) {
        document.getElementById('projectNameInput').style.borderColor = 'var(--danger)';
        document.getElementById('projectNameInput').focus();
        setTimeout(() => document.getElementById('projectNameInput').style.borderColor = '', 1500);
        return;
    }

    if (editId) {
        renameProject(editId, name);
        const projects = loadProjects() || [];
        const project = projects.find(p => p.id === editId);
        if (project) { project.color = color; saveProjects(projects); }
        if (getCurrentProject().id === editId) renderProjectSelector();
        showToast(`✏️ Проект «${name}» обновлён`);
    } else {
        const newProject = createProject(name, color);
        switchProject(newProject.id);
        showToast(`➕ Проект «${name}» создан`);
    }

    closeProjectManage();
    renderProjectSelector();
}

function deleteCurrentProject() {
    const overlay = document.getElementById('projectManageOverlay');
    const editId = overlay.dataset.editId;
    if (!editId) return;

    const projects = loadProjects() || [];
    const project = projects.find(p => p.id === editId);
    if (!project) return;

    if (!confirm(`Удалить проект «${project.name}» со всеми карточками?`)) return;

    if (deleteProject(editId)) {
        closeProjectManage();
        renderProjectSelector();
        showToast(`🗑️ Проект «${project.name}» удалён`);
    }
}

function handleProjectClick(e) {
    const editBtn = e.target.closest('.project-edit-btn');
    if (editBtn) {
        e.stopPropagation();
        openProjectEdit(editBtn.dataset.projectId, editBtn.dataset.projectName, editBtn.dataset.projectColor);
        return;
    }
    const item = e.target.closest('.project-item');
    if (!item) return;
    const projectId = item.dataset.projectId;
    if (projectId && projectId !== getCurrentProject().id) {
        switchProject(projectId);
        document.getElementById('projectDropdown').classList.remove('visible');
    }
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', () => {
    // Миграция проектов (до загрузки данных)
    migrateOldData();
    const currentProject = getCurrentProject();
    if (currentProject) {
        columnsConfig = loadColumnsConfig();
        boardData = loadBoardData();
    }

    setTheme(loadTheme());
    if (loadCompact()) {
        document.body.classList.add('compact');
        document.getElementById('btnCompact').classList.add('active');
    }

    // Миграция: добавить checklists и projectId если нет
    const currentProj = getCurrentProject();
    for (const colId in boardData) {
        boardData[colId].forEach(c => {
            if (!c.checklists) c.checklists = [];
            if (!c.projectId && currentProj) c.projectId = currentProj.id;
            if (!c.assigneeId) c.assigneeId = '';
        });
    }

    renderBoard();
    updateUndoRedoButtons();
    renderProjectSelector();

    // Форма карточки
    document.getElementById('cardForm').addEventListener('submit', submitCard);
    document.getElementById('btnCancel').addEventListener('click', closeModal);

    // Сотрудники: select + добавление
    document.getElementById('cardAssignee').addEventListener('change', (e) => {
        if (e.target.value === '__new__') {
            document.getElementById('assigneeAddRow').style.display = 'flex';
            document.getElementById('cardAssigneeNew').focus();
        } else {
            document.getElementById('assigneeAddRow').style.display = 'none';
        }
    });
    document.getElementById('btnAddAssignee').addEventListener('click', () => {
        const input = document.getElementById('cardAssigneeNew');
        const name = input.value.trim();
        if (!name) return;
        const assignees = loadAssignees();
        if (assignees.some(a => a.name.toLowerCase() === name.toLowerCase())) {
            showToast('⚠️ Такой сотрудник уже есть');
            return;
        }
        const newAssignee = { id: genAssigneeId(), name, createdAt: Date.now() };
        assignees.push(newAssignee);
        saveAssignees(assignees);
        populateAssigneeSelect(document.getElementById('cardAssignee'), newAssignee.id);
        document.getElementById('assigneeAddRow').style.display = 'none';
        input.value = '';
        populateAssigneeFilter();
        showToast(`✅ Сотрудник «${name}» добавлен`);
    });
    document.getElementById('cardAssigneeNew').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btnAddAssignee').click(); }
    });

    // Оверлеи
    document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
    document.getElementById('previewOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closePreview(); });
    document.getElementById('confirmOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeConfirmModal(); });
    document.getElementById('wipOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeWipModal(); });
    document.getElementById('moveOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeMoveModal(); });
    document.getElementById('checklistOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeChecklistModal(); });

    // Превью
    document.getElementById('previewClose').addEventListener('click', closePreview);
    document.getElementById('previewEdit').addEventListener('click', () => {
        const colId = previewColumnId;
        const cardId = previewCardId;
        closePreview();
        if (colId && cardId) openModal(colId, cardId);
    });

    // Удаление
    document.getElementById('confirmDelete').addEventListener('click', () => { if (deleteConfirmCallback) deleteConfirmCallback(); });
    document.getElementById('confirmCancel').addEventListener('click', closeConfirmModal);

    // WIP
    document.getElementById('wipSave').addEventListener('click', saveWipLimit);
    document.getElementById('wipCancel').addEventListener('click', closeWipModal);

    // Перемещение
    document.getElementById('moveConfirm').addEventListener('click', confirmMoveSelected);
    document.getElementById('moveCancel').addEventListener('click', closeMoveModal);

    // Чеклист
    document.getElementById('checklistSave').addEventListener('click', saveChecklist);
    document.getElementById('checklistCancel').addEventListener('click', closeChecklistModal);
    document.getElementById('checklistAdd').addEventListener('click', addChecklistItem);
    document.getElementById('checklistNewInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); }
    });

    // Кнопки хедера
    document.getElementById('btnTheme').addEventListener('click', toggleTheme);
    document.getElementById('btnFilter').addEventListener('click', () => {
        document.getElementById('filterBar').classList.toggle('visible');
        document.getElementById('btnFilter').classList.toggle('active');
    });
    document.getElementById('btnCompact').addEventListener('click', toggleCompact);
    document.getElementById('btnReset').addEventListener('click', resetBoard);
    document.getElementById('btnSort').addEventListener('click', () => {
        const sortOverlay = document.getElementById('sortOverlay');
        sortOverlay.classList.toggle('active');
    });
    document.getElementById('btnUndo').addEventListener('click', () => { undo(); updateUndoRedoButtons(); });
    document.getElementById('btnRedo').addEventListener('click', () => { redo(); updateUndoRedoButtons(); });
    document.getElementById('btnExport').addEventListener('click', exportData);
    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', (e) => {
        if (e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
    });

    // Сортировка
    document.getElementById('sortOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.target.classList.remove('active'); });

    // Фильтры
    document.getElementById('filterProject').addEventListener('change', (e) => { filters.project = e.target.value; renderBoard(); });
    document.getElementById('filterPriority').addEventListener('change', (e) => { filters.priority = e.target.value; renderBoard(); });
    document.getElementById('filterLabel').addEventListener('change', (e) => { filters.label = e.target.value; renderBoard(); });
    document.getElementById('filterDue').addEventListener('change', (e) => { filters.due = e.target.value; renderBoard(); });
    document.getElementById('filterAssignee').addEventListener('change', (e) => { filters.assignee = e.target.value; renderBoard(); });
    document.getElementById('filterClear').addEventListener('click', () => {
        filters = { project: '', priority: '', label: '', due: '', assignee: '' };
        document.getElementById('filterProject').value = '';
        document.getElementById('filterPriority').value = '';
        document.getElementById('filterLabel').value = '';
        document.getElementById('filterDue').value = '';
        document.getElementById('filterAssignee').value = '';
        renderBoard();
    });

    // Мультивыбор
    document.getElementById('selectDelete').addEventListener('click', deleteSelected);
    document.getElementById('selectMove').addEventListener('click', openMoveModal);
    document.getElementById('selectClear').addEventListener('click', clearSelection);

    // Проекты
    document.getElementById('projectSelectorBtn').addEventListener('click', toggleProjectDropdown);
    document.getElementById('projectList').addEventListener('click', handleProjectClick);
    document.getElementById('projectCreateBtn').addEventListener('click', () => {
        document.getElementById('projectDropdown').classList.remove('visible');
        openProjectCreate();
    });
    document.getElementById('projectManageOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeProjectManage(); });
    document.getElementById('projectSaveBtn').addEventListener('click', saveProject);
    document.getElementById('projectCancelBtn').addEventListener('click', closeProjectManage);
    document.getElementById('projectDeleteBtn').addEventListener('click', deleteCurrentProject);
    document.getElementById('projectNameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveProject(); } });

    // Цветовые пресеты
    document.querySelectorAll('.color-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('projectColorInput').value = btn.dataset.color;
        });
    });

    // Закрытие дропдауна при клике вне
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('projectDropdown');
        const btn = document.getElementById('projectSelectorBtn');
        if (dropdown && dropdown.classList.contains('visible') && !dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('visible');
        }
    });

    // Поиск
    document.getElementById('searchInput').addEventListener('input', handleSearch);

    // Клик по карточке — превью или мультивыбор
    let clickTimer = null;
    let lastDblClickTime = 0;
    let lastSelectedCardId = null;
    document.getElementById('board').addEventListener('click', (e) => {
        const card = e.target.closest('.card');
        if (!card) return;
        if (e.target.closest('.btn-card-action')) return;
        if (e.target.closest('a, button, input, select, textarea')) return;

        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleCardSelection(card.dataset.cardId);
            lastSelectedCardId = card.dataset.cardId;
            return;
        }

        if (e.shiftKey) {
            e.preventDefault();
            if (lastSelectedCardId) {
                const allCards = getAllVisibleCards();
                const ids = allCards.map(c => c.card.id);
                const startIdx = ids.indexOf(lastSelectedCardId);
                const endIdx = ids.indexOf(card.dataset.cardId);
                if (startIdx !== -1 && endIdx !== -1) {
                    const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
                    for (let i = from; i <= to; i++) selectedCards.add(ids[i]);
                    renderBoard();
                    updateMultiSelectBar();
                    return;
                }
            }
            toggleCardSelection(card.dataset.cardId);
            lastSelectedCardId = card.dataset.cardId;
            return;
        }

        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
            if (Date.now() - lastDblClickTime < 300) return;
            openPreview(card.dataset.columnId, card.dataset.cardId);
        }, 250);
    });

    // Очистка column-drag-over при выходе за пределы доски
    document.getElementById('board').addEventListener('dragleave', (e) => {
        if (!e.relatedTarget || !document.getElementById('board').contains(e.relatedTarget)) {
            document.querySelectorAll('.column.column-drag-over').forEach(el => el.classList.remove('column-drag-over'));
            document.querySelectorAll('.column-drop-indicator').forEach(el => el.remove());
        }
    });

    // Двойной клик — inline редактирование
    document.getElementById('board').addEventListener('dblclick', (e) => {
        clearTimeout(clickTimer);
        lastDblClickTime = Date.now();

        const titleEl = e.target.closest('.card-title');
        if (titleEl) {
            e.preventDefault();
            const cardId = titleEl.dataset.cardId;
            const colId = titleEl.dataset.columnId;
            const card = boardData[colId].find(c => c.id === cardId);
            if (!card) return;

            titleEl.setAttribute('contenteditable', 'true');
            titleEl.focus();
            const range = document.createRange();
            range.selectNodeContents(titleEl);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            const finishEdit = () => {
                titleEl.removeAttribute('contenteditable');
                const newTitle = titleEl.textContent.trim();
                if (newTitle && newTitle !== card.title) {
                    pushUndo();
                    card.title = newTitle;
                    saveBoardData();
                    showToast(`✏️ Заголовок обновлён`);
                }
                renderBoard();
            };

            titleEl.addEventListener('blur', finishEdit, { once: true });
            titleEl.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); titleEl.blur(); }
                if (ev.key === 'Escape') { titleEl.textContent = card.title; titleEl.blur(); }
            });
            return;
        }

        const colTitleEl = e.target.closest('.column-title');
        if (colTitleEl) {
            e.preventDefault();
            startColumnEdit(colTitleEl.dataset.columnId);
        }
    });

    // Правый клик — контекстное меню
    document.getElementById('board').addEventListener('contextmenu', (e) => {
        const card = e.target.closest('.card');
        if (!card) return;
        e.preventDefault();

        const colId = card.dataset.columnId;
        const cardId = card.dataset.cardId;

        // Удаляем старое меню если есть
        document.querySelectorAll('.context-menu').forEach(m => m.remove());

        const menu = document.createElement('div');
        menu.className = 'context-menu';

        menu.innerHTML = `
            <button onclick="openPreview('${colId}','${cardId}');this.parentElement.remove()">👁 Просмотр</button>
            <button onclick="editCard('${colId}','${cardId}');this.parentElement.remove()">✏️ Редактировать</button>
            <button onclick="copyCard('${colId}','${cardId}');this.parentElement.remove()">📋 Копировать</button>
            <button onclick="openChecklistModal('${colId}','${cardId}');this.parentElement.remove()">✅ Чеклист</button>
            <div class="context-divider"></div>
            <button onclick="confirmDelete('${colId}','${cardId}');this.parentElement.remove()" class="context-danger">🗑 Удалить</button>
        `;

        document.body.appendChild(menu);

        // Позиционирование с учётом границ экрана
        const menuRect = menu.getBoundingClientRect();
        let x = e.clientX;
        let y = e.clientY;

        if (x + menuRect.width > window.innerWidth - 8) {
            x = window.innerWidth - menuRect.width - 8;
        }
        if (y + menuRect.height > window.innerHeight - 8) {
            y = window.innerHeight - menuRect.height - 8;
        }
        if (x < 8) x = 8;
        if (y < 8) y = 8;

        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 10);
    });

    // Горячие клавиши
    document.addEventListener('keydown', (e) => {
        const isModalOpen = document.getElementById('modalOverlay').classList.contains('active');
        const isPreviewOpen = document.getElementById('previewOverlay').classList.contains('active');
        const isConfirmOpen = document.getElementById('confirmOverlay').classList.contains('active');
        const isWipOpen = document.getElementById('wipOverlay').classList.contains('active');
        const isMoveOpen = document.getElementById('moveOverlay').classList.contains('active');
        const isChecklistOpen = document.getElementById('checklistOverlay').classList.contains('active');
        const isSortOpen = document.getElementById('sortOverlay').classList.contains('active');
        const isProjectManageOpen = document.getElementById('projectManageOverlay').classList.contains('active');
        const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
        const isEditing = document.activeElement.getAttribute('contenteditable') === 'true';

        if (e.key === 'Escape') {
            if (isModalOpen) closeModal();
            if (isPreviewOpen) closePreview();
            if (isConfirmOpen) closeConfirmModal();
            if (isWipOpen) closeWipModal();
            if (isMoveOpen) closeMoveModal();
            if (isChecklistOpen) closeChecklistModal();
            if (isSortOpen) document.getElementById('sortOverlay').classList.remove('active');
            if (isProjectManageOpen) closeProjectManage();
            if (selectedCards.size) clearSelection();
            document.querySelectorAll('.context-menu').forEach(m => m.remove());
            document.getElementById('projectDropdown').classList.remove('visible');
            return;
        }

        if (isModalOpen || isPreviewOpen || isConfirmOpen || isWipOpen || isMoveOpen || isChecklistOpen || isProjectManageOpen || isInput || isEditing) return;

        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); return; }

        // Ctrl+C — копировать карточку (только если не в инпуте)
        if ((e.ctrlKey || e.metaKey) && e.key === 'c' && focusedCardId && focusedColumnId && !isInput && !isEditing) {
            e.preventDefault();
            copyCard(focusedColumnId, focusedCardId);
            return;
        }

        if (e.key === 'n' || e.key === 'N') {
            e.preventDefault();
            openModal(focusedColumnId || 'backlog');
        }
        if (e.key === 't' || e.key === 'T') { toggleTheme(); }
        if (e.key === 'f' || e.key === 'F') {
            document.getElementById('filterBar').classList.toggle('visible');
            document.getElementById('btnFilter').classList.toggle('active');
        }
        if (e.key === 'c' || e.key === 'C') { toggleCompact(); }
        if (e.key === '?') {
            document.getElementById('shortcutsHint').classList.toggle('visible');
        }

        // Ctrl+↑↓ — перемещение карточки между колонками
        if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp' && focusedCardId && focusedColumnId) {
            e.preventDefault();
            moveCardUpDown(focusedColumnId, focusedCardId, 'up');
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown' && focusedCardId && focusedColumnId) {
            e.preventDefault();
            moveCardUpDown(focusedColumnId, focusedCardId, 'down');
            return;
        }

        // Стрелки — навигация
        if (e.key === 'ArrowUp' && !e.ctrlKey) { e.preventDefault(); navigateCards('up'); }
        if (e.key === 'ArrowDown' && !e.ctrlKey) { e.preventDefault(); navigateCards('down'); }
        if (e.key === 'ArrowLeft' && !e.ctrlKey) { e.preventDefault(); navigateCards('left'); }
        if (e.key === 'ArrowRight' && !e.ctrlKey) { e.preventDefault(); navigateCards('right'); }

        // Enter — открыть превью
        if (e.key === 'Enter' && focusedCardId && focusedColumnId) {
            e.preventDefault();
            openPreview(focusedColumnId, focusedCardId);
        }

        // Delete — удалить выбранную
        if (e.key === 'Delete' && focusedCardId && focusedColumnId) {
            e.preventDefault();
            confirmDelete(focusedColumnId, focusedCardId);
        }

        // Пробел — выделить
        if (e.key === ' ' && focusedCardId) {
            e.preventDefault();
            toggleCardSelection(focusedCardId);
        }
    });

    // Подсказка при первом запуске
    if (!localStorage.getItem('taskBoardHintShown')) {
        setTimeout(() => {
            document.getElementById('shortcutsHint').classList.add('visible');
            setTimeout(() => document.getElementById('shortcutsHint').classList.remove('visible'), 5000);
            localStorage.setItem('taskBoardHintShown', 'true');
        }, 1000);
    }
});
