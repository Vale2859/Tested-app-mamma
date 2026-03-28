const STORAGE_KEYS = {
  doctors: "anvamed_doctors_v3",
  entries: "anvamed_entries_v3",
  invoiceStates: "anvamed_invoice_states_v3",
  login: "anvamed_login_ok"
};

const LEGACY_KEYS = {
  doctors: ["anvamed_doctors_v2"],
  entries: ["anvamed_entries_v2"],
  invoiceStates: ["anvamed_invoice_states_v2"]
};

const APP_PIN = "1003";
const WEEK_DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const WEEK_DAY_KEYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

let doctors = [];
let entries = [];
let invoiceStates = {};
let reportChart = null;
let servicesChart = null;
let homeMode = "day";
let reportMode = "day";
let servicesMode = "day";
let homeSelected = todayISO();
let reportSelected = todayISO();
let servicesSelected = todayISO();
let entryMethod = "pos";
let entryType = "standard";
let calendarCursor = monthISO(todayISO());
let selectedDoctorId = null;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthISO(dateStr = todayISO()) { return dateStr.slice(0, 7); }
function yearISO(dateStr = todayISO()) { return dateStr.slice(0, 4); }
function euro(value) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeJs(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}
function safeParse(key, fallbacks = []) {
  for (const currentKey of [key, ...fallbacks]) {
    const raw = localStorage.getItem(currentKey);
    if (!raw) continue;
    try { return JSON.parse(raw); } catch (_) {}
  }
  return null;
}
function formatPeriodLabel(mode, selected) {
  if (mode === "day") return selected;
  if (mode === "month") return selected;
  return `Anno ${selected}`;
}
function startOfMonth(ym) { return new Date(`${ym}-01T00:00:00`); }
function addMonth(ym, delta) {
  const date = startOfMonth(ym);
  date.setMonth(date.getMonth() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}
function normalizeDayList(list) {
  return Array.isArray(list)
    ? list.map((item) => String(item).trim().toLowerCase().slice(0, 3)).filter((v) => WEEK_DAY_KEYS.includes(v))
    : [];
}

function loadData() {
  doctors = safeParse(STORAGE_KEYS.doctors, LEGACY_KEYS.doctors) || [];
  entries = safeParse(STORAGE_KEYS.entries, LEGACY_KEYS.entries) || [];
  invoiceStates = safeParse(STORAGE_KEYS.invoiceStates, LEGACY_KEYS.invoiceStates) || {};
  normalizeData();
}

function normalizeData() {
  doctors = doctors.map((doctor) => ({
    id: Number(doctor.id || Date.now() + Math.random()),
    name: doctor.name || doctor.nome || "",
    availability: normalizeDayList(doctor.availability || doctor.disponibilita || []),
    prestazioni: Array.isArray(doctor.prestazioni)
      ? doctor.prestazioni.map((service) => ({
          nome: service.nome || service.name || service.prestazione || "",
          perc: Number(service.perc ?? service.percentuale ?? 60),
          count: Number(service.count || 0)
        })).filter((service) => service.nome)
      : []
  }));

  entries = entries.map((entry) => {
    let tipo = entry.tipo || entry.type || "standard";
    if (tipo === "nero") tipo = "riservata";
    if (tipo === "normale") tipo = "standard";
    const importo = Number(entry.importo || 0);
    const quotaMedico = Number(entry.quotaMedico || (importo * Number(entry.percMedico || 60) / 100));
    const quotaStruttura = Number(entry.quotaStruttura || importo - quotaMedico);
    return {
      id: Number(entry.id || Date.now() + Math.random()),
      doctorId: Number(entry.doctorId),
      prestazione: entry.prestazione || entry.service || "",
      data: entry.data || todayISO(),
      importo,
      percMedico: Number(entry.percMedico ?? calcPerc(importo, quotaMedico)),
      quotaMedico,
      quotaStruttura,
      metodo: entry.metodo || "contanti",
      tipo
    };
  });

  rebuildServiceUsageCounts();
}

function calcPerc(importo, quotaMedico) {
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

function initLogin() {
  if (localStorage.getItem(STORAGE_KEYS.login) === "ok") {
    document.getElementById("loginScreen")?.classList.add("hidden");
  }
}
function login() {
  const pin = document.getElementById("pinInput")?.value?.trim() || "";
  if (pin !== APP_PIN) return alert("PIN errato");
  localStorage.setItem(STORAGE_KEYS.login, "ok");
  document.getElementById("loginScreen")?.classList.add("hidden");
}
function logout() {
  localStorage.removeItem(STORAGE_KEYS.login);
  document.getElementById("loginScreen")?.classList.remove("hidden");
}

function setPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("is-active"));
  document.getElementById(`page-${pageName}`)?.classList.add("is-active");
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.page === pageName));
  if (pageName === "home") renderHome();
  if (pageName === "doctors") renderDoctorsPage();
  if (pageName === "services") renderServicesPage();
  if (pageName === "report") renderReport();
  if (pageName === "invoices") renderInvoices();
}

