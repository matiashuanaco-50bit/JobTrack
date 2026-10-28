const STORAGE_KEY = "jobtrack_applications_v1";

const STATE_OPTIONS = [
  { value: "Enviado", emoji: "📩", className: "status-sent" },
  { value: "En proceso", emoji: "🔄", className: "status-process" },
  { value: "Rechazado", emoji: "❌", className: "status-rejected" },
  { value: "Oferta", emoji: "🎉", className: "status-offer" }
];

const STATUS_MAP = Object.fromEntries(
  STATE_OPTIONS.map((option) => [option.value, option])
);

const elements = {
  form: document.getElementById("application-form"),
  search: document.getElementById("search-input"),
  filter: document.getElementById("status-filter"),
  list: document.getElementById("application-list"),
  stats: document.getElementById("stats-container"),
  modal: document.getElementById("edit-modal"),
  editForm: document.getElementById("edit-form"),
  closeModalBtn: document.getElementById("close-modal"),
  cancelEditBtn: document.getElementById("cancel-edit"),
  toastContainer: document.getElementById("toast-container")
};

let applications = [];
let editingId = null;
let saveNoteTimeout = null;

function generateId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };

  return String(value ?? "").replace(/[&<>\"']/g, (char) => map[char]);
}

function formatDate(dateString) {
  if (!dateString) return "Sin fecha";
  const date = new Date(dateString + "T00:00:00");
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function buildFilterOptions() {
  elements.filter.innerHTML = `
    <option value="all">Todos</option>
    ${STATE_OPTIONS.map(
      (option) =>
        `<option value="${option.value}">${option.emoji} ${option.value}</option>`
    ).join("")}
  `;
}

function createMockApplications() {
  return [
    {
      id: generateId(),
      company: "Mercado Libre",
      role: "Frontend Developer",
      date: "2026-10-10",
      state: "En proceso",
      notes: "Entrevista técnica agendada para el viernes. Revisar React hooks.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: generateId(),
      company: "Globant",
      role: "UI Engineer",
      date: "2026-10-14",
      state: "Enviado",
      notes: "Se enviaron CV y portfolio. Esperando respuesta del recruiter.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: generateId(),
      company: "Spotify",
      role: "Product Designer",
      date: "2026-10-18",
      state: "Oferta",
      notes: "Oferta recibida. Revisar condiciones y fecha de respuesta.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

function loadApplications() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      const mockData = createMockApplications();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockData));
      return mockData;
    }

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      const mockData = createMockApplications();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockData));
      return mockData;
    }

    return parsed;
  } catch (error) {
    console.error("No se pudo leer el localStorage:", error);
    const fallback = createMockApplications();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

function saveApplications() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  elements.toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 200);
  }, 2200);
}

function renderStats() {
  const counts = {
    Total: applications.length,
    Enviadas: applications.filter((app) => app.state === "Enviado").length,
    "En proceso": applications.filter((app) => app.state === "En proceso").length,
    Ofertas: applications.filter((app) => app.state === "Oferta").length,
    Rechazadas: applications.filter((app) => app.state === "Rechazado").length
  };

  const cards = [
    { label: "Total", key: "Total", className: "total" },
    { label: "Enviadas", key: "Enviadas", className: "sent" },
    { label: "En proceso", key: "En proceso", className: "process" },
    { label: "Ofertas", key: "Ofertas", className: "offer" },
    { label: "Rechazadas", key: "Rechazadas", className: "rejected" }
  ];

  elements.stats.innerHTML = cards
    .map(
      (card) => `
        <article class="stat-card ${card.className}">
          <span class="stat-label">${card.label}</span>
          <strong class="stat-value">${counts[card.key]}</strong>
        </article>
      `
    )
    .join("");
}

