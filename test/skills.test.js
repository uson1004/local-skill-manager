import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  SkillStore,
  buildSkillContent,
  configuredRoots,
  decodeId,
  defaultRoots,
  encodeId,
  parseExtraRoots,
  parseSkill
} from "../lib/skills.js";

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-store-"));
  const roots = {
    codex: { key: "codex", label: "Codex", path: path.join(dir, "codex"), writable: true },
    agents: { key: "agents", label: "Agents", path: path.join(dir, "agents"), writable: true },
    archive: { key: "archive", label: "Archive", path: path.join(dir, "archive"), writable: false }
  };
  await Promise.all(Object.values(roots).map((root) => fs.mkdir(root.path, { recursive: true })));
  return { dir, roots, store: new SkillStore(roots) };
}

test("parses skill frontmatter", () => {
  const parsed = parseSkill("---\nname: demo\ndescription: useful\n---\n\n# Body\n");
  assert.equal(parsed.name, "demo");
  assert.equal(parsed.description, "useful");
  assert.equal(parsed.body, "\n# Body\n");
});

test("encodes and decodes ids with nested archive paths", () => {
  const id = encodeId("archive", "android/api-model-generator");
  assert.deepEqual(decodeId(id), {
    rootKey: "archive",
    relDir: "android/api-model-generator"
  });
});

test("default roots include common local skill folders", () => {
  const roots = defaultRoots("/home/user");
  assert.deepEqual(Object.keys(roots), ["codex", "codex-system", "agents", "claude", "local", "archive"]);
  assert.equal(roots["codex-system"].writable, false);
  assert.equal(roots.local.path, "/home/user/skills");
});

test("parses multiple custom roots from SKILL_ROOTS", () => {
  const roots = parseExtraRoots("~/work/skills,/tmp/shared", "/home/user");
  assert.equal(roots.length, 2);
  assert.equal(roots[0].path, "/home/user/work/skills");
  assert.equal(roots[1].path, "/tmp/shared");
});

test("parses labeled read-only custom roots from JSON", () => {
  const roots = configuredRoots({
    home: "/home/user",
    env: {
      SKILL_ROOTS: JSON.stringify([
        { key: "work", label: "Work skills", path: "~/work/skills", writable: true },
        { key: "shared", label: "Shared archive", path: "~/shared/skills", writable: false }
      ])
    }
  });
  assert.equal(roots.work.path, "/home/user/work/skills");
  assert.equal(roots.shared.writable, false);
});

test("creates, lists, updates, and disables a skill", async () => {
  const { store } = await fixture();
  const created = await store.create({ rootKey: "codex", name: "demo", description: "Demo skill", body: "# Demo\n" });
  assert.equal(created.parsed.name, "demo");

  const list = await store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].description, "Demo skill");

  await store.update(created.id, buildSkillContent({ name: "demo", description: "Changed", body: "# Changed\n" }));
  const updated = await store.get(created.id);
  assert.match(updated.content, /Changed/);

  const disabled = await store.setDisabled(created.id, true);
  assert.equal(disabled.disabled, true);
});

test("installs a read-only skill into a writable root", async () => {
  const { roots, store } = await fixture();
  const archiveDir = path.join(roots.archive.path, "android", "modeler");
  await fs.mkdir(archiveDir, { recursive: true });
  await fs.writeFile(path.join(archiveDir, "SKILL.md"), buildSkillContent({
    name: "modeler",
    description: "Archive skill",
    body: "# Modeler\n"
  }));

  const archiveId = encodeId("archive", "android/modeler");
  const installed = await store.install(archiveId, { targetRootKey: "codex", name: "modeler" });
  assert.equal(installed.rootKey, "codex");
  assert.match(installed.content, /Archive skill/);
});

test("rejects path traversal ids", async () => {
  const { store } = await fixture();
  const id = encodeId("codex", "../outside");
  assert.throws(() => store.resolveSkill(id), /escapes configured root/);
});
