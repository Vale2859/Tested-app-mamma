const STORAGE_KEYS = {
  doctors: "anvamed_doctors_v2",
  entries: "anvamed_entries_v2",
  invoiceStates: "anvamed_invoice_states_v2",
  login: "anvamed_login_ok"
};

const APP_PIN = "1003";

let doctors = [];
let entries = [];
let invoiceStates = {};
let reportChart = null;

let homeMode = "day";
let homeSelected = todayISO();

// ========================
// UTILS
// ========================
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthISO(dateStr = todayISO()) {
  return dateStr.slice(0, 7);
}

function yearISO(dateStr = todayISO()) {
  return dateStr.slice(0, 4);
}

function euro(value) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ========================
// DATA
// ========================
function loadData() {
  doctors = JSON.parse(localStorage.getItem(STORAGE_KEYS.doctors)) || [];
  entries = JSON.parse(localStorage.getItem(STORAGE_KEYS.entries)) || [];
  invoiceStates = JSON.parse(localStorage.getItem(STORAGE_KEYS.invoiceStates)) || {};
  normalizeData();
}

function normalizeData() {
  doctors = doctors.map((doctor) => {
    const normalizedServices = Array.isArray(doctor.prestazioni)
      ? doctor.prestazioni
          .map((service) => {
            if (typeof service === "string") {
              return { nome: service, perc: 60, count: 0 };
            }

            return {
              nome: service.nome || service.name || "",
              perc: Number(service.perc ?? service.percentuale ?? 60),
              count: Number(service.count ?? 0)
            };
          })
          .filter((service) => service.nome)
      : [];

    return {
      id: Number(doctor.id),
      name: doctor.name || "",
      availability: Array.isArray(doctor.availability) ? doctor.availability : [],
      prestazioni: normalizedServices
    };
  });

  entries = entries.map((entry) => {
    let tipo = entry.tipo || "standard";
    if (tipo === "nero") tipo = "riservata";
    if (tipo === "normale") tipo = "standard";

    return {
      id: Number(entry.id),
      doctorId: Number(entry.doctorId),
      prestazione: entry.prestazione || entry.prest || "",
      data: entry.data || todayISO(),
      importo: Number(entry.importo || 0),
      percMedico: Number(entry.percMedico ?? entry.perc ?? calcPerc(entry)),
      quotaMedico: Number(entry.quotaMedico || 0),
      quotaStruttura: Number(entry.quotaStruttura || 0),
      metodo: entry.metodo || "contanti",
      tipo
    };
  });

  rebuildServiceUsageCounts();
}

function calcPerc(entry) {
  const importo = Number(entry.importo || 0);
  const quotaMedico = Number(entry.quotaMedico || 0);
  if (!importo) return 60;
  return Math.round((quotaMedico / importo) * 100);
}

function rebuildServiceUsageCounts() {
  const counts = new Map();

  entries.forEach((entry) => {
    const key = `${entry.doctorId}__${entry.prestazione}`.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  doctors.forEach((doctor) => {
    doctor.prestazioni.forEach((service) => {
      const key = `${doctor.id}__${service.nome}`.toLowerCase();
      service.count = counts.get(key) || 0;
    });
  });
}

function saveAll() {
  localStorage.setItem(STORAGE_KEYS.doctors, JSON.stringify(doctors));
  localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
  localStorage.setItem(STORAGE_KEYS.invoiceStates, JSON.stringify(invoiceStates));
  renderAll();
}

// ========================
// LOGIN
// ========================
function initLogin() {
  if (localStorage.getItem(STORAGE_KEYS.login) === "ok") {
    document.getElementById("loginScreen")?.classList.add("hidden");
  }
}

function login() {
  const pin = document.getElementById("pinInput")?.value?.trim() || "";
  if (pin !== APP_PIN) {
    alert("PIN errato");
    return;
  }

  localStorage.setItem(STORAGE_KEYS.login, "ok");
  document.getElementById("loginScreen")?.classList.add("hidden");
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.login);
  document.getElementById("loginScreen")?.classList.remove("hidden");
}

// ========================
// NAV
// ========================
function setPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("is-active"));
  document.getElementById(`page-${pageName}`)?.classList.add("is-active");

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.page === pageName);
  });

  if (pageName === "report") renderReport();
  if (pageName === "invoices") renderInvoices();
  if (pageName === "services") renderServices();
}

