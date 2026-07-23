// engine.js
// A deliberately simplified but semantically-real Git model.
// Files are tracked as full-content snapshots per commit (no real blobs/trees),
// which keeps the logic tractable while still enforcing genuine Git semantics:
// staging area vs. workdir vs. HEAD, fast-forward vs. three-way merges,
// real conflict markers, soft/mixed/hard reset differences, and revert-as-new-commit.

// ---------- state ----------

function freshState() {
  return {
    commits: {},              // id -> { id, parents: [id,...], message, tree: {path: content} }
    branches: {},              // name -> commitId
    head: { type: 'branch', name: 'main' }, // or { type: 'detached', commit: id }
    index: {},                 // staged snapshot: path -> content
    workdir: {},                // working directory snapshot: path -> content
    stashes: [],                // [{ index, workdir, message }]
    merge: null                 // { other: commitId, otherBranch: name } while a merge has conflicts
  };
}

function genId(state) {
  let id;
  do { id = Math.random().toString(16).slice(2, 9); } while (state.commits[id]);
  return id;
}

// Helper used only by level setup scripts: create a commit on `branch` on top
// of whatever that branch currently points to (or a root commit if new).
function makeCommit(state, branch, files, message) {
  const parentId = state.branches[branch];
  const parentTree = parentId ? state.commits[parentId].tree : {};
  const tree = { ...parentTree, ...files };
  const id = genId(state);
  state.commits[id] = { id, parents: parentId ? [parentId] : [], message, tree };
  state.branches[branch] = id;
  return id;
}

function getHeadCommitId(state) {
  return state.head.type === 'branch' ? state.branches[state.head.name] : state.head.commit;
}

function getCommitTree(state, id) {
  return (id && state.commits[id] && state.commits[id].tree) || {};
}

function ancestors(state, id) {
  const seen = new Set();
  const stack = id ? [id] : [];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    const c = state.commits[cur];
    if (c) for (const p of c.parents) stack.push(p);
  }
  return seen;
}

function mergeBase(state, a, b) {
  const ancA = ancestors(state, a);
  const queue = [b];
  const seen = new Set();
  while (queue.length) {
    const cur = queue.shift();
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (ancA.has(cur)) return cur;
    const c = state.commits[cur];
    if (c) for (const p of c.parents) queue.push(p);
  }
  return null;
}

function resolveRef(state, ref) {
  if (!ref || ref === 'HEAD') return getHeadCommitId(state);
  const m = /^HEAD~(\d+)$/.exec(ref);
  if (m) {
    let id = getHeadCommitId(state);
    let n = parseInt(m[1], 10);
    while (n-- > 0) {
      const c = state.commits[id];
      if (!c || !c.parents.length) return null;
      id = c.parents[0];
    }
    return id;
  }
  if (state.commits[ref]) return ref;
  const found = Object.keys(state.commits).find(id => id.startsWith(ref));
  return found || null;
}

// ---------- commands ----------

function cmdStatus(state) {
  const headTree = getCommitTree(state, getHeadCommitId(state));
  const staged = [], notStaged = [], untracked = [];
  const allFiles = new Set([...Object.keys(headTree), ...Object.keys(state.index), ...Object.keys(state.workdir)]);
  for (const f of allFiles) {
    const inHead = headTree[f], inIndex = state.index[f], inWork = state.workdir[f];
    if (inIndex !== inHead) {
      if (inIndex === undefined) staged.push(`\tdeleted:    ${f}`);
      else if (inHead === undefined) staged.push(`\tnew file:   ${f}`);
      else staged.push(`\tmodified:   ${f}`);
    }
    if (inWork !== inIndex) {
      if (inIndex === undefined) untracked.push(`\t${f}`);
      else if (inWork === undefined) notStaged.push(`\tdeleted:    ${f}`);
      else notStaged.push(`\tmodified:   ${f}`);
    }
  }
  const lines = [`On branch ${state.head.name || '(detached HEAD)'}`];
  if (state.merge) lines.push('You have unmerged paths.', '  (fix conflicts and run "git commit")', '');
  if (staged.length) { lines.push('Changes to be committed:', ...staged, ''); }
  if (notStaged.length) { lines.push('Changes not staged for commit:', ...notStaged, ''); }
  if (untracked.length) { lines.push('Untracked files:', ...untracked, ''); }
  if (!staged.length && !notStaged.length && !untracked.length) lines.push('nothing to commit, working tree clean');
  return { lines };
}