function addDoctor() {
  const name = prompt("Nome medico");
  if (!name || !name.trim()) return;
  const availabilityRaw = prompt("Giorni presenza (es. lun,mer,ven)", "lun,mer");
  const availability = normalizeDayList(String(availabilityRaw || "").split(","));
  doctors.push({ id: Date.now(), name: name.trim(), availability, prestazioni: [] });
  saveAll();
}
function deleteDoctor(doctorId) {
  const doctor = doctors.find((item) => item.id === doctorId);
  if (!doctor) return;
  if (!confirm(`Eliminare ${doctor.name}?`)) return;
  doctors = doctors.filter((item) => item.id !== doctorId);
  entries = entries.filter((entry) => entry.doctorId !== doctorId);
  Object.keys(invoiceStates).forEach((key) => {
    if (!entries.find((e) => String(e.id) === String(key))) delete invoiceStates[key];
  });
  saveAll();
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
  const existing = doctor.prestazioni.find((item) => item.nome.toLowerCase() === serviceName.toLowerCase());
  if (existing) existing.perc = servicePerc;
  else doctor.prestazioni.push({ nome: serviceName, perc: servicePerc, count: 0 });
  document.getElementById("newServiceName").value = "";
  document.getElementById("newServicePerc").value = "60";
  saveAll();
}
function deleteServiceFromDoctor(doctorId, serviceName) {
  const doctor = doctors.find((item) => item.id === doctorId);
  if (!doctor) return;
  doctor.prestazioni = doctor.prestazioni.filter((item) => item.nome !== serviceName);
  saveAll();
}

function openEntryModal() {
  if (!doctors.length) return alert("Inserisci prima almeno un medico");
  const doctorSelect = document.getElementById("entryDoctorSelect");
  doctorSelect.innerHTML = doctors.map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.name)}</option>`).join("");
  resetEntryModal();
  updateEntryServicePicker();
  document.getElementById("entryModal")?.classList.remove("hidden");
}
function resetEntryModal() {
  document.getElementById("entryServiceInput").value = "";
  document.getElementById("serviceSearchInput").value = "";
  document.getElementById("entryDateInput").value = todayISO();
  document.getElementById("entryDateInput").max = todayISO();
  document.getElementById("entryAmountInput").value = "";
  document.getElementById("entryPercInput").value = "60";
  document.getElementById("servicePickerPanel").classList.add("hidden");
  entryMethod = "pos";
  entryType = "standard";
  document.querySelectorAll(".method-btn").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.method === "pos"));
  document.querySelectorAll(".type-btn").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.type === "standard"));
  updateEntryPreview();
}
function closeEntryModal() { document.getElementById("entryModal")?.classList.add("hidden"); }
function getCurrentEntryDoctor() {
  const doctorId = Number(document.getElementById("entryDoctorSelect")?.value || 0);
  return doctors.find((doctor) => doctor.id === doctorId) || null;
}
function getAllUniqueServices() {
  const map = new Map();
  doctors.forEach((doctor) => {
    doctor.prestazioni.forEach((service) => {
      const key = service.nome.toLowerCase();
      if (!map.has(key)) map.set(key, { nome: service.nome, perc: service.perc });
    });
  });
  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}
function makeServiceChip(service) {
  return `<button class="pill-chip" type="button" onclick="selectServiceFromPicker('${escapeJs(service.nome)}', ${Number(service.perc || 60)})">${escapeHtml(service.nome)}</button>`;
}
function updateEntryServicePicker() {
  const doctor = getCurrentEntryDoctor();
  const query = (document.getElementById("serviceSearchInput")?.value || "").trim().toLowerCase();
  const commonRow = document.getElementById("commonServicesRow");
  const allRow = document.getElementById("allServicesRow");
  if (!commonRow || !allRow) return;
  const doctorServices = doctor ? [...doctor.prestazioni].sort((a, b) => (b.count || 0) - (a.count || 0)) : [];
  const allServices = getAllUniqueServices();
  const filteredDoctorServices = doctorServices.filter((service) => service.nome.toLowerCase().includes(query));
  const doctorNames = new Set(filteredDoctorServices.map((service) => service.nome.toLowerCase()));
  const filteredOtherServices = allServices.filter((service) => !doctorNames.has(service.nome.toLowerCase()) && service.nome.toLowerCase().includes(query));
  commonRow.innerHTML = filteredDoctorServices.length ? filteredDoctorServices.map(makeServiceChip).join("") : `<div class="section-badge">Nessuna prestazione frequente</div>`;
  allRow.innerHTML = filteredOtherServices.length ? filteredOtherServices.map(makeServiceChip).join("") : `<div class="section-badge">Nessun'altra prestazione</div>`;
}
function selectServiceFromPicker(serviceName, servicePerc) {
  document.getElementById("entryServiceInput").value = serviceName;
  document.getElementById("entryPercInput").value = String(servicePerc);
  updateEntryPreview();
}
window.selectServiceFromPicker = selectServiceFromPicker;