// ========================
// DOCTORS
// ========================
function addDoctor() {
  const name = prompt("Nome medico");
  if (!name || !name.trim()) return;

  doctors.push({
    id: Date.now(),
    name: name.trim(),
    availability: [],
    prestazioni: []
  });

  saveAll();
}

function renderDoctors() {
  const list = document.getElementById("doctorCardsList");
  if (!list) return;

  list.innerHTML = doctors.length
    ? doctors.map((doctor) => `
        <div class="doctor-card">
          <div class="doctor-name">${escapeHtml(doctor.name)}</div>
          <div class="doctor-sub">${doctor.prestazioni.length} prestazioni salvate</div>
        </div>
      `).join("")
    : `<div class="doctor-card"><div class="doctor-name">Nessun medico inserito</div></div>`;
}

// ========================
// SERVICES
// ========================
function renderServices() {
  const select = document.getElementById("servicesDoctorSelect");
  const list = document.getElementById("servicesList");
  if (!select || !list) return;

  const currentValue = select.value;
  select.innerHTML = doctors
    .map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.name)}</option>`)
    .join("");

  if (currentValue && doctors.some((doctor) => String(doctor.id) === String(currentValue))) {
    select.value = currentValue;
  }

  const doctor = doctors.find((item) => String(item.id) === String(select.value)) || doctors[0];

  list.innerHTML = doctor && doctor.prestazioni.length
    ? doctor.prestazioni
        .sort((a, b) => a.nome.localeCompare(b.nome, "it"))
        .map((service) => `
          <div class="service-card">
            <div class="service-name">${escapeHtml(service.nome)}</div>
            <div class="service-sub">Percentuale medico: ${Number(service.perc)}%</div>
          </div>
        `).join("")
    : `<div class="service-card"><div class="service-name">Nessuna prestazione salvata</div></div>`;
}

function addServiceToDoctor() {
  const doctorId = Number(document.getElementById("servicesDoctorSelect")?.value || 0);
  const serviceName = (document.getElementById("newServiceName")?.value || "").trim();
  const servicePerc = Number(document.getElementById("newServicePerc")?.value || 0);

  if (!doctorId) return alert("Seleziona un medico");
  if (!serviceName) return alert("Inserisci una prestazione");
  if (servicePerc < 0 || servicePerc > 100) return alert("Inserisci una percentuale valida");

  const doctor = doctors.find((item) => item.id === doctorId);
  if (!doctor) return;

  const existing = doctor.prestazioni.find(
    (item) => item.nome.toLowerCase() === serviceName.toLowerCase()
  );

  if (existing) {
    existing.perc = servicePerc;
  } else {
    doctor.prestazioni.push({
      nome: serviceName,
      perc: servicePerc,
      count: 0
    });
  }

  document.getElementById("newServiceName").value = "";
  document.getElementById("newServicePerc").value = "60";
  saveAll();
}

// ========================
// ENTRY MODAL
// ========================
function openEntryModal() {
  if (!doctors.length) {
    alert("Inserisci prima almeno un medico");
    return;
  }

  const modal = document.getElementById("entryModal");
  const doctorSelect = document.getElementById("entryDoctorSelect");
  if (!modal || !doctorSelect) return;

  doctorSelect.innerHTML = doctors
    .map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.name)}</option>`)
    .join("");

  resetEntryModal();
  modal.classList.remove("hidden");
}

function resetEntryModal() {
  document.getElementById("entryServiceInput").value = "";
  document.getElementById("entryDateInput").value = todayISO();
  document.getElementById("entryDateInput").max = todayISO();
  document.getElementById("entryAmountInput").value = "";
  document.getElementById("entryPercInput").value = "60";
}

function closeEntryModal() {
  document.getElementById("entryModal")?.classList.add("hidden");
}

