// app.js - terminal UI wiring: rendering, input handling, theming, stats, editor overlay.

const ACCENTS = [
  { name: 'green', hex: '#33ff99' },
  { name: 'amber', hex: '#ffb454' },
  { name: 'cyan', hex: '#5ad8ff' },
  { name: 'magenta', hex: '#ff6ac1' },
  { name: 'blue', hex: '#6fa8ff' },
  { name: 'red', hex: '#ff6b6b' },
  { name: 'white', hex: '#e6e6e6' }
];
const ERROR_COLOR = '#ff5f56';
const GIT_SUBCOMMANDS = ['status', 'add', 'commit', 'branch', 'checkout', 'switch', 'merge', 'stash', 'reset', 'restore', 'revert', 'log', 'diff'];

let state = null;
let levelIndex = 0;
let hintTier = 0;
let cmdHistory = [];
let historyPos = -1;
let startTime = 0;
let timerHandle = null;
let editingFile = null;

const screenEl = document.getElementById('screen');
const inputEl = document.getElementById('cmdInput');
const promptLabelEl = document.getElementById('promptLabel');
const levelIndicatorEl = document.getElementById('levelIndicator');
const timerEl = document.getElementById('timer');
const objectiveBarEl = document.getElementById('objectiveBar');
const terminalEl = document.getElementById('terminal');
const editorOverlay = document.getElementById('editorOverlay');
const editorArea = document.getElementById('editorArea');
const editorFileEl = document.getElementById('editorFile');

// ---------- analytics ----------
// Fires a GA4 custom event if gtag is present. No-ops silently otherwise
// (ad blockers, offline testing, etc. should never break gameplay).
function track(name, params) {
  try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {}
}

// ---------- rendering ----------

function print(lines, cls) {
  if (!lines || !lines.length) return;
  for (const line of lines) {
    const div = document.createElement('div');
    div.className = 'line' + (cls ? ' ' + cls : '');
    div.textContent = line;
    screenEl.appendChild(div);
  }
  screenEl.scrollTop = screenEl.scrollHeight;
}

function printEcho(text) {
  const div = document.createElement('div');
  div.className = 'line echo';
  div.textContent = promptText() + ' ' + text;
  screenEl.appendChild(div);
  screenEl.scrollTop = screenEl.scrollHeight;
}

function promptText() {
  const branch = state && state.head ? state.head.name || 'HEAD' : 'main';
  return `~/commit-issues (${branch}) $`;
}

function updatePrompt() {
  promptLabelEl.textContent = promptText();
}

// ---------- tokenizer ----------

function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    while (input[i] === ' ') i++;
    if (i >= input.length) break;
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i]; i++;
      const start = i;
      while (i < input.length && input[i] !== quote) i++;
      tokens.push(input.slice(start, i));
      i++;
    } else {
      const start = i;
      while (i < input.length && input[i] !== ' ') i++;
      tokens.push(input.slice(start, i));
    }
  }
  return tokens;
}

// ---------- level flow ----------

function loadLevel(i) {
  levelIndex = i;
  const level = LEVELS[i];
  state = level.setup();
  hintTier = 0;
  startTime = Date.now();
  screenEl.innerHTML = '';
  levelIndicatorEl.textContent = `Level ${i + 1}/${LEVELS.length}`;
  if (i === 0) printFirstRunIntro();
  print([`# - ${level.title} -`], 'dim');
  print(level.objective, 'obj');
  objectiveBarEl.innerHTML = `<b>OBJECTIVE</b> &nbsp;${escapeHtml(flattenObjective(level.objective))}`;
  updatePrompt();
  restartTimer();
  track('level_started', { level_index: i + 1, level_title: level.title });
}

