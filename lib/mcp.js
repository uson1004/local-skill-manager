import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const SESSIONS_DIR = path.join(os.homedir(), ".codex", "sessions");
const ARCHIVED_SESSIONS_DIR = path.join(os.homedir(), ".codex", "archived_sessions");
const CODEX_CONFIG_PATH = path.join(os.homedir(), ".codex", "config.toml");
const SENSITIVE_KEY = /(token|secret|password|cookie|authorization|api[-_]?key|auth)/i;

export async function listMcpServers() {
  try {
    return await listMcpServersFromCli();
  } catch {
    return listMcpServersFromConfig();
  }
}

export async function listRecentMcpCalls({ limit = 50 } = {}) {
  const files = await recentSessionFiles();
  const calls = [];

  for (const filePath of files) {
    if (calls.length >= limit) break;
    const content = await fs.readFile(filePath, "utf8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const call = extractMcpCall(entry, filePath);
      if (!call) continue;
      calls.push(call);
      if (calls.length >= limit) break;
    }
  }

  return calls.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}

export async function listMcpServersFromCli() {
  const { stdout } = await execFile("codex", ["mcp", "list"], { maxBuffer: 1024 * 1024 });
  const rows = parseCodexMcpListRows(stdout);
  const servers = await Promise.all(rows.map((row) => getMcpServerFromCli(row)));
  return servers.sort((a, b) => a.name.localeCompare(b.name));
}

export function parseCodexMcpList(output) {
  return parseCodexMcpListRows(output).map((row) => row.name);
}

export function parseCodexMcpListRows(output) {
  const rows = [];
  let headers = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      headers = [];
      continue;
    }
    if (trimmed.startsWith("Name")) {
      headers = trimmed.split(/\s{2,}/).map((header) => header.toLowerCase().replace(/\s+/g, "_"));
      continue;
    }
    if (!headers.length) continue;

    const values = trimmed.split(/\s{2,}/);
    if (!values.length) continue;
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    rows.push({
      name: row.name,
      status: row.status || (row.enabled === "false" ? "disabled" : "enabled"),
      auth: row.auth || "unknown"
    });
  }

  return rows.filter((row) => row.name);
}

async function getMcpServerFromCli(row) {
  const name = typeof row === "string" ? row : row.name;
  const { stdout } = await execFile("codex", ["mcp", "get", name], { maxBuffer: 1024 * 1024 });
  return normalizeMcpServer({
    name,
    source: "cli",
    status: row.status,
    auth: row.auth,
    ...parseCodexMcpGet(stdout)
  });
}

