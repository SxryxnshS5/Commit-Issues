# Commit Issues

A fast, browser-based Git practice game inspired by the simplicity of Monkeytype. Instead of reading tutorials, you drop straight into realistic Git scenarios in a terminal-style interface, solve them with whatever real `git` commands get the job done, and move on. No install, no signup, no long tutorials.

**Play it live:** [commit-issues.vercel.app](https://commit-issues.vercel.app/)

## What it actually is

Under the hood this isn't a pattern-matching quiz. It's a small, hand-built Git engine running entirely in the browser: real staging area, real HEAD/branch refs, real fast-forward vs. three-way merge logic, real conflict markers, real differences between `--soft`, `--mixed`, and `--hard` resets. Every level checks the resulting repository state, not the exact commands you typed, so there's no single "correct" answer to memorize. If a command is valid Git, it does what real Git would do; if it isn't, you get a realistic shell error instead of a generic "wrong."

## Features

- Ten-level campaign covering staging, committing, branching, stashing across a blocked checkout, clean merges, merge conflict resolution, unstaging, a safe soft reset, and a safe revert
- A real terminal feel: command history (up/down arrows), basic tab-completion, and an in-terminal `nano`/`vim`/`edit` for resolving conflicts (Ctrl+S or Cmd+S to save, Esc to cancel)
- Three-tier hint system (`:hint`) that gets progressively more specific
- A persistent objective bar so the current goal never scrolls out of view
- A theme picker (`:theme` or the button in the title bar) with seven accent colors, persisted locally
- Collapsible Commands reference and Tips side panels for players who don't already know Git syntax
- No login, no backend, no database - progress, theme, and panel state all live in `localStorage`
- GitHub star badge with a live count, and an info panel with project + author details
- Cookie-gated analytics (Google Analytics, Vercel Web Analytics, Microsoft Clarity) - nothing loads until a visitor accepts

## Running it locally

There's no build step and no dependencies. Clone the repo and open `index.html` directly, or serve it with any static server so `localStorage` behaves consistently across browsers:

```
npx serve .
```

or

```
python -m http.server
```

Then visit the printed local address.

## Deploying

It's a plain static site (`index.html`, `style.css`, and a handful of `.js` files with no bundler), so it deploys anywhere that serves static files with zero configuration - Vercel, Netlify, Cloudflare Pages, GitHub Pages. On Vercel specifically: just point a project at this repo, leave the framework preset as "Other," no build command needed.

If you enable Vercel Web Analytics, it needs to be turned on separately in the project's Analytics tab in the Vercel dashboard - the script alone doesn't activate it.

## Project structure

```
index.html      entry point, all markup
style.css       terminal look, theming, layout
engine.js       the Git model: commits, branches, index, merges, resets, reverts
levels.js       the 10 campaign levels (setup state + objective check + hints)
app.js          UI wiring: input handling, rendering, panels, theming, stats
analytics.js    GA4 / Vercel Analytics / Clarity loaders, gated by cookie consent
favicon.svg     site icon
```

## What's not here yet

By design, this is campaign-only for now. Free Practice (infinite random scenarios), a 60-second Git Blitz mode, a Daily Challenge with a leaderboard, a "here's an alternate valid solution" explainer, and the more advanced Git territory (rebase, cherry-pick, reflog, detached HEAD recovery) are all deliberately out of scope until the current ten levels prove out. See `MVP-Plan.md` and `Post-MVP-Report.md` for the fuller reasoning (both are gitignored locally but worth keeping around as project history if you want them).

## Credits

Built by **Suryansh Singh**

- GitHub: [github.com/SxryxnshS5](https://github.com/SxryxnshS5)
- LinkedIn: [linkedin.com/in/suryansh-singh-ncl](https://www.linkedin.com/in/suryansh-singh-ncl/)

If this was useful, a star on [the repo](https://github.com/SxryxnshS5/Commit-Issues) goes a long way.
