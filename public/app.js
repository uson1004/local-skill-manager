const state = {
  mode: "skills",
  roots: [],
  skills: [],
  mcpServers: [],
  mcpCalls: [],
  selectedSkill: null,
  selectedSkillId: null,
  selectedMcpName: null,
  query: "",
  root: "all",
  mcpFilter: "all",
  dirty: false,
  loaded: {
    skills: false,
    mcp: false
  }
};

const els = {
  list: document.querySelector("#skillList"),
  summary: document.querySelector("#summary"),
  search: document.querySelector("#search"),
  filters: document.querySelector("#filters"),
  createRoot: document.querySelector("#createRoot"),
  title: document.querySelector("#title"),
  rootLabel: document.querySelector("#rootLabel"),
  directory: document.querySelector("#directory"),
  status: document.querySelector("#status"),
  updatedAt: document.querySelector("#updatedAt"),
  editor: document.querySelector("#editor"),
  save: document.querySelector("#saveButton"),
  install: document.querySelector("#installButton"),
  toggle: document.querySelector("#toggleButton"),
  create: document.querySelector("#newButton"),
  dialog: document.querySelector("#createDialog"),
  createForm: document.querySelector("#createForm"),
  toast: document.querySelector("#toast"),
  modeSwitch: document.querySelector("#modeSwitch")
};

async function api(resource, options = {}) {
  const response = await fetch(resource, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove("visible"), 2600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function writableRoots() {
  return state.roots.filter((root) => root.writable);
}

function filteredSkills() {
  const query = state.query.trim().toLowerCase();
  return state.skills.filter((skill) => {
    const matchesRoot = state.root === "all" || skill.rootKey === state.root;
    const haystack = `${skill.name} ${skill.description} ${skill.rootKey} ${skill.directory}`.toLowerCase();
    return matchesRoot && (!query || haystack.includes(query));
  });
}

function filteredMcpServers() {
  const query = state.query.trim().toLowerCase();
  return state.mcpServers.filter((server) => {
    const matchesStatus = state.mcpFilter === "all" || server.status === state.mcpFilter;
    const haystack = [
      server.name,
      server.transport,
      server.status,
      server.source,
      server.url,
      server.command,
      server.args.join(" ")
    ].join(" ").toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });
}

function renderModeSwitch() {
  const buttons = els.modeSwitch.querySelectorAll("button[data-mode]");
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });
}

function renderFilters() {
  if (state.mode === "skills") return renderSkillFilters();
  return renderMcpFilters();
}

function renderSkillFilters() {
  const rootButtons = [
    { key: "all", label: "All" },
    ...state.roots.map((root) => ({ key: root.key, label: root.label }))
  ];
  els.filters.replaceChildren(
    ...rootButtons.map((root) => {
      const button = document.createElement("button");
      button.className = `filter${root.key === state.root ? " active" : ""}`;
      button.dataset.root = root.key;
      button.textContent = root.key === "all" ? "All" : root.label.replace(/\s+skills$/i, "");
      button.addEventListener("click", () => {
        state.root = root.key;
        renderFilters();
        renderList();
      });
      return button;
    })
  );

  els.createRoot.replaceChildren(
    ...writableRoots().map((root) => {
      const option = document.createElement("option");
      option.value = root.key;
      option.textContent = root.label;
      return option;
    })
  );
}

function renderMcpFilters() {
  const filters = [
    { key: "all", label: "All" },
    { key: "enabled", label: "Enabled" },
    { key: "disabled", label: "Disabled" }
  ];
  els.filters.replaceChildren(
    ...filters.map((item) => {
      const button = document.createElement("button");
      button.className = `filter${item.key === state.mcpFilter ? " active" : ""}`;
      button.textContent = item.label;
      button.addEventListener("click", () => {
        state.mcpFilter = item.key;
        renderFilters();
        renderList();
      });
      return button;
    })
  );
}

function renderList() {
  if (state.mode === "skills") return renderSkillList();
  return renderMcpList();
}

function renderSkillList() {
  const skills = filteredSkills();
  els.summary.textContent = `${skills.length}개 표시 / 전체 ${state.skills.length}개`;
  els.list.replaceChildren(
    ...skills.map((skill) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.className = `skill-item${skill.id === state.selectedSkillId ? " active" : ""}`;
      button.innerHTML = `
        <strong>${escapeHtml(skill.name)}</strong>
        <span>${escapeHtml(skill.description || skill.directory)}</span>
        <em>${escapeHtml(skill.rootKey)}${skill.disabled ? " · disabled" : ""}</em>
      `;
      button.addEventListener("click", () => selectSkill(skill.id));
      item.append(button);
      return item;
    })
  );
}