function updateEntryPreview() {
  const amount = Number(document.getElementById("entryAmountInput")?.value || 0);
  const perc = Number(document.getElementById("entryPercInput")?.value || 0);
  const doctorQuota = amount * perc / 100;
  const structureQuota = amount - doctorQuota;
  document.getElementById("entryDoctorQuotaPreview").textContent = euro(doctorQuota);
  document.getElementById("entryStructureQuotaPreview").textContent = euro(structureQuota);
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
    id: Date.now(), doctorId, prestazione: serviceName, data: date, importo: amount,
    percMedico: perc, quotaMedico, quotaStruttura, metodo: entryMethod, tipo: entryType
  });
  const doctor = doctors.find((item) => item.id === doctorId);
  if (doctor) {
    const existing = doctor.prestazioni.find((item) => item.nome.toLowerCase() === serviceName.toLowerCase());
    if (existing) { existing.perc = perc; existing.count = Number(existing.count || 0) + 1; }
    else doctor.prestazioni.push({ nome: serviceName, perc, count: 1 });
  }
  saveAll();
  closeEntryModal();
}

function getFilteredEntries(mode, selected) {
  if (mode === "day") return entries.filter((entry) => entry.data === selected);
  if (mode === "month") return entries.filter((entry) => entry.data.startsWith(selected));
  if (mode === "year") return entries.filter((entry) => entry.data.startsWith(String(selected)));
  return [...entries];
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

function renderDateFilter(mode, selected, titleEl, boxEl, onChange) {
  if (!titleEl || !boxEl) return;
  if (mode === "day") {
    titleEl.textContent = "Giorno selezionato";
    boxEl.innerHTML = `<input class="input" type="date" max="${todayISO()}" value="${selected}" />`;
    boxEl.querySelector("input").addEventListener("input", (e) => onChange(e.target.value || todayISO()));
  } else if (mode === "month") {
    titleEl.textContent = "Mese selezionato";
    boxEl.innerHTML = `<input class="input" type="month" value="${selected}" />`;
    boxEl.querySelector("input").addEventListener("input", (e) => onChange(e.target.value || monthISO()));
  } else {
    titleEl.textContent = "Anno selezionato";
    boxEl.innerHTML = `<input class="input" type="number" min="2000" max="2099" value="${selected}" />`;
    boxEl.querySelector("input").addEventListener("input", (e) => onChange(e.target.value || yearISO()));
  }
}

function renderHome() {
  renderMonthSummary();
  document.querySelectorAll("[data-home-mode]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.homeMode === homeMode));
  renderDateFilter(homeMode, homeSelected, document.getElementById("homeFilterTitle"), document.getElementById("homeFilterBox"), (value) => { homeSelected = value; renderHome(); });
  document.getElementById("homePeriodBadge").textContent = formatPeriodLabel(homeMode, homeSelected);
  document.getElementById("homeHeroBadge").textContent = formatPeriodLabel(homeMode, homeSelected);
  const filtered = getFilteredEntries(homeMode, homeSelected).sort((a, b) => b.data.localeCompare(a.data));
  const list = document.getElementById("homeEntriesList");
  list.innerHTML = filtered.length ? filtered.map((entry) => {
    const doctor = doctors.find((item) => item.id === entry.doctorId);
    const state = invoiceStates[entry.id] || "da_fatturare";
    return `
      <div class="entry-card ${entry.tipo === 'riservata' ? 'reserved-entry' : ''}">
        <div class="entry-title">${escapeHtml(entry.prestazione)}</div>
        <div class="entry-sub">${escapeHtml(doctor?.name || "Medico")} · ${escapeHtml(entry.data)} · ${escapeHtml(entry.metodo)} · ${escapeHtml(entry.tipo)} · ${euro(entry.importo)}</div>
        <div class="card-actions">
          <div class="state-pill state-${state}">${labelInvoiceState(state)}</div>
          <button class="small-pill-btn" type="button" onclick="cycleInvoiceState(${entry.id})">Cambia stato</button>
        </div>
      </div>`;
  }).join("") : `<div class="entry-card"><div class="entry-title">Nessuna registrazione</div></div>`;
  renderInlineCalendar();
}

function getMonthCalendarData(ym) {
  const first = startOfMonth(ym);
  const year = first.getFullYear();
  const month = first.getMonth();
  const firstDayIndex = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstDayIndex);
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const count = entries.filter((entry) => entry.data === iso).length;
    return { iso, day: date.getDate(), count, isCurrentMonth: date.getMonth() === month };
  });
}

