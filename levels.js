// levels.js
// Each level is self-contained: a fresh repo state, an objective, a check(state)
// predicate that accepts ANY valid command path to the correct end state, and
// tiered hints. Levels do not chain into each other on purpose - each one boots
// a clean scenario so a bad move never permanently blocks progress (":reset" also
// reboots the current level instantly).

const LEVELS = [
  {
    title: 'Stage one file',
    objective: [
      '# You modified login.py and utils.py on main.',
      '# Stage ONLY login.py - leave utils.py unstaged.'
    ],
    setup() {
      const s = freshState();
      makeCommit(s, 'main', {
        'login.py': 'def login():\n    pass\n',
        'utils.py': 'def helper():\n    pass\n'
      }, 'Initial commit');
      const headTree = s.commits[s.branches.main].tree;
      s.index = { ...headTree };
      s.workdir = { ...headTree, 'login.py': 'def login():\n    return authenticate()\n', 'utils.py': 'def helper():\n    return 42\n' };
      return s;
    },
    check(state) {
      const headTree = getCommitTree(state, getHeadCommitId(state));
      return state.index['login.py'] === state.workdir['login.py'] &&
        state.index['utils.py'] === headTree['utils.py'];
    },
    hints: [
      'You only want one of the two files in the staging area.',
      'The command is "git add" followed by a specific filename.',
      'git add login.py'
    ]
  },
  {
    title: 'Commit staged changes',
    objective: [
      '# app.py has a staged change ready to go.',
      '# Commit it with a message.'
    ],
    setup() {
      const s = freshState();
      makeCommit(s, 'main', { 'app.py': 'print("v1")\n' }, 'Initial commit');
      const headTree = s.commits[s.branches.main].tree;
      s.workdir = { ...headTree, 'app.py': 'print("v2")\n' };
      s.index = { ...s.workdir };
      return s;
    },
    check(state) {
      const headId = getHeadCommitId(state);
      const c = state.commits[headId];
      return c && c.tree['app.py'] === 'print("v2")\n' && c.parents.length === 1;
    },
    hints: [
      'The change is already staged - it just needs to become a commit.',
      'git commit takes a -m flag with your message.',
      'git commit -m "update app.py"'
    ]
  },
  {
    title: 'Create and switch branches',
    objective: [
      '# Create a new branch called feature/search',
      '# and switch to it.'
    ],
    setup() {
      const s = freshState();
      makeCommit(s, 'main', { 'README.md': '# Project\n' }, 'Initial commit');
      const headTree = s.commits[s.branches.main].tree;
      s.index = { ...headTree };
      s.workdir = { ...headTree };
      return s;
    },
    check(state) {
      return state.head.type === 'branch' && state.head.name === 'feature/search' && !!state.branches['feature/search'];
    },
    hints: [
      'You can do this in one command or two - either works.',
      'git checkout -b <name> creates AND switches in one step.',
      'git checkout -b feature/search'
    ]
  },
  {
    title: 'Stash before switching',
    objective: [
      '# You have uncommitted changes to config.py on main.',
      '# The hotfix branch also touches config.py - a plain checkout',
      '# will be blocked. Switch to hotfix without losing your work.'
    ],
    setup() {
      const s = freshState();
      makeCommit(s, 'main', { 'config.py': 'DEBUG = False\n' }, 'Initial commit');
      s.branches['hotfix'] = s.branches.main;
      makeCommit(s, 'hotfix', { 'config.py': 'DEBUG = False\nFEATURE_X = True\n' }, 'Add feature flag');
      s.head = { type: 'branch', name: 'main' };
      const mainTree = s.commits[s.branches.main].tree;
      s.index = { ...mainTree };
      s.workdir = { ...mainTree, 'config.py': 'DEBUG = True\n' };
      return s;
    },
    check(state) {
      return state.head.type === 'branch' && state.head.name === 'hotfix' && state.stashes.length >= 1;
    },
    hints: [
      'Try switching branches first and read the error carefully.',
      'git stash tucks away uncommitted changes so your working tree is clean.',
      'git stash, then git checkout hotfix'
    ]
  },
  {
    title: 'Bring back your stash',
    objective: [
      '# You stashed some work on notes.txt earlier.',
      '# Bring it back.'
    ],
    setup() {
      const s = freshState();
      makeCommit(s, 'main', { 'notes.txt': 'v1\n' }, 'Initial commit');
      const headTree = s.commits[s.branches.main].tree;
      s.stashes.push({ index: { ...headTree }, workdir: { ...headTree, 'notes.txt': 'v1\nwork in progress\n' }, message: 'WIP on main' });
      s.index = { ...headTree };
      s.workdir = { ...headTree };
      return s;
    },
    check(state) {
      return state.workdir['notes.txt'] === 'v1\nwork in progress\n' && state.head.name === 'main';
    },
    hints: [
      'There\'s a stash entry waiting - check with "git stash list".',
      'Popping a stash re-applies it and removes it from the list.',
      'git stash pop'
    ]
  },
  {
    title: 'Merge a feature branch',
    objective: [
      '# feature/footer and main have both moved forward independently.',
      '# Merge feature/footer into main.'
    ],
    setup() {
      const s = freshState();
      makeCommit(s, 'main', { 'index.html': '<h1>Home</h1>\n' }, 'Initial commit');
      s.branches['feature/footer'] = s.branches.main;
      makeCommit(s, 'feature/footer', { 'index.html': '<h1>Home</h1>\n', 'footer.html': '<footer>2026</footer>\n' }, 'Add footer');
      makeCommit(s, 'main', { 'index.html': '<h1>Home</h1>\n', 'header.html': '<header>Nav</header>\n' }, 'Add header');
      s.head = { type: 'branch', name: 'main' };
      const headTree = s.commits[s.branches.main].tree;
      s.index = { ...headTree };
      s.workdir = { ...headTree };
      return s;
    },
    check(state) {
      return state.head.name === 'main' && 'footer.html' in getCommitTree(state, getHeadCommitId(state));
    },
    hints: [
      'Make sure you\'re on main first, then bring the other branch in.',
      'git merge <branch-name> merges that branch into your current one.',
      'git merge feature/footer'
    ]
  },
  {
    title: 'Resolve a merge conflict',
    objective: [
      '# main and feature/dark-mode both changed settings.py.',
      '# Merge feature/dark-mode into main and resolve the conflict.',
      '# (use "nano <file>" or "vim <file>" to edit a file)'
    ],
    setup() {
      const s = freshState();
      makeCommit(s, 'main', { 'settings.py': 'THEME = "light"\n' }, 'Initial commit');
      s.branches['feature/dark-mode'] = s.branches.main;
      makeCommit(s, 'feature/dark-mode', { 'settings.py': 'THEME = "dark"\n' }, 'Switch default theme to dark');
      makeCommit(s, 'main', { 'settings.py': 'THEME = "light"\nVERSION = 2\n' }, 'Bump version');
      s.head = { type: 'branch', name: 'main' };
      const headTree = s.commits[s.branches.main].tree;
      s.index = { ...headTree };
      s.workdir = { ...headTree };
      return s;
    },
    check(state) {
      const headId = getHeadCommitId(state);
      const c = state.commits[headId];
      const content = getCommitTree(state, headId)['settings.py'] || '';
      return state.head.name === 'main' && !state.merge && !content.includes('<<<<<<<') && c && c.parents.length === 2;
    },
    hints: [
      'Start the merge - git will tell you exactly which file conflicted.',
      'Open the conflicted file, remove the <<<<<<< / ======= / >>>>>>> markers and pick the content you want, then stage and commit.',
      'git merge feature/dark-mode, then nano settings.py, git add settings.py, git commit -m "resolve conflict"'
    ]
  },
  {
    title: 'Unstage a file',
    objective: [
      '# You ran "git add ." but b.py isn\'t ready yet.',
      '# Unstage b.py - keep the edit, just don\'t stage it.'
    ],
    setup() {
      const s = freshState();
      makeCommit(s, 'main', { 'a.py': '1\n', 'b.py': '1\n' }, 'Initial commit');
      const headTree = s.commits[s.branches.main].tree;
      s.workdir = { ...headTree, 'a.py': '2\n', 'b.py': '2\n' };
      s.index = { ...s.workdir };
      return s;
    },
    check(state) {
      const headTree = getCommitTree(state, getHeadCommitId(state));
      return state.index['a.py'] === '2\n' && state.index['b.py'] === headTree['b.py'] && state.workdir['b.py'] === '2\n';
    },
    hints: [
      'a.py should stay staged - only touch b.py.',
      'git reset <file> (or git restore --staged <file>) removes a file from the staging area without discarding your edit.',
      'git reset b.py'
    ]
  },
  {
    title: 'Undo a commit, keep the change',
    objective: [
      '# The last commit on main was made too early.',
      '# Undo the commit but keep the change staged so you can redo it properly.'
    ],
    setup() {
      const s = freshState();
      makeCommit(s, 'main', { 'server.py': 'PORT = 8000\n' }, 'Initial commit');
      makeCommit(s, 'main', { 'server.py': 'PORT = 9000\n' }, 'oops, committed too soon');
      s.head = { type: 'branch', name: 'main' };
      const headTree = s.commits[s.branches.main].tree;
      s.index = { ...headTree };
      s.workdir = { ...headTree };
      return s;
    },
    check(state) {
      const headId = getHeadCommitId(state);
      const c = state.commits[headId];
      return c && c.message === 'Initial commit' && state.index['server.py'] === 'PORT = 9000\n';
    },
    hints: [
      'You want to move the branch pointer back one commit - without touching the staging area.',
      'git reset has three modes: --soft, --mixed (default), --hard. Only one of them keeps the change staged.',
      'git reset --soft HEAD~1'
    ]
  },
  {
    title: 'Revert a shared commit',
    objective: [
      '# The last commit on main broke payments and is already',
      '# on your teammates\' machines. Undo it WITHOUT rewriting history.'
    ],
    setup() {
      const s = freshState();
      makeCommit(s, 'main', { 'payment.py': 'def charge(): pass\n' }, 'Initial commit');
      makeCommit(s, 'main', { 'payment.py': 'def charge(): raise Exception("bug")\n' }, 'Breaks payment flow');
      s.head = { type: 'branch', name: 'main' };
      const headTree = s.commits[s.branches.main].tree;
      s.index = { ...headTree };
      s.workdir = { ...headTree };
      return s;
    },
    check(state) {
      const headId = getHeadCommitId(state);
      const c = state.commits[headId];
      const headTree = getCommitTree(state, headId);
      return c && c.message.startsWith('Revert') && c.parents.length === 1 && headTree['payment.py'] === 'def charge(): pass\n';
    },
    hints: [
      'Resetting would rewrite history your teammates already have - that\'s not safe here.',
      'There\'s a command that undoes a commit by making a new, opposite commit.',
      'git revert HEAD'
    ]
  }
];
