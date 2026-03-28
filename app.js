const STORAGE_KEYS = {
  doctors: "anvamed_doctors_v3",
  entries: "anvamed_entries_v3",
  invoiceStates: "anvamed_invoice_states_v3",
  uiState: "anvamed_ui_state_v3"
};

const LEGACY_STORAGE_KEYS = {
  doctors: "anvamed_doctors_v2",
  entries: "anvamed_entries_v2",
  invoiceStates: "anvamed_invoice_states_v2"
};

const PIE_COLORS = ["#2d8cff", "#59cf82", "#9a62d8", "#eead42", "#dd5a52", "#39b86b", "#6e7b88"];
const WEEK_DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

let doctors = [];
let entries = [];
let invoiceStates = {};

let currentDoctorId = null;
let editingEntryId = null;

let homeFilterType = "giorno";
let homeFilterValue = "";
let reportFilterType = "giorno";
let reportFilterValue = "";
let currentPage = "homePage";

function pad(value) {
  return String(value).padStart(2, "0");
}

function getLocalTodayDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function todayISO() {
  const d = getLocalTodayDate();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentMonthISO() {
  return todayISO().slice(0, 7);
}

function currentYearISO() {
  return todayISO().slice(0, 4);
}

function monthStartISO(monthIso) {
  return `${monthIso}-01`;
}

function monthEndISO(monthIso) {
  const [year, month] = monthIso.split("-").map(Number);
  const d = new Date(year, month, 0);
  return `${year}-${pad(month)}-${pad(d.getDate())}`;
}

function normalizeDateISO(value, fallback = todayISO()) {
  if (typeof value !== "string") return fallback;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return fallback;
  const [_, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return fallback;
  }
  const iso = `${y}-${m}-${d}`;
  return iso > todayISO() ? fallback : iso;
}

function normalizeMonthISO(value, fallback = currentMonthISO()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return fallback;
  const [y, m] = value.split("-").map(Number);
  if (m < 1 || m > 12) return fallback;
  return value > currentMonthISO() ? fallback : value;
}

function normalizeYearISO(value, fallback = currentYearISO()) {
  const year = String(value || fallback);
  if (!/^\d{4}$/.test(year)) return fallback;
  return year > currentYearISO() ? fallback : year;
}

function createId() {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
}

function currency(value) {
  return "€" + Number(value || 0).toFixed(2);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function monthLabel(monthIso) {
  const [y, m] = monthIso.split("-");
  const mesi = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];
  return `${mesi[Number(m) - 1]} ${y}`;
}

function formatDateLabel(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function periodLabel(type, value) {
  if (type === "giorno") return formatDateLabel(value);
  if (type === "mese") return monthLabel(value);
  return String(value);
}

function setSaveStatus(text, isWarning = false) {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("warning", Boolean(isWarning));
}

function readJsonStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (error) {
    console.error("Storage parse error", key, error);
    return null;
  }
}

function getDoctorById(id) {
  return doctors.find((d) => d.id === id) || null;
}

function getDoctorNameById(id) {
  const doctor = getDoctorById(id);
  return doctor ? doctor.name : "";
}

function sanitizeDoctor(raw) {
  const name = String(raw?.name || "").trim();
  if (!name) return null;

  const availability = Array.isArray(raw?.availability)
    ? raw.availability.filter((item) => typeof item === "string")
    : [];

  return {
    id: Number(raw?.id) || createId(),
    name,
    availability: [...new Set(availability)]
  };
}

function sanitizeEntry(raw) {
  const doctorId = Number(raw?.doctorId);
  const prestazione = String(raw?.prestazione || "").trim();
  const data = normalizeDateISO(raw?.data, todayISO());
  const importo = Number(raw?.importo || 0);
  const percMedico = Number(raw?.percMedico);

  if (!doctorId || !prestazione || !Number.isFinite(importo) || importo <= 0) return null;

  const safePerc = Number.isFinite(percMedico) ? Math.max(0, Math.min(100, percMedico)) : 60;
  const quotaMedico = Number((importo * safePerc / 100).toFixed(2));
  const quotaStruttura = Number((importo - quotaMedico).toFixed(2));

  return {
    id: Number(raw?.id) || createId(),
    doctorId,
    prestazione,
    data,
    importo: Number(importo.toFixed(2)),
    percMedico: safePerc,
    quotaMedico,
    quotaStruttura
  };
}

function normalizeInvoiceStates(raw) {
  const result = {};
  if (!raw || typeof raw !== "object") return result;
  Object.entries(raw).forEach(([key, value]) => {
    if (typeof key !== "string") return;
    if (["da_fatturare", "fatturato", "pagato"].includes(value)) result[key] = value;
  });
  return result;
}

function loadData() {
  const storedDoctors = readJsonStorage(STORAGE_KEYS.doctors) ?? readJsonStorage(LEGACY_STORAGE_KEYS.doctors) ?? [];
  const storedEntries = readJsonStorage(STORAGE_KEYS.entries) ?? readJsonStorage(LEGACY_STORAGE_KEYS.entries) ?? [];
  const storedInvoiceStates = readJsonStorage(STORAGE_KEYS.invoiceStates) ?? readJsonStorage(LEGACY_STORAGE_KEYS.invoiceStates) ?? {};
  const doctorMap = new Map();

  doctors = Array.isArray(storedDoctors)
    ? storedDoctors.map(sanitizeDoctor).filter(Boolean).filter((doctor) => {
        if (doctorMap.has(doctor.name.toLowerCase())) return false;
        doctorMap.set(doctor.name.toLowerCase(), doctor.id);
        return true;
      })
    : [];

  const validDoctorIds = new Set(doctors.map((doctor) => doctor.id));
  entries = Array.isArray(storedEntries)
    ? storedEntries.map(sanitizeEntry).filter((entry) => entry && validDoctorIds.has(entry.doctorId))
        .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id)
    : [];

  invoiceStates = normalizeInvoiceStates(storedInvoiceStates);
}

function saveUiState() {
  const state = {
    currentPage,
    currentDoctorId,
    homeFilterType,
    homeFilterValue,
    reportFilterType,
    reportFilterValue,
    doctorDetailMonth: document.getElementById("doctorDetailMonth")?.value || currentMonthISO(),
    fattureDateFrom: document.getElementById("fattureDateFrom")?.value || monthStartISO(currentMonthISO()),
    fattureDateTo: document.getElementById("fattureDateTo")?.value || todayISO(),
    fattureStatusFilter: document.getElementById("fattureStatusFilter")?.value || "tutti",
    calendarMonth: document.getElementById("calendarMonth")?.value || currentMonthISO()
  };
  localStorage.setItem(STORAGE_KEYS.uiState, JSON.stringify(state));
}