function renderList() {
  const searchText = elements.search.value.trim().toLowerCase();
  const selectedState = elements.filter.value;

  const filtered = applications.filter((app) => {
    const matchesSearch =
      !searchText ||
      `${app.company} ${app.role}`.toLowerCase().includes(searchText);

    const matchesState =
      selectedState === "all" || app.state === selectedState;

    return matchesSearch && matchesState;
  });

  if (filtered.length === 0) {
    elements.list.innerHTML = `
      <div class="empty-state">
        <div class="icon">📭</div>
        <div>
          <h3>No hay postulaciones</h3>
          <p>
            Aún no agregaste ninguna oportunidad. Comenzá creando tu primera postulación.
          </p>
        </div>
      </div>
    `;
    return;
  }

  elements.list.innerHTML = filtered
    .map((app) => {
      const badge = STATUS_MAP[app.state] || STATUS_MAP["Enviado"];
      const safeNotes = escapeHtml(app.notes || "");
      return `
        <article class="application-card" data-id="${app.id}">
          <div class="card-header">
            <div class="company-block">
              <span class="company">${escapeHtml(app.company)}</span>
              <h3>${escapeHtml(app.role)}</h3>
            </div>

            <span class="status-badge ${badge.className}">
              ${badge.emoji} ${app.state}
            </span>
          </div>

          <div class="card-meta">
            <div class="meta-item">
              <span class="meta-label">Fecha</span>
              <strong>${formatDate(app.date)}</strong>
            </div>
          </div>

          <div class="status-editor">
            <label for="state-${app.id}">Estado</label>
            <select id="state-${app.id}" class="status-select" data-id="${app.id}">
              ${STATE_OPTIONS.map(
                (option) => `
                  <option value="${option.value}" ${
                    app.state === option.value ? "selected" : ""
                  }>
                    ${option.emoji} ${option.value}
                  </option>
                `
              ).join("")}
            </select>
          </div>

          <div class="notes-box">
            <label>Notas</label>
            <textarea
              class="notes-input"
              data-id="${app.id}"
              rows="3"
              placeholder="Escribe un comentario o actualización..."
            >${safeNotes}</textarea>

            <div class="notes-actions">
              <button type="button" class="ghost-btn edit-btn" data-id="${app.id}">
                Editar
              </button>
              <button type="button" class="danger-btn delete-btn" data-id="${app.id}">
                Eliminar
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderApp() {
  renderStats();
  renderList();
}

function setDefaultDate() {
  const dateInput = document.getElementById("date");
  dateInput.value = getToday();
}

function resetForm() {
  elements.form.reset();
  setDefaultDate();
  document.getElementById("state").value = "Enviado";
}

function saveNoteNow(id) {
  const target = applications.find((app) => app.id === id);
  if (!target) return;

  const textarea = document.querySelector(`textarea[data-id="${id}"]`);
  if (!textarea) return;

  target.notes = textarea.value.trim();
  target.updatedAt = new Date().toISOString();

  saveApplications();
}

function handleAddApplication(event) {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const company = String(formData.get("company") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const date = String(formData.get("date") || "").trim();
  const state = String(formData.get("state") || "Enviado");

  if (!company || !role || !date) {
    showToast("Completá empresa, rol y fecha.", "error");
    return;
  }

  const newApplication = {
    id: generateId(),
    company,
    role,
    date,
    state,
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  applications.unshift(newApplication);
  saveApplications();
  renderApp();
  resetForm();
  showToast("Postulación guardada con éxito.", "success");
}

function updateStateById(id, nextState) {
  const target = applications.find((app) => app.id === id);
  if (!target) return;

  target.state = nextState;
  target.updatedAt = new Date().toISOString();

  saveApplications();
  renderApp();
  showToast(`Estado actualizado a "${nextState}".`, "success");
}

function deleteApplicationById(id) {
  const target = applications.find((app) => app.id === id);
  if (!target) return;

  const confirmed = window.confirm(
    `¿Querés eliminar la postulación de ${target.company}?`
  );

  if (!confirmed) return;

  applications = applications.filter((app) => app.id !== id);
  saveApplications();
  renderApp();
  showToast("Postulación eliminada.", "success");
}

function openEditModal(id) {
  const target = applications.find((app) => app.id === id);
  if (!target) return;

  editingId = id;

  document.getElementById("edit-company").value = target.company;
  document.getElementById("edit-role").value = target.role;
  document.getElementById("edit-date").value = target.date;
  document.getElementById("edit-state").value = target.state;

  elements.modal.classList.remove("hidden");
  elements.modal.setAttribute("aria-hidden", "false");
}

function closeEditModal() {
  editingId = null;
  elements.editForm.reset();
  elements.modal.classList.add("hidden");
  elements.modal.setAttribute("aria-hidden", "true");
}

function handleEditApplication(event) {
  event.preventDefault();

  if (!editingId) return;

  const company = document.getElementById("edit-company").value.trim();
  const role = document.getElementById("edit-role").value.trim();
  const date = document.getElementById("edit-date").value.trim();
  const state = document.getElementById("edit-state").value;

  if (!company || !role || !date) {
    showToast("Completá los campos de la postulación.", "error");
    return;
  }

  const target = applications.find((app) => app.id === editingId);
  if (!target) return;

  target.company = company;
  target.role = role;
  target.date = date;
  target.state = state;
  target.updatedAt = new Date().toISOString();

  saveApplications();
  renderApp();
  closeEditModal();
  showToast("Postulación actualizada.", "success");
}

function bindEvents() {
  elements.form.addEventListener("submit", handleAddApplication);

  elements.search.addEventListener("input", renderApp);

  elements.filter.addEventListener("change", renderApp);

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches(".status-select")) {
      const id = target.dataset.id;
      updateStateById(id, target.value);
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;

    if (target.matches(".notes-input")) {
      const id = target.dataset.id;

      clearTimeout(saveNoteTimeout);

      saveNoteTimeout = setTimeout(() => {
        saveNoteNow(id);
      }, 250);
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    const id = target.dataset.id;

    if (!id) return;

    if (target.matches(".delete-btn")) {
      deleteApplicationById(id);
    }

    if (target.matches(".edit-btn")) {
      openEditModal(id);
    }
  });

  elements.editForm.addEventListener("submit", handleEditApplication);

  elements.closeModalBtn.addEventListener("click", closeEditModal);
  elements.cancelEditBtn.addEventListener("click", closeEditModal);

  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) {
      closeEditModal();
    }
  });
}

function init() {
  applications = loadApplications();
  buildFilterOptions();
  setDefaultDate();
  bindEvents();
  renderApp();
}

init();