function saveEntry() {
  const doctorId = Number(document.getElementById("entryDoctorSelect")?.value || 0);
  const serviceName = (document.getElementById("entryServiceInput")?.value || "").trim();
  const date = document.getElementById("entryDateInput")?.value || "";
  const amount = Number(document.getElementById("entryAmountInput")?.value || 0);
  const perc = Number(document.getElementById("entryPercInput")?.value || 0);

  if (!doctorId) return alert("Seleziona un medico");
  if (!serviceName) return alert("Inserisci una prestazione");
  if (!date) return alert("Inserisci una data");
  if (date > todayISO()) return alert("Non puoi inserire una data futura");
  if (!amount || amount <= 0) return alert("Inserisci un importo valido");
  if (perc < 0 || perc > 100) return alert("Inserisci una percentuale valida");

  const quotaMedico = amount * perc / 100;
  const quotaStruttura = amount - quotaMedico;

  entries.push({
    id: Date.now(),
    doctorId,
    prestazione: serviceName,
    data: date,
    importo: amount,
    percMedico: perc,
    quotaMedico,
    quotaStruttura,
    metodo: "contanti",
    tipo: "standard"
  });

  const doctor = doctors.find((item) => item.id === doctorId);
  if (doctor) {
    const existing = doctor.prestazioni.find(
      (item) => item.nome.toLowerCase() === serviceName.toLowerCase()
    );

    if (existing) {
      existing.perc = perc;
      existing.count = Number(existing.count || 0) + 1;
    } else {
      doctor.prestazioni.push({
        nome: serviceName,
        perc,
        count: 1
      });
    }
  }

  saveAll();
  closeEntryModal();
}

// ========================
// HOME
// ========================
function getFilteredEntries(mode, selected) {
  if (mode === "day") return entries.filter((entry) => entry.data === selected);
  if (mode === "month") return entries.filter((entry) => entry.data.startsWith(selected));
  return entries.filter((entry) => entry.data.startsWith(selected));
}

function calcTotals(list) {
  return list.reduce((acc, entry) => {
    acc.total += Number(entry.importo || 0);
    acc.structure += Number(entry.quotaStruttura || 0);
    acc.doctors += Number(entry.quotaMedico || 0);
    return acc;
  }, { total: 0, structure: 0, doctors: 0 });
}

function renderMonthSummary() {
  const currentMonthEntries = entries.filter((entry) => entry.data.startsWith(monthISO()));
  const totals = calcTotals(currentMonthEntries);

  document.getElementById("monthTotalValue").textContent = euro(totals.total);
  document.getElementById("monthStructureValue").textContent = euro(totals.structure);
  document.getElementById("monthDoctorsValue").textContent = euro(totals.doctors);
}

function renderHomeFilter() {
  const box = document.getElementById("homeFilterBox");
  if (!box) return;

  document.querySelectorAll("[data-home-mode]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.homeMode === homeMode);
  });

  if (homeMode === "day") {
    box.innerHTML = `<input id="homeDayInput" type="date" max="${todayISO()}" value="${homeSelected}" />`;
    document.getElementById("homeDayInput").addEventListener("input", (e) => {
      homeSelected = e.target.value || todayISO();
      renderHome();
    });
  } else if (homeMode === "month") {
    box.innerHTML = `<input id="homeMonthInput" type="month" value="${homeSelected}" />`;
    document.getElementById("homeMonthInput").addEventListener("input", (e) => {
      homeSelected = e.target.value || monthISO();
      renderHome();
    });
  } else {
    box.innerHTML = `<input id="homeYearInput" type="number" min="2000" max="2099" value="${homeSelected}" />`;
    document.getElementById("homeYearInput").addEventListener("input", (e) => {
      homeSelected = e.target.value || yearISO();
      renderHome();
    });
  }
}

function renderHome() {
  renderMonthSummary();
  renderHomeFilter();

  const filtered = getFilteredEntries(homeMode, homeSelected);
  const container = document.getElementById("homeEntriesList");
  if (!container) return;

  container.innerHTML = filtered.length
    ? filtered
        .sort((a, b) => b.data.localeCompare(a.data))
        .map((entry) => {
          const doctor = doctors.find((item) => item.id === entry.doctorId);

          return `
            <div class="entry-card">
              <div class="entry-title">${escapeHtml(doctor?.name || "Medico")} - ${escapeHtml(entry.prestazione)}</div>
              <div class="entry-sub">${escapeHtml(entry.data)} · ${euro(entry.importo)}</div>
            </div>
          `;
        }).join("")
    : `<div class="entry-card"><div class="entry-title">Nessuna registrazione</div></div>`;
}