function loadUiState() {
  const state = readJsonStorage(STORAGE_KEYS.uiState) || {};
  homeFilterType = ["giorno", "mese", "anno"].includes(state.homeFilterType) ? state.homeFilterType : "giorno";
  reportFilterType = ["giorno", "mese", "anno"].includes(state.reportFilterType) ? state.reportFilterType : "giorno";
  homeFilterValue = homeFilterType === "giorno"
    ? normalizeDateISO(state.homeFilterValue, todayISO())
    : homeFilterType === "mese"
      ? normalizeMonthISO(state.homeFilterValue, currentMonthISO())
      : normalizeYearISO(state.homeFilterValue, currentYearISO());
  reportFilterValue = reportFilterType === "giorno"
    ? normalizeDateISO(state.reportFilterValue, todayISO())
    : reportFilterType === "mese"
      ? normalizeMonthISO(state.reportFilterValue, currentMonthISO())
      : normalizeYearISO(state.reportFilterValue, currentYearISO());
  currentDoctorId = doctors.some((doctor) => doctor.id === state.currentDoctorId) ? state.currentDoctorId : null;
  currentPage = typeof state.currentPage === "string" ? state.currentPage : "homePage";

  const doctorMonth = normalizeMonthISO(state.doctorDetailMonth, currentMonthISO());
  const fattureDateFrom = normalizeDateISO(state.fattureDateFrom, monthStartISO(currentMonthISO()));
  const fattureDateTo = normalizeDateISO(state.fattureDateTo, todayISO());
  const calendarMonth = normalizeMonthISO(state.calendarMonth, currentMonthISO());

  document.getElementById("doctorDetailMonth").value = doctorMonth;
  document.getElementById("fattureDateFrom").value = fattureDateFrom;
  document.getElementById("fattureDateTo").value = fattureDateTo < fattureDateFrom ? fattureDateFrom : fattureDateTo;
  document.getElementById("fattureStatusFilter").value = ["tutti", "da_fatturare", "fatturato", "pagato"].includes(state.fattureStatusFilter)
    ? state.fattureStatusFilter
    : "tutti";
  document.getElementById("calendarMonth").value = calendarMonth;
}

function saveAll() {
  localStorage.setItem(STORAGE_KEYS.doctors, JSON.stringify(doctors));
  localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
  localStorage.setItem(STORAGE_KEYS.invoiceStates, JSON.stringify(invoiceStates));
  saveUiState();
  setSaveStatus(`Salvato in locale · ${new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`);
}

function go(pageId, options = {}) {
  currentPage = pageId;
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.getElementById(pageId)?.classList.add("active");

  document.querySelectorAll(".menu-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === pageId);
  });

  if (!options.skipRender) {
    if (pageId === "homePage") renderHome();
    if (pageId === "mediciPage") renderDoctorsPage();
    if (pageId === "doctorDetailPage") renderDoctorDetail();
    if (pageId === "reportPage") renderReport();
    if (pageId === "fatturePage") renderInvoices();
    if (pageId === "calendarPage") renderCalendar();
  }

  saveUiState();
}

function setActiveTab(section, type) {
  const prefix = section === "home" ? "homeTab" : "reportTab";
  ["Giorno", "Mese", "Anno"].forEach((label) => {
    const el = document.getElementById(prefix + label);
    if (el) el.classList.remove("active");
  });

  const map = { giorno: "Giorno", mese: "Mese", anno: "Anno" };
  const target = document.getElementById(prefix + map[type]);
  if (target) target.classList.add("active");
}

function addDoctor() {
  let name = prompt("Nome medico");
  if (!name) return;

  name = name.trim();
  if (!name) return;

  if (doctors.some((doctor) => doctor.name.toLowerCase() === name.toLowerCase())) {
    alert("Medico già esistente");
    return;
  }

  doctors.push({
    id: createId(),
    name,
    availability: []
  });

  doctors.sort((a, b) => a.name.localeCompare(b.name, "it"));
  saveAll();
  renderAll();
  go("mediciPage");
}

function editDoctor(id) {
  const doctor = getDoctorById(id);
  if (!doctor) return;

  let name = prompt("Modifica nome medico", doctor.name);
  if (!name) return;

  name = name.trim();
  if (!name) return;

  if (doctors.some((d) => d.id !== id && d.name.toLowerCase() === name.toLowerCase())) {
    alert("Esiste già un medico con questo nome");
    return;
  }

  doctor.name = name;
  doctors.sort((a, b) => a.name.localeCompare(b.name, "it"));
  saveAll();
  renderAll();
}

function deleteDoctor(id) {
  const doctor = getDoctorById(id);
  if (!doctor) return;

  const linkedCount = entries.filter((entry) => entry.doctorId === id).length;
  const msg = linkedCount
    ? `Eliminare ${doctor.name}? Verranno eliminate anche ${linkedCount} prestazioni collegate.`
    : `Eliminare ${doctor.name}?`;

  if (!confirm(msg)) return;

  doctors = doctors.filter((d) => d.id !== id);
  entries = entries.filter((entry) => entry.doctorId !== id);

  Object.keys(invoiceStates).forEach((key) => {
    if (key.startsWith(`${id}__`)) delete invoiceStates[key];
  });

  if (currentDoctorId === id) {
    currentDoctorId = null;
    currentPage = "mediciPage";
  }

  saveAll();
  renderAll();
  go(currentPage === "doctorDetailPage" ? "mediciPage" : currentPage);
}

function suggestedPopupDate(forcedDate) {
  if (forcedDate) return normalizeDateISO(forcedDate, todayISO());
  if (homeFilterType === "giorno") return normalizeDateISO(homeFilterValue, todayISO());
  if (currentDoctorId) {
    const month = document.getElementById("doctorDetailMonth")?.value || currentMonthISO();
    return normalizeDateISO(month === currentMonthISO() ? todayISO() : `${month}-01`, todayISO());
  }
  return todayISO();
}