function flattenObjective(lines) {
  return lines.map(l => l.replace(/^#\s?/, '')).join('  ');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function printFirstRunIntro() {
  let seen = false;
  try { seen = localStorage.getItem('commitIssuesSeenIntro') === '1'; } catch (e) {}
  if (seen) return;
  print([
    "# welcome - this is a simulated terminal. Real git commands, real behavior.",
    '# read the objective below, type a command in the box, press Enter.',
    '# not sure where to start? "git status" is always a safe first move.',
    ''
  ], 'dim');
  try { localStorage.setItem('commitIssuesSeenIntro', '1'); } catch (e) {}
}

function restartTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerEl.textContent = '00:00';
  timerHandle = setInterval(() => {
    const secs = Math.floor((Date.now() - startTime) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;
  }, 1000);
}

function recordCompletion(i, seconds) {
  try {
    const raw = localStorage.getItem('commitIssuesProgress');
    const data = raw ? JSON.parse(raw) : { completed: [], times: {}, visits: [] };
    if (!data.completed.includes(i)) data.completed.push(i);
    data.times[i] = seconds;
    localStorage.setItem('commitIssuesProgress', JSON.stringify(data));
  } catch (e) { /* localStorage unavailable - stats just won't persist */ }
}

function playLevelUpEffect() {
  levelIndicatorEl.classList.remove('level-pulse');
  terminalEl.classList.remove('level-flash');
  // force reflow so the animation replays even if triggered again quickly
  void levelIndicatorEl.offsetWidth;
  levelIndicatorEl.classList.add('level-pulse');
  terminalEl.classList.add('level-flash');
  setTimeout(() => {
    levelIndicatorEl.classList.remove('level-pulse');
    terminalEl.classList.remove('level-flash');
  }, 800);
}

function checkLevel() {
  const level = LEVELS[levelIndex];
  if (level.check(state)) {
    if (timerHandle) clearInterval(timerHandle);
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    print([`✓ solved in ${seconds}s`], 'ok');
    playLevelUpEffect();
    recordCompletion(levelIndex, seconds);
    track('level_completed', {
      level_index: levelIndex + 1,
      level_title: level.title,
      seconds: seconds,
      hints_used: hintTier
    });
    setTimeout(() => {
      if (levelIndex + 1 < LEVELS.length) loadLevel(levelIndex + 1);
      else showCampaignComplete();
    }, 900);
  }
}

function showCampaignComplete() {
  screenEl.innerHTML = '';
  levelIndicatorEl.textContent = `Level ${LEVELS.length}/${LEVELS.length}`;
  let totalTime = 0;
  try {
    const data = JSON.parse(localStorage.getItem('commitIssuesProgress') || '{}');
    totalTime = Object.values(data.times || {}).reduce((a, b) => a + b, 0);
  } catch (e) {}
  print([
    '# campaign complete.',
    `# ${LEVELS.length}/${LEVELS.length} levels solved - total time ${totalTime}s`,
    '# type :restart to run it again from level 1.'
  ], 'ok');
  track('campaign_completed', { total_time: totalTime });
}

// ---------- meta / util commands ----------

function handleMeta(raw) {
  const cmd = raw.trim();
  if (cmd === ':help') {
    print([
      'git <command>      - status, add, commit, branch, checkout, switch, merge, stash, reset, restore, revert, log',
      'ls / cat <file>    - inspect the working directory',
      'nano|vim|edit <f>  - edit a file (used to resolve conflicts)',
      'clear              - clear the screen',
      ':hint              - get a progressively more specific hint',
      ':reset             - restart the current level',
      ':theme             - change the accent color',
      ':restart           - restart the whole campaign'
    ], 'dim');
    return true;
  }
  if (cmd === ':hint') {
    const level = LEVELS[levelIndex];
    const idx = Math.min(hintTier, level.hints.length - 1);
    print([`hint: ${level.hints[idx]}`], 'hint');
    track('hint_requested', { level_index: levelIndex + 1, tier: idx + 1 });
    if (hintTier < level.hints.length - 1) hintTier++;
    return true;
  }
  if (cmd === ':reset') {
    print(['# level reset.'], 'dim');
    track('level_reset', { level_index: levelIndex + 1 });
    loadLevel(levelIndex);
    return true;
  }
  if (cmd === ':restart') {
    loadLevel(0);
    return true;
  }
  if (cmd === ':theme') {
    toggleThemePopover();
    return true;
  }
  return false;
}

// ---------- theme popover ----------

function toggleThemePopover(forceOpen) {
  const pop = document.getElementById('themePopover');
  if (!pop) return;
  const shouldOpen = forceOpen !== undefined ? forceOpen : pop.classList.contains('hidden');
  if (shouldOpen) {
    renderThemeSwatches(pop);
    pop.classList.remove('hidden');
  } else {
    pop.classList.add('hidden');
  }
}

function renderThemeSwatches(pop) {
  pop.innerHTML = '';
  ACCENTS.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'swatch';
    btn.style.background = a.hex;
    btn.title = a.name;
    btn.onclick = () => {
      applyAccent(a.hex);
      print([`# accent set to ${a.name}`], 'dim');
      track('theme_changed', { color: a.name });
      toggleThemePopover(false);
      inputEl.focus();
    };
    pop.appendChild(btn);
  });
}

