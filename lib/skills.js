import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const SKILL_FILE = "SKILL.md";
const DISABLED_FILE = "SKILL.md.disabled";

export function defaultRoots(home = os.homedir()) {
  return rootsFromList([
    {
      key: "codex",
      label: "Codex skills",
      path: path.join(home, ".codex", "skills"),
      writable: true
    },
    {
      key: "codex-system",
      label: "Codex system skills",
      path: path.join(home, ".codex", "skills", ".system"),
      writable: false
    },
    {
      key: "agents",
      label: "Agents skills",
      path: path.join(home, ".agents", "skills"),
      writable: true
    },
    {
      key: "claude",
      label: "Claude skills",
      path: path.join(home, ".claude", "skills"),
      writable: true
    },
    {
      key: "local",
      label: "Local skills",
      path: path.join(home, "skills"),
      writable: true
    },
    {
      key: "archive",
      label: "Skills archive",
      path: path.join(home, "skills-archive"),
      writable: false
    }
  ]);
}

export function configuredRoots({ home = os.homedir(), env = {} } = {}) {
  return rootsFromList([
    ...Object.values(defaultRoots(home)),
    ...parseExtraRoots(env.SKILL_ROOTS, home)
  ]);
}

export function parseExtraRoots(value, home = os.homedir()) {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error("SKILL_ROOTS JSON must be an array");
    return parsed.map((entry, index) => normalizeRootConfig(entry, home, index));
  }

  return trimmed
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => normalizeRootConfig(entry, home, index));
}

export function rootsFromList(list) {
  const roots = {};
  for (const root of list) {
    const key = uniqueKey(roots, root.key || keyFromPath(root.path));
    roots[key] = {
      key,
      label: root.label || key,
      path: expandHome(root.path),
      writable: Boolean(root.writable)
    };
  }
  return roots;
}

function normalizeRootConfig(entry, home, index) {
  if (typeof entry === "string") {
    return {
      key: `extra-${index + 1}`,
      label: path.basename(expandHome(entry, home)) || `Extra ${index + 1}`,
      path: expandHome(entry, home),
      writable: true
    };
  }
  if (!entry || typeof entry !== "object" || !entry.path) {
    throw new Error("Each SKILL_ROOTS entry must be a path string or an object with path");
  }
  return {
    key: entry.key || keyFromPath(entry.path),
    label: entry.label || entry.name || path.basename(expandHome(entry.path, home)),
    path: expandHome(entry.path, home),
    writable: entry.writable !== false
  };
}

function expandHome(value, home = os.homedir()) {
  if (!value) return value;
  if (value === "~") return home;
  if (value.startsWith("~/")) return path.join(home, value.slice(2));
  return value;
}

function keyFromPath(value) {
  return path
    .basename(expandHome(value))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "skills";
}

function uniqueKey(roots, key) {
  let candidate = key;
  let index = 2;
  while (roots[candidate]) {
    candidate = `${key}-${index}`;
    index += 1;
  }
  return candidate;
}

export function encodeId(rootKey, relDir) {
  return Buffer.from(`${rootKey}:${relDir}`, "utf8").toString("base64url");
}

export function decodeId(id) {
  const decoded = Buffer.from(id, "base64url").toString("utf8");
  const index = decoded.indexOf(":");
  if (index <= 0) throw new Error("Invalid skill id");
  return {
    rootKey: decoded.slice(0, index),
    relDir: decoded.slice(index + 1)
  };
}

export function parseSkill(content) {
  const result = {
    name: "",
    description: "",
    body: content,
    hasFrontmatter: false
  };

  if (!content.startsWith("---\n")) return result;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return result;

  result.hasFrontmatter = true;
  const frontmatter = content.slice(4, end).trim();
  result.body = content.slice(content.indexOf("\n", end + 4) + 1);
  for (const line of frontmatter.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].replace(/^["']|["']$/g, "");
    if (key === "name") result.name = value;
    if (key === "description") result.description = value;
  }
  return result;
}

export function buildSkillContent({ name, description, body }) {
  return `---\nname: ${name}\ndescription: ${description || ""}\n---\n\n${body || "# Instructions\n\n"}${body?.endsWith("\n") ? "" : "\n"}`;
}

export function validateSkillName(name) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(name)) {
    throw new Error("Skill name must be 1-80 characters using letters, numbers, dots, underscores, or hyphens.");
  }
}

export class SkillStore {
  constructor(roots = configuredRoots()) {
    this.roots = roots;
  }

  listRoots() {
    return Object.values(this.roots).map((root) => ({
      key: root.key,
      label: root.label,
      path: root.path,
      writable: root.writable
    }));
  }

  root(rootKey) {
    const root = this.roots[rootKey];
    if (!root) throw new Error(`Unknown root: ${rootKey}`);
    return root;
  }

