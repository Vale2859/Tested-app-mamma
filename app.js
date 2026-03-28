const STORAGE_KEYS = {
  doctors: 'anvamed_doctors_v2',
  entries: 'anvamed_entries_v2',
  invoiceStates: 'anvamed_invoice_states_v2',
  login: 'anvamed_login'
};

let doctors = JSON.parse(localStorage.getItem(STORAGE_KEYS.doctors)) || [];
let entries = JSON.parse(localStorage.getItem(STORAGE_KEYS.entries)) || [];
let invoiceStates = JSON.parse(localStorage.getItem(STORAGE_KEYS.invoiceStates)) || {};
let chart = null;

const uiState = {
  metodo: 'pos',
  tipo: 'standard',
  homeMode: 'day',
  reportMode: 'day'
};

function euro(value){
  return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(value || 0));
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function monthISO(){ return todayISO().slice(0,7); }
function yearISO(){ return todayISO().slice(0,4); }
function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}
function getDoctor(id){ return doctors.find(d => String(d.id) === String(id)); }
function getEntryStatus(entry){ return invoiceStates[String(entry.id)] || 'da_fatturare'; }
function nextStatus(current){ if(current==='da_fatturare') return 'fatturato'; if(current==='fatturato') return 'pagato'; return 'da_fatturare'; }

function normalizeData(){
  doctors.forEach(d => {
    if (!d.prestazioni) d.prestazioni = [];
    d.prestazioni = d.prestazioni
      .map(p => {
        if (typeof p === 'string') return { nome: p, perc: 60 };
        return {
          nome: p?.nome || p?.name || '',
          perc: Number(p?.perc ?? p?.percentuale ?? 60)
        };
      })
      .filter(p => p.nome);
    if (!Array.isArray(d.availability)) d.availability = [];
  });

  entries.forEach(e => {
    if (!e.metodo) e.metodo = 'contanti';
    if (e.tipo === 'nero') e.tipo = 'riservata';
    if (e.tipo === 'normale') e.tipo = 'standard';
    if (!e.tipo) e.tipo = 'standard';
    if (!e.data && e.date) e.data = e.date;
    if (!e.quotaMedico && e.percMedico != null) e.quotaMedico = Number(e.importo) * Number(e.percMedico) / 100;
    if (!e.quotaStruttura) e.quotaStruttura = Number(e.importo || 0) - Number(e.quotaMedico || 0);
  });
}
normalizeData();
saveAll(false);

function saveAll(renderAfter = true){
  localStorage.setItem(STORAGE_KEYS.doctors, JSON.stringify(doctors));
  localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
  localStorage.setItem(STORAGE_KEYS.invoiceStates, JSON.stringify(invoiceStates));
  if (renderAfter) renderAll();
}

function login(){
  const pin = document.getElementById('pinInput').value.trim();
  if (pin === '1003') {
    localStorage.setItem(STORAGE_KEYS.login, 'ok');
    document.getElementById('loginScreen').classList.add('hidden');
  } else {
    alert('PIN errato');
  }
}
function logout(){
  localStorage.removeItem(STORAGE_KEYS.login);
  document.getElementById('pinInput').value = '';
  document.getElementById('loginScreen').classList.remove('hidden');
}
function initLogin(){
  if (localStorage.getItem(STORAGE_KEYS.login) === 'ok') {
    document.getElementById('loginScreen').classList.add('hidden');
  }
}

