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
let reportMode = "day";
let homeSelected = todayISO();
let reportSelected = todayISO();

let entryMethod = "pos";
let entryType = "standard";

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

function escapeJs(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

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

    const importo = Number(entry.importo || 0);
    const quotaMedico = Number(entry.quotaMedico || 0);
    const quotaStruttura = Number(entry.quotaStruttura || 0);

    return {
      id: Number(entry.id),
      doctorId: Number(entry.doctorId),
      prestazione: entry.prestazione || "",
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

function setPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("is-active"));
  document.getElementById(`page-${pageName}`)?.classList.add("is-active");

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.page === pageName);
  });

  if (pageName === "report") renderReport();
  if (pageName === "invoices") renderInvoices();
  if (pageName === "services") renderServicesPage();
}

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

function deleteDoctor(doctorId) {
  const doctor = doctors.find((item) => item.id === doctorId);
  if (!doctor) return;

  if (!confirm(`Eliminare ${doctor.name}?`)) return;

  doctors = doctors.filter((item) => item.id !== doctorId);
  entries = entries.filter((entry) => entry.doctorId !== doctorId);

  Object.keys(invoiceStates).forEach((key) => {
    const entry = entries.find((e) => String(e.id) === String(key));
    if (!entry) delete invoiceStates[key];
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

function deleteServiceFromDoctor(doctorId, serviceName) {
  const doctor = doctors.find((item) => item.id === doctorId);
  if (!doctor) return;

  doctor.prestazioni = doctor.prestazioni.filter((item) => item.nome !== serviceName);
  saveAll();
}

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
  updateEntryServicePicker();
  modal.classList.remove("hidden");
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

  document.querySelectorAll(".method-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.method === "pos");
  });

  document.querySelectorAll(".type-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.type === "standard");
  });

  updateEntryPreview();
}

function closeEntryModal() {
  document.getElementById("entryModal")?.classList.add("hidden");
}

function getCurrentEntryDoctor() {
  const doctorId = Number(document.getElementById("entryDoctorSelect")?.value || 0);
  return doctors.find((doctor) => doctor.id === doctorId) || null;
}

function getAllUniqueServices() {
  const map = new Map();

  doctors.forEach((doctor) => {
    doctor.prestazioni.forEach((service) => {
      const key = service.nome.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          nome: service.nome,
          perc: service.perc
        });
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}

function updateEntryServicePicker() {
  const doctor = getCurrentEntryDoctor();
  const query = (document.getElementById("serviceSearchInput")?.value || "").trim().toLowerCase();

  const commonRow = document.getElementById("commonServicesRow");
  const allRow = document.getElementById("allServicesRow");
  if (!commonRow || !allRow) return;

  const doctorServices = doctor
    ? [...doctor.prestazioni].sort((a, b) => (b.count || 0) - (a.count || 0))
    : [];

  const allServices = getAllUniqueServices();

  const filteredDoctorServices = doctorServices.filter((service) =>
    service.nome.toLowerCase().includes(query)
  );

  const doctorNames = new Set(filteredDoctorServices.map((service) => service.nome.toLowerCase()));
  const filteredOtherServices = allServices.filter((service) =>
    !doctorNames.has(service.nome.toLowerCase()) &&
    service.nome.toLowerCase().includes(query)
  );

  commonRow.innerHTML = filteredDoctorServices.length
    ? filteredDoctorServices.map((service) => makeServiceChip(service)).join("")
    : `<div class="section-badge">Nessuna prestazione frequente</div>`;

  allRow.innerHTML = filteredOtherServices.length
    ? filteredOtherServices.map((service) => makeServiceChip(service)).join("")
    : `<div class="section-badge">Nessun'altra prestazione</div>`;
}

function makeServiceChip(service) {
  return `<button class="pill-chip" type="button" onclick="selectServiceFromPicker('${escapeJs(service.nome)}', ${Number(service.perc || 60)})">${escapeHtml(service.nome)}</button>`;
}

function selectServiceFromPicker(serviceName, servicePerc) {
  document.getElementById("entryServiceInput").value = serviceName;
  document.getElementById("entryPercInput").value = String(servicePerc);
  updateEntryPreview();
}

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
    id: Date.now(),
    doctorId,
    prestazione: serviceName,
    data: date,
    importo: amount,
    percMedico: perc,
    quotaMedico,
    quotaStruttura,
    metodo: entryMethod,
    tipo: entryType
  });

  const doctor = doctors.find((item) => item.id === doctorId);
  if (doctor) {
    const existing = doctor.prestazioni.find((item) => item.nome.toLowerCase() === serviceName.toLowerCase());
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
  const title = document.getElementById("homeFilterTitle");
  const badge = document.getElementById("homePeriodBadge");
  if (!box || !title || !badge) return;

  if (homeMode === "day") {
    title.textContent = "Giorno selezionato";
    badge.textContent = homeSelected;
    box.innerHTML = `<input id="homeDayInput" class="input" type="date" max="${todayISO()}" value="${homeSelected}" />`;
    document.getElementById("homeDayInput").addEventListener("input", (e) => {
      homeSelected = e.target.value || todayISO();
      renderHome();
    });
  } else if (homeMode === "month") {
    title.textContent = "Mese selezionato";
    badge.textContent = homeSelected;
    box.innerHTML = `<input id="homeMonthInput" class="input" type="month" value="${homeSelected}" />`;
    document.getElementById("homeMonthInput").addEventListener("input", (e) => {
      homeSelected = e.target.value || monthISO();
      renderHome();
    });
  } else {
    title.textContent = "Anno selezionato";
    badge.textContent = homeSelected;
    box.innerHTML = `<input id="homeYearInput" class="input" type="number" min="2000" max="2099" value="${homeSelected}" />`;
    document.getElementById("homeYearInput").addEventListener("input", (e) => {
      homeSelected = e.target.value || yearISO();
      renderHome();
    });
  }
}