function openEntryPopup(entryId = null, forcedDoctorId = null, forcedDate = null) {
  if (!doctors.length) {
    alert("Inserisci prima almeno un medico");
    return;
  }

  editingEntryId = entryId;
  document.getElementById("popup").classList.remove("hidden");
  document.getElementById("popupTitle").textContent = entryId ? "Modifica Registrazione" : "Nuova Registrazione";

  const doctorSelect = document.getElementById("popupDoctorSelect");
  doctorSelect.innerHTML = doctors
    .map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.name)}</option>`)
    .join("");

  const dateInput = document.getElementById("popupData");
  dateInput.max = todayISO();

  if (entryId) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) {
      closeEntryPopup();
      return;
    }

    doctorSelect.value = String(entry.doctorId);
    document.getElementById("popupPrestazione").value = entry.prestazione;
    document.getElementById("popupData").value = entry.data;
    document.getElementById("popupImporto").value = entry.importo;
    document.getElementById("popupPercMedico").value = entry.percMedico;
    document.getElementById("popupPercStruttura").value = 100 - entry.percMedico;
  } else {
    doctorSelect.value = String(forcedDoctorId || currentDoctorId || doctors[0].id);
    document.getElementById("popupPrestazione").value = "";
    document.getElementById("popupData").value = suggestedPopupDate(forcedDate);
    document.getElementById("popupImporto").value = "";
    document.getElementById("popupPercMedico").value = 60;
    document.getElementById("popupPercStruttura").value = 40;
  }

  updatePopupPreview();
  document.getElementById("popupPrestazione").focus();
}

function closeEntryPopup() {
  document.getElementById("popup").classList.add("hidden");
  editingEntryId = null;
}

function updatePopupPreview() {
  const amount = parseFloat(document.getElementById("popupImporto").value) || 0;
  const percMedico = Math.max(0, Math.min(100, parseFloat(document.getElementById("popupPercMedico").value) || 0));
  const quotaMedico = amount * percMedico / 100;
  const quotaStruttura = amount - quotaMedico;

  document.getElementById("popupMedicoPreview").textContent = currency(quotaMedico);
  document.getElementById("popupStrutturaPreview").textContent = currency(quotaStruttura);
}

function saveEntry() {
  const doctorId = Number(document.getElementById("popupDoctorSelect").value);
  const prestazione = document.getElementById("popupPrestazione").value.trim();
  const data = normalizeDateISO(document.getElementById("popupData").value, todayISO());
  const importo = parseFloat(document.getElementById("popupImporto").value);
  const percMedico = parseFloat(document.getElementById("popupPercMedico").value);

  if (!doctorId) return alert("Seleziona un medico");
  if (!prestazione) return alert("Inserisci la prestazione");
  if (!data) return alert("Inserisci la data");
  if (data > todayISO()) return alert("Non puoi inserire una data futura");
  if (!importo || !Number.isFinite(importo) || importo <= 0) return alert("Inserisci un importo valido");
  if (!Number.isFinite(percMedico) || percMedico < 0 || percMedico > 100) return alert("Percentuale medico non valida");

  const safeImporto = Number(importo.toFixed(2));
  const safePercMedico = Number(percMedico.toFixed(2));
  const quotaMedico = Number((safeImporto * safePercMedico / 100).toFixed(2));
  const quotaStruttura = Number((safeImporto - quotaMedico).toFixed(2));

  if (editingEntryId) {
    const entry = entries.find((item) => item.id === editingEntryId);
    if (!entry) return;

    entry.doctorId = doctorId;
    entry.prestazione = prestazione;
    entry.data = data;
    entry.importo = safeImporto;
    entry.percMedico = safePercMedico;
    entry.quotaMedico = quotaMedico;
    entry.quotaStruttura = quotaStruttura;
  } else {
    entries.push({
      id: createId(),
      doctorId,
      prestazione,
      data,
      importo: safeImporto,
      percMedico: safePercMedico,
      quotaMedico,
      quotaStruttura
    });
  }

  entries.sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
  saveAll();
  renderAll();
  closeEntryPopup();
}

function deleteEntry(id) {
  if (!confirm("Eliminare questa prestazione?")) return;
  entries = entries.filter((entry) => entry.id !== id);
  saveAll();
  renderAll();
}

function setHomeFiltroTipo(type) {
  homeFilterType = type;
  if (type === "giorno") homeFilterValue = todayISO();
  if (type === "mese") homeFilterValue = currentMonthISO();
  if (type === "anno") homeFilterValue = currentYearISO();
  setActiveTab("home", type);
  renderHomeFilterControl();
  renderHome();
  saveUiState();
}

function setReportFiltroTipo(type) {
  reportFilterType = type;
  if (type === "giorno") reportFilterValue = todayISO();
  if (type === "mese") reportFilterValue = currentMonthISO();
  if (type === "anno") reportFilterValue = currentYearISO();
  setActiveTab("report", type);
  renderReportFilterControl();
  renderReport();
  saveUiState();
}

function renderHomeFilterControl() {
  const wrap = document.getElementById("homeFilterControlWrap");
  let html = `<div class="filter-control">`;

  if (homeFilterType === "giorno") {
    html += `<label for="homeFilterDay">Giorno selezionato</label><input id="homeFilterDay" type="date" max="${todayISO()}" value="${normalizeDateISO(homeFilterValue, todayISO())}" />`;
  } else if (homeFilterType === "mese") {
    html += `<label for="homeFilterMonth">Mese selezionato</label><input id="homeFilterMonth" type="month" max="${currentMonthISO()}" value="${normalizeMonthISO(homeFilterValue, currentMonthISO())}" />`;
  } else {
    html += `<label for="homeFilterYear">Anno selezionato</label><input id="homeFilterYear" type="number" min="2000" max="${currentYearISO()}" value="${normalizeYearISO(homeFilterValue, currentYearISO())}" />`;
  }

  html += `</div>`;
  wrap.innerHTML = html;

  document.getElementById("homeFilterDay")?.addEventListener("change", (event) => {
    homeFilterValue = normalizeDateISO(event.target.value, todayISO());
    renderHome();
    saveUiState();
  });

  document.getElementById("homeFilterMonth")?.addEventListener("change", (event) => {
    homeFilterValue = normalizeMonthISO(event.target.value, currentMonthISO());
    renderHome();
    saveUiState();
  });

  document.getElementById("homeFilterYear")?.addEventListener("change", (event) => {
    homeFilterValue = normalizeYearISO(event.target.value, currentYearISO());
    renderHome();
    saveUiState();
  });
}

function renderReportFilterControl() {
  const wrap = document.getElementById("reportFilterControlWrap");
  let html = `<div class="filter-control">`;

  if (reportFilterType === "giorno") {
    html += `<label for="reportFilterDay">Giorno selezionato</label><input id="reportFilterDay" type="date" max="${todayISO()}" value="${normalizeDateISO(reportFilterValue, todayISO())}" />`;
  } else if (reportFilterType === "mese") {
    html += `<label for="reportFilterMonth">Mese selezionato</label><input id="reportFilterMonth" type="month" max="${currentMonthISO()}" value="${normalizeMonthISO(reportFilterValue, currentMonthISO())}" />`;
  } else {
    html += `<label for="reportFilterYear">Anno selezionato</label><input id="reportFilterYear" type="number" min="2000" max="${currentYearISO()}" value="${normalizeYearISO(reportFilterValue, currentYearISO())}" />`;
  }

  html += `</div>`;
  wrap.innerHTML = html;

  document.getElementById("reportFilterDay")?.addEventListener("change", (event) => {
    reportFilterValue = normalizeDateISO(event.target.value, todayISO());
    renderReport();
    saveUiState();
  });

  document.getElementById("reportFilterMonth")?.addEventListener("change", (event) => {
    reportFilterValue = normalizeMonthISO(event.target.value, currentMonthISO());
    renderReport();
    saveUiState();
  });

  document.getElementById("reportFilterYear")?.addEventListener("change", (event) => {
    reportFilterValue = normalizeYearISO(event.target.value, currentYearISO());
    renderReport();
    saveUiState();
  });
}

function getEntriesByFilter(type, value) {
  return entries.filter((entry) => {
    if (type === "giorno") return entry.data === value;
    if (type === "mese") return entry.data.startsWith(value);
    if (type === "anno") return entry.data.startsWith(String(value));
    return true;
  });
}

function buildStatsMap(list) {
  const map = {};
  list.forEach((entry) => {
    if (!map[entry.doctorId]) {
      map[entry.doctorId] = {
        total: 0,
        doctor: 0,
        structure: 0,
        count: 0,
        percMedico: entry.percMedico || 0
      };
    }
    map[entry.doctorId].total += entry.importo;
    map[entry.doctorId].doctor += entry.quotaMedico;
    map[entry.doctorId].structure += entry.quotaStruttura;
    map[entry.doctorId].count += 1;
    map[entry.doctorId].percMedico = entry.percMedico || map[entry.doctorId].percMedico || 0;
  });
  return map;
}

function renderTopMonthlyCards() {
  const month = currentMonthISO();
  const monthEntries = entries.filter((entry) => entry.data.startsWith(month));

  let total = 0;
  let structure = 0;
  let doctor = 0;

  monthEntries.forEach((entry) => {
    total += entry.importo;
    structure += entry.quotaStruttura;
    doctor += entry.quotaMedico;
  });

  document.getElementById("meseCorrenteTotale").textContent = currency(total);
  document.getElementById("meseCorrenteStruttura").textContent = currency(structure);
  document.getElementById("meseCorrenteMedici").textContent = currency(doctor);
}

function renderHome() {
  renderTopMonthlyCards();

  const filtered = getEntriesByFilter(homeFilterType, homeFilterValue);
  const statsMap = buildStatsMap(filtered);

  let total = 0;
  let structure = 0;
  filtered.forEach((entry) => {
    total += entry.importo;
    structure += entry.quotaStruttura;
  });

  document.getElementById("homeGuadagno").textContent = currency(total);
  document.getElementById("homeUtile").textContent = currency(structure);
  document.getElementById("homePeriodoLabel").textContent = `${homeFilterType[0].toUpperCase() + homeFilterType.slice(1)} selezionato: ${periodLabel(homeFilterType, homeFilterValue)}`;

  const workedDoctors = doctors
    .filter((doctor) => statsMap[doctor.id])
    .sort((a, b) => statsMap[b.id].total - statsMap[a.id].total);

  const html = workedDoctors.map((doctor) => {
    const s = statsMap[doctor.id];
    const percMedico = Math.round(s.percMedico || 0);
    const percStruttura = 100 - percMedico;

    return `
      <div class="medico-card clickable" data-doctor-id="${doctor.id}">
        <div class="medico-top">
          <div class="avatar">👨‍⚕️</div>
          <div class="medico-main">
            <div class="medico-name">${escapeHtml(doctor.name)}</div>
            <div class="medico-sub">
              <span class="medico-total">Totale: ${currency(s.total)}</span>
              <span class="medico-badge">${s.count} prestazioni</span>
            </div>
            <div class="percent-row">
              <div class="percent-seg medico">${percMedico}% Medico</div>
              <div class="percent-seg struttura">${percStruttura}% Struttura</div>
            </div>
            <div class="gains-row">
              <span class="medico-val">${currency(s.doctor)}</span>
              <span class="struttura-val">${currency(s.structure)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("homeWorkedDoctors").innerHTML =
    html || `<div class="medico-card">Nessun medico ha lavorato nel periodo selezionato.</div>`;

  document.querySelectorAll("#homeWorkedDoctors .medico-card.clickable").forEach((card) => {
    card.addEventListener("click", () => openDoctorDetail(Number(card.dataset.doctorId)));
  });
}