function renderCalendarGrid(containerId, ym, selected, clickable = false) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  const today = todayISO();
  const data = getMonthCalendarData(ym);
  grid.innerHTML = data.map((item) => `
    <button class="calendar-day ${item.isCurrentMonth ? '' : 'is-out'} ${item.iso === today ? 'is-today' : ''} ${item.iso === selected ? 'is-selected' : ''}" ${clickable ? `data-date="${item.iso}" type="button"` : 'type="button"'}>
      <span class="calendar-day-num">${item.day}</span>
      <span class="calendar-day-count ${item.count ? '' : 'zero'}">${item.count}</span>
    </button>`).join("");
  if (clickable) {
    grid.querySelectorAll("[data-date]").forEach((btn) => btn.addEventListener("click", () => {
      homeMode = "day";
      homeSelected = btn.dataset.date;
      setPage("home");
      closeCalendarModal();
    }));
  }
}
function renderInlineCalendar() {
  const ym = homeMode === "day" ? monthISO(homeSelected) : monthISO(todayISO());
  document.getElementById("calendarMonthLabel").textContent = monthLabel(ym);
  renderCalendarGrid("homeCalendarGrid", ym, homeMode === "day" ? homeSelected : todayISO(), true);
}
function openCalendarModal() {
  calendarCursor = homeMode === "day" ? monthISO(homeSelected) : monthISO(todayISO());
  document.getElementById("calendarModal")?.classList.remove("hidden");
  renderCalendarModal();
}
function closeCalendarModal() { document.getElementById("calendarModal")?.classList.add("hidden"); }
function renderCalendarModal() {
  document.getElementById("calendarModalTitle").textContent = monthLabel(calendarCursor);
  renderCalendarGrid("calendarModalGrid", calendarCursor, homeSelected, true);
}