function renderHome() {
  renderMonthSummary();
  renderHomeFilter();

  document.querySelectorAll("[data-home-mode]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.homeMode === homeMode);
  });

  const filtered = getFilteredEntries(homeMode, homeSelected);
  const container = document.getElementById("homeEntriesList");
  if (!container) return;

  const sorted = [...filtered].sort((a, b) => b.data.localeCompare(a.data));

  container.innerHTML = sorted.length
    ? sorted.map((entry) => {
        const doctor = doctors.find((item) => item.id === entry.doctorId);
        const currentState = invoiceStates[entry.id] || "da_fatturare";

        return `
          <div class="entry-card">
            <div class="entry-title">${escapeHtml(doctor?.name || "Medico")} - ${escapeHtml(entry.prestazione)}</div>
            <div class="entry-sub">${escapeHtml(entry.data)} · ${escapeHtml(entry.metodo)} · ${escapeHtml(entry.tipo)} · ${euro(entry.importo)}</div>
            <div class="card-actions">
              <div class="state-pill state-${currentState}">${labelInvoiceState(currentState)}</div>
              <button class="small-pill-btn" type="button" onclick="cycleInvoiceState(${entry.id})">Cambia stato</button>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="entry-card"><div class="entry-title">Nessuna registrazione</div></div>`;
}

function renderDoctorsPage() {
  const container = document.getElementById("doctorCardsList");
  if (!container) return;

  container.innerHTML = doctors.length
    ? doctors.map((doctor) => `
        <div class="doctor-card">
          <div class="doctor-name">${escapeHtml(doctor.name)}</div>
          <div class="doctor-sub">${doctor.prestazioni.length} prestazioni salvate</div>
          <div class="card-actions">
            <button class="small-pill-btn" type="button" onclick="deleteDoctor(${doctor.id})">Elimina</button>
          </div>
        </div>
      `).join("")
    : `<div class="doctor-card"><div class="doctor-name">Nessun medico inserito</div></div>`;
}

function renderServicesPage() {
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
            <div class="card-actions">
              <button class="small-pill-btn" type="button" onclick="deleteServiceFromDoctor(${doctor.id}, '${escapeJs(service.nome)}')">Elimina</button>
            </div>
          </div>
        `).join("")
    : `<div class="service-card"><div class="service-name">Nessuna prestazione salvata</div></div>`;
}

function renderReportFilter() {
  const box = document.getElementById("reportFilterBox");
  const title = document.getElementById("reportFilterTitle");
  if (!box || !title) return;

  document.querySelectorAll("[data-report-mode]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.reportMode === reportMode);
  });

  if (reportMode === "day") {
    title.textContent = "Giorno selezionato";
    box.innerHTML = `<input id="reportDayInput" class="input" type="date" max="${todayISO()}" value="${reportSelected}" />`;
    document.getElementById("reportDayInput").addEventListener("input", (e) => {
      reportSelected = e.target.value || todayISO();
      renderReport();
    });
  } else if (reportMode === "month") {
    title.textContent = "Mese selezionato";
    box.innerHTML = `<input id="reportMonthInput" class="input" type="month" value="${reportSelected}" />`;
    document.getElementById("reportMonthInput").addEventListener("input", (e) => {
      reportSelected = e.target.value || monthISO();
      renderReport();
    });
  } else {
    title.textContent = "Anno selezionato";
    box.innerHTML = `<input id="reportYearInput" class="input" type="number" min="2000" max="2099" value="${reportSelected}" />`;
    document.getElementById("reportYearInput").addEventListener("input", (e) => {
      reportSelected = e.target.value || yearISO();
      renderReport();
    });
  }
}

function renderReport() {
  renderReportFilter();

  const filtered = getFilteredEntries(reportMode, reportSelected);

  let pos = 0;
  let contanti = 0;
  let standard = 0;
  let riservata = 0;

  filtered.forEach((entry) => {
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
        backgroundColor: ["#3a86ff", "#59d38b"]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" }
      }
    }
  });
}

function labelInvoiceState(state) {
  if (state === "fatturato") return "fatturato";
  if (state === "pagato") return "pagato";
  return "da fatturare";
}

function cycleInvoiceState(entryId) {
  const current = invoiceStates[entryId] || "da_fatturare";
  const next = current === "da_fatturare"
    ? "fatturato"
    : current === "fatturato"
      ? "pagato"
      : "da_fatturare";

  invoiceStates[entryId] = next;
  localStorage.setItem(STORAGE_KEYS.invoiceStates, JSON.stringify(invoiceStates));
  renderHome();
  renderInvoices();
}

function renderInvoices() {
  const doctorFilter = document.getElementById("invoiceDoctorFilter")?.value || "";
  const dateFilter = document.getElementById("invoiceDateFilter")?.value || "";
  const amountFilter = document.getElementById("invoiceAmountFilter")?.value || "";
  const stateFilter = document.getElementById("invoiceStateFilter")?.value || "";

  const doctorSelect = document.getElementById("invoiceDoctorFilter");
  if (doctorSelect) {
    const currentValue = doctorSelect.value;
    doctorSelect.innerHTML =
      `<option value="">Tutti i medici</option>` +
      doctors.map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.name)}</option>`).join("");
    doctorSelect.value = currentValue;
  }

  const filtered = entries.filter((entry) => {
    const currentState = invoiceStates[entry.id] || "da_fatturare";

    const doctorOk = !doctorFilter || String(entry.doctorId) === String(doctorFilter);
    const dateOk = !dateFilter || entry.data === dateFilter;
    const amountOk = !amountFilter || Number(entry.importo) === Number(amountFilter);
    const stateOk = !stateFilter || currentState === stateFilter;

    return doctorOk && dateOk && amountOk && stateOk;
  });

  const list = document.getElementById("invoiceList");
  if (!list) return;

  list.innerHTML = filtered.length
    ? filtered
        .sort((a, b) => b.data.localeCompare(a.data))
        .map((entry) => {
          const doctor = doctors.find((item) => item.id === entry.doctorId);
          const currentState = invoiceStates[entry.id] || "da_fatturare";

          return `
            <div class="invoice-card">
              <div class="invoice-title">${escapeHtml(doctor?.name || "Medico")} - ${escapeHtml(entry.prestazione)}</div>
              <div class="invoice-sub">${escapeHtml(entry.data)} · ${euro(entry.importo)} · ${escapeHtml(entry.metodo)} · ${escapeHtml(entry.tipo)}</div>
              <div class="card-actions">
                <div class="state-pill state-${currentState}">${labelInvoiceState(currentState)}</div>
                <button class="small-pill-btn" type="button" onclick="cycleInvoiceState(${entry.id})">Cambia stato</button>
              </div>
            </div>
          `;
        }).join("")
    : `<div class="invoice-card"><div class="invoice-title">Nessun risultato</div></div>`;
}