function cmdAdd(state, args) {
  if (args.length === 0) return { lines: ["Nothing specified, nothing added.", "hint: use 'git add <file>' or 'git add .'"] };
  if (args.includes('.') || args.includes('-A') || args.includes('--all')) {
    state.index = { ...state.workdir };
    return { lines: [] };
  }
  const files = args.filter(a => !a.startsWith('-'));
  const lines = [];
  for (const f of files) {
    if (!(f in state.workdir) && !(f in state.index)) {
      lines.push(`fatal: pathspec '${f}' did not match any files`);
      continue;
    }
    if (f in state.workdir) state.index[f] = state.workdir[f];
    else delete state.index[f];
  }
  return { lines };
}

function cmdCommit(state, args) {
  const mIdx = args.indexOf('-m');
  if (mIdx === -1 || args[mIdx + 1] === undefined) {
    return { lines: ["Aborting commit due to empty commit message.", 'hint: this simulator needs a message - try: git commit -m "your message"'] };
  }
  const message = args[mIdx + 1];
  const headId = getHeadCommitId(state);
  const headTree = getCommitTree(state, headId);
  const changed = Object.keys(state.index).some(k => state.index[k] !== headTree[k]) ||
    Object.keys(headTree).some(k => state.index[k] === undefined);
  if (!changed && !state.merge) return { lines: ['nothing to commit, working tree clean'] };
  const parents = state.merge ? [headId, state.merge.other] : (headId ? [headId] : []);
  const newId = genId(state);
  state.commits[newId] = { id: newId, parents, message, tree: { ...state.index } };
  if (state.head.type === 'branch') state.branches[state.head.name] = newId; else state.head.commit = newId;
  const wasMerge = !!state.merge;
  state.merge = null;
  const lines = [`[${state.head.name || 'detached HEAD'} ${newId.slice(0, 7)}] ${message}`];
  if (wasMerge) lines.push('Merge completed.');
  return { lines };
}

function cmdBranch(state, args) {
  const names = args.filter(a => !a.startsWith('-'));
  if (names.length === 0) {
    return { lines: Object.keys(state.branches).map(b => (state.head.type === 'branch' && state.head.name === b ? '* ' : '  ') + b) };
  }
  const name = names[0];
  if (state.branches[name]) return { lines: [`fatal: A branch named '${name}' already exists.`] };
  state.branches[name] = getHeadCommitId(state);
  return { lines: [] };
}

function checkoutBranch(state, name) {
  const targetId = state.branches[name];
  if (!targetId) return { lines: [`error: pathspec '${name}' did not match any file(s) known to git`] };
  const currentTree = getCommitTree(state, getHeadCommitId(state));
  const targetTree = getCommitTree(state, targetId);
  const conflicts = [];
  for (const f of Object.keys(state.workdir)) {
    if (state.workdir[f] !== state.index[f] && targetTree[f] !== currentTree[f]) conflicts.push(f);
  }
  if (conflicts.length > 0) {
    return {
      lines: [
        'error: Your local changes to the following files would be overwritten by checkout:',
        ...conflicts.map(f => `\t${f}`),
        'Please commit your changes or stash them before you switch branches.',
        'Aborting'
      ]
    };
  }
  state.head = { type: 'branch', name };
  state.index = { ...targetTree };
  state.workdir = { ...targetTree };
  return { lines: [`Switched to branch '${name}'`] };
}

function cmdCheckout(state, args) {
  if (args[0] === '-b') {
    const name = args[1];
    if (!name) return { lines: ['usage: git checkout -b <new-branch>'] };
    if (state.branches[name]) return { lines: [`fatal: A branch named '${name}' already exists.`] };
    state.branches[name] = getHeadCommitId(state);
    state.head = { type: 'branch', name };
    return { lines: [`Switched to a new branch '${name}'`] };
  }
  return checkoutBranch(state, args[0]);
}

function cmdSwitch(state, args) {
  if (args[0] === '-c') {
    const name = args[1];
    if (!name) return { lines: ['usage: git switch -c <new-branch>'] };
    if (state.branches[name]) return { lines: [`fatal: a branch named '${name}' already exists`] };
    state.branches[name] = getHeadCommitId(state);
    state.head = { type: 'branch', name };
    return { lines: [`Switched to a new branch '${name}'`] };
  }
  return checkoutBranch(state, args[0]);
}