function renderDoctorsPage() {
  const sortedDoctors = [...doctors].sort((a, b) => a.name.localeCompare(b.name, "it"));
  const html = sortedDoctors.map((doctor) => `
    <div class="simple-medico-row">
      <div class="simple-medico-name" data-open-doctor="${doctor.id}">${escapeHtml(doctor.name)}</div>
      <div class="simple-medico-actions">
        <button class="icon-btn" type="button" data-edit-doctor="${doctor.id}">✏️</button>
        <button class="icon-btn" type="button" data-delete-doctor="${doctor.id}">🗑️</button>
      </div>
    </div>
  `).join("");

  document.getElementById("doctorsSimpleList").innerHTML =
    html || `<div class="medico-card">Nessun medico inserito.</div>`;

  document.querySelectorAll("[data-open-doctor]").forEach((el) => {
    el.addEventListener("click", () => openDoctorDetail(Number(el.dataset.openDoctor)));
  });

  document.querySelectorAll("[data-edit-doctor]").forEach((btn) => {
    btn.addEventListener("click", () => editDoctor(Number(btn.dataset.editDoctor)));
  });

  document.querySelectorAll("[data-delete-doctor]").forEach((btn) => {
    btn.addEventListener("click", () => deleteDoctor(Number(btn.dataset.deleteDoctor)));
  });
}

