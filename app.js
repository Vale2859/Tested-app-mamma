
const STORAGE_KEYS = {
  doctors: "anvamed_doctors_v2",
  entries: "anvamed_entries_v2",
  invoiceStates: "anvamed_invoice_states_v2"
};

const PIE_COLORS = ["#2d8cff", "#59cf82", "#9a62d8", "#eead42", "#dd5a52", "#39b86b", "#6e7b88"];
const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const DAY_KEYS = ["L-0", "M-1", "M-2", "G-3", "V-4", "S-5", "D-6"];

let doctors = JSON.parse(localStorage.getItem(STORAGE_KEYS.doctors)) || [];
let entries = JSON.parse(localStorage.getItem(STORAGE_KEYS.entries)) || [];
let invoiceStates = JSON.parse(localStorage.getItem(STORAGE_KEYS.invoiceStates)) || {};

let currentDoctorId = null;
let editingEntryId = null;

let homeFilterType = "giorno";
let homeFilterValue = todayISO();
let reportFilterType = "giorno";
let reportFilterValue = todayISO();
let prestazioniFilterType = "giorno";
let prestazioniFilterValue = todayISO();

let invoicePeriodType = "giorno";
let invoicePeriodValue = todayISO();

function saveAll() {
  localStorage.setItem(STORAGE_KEYS.doctors, JSON.stringify(doctors));
  localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
  localStorage.setItem(STORAGE_KEYS.invoiceStates, JSON.stringify(invoiceStates));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function currentMonthISO() { return todayISO().slice(0,7); }
function currentYearISO() { return todayISO().slice(0,4); }
function currency(value) { return "€" + Number(value || 0).toFixed(2); }
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function monthLabel(monthIso) {
  const [y,m] = monthIso.split("-");
  const mesi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  return `${mesi[Number(m)-1]} ${y}`;
}
function formatDateLabel(iso) {
  if (!iso) return "-";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function formatFilterLabel(type, value) {
  if (type === "giorno") return formatDateLabel(value);
  if (type === "mese") return monthLabel(value);
  if (type === "anno") return String(value);
  return String(value);
}
function normalizeData() {
  doctors = doctors.map((d) => ({ ...d, availability: Array.isArray(d.availability) ? d.availability : [] }));
  entries = entries.map((e, index) => {
    const importo = Number(e.importo || 0);
    const percMedico = Number(e.percMedico ?? 60);
    const quotaMedico = Number(e.quotaMedico ?? (importo * percMedico / 100));
    const quotaStruttura = Number(e.quotaStruttura ?? (importo - quotaMedico));
    return {
      id: e.id || Date.now() + index,
      doctorId: Number(e.doctorId),
      prestazione: e.prestazione || "Prestazione",
      data: e.data || todayISO(),
      importo,
      percMedico,
      quotaMedico,
      quotaStruttura,
      tipoVoce: e.tipoVoce || "standard",
      metodoPagamento: e.metodoPagamento || "pos"
    };
  });
  saveAll();
}
function getDoctorById(id) { return doctors.find((d) => d.id === id) || null; }
function getDoctorNameById(id) { return getDoctorById(id)?.name || "Medico"; }
function getEntriesByFilter(type, value) {
  return entries.filter((e) => {
    if (type === "giorno") return e.data === value;
    if (type === "mese") return e.data.startsWith(value);
    if (type === "anno") return e.data.startsWith(String(value));
    return true;
  });
}
function buildStatsMap(list) {
  const map = {};
  list.forEach((e) => {
    if (!map[e.doctorId]) map[e.doctorId] = { total:0, doctor:0, structure:0, count:0, percMedico:e.percMedico || 0 };
    map[e.doctorId].total += e.importo;
    map[e.doctorId].doctor += e.quotaMedico;
    map[e.doctorId].structure += e.quotaStruttura;
    map[e.doctorId].count += 1;
    map[e.doctorId].percMedico = e.percMedico || map[e.doctorId].percMedico;
  });
  return map;
}
function groupPrestazioni(list) {
  const map = {};
  list.forEach((e) => {
    const key = e.prestazione.trim() || "Prestazione";
    if (!map[key]) map[key] = { name:key, count:0, total:0 };
    map[key].count += 1;
    map[key].total += e.importo;
  });
  return Object.values(map).sort((a,b) => b.count - a.count || b.total - a.total);
}
function buildHorizontalBars(items, valueKey, maxItems=6, emptyText="Nessun dato.") {
  const slice = items.slice(0, maxItems);
  if (!slice.length) return `<div class="medico-card">${emptyText}</div>`;
  const max = Math.max(...slice.map((i) => i[valueKey] || 0), 1);
  return `
    <div class="card bars-card">
      ${slice.map((item, idx) => {
        const pct = Math.max(12, Math.round(((item[valueKey] || 0) / max) * 100));
        return `
          <div class="bar-row">
            <div class="bar-row-head">
              <span class="bar-name">${escapeHtml(item.name)}</span>
              <span class="bar-val">${valueKey === 'count' ? item.count + ' prest.' : currency(item[valueKey])}</span>
            </div>
            <div class="bar-track"><div class="bar-fill color-${idx % 6}" style="width:${pct}%"></div></div>
          </div>
        `;
      }).join("")}
    </div>`;
}
function buildPieSVG(items) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let current = -Math.PI / 2;
  const cx = 80, cy = 80, r = 64;
  const paths = items.map((item) => {
    const slice = (item.value / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(current);
    const y1 = cy + r * Math.sin(current);
    current += slice;
    const x2 = cx + r * Math.cos(current);
    const y2 = cy + r * Math.sin(current);
    const largeArc = slice > Math.PI ? 1 : 0;
    return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${item.color}"></path>`;
  }).join("");
  return `<svg viewBox="0 0 160 160" class="pie-svg">${paths}<circle cx="80" cy="80" r="26" fill="#fff"></circle><text x="80" y="84" text-anchor="middle" class="pie-total">${Math.round(total)}</text></svg>`;
}
function go(pageId) {
  document.querySelectorAll('.page').forEach((p)=>p.classList.toggle('active', p.id===pageId));
  document.querySelectorAll('.menu-btn').forEach((b)=>b.classList.toggle('active', b.dataset.page===pageId));
  if (pageId === 'homePage') renderHome();
  if (pageId === 'mediciPage') renderDoctorsPage();
  if (pageId === 'doctorDetailPage' && currentDoctorId) renderDoctorDetail();
  if (pageId === 'prestazioniPage') renderPrestazioniPage();
  if (pageId === 'reportPage') renderReport();
  if (pageId === 'fatturePage') renderInvoices();
  if (pageId === 'calendarPage') renderCalendar();
}
function setActiveTab(section, type) {
  const prefixMap = { home:'homeTab', report:'reportTab', prestazioni:'prestazioniTab' };
  const prefix = prefixMap[section];
  ["Giorno","Mese","Anno"].forEach((label) => document.getElementById(prefix + label)?.classList.remove('active'));
  const map = { giorno:'Giorno', mese:'Mese', anno:'Anno' };
  document.getElementById(prefix + map[type])?.classList.add('active');
}
function setFilterType(section, type) {
  const value = type === 'giorno' ? todayISO() : type === 'mese' ? currentMonthISO() : currentYearISO();
  if (section==='home') { homeFilterType = type; homeFilterValue = value; setActiveTab('home', type); renderHomeFilterControl(); renderHome(); }
  if (section==='report') { reportFilterType = type; reportFilterValue = value; setActiveTab('report', type); renderReportFilterControl(); renderReport(); }
  if (section==='prestazioni') { prestazioniFilterType = type; prestazioniFilterValue = value; setActiveTab('prestazioni', type); renderPrestazioniFilterControl(); renderPrestazioniPage(); }
}
function buildFilterControl(type, value, prefix, onChangeJs) {
  if (type === 'giorno') return `<label for="${prefix}Day">Giorno selezionato</label><input id="${prefix}Day" type="date" max="${todayISO()}" value="${value}" />`;
  if (type === 'mese') return `<label for="${prefix}Month">Mese selezionato</label><input id="${prefix}Month" type="month" value="${value}" />`;
  return `<label for="${prefix}Year">Anno selezionato</label><input id="${prefix}Year" type="number" min="2000" max="${currentYearISO()}" value="${value}" />`;
}
function bindFilterControl(type, prefix, setter) {
  document.getElementById(`${prefix}Day`)?.addEventListener('change', (e)=>setter(e.target.value || todayISO()));
  document.getElementById(`${prefix}Month`)?.addEventListener('change', (e)=>setter(e.target.value || currentMonthISO()));
  document.getElementById(`${prefix}Year`)?.addEventListener('change', (e)=>setter(String(e.target.value || currentYearISO())));
}
function renderHomeFilterControl() {
  const wrap = document.getElementById('homeFilterControlWrap');
  wrap.innerHTML = `<div class="filter-control">${buildFilterControl(homeFilterType, homeFilterValue, 'homeFilter')}</div>`;
  bindFilterControl(homeFilterType, 'homeFilter', (v)=>{ homeFilterValue=v; renderHome(); });
}
function renderReportFilterControl() {
  const wrap = document.getElementById('reportFilterControlWrap');
  wrap.innerHTML = `<div class="filter-control">${buildFilterControl(reportFilterType, reportFilterValue, 'reportFilter')}</div>`;
  bindFilterControl(reportFilterType, 'reportFilter', (v)=>{ reportFilterValue=v; renderReport(); });
}
function renderPrestazioniFilterControl() {
  const wrap = document.getElementById('prestazioniFilterControlWrap');
  wrap.innerHTML = `<div class="filter-control">${buildFilterControl(prestazioniFilterType, prestazioniFilterValue, 'prestazioniFilter')}</div>`;
  bindFilterControl(prestazioniFilterType, 'prestazioniFilter', (v)=>{ prestazioniFilterValue=v; renderPrestazioniPage(); });
}
function renderTopMonthlyCards() {
  const monthEntries = entries.filter((e) => e.data.startsWith(currentMonthISO()));
  const total = monthEntries.reduce((s,e)=>s+e.importo,0);
  const structure = monthEntries.reduce((s,e)=>s+e.quotaStruttura,0);
  const doctor = monthEntries.reduce((s,e)=>s+e.quotaMedico,0);
  document.getElementById('meseCorrenteTotale').textContent = currency(total);
  document.getElementById('meseCorrenteStruttura').textContent = currency(structure);
  document.getElementById('meseCorrenteMedici').textContent = currency(doctor);
}
function renderHome() {
  renderTopMonthlyCards();
  const filtered = getEntriesByFilter(homeFilterType, homeFilterValue).sort((a,b)=> new Date(b.data) - new Date(a.data));
  const statsMap = buildStatsMap(filtered);
  document.getElementById('homeGuadagno').textContent = currency(filtered.reduce((s,e)=>s+e.importo,0));
  document.getElementById('homeUtile').textContent = currency(filtered.reduce((s,e)=>s+e.quotaStruttura,0));
  document.getElementById('homePeriodoLabel').textContent = `${homeFilterType[0].toUpperCase()+homeFilterType.slice(1)} selezionato: ${formatFilterLabel(homeFilterType, homeFilterValue)}`;
  const workedDoctors = doctors.filter((d)=>statsMap[d.id]);
  const doctorCards = workedDoctors.map((doctor) => {
    const s = statsMap[doctor.id];
    const percMedico = Math.round(s.percMedico || 0), percStruttura = 100 - percMedico;
    return `<div class="medico-card clickable" data-doctor-id="${doctor.id}">
      <div class="medico-top"><div class="avatar">👨‍⚕️</div><div class="medico-main">
        <div class="medico-name">${escapeHtml(doctor.name)}</div>
        <div class="medico-sub"><span class="medico-total">Totale: ${currency(s.total)}</span><span class="medico-badge">${s.count} prestazioni</span></div>
        <div class="percent-row"><div class="percent-seg medico">${percMedico}% Medico</div><div class="percent-seg struttura">${percStruttura}% Struttura</div></div>
        <div class="gains-row"><span class="medico-val">${currency(s.doctor)}</span><span class="struttura-val">${currency(s.structure)}</span></div>
      </div></div></div>`;
  }).join('');
  const recentHtml = filtered.slice(0, 8).map((entry) => `<div class="medico-card compact-entry ${entry.tipoVoce === 'riservata' ? 'entry-riservata' : ''}">
      <div class="prestazione-top"><div><div class="prestazione-title">${escapeHtml(entry.prestazione)}</div><div class="prestazione-date">${formatDateLabel(entry.data)} · ${escapeHtml(getDoctorNameById(entry.doctorId))}</div></div><div class="prestazione-amount">${currency(entry.importo)}</div></div>
      <div class="prestazione-gains"><span class="mini-badge">${entry.tipoVoce}</span><span class="mini-badge soft">${entry.metodoPagamento}</span></div>
    </div>`).join('');
  document.getElementById('homeWorkedDoctors').innerHTML = `
    ${doctorCards || `<div class="medico-card">Nessun medico ha lavorato nel periodo selezionato.</div>`}
    <div class="page-subtitle inner-space">Registrazioni recenti</div>
    ${recentHtml || `<div class="medico-card">Nessuna registrazione nel periodo selezionato.</div>`}
  `;
  document.querySelectorAll('#homeWorkedDoctors [data-doctor-id]').forEach((card)=>card.addEventListener('click', ()=>openDoctorDetail(Number(card.dataset.doctorId))));
}
function renderDoctorsPage() {
  const html = doctors.map((doctor) => {
    const totalEntries = entries.filter((e)=>e.doctorId===doctor.id).length;
    return `<div class="doctor-premium-card">
      <div class="doctor-premium-main" data-open-doctor="${doctor.id}">
        <div class="doctor-premium-avatar">👨‍⚕️</div>
        <div class="doctor-premium-text"><div class="doctor-premium-name">${escapeHtml(doctor.name)}</div><div class="doctor-premium-meta">${totalEntries} prestazioni archiviate</div></div>
      </div>
      <div class="simple-medico-actions"><button class="icon-btn" type="button" data-edit-doctor="${doctor.id}">✏️</button><button class="icon-btn" type="button" data-delete-doctor="${doctor.id}">🗑️</button></div>
    </div>`;
  }).join('');
  document.getElementById('doctorsSimpleList').innerHTML = html || `<div class="medico-card">Nessun medico inserito.</div>`;
  document.querySelectorAll('[data-open-doctor]').forEach((el)=>el.addEventListener('click', ()=>openDoctorDetail(Number(el.dataset.openDoctor))));
  document.querySelectorAll('[data-edit-doctor]').forEach((btn)=>btn.addEventListener('click', ()=>editDoctor(Number(btn.dataset.editDoctor))));
  document.querySelectorAll('[data-delete-doctor]').forEach((btn)=>btn.addEventListener('click', ()=>deleteDoctor(Number(btn.dataset.deleteDoctor))));
}
function openDoctorDetail(doctorId) {
  currentDoctorId = doctorId;
  const doctor = getDoctorById(doctorId); if (!doctor) return;
  document.getElementById('doctorDetailName').textContent = doctor.name;
  const availabilityHtml = DAY_LABELS.map((label, idx) => {
    const key = DAY_KEYS[idx];
    return `<span class="${doctor.availability.includes(key)?'active':''}" data-availability-key="${key}">${label}<b class="flag-dot"></b></span>`;
  }).join('');
  const availabilityWrap = document.getElementById('doctorAvailability');
  availabilityWrap.innerHTML = availabilityHtml;
  availabilityWrap.querySelectorAll('[data-availability-key]').forEach((el)=>el.addEventListener('click', ()=>toggleDoctorAvailability(el.dataset.availabilityKey)));
  if (!document.getElementById('doctorDetailMonth').value) document.getElementById('doctorDetailMonth').value = currentMonthISO();
  renderDoctorDetail();
  go('doctorDetailPage');
}
function toggleDoctorAvailability(key) {
  const doctor = getDoctorById(currentDoctorId); if (!doctor) return;
  if (doctor.availability.includes(key)) doctor.availability = doctor.availability.filter((x)=>x!==key); else doctor.availability.push(key);
  saveAll(); openDoctorDetail(currentDoctorId);
}
function renderDoctorDetail() {
  const doctor = getDoctorById(currentDoctorId); if (!doctor) return;
  const month = document.getElementById('doctorDetailMonth').value || currentMonthISO();
  const list = entries.filter((e)=>e.doctorId===currentDoctorId && e.data.startsWith(month)).sort((a,b)=>new Date(b.data)-new Date(a.data));
  document.getElementById('doctorMonthLabel').textContent = `Prestazioni di ${monthLabel(month)}`;
  document.getElementById('doctorTotMedico').textContent = currency(list.reduce((s,e)=>s+e.quotaMedico,0));
  document.getElementById('doctorTotStruttura').textContent = currency(list.reduce((s,e)=>s+e.quotaStruttura,0));
  document.getElementById('doctorTotPrestazioni').textContent = list.length;
  document.getElementById('doctorExamChart').innerHTML = buildHorizontalBars(groupPrestazioni(list), 'count', 5, 'Nessun esame nel mese selezionato.');
  const wrap = document.getElementById('doctorMonthPrestazioni');
  wrap.innerHTML = list.map((entry)=>`<div class="medico-card ${entry.tipoVoce==='riservata'?'entry-riservata':''}">
    <div class="prestazione-top"><div><div class="prestazione-title">${escapeHtml(entry.prestazione)}</div><div class="prestazione-date">${formatDateLabel(entry.data)} · ${entry.metodoPagamento}</div></div><div class="prestazione-amount">${currency(entry.importo)}</div></div>
    <div class="prestazione-gains"><span class="medico-val">👨‍⚕️ ${currency(entry.quotaMedico)}</span><span class="struttura-val">🏥 ${currency(entry.quotaStruttura)}</span><span class="mini-badge">${entry.tipoVoce}</span></div>
    <div class="card-actions" style="margin-top:12px;"><button class="icon-btn" type="button" data-edit-entry="${entry.id}">✏️</button><button class="icon-btn" type="button" data-delete-entry="${entry.id}">🗑️</button></div>
  </div>`).join('') || `<div class="medico-card">Nessuna prestazione nel mese selezionato.</div>`;
  wrap.querySelectorAll('[data-edit-entry]').forEach((btn)=>btn.addEventListener('click', ()=>openEntryPopup(Number(btn.dataset.editEntry))));
  wrap.querySelectorAll('[data-delete-entry]').forEach((btn)=>btn.addEventListener('click', ()=>deleteEntry(Number(btn.dataset.deleteEntry))));
}
function renderPrestazioniPage() {
  const list = getEntriesByFilter(prestazioniFilterType, prestazioniFilterValue);
  const grouped = groupPrestazioni(list);
  document.getElementById('prestazioniPeriodoLabel').textContent = `Prestazioni ${formatFilterLabel(prestazioniFilterType, prestazioniFilterValue)}`;
  document.getElementById('prestazioniChart').innerHTML = buildHorizontalBars(grouped, 'count', 8, 'Nessuna prestazione nel periodo selezionato.');
  document.getElementById('prestazioniList').innerHTML = grouped.map((item)=>`<div class="medico-card"><div class="prestazione-top"><div><div class="prestazione-title">${escapeHtml(item.name)}</div><div class="prestazione-date">${item.count} esecuzioni</div></div><div class="prestazione-amount">${currency(item.total)}</div></div></div>`).join('') || `<div class="medico-card">Nessuna prestazione nel periodo selezionato.</div>`;
}
function renderReport() {
  const list = getEntriesByFilter(reportFilterType, reportFilterValue);
  const stats = buildStatsMap(list);
  const workedDoctors = doctors.filter((d)=>stats[d.id]);
  const total = list.reduce((s,e)=>s+e.importo,0);
  const structure = list.reduce((s,e)=>s+e.quotaStruttura,0);
  const doctor = list.reduce((s,e)=>s+e.quotaMedico,0);
  const totalPos = list.filter((e)=>e.metodoPagamento==='pos').reduce((s,e)=>s+e.importo,0);
  const totalContanti = list.filter((e)=>e.metodoPagamento==='contanti').reduce((s,e)=>s+e.importo,0);
  const countStandard = list.filter((e)=>e.tipoVoce==='standard').length;
  const countRiservata = list.filter((e)=>e.tipoVoce==='riservata').length;
  const totalTransaThaw = list.filter((e)=>String(e.prestazione).toLowerCase().includes('transa thaw')).reduce((s,e)=>s+e.importo,0);
  document.getElementById('reportPeriodoLabel').textContent = `${reportFilterType.toUpperCase()} selezionato: ${formatFilterLabel(reportFilterType, reportFilterValue)}`;
  document.getElementById('transaThawBox').innerHTML = `<div class="wide-highlight-inner"><span class="wide-highlight-label">Totale Transa Thaw</span><strong class="wide-highlight-value">${currency(totalTransaThaw)}</strong><span class="wide-highlight-sub">Filtro: ${formatFilterLabel(reportFilterType, reportFilterValue)}</span></div>`;
  const pieItems = workedDoctors.map((d, idx)=>({ name:d.name, value:stats[d.id].total, color:PIE_COLORS[idx % PIE_COLORS.length] }));
  const legend = pieItems.map((item)=>`<div class="legend-row"><div class="legend-left"><span class="legend-dot" style="background:${item.color}"></span><span class="legend-name">${escapeHtml(item.name)}</span></div><span class="legend-val">${currency(item.value)}</span></div>`).join('');
  document.getElementById('reportPieWrap').innerHTML = pieItems.length ? `<div class="pie-card"><div class="pie-layout">${buildPieSVG(pieItems)}<div class="pie-legend">${legend}</div></div></div>` : `<div class="medico-card">Nessun medico ha lavorato nel periodo selezionato.</div>`;
  const cards = workedDoctors.map((doctorItem) => {
    const s = stats[doctorItem.id];
    return `<div class="card report-card"><div class="report-card-title">${escapeHtml(doctorItem.name)}</div><div class="report-card-value">${currency(s.total)}</div><div class="page-subtitle">Prestazioni: ${s.count} · Medico: ${currency(s.doctor)} · Struttura: ${currency(s.structure)}</div></div>`;
  }).join('');
  document.getElementById('reportCards').innerHTML = `
    <div class="card report-card"><div class="report-card-title">Guadagno totale</div><div class="report-card-value">${currency(total)}</div></div>
    <div class="card report-card"><div class="report-card-title">Totale struttura</div><div class="report-card-value">${currency(structure)}</div></div>
    <div class="card report-card"><div class="report-card-title">Totale medici</div><div class="report-card-value">${currency(doctor)}</div></div>
    <div class="card report-card"><div class="report-card-title">Prestazioni totali</div><div class="report-card-value">${list.length}</div></div>
    <div class="card report-card"><div class="report-card-title">POS</div><div class="report-card-value">${currency(totalPos)}</div></div>
    <div class="card report-card"><div class="report-card-title">Contanti</div><div class="report-card-value">${currency(totalContanti)}</div></div>
    <div class="card report-card"><div class="report-card-title">Standard</div><div class="report-card-value">${countStandard}</div></div>
    <div class="card report-card"><div class="report-card-title">Riservata</div><div class="report-card-value">${countRiservata}</div></div>
    ${cards}`;
}
function invoiceDateRange() {
  if (invoicePeriodType === 'giorno') return { fromDate: invoicePeriodValue, toDate: invoicePeriodValue, label: formatDateLabel(invoicePeriodValue) };
  if (invoicePeriodType === 'mese') {
    const [y,m] = invoicePeriodValue.split('-');
    const last = new Date(Number(y), Number(m), 0).toISOString().slice(0,10);
    return { fromDate: `${y}-${m}-01`, toDate: last, label: monthLabel(invoicePeriodValue) };
  }
  if (invoicePeriodType === 'anno') return { fromDate: `${invoicePeriodValue}-01-01`, toDate: `${invoicePeriodValue}-12-31`, label: String(invoicePeriodValue) };
  const fromDate = document.getElementById('fattureDateFrom')?.value || todayISO();
  const toDate = document.getElementById('fattureDateTo')?.value || fromDate;
  return { fromDate, toDate: toDate < fromDate ? fromDate : toDate, label: `${formatDateLabel(fromDate)} → ${formatDateLabel(toDate)}` };
}
function getInvoiceFilters() {
  const { fromDate, toDate, label } = invoiceDateRange();
  return {
    fromDate,
    toDate,
    label,
    status: document.getElementById('fattureStatusFilter').value || 'tutti',
    tipoVoce: document.getElementById('fattureTypeFilter').value || 'tutti'
  };
}
function invoiceKey(doctorId, fromDate, toDate, tipoVoce) { return `${doctorId}__${fromDate}__${toDate}__${tipoVoce}`; }
function cycleInvoiceStatus(doctorId, fromDate, toDate, tipoVoce) {
  const key = invoiceKey(doctorId, fromDate, toDate, tipoVoce);
  const current = invoiceStates[key] || 'da_fatturare';
  invoiceStates[key] = current === 'da_fatturare' ? 'fatturato' : current === 'fatturato' ? 'pagato' : 'da_fatturare';
  saveAll(); renderInvoices();
}
function renderInvoicePeriodControl() {
  const wrap = document.getElementById('fatturePeriodControlWrap');
  if (!wrap) return;
  if (invoicePeriodType === 'giorno') wrap.innerHTML = `<label for="fattureSingleDay">Giorno</label><input id="fattureSingleDay" type="date" max="${todayISO()}" value="${invoicePeriodValue}" />`;
  else if (invoicePeriodType === 'mese') wrap.innerHTML = `<label for="fattureMonth">Mese</label><input id="fattureMonth" type="month" value="${invoicePeriodValue}" />`;
  else if (invoicePeriodType === 'anno') wrap.innerHTML = `<label for="fattureYear">Anno</label><input id="fattureYear" type="number" min="2000" max="${currentYearISO()}" value="${invoicePeriodValue}" />`;
  else wrap.innerHTML = `<label for="fattureDateFrom">Da giorno</label><input id="fattureDateFrom" type="date" max="${todayISO()}" value="${todayISO()}" /><label for="fattureDateTo" style="margin-top:10px;display:block;">A giorno</label><input id="fattureDateTo" type="date" max="${todayISO()}" value="${todayISO()}" />`;
  document.getElementById('fattureSingleDay')?.addEventListener('change', (e)=>{invoicePeriodValue=e.target.value || todayISO(); renderInvoices();});
  document.getElementById('fattureMonth')?.addEventListener('change', (e)=>{invoicePeriodValue=e.target.value || currentMonthISO(); renderInvoices();});
  document.getElementById('fattureYear')?.addEventListener('change', (e)=>{invoicePeriodValue=String(e.target.value || currentYearISO()); renderInvoices();});
  document.getElementById('fattureDateFrom')?.addEventListener('change', renderInvoices);
  document.getElementById('fattureDateTo')?.addEventListener('change', renderInvoices);
}
function renderInvoices() {
  renderInvoicePeriodControl();
  const { fromDate, toDate, label, status, tipoVoce } = getInvoiceFilters();
  let list = entries.filter((e)=>e.data >= fromDate && e.data <= toDate);
  if (tipoVoce !== 'tutti') list = list.filter((e)=>e.tipoVoce === tipoVoce);
  const map = {};
  list.forEach((e)=>{ if (!map[e.doctorId]) map[e.doctorId]=0; map[e.doctorId]+=e.quotaMedico; });
  const workedDoctors = doctors.filter((d)=>map[d.id]);
  const total = Object.values(map).reduce((s,v)=>s+v,0);
  document.getElementById('fatturePeriodoLabel').textContent = `Fatture del periodo: ${label}`;
  document.getElementById('fattureSummary').innerHTML = `<div class="card report-card"><div class="report-card-title">Totale da fatturare</div><div class="report-card-value">${currency(total)}</div></div><div class="card report-card"><div class="report-card-title">Medici nel periodo</div><div class="report-card-value">${workedDoctors.length}</div></div>`;
  const html = workedDoctors.map((doctor) => {
    const amount = map[doctor.id] || 0;
    const currentStatus = invoiceStates[invoiceKey(doctor.id, fromDate, toDate, tipoVoce)] || 'da_fatturare';
    if (status !== 'tutti' && currentStatus !== status) return '';
    return `<div class="card fattura-card"><div class="fattura-name">${escapeHtml(doctor.name)}</div><div class="fattura-amount">${currency(amount)}</div><button class="fattura-status-btn status-${currentStatus}" type="button" data-invoice-doctor="${doctor.id}">${currentStatus.replaceAll('_',' ')}</button></div>`;
  }).join('');
  const wrap = document.getElementById('fattureList');
  wrap.innerHTML = html || `<div class="medico-card">Nessun medico nel periodo/filtro selezionato.</div>`;
  wrap.querySelectorAll('[data-invoice-doctor]').forEach((btn)=>btn.addEventListener('click', ()=>cycleInvoiceStatus(Number(btn.dataset.invoiceDoctor), fromDate, toDate, tipoVoce)));
}
function daysInMonth(year, monthIndex) { return new Date(year, monthIndex + 1, 0).getDate(); }
function renderCalendar() {
  const input = document.getElementById('calendarMonth');
  const monthValue = input.value || currentMonthISO();
  input.value = monthValue;
  const [yearStr, monthStr] = monthValue.split('-');
  const year = Number(yearStr), monthIndex = Number(monthStr) - 1;
  let jsDay = new Date(year, monthIndex, 1).getDay(); jsDay = jsDay === 0 ? 6 : jsDay - 1;
  const totalDays = daysInMonth(year, monthIndex);
  let html = DAY_LABELS.map((name)=>`<div class="calendar-day-name">${name}</div>`).join('');
  for (let i=0;i<jsDay;i++) html += `<div class="calendar-day empty"></div>`;
  for (let day=1; day<=totalDays; day++) {
    const iso = `${yearStr}-${monthStr}-${String(day).padStart(2,'0')}`;
    const count = entries.filter((e)=>e.data===iso).length;
    html += `<button class="calendar-day ${count ? 'has-data' : ''}" type="button" data-calendar-day="${iso}"><div class="calendar-day-number">${day}</div><div class="calendar-day-count">${count ? `${count} reg.` : ''}</div></button>`;
  }
  const grid = document.getElementById('calendarGrid'); grid.innerHTML = html;
  grid.querySelectorAll('[data-calendar-day]').forEach((btn)=>btn.addEventListener('click', ()=>{ homeFilterType='giorno'; homeFilterValue=btn.dataset.calendarDay; setActiveTab('home','giorno'); renderHomeFilterControl(); renderHome(); go('homePage'); }));
}
function addDoctor() {
  let name = prompt('Nome medico'); if (!name) return; name = name.trim(); if (!name) return;
  if (doctors.some((d)=>d.name.toLowerCase()===name.toLowerCase())) return alert('Medico già esistente');
  doctors.push({ id: Date.now(), name, availability: [] }); saveAll(); renderAll();
}
function editDoctor(id) {
  const doctor = getDoctorById(id); if (!doctor) return;
  let name = prompt('Modifica nome medico', doctor.name); if (!name) return; name = name.trim(); if (!name) return;
  if (doctors.some((d)=>d.id!==id && d.name.toLowerCase()===name.toLowerCase())) return alert('Esiste già un medico con questo nome');
  doctor.name = name; saveAll(); renderAll();
}
function deleteDoctor(id) {
  const doctor = getDoctorById(id); if (!doctor) return;
  const linkedCount = entries.filter((e)=>e.doctorId===id).length;
  if (!confirm(linkedCount ? `Eliminare ${doctor.name}? Verranno eliminate anche ${linkedCount} prestazioni collegate.` : `Eliminare ${doctor.name}?`)) return;
  doctors = doctors.filter((d)=>d.id!==id); entries = entries.filter((e)=>e.doctorId!==id); saveAll(); renderAll(); if (currentDoctorId===id) go('mediciPage');
}
function openEntryPopup(entryId = null, forcedDoctorId = null, forcedDate = null) {
  if (!doctors.length) return alert('Inserisci prima almeno un medico');
  editingEntryId = entryId;
  document.getElementById('popup').classList.remove('hidden');
  document.getElementById('popupTitle').textContent = entryId ? 'Modifica Registrazione' : 'Nuova Registrazione';
  const doctorSelect = document.getElementById('popupDoctorSelect');
  doctorSelect.innerHTML = doctors.map((d)=>`<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  document.getElementById('popupData').max = todayISO();
  if (entryId) {
    const entry = entries.find((e)=>e.id===entryId); if (!entry) return;
    doctorSelect.value = String(entry.doctorId);
    document.getElementById('popupPrestazione').value = entry.prestazione;
    document.getElementById('popupData').value = entry.data;
    document.getElementById('popupImporto').value = entry.importo;
    document.getElementById('popupPercMedico').value = entry.percMedico;
    document.getElementById('popupPercStruttura').value = 100 - entry.percMedico;
    document.getElementById('popupTipoVoce').value = entry.tipoVoce || 'standard';
    document.getElementById('popupMetodoPagamento').value = entry.metodoPagamento || 'pos';
  } else {
    doctorSelect.value = forcedDoctorId ? String(forcedDoctorId) : String(doctors[0].id);
    document.getElementById('popupPrestazione').value = '';
    document.getElementById('popupData').value = forcedDate || (homeFilterType === 'giorno' ? homeFilterValue : todayISO());
    document.getElementById('popupImporto').value = '';
    document.getElementById('popupPercMedico').value = 60;
    document.getElementById('popupPercStruttura').value = 40;
    document.getElementById('popupTipoVoce').value = 'standard';
    document.getElementById('popupMetodoPagamento').value = 'pos';
  }
  updatePopupPreview();
}
function closeEntryPopup() { document.getElementById('popup').classList.add('hidden'); editingEntryId = null; }
function updatePopupPreview() {
  const amount = parseFloat(document.getElementById('popupImporto').value) || 0;
  const percMedico = Math.max(0, Math.min(100, parseFloat(document.getElementById('popupPercMedico').value) || 0));
  const quotaMedico = amount * percMedico / 100, quotaStruttura = amount - quotaMedico;
  document.getElementById('popupMedicoPreview').textContent = currency(quotaMedico);
  document.getElementById('popupStrutturaPreview').textContent = currency(quotaStruttura);
}
function saveEntry() {
  const doctorId = Number(document.getElementById('popupDoctorSelect').value);
  const prestazione = document.getElementById('popupPrestazione').value.trim();
  const data = document.getElementById('popupData').value;
  const importo = parseFloat(document.getElementById('popupImporto').value);
  const percMedico = parseFloat(document.getElementById('popupPercMedico').value);
  const tipoVoce = document.getElementById('popupTipoVoce').value || 'standard';
  const metodoPagamento = document.getElementById('popupMetodoPagamento').value || 'pos';
  if (!doctorId) return alert('Seleziona un medico');
  if (!prestazione) return alert('Inserisci la prestazione');
  if (!data) return alert('Inserisci la data');
  if (data > todayISO()) return alert('Non puoi inserire una data futura');
  if (!importo || isNaN(importo) || importo <= 0) return alert('Inserisci un importo valido');
  if (isNaN(percMedico) || percMedico < 0 || percMedico > 100) return alert('Percentuale medico non valida');
  const quotaMedico = importo * percMedico / 100, quotaStruttura = importo - quotaMedico;
  const payload = { doctorId, prestazione, data, importo, percMedico, quotaMedico, quotaStruttura, tipoVoce, metodoPagamento };
  if (editingEntryId) {
    const entry = entries.find((e)=>e.id===editingEntryId); if (!entry) return;
    Object.assign(entry, payload);
  } else {
    entries.push({ id: Date.now(), ...payload });
  }
  saveAll(); renderAll(); closeEntryPopup();
}
function deleteEntry(id) { if (!confirm('Eliminare questa prestazione?')) return; entries = entries.filter((e)=>e.id!==id); saveAll(); renderAll(); }
function exportData() {
  const data = { doctors, entries, invoiceStates, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `backup-anvamed-${todayISO()}.json`; link.click(); URL.revokeObjectURL(link.href);
}
function importDataFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function() {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object') return alert('File backup non valido');
      if (!confirm('Vuoi importare questo backup e sostituire i dati attuali?')) return;
      doctors = Array.isArray(data.doctors) ? data.doctors : [];
      entries = Array.isArray(data.entries) ? data.entries : [];
      invoiceStates = data.invoiceStates && typeof data.invoiceStates === 'object' ? data.invoiceStates : {};
      normalizeData(); saveAll(); renderAll();
      const input = document.getElementById('importFile'); if (input) input.value = '';
      alert('Backup importato correttamente');
    } catch (error) { console.error(error); alert("Errore durante l'importazione del backup"); }
  };
  reader.readAsText(file);
}
function printDoctorDetail() { window.print(); }
function printReport() { window.print(); }
function printInvoices() { window.print(); }
function renderAll() {
  renderTopMonthlyCards();
  renderHomeFilterControl(); renderReportFilterControl(); renderPrestazioniFilterControl();
  renderHome(); renderDoctorsPage(); renderPrestazioniPage(); renderReport(); renderInvoices();
  if (currentDoctorId && document.getElementById('doctorDetailPage').classList.contains('active')) renderDoctorDetail();
  if (document.getElementById('calendarPage').classList.contains('active')) renderCalendar();
}

document.addEventListener('DOMContentLoaded', () => {
  normalizeData();
  document.getElementById('newRegistrationBtn').addEventListener('click', ()=>openEntryPopup());
  document.getElementById('openCalendarBtn').addEventListener('click', ()=>go('calendarPage'));
  document.getElementById('addDoctorBtn').addEventListener('click', addDoctor);
  document.getElementById('backToDoctorsBtn').addEventListener('click', ()=>go('mediciPage'));
  document.getElementById('backToHomeBtn').addEventListener('click', ()=>go('homePage'));
  document.getElementById('quickAddDoctorBtn').addEventListener('click', ()=>{ if (!currentDoctorId) return; const month = document.getElementById('doctorDetailMonth').value || currentMonthISO(); openEntryPopup(null, currentDoctorId, `${month}-01`); });
  document.getElementById('printDoctorBtn').addEventListener('click', printDoctorDetail);
  document.getElementById('printReportBtn').addEventListener('click', printReport);
  document.getElementById('printInvoicesBtn').addEventListener('click', printInvoices);
  document.getElementById('homeTabGiorno').addEventListener('click', ()=>setFilterType('home','giorno'));
  document.getElementById('homeTabMese').addEventListener('click', ()=>setFilterType('home','mese'));
  document.getElementById('homeTabAnno').addEventListener('click', ()=>setFilterType('home','anno'));
  document.getElementById('reportTabGiorno').addEventListener('click', ()=>setFilterType('report','giorno'));
  document.getElementById('reportTabMese').addEventListener('click', ()=>setFilterType('report','mese'));
  document.getElementById('reportTabAnno').addEventListener('click', ()=>setFilterType('report','anno'));
  document.getElementById('prestazioniTabGiorno').addEventListener('click', ()=>setFilterType('prestazioni','giorno'));
  document.getElementById('prestazioniTabMese').addEventListener('click', ()=>setFilterType('prestazioni','mese'));
  document.getElementById('prestazioniTabAnno').addEventListener('click', ()=>setFilterType('prestazioni','anno'));
  document.querySelectorAll('.menu-btn').forEach((btn)=>btn.addEventListener('click', ()=>go(btn.dataset.page)));
  document.getElementById('closePopupBtn').addEventListener('click', closeEntryPopup);
  document.getElementById('cancelPopupBtn').addEventListener('click', closeEntryPopup);
  document.getElementById('savePopupBtn').addEventListener('click', saveEntry);
  document.getElementById('popupPercMedico').addEventListener('input', (e)=>{ let value = parseFloat(e.target.value)||0; if (value>100) value=100; if (value<0) value=0; e.target.value=value; document.getElementById('popupPercStruttura').value = 100-value; updatePopupPreview(); });
  document.getElementById('popupPercStruttura').addEventListener('input', (e)=>{ let value = parseFloat(e.target.value)||0; if (value>100) value=100; if (value<0) value=0; e.target.value=value; document.getElementById('popupPercMedico').value = 100-value; updatePopupPreview(); });
  document.getElementById('popupImporto').addEventListener('input', updatePopupPreview);
  document.getElementById('doctorDetailMonth').value = currentMonthISO();
  document.getElementById('doctorDetailMonth').addEventListener('change', renderDoctorDetail);
  document.getElementById('calendarMonth').value = currentMonthISO();
  document.getElementById('calendarMonth').addEventListener('change', renderCalendar);
  document.getElementById('fatturePeriodType').addEventListener('change', (e)=>{ invoicePeriodType = e.target.value; invoicePeriodValue = invoicePeriodType === 'mese' ? currentMonthISO() : invoicePeriodType === 'anno' ? currentYearISO() : todayISO(); renderInvoices(); });
  document.getElementById('fattureStatusFilter').addEventListener('change', renderInvoices);
  document.getElementById('fattureTypeFilter').addEventListener('change', renderInvoices);
  document.getElementById('importFile').addEventListener('change', (event)=>importDataFromFile(event.target.files[0]));
  renderAll();
});