function cmdMerge(state, args) {
  const name = args.filter(a => !a.startsWith('-'))[0];
  const otherId = state.branches[name];
  if (!otherId) return { lines: [`merge: ${name} - not something we can merge`] };
  const currentId = getHeadCommitId(state);
  if (currentId === otherId) return { lines: ['Already up to date.'] };
  if (ancestors(state, currentId).has(otherId)) return { lines: ['Already up to date.'] };
  if (ancestors(state, otherId).has(currentId)) {
    if (state.head.type === 'branch') state.branches[state.head.name] = otherId;
    const t = getCommitTree(state, otherId);
    state.index = { ...t };
    state.workdir = { ...t };
    return { lines: [`Updating ${currentId.slice(0, 7)}..${otherId.slice(0, 7)}`, 'Fast-forward'] };
  }
  const baseId = mergeBase(state, currentId, otherId);
  const baseTree = getCommitTree(state, baseId);
  const curTree = getCommitTree(state, currentId);
  const otherTree = getCommitTree(state, otherId);
  const allFiles = new Set([...Object.keys(baseTree), ...Object.keys(curTree), ...Object.keys(otherTree)]);
  const resultTree = {};
  const conflictFiles = [];
  for (const f of allFiles) {
    const b = baseTree[f], a = curTree[f], o = otherTree[f];
    if (a === o) { if (a !== undefined) resultTree[f] = a; continue; }
    if (a === b) { if (o !== undefined) resultTree[f] = o; continue; }
    if (o === b) { if (a !== undefined) resultTree[f] = a; continue; }
    conflictFiles.push(f);
    resultTree[f] = `<<<<<<< HEAD\n${a ?? ''}\n=======\n${o ?? ''}\n>>>>>>> ${name}\n`;
  }
  state.index = { ...resultTree };
  state.workdir = { ...resultTree };
  if (conflictFiles.length > 0) {
    state.merge = { other: otherId, otherBranch: name };
    return {
      lines: [
        `Auto-merging ${conflictFiles.join(', ')}`,
        ...conflictFiles.map(f => `CONFLICT (content): Merge conflict in ${f}`),
        'Automatic merge failed; fix conflicts and then commit the result.'
      ]
    };
  }
  const newId = genId(state);
  state.commits[newId] = { id: newId, parents: [currentId, otherId], message: `Merge branch '${name}'`, tree: resultTree };
  if (state.head.type === 'branch') state.branches[state.head.name] = newId;
  return { lines: [`Merge made by the 'recursive' strategy.`, `[${state.head.name} ${newId.slice(0, 7)}] Merge branch '${name}'`] };
}

function cmdStash(state, args) {
  const sub = args[0];
  if (!sub || sub === 'push' || sub === 'save') {
    const headTree = getCommitTree(state, getHeadCommitId(state));
    const dirty = Object.keys(state.workdir).some(f => state.workdir[f] !== state.index[f]) ||
      Object.keys(state.index).some(f => state.index[f] !== headTree[f]) ||
      Object.keys(headTree).some(f => state.index[f] === undefined);
    if (!dirty) return { lines: ['No local changes to save'] };
    state.stashes.push({ index: { ...state.index }, workdir: { ...state.workdir }, message: `WIP on ${state.head.name}` });
    state.index = { ...headTree };
    state.workdir = { ...headTree };
    return { lines: [`Saved working directory and index state WIP on ${state.head.name}`] };
  }
  if (sub === 'pop' || sub === 'apply') {
    if (state.stashes.length === 0) return { lines: ['No stash entries found.'] };
    const entry = sub === 'pop' ? state.stashes.pop() : state.stashes[state.stashes.length - 1];
    state.index = { ...entry.index };
    state.workdir = { ...entry.workdir };
    return { lines: [`On branch ${state.head.name}`, sub === 'pop' ? 'Dropped stash entry' : 'Applied stash entry'] };
  }
  if (sub === 'list') {
    const lines = [];
    for (let i = state.stashes.length - 1, label = 0; i >= 0; i--, label++) {
      lines.push(`stash@{${label}}: ${state.stashes[i].message}`);
    }
    return { lines };
  }
  return { lines: [`git: 'stash ${sub}' is not supported in this simulator`] };
}

function cmdReset(state, args) {
  const flag = args.find(a => a === '--soft' || a === '--mixed' || a === '--hard');
  const rest = args.filter(a => !a.startsWith('--'));
  const looksLikeRef = rest[0] && (rest[0] === 'HEAD' || rest[0].startsWith('HEAD~') || state.commits[rest[0]] || Object.keys(state.commits).some(id => id.startsWith(rest[0])));
  if (!flag && rest.length && !looksLikeRef) {
    const file = rest[0];
    const headTree = getCommitTree(state, getHeadCommitId(state));
    if (file in headTree) state.index[file] = headTree[file]; else delete state.index[file];
    return { lines: [`Unstaged changes after reset:`, `M\t${file}`] };
  }
  const ref = rest[0] || 'HEAD';
  const targetId = resolveRef(state, ref);
  if (!targetId) return { lines: [`fatal: ambiguous argument '${ref}': unknown revision or path not in the working tree.`] };
  const targetTree = getCommitTree(state, targetId);
  if (state.head.type === 'branch') state.branches[state.head.name] = targetId; else state.head.commit = targetId;
  if (flag === '--hard') {
    state.index = { ...targetTree };
    state.workdir = { ...targetTree };
    return { lines: [`HEAD is now at ${targetId.slice(0, 7)} ${state.commits[targetId].message}`] };
  }
  if (flag === '--soft') {
    return { lines: [`HEAD is now at ${targetId.slice(0, 7)} ${state.commits[targetId].message}`] };
  }
  state.index = { ...targetTree };
  return { lines: [`Unstaged changes after reset.`] };
}