function renderDoctorsPage() {
  const container = document.getElementById("doctorCardsList");
  if (!container) return;
  container.innerHTML = doctors.length ? doctors.map((doctor) => `
    <div class="doctor-card">
      <div class="doctor-card-top">
        <div>
          <div class="doctor-name">${escapeHtml(doctor.name)}</div>
          <div class="doctor-sub">${doctor.prestazioni.length} prestazioni salvate · ${entries.filter((entry) => entry.doctorId === doctor.id).length} registrazioni</div>
        </div>
        <div class="doctor-avatar">👨‍⚕️</div>
      </div>
      <div class="availability-preview">${WEEK_DAY_KEYS.map((day, idx) => `<span class="day-mini-pill ${doctor.availability.includes(day) ? 'active' : ''}">${WEEK_DAYS[idx]}</span>`).join("")}</div>
      <div class="card-actions">
        <button class="small-pill-btn" type="button" onclick="openDoctorDetail(${doctor.id})">Dettaglio</button>
        <button class="small-pill-btn" type="button" onclick="editDoctorAvailability(${doctor.id})">Giorni</button>
        <button class="small-pill-btn" type="button" onclick="deleteDoctor(${doctor.id})">Elimina</button>
      </div>
    </div>`).join("") : `<div class="doctor-card"><div class="doctor-name">Nessun medico inserito</div></div>`;
}
window.deleteDoctor = deleteDoctor;
function editDoctorAvailability(doctorId) {
  const doctor = doctors.find((item) => item.id === doctorId);
  if (!doctor) return;
  const updated = prompt(`Giorni presenza per ${doctor.name} (es. lun,mer,ven)`, doctor.availability.join(","));
  if (updated === null) return;
  doctor.availability = normalizeDayList(updated.split(","));
  saveAll();
}
window.editDoctorAvailability = editDoctorAvailability;
function openDoctorDetail(doctorId) {
  const doctor = doctors.find((item) => item.id === doctorId);
  if (!doctor) return;
  selectedDoctorId = doctorId;
  document.getElementById("doctorDetailName").textContent = doctor.name;
  document.getElementById("doctorAvailabilityChips").innerHTML = WEEK_DAY_KEYS.map((day, idx) => `<button class="availability-chip ${doctor.availability.includes(day) ? 'active' : ''}" type="button" onclick="toggleDoctorDay(${doctor.id}, '${day}')">${WEEK_DAYS[idx]} ${doctor.availability.includes(day) ? '✓' : ''}</button>`).join("");
  document.getElementById("doctorServiceCount").textContent = String(doctor.prestazioni.length);
  document.getElementById("doctorEntryCount").textContent = String(entries.filter((entry) => entry.doctorId === doctor.id).length);
  document.getElementById("doctorDetailServices").innerHTML = doctor.prestazioni.length ? doctor.prestazioni.map((service) => `
    <div class="service-card">
      <div class="service-name">${escapeHtml(service.nome)}</div>
      <div class="service-sub">Percentuale medico: ${Number(service.perc)}% · Eseguita ${Number(service.count || 0)} volte</div>
    </div>`).join("") : `<div class="service-card"><div class="service-name">Nessuna prestazione salvata</div></div>`;
  document.getElementById("doctorDetailModal")?.classList.remove("hidden");
}
window.openDoctorDetail = openDoctorDetail;
function closeDoctorDetail() { document.getElementById("doctorDetailModal")?.classList.add("hidden"); }
function toggleDoctorDay(doctorId, day) {
  const doctor = doctors.find((item) => item.id === doctorId);
  if (!doctor) return;
  doctor.availability = doctor.availability.includes(day) ? doctor.availability.filter((item) => item !== day) : [...doctor.availability, day];
  saveAll();
  openDoctorDetail(doctorId);
}
window.toggleDoctorDay = toggleDoctorDay;