function renderMcpList() {
  const servers = filteredMcpServers();
  els.summary.textContent = `${servers.length}개 표시 / 전체 ${state.mcpServers.length}개`;
  els.list.replaceChildren(
    ...servers.map((server) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const stats = mcpStats(server.name);
      button.className = `skill-item${server.name === state.selectedMcpName ? " active" : ""}`;
      button.innerHTML = `
        <strong>${escapeHtml(server.name)}</strong>
        <span>${escapeHtml(server.url || [server.command, ...server.args].filter(Boolean).join(" ") || server.transport)}</span>
        <em>${escapeHtml(server.transport)} · ${escapeHtml(server.status)}${stats.count ? ` · calls ${stats.count}` : ""}</em>
      `;
      button.addEventListener("click", () => selectMcp(server.name));
      item.append(button);
      return item;
    })
  );
}

async function loadSkills() {
  const [rootsData, skillsData] = await Promise.all([
    api("/api/roots"),
    api("/api/skills")
  ]);
  state.roots = rootsData.roots;
  state.skills = skillsData.skills;
  state.loaded.skills = true;
}

async function loadMcp() {
  const [serversData, logsData] = await Promise.all([
    api("/api/mcp"),
    api("/api/mcp/logs?limit=80")
  ]);
  state.mcpServers = serversData.servers;
  state.mcpCalls = logsData.calls;
  state.loaded.mcp = true;
}

async function selectSkill(id) {
  if (state.mode !== "skills") return;
  if (state.dirty && !window.confirm("저장하지 않은 변경사항을 버릴까요?")) return;
  const skill = await api(`/api/skills/${id}`);
  state.selectedSkill = skill;
  state.selectedSkillId = id;
  state.dirty = false;
  renderSkillDetail(skill);
  renderList();
}

function renderSkillDetail(skill) {
  const item = state.skills.find((entry) => entry.id === skill.id);
  els.title.textContent = skill.parsed.name || skill.relDir;
  els.rootLabel.textContent = `${skill.root.label} · ${skill.writable ? "writable" : "read-only"}`;
  els.directory.textContent = skill.relDir;
  els.status.textContent = skill.disabled ? "Disabled" : skill.rootKey === "archive" ? "Archive" : "Active";
  els.updatedAt.textContent = new Date(item?.updatedAt || Date.now()).toLocaleString();
  els.editor.value = skill.content;
  els.editor.disabled = !skill.writable;
  els.save.disabled = !skill.writable;
  els.install.hidden = skill.writable || writableRoots().length === 0;
  els.toggle.hidden = !skill.writable;
  els.toggle.textContent = skill.disabled ? "활성화" : "비활성화";
  els.create.hidden = false;
}

async function selectMcp(name) {
  state.selectedMcpName = name;
  const server = state.mcpServers.find((entry) => entry.name === name);
  if (!server) return;
  renderMcpDetail(server);
  renderList();
}

function renderMcpDetail(server) {
  const stats = mcpStats(server.name);
  els.title.textContent = server.name;
  els.rootLabel.textContent = `${server.transport} · ${server.source}`;
  els.directory.textContent = server.url || [server.command, ...server.args].filter(Boolean).join(" ") || "-";
  els.status.textContent = server.status;
  els.updatedAt.textContent = stats.lastCalledAt ? new Date(stats.lastCalledAt).toLocaleString() : "-";
  els.editor.value = buildMcpDetailText(server, stats.calls);
  els.editor.disabled = true;
  els.save.disabled = true;
  els.install.hidden = true;
  els.toggle.hidden = true;
  els.create.hidden = true;
}

function buildMcpDetailText(server, calls) {
  const summary = {
    client: server.client,
    transport: server.transport,
    source: server.source,
    enabled: server.enabled,
    status: server.status,
    auth: server.auth,
    url: server.url,
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    bearerTokenEnvVar: server.bearerTokenEnvVar,
    envKeys: server.envKeys,
    httpHeaderKeys: server.httpHeaderKeys,
    envHttpHeaderKeys: server.envHttpHeaderKeys,
    recentCalls: calls.map((call) => ({
      timestamp: call.timestamp,
      toolName: call.toolName,
      toolLabel: call.toolLabel,
      serverLabel: call.serverLabel,
      arguments: call.argumentsSummary
    }))
  };
  return JSON.stringify(summary, null, 2);
}

