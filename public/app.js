const state = {
  roots: [],
  skills: [],
  selected: null,
  selectedId: null,
  query: "",
  root: "all",
  dirty: false
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
  toast: document.querySelector("#toast")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
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

function filteredSkills() {
  const query = state.query.trim().toLowerCase();
  return state.skills.filter((skill) => {
    const matchesRoot = state.root === "all" || skill.rootKey === state.root;
    const haystack = `${skill.name} ${skill.description} ${skill.rootKey} ${skill.directory}`.toLowerCase();
    return matchesRoot && (!query || haystack.includes(query));
  });
}

function writableRoots() {
  return state.roots.filter((root) => root.writable);
}

function renderRoots() {
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
        renderRoots();
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

function renderList() {
  const skills = filteredSkills();
  els.summary.textContent = `${skills.length}개 표시 / 전체 ${state.skills.length}개`;
  els.list.replaceChildren(
    ...skills.map((skill) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.className = `skill-item${skill.id === state.selectedId ? " active" : ""}`;
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

async function loadSkills() {
  const [rootsData, skillsData] = await Promise.all([
    api("/api/roots"),
    api("/api/skills")
  ]);
  state.roots = rootsData.roots;
  state.skills = skillsData.skills;
  renderRoots();
  renderList();
}

async function selectSkill(id) {
  if (state.dirty && !window.confirm("저장하지 않은 변경사항을 버릴까요?")) return;
  const skill = await api(`/api/skills/${id}`);
  state.selected = skill;
  state.selectedId = id;
  state.dirty = false;

  els.title.textContent = skill.parsed.name || skill.relDir;
  els.rootLabel.textContent = `${skill.root.label} · ${skill.writable ? "writable" : "read-only"}`;
  els.directory.textContent = skill.relDir;
  els.status.textContent = skill.disabled ? "Disabled" : skill.rootKey === "archive" ? "Archive" : "Active";
  els.updatedAt.textContent = new Date(state.skills.find((item) => item.id === id)?.updatedAt || Date.now()).toLocaleString();
  els.editor.value = skill.content;
  els.editor.disabled = !skill.writable;
  els.save.disabled = !skill.writable;
  els.install.hidden = skill.writable || writableRoots().length === 0;
  els.toggle.hidden = !skill.writable;
  els.toggle.textContent = skill.disabled ? "활성화" : "비활성화";
  renderList();
}

async function saveSelected() {
  if (!state.selectedId || !state.selected?.writable) return;
  await api(`/api/skills/${state.selectedId}`, {
    method: "PUT",
    body: JSON.stringify({ content: els.editor.value })
  });
  state.dirty = false;
  els.save.disabled = false;
  await loadSkills();
  toast("저장했습니다.");
}

async function installSelected() {
  if (!state.selectedId) return;
  const target = writableRoots()[0];
  if (!target) return toast("설치 가능한 writable root가 없습니다.");
  const installed = await api(`/api/skills/${state.selectedId}/install`, {
    method: "POST",
    body: JSON.stringify({ targetRootKey: target.key })
  });
  await loadSkills();
  await selectSkill(installed.id);
  toast(`${target.label}에 설치했습니다.`);
}

async function toggleSelected() {
  if (!state.selectedId || !state.selected?.writable) return;
  const action = state.selected.disabled ? "enable" : "disable";
  await api(`/api/skills/${state.selectedId}/${action}`, { method: "POST", body: "{}" });
  await loadSkills();
  await selectSkill(state.selectedId);
  toast(action === "enable" ? "활성화했습니다." : "비활성화했습니다.");
}

els.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderList();
});

els.editor.addEventListener("input", () => {
  state.dirty = true;
  els.save.disabled = !state.selected?.writable;
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
    await selectSkill(created.id);
    toast("새 스킬을 만들었습니다.");
  } catch (error) {
    toast(error.message);
  }
});

loadSkills()
  .then(() => {
    const first = filteredSkills()[0];
    if (first) return selectSkill(first.id);
  })
  .catch((error) => toast(error.message));