function renderServicesPage() {
  const select = document.getElementById("servicesDoctorSelect");
  const list = document.getElementById("servicesList");
  if (!select || !list) return;
  const currentValue = select.value;
  select.innerHTML = doctors.map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.name)}</option>`).join("");
  if (currentValue && doctors.some((doctor) => String(doctor.id) === String(currentValue))) select.value = currentValue;
  if (!select.value && doctors[0]) select.value = String(doctors[0].id);
  const doctor = doctors.find((item) => String(item.id) === String(select.value));
  list.innerHTML = doctor && doctor.prestazioni.length ? doctor.prestazioni.sort((a, b) => a.nome.localeCompare(b.nome, "it")).map((service) => `
    <div class="service-card">
      <div class="service-name">${escapeHtml(service.nome)}</div>
      <div class="service-sub">Percentuale medico: ${Number(service.perc)}% · Eseguita ${Number(service.count || 0)} volte</div>
      <div class="card-actions"><button class="small-pill-btn" type="button" onclick="deleteServiceFromDoctor(${doctor.id}, '${escapeJs(service.nome)}')">Elimina</button></div>
    </div>`).join("") : `<div class="service-card"><div class="service-name">Nessuna prestazione salvata</div></div>`;
  renderServicesFilter();
  renderServicesChart();
}
window.deleteServiceFromDoctor = deleteServiceFromDoctor;
function renderServicesFilter() {
  document.querySelectorAll("[data-services-mode]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.servicesMode === servicesMode));
  renderDateFilter(servicesMode, servicesSelected, document.getElementById("servicesFilterTitle"), document.getElementById("servicesFilterBox"), (value) => { servicesSelected = value; renderServicesPage(); });
  document.getElementById("servicesChartSubtitle").textContent = formatPeriodLabel(servicesMode, servicesSelected);
}
function buildServicesStats() {
  const doctorId = Number(document.getElementById("servicesDoctorSelect")?.value || 0);
  const filtered = getFilteredEntries(servicesMode, servicesSelected).filter((entry) => entry.doctorId === doctorId);
  const stats = new Map();
  filtered.forEach((entry) => stats.set(entry.prestazione, (stats.get(entry.prestazione) || 0) + 1));
  return Array.from(stats.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
}
function renderServicesFallback(data) {
  const fallback = document.getElementById("servicesChartFallback");
  if (!fallback) return;
  if (!data.length) { fallback.classList.remove("hidden"); fallback.innerHTML = `<div class="section-badge">Nessun dato per il periodo selezionato</div>`; return; }
  const max = Math.max(...data.map((item) => item.value), 1);
  fallback.classList.remove("hidden");
  fallback.innerHTML = data.map((item) => `
    <div class="chart-fallback-row">
      <span>${escapeHtml(item.label)}</span>
      <div class="chart-fallback-bar" style="width:${Math.max(10, item.value / max * 100)}%"></div>
      <strong>${item.value}</strong>
    </div>`).join("");
}
function renderServicesChart() {
  const data = buildServicesStats();
  const canvas = document.getElementById("servicesChart");
  const fallback = document.getElementById("servicesChartFallback");
  if (!canvas) return;
  if (typeof Chart === "undefined") { renderServicesFallback(data); return; }
  fallback?.classList.add("hidden"); fallback.innerHTML = "";
  if (servicesChart) servicesChart.destroy();
  servicesChart = new Chart(canvas, {
    type: "bar",
    data: { labels: data.map((item) => item.label), datasets: [{ label: "Prestazioni", data: data.map((item) => item.value), borderRadius: 12, backgroundColor: ["#59cf82", "#2d8cff", "#9a62d8", "#39b86b", "#6cb7ff", "#bb8cf3", "#8dddb0", "#90c0ff"] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

function renderReport() {
  document.querySelectorAll("[data-report-mode]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.reportMode === reportMode));
  renderDateFilter(reportMode, reportSelected, document.getElementById("reportFilterTitle"), document.getElementById("reportFilterBox"), (value) => { reportSelected = value; renderReport(); });
  const filtered = getFilteredEntries(reportMode, reportSelected);
  let pos = 0, contanti = 0, standard = 0, riservata = 0, transa = 0;
  filtered.forEach((entry) => {
    if (entry.metodo === "pos") pos += Number(entry.importo || 0); else contanti += Number(entry.importo || 0);
    if (entry.tipo === "riservata") riservata += Number(entry.importo || 0); else standard += Number(entry.importo || 0);
    if (entry.prestazione.toLowerCase().includes("transa thaw")) transa += Number(entry.importo || 0);
  });
  document.getElementById("reportPosValue").textContent = euro(pos);
  document.getElementById("reportCashValue").textContent = euro(contanti);
  document.getElementById("reportStandardValue").textContent = euro(standard);
  document.getElementById("reportReservedValue").textContent = euro(riservata);
  document.getElementById("reportTransaValue").textContent = euro(transa);
  const canvas = document.getElementById("reportChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (reportChart) reportChart.destroy();
  reportChart = new Chart(canvas, {
    type: "doughnut",
    data: { labels: ["POS", "Contanti", "Standard", "Riservata"], datasets: [{ data: [pos, contanti, standard, riservata], backgroundColor: ["#3a86ff", "#59d38b", "#9a62d8", "#d6dde6"] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top" } } }
  });
}

function labelInvoiceState(state) {
  if (state === "fatturato") return "fatturato";
  if (state === "pagato") return "pagato";
  return "da fatturare";
}
function cycleInvoiceState(entryId) {
  const current = invoiceStates[entryId] || "da_fatturare";
  invoiceStates[entryId] = current === "da_fatturare" ? "fatturato" : current === "fatturato" ? "pagato" : "da_fatturare";
  localStorage.setItem(STORAGE_KEYS.invoiceStates, JSON.stringify(invoiceStates));
  renderHome();
  renderInvoices();
}
window.cycleInvoiceState = cycleInvoiceState;

function updateInvoiceFilterVisibility() {
  const mode = document.getElementById("invoiceModeFilter")?.value || "all";
  document.getElementById("invoiceDateWrap")?.classList.toggle("hidden", mode !== "day");
  document.getElementById("invoiceMonthWrap")?.classList.toggle("hidden", mode !== "month");
  document.getElementById("invoiceYearWrap")?.classList.toggle("hidden", mode !== "year");
}

function renderInvoices() {
  const doctorFilter = document.getElementById("invoiceDoctorFilter")?.value || "";
  const mode = document.getElementById("invoiceModeFilter")?.value || "all";
  const dateFilter = document.getElementById("invoiceDateFilter")?.value || "";
  const monthFilter = document.getElementById("invoiceMonthFilter")?.value || "";
  const yearFilter = document.getElementById("invoiceYearFilter")?.value || "";
  const amountFilter = document.getElementById("invoiceAmountFilter")?.value || "";
  const stateFilter = document.getElementById("invoiceStateFilter")?.value || "";
  const typeFilter = document.getElementById("invoiceTypeFilter")?.value || "";
  const doctorSelect = document.getElementById("invoiceDoctorFilter");
  if (doctorSelect) {
    const currentValue = doctorSelect.value;
    doctorSelect.innerHTML = `<option value="">Tutti i medici</option>` + doctors.map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.name)}</option>`).join("");
    doctorSelect.value = currentValue;
  }
  updateInvoiceFilterVisibility();
  const filtered = entries.filter((entry) => {
    const currentState = invoiceStates[entry.id] || "da_fatturare";
    const doctorOk = !doctorFilter || String(entry.doctorId) === String(doctorFilter);
    const amountOk = !amountFilter || Number(entry.importo) === Number(amountFilter);
    const stateOk = !stateFilter || currentState === stateFilter;
    const typeOk = !typeFilter || entry.tipo === typeFilter;
    const periodOk = mode === "all" ? true : mode === "day" ? (!dateFilter || entry.data === dateFilter) : mode === "month" ? (!monthFilter || entry.data.startsWith(monthFilter)) : (!yearFilter || entry.data.startsWith(String(yearFilter)));
    return doctorOk && amountOk && stateOk && typeOk && periodOk;
  });
  const list = document.getElementById("invoiceList");
  if (!list) return;
  list.innerHTML = filtered.length ? filtered.sort((a, b) => b.data.localeCompare(a.data)).map((entry) => {
    const doctor = doctors.find((item) => item.id === entry.doctorId);
    const currentState = invoiceStates[entry.id] || "da_fatturare";
    return `
      <div class="invoice-card ${entry.tipo === 'riservata' ? 'reserved-entry' : ''}">
        <div class="invoice-title">${escapeHtml(doctor?.name || "Medico")} - ${escapeHtml(entry.prestazione)}</div>
        <div class="invoice-sub">${escapeHtml(entry.data)} · ${euro(entry.importo)} · ${escapeHtml(entry.metodo)} · ${escapeHtml(entry.tipo)}</div>
        <div class="card-actions">
          <div class="state-pill state-${currentState}">${labelInvoiceState(currentState)}</div>
          <button class="small-pill-btn" type="button" onclick="cycleInvoiceState(${entry.id})">Cambia stato</button>
        </div>
      </div>`;
  }).join("") : `<div class="invoice-card"><div class="invoice-title">Nessun risultato</div></div>`;
}