function openDoctorDetail(doctorId) {
  const doctor = getDoctorById(doctorId);
  if (!doctor) return;

  currentDoctorId = doctorId;
  document.getElementById("doctorDetailName").textContent = doctor.name;

  const availabilityHtml = WEEK_DAYS.map((label, idx) => {
    const key = `${label}-${idx}`;
    const active = doctor.availability.includes(key);
    return `<span class="${active ? "active" : ""}" data-availability-key="${key}">${label[0]}</span>`;
  }).join("");

  const availabilityWrap = document.getElementById("doctorAvailability");
  availabilityWrap.innerHTML = availabilityHtml;

  availabilityWrap.querySelectorAll("[data-availability-key]").forEach((el) => {
    el.addEventListener("click", () => toggleDoctorAvailability(el.dataset.availabilityKey));
  });

  if (!document.getElementById("doctorDetailMonth").value) {
    document.getElementById("doctorDetailMonth").value = currentMonthISO();
  }

  go("doctorDetailPage");
}

function toggleDoctorAvailability(key) {
  const doctor = getDoctorById(currentDoctorId);
  if (!doctor) return;

  if (doctor.availability.includes(key)) {
    doctor.availability = doctor.availability.filter((item) => item !== key);
  } else {
    doctor.availability.push(key);
  }

  saveAll();
  renderDoctorDetail();
}

function buildTopServices(list) {
  const map = {};
  list.forEach((entry) => {
    const key = entry.prestazione.trim();
    if (!map[key]) map[key] = 0;
    map[key] += 1;
  });

  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"))
    .slice(0, 5);
}

function renderDoctorDetail() {
  const month = normalizeMonthISO(document.getElementById("doctorDetailMonth").value || currentMonthISO(), currentMonthISO());
  document.getElementById("doctorDetailMonth").value = month;

  const doctor = getDoctorById(currentDoctorId);
  if (!doctor) return;

  document.getElementById("doctorDetailName").textContent = doctor.name;
  document.getElementById("doctorMonthLabel").textContent = `Prestazioni di ${monthLabel(month)}`;

  const list = entries
    .filter((entry) => entry.doctorId === currentDoctorId && entry.data.startsWith(month))
    .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);

  let totalDoctor = 0;
  let totalStructure = 0;

  list.forEach((entry) => {
    totalDoctor += entry.quotaMedico;
    totalStructure += entry.quotaStruttura;
  });

  document.getElementById("doctorTotMedico").textContent = currency(totalDoctor);
  document.getElementById("doctorTotStruttura").textContent = currency(totalStructure);
  document.getElementById("doctorTotPrestazioni").textContent = list.length;

  const topServices = buildTopServices(list);
  const maxCount = topServices.length ? topServices[0][1] : 1;
  document.getElementById("doctorTopServices").innerHTML = topServices.length
    ? topServices.map(([name, count]) => `
        <div class="top-service-row">
          <div class="top-service-head">
            <span>${escapeHtml(name)}</span>
            <strong>${count}</strong>
          </div>
          <div class="top-service-bar"><span style="width:${Math.max(14, (count / maxCount) * 100)}%"></span></div>
        </div>
      `).join("")
    : `<div class="empty-inline">Nessuna prestazione nel mese selezionato.</div>`;

  const html = list.map((entry) => `
    <div class="medico-card">
      <div class="prestazione-top">
        <div>
          <div class="prestazione-title">${escapeHtml(entry.prestazione)}</div>
          <div class="prestazione-date">${formatDateLabel(entry.data)}</div>
        </div>
        <div class="prestazione-amount">${currency(entry.importo)}</div>
      </div>
      <div class="prestazione-gains">
        <span class="medico-val">👨‍⚕️ ${currency(entry.quotaMedico)}</span>
        <span class="struttura-val">🏥 ${currency(entry.quotaStruttura)}</span>
      </div>
      <div class="card-actions" style="margin-top:12px;">
        <button class="icon-btn" type="button" data-edit-entry="${entry.id}">✏️</button>
        <button class="icon-btn" type="button" data-delete-entry="${entry.id}">🗑️</button>
      </div>
    </div>
  `).join("");

  const wrap = document.getElementById("doctorMonthPrestazioni");
  wrap.innerHTML = html || `<div class="medico-card">Nessuna prestazione nel mese selezionato.</div>`;

  wrap.querySelectorAll("[data-edit-entry]").forEach((btn) => {
    btn.addEventListener("click", () => openEntryPopup(Number(btn.dataset.editEntry)));
  });

  wrap.querySelectorAll("[data-delete-entry]").forEach((btn) => {
    btn.addEventListener("click", () => deleteEntry(Number(btn.dataset.deleteEntry)));
  });

  saveUiState();
}