function applyAccent(hex) {
  document.documentElement.style.setProperty('--accent', hex);
  try { localStorage.setItem('commitIssuesAccent', hex); } catch (e) {}
}

// ---------- editor overlay (nano/vim/edit) ----------

function openEditor(file) {
  if (!(file in state.workdir)) {
    print([`${file}: No such file or directory`], 'err');
    return;
  }
  editingFile = file;
  editorFileEl.textContent = file;
  editorArea.value = state.workdir[file];
  editorOverlay.classList.remove('hidden');
  editorArea.focus();
}

function closeEditor(save) {
  if (save && editingFile) {
    state.workdir[editingFile] = editorArea.value;
    print([`"${editingFile}" written`], 'dim');
  } else if (editingFile) {
    print(['edit aborted'], 'dim');
  }
  editingFile = null;
  editorOverlay.classList.add('hidden');
  inputEl.focus();
  checkLevel();
}

editorArea.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey; // metaKey so Cmd+S/Cmd+X work on Mac too
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); closeEditor(true); }
  else if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); closeEditor(false); }
  else if (e.key === 'Escape') { e.preventDefault(); closeEditor(false); }
});

// ---------- input dispatch ----------

function handleInput(raw) {
  const trimmed = raw.trim();
  printEcho(raw);
  if (trimmed === '') return;

  cmdHistory.push(raw);
  historyPos = cmdHistory.length;

  if (trimmed === 'clear') { screenEl.innerHTML = ''; return; }
  if (trimmed.startsWith(':')) { if (!handleMeta(trimmed)) print([`unknown command: ${trimmed}`], 'err'); return; }

  const tokens = tokenize(trimmed);
  const first = tokens[0];

  if (first === 'ls') {
    const files = Object.keys(state.workdir).sort();
    print(files.length ? files : ['(empty working directory)']);
    return;
  }
  if (first === 'cat') {
    const f = tokens[1];
    if (!f) { print(['usage: cat <file>'], 'err'); return; }
    if (!(f in state.workdir)) { print([`cat: ${f}: No such file or directory`], 'err'); return; }
    print(state.workdir[f].split('\n'));
    return;
  }
  if (first === 'nano' || first === 'vim' || first === 'edit') {
    const f = tokens[1];
    if (!f) { print([`usage: ${first} <file>`], 'err'); return; }
    openEditor(f);
    return;
  }
  if (first === 'git') {
    const result = runGit(state, tokens);
    const isErr = result.lines.some(l => /^(fatal:|error:|git:)/.test(l));
    print(result.lines, isErr ? 'err' : undefined);
    if (isErr) track('command_error', { level_index: levelIndex + 1, command: trimmed.slice(0, 60) });
    updatePrompt();
    checkLevel();
    return;
  }

  print([`bash: ${first}: command not found`], 'err');
  track('unknown_command', { level_index: levelIndex + 1, command: trimmed.slice(0, 60) });
}