function printPdf() {
  const items = [...entries].sort((a, b) => a.data.localeCompare(b.data));
  const html = `
    <html><head><title>Riepilogo ANVAMED</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#17202c}h1{margin-bottom:18px}.row{padding:10px 0;border-bottom:1px solid #d8e2ec}
      .sub{color:#6f7d8c;font-size:13px;margin-top:4px}
    </style></head><body><h1>Riepilogo fatture</h1>
      ${items.map((entry) => { const doctor = doctors.find((item) => item.id === entry.doctorId); return `<div class="row"><strong>${escapeHtml(doctor?.name || "Medico")} - ${escapeHtml(entry.prestazione)}</strong><div class="sub">${escapeHtml(entry.data)} · ${euro(entry.importo)} · ${escapeHtml(entry.metodo)} · ${escapeHtml(entry.tipo)}</div></div>`; }).join("")}
    </body></html>`;
  const win = window.open("", "_blank");
  if (!win) return alert("Popup bloccato dal browser");
  win.document.open(); win.document.write(html); win.document.close(); win.focus(); win.print();
}
function goBack() { window.history.back(); }

function exportData() {
  const payload = { doctors, entries, invoiceStates, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = `backup-anvamed-${todayISO()}.json`; link.click(); URL.revokeObjectURL(link.href);
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
    } catch (_) { alert("Backup non valido"); }
  };
  reader.readAsText(file);
}

function renderAll() {
  renderHome();
  renderDoctorsPage();
  renderServicesPage();
  renderReport();
  renderInvoices();
}