  async list({ includeDisabled = true } = {}) {
    const lists = await Promise.all(
      Object.values(this.roots).map((root) => this.listRoot(root, includeDisabled))
    );
    return lists.flat().sort((a, b) => a.name.localeCompare(b.name) || a.rootKey.localeCompare(b.rootKey));
  }

  async listRoot(root, includeDisabled) {
    const skills = [];
    await this.walk(root.path, async (dir, entries) => {
      const names = new Set(entries.map((entry) => entry.name));
      const active = names.has(SKILL_FILE);
      const disabled = names.has(DISABLED_FILE);
      if (!active && (!includeDisabled || !disabled)) return;

      const relDir = path.relative(root.path, dir) || ".";
      const fileName = active ? SKILL_FILE : DISABLED_FILE;
      const fullPath = path.join(dir, fileName);
      const content = await fs.readFile(fullPath, "utf8");
      const parsed = parseSkill(content);
      const fallbackName = path.basename(dir);
      const stat = await fs.stat(fullPath);
      skills.push({
        id: encodeId(root.key, relDir),
        rootKey: root.key,
        rootLabel: root.label,
        name: parsed.name || fallbackName,
        directory: relDir,
        description: parsed.description,
        writable: root.writable,
        disabled: !active,
        updatedAt: stat.mtime.toISOString()
      });
    });
    return skills;
  }

  async walk(start, visit) {
    let entries;
    try {
      entries = await fs.readdir(start, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    await visit(start, entries);
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => this.walk(path.join(start, entry.name), visit))
    );
  }

  resolveSkill(id, fileName = SKILL_FILE) {
    const { rootKey, relDir } = decodeId(id);
    const root = this.root(rootKey);
    const fullDir = path.resolve(root.path, relDir);
    const rootPath = path.resolve(root.path);
    if (fullDir !== rootPath && !fullDir.startsWith(`${rootPath}${path.sep}`)) {
      throw new Error("Skill path escapes configured root");
    }
    return { root, rootKey, relDir, fullDir, filePath: path.join(fullDir, fileName) };
  }

  async get(id) {
    const target = this.resolveSkill(id);
    let filePath = target.filePath;
    let disabled = false;
    try {
      await fs.access(filePath);
    } catch {
      filePath = path.join(target.fullDir, DISABLED_FILE);
      disabled = true;
    }
    const content = await fs.readFile(filePath, "utf8");
    return {
      ...target,
      id,
      content,
      parsed: parseSkill(content),
      disabled,
      writable: target.root.writable
    };
  }

  async create({ rootKey = "codex", name, description = "", body = "" }) {
    validateSkillName(name);
    const root = this.root(rootKey);
    if (!root.writable) throw new Error("Target root is read-only");
    const fullDir = path.join(root.path, name);
    const filePath = path.join(fullDir, SKILL_FILE);
    await fs.mkdir(fullDir, { recursive: false });
    await fs.writeFile(filePath, buildSkillContent({ name, description, body }), "utf8");
    return this.get(encodeId(root.key, name));
  }

  async update(id, content) {
    const skill = await this.get(id);
    if (!skill.root.writable) throw new Error("Skill root is read-only");
    const fileName = skill.disabled ? DISABLED_FILE : SKILL_FILE;
    const { filePath } = this.resolveSkill(id, fileName);
    await fs.writeFile(filePath, content, "utf8");
    return this.get(id);
  }

  async setDisabled(id, disabled) {
    const skill = await this.get(id);
    if (!skill.root.writable) throw new Error("Skill root is read-only");
    if (skill.disabled === disabled) return skill;
    const from = path.join(skill.fullDir, disabled ? SKILL_FILE : DISABLED_FILE);
    const to = path.join(skill.fullDir, disabled ? DISABLED_FILE : SKILL_FILE);
    await fs.rename(from, to);
    return this.get(id);
  }

  async install(id, { targetRootKey = "codex", name, force = false } = {}) {
    const source = await this.get(id);
    const targetRoot = this.root(targetRootKey);
    if (!targetRoot.writable) throw new Error("Target root is read-only");
    if (source.rootKey === targetRootKey && !name) throw new Error("Choose a different target root or name");
    const targetName = name || path.basename(source.fullDir);
    validateSkillName(targetName);
    const targetDir = path.join(targetRoot.path, targetName);
    await fs.mkdir(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, SKILL_FILE);
    if (!force) {
      try {
        await fs.access(targetFile);
        throw new Error("Target skill already exists. Use force to overwrite.");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await fs.writeFile(targetFile, source.content, "utf8");
    return this.get(encodeId(targetRoot.key, targetName));
  }

  async installFromArchive(id, options = {}) {
    return this.install(id, options);
  }
}
