# Codex Skill Manager

A local web dashboard for browsing and managing agent skill files on your machine.

This project does not ship with someone else's skills baked into the HTML. It scans skill folders from the computer where it is running, then shows those local `SKILL.md` files in a small browser UI.

## What It Does

- Finds local `SKILL.md` files across common agent skill folders.
- Searches by skill name, description, root, and directory.
- Opens skill files for reading in the browser.
- Edits writable `SKILL.md` files directly on disk.
- Creates new skills in writable roots.
- Installs read-only archive skills into a writable root.
- Disables skills reversibly by renaming `SKILL.md` to `SKILL.md.disabled`.
- Supports any number of extra skill folders with `SKILL_ROOTS`.

## Default Skill Folders

By default, the app scans these folders under the current user's home directory:

```text
~/.codex/skills
~/.codex/skills/.system
~/.agents/skills
~/.claude/skills
~/skills
~/skills-archive
```

Missing folders are skipped. The app still starts even if only one of these paths exists.

## Quick Start

Requirements:

- Node.js 18 or newer
- npm

Clone and run:

```bash
git clone <your-repo-url>
cd codex-skill-manager
npm start
```

Open:

```text
http://localhost:4173
```

Use another port:

```bash
PORT=4180 npm start
```

Then open `http://localhost:4180`.

## Add More Skill Folders

If your skills live somewhere else, pass extra folders with `SKILL_ROOTS`.

Comma-separated paths:

```bash
SKILL_ROOTS="$HOME/work/skills,$HOME/lab/agent-skills" npm start
```

Newline or semicolon-separated values also work.

For custom labels or read-only folders, use JSON:

```bash
SKILL_ROOTS='[
  {"key":"work","label":"Work skills","path":"~/work/skills","writable":true},
  {"key":"shared","label":"Shared archive","path":"~/shared/skills","writable":false}
]' npm start
```

Fields:

- `key`: stable internal ID for the folder
- `label`: display name in the UI
- `path`: folder to scan
- `writable`: whether the UI can create, edit, install, enable, or disable skills in that folder

String-only `SKILL_ROOTS` entries default to writable.

## Skill Folder Shape

Each skill is expected to live in its own directory with a `SKILL.md` file:

```text
my-skill/
  SKILL.md
```

Recommended `SKILL.md` frontmatter:

```markdown
---
name: my-skill
description: Use this when you need to do a specific task.
---

# Instructions

Write the skill instructions here.
```

The app can still show files without frontmatter, but name and description discovery works best with it.

## Safety Model

This is a local-first tool:

- It reads files from local folders only.
- It does not upload skill contents anywhere.
- It has no database.
- It has no login system.
- Browser edits write directly to the local `SKILL.md` file.

Writable roots allow file changes. Read-only roots can be browsed and used as install sources, but they cannot be edited in place.

Disable is reversible:

```text
SKILL.md -> SKILL.md.disabled
```

Enable renames it back:

```text
SKILL.md.disabled -> SKILL.md
```

## API

The UI uses a small local HTTP API:

```text
GET  /api/health
GET  /api/roots
GET  /api/skills
GET  /api/skills/:id
POST /api/skills
PUT  /api/skills/:id
POST /api/skills/:id/install
POST /api/skills/:id/disable
POST /api/skills/:id/enable
```

## Development

Run tests:

```bash
npm test
```

Run syntax checks:

```bash
node -c server.js
node -c lib/skills.js
node -c public/app.js
```

Project structure:

```text
.
├── lib/skills.js        # skill discovery and filesystem operations
├── public/              # browser UI
├── server.js            # local HTTP server and API routes
└── test/skills.test.js  # node:test coverage
```

## Troubleshooting

No skills appear:

- Check that at least one scanned folder exists.
- Check that each skill folder contains `SKILL.md`.
- Run with `SKILL_ROOTS` if your skills live outside the default folders.

Port already in use:

```bash
PORT=4180 npm start
```

Edits are disabled:

- The selected root is read-only.
- Start with a writable custom root or edit a skill under a writable default root.

Archive install fails:

- A skill with the same folder name may already exist in the target root.
- Rename the target skill or remove the existing one manually if you really want to replace it.

## License

Add a license before publishing if you want others to reuse or modify this project.