function printPdf() {
  const items = [...entries].sort((a, b) => a.data.localeCompare(b.data));

  const html = `
    <html>
      <head>
        <title>Riepilogo ANVAMED</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;color:#17202c}
          h1{margin-bottom:18px}
          .row{padding:10px 0;border-bottom:1px solid #d8e2ec}
          .sub{color:#6f7d8c;font-size:13px;margin-top:4px}
          .back{margin-top:20px;padding:10px 16px;border:1px solid #ccc;border-radius:10px;background:#fff}
        </style>
      </head>
      <body>
        <h1>Riepilogo fatture</h1>
        ${items.map((entry) => {
          const doctor = doctors.find((item) => item.id === entry.doctorId);
          return `
            <div class="row">
              <strong>${escapeHtml(doctor?.name || "Medico")} - ${escapeHtml(entry.prestazione)}</strong>
              <div class="sub">${escapeHtml(entry.data)} · ${euro(entry.importo)} · ${escapeHtml(entry.metodo)} · ${escapeHtml(entry.tipo)}</div>
            </div>
          `;
        }).join("")}
        <button class="back" onclick="window.history.back()">Torna indietro</button>
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
    } catch (error) {
      alert("Backup non valido");
    }
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

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setPage(btn.dataset.page));
  });

  document.getElementById("openNewEntryBtn")?.addEventListener("click", openEntryModal);
  document.getElementById("closeEntryModalBtn")?.addEventListener("click", closeEntryModal);
  document.getElementById("cancelEntryBtn")?.addEventListener("click", closeEntryModal);
  document.getElementById("saveEntryBtn")?.addEventListener("click", saveEntry);

  document.getElementById("toggleServicePickerBtn")?.addEventListener("click", () => {
    document.getElementById("servicePickerPanel")?.classList.toggle("hidden");
    updateEntryServicePicker();
  });

  document.getElementById("serviceSearchInput")?.addEventListener("input", updateEntryServicePicker);
  document.getElementById("entryDoctorSelect")?.addEventListener("change", updateEntryServicePicker);

  document.getElementById("entryAmountInput")?.addEventListener("input", updateEntryPreview);
  document.getElementById("entryPercInput")?.addEventListener("input", updateEntryPreview);

  document.querySelectorAll(".method-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      entryMethod = btn.dataset.method;
      document.querySelectorAll(".method-btn").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.method === entryMethod);
      });
    });
  });

  document.querySelectorAll(".type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      entryType = btn.dataset.type;
      document.querySelectorAll(".type-btn").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.type === entryType);
      });
    });
  });

  document.querySelectorAll("[data-home-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      homeMode = btn.dataset.homeMode;
      homeSelected = homeMode === "day" ? todayISO() : homeMode === "month" ? monthISO() : yearISO();
      renderHome();
    });
  });

  document.querySelectorAll("[data-report-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      reportMode = btn.dataset.reportMode;
      reportSelected = reportMode === "day" ? todayISO() : reportMode === "month" ? monthISO() : yearISO();
      renderReport();
    });
  });

  document.getElementById("addDoctorBtn")?.addEventListener("click", addDoctor);
  document.getElementById("addServiceBtn")?.addEventListener("click", addServiceToDoctor);
  document.getElementById("servicesDoctorSelect")?.addEventListener("change", renderServicesPage);

  document.getElementById("exportBtn")?.addEventListener("click", exportData);
  document.getElementById("importFile")?.addEventListener("change", (e) => {
    importData(e.target.files[0]);
    e.target.value = "";
  });

  document.getElementById("invoiceDoctorFilter")?.addEventListener("change", renderInvoices);
  document.getElementById("invoiceDateFilter")?.addEventListener("input", renderInvoices);
  document.getElementById("invoiceAmountFilter")?.addEventListener("input", renderInvoices);
  document.getElementById("invoiceStateFilter")?.addEventListener("change", renderInvoices);

  document.getElementById("printPdfBtn")?.addEventListener("click", printPdf);
  document.getElementById("goBackBtn")?.addEventListener("click", goBack);

  document.getElementById("openCalendarBtn")?.addEventListener("click", () => {
    alert("Calendario: nella prossima rifinitura posso farti anche il calendario visuale completo.");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  initLogin();
  bindEvents();
  renderAll();
});