function printDoctorDetail() {
  if (!currentDoctorId) return;

  const doctor = getDoctorById(currentDoctorId);
  if (!doctor) return;

  const month = document.getElementById("doctorDetailMonth").value || currentMonthISO();
  const list = entries
    .filter((entry) => entry.doctorId === currentDoctorId && entry.data.startsWith(month))
    .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);

  let totalDoctor = 0;
  let totalStructure = 0;
  list.forEach((entry) => {
    totalDoctor += entry.quotaMedico;
    totalStructure += entry.quotaStruttura;
  });

  const availabilityText = WEEK_DAYS
    .map((label, idx) => `${label}: ${doctor.availability.includes(`${label}-${idx}`) ? "Sì" : "No"}`)
    .join(" | ");

  const rows = list.map((entry) => `
    <tr>
      <td>${formatDateLabel(entry.data)}</td>
      <td>${escapeHtml(entry.prestazione)}</td>
      <td>${currency(entry.importo)}</td>
      <td>${currency(entry.quotaMedico)}</td>
      <td>${currency(entry.quotaStruttura)}</td>
    </tr>
  `).join("");

  const html = `
    <html>
    <head>
      <title>Riepilogo medico</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111}
        h1{margin:0 0 12px}
        .meta{margin:0 0 10px}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{border:1px solid #ccc;padding:8px;text-align:left}
        th{background:#f4f4f4}
      </style>
    </head>
    <body>
      <h1>${escapeHtml(doctor.name)}</h1>
      <div class="meta"><strong>Mese:</strong> ${monthLabel(month)}</div>
      <div class="meta"><strong>Disponibilità:</strong> ${availabilityText}</div>
      <div class="meta"><strong>Guadagno medico:</strong> ${currency(totalDoctor)}</div>
      <div class="meta"><strong>Guadagno struttura:</strong> ${currency(totalStructure)}</div>
      <div class="meta"><strong>Prestazioni:</strong> ${list.length}</div>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Prestazione</th>
            <th>Importo</th>
            <th>Medico</th>
            <th>Struttura</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </body>
    </html>
  `;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function buildPieSVG(items) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!total) return "";

  let cumulative = 0;
  const radius = 70;
  const center = 90;
  const circumference = 2 * Math.PI * radius;

  const circles = items.map((item) => {
    const fraction = item.value / total;
    const dash = fraction * circumference;
    const gap = circumference - dash;
    const offset = -cumulative * circumference;
    cumulative += fraction;

    return `
      <circle
        cx="${center}"
        cy="${center}"
        r="${radius}"
        fill="transparent"
        stroke="${item.color}"
        stroke-width="28"
        stroke-dasharray="${dash} ${gap}"
        stroke-dashoffset="${offset}"
        transform="rotate(-90 ${center} ${center})"
      />
    `;
  }).join("");

  return `
    <svg class="pie-svg" viewBox="0 0 180 180">
      <circle cx="90" cy="90" r="70" fill="transparent" stroke="#eef2f6" stroke-width="28"></circle>
      ${circles}
      <circle cx="90" cy="90" r="42" fill="#fff"></circle>
      <text x="90" y="86" text-anchor="middle" font-size="12" fill="#6e7b88" font-weight="700">Totale</text>
      <text x="90" y="104" text-anchor="middle" font-size="14" fill="#18202a" font-weight="900">${currency(total)}</text>
    </svg>
  `;
}

function renderReport() {
  const list = getEntriesByFilter(reportFilterType, reportFilterValue);
  const stats = buildStatsMap(list);
  const workedDoctors = doctors.filter((doctor) => stats[doctor.id]);

  let total = 0;
  let structure = 0;
  let doctor = 0;
  list.forEach((entry) => {
    total += entry.importo;
    structure += entry.quotaStruttura;
    doctor += entry.quotaMedico;
  });

  const pieItems = workedDoctors.map((doctorItem, idx) => ({
    name: doctorItem.name,
    value: stats[doctorItem.id].total,
    color: PIE_COLORS[idx % PIE_COLORS.length]
  }));

  const legend = pieItems.map((item) => `
    <div class="legend-row">
      <div class="legend-left">
        <span class="legend-dot" style="background:${item.color}"></span>
        <span class="legend-name">${escapeHtml(item.name)}</span>
      </div>
      <span class="legend-val">${currency(item.value)}</span>
    </div>
  `).join("");

  document.getElementById("reportPeriodoLabel").textContent =
    `${reportFilterType[0].toUpperCase() + reportFilterType.slice(1)} selezionato: ${periodLabel(reportFilterType, reportFilterValue)}`;

  document.getElementById("reportPieWrap").innerHTML = pieItems.length ? `
    <div class="pie-card">
      <div class="pie-layout">
        ${buildPieSVG(pieItems)}
        <div class="pie-legend">${legend}</div>
      </div>
    </div>
  ` : `<div class="medico-card">Nessun medico ha lavorato nel periodo selezionato.</div>`;

  const cards = workedDoctors.map((doctorItem) => {
    const s = stats[doctorItem.id];
    return `
      <div class="card report-card">
        <div class="report-card-title">${escapeHtml(doctorItem.name)}</div>
        <div class="report-card-value">${currency(s.total)}</div>
        <div class="page-subtitle">Prestazioni: ${s.count} · Medico: ${currency(s.doctor)} · Struttura: ${currency(s.structure)}</div>
      </div>
    `;
  }).join("");

  document.getElementById("reportCards").innerHTML = `
    <div class="card report-card">
      <div class="report-card-title">Guadagno totale</div>
      <div class="report-card-value">${currency(total)}</div>
    </div>
    <div class="card report-card">
      <div class="report-card-title">Totale struttura</div>
      <div class="report-card-value">${currency(structure)}</div>
    </div>
    <div class="card report-card">
      <div class="report-card-title">Totale medici</div>
      <div class="report-card-value">${currency(doctor)}</div>
    </div>
    <div class="card report-card">
      <div class="report-card-title">Prestazioni totali</div>
      <div class="report-card-value">${list.length}</div>
    </div>
    ${cards}
  `;
}