function setActiveNav(page){
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
}
function go(page){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(`page-${page}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }
  setActiveNav(page);
  if (page === 'report') renderReport();
  if (page === 'fatture') renderInvoices();
  if (page === 'prestazioni') renderPrestazioniManager();
}

function addDoctor(){
  const name = prompt('Nome medico');
  if (!name || !name.trim()) return;
  doctors.push({ id: Date.now(), name: name.trim(), availability: [], prestazioni: [] });
  saveAll();
}

function deleteDoctor(id){
  const doctor = getDoctor(id);
  if (!doctor) return;
  const used = entries.some(e => String(e.doctorId) === String(id));
  if (used && !confirm('Questo medico ha registrazioni. Eliminarlo comunque?')) return;
  if (!used && !confirm(`Eliminare ${doctor.name}?`)) return;
  doctors = doctors.filter(d => String(d.id) !== String(id));
  entries = entries.filter(e => String(e.doctorId) !== String(id));
  saveAll();
}

function updateHomeFilter(){
  const area = document.getElementById('homeFilterArea');
  const mode = uiState.homeMode;
  if (mode === 'day') area.innerHTML = `<input id="homeDate" type="date" value="${todayISO()}" max="${todayISO()}" />`;
  if (mode === 'month') area.innerHTML = `<input id="homeMonth" type="month" value="${monthISO()}" />`;
  if (mode === 'year') area.innerHTML = `<input id="homeYear" type="number" min="2000" max="2100" value="${yearISO()}" />`;
  area.querySelector('input')?.addEventListener('input', renderHome);
}
function updateReportFilter(){
  const area = document.getElementById('reportFilterArea');
  const mode = uiState.reportMode;
  if (mode === 'day') area.innerHTML = `<input id="reportDate" type="date" value="${todayISO()}" max="${todayISO()}" />`;
  if (mode === 'month') area.innerHTML = `<input id="reportMonth" type="month" value="${monthISO()}" />`;
  if (mode === 'year') area.innerHTML = `<input id="reportYear" type="number" min="2000" max="2100" value="${yearISO()}" />`;
  area.querySelector('input')?.addEventListener('input', renderReport);
}
function currentHomeFilterValue(){
  if (uiState.homeMode === 'day') return document.getElementById('homeDate')?.value || todayISO();
  if (uiState.homeMode === 'month') return document.getElementById('homeMonth')?.value || monthISO();
  return String(document.getElementById('homeYear')?.value || yearISO());
}
function currentReportFilterValue(){
  if (uiState.reportMode === 'day') return document.getElementById('reportDate')?.value || todayISO();
  if (uiState.reportMode === 'month') return document.getElementById('reportMonth')?.value || monthISO();
  return String(document.getElementById('reportYear')?.value || yearISO());
}
function filterEntriesByMode(mode, value){
  return entries.filter(e => {
    if (mode === 'day') return e.data === value;
    if (mode === 'month') return String(e.data || '').startsWith(value);
    return String(e.data || '').startsWith(String(value));
  });
}

function renderHome(){
  const filtered = filterEntriesByMode(uiState.homeMode, currentHomeFilterValue());
  const total = filtered.reduce((s,e)=>s+Number(e.importo||0),0);
  const structure = filtered.reduce((s,e)=>s+Number(e.quotaStruttura||0),0);
  const doctor = filtered.reduce((s,e)=>s+Number(e.quotaMedico||0),0);

  document.getElementById('homeTotal').innerText = euro(total);
  document.getElementById('homeStructure').innerText = euro(structure);
  document.getElementById('homeDoctors').innerText = euro(doctor);
  document.getElementById('homeFilterLabel').innerText = currentHomeFilterValue();

  const html = filtered.slice().reverse().map(e => {
    const doc = getDoctor(e.doctorId);
    const status = getEntryStatus(e);
    return `
      <div class="list-item">
        <div class="list-item-title">${escapeHtml(doc?.name || 'Medico')} - ${escapeHtml(e.prestazione)}</div>
        <div class="list-item-sub">${e.data} · ${escapeHtml(e.metodo)} · ${escapeHtml(e.tipo)} · ${euro(e.importo)}</div>
        <div class="list-actions">
          <span class="status-chip status-${status}">${status.replaceAll('_',' ')}</span>
          <button class="mini-btn" data-entry-status="${e.id}">Cambia stato</button>
        </div>
      </div>`;
  }).join('');

  document.getElementById('homeEntries').innerHTML = html || `<div class="list-item"><div class="list-item-title">Nessuna registrazione</div></div>`;
  document.querySelectorAll('[data-entry-status]').forEach(btn => {
    btn.addEventListener('click', () => toggleInvoiceStatus(btn.dataset.entryStatus));
  });
}

function renderDoctors(){
  const html = doctors.map(d => `
    <div class="list-item">
      <div class="list-item-title">${escapeHtml(d.name)}</div>
      <div class="list-item-sub">${d.prestazioni.length} prestazioni salvate</div>
      <div class="list-actions">
        <button class="mini-btn" data-delete-doctor="${d.id}">Elimina</button>
      </div>
    </div>
  `).join('');
  document.getElementById('doctorsList').innerHTML = html || `<div class="list-item"><div class="list-item-title">Nessun medico inserito</div></div>`;
  document.querySelectorAll('[data-delete-doctor]').forEach(btn => btn.addEventListener('click', ()=>deleteDoctor(btn.dataset.deleteDoctor)));
}

function renderPrestazioniManager(){
  const select = document.getElementById('prestDoctorSelect');
  const current = select.value;
  select.innerHTML = doctors.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  if (current) select.value = current;
  if (!select.value && doctors[0]) select.value = String(doctors[0].id);

  const doctor = getDoctor(select.value);
  const list = doctor?.prestazioni || [];
  document.getElementById('prestazioniList').innerHTML = list.length
    ? list.map((p, idx) => `
      <div class="list-item">
        <div class="list-item-title">${escapeHtml(p.nome)}</div>
        <div class="list-item-sub">Percentuale medico: ${Number(p.perc)}%</div>
        <div class="list-actions">
          <button class="mini-btn" data-remove-prest="${idx}">Elimina</button>
        </div>
      </div>`).join('')
    : `<div class="list-item"><div class="list-item-title">Nessuna prestazione salvata</div></div>`;

  document.querySelectorAll('[data-remove-prest]').forEach(btn => {
    btn.addEventListener('click', ()=>{
      if (!doctor) return;
      doctor.prestazioni.splice(Number(btn.dataset.removePrest),1);
      saveAll();
      renderPrestazioniManager();
    });
  });
}

function addPrestazioneToDoctor(){
  const doctorId = document.getElementById('prestDoctorSelect').value;
  const doctor = getDoctor(doctorId);
  const nome = document.getElementById('newPrestName').value.trim();
  const perc = Number(document.getElementById('newPrestPerc').value || 60);
  if (!doctor) return alert('Seleziona un medico');
  if (!nome) return alert('Inserisci prestazione');
  if (doctor.prestazioni.some(p => p.nome.toLowerCase() === nome.toLowerCase())) return alert('Prestazione già presente');
  doctor.prestazioni.push({ nome, perc });
  document.getElementById('newPrestName').value = '';
  document.getElementById('newPrestPerc').value = 60;
  saveAll();
  renderPrestazioniManager();
}

function renderReport(){
  const filtered = filterEntriesByMode(uiState.reportMode, currentReportFilterValue());
  const pos = filtered.filter(e => e.metodo === 'pos').reduce((s,e)=>s+Number(e.importo||0),0);
  const cash = filtered.filter(e => e.metodo === 'contanti').reduce((s,e)=>s+Number(e.importo||0),0);
  const standard = filtered.filter(e => e.tipo === 'standard').reduce((s,e)=>s+Number(e.importo||0),0);
  const ris = filtered.filter(e => e.tipo === 'riservata').reduce((s,e)=>s+Number(e.importo||0),0);

  document.getElementById('reportPos').innerText = euro(pos);
  document.getElementById('reportCash').innerText = euro(cash);
  document.getElementById('reportStd').innerText = euro(standard);
  document.getElementById('reportRis').innerText = euro(ris);

  const map = new Map();
  filtered.forEach(e => {
    const key = String(e.doctorId);
    map.set(key, (map.get(key) || 0) + Number(e.importo || 0));
  });

  const doctorList = [...map.entries()].map(([doctorId,total]) => {
    const doc = getDoctor(doctorId);
    return `<div class="list-item"><div class="list-item-title">${escapeHtml(doc?.name || 'Medico')}</div><div class="list-item-sub">Totale: ${euro(total)}</div></div>`;
  }).join('');
  document.getElementById('reportDoctorList').innerHTML = doctorList || `<div class="list-item"><div class="list-item-title">Nessun dato nel periodo selezionato</div></div>`;

  const ctx = document.getElementById('reportChart');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['POS', 'Contanti'],
      datasets: [{ data: [pos, cash], backgroundColor: ['#2d8cff', '#59cf82'] }]
    },
    options: { responsive: true, maintainAspectRatio: true }
  });
}

function renderInvoices(){
  const doctorFilter = document.getElementById('invoiceDoctorFilter').value;
  const dateFilter = document.getElementById('invoiceDateFilter').value;
  const amountFilter = document.getElementById('invoiceAmountFilter').value;
  const statusFilter = document.getElementById('invoiceStatusFilter').value;

  const select = document.getElementById('invoiceDoctorFilter');
  const current = select.value;
  select.innerHTML = `<option value="">Tutti i medici</option>` + doctors.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  select.value = current || doctorFilter;

  const filtered = entries.filter(e => {
    const statusOk = !statusFilter || getEntryStatus(e) === statusFilter;
    return (!doctorFilter || String(e.doctorId) === String(doctorFilter))
      && (!dateFilter || e.data === dateFilter)
      && (!amountFilter || Number(e.importo) === Number(amountFilter))
      && statusOk;
  });

  const html = filtered.slice().reverse().map(e => {
    const doc = getDoctor(e.doctorId);
    const status = getEntryStatus(e);
    return `
      <div class="list-item">
        <div class="list-item-title">${escapeHtml(doc?.name || 'Medico')} - ${escapeHtml(e.prestazione)}</div>
        <div class="list-item-sub">${e.data} · ${euro(e.importo)} · ${escapeHtml(e.metodo)} · ${escapeHtml(e.tipo)}</div>
        <div class="list-actions">
          <span class="status-chip status-${status}">${status.replaceAll('_',' ')}</span>
          <button class="mini-btn" data-entry-status="${e.id}">Cambia stato</button>
        </div>
      </div>`;
  }).join('');

  document.getElementById('invoiceList').innerHTML = html || `<div class="list-item"><div class="list-item-title">Nessun risultato</div></div>`;
  document.querySelectorAll('#invoiceList [data-entry-status]').forEach(btn => btn.addEventListener('click', ()=>toggleInvoiceStatus(btn.dataset.entryStatus)));
}

function toggleInvoiceStatus(entryId){
  const current = invoiceStates[String(entryId)] || 'da_fatturare';
  invoiceStates[String(entryId)] = nextStatus(current);
  saveAll();
}

function openEntryModal(){
  if (!doctors.length) return alert('Inserisci prima un medico');
  const modal = document.getElementById('entryModal');
  const doctorSelect = document.getElementById('entryDoctor');
  doctorSelect.innerHTML = doctors.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  doctorSelect.value = String(doctors[0].id);
  document.getElementById('entryDate').value = todayISO();
  document.getElementById('entryDate').max = todayISO();
  document.getElementById('entryPrestazione').value = '';
  document.getElementById('entryImporto').value = '';
  document.getElementById('entryPerc').value = 60;
  uiState.metodo = 'pos';
  uiState.tipo = 'standard';
  setChoice('metodoChoices','pos');
  setChoice('tipoChoices','standard');
  renderEntryChips();
  updateEntryPreview();
  modal.classList.remove('hidden');
}
function closeEntryModal(){ document.getElementById('entryModal').classList.add('hidden'); }
function renderEntryChips(){
  const doc = getDoctor(document.getElementById('entryDoctor').value);
  const box = document.getElementById('entryPrestazioniChips');
  box.innerHTML = (doc?.prestazioni || []).map(p => `<button class="chip" data-chip-name="${escapeHtml(p.nome)}" data-chip-perc="${Number(p.perc)}" type="button">${escapeHtml(p.nome)} (${Number(p.perc)}%)</button>`).join('');
  box.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', ()=>{
    document.getElementById('entryPrestazione').value = btn.dataset.chipName;
    document.getElementById('entryPerc').value = btn.dataset.chipPerc;
    updateEntryPreview();
  }));
}
function setChoice(containerId, value){
  document.querySelectorAll(`#${containerId} .choice`).forEach(btn => btn.classList.toggle('active', btn.dataset.value === value));
}
function updateEntryPreview(){
  const importo = Number(document.getElementById('entryImporto').value || 0);
  const perc = Number(document.getElementById('entryPerc').value || 0);
  const doctorQuota = importo * perc / 100;
  const structureQuota = importo - doctorQuota;
  document.getElementById('entryPrevDoctor').innerText = euro(doctorQuota);
  document.getElementById('entryPrevStructure').innerText = euro(structureQuota);
}
function saveEntry(){
  const doctorId = document.getElementById('entryDoctor').value;
  const prestazione = document.getElementById('entryPrestazione').value.trim();
  const data = document.getElementById('entryDate').value;
  const importo = Number(document.getElementById('entryImporto').value || 0);
  const perc = Number(document.getElementById('entryPerc').value || 0);
  if (!doctorId) return alert('Seleziona un medico');
  if (!prestazione) return alert('Inserisci prestazione');
  if (!data || data > todayISO()) return alert('Data non valida');
  if (!importo || importo <= 0) return alert('Inserisci importo');
  if (perc < 0 || perc > 100) return alert('Percentuale non valida');

  const entry = {
    id: Date.now(),
    doctorId: Number(doctorId),
    prestazione,
    data,
    importo,
    percMedico: perc,
    quotaMedico: importo * perc / 100,
    quotaStruttura: importo - (importo * perc / 100),
    metodo: uiState.metodo,
    tipo: uiState.tipo
  };
  entries.push(entry);
  const doc = getDoctor(doctorId);
  if (doc && !doc.prestazioni.some(p => p.nome.toLowerCase() === prestazione.toLowerCase())) {
    doc.prestazioni.push({ nome: prestazione, perc });
  }
  saveAll();
  closeEntryModal();
  showToast('Registrazione salvata');
}

function showToast(text){
  const toast = document.getElementById('toast');
  toast.innerText = text;
  toast.classList.remove('hidden');
  setTimeout(()=>toast.classList.add('hidden'), 1800);
}

function exportData(){
  const blob = new Blob([JSON.stringify({ doctors, entries, invoiceStates, exportedAt: new Date().toISOString() }, null, 2)], { type:'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `backup-anvamed-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
function importData(file){
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      doctors = Array.isArray(data.doctors) ? data.doctors : [];
      entries = Array.isArray(data.entries) ? data.entries : [];
      invoiceStates = data.invoiceStates && typeof data.invoiceStates === 'object' ? data.invoiceStates : {};
      normalizeData();
      saveAll();
      showToast('Backup importato');
    } catch {
      alert('Backup non valido');
    }
  };
  reader.readAsText(file);
}

function openPdf(){
  const content = entries.slice().reverse().map(e => {
    const doc = getDoctor(e.doctorId);
    const status = getEntryStatus(e).replaceAll('_',' ');
    return `<div style="padding:8px 0;border-bottom:1px solid #ddd"><strong>${escapeHtml(doc?.name || 'Medico')}</strong> - ${escapeHtml(e.prestazione)} - ${euro(e.importo)}<br><span style="color:#666;font-size:13px">${e.data} · ${escapeHtml(e.metodo)} · ${escapeHtml(e.tipo)} · ${status}</span></div>`;
  }).join('');
  const w = window.open('');
  if (!w) return alert('Popup bloccato');
  w.document.write(`
    <html><head><title>Riepilogo</title></head><body style="font-family:Arial;padding:20px">
      <h1>Riepilogo Prestazioni</h1>
      ${content || '<p>Nessun dato</p>'}
      <div style="margin-top:20px"><button onclick="window.history.back()">Torna indietro</button> <button onclick="window.print()">Stampa / Salva PDF</button></div>
    </body></html>
  `);
  w.document.close();
}
function goBack(){ window.history.back(); }

function bindEvents(){
  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', ()=>go(btn.dataset.page)));
  document.getElementById('addDoctorBtn').addEventListener('click', addDoctor);
  document.getElementById('backupBtn').addEventListener('click', exportData);
  document.getElementById('importFile').addEventListener('change', e => importData(e.target.files[0]));
  document.getElementById('prestDoctorSelect').addEventListener('change', renderPrestazioniManager);
  document.getElementById('addPrestBtn').addEventListener('click', addPrestazioneToDoctor);
  document.getElementById('openEntryBtn').addEventListener('click', openEntryModal);
  document.getElementById('closeEntryBtn').addEventListener('click', closeEntryModal);
  document.getElementById('saveEntryBtn').addEventListener('click', saveEntry);
  document.getElementById('entryDoctor').addEventListener('change', renderEntryChips);
  document.getElementById('entryImporto').addEventListener('input', updateEntryPreview);
  document.getElementById('entryPerc').addEventListener('input', updateEntryPreview);
  document.querySelectorAll('#metodoChoices .choice').forEach(btn => btn.addEventListener('click', ()=>{ uiState.metodo = btn.dataset.value; setChoice('metodoChoices', btn.dataset.value); }));
  document.querySelectorAll('#tipoChoices .choice').forEach(btn => btn.addEventListener('click', ()=>{ uiState.tipo = btn.dataset.value; setChoice('tipoChoices', btn.dataset.value); }));
  document.getElementById('openPdfBtn').addEventListener('click', openPdf);
  document.getElementById('goBackBtn').addEventListener('click', goBack);
  ['invoiceDoctorFilter','invoiceDateFilter','invoiceAmountFilter','invoiceStatusFilter'].forEach(id => {
    document.getElementById(id).addEventListener(id === 'invoiceDoctorFilter' || id === 'invoiceStatusFilter' ? 'change' : 'input', renderInvoices);
  });
  document.querySelectorAll('#homeModeTabs .seg').forEach(btn => btn.addEventListener('click', ()=>{
    uiState.homeMode = btn.dataset.mode;
    document.querySelectorAll('#homeModeTabs .seg').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    updateHomeFilter();
    renderHome();
  }));
  document.querySelectorAll('#reportModeTabs .seg').forEach(btn => btn.addEventListener('click', ()=>{
    uiState.reportMode = btn.dataset.mode;
    document.querySelectorAll('#reportModeTabs .seg').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    updateReportFilter();
    renderReport();
  }));
}

function renderAll(){
  updateHomeFilter();
  updateReportFilter();
  renderHome();
  renderDoctors();
  renderPrestazioniManager();
  renderReport();
  renderInvoices();
}

bindEvents();
initLogin();
renderAll();