// ========================
// REPORT
// ========================
function renderReport() {
  let total = 0;
  let pos = 0;
  let contanti = 0;
  let standard = 0;
  let riservata = 0;

  entries.forEach((entry) => {
    total += Number(entry.importo || 0);
    if (entry.metodo === "pos") pos += Number(entry.importo || 0);
    else contanti += Number(entry.importo || 0);

    if (entry.tipo === "riservata") riservata += Number(entry.importo || 0);
    else standard += Number(entry.importo || 0);
  });

  document.getElementById("reportPosValue").textContent = euro(pos);
  document.getElementById("reportCashValue").textContent = euro(contanti);
  document.getElementById("reportStandardValue").textContent = euro(standard);
  document.getElementById("reportReservedValue").textContent = euro(riservata);

  const canvas = document.getElementById("reportChart");
  if (!canvas || typeof Chart === "undefined") return;

  if (reportChart) reportChart.destroy();

  reportChart = new Chart(canvas, {
    type: "pie",
    data: {
      labels: ["POS", "Contanti"],
      datasets: [{
        data: [pos, contanti],
        backgroundColor: ["#3b82f6", "#4ade80"]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

// ========================
// INVOICES
// ========================
function renderInvoices() {
  const list = document.getElementById("invoiceList");
  if (!list) return;

  list.innerHTML = entries.length
    ? entries
        .sort((a, b) => b.data.localeCompare(a.data))
        .map((entry) => {
          const doctor = doctors.find((item) => item.id === entry.doctorId);

          return `
            <div class="invoice-card">
              <div class="invoice-title">${escapeHtml(doctor?.name || "Medico")} - ${escapeHtml(entry.prestazione)}</div>
              <div class="invoice-sub">${escapeHtml(entry.data)} · ${euro(entry.importo)}</div>
            </div>
          `;
        }).join("")
    : `<div class="invoice-card"><div class="invoice-title">Nessuna fattura</div></div>`;
}

function printPdf() {
  const html = `
    <html>
      <head>
        <title>Riepilogo ANVAMED</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;color:#17202c}
          h1{margin-bottom:18px}
          .row{padding:10px 0;border-bottom:1px solid #d8e2ec}
        </style>
      </head>
      <body>
        <h1>Riepilogo fatture</h1>
        ${entries.map((entry) => {
          const doctor = doctors.find((item) => item.id === entry.doctorId);
          return `
            <div class="row">
              <strong>${escapeHtml(doctor?.name || "Medico")} - ${escapeHtml(entry.prestazione)}</strong><br>
              ${escapeHtml(entry.data)} · ${euro(entry.importo)}
            </div>
          `;
        }).join("")}
      </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) return alert("Popup bloccato dal browser");

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function goBack() {
  window.history.back();
}

// ========================
// BACKUP
// ========================
function exportData() {
  const payload = {
    doctors,
    entries,
    invoiceStates,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `backup-anvamed-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importData(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);

      doctors = parsed.doctors || [];
      entries = parsed.entries || [];
      invoiceStates = parsed.invoiceStates || {};

      normalizeData();
      saveAll();
    } catch {
      alert("Backup non valido");
    }
  };

  reader.readAsText(file);
}

// ========================
// RENDER ALL
// ========================
function renderAll() {
  renderHome();
  renderDoctors();
  renderServices();
  renderReport();
  renderInvoices();
}

// ========================
// EVENTS
// ========================
function bindEvents() {
  document.getElementById("loginBtn")?.addEventListener("click", login);
  document.getElementById("logoutBtn")?.addEventListener("click", logout);

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setPage(btn.dataset.page));
  });

  document.querySelectorAll("[data-home-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      homeMode = btn.dataset.homeMode;
      homeSelected = homeMode === "day" ? todayISO() : homeMode === "month" ? monthISO() : yearISO();
      renderHome();
    });
  });

  document.getElementById("addDoctorBtn")?.addEventListener("click", addDoctor);
  document.getElementById("addServiceBtn")?.addEventListener("click", addServiceToDoctor);

  document.getElementById("openNewEntryBtn")?.addEventListener("click", openEntryModal);
  document.getElementById("saveEntryBtn")?.addEventListener("click", saveEntry);
  document.getElementById("cancelEntryBtn")?.addEventListener("click", closeEntryModal);

  document.getElementById("exportBtn")?.addEventListener("click", exportData);
  document.getElementById("importFile")?.addEventListener("change", (e) => {
    importData(e.target.files[0]);
    e.target.value = "";
  });

  document.getElementById("printPdfBtn")?.addEventListener("click", printPdf);
  document.getElementById("goBackBtn")?.addEventListener("click", goBack);
}

// ========================
// START
// ========================
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  initLogin();
  bindEvents();
  renderAll();
});