function printReport() {
  const list = getEntriesByFilter(reportFilterType, reportFilterValue);
  const stats = buildStatsMap(list);
  const workedDoctors = doctors.filter((doctor) => stats[doctor.id]);

  const rows = workedDoctors.map((doctorItem) => {
    const s = stats[doctorItem.id];
    return `
      <tr>
        <td>${escapeHtml(doctorItem.name)}</td>
        <td>${s.count}</td>
        <td>${currency(s.total)}</td>
        <td>${currency(s.doctor)}</td>
        <td>${currency(s.structure)}</td>
      </tr>
    `;
  }).join("");

  const html = `
    <html>
    <head>
      <title>Stampa report</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111}
        h1{margin:0 0 12px}
        .meta{margin:0 0 18px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #ccc;padding:8px;text-align:left}
        th{background:#f4f4f4}
      </style>
    </head>
    <body>
      <h1>Report</h1>
      <div class="meta"><strong>Filtro:</strong> ${reportFilterType} - ${periodLabel(reportFilterType, reportFilterValue)}</div>
      <table>
        <thead>
          <tr>
            <th>Medico</th>
            <th>Prestazioni</th>
            <th>Totale</th>
            <th>Medico</th>
            <th>Struttura</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </body>
    </html>
  `;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function invoiceKey(doctorId, fromDate, toDate) {
  return `${doctorId}__${fromDate}__${toDate}`;
}

function getInvoiceFilters() {
  const fromDate = normalizeDateISO(document.getElementById("fattureDateFrom").value, monthStartISO(currentMonthISO()));
  const toDateRaw = normalizeDateISO(document.getElementById("fattureDateTo").value, todayISO());
  const toDate = toDateRaw < fromDate ? fromDate : toDateRaw;
  const status = document.getElementById("fattureStatusFilter").value || "tutti";
  document.getElementById("fattureDateFrom").value = fromDate;
  document.getElementById("fattureDateTo").value = toDate;
  return { fromDate, toDate, status };
}

function cycleInvoiceStatus(doctorId, fromDate, toDate) {
  const key = invoiceKey(doctorId, fromDate, toDate);
  const current = invoiceStates[key] || "da_fatturare";

  if (current === "da_fatturare") invoiceStates[key] = "fatturato";
  else if (current === "fatturato") invoiceStates[key] = "pagato";
  else invoiceStates[key] = "da_fatturare";

  saveAll();
  renderInvoices();
}

function renderInvoices() {
  const { fromDate, toDate, status } = getInvoiceFilters();
  const list = entries.filter((entry) => entry.data >= fromDate && entry.data <= toDate);

  const map = {};
  list.forEach((entry) => {
    if (!map[entry.doctorId]) map[entry.doctorId] = 0;
    map[entry.doctorId] += entry.quotaMedico;
  });

  const workedDoctors = doctors.filter((doctor) => map[doctor.id]);
  let total = 0;
  Object.values(map).forEach((value) => { total += value; });

  document.getElementById("fatturePeriodoLabel").textContent =
    `Fatture del periodo: ${formatDateLabel(fromDate)} → ${formatDateLabel(toDate)}`;

  document.getElementById("fattureSummary").innerHTML = `
    <div class="card report-card">
      <div class="report-card-title">Totale da fatturare</div>
      <div class="report-card-value">${currency(total)}</div>
    </div>
    <div class="card report-card">
      <div class="report-card-title">Medici nel periodo</div>
      <div class="report-card-value">${workedDoctors.length}</div>
    </div>
  `;

  const html = workedDoctors
    .sort((a, b) => (map[b.id] || 0) - (map[a.id] || 0))
    .map((doctor) => {
      const amount = map[doctor.id] || 0;
      const currentStatus = invoiceStates[invoiceKey(doctor.id, fromDate, toDate)] || "da_fatturare";
      if (status !== "tutti" && currentStatus !== status) return "";

      return `
        <div class="card fattura-card">
          <div class="fattura-name">${escapeHtml(doctor.name)}</div>
          <div class="fattura-amount">${currency(amount)}</div>
          <button class="fattura-status-btn status-${currentStatus}" type="button" data-invoice-doctor="${doctor.id}">
            ${currentStatus.replaceAll("_", " ")}
          </button>
        </div>
      `;
    }).join("");

  const wrap = document.getElementById("fattureList");
  wrap.innerHTML = html || `<div class="medico-card">Nessun medico nel periodo/filtro selezionato.</div>`;

  wrap.querySelectorAll("[data-invoice-doctor]").forEach((btn) => {
    btn.addEventListener("click", () => cycleInvoiceStatus(Number(btn.dataset.invoiceDoctor), fromDate, toDate));
  });

  saveUiState();
}

function printInvoices() {
  const { fromDate, toDate, status } = getInvoiceFilters();
  const list = entries.filter((entry) => entry.data >= fromDate && entry.data <= toDate);

  const map = {};
  list.forEach((entry) => {
    if (!map[entry.doctorId]) map[entry.doctorId] = 0;
    map[entry.doctorId] += entry.quotaMedico;
  });

  const workedDoctors = doctors.filter((doctor) => map[doctor.id]);

  const rows = workedDoctors.map((doctor) => {
    const amount = map[doctor.id] || 0;
    const currentStatus = invoiceStates[invoiceKey(doctor.id, fromDate, toDate)] || "da_fatturare";
    if (status !== "tutti" && currentStatus !== status) return "";

    const color =
      currentStatus === "pagato" ? "#39b86b" :
      currentStatus === "fatturato" ? "#eead42" : "#dd5a52";

    return `
      <tr>
        <td>${escapeHtml(doctor.name)}</td>
        <td>${currency(amount)}</td>
        <td style="font-weight:700;color:${color}">${currentStatus.replaceAll("_", " ")}</td>
      </tr>
    `;
  }).join("");

  const html = `
    <html>
    <head>
      <title>Stampa fatture</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111}
        h1{margin:0 0 12px}
        .meta{margin:0 0 18px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #ccc;padding:8px;text-align:left}
        th{background:#f4f4f4}
      </style>
    </head>
    <body>
      <h1>Riepilogo fatture</h1>
      <div class="meta"><strong>Da:</strong> ${formatDateLabel(fromDate)}</div>
      <div class="meta"><strong>A:</strong> ${formatDateLabel(toDate)}</div>
      <div class="meta"><strong>Filtro stato:</strong> ${status.replaceAll("_", " ")}</div>
      <table>
        <thead>
          <tr>
            <th>Medico</th>
            <th>Importo</th>
            <th>Stato</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </body>
    </html>
  `;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function renderCalendar() {
  const input = document.getElementById("calendarMonth");
  const monthValue = normalizeMonthISO(input.value || currentMonthISO(), currentMonthISO());
  input.value = monthValue;

  const [yearStr, monthStr] = monthValue.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;

  const firstDay = new Date(year, monthIndex, 1);
  let jsDay = firstDay.getDay();
  jsDay = jsDay === 0 ? 6 : jsDay - 1;

  const totalDays = daysInMonth(year, monthIndex);
  let html = WEEK_DAYS.map((name) => `<div class="calendar-day-name">${name}</div>`).join("");

  for (let i = 0; i < jsDay; i++) {
    html += `<div class="calendar-day empty"></div>`;
  }

  for (let day = 1; day <= totalDays; day++) {
    const iso = `${yearStr}-${monthStr}-${pad(day)}`;
    const count = entries.filter((entry) => entry.data === iso).length;

    html += `
      <button class="calendar-day ${count ? "has-data" : ""}" type="button" data-calendar-day="${iso}">
        <div class="calendar-day-number">${day}</div>
        <div class="calendar-day-count">${count ? `${count} reg.` : ""}</div>
      </button>
    `;
  }

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = html;

  grid.querySelectorAll("[data-calendar-day]").forEach((btn) => {
    btn.addEventListener("click", () => {
      homeFilterType = "giorno";
      homeFilterValue = btn.dataset.calendarDay;
      setActiveTab("home", "giorno");
      renderHomeFilterControl();
      go("homePage");
    });
  });

  saveUiState();
}

function renderAll() {
  renderTopMonthlyCards();
  renderHome();
  renderDoctorsPage();
  renderReport();
  renderInvoices();

  if (currentDoctorId) renderDoctorDetail();
  if (document.getElementById("calendarPage").classList.contains("active")) renderCalendar();
}

function exportData() {
  const data = {
    schemaVersion: 3,
    doctors,
    entries,
    invoiceStates,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `backup-anvamed-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  setSaveStatus("Backup esportato");
}

function importDataFromFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function () {
    try {
      const data = JSON.parse(reader.result);

      if (!data || typeof data !== "object") {
        alert("File backup non valido");
        return;
      }

      if (!confirm("Vuoi importare questo backup e sostituire i dati attuali?")) {
        document.getElementById("importFile").value = "";
        return;
      }

      const importedDoctors = Array.isArray(data.doctors) ? data.doctors.map(sanitizeDoctor).filter(Boolean) : [];
      const doctorIds = new Set(importedDoctors.map((doctor) => doctor.id));
      const importedEntries = Array.isArray(data.entries)
        ? data.entries.map(sanitizeEntry).filter((entry) => entry && doctorIds.has(entry.doctorId))
        : [];

      doctors = importedDoctors.sort((a, b) => a.name.localeCompare(b.name, "it"));
      entries = importedEntries.sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
      invoiceStates = normalizeInvoiceStates(data.invoiceStates);

      if (currentDoctorId && !doctors.some((doctor) => doctor.id === currentDoctorId)) {
        currentDoctorId = null;
      }

      saveAll();
      renderAll();
      document.getElementById("importFile").value = "";
      alert("Backup importato correttamente");
    } catch (error) {
      console.error(error);
      alert("Errore durante l'importazione del backup");
      setSaveStatus("Errore di importazione", true);
    }
  };

  reader.readAsText(file);
}

function setupEventListeners() {
  document.getElementById("newRegistrationBtn").addEventListener("click", () => openEntryPopup());
  document.getElementById("openCalendarBtn").addEventListener("click", () => go("calendarPage"));
  document.getElementById("addDoctorBtn").addEventListener("click", addDoctor);
  document.getElementById("backToDoctorsBtn").addEventListener("click", () => go("mediciPage"));
  document.getElementById("backToHomeBtn").addEventListener("click", () => go("homePage"));
  document.getElementById("quickAddDoctorBtn").addEventListener("click", () => {
    if (!currentDoctorId) return;
    const month = document.getElementById("doctorDetailMonth").value || currentMonthISO();
    const dateToUse = month === currentMonthISO() ? todayISO() : `${month}-01`;
    openEntryPopup(null, currentDoctorId, dateToUse);
  });
  document.getElementById("printDoctorBtn").addEventListener("click", printDoctorDetail);
  document.getElementById("printReportBtn").addEventListener("click", printReport);
  document.getElementById("printInvoicesBtn").addEventListener("click", printInvoices);
  document.getElementById("exportBackupBtn").addEventListener("click", exportData);
  document.getElementById("importFile").addEventListener("change", (event) => importDataFromFile(event.target.files[0]));

  document.getElementById("homeTabGiorno").addEventListener("click", () => setHomeFiltroTipo("giorno"));
  document.getElementById("homeTabMese").addEventListener("click", () => setHomeFiltroTipo("mese"));
  document.getElementById("homeTabAnno").addEventListener("click", () => setHomeFiltroTipo("anno"));

  document.getElementById("reportTabGiorno").addEventListener("click", () => setReportFiltroTipo("giorno"));
  document.getElementById("reportTabMese").addEventListener("click", () => setReportFiltroTipo("mese"));
  document.getElementById("reportTabAnno").addEventListener("click", () => setReportFiltroTipo("anno"));

  document.querySelectorAll(".menu-btn").forEach((btn) => {
    btn.addEventListener("click", () => go(btn.dataset.page));
  });

  document.getElementById("closePopupBtn").addEventListener("click", closeEntryPopup);
  document.getElementById("cancelPopupBtn").addEventListener("click", closeEntryPopup);
  document.getElementById("savePopupBtn").addEventListener("click", saveEntry);

  document.getElementById("popupPercMedico").addEventListener("input", (event) => {
    let value = parseFloat(event.target.value) || 0;
    value = Math.max(0, Math.min(100, value));
    event.target.value = value;
    document.getElementById("popupPercStruttura").value = 100 - value;
    updatePopupPreview();
  });

  document.getElementById("popupPercStruttura").addEventListener("input", (event) => {
    let value = parseFloat(event.target.value) || 0;
    value = Math.max(0, Math.min(100, value));
    event.target.value = value;
    document.getElementById("popupPercMedico").value = 100 - value;
    updatePopupPreview();
  });

  document.getElementById("popupImporto").addEventListener("input", updatePopupPreview);
  document.getElementById("doctorDetailMonth").addEventListener("change", renderDoctorDetail);
  document.getElementById("fattureDateFrom").addEventListener("change", renderInvoices);
  document.getElementById("fattureDateTo").addEventListener("change", renderInvoices);
  document.getElementById("fattureStatusFilter").addEventListener("change", renderInvoices);
  document.getElementById("calendarMonth").addEventListener("change", renderCalendar);

  document.getElementById("popup").addEventListener("click", (event) => {
    if (event.target.id === "popup") closeEntryPopup();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.getElementById("popup").classList.contains("hidden")) {
      closeEntryPopup();
    }
  });
}

function boot() {
  loadData();

  document.getElementById("doctorDetailMonth").value = currentMonthISO();
  document.getElementById("fattureDateFrom").value = monthStartISO(currentMonthISO());
  document.getElementById("fattureDateTo").value = todayISO();
  document.getElementById("fattureDateFrom").max = todayISO();
  document.getElementById("fattureDateTo").max = todayISO();
  document.getElementById("calendarMonth").value = currentMonthISO();

  setupEventListeners();
  loadUiState();
  renderHomeFilterControl();
  renderReportFilterControl();
  renderAll();

  const allowedPages = ["homePage", "mediciPage", "doctorDetailPage", "reportPage", "fatturePage", "calendarPage"];
  if (!allowedPages.includes(currentPage)) currentPage = "homePage";
  if (currentPage === "doctorDetailPage" && !currentDoctorId) currentPage = "mediciPage";

  setActiveTab("home", homeFilterType);
  setActiveTab("report", reportFilterType);
  go(currentPage, { skipRender: false });
  setSaveStatus("Archivio locale attivo");
}

document.addEventListener("DOMContentLoaded", boot);