function bindEvents() {
  document.getElementById("loginBtn")?.addEventListener("click", login);
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.addEventListener("click", () => setPage(btn.dataset.page)));
  document.getElementById("openNewEntryBtn")?.addEventListener("click", openEntryModal);
  document.getElementById("closeEntryModalBtn")?.addEventListener("click", closeEntryModal);
  document.getElementById("cancelEntryBtn")?.addEventListener("click", closeEntryModal);
  document.getElementById("saveEntryBtn")?.addEventListener("click", saveEntry);
  document.getElementById("toggleServicePickerBtn")?.addEventListener("click", () => {
    document.getElementById("servicePickerPanel")?.classList.toggle("hidden"); updateEntryServicePicker();
  });
  document.getElementById("serviceSearchInput")?.addEventListener("input", updateEntryServicePicker);
  document.getElementById("entryDoctorSelect")?.addEventListener("change", updateEntryServicePicker);
  document.getElementById("entryAmountInput")?.addEventListener("input", updateEntryPreview);
  document.getElementById("entryPercInput")?.addEventListener("input", updateEntryPreview);
  document.querySelectorAll(".method-btn").forEach((btn) => btn.addEventListener("click", () => {
    entryMethod = btn.dataset.method;
    document.querySelectorAll(".method-btn").forEach((item) => item.classList.toggle("is-active", item.dataset.method === entryMethod));
  }));
  document.querySelectorAll(".type-btn").forEach((btn) => btn.addEventListener("click", () => {
    entryType = btn.dataset.type;
    document.querySelectorAll(".type-btn").forEach((item) => item.classList.toggle("is-active", item.dataset.type === entryType));
  }));
  document.querySelectorAll("[data-home-mode]").forEach((btn) => btn.addEventListener("click", () => {
    homeMode = btn.dataset.homeMode; homeSelected = homeMode === "day" ? todayISO() : homeMode === "month" ? monthISO() : yearISO(); renderHome();
  }));
  document.querySelectorAll("[data-report-mode]").forEach((btn) => btn.addEventListener("click", () => {
    reportMode = btn.dataset.reportMode; reportSelected = reportMode === "day" ? todayISO() : reportMode === "month" ? monthISO() : yearISO(); renderReport();
  }));
  document.querySelectorAll("[data-services-mode]").forEach((btn) => btn.addEventListener("click", () => {
    servicesMode = btn.dataset.servicesMode; servicesSelected = servicesMode === "day" ? todayISO() : servicesMode === "month" ? monthISO() : yearISO(); renderServicesPage();
  }));
  document.getElementById("addDoctorBtn")?.addEventListener("click", addDoctor);
  document.getElementById("addServiceBtn")?.addEventListener("click", addServiceToDoctor);
  document.getElementById("servicesDoctorSelect")?.addEventListener("change", renderServicesPage);
  document.getElementById("exportBtn")?.addEventListener("click", exportData);
  document.getElementById("importFile")?.addEventListener("change", (e) => { importData(e.target.files[0]); e.target.value = ""; });
  ["invoiceDoctorFilter","invoiceModeFilter","invoiceDateFilter","invoiceMonthFilter","invoiceYearFilter","invoiceAmountFilter","invoiceStateFilter","invoiceTypeFilter"].forEach((id) => document.getElementById(id)?.addEventListener(id.includes("Filter") && (id.includes("Date") || id.includes("Month") || id.includes("Year") || id.includes("Amount")) ? "input" : "change", renderInvoices));
  document.getElementById("printPdfBtn")?.addEventListener("click", printPdf);
  document.getElementById("goBackBtn")?.addEventListener("click", goBack);
  document.getElementById("openCalendarBtn")?.addEventListener("click", openCalendarModal);
  document.getElementById("closeCalendarModalBtn")?.addEventListener("click", closeCalendarModal);
  document.getElementById("calendarPrevBtn")?.addEventListener("click", () => { calendarCursor = addMonth(calendarCursor, -1); renderCalendarModal(); });
  document.getElementById("calendarNextBtn")?.addEventListener("click", () => { calendarCursor = addMonth(calendarCursor, 1); renderCalendarModal(); });
  document.getElementById("closeDoctorDetailBtn")?.addEventListener("click", closeDoctorDetail);
}

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  initLogin();
  bindEvents();
  document.getElementById("invoiceMonthFilter").value = monthISO();
  document.getElementById("invoiceYearFilter").value = yearISO();
  renderAll();
});