export function parseCodexMcpGet(output) {
  const lines = output.split("\n");
  const firstLine = lines[0]?.trim();
  const data = {};

  for (const line of lines.slice(1)) {
    const match = line.match(/^\s*([a-z_]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim();
    data[key] = value === "-" ? null : value;
  }

  return {
    name: firstLine || data.name,
    enabled: data.enabled !== "false",
    transport: data.transport || inferTransport(data),
    url: data.url || null,
    bearerTokenEnvVar: data.bearer_token_env_var || null,
    httpHeaderKeys: parseCommaAssignments(data.http_headers),
    envHttpHeaderKeys: parseCommaAssignments(data.env_http_headers),
    command: data.command || null,
    args: parseShellWords(data.args),
    cwd: data.cwd || null,
    envKeys: parseCommaAssignments(data.env),
    status: data.enabled === "false" ? "disabled" : "enabled",
    auth: data.auth || "unknown"
  };
}

export async function listMcpServersFromConfig(configPath = CODEX_CONFIG_PATH) {
  const content = await fs.readFile(configPath, "utf8");
  const config = parseMcpConfigToml(content);
  return Object.values(config).map((server) => normalizeMcpServer({
    source: "config",
    status: server.enabled === false ? "disabled" : "enabled",
    auth: "unknown",
    ...server
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export function parseMcpConfigToml(content) {
  const servers = {};
  let current = null;
  let section = null;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) continue;

    const sectionMatch = line.match(/^\[mcp_servers\.([A-Za-z0-9_-]+)(?:\.([A-Za-z0-9_-]+))?\]$/);
    if (sectionMatch) {
      current = sectionMatch[1];
      section = sectionMatch[2] || "root";
      servers[current] ||= { name: current, args: [], envKeys: [], httpHeaderKeys: [], envHttpHeaderKeys: [] };
      continue;
    }

    if (!current || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = parseTomlValue(line.slice(index + 1).trim());
    const target = servers[current];

    if (section === "root") {
      if (key === "args") target.args = Array.isArray(value) ? value : [];
      else if (key === "command") target.command = value;
      else if (key === "url") target.url = value;
      else if (key === "enabled") target.enabled = value;
      else if (key === "cwd") target.cwd = value;
      else if (key === "bearer_token_env_var") target.bearerTokenEnvVar = value;
    } else if (section === "env") {
      target.envKeys.push(key);
    } else if (section === "http_headers") {
      target.httpHeaderKeys.push(key);
    } else if (section === "env_http_headers") {
      target.envHttpHeaderKeys.push(key);
    }
  }

  return servers;
}

function parseTomlValue(value) {
  if (value.startsWith("\"") && value.endsWith("\"")) return value.slice(1, -1);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => parseTomlValue(part.trim()));
  }
  return value;
}

function inferTransport(server) {
  if (server.url) return "streamable_http";
  if (server.command) return "stdio";
  return "unknown";
}

function normalizeMcpServer(server) {
  return {
    id: `codex:${server.name}`,
    client: "codex",
    name: server.name,
    source: server.source || "config",
    enabled: server.enabled !== false,
    status: server.status || (server.enabled === false ? "disabled" : "enabled"),
    auth: server.auth || "unknown",
    transport: server.transport || inferTransport(server),
    url: server.url || null,
    command: server.command || null,
    args: server.args || [],
    cwd: server.cwd || null,
    bearerTokenEnvVar: server.bearerTokenEnvVar || null,
    envKeys: [...new Set(server.envKeys || [])].sort(),
    httpHeaderKeys: [...new Set(server.httpHeaderKeys || [])].sort(),
    envHttpHeaderKeys: [...new Set(server.envHttpHeaderKeys || [])].sort()
  };
}

async function recentSessionFiles() {
  const sessionFiles = await collectJsonlFiles(SESSIONS_DIR);
  const archivedFiles = await collectJsonlFiles(ARCHIVED_SESSIONS_DIR);
  return [...sessionFiles, ...archivedFiles]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 40);
}

async function collectJsonlFiles(start) {
  const paths = [];
  await walk(start, async (entryPath, dirent) => {
    if (dirent.isFile() && entryPath.endsWith(".jsonl")) paths.push(entryPath);
  });
  return paths;
}

async function walk(start, visit) {
  let entries;
  try {
    entries = await fs.readdir(start, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(start, entry.name);
    await visit(entryPath, entry);
    if (entry.isDirectory()) await walk(entryPath, visit);
  }));
}

export function extractMcpCall(entry, filePath = "") {
  if (entry?.type !== "response_item" || entry.payload?.type !== "function_call") return null;

  const namespace = entry.payload.namespace || "";
  const name = entry.payload.name || "";
  if (!namespace.startsWith("mcp__") && !name.startsWith("mcp__")) return null;

  const server = parseMcpNamespace(namespace || name);
  const argumentsSummary = summarizeArguments(entry.payload.arguments);
  return {
    id: `${entry.timestamp}:${entry.payload.call_id}`,
    timestamp: entry.timestamp,
    callId: entry.payload.call_id,
    toolName: name,
    namespace: namespace || null,
    serverName: server.serverName,
    serverLabel: server.serverLabel,
    toolLabel: name && !name.startsWith("mcp__") ? name : server.toolLabel,
    argumentsSummary,
    sessionFile: filePath
  };
}

function parseMcpNamespace(raw) {
  const parts = raw.split("__").filter(Boolean);
  if (parts[0] !== "mcp") {
    return { serverName: "unknown", serverLabel: "unknown", toolLabel: raw };
  }

  const rest = parts.slice(1);
  if (rest.length >= 3) {
    return {
      serverName: `${rest[0]}:${rest[1]}`,
      serverLabel: `${rest[0]} / ${rest[1]}`,
      toolLabel: rest.slice(2).join("::")
    };
  }

  return {
    serverName: rest[0] || "unknown",
    serverLabel: rest[0] || "unknown",
    toolLabel: rest.slice(1).join("::") || raw
  };
}

function summarizeArguments(raw) {
  if (!raw) return {};
  try {
    return sanitizeValue(JSON.parse(raw));
  } catch {
    return { preview: String(raw).slice(0, 180) };
  }
}

function sanitizeValue(value, key = "") {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => sanitizeValue(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 12)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeValue(entryValue, entryKey)])
    );
  }
  if (typeof value === "string") {
    if (value.length > 160) return `${value.slice(0, 157)}...`;
    return value;
  }
  return value;
}

function parseCommaList(value) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseCommaAssignments(value) {
  return parseCommaList(value).map((item) => item.split("=")[0]);
}

function parseShellWords(value) {
  if (!value) return [];
  return value.split(/\s+/).filter(Boolean);
}