function mcpStats(serverName) {
  const calls = state.mcpCalls.filter((call) => call.serverName === serverName || call.serverLabel === serverName);
  return {
    count: calls.length,
    lastCalledAt: calls[0]?.timestamp || null,
    calls: calls.slice(0, 8)
  };
}

async function saveSelected() {
  if (!state.selectedSkillId || !state.selectedSkill?.writable) return;
  await api(`/api/skills/${state.selectedSkillId}`, {
    method: "PUT",
    body: JSON.stringify({ content: els.editor.value })
  });
  state.dirty = false;
  await loadSkills();
  await selectSkill(state.selectedSkillId);
  toast("저장했습니다.");
}

async function installSelected() {
  if (!state.selectedSkillId) return;
  const target = writableRoots()[0];
  if (!target) return toast("설치 가능한 writable root가 없습니다.");
  const installed = await api(`/api/skills/${state.selectedSkillId}/install`, {
    method: "POST",
    body: JSON.stringify({ targetRootKey: target.key })
  });
  await loadSkills();
  await selectSkill(installed.id);
  toast(`${target.label}에 설치했습니다.`);
}

async function toggleSelected() {
  if (!state.selectedSkillId || !state.selectedSkill?.writable) return;
  const action = state.selectedSkill.disabled ? "enable" : "disable";
  await api(`/api/skills/${state.selectedSkillId}/${action}`, { method: "POST", body: "{}" });
  await loadSkills();
  await selectSkill(state.selectedSkillId);
  toast(action === "enable" ? "활성화했습니다." : "비활성화했습니다.");
}

function resetDirtySelection() {
  state.selectedSkill = null;
  state.selectedSkillId = null;
  state.dirty = false;
}

async function switchMode(mode) {
  if (mode === state.mode) return;
  if (state.mode === "skills" && state.dirty && !window.confirm("저장하지 않은 변경사항을 버릴까요?")) return;
  state.mode = mode;
  if (mode === "skills") {
    els.search.placeholder = "name, description, root";
    if (!state.loaded.skills) await loadSkills();
    if (!state.selectedSkillId && filteredSkills()[0]) await selectSkill(filteredSkills()[0].id);
    if (state.selectedSkillId && !state.selectedSkill) await selectSkill(state.selectedSkillId);
  } else {
    resetDirtySelection();
    els.search.placeholder = "name, transport, status";
    if (!state.loaded.mcp) await loadMcp();
    if (!state.selectedMcpName && filteredMcpServers()[0]) selectMcp(filteredMcpServers()[0].name);
    if (state.selectedMcpName) selectMcp(state.selectedMcpName);
  }
  renderModeSwitch();
  renderFilters();
  renderList();
}

els.modeSwitch.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  switchMode(button.dataset.mode).catch((error) => toast(error.message));
});

els.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderList();
});

els.editor.addEventListener("input", () => {
  if (state.mode !== "skills") return;
  state.dirty = true;
  els.save.disabled = !state.selectedSkill?.writable;
});

els.save.addEventListener("click", () => saveSelected().catch((error) => toast(error.message)));
els.install.addEventListener("click", () => installSelected().catch((error) => toast(error.message)));
els.toggle.addEventListener("click", () => toggleSelected().catch((error) => toast(error.message)));
els.create.addEventListener("click", () => els.dialog.showModal());

els.createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitter = event.submitter?.value;
  if (submitter !== "create") {
    els.dialog.close();
    return;
  }
  const form = new FormData(els.createForm);
  try {
    const created = await api("/api/skills", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    els.dialog.close();
    els.createForm.reset();
    await loadSkills();
    if (state.mode === "skills") await selectSkill(created.id);
    toast("새 스킬을 만들었습니다.");
  } catch (error) {
    toast(error.message);
  }
});

Promise.allSettled([loadSkills(), loadMcp()])
  .then(async (results) => {
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected) toast(rejected.reason.message);
    renderModeSwitch();
    renderFilters();
    renderList();
    const firstSkill = filteredSkills()[0];
    if (firstSkill) await selectSkill(firstSkill.id);
  });