// ---------- input element wiring ----------

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = inputEl.value;
    inputEl.value = '';
    handleInput(val);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (cmdHistory.length && historyPos > 0) { historyPos--; inputEl.value = cmdHistory[historyPos]; }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyPos < cmdHistory.length - 1) { historyPos++; inputEl.value = cmdHistory[historyPos]; }
    else { historyPos = cmdHistory.length; inputEl.value = ''; }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const val = inputEl.value;
    const parts = val.split(' ');
    if (parts[0] === 'git' && parts.length === 2) {
      const match = GIT_SUBCOMMANDS.find(c => c.startsWith(parts[1]));
      if (match) inputEl.value = `git ${match} `;
    } else if (parts.length === 1) {
      const match = ['git', 'ls', 'cat', 'nano', 'vim', 'clear'].find(c => c.startsWith(val));
      if (match) inputEl.value = match + ' ';
    }
  }
});

document.getElementById('terminal').addEventListener('click', (e) => {
  if (e.target.closest('.panel')) return;
  if (editorOverlay.classList.contains('hidden')) inputEl.focus();
});

document.getElementById('themeBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleThemePopover();
});

document.addEventListener('click', (e) => {
  const pop = document.getElementById('themePopover');
  if (!pop || pop.classList.contains('hidden')) return;
  if (!e.target.closest('.theme-wrap')) toggleThemePopover(false);
});

document.addEventListener('keydown', (e) => {
  const pop = document.getElementById('themePopover');
  if (e.key === 'Escape' && pop && !pop.classList.contains('hidden')) {
    toggleThemePopover(false);
    inputEl.focus();
  }
});

// ---------- side panels ----------

function setupPanel(panelId, toggleId, storageKey) {
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(toggleId);
  let open = true;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) open = saved === 'open';
  } catch (e) {}
  apply(open);
  btn.addEventListener('click', () => apply(panel.classList.contains('collapsed')));
  function apply(nowOpen) {
    panel.classList.toggle('collapsed', !nowOpen);
    btn.innerHTML = nowOpen ? '&minus;' : '+';
    try { localStorage.setItem(storageKey, nowOpen ? 'open' : 'collapsed'); } catch (e) {}
  }
}

// ---------- info panel ----------

function setupInfoPanel() {
  const btn = document.getElementById('infoBtn');
  const panel = document.getElementById('infoPanel');
  const backdrop = document.getElementById('infoBackdrop');
  const closeBtn = document.getElementById('infoClose');
  if (!btn || !panel || !backdrop || !closeBtn) return;

  function open() {
    panel.classList.remove('hidden');
    backdrop.classList.remove('hidden');
  }
  function close() {
    panel.classList.add('hidden');
    backdrop.classList.add('hidden');
    inputEl.focus();
  }

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.classList.contains('hidden')) close();
  });
}

// ---------- github star count ----------

function formatStarCount(n) {
  if (typeof n !== 'number') return '';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function loadGitHubStars() {
  const el = document.getElementById('starCount');
  if (!el) return;
  try {
    const cached = localStorage.getItem('commitIssuesStars');
    if (cached) el.textContent = cached;
  } catch (e) {}
  fetch('https://api.github.com/repos/SxryxnshS5/Commit-Issues')
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('bad response'))))
    .then(data => {
      const formatted = formatStarCount(data.stargazers_count);
      if (formatted) {
        el.textContent = formatted;
        try { localStorage.setItem('commitIssuesStars', formatted); } catch (e) {}
      }
    })
    .catch(() => { /* offline, rate-limited, or blocked - badge still links out fine without a count */ });
}

// ---------- boot ----------

(function init() {
  try {
    const savedAccent = localStorage.getItem('commitIssuesAccent');
    if (savedAccent) applyAccent(savedAccent);
  } catch (e) {}
  setupPanel('leftPanel', 'leftToggle', 'commitIssuesLeftPanel');
  setupPanel('rightPanel', 'rightToggle', 'commitIssuesRightPanel');
  initCookieConsent();
  setupInfoPanel();
  loadGitHubStars();
  loadLevel(0);
  inputEl.focus();
})();
