# Skill Management Service

Local web UI for managing Codex skill files.

## Features

- Scan `~/.codex/skills`, `~/.agents/skills`, and `~/skills-archive`.
- Search skills by name, description, root, or directory.
- View and edit writable `SKILL.md` files.
- Create new skills in writable roots.
- Install read-only archive skills into `~/.codex/skills`.
- Disable skills by renaming `SKILL.md` to `SKILL.md.disabled`, so the operation is reversible.

## Run

```bash
cd my-codex-skills
npm start
```

Open `http://localhost:4173`.

Use a different port when needed:

```bash
PORT=4180 npm start
```

## Verify

```bash
npm test
```