function cmdRestore(state, args) {
  const staged = args.includes('--staged');
  const file = args.find(a => !a.startsWith('-'));
  if (!file) return { lines: ['fatal: you must specify path(s) to restore'] };
  const headTree = getCommitTree(state, getHeadCommitId(state));
  if (staged) {
    if (file in headTree) state.index[file] = headTree[file]; else delete state.index[file];
  } else {
    if (file in state.index) state.workdir[file] = state.index[file]; else delete state.workdir[file];
  }
  return { lines: [] };
}

function cmdRevert(state, args) {
  const ref = args.find(a => !a.startsWith('-')) || 'HEAD';
  const targetId = resolveRef(state, ref);
  if (!targetId) return { lines: [`fatal: bad revision '${ref}'`] };
  const target = state.commits[targetId];
  if (!target.parents.length) return { lines: ['fatal: cannot revert a root commit'] };
  const parentTree = getCommitTree(state, target.parents[0]);
  const targetTree = target.tree;
  const currentId = getHeadCommitId(state);
  const currentTree = getCommitTree(state, currentId);
  const newTree = { ...currentTree };
  const allFiles = new Set([...Object.keys(targetTree), ...Object.keys(parentTree)]);
  for (const f of allFiles) {
    if (targetTree[f] !== parentTree[f]) {
      if (parentTree[f] === undefined) delete newTree[f]; else newTree[f] = parentTree[f];
    }
  }
  const newId = genId(state);
  const msg = `Revert "${target.message}"`;
  state.commits[newId] = { id: newId, parents: [currentId], message: msg, tree: newTree };
  if (state.head.type === 'branch') state.branches[state.head.name] = newId; else state.head.commit = newId;
  state.index = { ...newTree };
  state.workdir = { ...newTree };
  return { lines: [`[${state.head.name} ${newId.slice(0, 7)}] ${msg}`, '1 file changed'] };
}

function cmdLog(state, args) {
  const oneline = args.includes('--oneline');
  const lines = [];
  let id = getHeadCommitId(state);
  const seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id);
    const c = state.commits[id];
    if (!c) break;
    const labels = Object.keys(state.branches).filter(b => state.branches[b] === id);
    let marker = '';
    if (labels.length) {
      const isHead = state.head.type === 'branch' && labels.includes(state.head.name);
      const parts = isHead ? [`HEAD -> ${state.head.name}`, ...labels.filter(b => b !== state.head.name)] : labels;
      marker = ` (${parts.join(', ')})`;
    }
    if (oneline) lines.push(`${id.slice(0, 7)}${marker} ${c.message}`);
    else lines.push(`commit ${id}${marker}`, `    ${c.message}`, '');
    id = c.parents[0];
  }
  if (!lines.length) lines.push('fatal: your current branch does not have any commits yet');
  return { lines };
}

function runGit(state, tokens) {
  const sub = tokens[1];
  const args = tokens.slice(2);
  switch (sub) {
    case 'status': return cmdStatus(state);
    case 'add': return cmdAdd(state, args);
    case 'commit': return cmdCommit(state, args);
    case 'branch': return cmdBranch(state, args);
    case 'checkout': return cmdCheckout(state, args);
    case 'switch': return cmdSwitch(state, args);
    case 'merge': return cmdMerge(state, args);
    case 'stash': return cmdStash(state, args);
    case 'reset': return cmdReset(state, args);
    case 'restore': return cmdRestore(state, args);
    case 'revert': return cmdRevert(state, args);
    case 'log': return cmdLog(state, args);
    case 'diff': return { lines: ['(diff view is not available in this simulator yet)'] };
    case undefined: return { lines: ['usage: git <command> [<args>]', "type ':help' to see the commands this simulator supports"] };
    case 'help': case '--help':
      return {
        lines: [
          'supported commands:',
          '  status  add  commit  branch  checkout  switch  merge',
          '  stash   reset  restore  revert  log',
          "see the COMMANDS panel, or type ':help' for the full command list including nano/ls/cat"
        ]
      };
    case 'rebase': case 'cherry-pick': case 'reflog':
      return { lines: [`'${sub}' is not available in this training mode yet - coming in a future update!`] };
    default:
      return { lines: [`git: '${sub}' is not a git command. Type ':help' to see what's supported here.`] };
  }
}
