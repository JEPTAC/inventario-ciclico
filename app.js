import { firebaseConfig, driveConfig, defaultSettings } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const mainApp = initializeApp(firebaseConfig);
const secondaryApp = initializeApp(firebaseConfig, "secondary-user-creator");
analyticsSupported().then(ok => { if (ok) getAnalytics(mainApp); }).catch(() => {});

const auth = getAuth(mainApp);
const secondaryAuth = getAuth(secondaryApp);
const db = getFirestore(mainApp);

const state = {
  user: null,
  profile: null,
  settings: structuredClone(defaultSettings),
  driveToken: null,
  driveTokenClient: null,
  driveTokenExpiresAt: 0,
  driveAuthPromise: null,
  syncRunning: false,
  users: [],
  materials: [],
  tasks: [],
  cases: [],
  syncLogs: [],
  counts: [],
  cableSession: null,
  activeView: "dashboardView",
  autoTimer: null
};

function showBootError(message, err = null){
  console.error(message, err || "");
  const loading = document.querySelector("#loading");
  const box = document.querySelector("#bootErrorBox");
  if(box){
    const detail = err?.message || String(err || "");
    box.style.display = "block";
    box.innerHTML = `<b>No se pudo iniciar correctamente.</b><br>${esc(String(message))}${detail ? `<br><small>${esc(detail)}</small>` : ""}<br><br><small>Revisa consola, reglas de Firestore y users/{uid}.</small>`;
  }
  if(loading) loading.classList.remove("hidden");
}

window.addEventListener("error", event => {
  showBootError("Error de JavaScript durante el arranque.", event.error || event.message);
});

window.addEventListener("unhandledrejection", event => {
  showBootError("Promesa rechazada durante el arranque.", event.reason || event);
});

async function safeLoad(label, fn){
  try{
    await fn();
    return true;
  }catch(err){
    console.warn(`Carga parcial fallida: ${label}`, err);
    state.initWarnings ||= [];
    state.initWarnings.push({ label, message: err?.message || String(err) });
    return false;
  }
}



const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const ROLE_LABELS = {
  super_admin: "Super admin",
  admin: "Super admin",
  inventario: "Inventario",
  jefe_logistico: "Jefe logístico",
  auditoria: "Auditoría interna",
  gerencia: "Gerencia"
};

const VIEW_ACCESS = {
  dashboardView: ["super_admin", "inventario", "jefe_logistico", "auditoria", "gerencia"],
  usersView: ["super_admin"],
  driveView: ["super_admin", "jefe_logistico"],
  inventoryView: ["super_admin", "inventario"],
  cableView: ["super_admin", "inventario", "jefe_logistico"],
  jefeView: ["super_admin", "jefe_logistico"],
  auditoriaView: ["super_admin", "auditoria"],
  gerenciaView: ["super_admin", "gerencia"],
  materialsView: ["super_admin", "inventario", "jefe_logistico", "auditoria", "gerencia"],
  configView: ["super_admin", "jefe_logistico"]
};

const aliases = {
  ref:["referencia","material","codigo","código","codigomaterial","codigo material","articulo","artículo","sku","ref"],
  desc:["descripcion","descripción","texto breve","nombre","producto","denominacion","denominación","detalle"],
  category:["categoria","categoría","grupo","familia","linea","línea","clase"],
  location:["ubicacion","ubicación","almacen","almacén","bodega","localizacion","localización","posicion","posición","estante"],
  unit:["unidad","um","umb","unidad medida","unidad de medida"],
  stock:["stock","existencia","existencias","cantidad","saldo","disponible","libre utilizacion","libre utilización","inventario"],
  cost:["costo","costo unitario","valor unitario","precio","vlr unitario","costounitario"],
  totalValue:["valor total","costo total","valor inventario","vlr total","total"],
  lastMove:["fecha movimiento","fecha ultimo movimiento","fecha último movimiento","fecha ingreso","fecha salida"],
  movement:["salidas","salida","movimiento","consumo","demanda","rotacion","rotación"]
};

function todayISO(){
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}
function nowTS(){ return serverTimestamp(); }
function parseISO(iso){
  if(!iso) return null;
  const d = new Date(String(iso).slice(0,10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}
function addDays(baseISO, days){
  const d = parseISO(baseISO) || parseISO(todayISO());
  d.setDate(d.getDate() + Number(days || 0));
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}
function isActiveDay(iso, activeDays = state.settings.activeCountingDays){
  const d = parseISO(iso);
  return d ? activeDays.map(Number).includes(d.getDay()) : false;
}
function addActiveDays(baseISO, qty, activeDays = state.settings.activeCountingDays){
  let d = baseISO || todayISO();
  if(qty <= 0) return isActiveDay(d, activeDays) ? d : nextActiveDay(d, activeDays);
  let c = 0;
  while(c < qty){
    d = addDays(d, 1);
    if(isActiveDay(d, activeDays)) c++;
  }
  return d;
}
function nextActiveDay(iso, activeDays = state.settings.activeCountingDays){
  let d = iso || todayISO();
  for(let i=0;i<14;i++){
    if(isActiveDay(d, activeDays)) return d;
    d = addDays(d, 1);
  }
  return d;
}

// Compatibilidad interna v16: alias usados por la agenda anual.
function isActiveCountingDay(iso, activeDays = state.settings.activeCountingDays){
  return isActiveDay(iso, activeDays);
}
function nextCalendarDay(iso){
  return addDays(iso, 1);
}

function diffDays(aISO, bISO){
  const a = parseISO(aISO), b = parseISO(bISO);
  if(!a || !b) return 0;
  return Math.floor((b - a) / 86400000);
}

function yearOf(iso){
  const d = parseISO(iso || todayISO());
  return d ? d.getFullYear() : new Date().getFullYear();
}
function endOfYearISO(year = yearOf(todayISO())){
  return `${year}-12-31`;
}
function startOfNextYearISO(year = yearOf(todayISO())){
  return `${year + 1}-01-01`;
}
function countCableSessionsRemaining(fromISO = todayISO()){
  const period = Math.max(1, Number(state.settings.cablePeriodDays || 15));
  let d = fromISO;
  let count = 0;
  const end = endOfYearISO(yearOf(fromISO));
  while(d <= end && count < 80){
    count++;
    d = addDays(d, period);
  }
  return Math.max(1, count);
}
function lastCableCountYear(m){
  return m.lastCableCountDate ? yearOf(m.lastCableCountDate) : 0;
}
function cableAvailableDate(m){
  const cooldown = Math.max(0, Number(state.settings.cableCooldownDays || 15));
  const base = m.lastMovementDate || m.firstSeenDate || m.lastVerifiedDate || todayISO();
  return addDays(base, cooldown);
}
function isCableMature(m, dateISO = todayISO()){
  return cableAvailableDate(m) <= dateISO;
}
function seededRandomScore(seed){
  const x = Math.sin(hash(seed)) * 10000;
  return x - Math.floor(x);
}
function nextCableSessionDateFrom(lastISO){
  return lastISO ? addDays(lastISO, Math.max(1, Number(state.settings.cablePeriodDays || 15))) : todayISO();
}
function cableTaskOpenTasks(){
  return state.tasks.filter(t => t.taskType === "cable_metraje" && ["assigned","recount_required","pending_inventory","pending_jefe_approval","pending_jefe_logistico"].includes(t.status));
}
function toISO(value){
  if(!value) return "";
  if(value instanceof Date && !Number.isNaN(value.getTime())){
    value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
    return value.toISOString().slice(0,10);
  }
  if(value?.toDate) return toISO(value.toDate());
  if(typeof value === "number" && value > 20000 && value < 80000){
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,10);
  }
  const s = String(value).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const parts = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(parts){
    const y = parts[3].length === 2 ? "20" + parts[3] : parts[3];
    return `${y}-${parts[2].padStart(2,"0")}-${parts[1].padStart(2,"0")}`;
  }
  return "";
}


function isWorkdayISO(iso){
  const d = parseISO(iso);
  if(!d) return false;
  const day = d.getDay();
  return day >= 1 && day <= 5;
}
function countWorkdaysUntilYearEnd(fromISO = todayISO()){
  let d = fromISO;
  let count = 0;
  let guard = 0;
  const end = `${yearOf(fromISO)}-12-31`;
  while(d <= end && guard < 380){
    if(isWorkdayISO(d)) count++;
    d = addDays(d, 1);
    guard++;
  }
  return Math.max(1, count);
}
function annualDailyTarget(totalPending, dailyLimit = Number(state.settings.dailyLimit || 30)){
  const remaining = countWorkdaysUntilYearEnd(todayISO());
  if(Number(totalPending || 0) <= 0) return 0;
  return Math.min(Math.max(1, Number(dailyLimit || 30)), Math.max(1, Math.ceil(Number(totalPending || 0) / remaining)));
}
function annualFieldName(){
  return `annualCounted_${yearOf(todayISO())}`;
}
function meterFieldName(){
  return `meterCounted_${yearOf(todayISO())}`;
}
function wasCountedThisYear(material){
  return material[annualFieldName()] === true || String(material.lastCountDate || "").startsWith(String(yearOf(todayISO())));
}
function wasMeterCountedThisYear(material){
  return material[meterFieldName()] === true || String(material.lastCableCountDate || material.lastMeterCountDate || "").startsWith(String(yearOf(todayISO())));
}
function isNewAutoCountedMaterial(material){
  return material.autoCountedReason === "nuevo_registro_siesa" && wasCountedThisYear(material);
}
function paretoWeightedAnnualSelection(materials, seedText){
  const seed = hash(`${seedText}-${yearOf(todayISO())}`);
  return [...materials]
    .map(m => {
      const random = hash(`${seed}-${m.ref}`) / 4294967295;
      const scoreBase = Math.log10(Math.max(Number(m.score || m.inventoryValue || 1), 1));
      const bandWeight = { "A+": 12, "A": 9, "B": 7, "C": 5, "D": 3, "E": 1 }[m.band] || 1;
      const moveWeight = Math.min(Number(m.movementIndex || 0), 50) / 4;
      const variabilityWeight = Math.min(Number(m.variabilityIndex || 0), 200) / 25;
      return {
        item: m,
        rank: random * 100 + scoreBase * 9 + bandWeight * 5 + moveWeight + variabilityWeight
      };
    })
    .sort((a,b) => b.rank - a.rank)
    .map(x => x.item);
}

function paretoRandomNoRepeat(materials, seedText, options = {}){
  return paretoWeightedAnnualSelection(materials, seedText);
}


function norm(s){
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
}
function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function num(v){
  if(v === null || v === undefined || v === "") return 0;
  if(typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/\s/g,"").replace(/\$/g,"").replace(/COP/gi,"").replace(/\./g,"").replace(",",".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function fmt(n){ return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(Number(n || 0)); }
function money(n){ return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(n || 0)); }
function safeId(ref){ return encodeURIComponent(String(ref).trim()).replace(/\./g,"%2E").replace(/\//g,"%2F"); }
function hash(str){
  let h = 2166136261;
  for(const ch of String(str ?? "")){
    h ^= ch.charCodeAt(0);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}
function toast(message, type = "ok"){
  const el = $("#toast");
  el.textContent = message;
  el.style.background = type === "error" ? "#b42318" : "#0b6047";
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove("show"), 4400);
}
function logSync(message){
  const box = $("#syncLogBox");
  if(!box) return;
  box.textContent = `[${new Date().toLocaleTimeString("es-CO")}] ${message}\n` + box.textContent;
}
function role(){ return state.profile?.role === "admin" ? "super_admin" : state.profile?.role; }
function isSuper(){ return role() === "super_admin"; }
function hasAny(roles){ return isSuper() || roles.includes(role()); }
function formatDateTime(v){
  try{ if(v?.toDate) return v.toDate().toLocaleString("es-CO"); }catch(e){}
  return v ? String(v) : "—";
}
function groupBy(arr, fn){
  return arr.reduce((acc, item) => { const k = fn(item); (acc[k] ||= []).push(item); return acc; }, {});
}

async function init(){
  try{
    setupEvents();
    renderDriveConfig();
  }catch(err){
    showBootError("Falló la conexión inicial de eventos HTML.", err);
    return;
  }

  const bootTimeout = setTimeout(() => {
    const loadingVisible = !$("#loading")?.classList.contains("hidden");
    if(loadingVisible){
      showBootError("La app sigue inicializando después de varios segundos. Puede ser problema de Firebase, permisos o red.");
    }
  }, 12000);

  onAuthStateChanged(auth, async user => {
    try{
      state.user = user;
      if(!user){
        clearTimeout(bootTimeout);
        showLogin();
        return;
      }

      await loadProfile(user);

      if(!state.profile?.active){
        clearTimeout(bootTimeout);
        showLogin();
        toast("Usuario inactivo o sin rol autorizado. El super admin debe activarlo.", "error");
        await signOut(auth);
        return;
      }

      await loadSettings();
      await refreshAll();
      clearTimeout(bootTimeout);
      showApp();
      scheduleAutoSyncChecker();

      console.info("Firebase iniciado correctamente", {
        uid: user.uid,
        email: user.email,
        role: role(),
        projectId: firebaseConfig.projectId
      });
    }catch(err){
      clearTimeout(bootTimeout);
      showBootError("Firebase autenticó, pero Firestore bloqueó o falló la carga inicial.", err);
      toast(err.message || "Error iniciando aplicación", "error");
      showLogin();
    }
  }, err => {
    clearTimeout(bootTimeout);
    showBootError("Firebase Auth no pudo inicializar el observador de sesión.", err);
    showLogin();
  });
}

function setupEvents(){
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    try{ await signInWithEmailAndPassword(auth, $("#loginEmail").value.trim(), $("#loginPassword").value); }
    catch(err){ toast(cleanFirebaseError(err), "error"); }
  });
  $("#logoutBtn").addEventListener("click", () => signOut(auth));
  $$(".nav-link").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
  $("#connectDriveBtn").addEventListener("click", () => connectDrive(true));
  $("#connectDriveBtn2").addEventListener("click", () => connectDrive(true));
  $("#quickSyncBtn").addEventListener("click", () => syncFromDrive(false));
  $("#syncDriveBtn").addEventListener("click", () => syncFromDrive(false));
  $("#generateTodayBtn").addEventListener("click", () => forceMandatoryDailyTasks(true));
  $("#generateCableBtn").addEventListener("click", () => forceCableMeterTasks(true));
  $("#generateCableBtn2").addEventListener("click", () => forceCableMeterTasks(true));
  $("#createUserForm").addEventListener("submit", createUserFromAdmin);
  $("#refreshUsersBtn").addEventListener("click", loadAndRenderUsers);
  ["#taskSearch", "#taskFilter"].forEach(sel => $(sel).addEventListener("input", renderTasks));
  ["#materialSearch", "#materialBandFilter", "#materialCableFilter"].forEach(sel => $(sel).addEventListener("input", renderMaterials));
  $("#saveSettingsBtn").addEventListener("click", saveSettingsFromUI);
  $("#closeCountDialog").addEventListener("click", () => $("#countDialog").close());
  $("#cancelCountBtn").addEventListener("click", () => $("#countDialog").close());
  $("#countForm").addEventListener("submit", saveCount);
  $("#closeCaseDialog").addEventListener("click", () => $("#caseDialog").close());
  $("#cancelCaseBtn").addEventListener("click", () => $("#caseDialog").close());
  $("#caseActionForm").addEventListener("submit", saveCaseAction);
}

function cleanFirebaseError(err){
  return String(err?.message || err).replace("Firebase: ", "").replace(/\(auth\/.*?\)\.?/g, "").trim();
}

async function loadProfile(user){
  const uref = doc(db, "users", user.uid);
  const snap = await getDoc(uref);
  if(!snap.exists()){
    await setDoc(uref, { displayName:user.displayName || user.email, email:user.email, role:"inventario", active:false, createdAt:nowTS(), note:"Perfil creado automáticamente; requiere activación del super admin." });
    state.profile = { displayName:user.email, email:user.email, role:"inventario", active:false };
    return;
  }
  state.profile = { id:snap.id, ...snap.data() };
}
async function loadSettings(){
  try{
    const sref = doc(db, "settings", "inventory");
    const snap = await getDoc(sref);
    if(!snap.exists()){
      state.settings = structuredClone(defaultSettings);
      if(hasAny(["jefe_logistico"])) await setDoc(sref, { ...state.settings, drive:driveConfig, createdAt:nowTS(), updatedAt:nowTS() });
      return;
    }
    const data = snap.data();
    state.settings = {
      ...structuredClone(defaultSettings),
      ...data,
      bands: data.bands?.length ? data.bands : structuredClone(defaultSettings.bands),
      activeCountingDays: Array.isArray(data.activeCountingDays) ? data.activeCountingDays.map(Number) : [1,2,3,4,5],
      cableKeywords: data.cableKeywords?.length ? data.cableKeywords : defaultSettings.cableKeywords
    };
  }catch(err){
    console.warn("No se pudo leer settings/inventory. Se usarán parámetros por defecto.", err);
    state.settings = structuredClone(defaultSettings);
    state.initWarnings ||= [];
    state.initWarnings.push({ label:"settings/inventory", message:err?.message || String(err) });
  }
}
async function refreshAll(){
  state.initWarnings = [];
  await safeLoad("materials", loadMaterials);
  await safeLoad("countTasks", loadTasks);
  await safeLoad("cases", loadCases);
  await safeLoad("syncLogs", loadSyncLogs);
  await safeLoad("counts", loadRecentCounts);
  await safeLoad("syncState/cable_metraje", loadCableSessionState);
  if(isSuper()) await safeLoad("users", loadUsers);
  renderAll();

  if(state.initWarnings.length){
    console.warn("La app inició con advertencias:", state.initWarnings);
    const msg = state.initWarnings.map(w => `${w.label}: ${w.message}`).join(" | ");
    toast("La app inició con advertencias. Revisa consola.", "error");
    console.warn(msg);
  }
}

async function loadMaterials(){
  const snap = await getDocs(query(collection(db, "materials"), limit(6000)));
  state.materials = snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function loadTasks(){
  const snap = await getDocs(query(collection(db, "countTasks"), where("status", "in", ["assigned", "recount_required", "pending_inventory", "pending_jefe_approval", "pending_jefe_logistico"]), limit(900)));
  state.tasks = snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function loadCases(){
  const snap = await getDocs(query(collection(db, "cases"), where("status", "in", ["pending_jefe_logistico", "pending_jefe_approval", "pending_auditoria", "pending_gerencia"]), limit(900)));
  state.cases = snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function loadSyncLogs(){
  const snap = await getDocs(query(collection(db, "syncLogs"), orderBy("createdAt", "desc"), limit(15)));
  state.syncLogs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function loadRecentCounts(){
  const snap = await getDocs(query(collection(db, "counts"), orderBy("createdAt", "desc"), limit(25)));
  state.counts = snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function loadCableSessionState(){
  const snap = await getDoc(doc(db, "syncState", "cable_metraje"));
  state.cableSession = snap.exists() ? snap.data() : null;
}
async function loadUsers(){
  const snap = await getDocs(query(collection(db, "users"), limit(200)));
  state.users = snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function loadAndRenderUsers(){ await loadUsers(); renderUsers(); }

function showLogin(){
  $("#loading").classList.add("hidden");
  $("#appView").classList.add("hidden");
  $("#loginView").classList.remove("hidden");
}
function showApp(){
  $("#loading").classList.add("hidden");
  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#userName").textContent = state.profile.displayName || state.user.email;
  $("#userEmail").textContent = state.profile.email || state.user.email;
  $("#userRoleBadge").textContent = ROLE_LABELS[role()] || role();
  applyRoleVisibility();
  setView("dashboardView");
}
function applyRoleVisibility(){
  $$('[data-roles]').forEach(el => {
    const allowed = el.dataset.roles.split(",").map(x => x.trim());
    el.classList.toggle("hidden", !hasAny(allowed));
  });
  $$(".nav-link").forEach(btn => {
    const allowed = VIEW_ACCESS[btn.dataset.view] || [];
    btn.classList.toggle("hidden", !hasAny(allowed));
  });
}
function setView(viewId){
  if(!hasAny(VIEW_ACCESS[viewId] || [])){
    toast("Tu usuario no tiene acceso a este módulo.", "error");
    return;
  }
  state.activeView = viewId;
  $$(".view").forEach(v => v.classList.remove("active"));
  $("#" + viewId).classList.add("active");
  $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.view === viewId));
  const titles = {
    dashboardView:["Panel general","Estado de sincronización, tareas y casos pendientes."],
    usersView:["Usuarios","Creación y administración de roles por super admin."],
    driveView:["Drive / SIESA","Lectura del Excel diario y sincronización con Firebase."],
    inventoryView:["Inventario","Registro operativo de conteos asignados."],
    cableView:["Metraje cables","Conteo de metros físicos en referencias de cable."],
    jefeView:["Jefe logístico","Validación de novedades y escalamiento."],
    auditoriaView:["Auditoría interna","Contabilización independiente e informe."],
    gerenciaView:["Gerencia","Revisión y aprobación final."],
    materialsView:["Materiales","Catálogo consolidado desde SIESA."],
    indicatorsView:["Indicadores","Cobertura anual, calidad de conteo, diferencias, metraje y productividad."],
    configView:["Configuración","Parámetros de agenda, Pareto y metraje."]
  };
  $("#pageTitle").textContent = titles[viewId]?.[0] || "Panel";
  $("#pageSubtitle").textContent = titles[viewId]?.[1] || "";
  renderAll();
}

async function createUserFromAdmin(e){
  e.preventDefault();
  if(!isSuper()) return toast("Solo el super admin puede crear usuarios.", "error");
  const displayName = $("#newUserName").value.trim();
  const email = $("#newUserEmail").value.trim();
  const password = $("#newUserPass").value;
  const newRole = $("#newUserRole").value;
  try{
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), { displayName, email, role:newRole, active:true, createdAt:nowTS(), createdByUid:state.user.uid, createdByEmail:state.user.email });
    await signOut(secondaryAuth);
    $("#createUserForm").reset();
    await loadAndRenderUsers();
    toast("Usuario creado y activado.");
  }catch(err){ toast("No se pudo crear usuario: " + cleanFirebaseError(err), "error"); }
}
async function toggleUser(uid, active){
  if(!isSuper()) return;
  await updateDoc(doc(db, "users", uid), { active, updatedAt:nowTS(), updatedByEmail:state.user.email });
  await loadAndRenderUsers();
}
async function resetPassword(email){
  try{ await sendPasswordResetEmail(auth, email); toast("Correo de restablecimiento enviado."); }
  catch(err){ toast(cleanFirebaseError(err), "error"); }
}
window.toggleUser = toggleUser;
window.resetPassword = resetPassword;

function renderAll(){
  renderKpis(); renderDashboard(); renderTasks(); renderCableTasks(); renderCases(); renderMaterials(); renderSettings(); if(isSuper()) renderUsers();
}
function renderKpis(){
  const today = todayISO();
  const active = state.materials.filter(m => m.active !== false);
  const countedYear = active.filter(wasCountedThisYear).length;
  const pendingYear = Math.max(0, active.length - countedYear);
  const cables = active.filter(m => m.isCable || isCableMaterial(m));
  const meterDone = cables.filter(wasMeterCountedThisYear).length;

  $("#kpiMaterials").textContent = fmt(active.length);
  $("#kpiTodayTasks").textContent = fmt(state.tasks.filter(t => (t.scheduledDate || "") === today && ["assigned","pending_inventory","recount_required"].includes(t.status)).length);
  $("#kpiCables").textContent = fmt(cables.length);
  $("#kpiJefeCases").textContent = fmt(state.cases.filter(c => ["pending_jefe_logistico","pending_jefe_approval"].includes(c.status)).length);
  $("#kpiAuditCases").textContent = fmt(state.cases.filter(c => c.status === "pending_auditoria").length);
  $("#kpiGerenciaCases").textContent = fmt(state.cases.filter(c => c.status === "pending_gerencia").length);

  const annualEl = $("#kpiAnnualCoverage");
  const meterEl = $("#kpiMeterCoverage");
  const targetEl = $("#kpiDailyTarget");
  if(annualEl) annualEl.textContent = active.length ? `${Math.round(countedYear / active.length * 100)}%` : "0%";
  if(meterEl) meterEl.textContent = cables.length ? `${Math.round(meterDone / cables.length * 100)}%` : "0%";
  if(targetEl) targetEl.textContent = fmt(annualDailyTarget(pendingYear, Number(state.settings.dailyLimit || 30)));
}

function renderDashboard(){
  const bands = groupBy(state.materials, m => m.band || "E");
  const total = state.materials.length || 1;
  const countedYear = state.materials.filter(m => m.active !== false && wasCountedThisYear(m)).length;
  const pendingYear = Math.max(0, state.materials.filter(m => m.active !== false).length - countedYear);
  const dailyNeeded = annualDailyTarget(pendingYear, Number(state.settings.dailyLimit || 30));
  const cables = state.materials.filter(m => m.isCable || isCableMaterial(m)).length;
  const countedCablesYear = state.materials.filter(m => (m.isCable || isCableMaterial(m)) && wasMeterCountedThisYear(m)).length;
  const remainingCablesYear = Math.max(0, cables - countedCablesYear);
  const remainingSessions = countCableSessionsRemaining(todayISO());
  const cablePerSession = Math.ceil(remainingCablesYear / remainingSessions);

  $("#abcStatusTag").textContent = state.materials.length ? `${fmt(state.materials.length)} materiales` : "Sin datos";
  $("#agendaSummary").innerHTML =
    state.settings.bands.map(b => `<div class="summary-item"><span>${esc(b.key)} · ${esc(b.label)}</span><b>${fmt(bands[b.key]?.length || 0)}</b></div>`).join("") +
    `<div class="summary-item"><span>Pendientes generales del año</span><b>${fmt(pendingYear)}</b></div>` +
    `<div class="summary-item"><span>Días hábiles restantes hasta 31 de diciembre</span><b>${fmt(countWorkdaysUntilYearEnd(todayISO()))}</b></div>` +
    `<div class="summary-item"><span>Meta obligatoria diaria</span><b>${fmt(dailyNeeded)}/día</b></div>` +
    `<div class="summary-item"><span>Cables pendientes de metraje anual</span><b>${fmt(remainingCablesYear)}</b></div>` +
    `<div class="summary-item"><span>Metrajes por sesión de 15 días</span><b>${fmt(cablePerSession)}</b></div>`;

  drawAbcChart();
}

function drawAbcChart(){
  const canvas = $("#abcChart"); if(!canvas) return;
  const ctx = canvas.getContext("2d"); ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!state.materials.length){ ctx.fillStyle="#6a7f78";ctx.font="18px Century Gothic,Arial";ctx.textAlign="center";ctx.fillText("Sin datos para graficar",canvas.width/2,canvas.height/2);ctx.textAlign="left";return; }
  const data = state.settings.bands.map(b => ({key:b.key, count:state.materials.filter(m => m.band === b.key).length}));
  const pad = 48, w = canvas.width - pad*2, h = canvas.height - pad*2, max = Math.max(...data.map(d => d.count), 1);
  ctx.strokeStyle="#d7e5df"; for(let i=0;i<=4;i++){ const y=pad+h-h*i/4; ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(pad+w,y);ctx.stroke(); }
  data.forEach((d,i)=>{ const slot=w/data.length,bw=slot*.56,x=pad+i*slot+(slot-bw)/2,bh=Math.max(3,h*d.count/max); ctx.fillStyle=["#087653","#145ea8","#0f8f69","#f0b429","#c05621","#6a7f78"][i]||"#087653"; ctx.fillRect(x,pad+h-bh,bw,bh); ctx.fillStyle="#15352e";ctx.font="bold 15px Century Gothic,Arial";ctx.fillText(d.key,x+bw/2-10,pad+h+23);ctx.fillStyle="#6a7f78";ctx.font="12px Century Gothic,Arial";ctx.fillText(fmt(d.count),x+2,pad+h-bh-8); });
}
function statusPill(status){
  const map = { assigned:["Asignada","blue"], pending_inventory:["Pendiente","blue"], recount_required:["Reconteo","yellow"], pending_jefe_approval:["Aprueba jefe","yellow"], pending_jefe_logistico:["Jefe logístico","yellow"], pending_auditoria:["Auditoría","red"], pending_gerencia:["Gerencia","dark"], closed:["Cerrado","green"], closed_with_difference_recount_created:["Con reconteo","gray"] };
  const [label, cls] = map[status] || [status || "—", "gray"];
  return `<span class="pill ${cls}">${esc(label)}</span>`;
}

function renderUsers(){
  const el = $("#usersTable"); if(!el) return;
  if(!state.users.length){ el.innerHTML = `<div class="empty">No hay usuarios registrados.</div>`; return; }
  el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Activo</th><th>Acciones</th></tr></thead><tbody>${state.users.map(u => `<tr><td><b>${esc(u.displayName || "")}</b></td><td>${esc(u.email || "")}</td><td>${esc(ROLE_LABELS[u.role] || u.role)}</td><td>${u.active ? '<span class="pill green">Activo</span>' : '<span class="pill red">Inactivo</span>'}</td><td><div class="row-actions"><button class="tiny" onclick="toggleUser('${esc(u.id)}', ${!u.active})">${u.active ? "Inactivar" : "Activar"}</button><button class="tiny blue" onclick="resetPassword('${esc(u.email)}')">Reset clave</button></div></td></tr>`).join("")}</tbody></table></div>`;
}

function renderTasks(){
  const q = norm($("#taskSearch")?.value || ""), filter = $("#taskFilter")?.value || "";
  let rows = state.tasks.filter(t => (t.taskType || t.type || "general") !== "cable_metraje");
  if(!isSuper() && role() === "inventario") rows = rows.filter(t => ["assigned","recount_required","pending_inventory"].includes(t.status));
  if(filter) rows = rows.filter(t => t.status === filter);
  if(q) rows = rows.filter(t => [t.materialRef,t.description,t.location,t.band,t.taskType,t.origin].some(v => norm(v).includes(q)));
  rows.sort((a,b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")) || (b.priority || 0) - (a.priority || 0));
  $("#tasksTable").innerHTML = taskTable(rows);
  bindTaskButtons();
}

function renderCableTasks(){
  const today = todayISO();
  const rows = state.tasks.filter(t => t.taskType === "cable_metraje").sort((a,b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")));
  const openRows = rows.filter(t => ["assigned","recount_required","pending_inventory","pending_jefe_approval","pending_jefe_logistico"].includes(t.status));
  const lastSession = state.cableSession?.lastSessionDate || "";
  const nextSession = nextCableSessionDateFrom(lastSession);
  const isOpen = openRows.length > 0 || !lastSession || today >= nextSession;
  const totalCables = state.materials.filter(m => m.isCable).length;
  const counted = state.materials.filter(m => m.isCable && lastCableCountYear(m) === yearOf(today)).length;
  const mature = state.materials.filter(m => m.isCable && isCableMature(m, today) && lastCableCountYear(m) !== yearOf(today)).length;
  const notice = !isOpen
    ? `<div class="notice"><b>Módulo bloqueado:</b> la próxima sesión aleatoria de metraje se habilita el <b>${esc(nextSession)}</b>. Cables pendientes del año: <b>${fmt(Math.max(0,totalCables-counted))}</b>. Cables maduros disponibles: <b>${fmt(mature)}</b>.</div>`
    : `<div class="notice"><b>Módulo habilitado:</b> sesión aleatoria de metraje. No usa criticidad ni Pareto; excluye cables recién ingresados o cortados hasta cumplir <b>${fmt(state.settings.cableCooldownDays || 15)} días</b>.</div>`;
  $("#cableTasksTable").innerHTML = notice + taskTable(rows, true);
  bindTaskButtons();
}
function taskTable(rows, cable = false){
  if(!rows.length) return `<div class="empty">No hay tareas abiertas.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Referencia</th><th>Descripción</th><th>Ubicación</th><th>Banda</th><th>${cable ? "Metros sistema" : "Stock"}</th><th>Tipo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows.map(t => `<tr><td>${esc(t.scheduledDate || "")}</td><td><b>${esc(t.materialRef)}</b></td><td>${esc(t.description || "")}</td><td>${esc(t.location || "")}</td><td><span class="pill dark">${esc(t.band || "")}</span></td><td>${fmt(t.systemQty)}</td><td>${esc(t.taskType || t.type || "general")}</td><td>${statusPill(t.status)}</td><td><div class="row-actions">${["assigned","recount_required","pending_inventory"].includes(t.status) ? `<button class="tiny" data-count-task="${esc(t.id)}">Registrar</button>` : ""}${t.status === "pending_jefe_approval" && hasAny(["jefe_logistico"]) ? `<button class="tiny blue" data-approve-task="${esc(t.id)}">Aprobar</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`;
}
function bindTaskButtons(){
  $$('[data-count-task]').forEach(btn => btn.addEventListener("click", () => openTaskCountDialog(btn.dataset.countTask)));
  $$('[data-approve-task]').forEach(btn => btn.addEventListener("click", () => approveTask(btn.dataset.approveTask)));
}

function renderCases(){
  renderCaseTable("jefeCasesTable", state.cases.filter(c => ["pending_jefe_logistico","pending_jefe_approval"].includes(c.status)), "jefe");
  renderCaseTable("auditCasesTable", state.cases.filter(c => c.status === "pending_auditoria"), "auditoria");
  renderCaseTable("gerenciaCasesTable", state.cases.filter(c => c.status === "pending_gerencia"), "gerencia");
}
function renderCaseTable(elId, rows, panel){
  const el = $("#" + elId); if(!el) return;
  if(!rows.length){ el.innerHTML = `<div class="empty">No hay casos pendientes.</div>`; return; }
  el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Creado</th><th>Referencia</th><th>Descripción</th><th>Diferencia</th><th>Estado</th><th>Último comentario</th><th>Acciones</th></tr></thead><tbody>${rows.map(c => `<tr><td>${formatDateTime(c.createdAt)}</td><td><b>${esc(c.materialRef)}</b></td><td>${esc(c.description || "")}</td><td>${fmt(c.diff)}</td><td>${statusPill(c.status)}</td><td>${esc(c.lastComment || "")}</td><td><div class="row-actions">${caseButtons(c, panel)}</div></td></tr>`).join("")}</tbody></table></div>`;
  $$('[data-case-action]').forEach(btn => btn.addEventListener("click", () => openCaseDialog(btn.dataset.caseId, btn.dataset.caseAction)));
  $$('[data-case-count]').forEach(btn => btn.addEventListener("click", () => openCaseCountDialog(btn.dataset.caseId, btn.dataset.caseCount)));
  $$('[data-case-report]').forEach(btn => btn.addEventListener("click", () => generateCaseReport(btn.dataset.caseReport)));
}
function caseButtons(c, panel){
  if(panel === "jefe") return `<button class="tiny blue" data-case-count="jefe" data-case-id="${esc(c.id)}">Contar novedad</button><button class="tiny" data-case-action="close_justified" data-case-id="${esc(c.id)}">Cerrar justificado</button><button class="tiny red" data-case-action="escalate_audit" data-case-id="${esc(c.id)}">Enviar auditoría</button><button class="tiny" data-case-report="${esc(c.id)}">Informe</button>`;
  if(panel === "auditoria") return `<button class="tiny blue" data-case-count="auditoria" data-case-id="${esc(c.id)}">Contabilizar auditoría</button><button class="tiny" data-case-action="close_audit" data-case-id="${esc(c.id)}">Cerrar auditoría</button><button class="tiny red" data-case-action="escalate_management" data-case-id="${esc(c.id)}">Enviar gerencia</button><button class="tiny" data-case-report="${esc(c.id)}">Informe</button>`;
  return `<button class="tiny blue" data-case-action="approve_management" data-case-id="${esc(c.id)}">Aprobar cierre</button><button class="tiny warn" data-case-action="authorize_adjustment" data-case-id="${esc(c.id)}">Autorizar ajuste</button><button class="tiny" data-case-report="${esc(c.id)}">Informe</button>`;
}

function renderMaterials(){
  const q = norm($("#materialSearch")?.value || ""), band = $("#materialBandFilter")?.value || "", cable = $("#materialCableFilter")?.value || "";
  let rows = [...state.materials].sort((a,b) => (b.score || 0) - (a.score || 0));
  if(q) rows = rows.filter(m => [m.ref,m.description,m.location,m.category].some(v => norm(v).includes(q)));
  if(band) rows = rows.filter(m => m.band === band);
  if(cable === "cable") rows = rows.filter(m => m.isCable);
  rows = rows.slice(0, 1000);
  if(!rows.length){ $("#materialsTable").innerHTML = `<div class="empty">No hay materiales para mostrar.</div>`; return; }
  $("#materialsTable").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Referencia</th><th>Descripción</th><th>Ubicación</th><th>Stock</th><th>Costo</th><th>Valor</th><th>Banda</th><th>Frecuencia</th><th>Próximo general</th><th>Cable</th><th>Disponible metraje</th><th>Próximo metraje</th></tr></thead><tbody>${rows.map(m => `<tr><td><b>${esc(m.ref)}</b></td><td>${esc(m.description || "")}</td><td>${esc(m.location || "")}</td><td>${fmt(m.stockSystem)}</td><td>${money(m.unitCost)}</td><td>${money(m.inventoryValue)}</td><td><span class="pill dark">${esc(m.band || "")}</span></td><td>${fmt(m.frequency)} jornadas</td><td>${esc(m.nextDueDate || "")}</td><td>${m.isCable ? '<span class="pill blue">Cable</span>' : ''}</td><td>${esc(m.cableAvailableDate || "")}</td><td>${esc(m.nextCableDueDate || "")}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderSettings(){
  if(!$("#setDailyLimit")) return;
  $("#setDailyLimit").value = state.settings.dailyLimit;
  $("#setActiveDays").value = state.settings.activeCountingDays.join(",");
  $("#setAutoHour").value = state.settings.autoSyncHour;
  $("#setSheetName").value = state.settings.sheetName || driveConfig.sheetName;
  $("#setCablePeriod").value = state.settings.cablePeriodDays;
  $("#setCableCooldown").value = state.settings.cableCooldownDays || 15;
  $("#setCableLimit").value = state.settings.cableSessionLimit || 0;
  $("#bandsEditor").innerHTML = state.settings.bands.map((b,i) => `<div class="band-row"><label>Banda<input data-band="${i}" data-field="key" value="${esc(b.key)}"></label><label>Descripción<input data-band="${i}" data-field="label" value="${esc(b.label)}"></label><label>Límite<input data-band="${i}" data-field="limit" type="number" step="0.0001" min="0" max="1" value="${b.limit}"></label><label>Frecuencia<input data-band="${i}" data-field="frequency" type="number" min="1" value="${b.frequency}"></label></div>`).join("");
}
async function saveSettingsFromUI(){
  if(!hasAny(["jefe_logistico"])) return toast("No tienes permiso para guardar configuración.", "error");
  const next = structuredClone(state.settings);
  next.dailyLimit = Number($("#setDailyLimit").value || 30);
  next.activeCountingDays = $("#setActiveDays").value.split(",").map(v => Number(v.trim())).filter(v => v >= 0 && v <= 6);
  next.autoSyncHour = Number($("#setAutoHour").value || 8);
  next.sheetName = $("#setSheetName").value.trim() || driveConfig.sheetName;
  next.cablePeriodDays = Number($("#setCablePeriod").value || 15);
  next.cableCooldownDays = Number($("#setCableCooldown").value || 15);
  next.cableSessionLimit = Number($("#setCableLimit").value || 0);
  $$('[data-band]').forEach(input => { const idx = Number(input.dataset.band), field = input.dataset.field; next.bands[idx][field] = field === "limit" || field === "frequency" ? Number(input.value) : input.value; });
  next.bands.sort((a,b) => Number(a.limit) - Number(b.limit));
  next.updatedAt = nowTS();
  await setDoc(doc(db, "settings", "inventory"), next, { merge:true });
  state.settings = next;
  toast("Configuración guardada.");
  renderAll();
}


function renderIndicators(){
  const cov = $("#coverageIndicators");
  const qual = $("#qualityIndicators");
  if(!cov || !qual) return;

  const total = state.materials.filter(m => m.active !== false).length;
  const counted = state.materials.filter(m => m.active !== false && wasCountedThisYear(m)).length;
  const pending = Math.max(0, total - counted);
  const dailyTarget = annualDailyTarget(pending, Number(state.settings.dailyLimit || 30));
  const cables = state.materials.filter(m => m.active !== false && isCableMaterial(m));
  const meterDone = cables.filter(wasMeterCountedThisYear).length;

  const diffs = state.counts.filter(c => Number(c.absDiff || 0) > 0);
  const totalCounts = state.counts.length;
  const accuracy = totalCounts ? Math.round((totalCounts - diffs.length) / totalCounts * 100) : 0;

  cov.innerHTML = `
    <div class="summary-item"><span>Materiales activos</span><b>${fmt(total)}</b></div>
    <div class="summary-item"><span>Contados en el año</span><b>${fmt(counted)}</b></div>
    <div class="summary-item"><span>Pendientes del año</span><b>${fmt(pending)}</b></div>
    <div class="summary-item"><span>Meta diaria calculada</span><b>${fmt(dailyTarget)}</b></div>
    <div class="summary-item"><span>Cobertura anual general</span><b>${total ? Math.round(counted/total*100) : 0}%</b></div>
    <div class="summary-item"><span>Cables identificados</span><b>${fmt(cables.length)}</b></div>
    <div class="summary-item"><span>Metrajes hechos en el año</span><b>${fmt(meterDone)}</b></div>
    <div class="summary-item"><span>Cobertura anual metraje</span><b>${cables.length ? Math.round(meterDone/cables.length*100) : 0}%</b></div>
  `;

  qual.innerHTML = `
    <div class="summary-item"><span>Conteos registrados recientes</span><b>${fmt(totalCounts)}</b></div>
    <div class="summary-item"><span>Conteos con diferencia</span><b>${fmt(diffs.length)}</b></div>
    <div class="summary-item"><span>Exactitud reciente</span><b>${accuracy}%</b></div>
    <div class="summary-item"><span>Casos abiertos</span><b>${fmt(state.cases.length)}</b></div>
    <div class="summary-item"><span>Jefe logístico pendientes</span><b>${fmt(state.cases.filter(c => String(c.status).includes("jefe")).length)}</b></div>
    <div class="summary-item"><span>Auditoría pendientes</span><b>${fmt(state.cases.filter(c => String(c.status).includes("auditoria")).length)}</b></div>
    <div class="summary-item"><span>Gerencia pendientes</span><b>${fmt(state.cases.filter(c => String(c.status).includes("gerencia")).length)}</b></div>
  `;
}

function renderDriveConfig(){
  $("#cfgDriveClient").value = driveConfig.clientId;
  $("#cfgDriveFolder").value = driveConfig.folderId;
  $("#cfgDriveFile").value = driveConfig.fileName;
  $("#cfgDriveSheet").value = driveConfig.sheetName;
}
function isDriveTokenUsable(){
  return Boolean(
    state.driveToken &&
    state.driveTokenExpiresAt &&
    Date.now() < state.driveTokenExpiresAt - 90000
  );
}
function markDriveDisconnected(message = "Drive no conectado"){
  state.driveToken = null;
  state.driveTokenExpiresAt = 0;
  const badge = $("#driveState");
  if(badge){
    badge.textContent = message;
    badge.className = "tag red";
  }
}
function connectDrive(interactive = true){
  if(!interactive){
    return Promise.reject(new Error("Drive no está conectado. La sincronización automática no puede abrir ventanas; primero presiona Conectar Drive manualmente."));
  }
  if(state.driveAuthPromise) return state.driveAuthPromise;

  state.driveAuthPromise = new Promise((resolve, reject) => {
    if(!window.google?.accounts?.oauth2){
      state.driveAuthPromise = null;
      reject(new Error("Google Identity Services aún no cargó. Espera unos segundos y vuelve a presionar Conectar Drive."));
      return;
    }

    const requestedScopes = driveConfig.scopes.split(/\s+/).filter(Boolean);

    state.driveTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: driveConfig.clientId,
      scope: driveConfig.scopes,
      callback: tokenResponse => {
        state.driveAuthPromise = null;

        if(tokenResponse?.error){
          markDriveDisconnected("Drive no conectado");
          reject(new Error(`Google no autorizó Drive: ${tokenResponse.error}`));
          return;
        }

        if(!tokenResponse?.access_token || String(tokenResponse.access_token).length < 30){
          markDriveDisconnected("Token inválido");
          reject(new Error("No se recibió un token válido de Drive. Permite la ventana emergente y vuelve a conectar."));
          return;
        }

        const allScopesGranted = window.google?.accounts?.oauth2?.hasGrantedAllScopes
          ? google.accounts.oauth2.hasGrantedAllScopes(tokenResponse, ...requestedScopes)
          : true;

        if(!allScopesGranted){
          markDriveDisconnected("Permisos incompletos");
          reject(new Error("No autorizaste todos los permisos de Drive. Debes aceptar drive.metadata.readonly y drive.readonly."));
          return;
        }

        state.driveToken = tokenResponse.access_token;
        state.driveTokenExpiresAt = Date.now() + Number(tokenResponse.expires_in || 3300) * 1000;

        $("#driveState").textContent = "Conectado";
        $("#driveState").className = "tag green";
        logSync("Token de Drive recibido y validado. Ya puedes sincronizar SIESA.");
        toast("Google Drive conectado correctamente.");
        resolve(state.driveToken);
      },
      error_callback: err => {
        state.driveAuthPromise = null;
        markDriveDisconnected("Popup bloqueado");
        reject(new Error("Google no pudo abrir la ventana de autorización. Habilita popups para jeptac.github.io y vuelve a intentar."));
      }
    });

    state.driveTokenClient.requestAccessToken({ prompt: "consent" });
  });

  return state.driveAuthPromise;
}
async function ensureDriveToken(silent = false){
  if(isDriveTokenUsable()) return state.driveToken;

  markDriveDisconnected("Drive requiere conexión");

  if(silent){
    throw new Error("Drive no está conectado o el token venció. La sincronización automática no puede abrir ventanas; primero presiona Conectar Drive manualmente.");
  }

  return await connectDrive(true);
}

async function syncFromDrive(silent = false){
  if(!hasAny(["jefe_logistico"])) return toast("Solo super admin o jefe logístico pueden sincronizar SIESA.", "error");
  if(state.syncRunning){
    if(!silent) toast("Ya hay una sincronización en curso. Espera a que termine.");
    return;
  }
  state.syncRunning = true;
  try{
    logSync("Iniciando lectura de Drive...");
    const token = await ensureDriveToken(silent);
    logSync("Token Drive disponible. Buscando archivo Excel en la carpeta configurada...");
    const file = await findDriveFile(token);
    logSync(`Archivo encontrado: ${file.name} · ${file.modifiedTime}`);

    const stateRef = doc(db, "syncState", "drive");
    const lastSnap = await getDoc(stateRef);
    const lastData = lastSnap.exists() ? lastSnap.data() : {};

    if(lastData.lastFileModifiedTime === file.modifiedTime){
      logSync("El Excel no cambió desde la última sincronización. Se verifica agenda diaria y metraje.");
      await setDoc(stateRef, { lastAutoCheckDate: todayISO(), updatedAt: nowTS() }, { merge:true });
      await ensureMandatoryDailyWork(false);
      await refreshAll();
      if(!silent) toast("Excel sin cambios. La app verificó y completó las tareas obligatorias del día.");
      return;
    }

    const buffer = await downloadDriveFile(file.id, token);
    logSync(`Archivo descargado correctamente. Tamaño aproximado: ${Math.round(buffer.byteLength/1024)} KB.`);

    const rows = parseExcel(buffer);
    logSync(`Hoja leída correctamente. Filas detectadas: ${rows.length}.`);

    const materials = rows.map(normalizeMaterial).filter(Boolean);
    logSync(`Materiales válidos normalizados: ${materials.length}.`);
    if(!materials.length) throw new Error("No se detectaron materiales válidos en el Excel. Revisa encabezados de referencia, existencia/stock y costo.");

    await processSiesaMaterials(materials, file, rows.length);
    await setDoc(stateRef, {
      lastFileId:file.id,
      lastFileModifiedTime:file.modifiedTime,
      lastSyncDate:todayISO(),
      lastAutoSyncDate:silent ? todayISO() : (lastData.lastAutoSyncDate || ""),
      updatedAt:nowTS()
    }, { merge:true });
    await refreshAll();
    logSync("Sincronización finalizada: materiales, agenda diaria y metraje verificados.");
    if(!silent) toast("Sincronización SIESA completada y tareas obligatorias verificadas.");
  }catch(err){
    console.error(err);
    const msg = err.message || String(err);
    if(msg.includes("TOKEN_DRIVE_INVALIDO")){
      markDriveDisconnected("Token vencido");
      logSync("ERROR: la autorización de Drive venció o quedó inválida. Presiona Conectar Drive y luego Sincronizar SIESA.");
      if(!silent) toast("La autorización de Drive venció. Presiona Conectar Drive nuevamente y luego Sincronizar SIESA.", "error");
    }else{
      logSync("ERROR: " + msg);
      if(!silent) toast(msg || "Error sincronizando SIESA", "error");
    }
    if(silent) throw err;
  }finally{
    state.syncRunning = false;
  }
}

async function ensureMandatoryDailyWork(showToast = true){
  await loadMaterials();
  if(!state.materials.length){
    logSync("Agenda diaria no generada: no hay materiales en Firestore. Primero debe leerse correctamente el Excel SIESA.");
    if(showToast) toast("No hay materiales cargados. Primero sincroniza el Excel SIESA desde Drive.", "error");
    return;
  }

  await forceMandatoryDailyTasks(false);

  if(isMeterSessionOpen()){
    await forceCableMeterTasks(false);
  }else{
    logSync(`Metraje no corresponde hoy. Próxima sesión: ${nextMeterSessionDate()}.`);
  }

  await loadTasks();
  if(showToast) toast("Agenda obligatoria del día verificada.");
}

async function findDriveFile(token){
  if(!token || String(token).length < 30){
    markDriveDisconnected("Token inválido");
    throw new Error("TOKEN_DRIVE_INVALIDO: la app no tiene un token OAuth válido para consultar Drive.");
  }

  const qParts = [`name='${driveConfig.fileName.replace(/'/g,"\\'")}'`, `'${driveConfig.folderId}' in parents`, "trashed=false"];
  const params = new URLSearchParams({ q:qParts.join(" and "), orderBy:"modifiedTime desc", pageSize:"1", fields:"files(id,name,mimeType,modifiedTime,size,webViewLink)" });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, { headers:{ Authorization:`Bearer ${token}` } });

  if(res.status === 401){
    markDriveDisconnected("Token vencido");
    throw new Error(`TOKEN_DRIVE_INVALIDO: Drive rechazó la autorización. Detalle: ${await res.text()}`);
  }

  if(!res.ok) throw new Error(`Drive no permitió buscar el archivo: ${res.status} ${await res.text()}`);

  const data = await res.json();
  if(!data.files?.length) throw new Error(`No se encontró ${driveConfig.fileName} en la carpeta configurada.`);
  return data.files[0];
}
async function downloadDriveFile(fileId, token){
  if(!token || String(token).length < 30){
    markDriveDisconnected("Token inválido");
    throw new Error("TOKEN_DRIVE_INVALIDO: la app no tiene un token OAuth válido para descargar Drive.");
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers:{ Authorization:`Bearer ${token}` } });

  if(res.status === 401){
    markDriveDisconnected("Token vencido");
    throw new Error(`TOKEN_DRIVE_INVALIDO: Drive rechazó la descarga por token vencido o inválido. Detalle: ${await res.text()}`);
  }

  if(!res.ok) throw new Error(`No se pudo descargar el Excel: ${res.status} ${await res.text()}`);
  return await res.arrayBuffer();
}
function parseExcel(buffer){
  if(!window.XLSX) throw new Error("No cargó la librería XLSX/SheetJS.");
  const workbook = XLSX.read(buffer, { type:"array", cellDates:true });
  const sheetName = state.settings.sheetName || driveConfig.sheetName;
  const sheet = workbook.Sheets[sheetName] || workbook.Sheets[driveConfig.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
  if(!sheet) throw new Error(`No se encontró la hoja ${sheetName}.`);
  return sheetToObjects(sheet);
}
function sheetToObjects(ws){
  const matrix = XLSX.utils.sheet_to_json(ws, { header:1, defval:"", raw:true });
  let headerIndex = -1, bestScore = 0;
  matrix.slice(0, 50).forEach((row, idx) => {
    const cells = row.map(norm);
    const score = (cells.some(c => aliases.ref.some(a => c.includes(norm(a)))) ? 5 : 0) + (cells.some(c => aliases.stock.some(a => c.includes(norm(a)))) ? 3 : 0) + (cells.some(c => aliases.cost.some(a => c.includes(norm(a)))) ? 2 : 0) + (cells.some(c => aliases.desc.some(a => c.includes(norm(a)))) ? 1 : 0);
    if(score > bestScore){ bestScore = score; headerIndex = idx; }
  });
  if(headerIndex < 0 || bestScore < 5) throw new Error("No se detectó una fila de encabezados válida.");
  const headers = matrix[headerIndex].map((h,i) => String(h || `Columna_${i+1}`).trim());
  return matrix.slice(headerIndex + 1).filter(row => row.some(v => String(v ?? "").trim() !== "")).map(row => Object.fromEntries(headers.map((h,i) => [h, row[i] ?? ""])));
}
function getByAliases(row, list){
  const keys = Object.keys(row || {}), map = new Map(keys.map(k => [norm(k), row[k]]));
  for(const a of list){ const na = norm(a); if(map.has(na)) return map.get(na); }
  for(const k of keys){ const nk = norm(k); if(list.some(a => nk.includes(norm(a)))) return row[k]; }
  return "";
}
function normalizeMaterial(row){
  const ref = String(getByAliases(row, aliases.ref)).trim();
  if(!ref) return null;
  const stock = num(getByAliases(row, aliases.stock));
  const unitCost = num(getByAliases(row, aliases.cost));
  const totalValue = num(getByAliases(row, aliases.totalValue));
  const description = String(getByAliases(row, aliases.desc) || "").trim();
  const category = String(getByAliases(row, aliases.category) || "").trim();
  const unit = String(getByAliases(row, aliases.unit) || "").trim();
  const joined = norm(`${ref} ${description} ${category} ${unit}`);
  const isMeterUnit = ["m","mt","mts","metro","metros"].includes(norm(unit));
  const isCable = state.settings.cableKeywords.some(k => joined.includes(norm(k))) || (isMeterUnit && (joined.includes("cable") || joined.includes("conductor")));
  return {
    ref, id:safeId(ref), description, category,
    location:String(getByAliases(row, aliases.location) || "").trim(), unit,
    stockSystem:stock, unitCost, inventoryValue: totalValue || stock * unitCost,
    sourceMovement:num(getByAliases(row, aliases.movement)), sourceLastMoveDate:toISO(getByAliases(row, aliases.lastMove)),
    isCable, active:true
  };
}
async function processSiesaMaterials(incoming, file, rowsRead){
  const existingSnap = await getDocs(query(collection(db, "materials"), limit(7000)));
  const existingMap = new Map(existingSnap.docs.map(d => [d.data().ref, { id:d.id, ...d.data() }]));
  const firstSync = existingSnap.empty;
  const today = todayISO();
  const yearField = annualFieldName();

  const prepared = incoming.map(m => {
    const old = existingMap.get(m.ref);
    const isNewAfterBase = !firstSync && !old;
    const change = old ? Number(m.stockSystem || 0) - Number(old.stockSystem || 0) : 0;
    const absChange = Math.abs(change);
    const movementType = !old ? "nuevo_siesa" : change > 0 ? "ingreso_operativo" : change < 0 ? "salida_operativa" : "sin_movimiento";
    const movementIndex = Number(old?.movementIndex || 0) + (absChange > 0 ? 1 : 0) + Number(m.sourceMovement || 0);
    const variabilityIndex = Number(old?.variabilityIndex || 0) + absChange;

    return {
      ...old,
      ...m,
      previousStock: old?.stockSystem ?? null,
      stockChange: change,
      movementType,
      movementIndex,
      variabilityIndex,
      firstSeenDate: old?.firstSeenDate || today,
      lastVerifiedDate: isNewAfterBase ? today : (old?.lastVerifiedDate || ""),
      lastMovementDate: change !== 0 ? today : (old?.lastMovementDate || m.sourceLastMoveDate || ""),
      lastCountDate: isNewAfterBase ? today : (old?.lastCountDate || ""),
      [yearField]: isNewAfterBase ? true : (old?.[yearField] === true ? true : false),
      autoCountedReason: isNewAfterBase ? "nuevo_registro_siesa" : (old?.autoCountedReason || ""),
      sourceFileId: file.id,
      sourceFileName: file.name,
      sourceModifiedTime: file.modifiedTime,
      lastSyncDate: today,
      nextDueDate: "",
      frequency: 0,
      updatedAt: nowTS()
    };
  });

  const finalMaterials = assignPareto(prepared).map(m => ({
    ...m,
    nextDueDate: "",
    frequency: 0,
    cableAvailableDate: m.isCable ? cableAvailableDate(m) : "",
    nextCableDueDate: ""
  }));

  await batchSet("materials", finalMaterials.map(m => ({ id:m.id || safeId(m.ref), data:compactMaterial(m) })));
  state.materials = finalMaterials;
  await loadTasks();

  await addDoc(collection(db, "syncLogs"), {
    fileId:file.id,
    fileName:file.name,
    fileModifiedTime:file.modifiedTime,
    rowsRead,
    materialsProcessed:finalMaterials.length,
    firstSync,
    newAutoCounted:finalMaterials.filter(m => m.autoCountedReason === "nuevo_registro_siesa" && m[yearField] === true).length,
    createdAt:nowTS(),
    createdByUid:state.user.uid,
    createdByEmail:state.user.email
  });

  logSync(`Repositorio SIESA actualizado. Primera base: ${firstSync ? "SI" : "NO"}. Nuevos auto-contados: ${finalMaterials.filter(m => m.autoCountedReason === "nuevo_registro_siesa" && m[yearField] === true).length}.`);
  await forceMandatoryDailyTasks(false);
  await loadTasks();

  if(isMeterSessionOpen()){
    await forceCableMeterTasks(false);
  }else{
    logSync(`Metraje no corresponde hoy. Próxima sesión: ${nextMeterSessionDate()}.`);
  }
}

function assignPareto(materials){
  const scored = materials.map(m => ({
    ...m,
    inventoryValue:Number(m.inventoryValue || 0),
    score:
      Number(m.inventoryValue || 0) * 1.0 +
      Number(m.unitCost || 0) * 5 +
      Number(m.movementIndex || 0) * 50000 +
      Number(m.variabilityIndex || 0) * Math.max(Number(m.unitCost || 1), 1)
  }));
  const sorted = [...scored].sort((a,b) => (b.score || 0) - (a.score || 0));
  const n = sorted.length || 1;
  const byRef = new Map();
  sorted.forEach((m, idx) => {
    const pct = (idx + 1) / n;
    const band = state.settings.bands.find(b => pct <= Number(b.limit)) || state.settings.bands[state.settings.bands.length - 1];
    byRef.set(m.ref, {
      ...m,
      paretoPosition:idx + 1,
      paretoPercentile:pct,
      band:band.key,
      frequency:0,
      nextDueDate:""
    });
  });
  return materials.map(m => byRef.get(m.ref));
}

function compactMaterial(m){
  const yField = annualFieldName();
  const meterField = meterFieldName();
  return {
    ref:m.ref,
    description:m.description || "",
    category:m.category || "",
    location:m.location || "",
    unit:m.unit || "",
    stockSystem:Number(m.stockSystem || 0),
    unitCost:Number(m.unitCost || 0),
    inventoryValue:Number(m.inventoryValue || 0),
    score:Number(m.score || 0),
    band:m.band || "E",
    frequency:0,
    movementIndex:Number(m.movementIndex || 0),
    variabilityIndex:Number(m.variabilityIndex || 0),
    movementType:m.movementType || "",
    previousStock:m.previousStock ?? null,
    stockChange:Number(m.stockChange || 0),
    firstSeenDate:m.firstSeenDate || todayISO(),
    lastVerifiedDate:m.lastVerifiedDate || "",
    lastMovementDate:m.lastMovementDate || "",
    lastCountDate:m.lastCountDate || "",
    [yField]: m[yField] === true,
    autoCountedReason:m.autoCountedReason || "",
    nextDueDate:"",
    isCable:Boolean(m.isCable),
    lastCableCountDate:m.lastCableCountDate || "",
    lastMeterCountDate:m.lastMeterCountDate || "",
    [meterField]: m[meterField] === true,
    cableAvailableDate:m.cableAvailableDate || "",
    nextCableDueDate:"",
    sourceFileId:m.sourceFileId || "",
    sourceFileName:m.sourceFileName || "",
    sourceModifiedTime:m.sourceModifiedTime || "",
    lastSyncDate:m.lastSyncDate || "",
    active:m.active !== false,
    updatedAt:m.updatedAt || nowTS()
  };
}

async function batchSet(colName, items){
  let batch = writeBatch(db), count = 0;
  for(const item of items){ batch.set(doc(db, colName, item.id), item.data, { merge:true }); count++; if(count >= 430){ await batch.commit(); batch = writeBatch(db); count = 0; } }
  if(count) await batch.commit();
}
function taskPriority(m){
  const overdue = Math.max(0, -diffDays(todayISO(), m.nextDueDate || todayISO()));
  const bandWeight = {"A+":6000,A:5000,B:4000,C:3000,D:2000,E:1000}[m.band] || 0;
  return overdue * 100 + bandWeight + Math.min(Number(m.score || 0)/100000, 500);
}
function makeTask(m, extra = {}){
  return { materialRef:m.ref, materialId:m.id || safeId(m.ref), description:m.description || "", location:m.location || "", band:m.band || "", frequency:Number(m.frequency || 120), systemQty:Number(m.stockSystem || 0), scheduledDate:extra.scheduledDate || todayISO(), taskType:extra.taskType || extra.type || "general", status:extra.status || "assigned", priority:Number(extra.priority || taskPriority(m)), recountRound:Number(extra.recountRound || 0), origin:extra.origin || "agenda", syncLogId:extra.syncLogId || "", createdAt:nowTS(), createdByUid:state.user?.uid || "", createdByEmail:state.user?.email || "" };
}
async function createInitialSampleTasks(materials, syncLogId){
  const today = todayISO();
  const limitDaily = Math.max(1, Number(state.settings.dailyLimit || state.settings.firstSampleLimit || 30));
  const openSnap = await getDocs(query(collection(db, "countTasks"), where("status", "in", ["assigned","recount_required","pending_inventory","pending_jefe_approval"]), limit(900)));
  const openRefs = new Set(openSnap.docs.map(d => d.data().materialRef));
  const seed = `MUESTRA_INICIAL-${today}-${syncLogId || "base"}`;

  const candidates = [...materials]
    .filter(m => m.active !== false && !openRefs.has(m.ref))
    .map(m => {
      const score = Math.max(Number(m.score || 0), 1);
      const bandWeight = {"A+":7,A:6,B:5,C:3,D:2,E:1}[m.band] || 1;
      const random = seededRandomScore(`${seed}-${m.ref}`);
      return {
        ...m,
        initialRandomScore: (random + 0.05) / (Math.log10(score + 10) * bandWeight)
      };
    })
    .sort((a,b) => a.initialRandomScore - b.initialRandomScore);

  const selected = [];
  const seen = new Set();

  for(const band of state.settings.bands){
    const item = candidates.find(m => m.band === band.key && !seen.has(m.ref));
    if(item){ selected.push(item); seen.add(item.ref); }
  }

  for(const item of candidates){
    if(selected.length >= limitDaily) break;
    if(!seen.has(item.ref)){ selected.push(item); seen.add(item.ref); }
  }

  if(!selected.length){
    logSync("No fue posible crear muestra inicial: no hay materiales disponibles.");
    return;
  }

  await batchSet("countTasks", selected.map((m, idx) => ({
    id:`INIT-${today}-${safeId(m.ref)}`,
    data:makeTask(m,{ scheduledDate:today, taskType:"initial_sample", status:"assigned", priority:120000-idx, origin:"initial_random_pareto", syncLogId })
  })));
  logSync(`Muestra inicial obligatoria creada: ${selected.length} referencias para contar hoy.`);
}

async function generateGeneralTasks(showToast = true){
  return await forceMandatoryDailyTasks(showToast);
}

async function generateCableTasks(showToast = true){
  if(!hasAny(["jefe_logistico"])) { if(showToast) toast("Solo super admin o jefe logístico pueden generar metraje.", "error"); return; }
  const today = todayISO();
  const stateRef = doc(db, "syncState", "cable_metraje");
  const stateSnap = await getDoc(stateRef);
  const lastSessionDate = stateSnap.exists() ? (stateSnap.data().lastSessionDate || "") : "";
  const nextSessionDate = nextCableSessionDateFrom(lastSessionDate);

  const openSnap = await getDocs(query(collection(db, "countTasks"), where("status", "in", ["assigned","recount_required","pending_inventory","pending_jefe_approval","pending_jefe_logistico"]), limit(900)));
  const openCableTasks = openSnap.docs.filter(d => d.data().taskType === "cable_metraje");
  const openCableRefs = new Set(openCableTasks.map(d => d.data().materialRef));

  if(openCableTasks.length === 0 && lastSessionDate && today < nextSessionDate){
    if(showToast) toast(`El módulo de metraje está bloqueado. Próxima sesión: ${nextSessionDate}.`, "error");
    return;
  }

  const currentYear = yearOf(today);
  const allCables = state.materials.filter(m => m.isCable && m.active !== false);
  const uncountedThisYear = allCables.filter(m => lastCableCountYear(m) !== currentYear);
  const eligible = uncountedThisYear
    .filter(m => !openCableRefs.has(m.ref))
    .filter(m => isCableMature(m, today));

  const remainingSessions = countCableSessionsRemaining(today);
  const autoLimit = Math.max(1, Math.ceil(uncountedThisYear.length / remainingSessions));
  const limitCable = Number(state.settings.cableSessionLimit || 0) || autoLimit;

  const seed = `${state.settings.cableRandomSeed || "METRAJE_ANUAL"}-${currentYear}-${today}`;
  const cables = eligible
    .map(m => ({ ...m, randomOrder: seededRandomScore(`${seed}-${m.ref}`) }))
    .sort((a,b) => a.randomOrder - b.randomOrder)
    .slice(0, limitCable);

  if(!cables.length){
    const immature = uncountedThisYear.length - eligible.length;
    logSync(`Metraje: no se generaron cables. Total cables: ${allCables.length}, pendientes año: ${uncountedThisYear.length}, elegibles maduros: ${eligible.length}, inmaduros/bloqueados: ${Math.max(0, immature)}.`);
    if(showToast) toast(`No hay cables maduros para esta sesión. Pendientes inmaduros o bloqueados: ${fmt(Math.max(0, immature))}.`);
    await setDoc(stateRef, { pendingSessionDate: today, nextSessionDate: today, blockedReason:"sin_cables_maduros", updatedAt: nowTS(), updatedByUid: state.user.uid, updatedByEmail: state.user.email }, { merge:true });
    return;
  }

  await batchSet("countTasks", cables.map(m => ({
    id:`CABLE-${today}-${safeId(m.ref)}`,
    data:makeTask(m,{ scheduledDate:today, taskType:"cable_metraje", status:"assigned", priority:90000, origin:"cable_random_annual" })
  })));

  await setDoc(stateRef, {
    lastSessionDate: today,
    nextSessionDate: addDays(today, Number(state.settings.cablePeriodDays || 15)),
    generatedTasks: cables.length,
    totalCables: allCables.length,
    pendingYear: Math.max(0, uncountedThisYear.length - cables.length),
    eligibleAtGeneration: eligible.length,
    randomSeed: seed,
    updatedAt: nowTS(),
    updatedByUid: state.user.uid,
    updatedByEmail: state.user.email
  }, { merge:true });

  await addDoc(collection(db, "syncLogs"), {
    type:"cable_session",
    sessionDate: today,
    nextSessionDate: addDays(today, Number(state.settings.cablePeriodDays || 15)),
    generatedTasks: cables.length,
    totalCables: allCables.length,
    pendingYear: Math.max(0, uncountedThisYear.length - cables.length),
    randomSeed: seed,
    createdAt: nowTS(),
    createdByUid: state.user.uid,
    createdByEmail: state.user.email
  });

  logSync(`Metraje: sesión aleatoria generada con ${cables.length} cables. Pendientes del año después de sesión: ${Math.max(0, uncountedThisYear.length - cables.length)}.`);
  if(showToast){ toast(`Sesión aleatoria de metraje generada: ${cables.length} cables.`); await refreshAll(); }
}


function openTaskCountDialog(taskId){
  const task = state.tasks.find(t => t.id === taskId);
  if(!task) return;
  const cable = task.taskType === "cable_metraje";
  $("#countTaskId").value = task.id;
  $("#countCaseId").value = "";
  $("#countMode").value = "task";
  $("#countMaterialRef").value = task.materialRef;
  $("#countDate").value = todayISO();
  $("#countSystemQty").value = Number(task.systemQty || 0);
  $("#countQty").value = Number(task.systemQty || 0);
  $("#countSupport").value = ""; $("#countCause").value = "N/A"; $("#countObs").value = "";
  $("#countDialogTitle").textContent = cable ? "Registrar metraje físico" : "Registrar conteo";
  $("#systemQtyLabel").childNodes[0].textContent = cable ? "Metros sistema" : "Stock sistema";
  $("#countQtyLabel").childNodes[0].textContent = cable ? "Metros físicos contados" : "Cantidad contada";
  $("#countDialogSubtitle").textContent = `${task.materialRef} · ${task.description || ""} · ${task.location || ""}`;
  $("#countDialog").showModal();
}
function openCaseCountDialog(caseId, mode){
  const c = state.cases.find(x => x.id === caseId);
  if(!c) return;
  if(mode === "jefe" && !hasAny(["jefe_logistico"])) return toast("No tienes permiso.", "error");
  if(mode === "auditoria" && !hasAny(["auditoria"])) return toast("No tienes permiso.", "error");
  $("#countTaskId").value = "";
  $("#countCaseId").value = c.id;
  $("#countMode").value = mode;
  $("#countMaterialRef").value = c.materialRef;
  $("#countDate").value = todayISO();
  $("#countSystemQty").value = Number(c.systemQty ?? c.lastSystemQty ?? 0);
  $("#countQty").value = Number(c.systemQty ?? c.lastSystemQty ?? 0);
  $("#countSupport").value = ""; $("#countCause").value = "N/A"; $("#countObs").value = "";
  $("#countDialogTitle").textContent = mode === "auditoria" ? "Contabilización auditoría" : "Verificación jefe logístico";
  $("#systemQtyLabel").childNodes[0].textContent = "Stock sistema";
  $("#countQtyLabel").childNodes[0].textContent = "Cantidad física";
  $("#countDialogSubtitle").textContent = `${c.materialRef} · ${c.description || ""}`;
  $("#countDialog").showModal();
}

async function forceMandatoryDailyTasks(showToast = true){
  if(!hasAny(["jefe_logistico"])){
    if(showToast) toast("Solo super admin o jefe logístico pueden crear el conteo obligatorio.", "error");
    return;
  }

  const today = todayISO();
  await loadMaterials();
  await loadTasks();

  if(!state.materials.length){
    logSync("No se puede crear conteo obligatorio: no hay materiales. Sincroniza primero Excel_siesa.xls.");
    if(showToast) toast("No hay materiales en Firestore. Primero sincroniza el Excel SIESA.", "error");
    return;
  }

  const active = state.materials.filter(m => m.active !== false);
  const pendingYear = active.filter(m => !wasCountedThisYear(m));
  const totalPending = pendingYear.length;
  const dailyTarget = annualDailyTarget(totalPending, Number(state.settings.dailyLimit || 30));

  let todayTasks = [];
  try{
    const todaySnap = await getDocs(query(collection(db, "countTasks"), where("scheduledDate", "==", today), limit(1500)));
    todayTasks = todaySnap.docs
      .map(d => ({ id:d.id, ...d.data() }))
      .filter(t => (t.taskType || t.type || "general") !== "cable_metraje");
  }catch(err){
    logSync("No se pudo consultar agenda exacta del día; se usa memoria local. " + (err.message || err));
    todayTasks = state.tasks.filter(t => (t.scheduledDate || "") === today && (t.taskType || t.type || "general") !== "cable_metraje");
  }

  const alreadyToday = todayTasks.length;
  if(totalPending <= 0){
    // 100% cubierto: ahora sí se permite repetición controlada por Pareto.
    logSync("Cobertura anual general ya está en 100%. Se habilita repetición controlada si se requiere agenda.");
  }

  const target = totalPending > 0 ? dailyTarget : Math.min(Number(state.settings.dailyLimit || 30), Math.max(1, Math.ceil(active.length / countWorkdaysUntilYearEnd(today))));
  const room = Math.max(0, target - alreadyToday);

  if(room <= 0){
    logSync(`Conteo obligatorio ya creado para hoy: ${alreadyToday}/${target}. Pendientes anuales: ${totalPending}.`);
    if(showToast) toast(`Conteo obligatorio ya creado para hoy: ${alreadyToday}/${target}.`);
    return;
  }

  const refsWithOpenTasks = new Set(
    state.tasks
      .filter(t => ["assigned","pending_inventory","recount_required","pending_jefe_approval","pending_jefe_logistico"].includes(t.status))
      .map(t => t.materialRef)
  );
  todayTasks.forEach(t => { if(t.materialRef) refsWithOpenTasks.add(t.materialRef); });

  let pool = pendingYear.filter(m => !refsWithOpenTasks.has(m.ref));
  let repeatMode = false;

  if(!pool.length && totalPending > 0){
    logSync("Hay pendientes anuales, pero todos tienen tarea abierta o ya fueron programados hoy. No se duplican referencias.");
  }

  if(!pool.length && totalPending <= 0){
    repeatMode = true;
    pool = active.filter(m => !refsWithOpenTasks.has(m.ref));
  }

  if(!pool.length){
    if(showToast) toast("No hay referencias elegibles sin duplicar. Revisa tareas abiertas en countTasks.", "error");
    logSync("No se crearon tareas: no hay referencias elegibles sin duplicar.");
    return;
  }

  const selected = paretoWeightedAnnualSelection(pool, `CONTEO-GENERAL-${today}`).slice(0, room);

  const tasks = selected.map((m, idx) => ({
    id:`GENERAL-${today}-${safeId(m.ref)}`,
    data:makeTask(m, {
      scheduledDate:today,
      taskType:repeatMode ? "repeticion_controlada_pareto" : "conteo_diario_pareto",
      type:repeatMode ? "repeticion_controlada_pareto" : "conteo_diario_pareto",
      status:"assigned",
      priority:100000 - idx,
      origin:"calendario_anual_pareto"
    })
  }));

  await batchSet("countTasks", tasks);
  logSync(`Conteo obligatorio creado: ${tasks.length}. Meta de hoy: ${target}. Pendientes anuales: ${totalPending}. Días hábiles restantes: ${countWorkdaysUntilYearEnd(today)}. Método: Pareto aleatorio sin repetición.`);
  if(showToast) toast(`Conteo obligatorio creado: ${tasks.length}`);
}

function weightedParetoShuffle(materials, seedText){
  return paretoWeightedAnnualSelection(materials, seedText);
}


function buildCountPayload(task){
  const systemQty = num($("#countSystemQty").value), countedQty = num($("#countQty").value), diff = countedQty - systemQty;
  return { taskId:task.id, taskType:task.taskType || "general", materialRef:task.materialRef, materialId:task.materialId, description:task.description || "", location:task.location || "", band:task.band || "", date:$("#countDate").value || todayISO(), systemQty, countedQty, diff, absDiff:Math.abs(diff), result:Math.abs(diff) > 0.0001 ? "Diferencia" : "Exacto", cause:$("#countCause").value || "N/A", support:$("#countSupport").value || "", obs:$("#countObs").value || "", countType:task.taskType || "general", countedByRole:role(), countedByUid:state.user.uid, countedByEmail:state.user.email, createdAt:nowTS() };
}
async function createApprovalCase(task, countId, diff, systemQty){
  await addDoc(collection(db, "cases"), { materialRef:task.materialRef, materialId:task.materialId, description:task.description || "", location:task.location || "", status:"pending_jefe_approval", type: task.taskType === "cable_metraje" ? "aprobacion_metraje_cable" : "aprobacion_conteo_exacto", diff, systemQty, sourceTaskId:task.id, lastCountId:countId, lastComment:"Conteo exacto pendiente de aprobación jefe logístico.", createdAt:nowTS(), createdByUid:state.user.uid, createdByEmail:state.user.email, history:[historyEntry("conteo_exacto", "Pendiente aprobación jefe logístico.")] });
}
async function createPersistentCase(task, countId, diff, systemQty){
  await addDoc(collection(db, "cases"), { materialRef:task.materialRef, materialId:task.materialId, description:task.description || "", location:task.location || "", status:"pending_jefe_logistico", type:task.taskType === "cable_metraje" ? "diferencia_metraje_cable" : "diferencia_persistente", diff, systemQty, sourceTaskId:task.id, lastCountId:countId, lastComment:"Diferencia persistente. Requiere validación jefe logístico.", createdAt:nowTS(), createdByUid:state.user.uid, createdByEmail:state.user.email, history:[historyEntry("diferencia_persistente", $("#countObs").value || "")] });
}
async function createRecountTask(task){
  const recountId = `REC-${todayISO()}-${safeId(task.materialRef)}-${Date.now()}`;
  await setDoc(doc(db, "countTasks", recountId), { ...makeTask({ ref:task.materialRef, id:task.materialId, description:task.description, location:task.location, band:task.band, frequency:task.frequency, stockSystem:task.systemQty, score:0 }, { scheduledDate:todayISO(), taskType:"recount", status:"recount_required", recountRound:Number(task.recountRound || 0) + 1, priority:99999, origin:"diferencia" }) });
}
async function saveCaseCount(mode){
  const c = state.cases.find(x => x.id === $("#countCaseId").value);
  if(!c) return;
  const systemQty = num($("#countSystemQty").value), countedQty = num($("#countQty").value), diff = countedQty - systemQty;
  const entry = { at:new Date().toISOString(), by:state.user.email, role:role(), mode, systemQty, countedQty, diff, cause:$("#countCause").value || "N/A", support:$("#countSupport").value || "", comment:$("#countObs").value || "" };
  const countRef = await addDoc(collection(db, "counts"), { caseId:c.id, materialRef:c.materialRef, materialId:c.materialId, description:c.description || "", date:$("#countDate").value || todayISO(), systemQty, countedQty, diff, absDiff:Math.abs(diff), result:Math.abs(diff) > 0.0001 ? "Diferencia" : "Exacto", cause:entry.cause, support:entry.support, obs:entry.comment, countType: mode === "auditoria" ? "auditoria_independiente" : "jefe_verificacion", countedByRole:role(), countedByUid:state.user.uid, countedByEmail:state.user.email, createdAt:nowTS() });
  await updateDoc(doc(db, "cases", c.id), { lastCountId:countRef.id, lastComment:entry.comment || `Contabilización ${mode} registrada.`, lastSystemQty:systemQty, diff, updatedAt:nowTS(), history:arrayUnion(entry), ...(mode === "auditoria" ? { auditEntries:arrayUnion(entry) } : { jefeEntries:arrayUnion(entry) }) });
  $("#countDialog").close();
  toast("Contabilización agregada al informe del caso.");
  await refreshAll();
}

async function saveCount(e){
  e.preventDefault();

  if(!hasAny(["inventario", "jefe_logistico", "auditoria"])){
    toast("Tu usuario no tiene permiso para registrar conteos.", "error");
    return;
  }

  const taskId = $("#countTaskId").value;
  const caseId = $("#countCaseId").value;
  const mode = $("#countMode").value || "task";
  const date = $("#countDate").value || todayISO();
  const systemQty = num($("#countSystemQty").value);
  const countedQty = num($("#countQty").value);
  const diff = countedQty - systemQty;
  const absDiff = Math.abs(diff);
  const hasDiff = absDiff > 0.0001;
  const support = $("#countSupport").value || "";
  const cause = $("#countCause").value || "N/A";
  const obs = $("#countObs").value || "";

  if(taskId){
    const taskSnap = await getDoc(doc(db, "countTasks", taskId));
    if(!taskSnap.exists()){
      toast("La tarea ya no existe o no tienes permiso para verla.", "error");
      return;
    }

    const task = { id:taskSnap.id, ...taskSnap.data() };
    const isCable = task.taskType === "cable_metraje" || task.type === "cable_metraje";

    const countRef = await addDoc(collection(db, "counts"), {
      taskId:task.id,
      taskType:task.taskType || task.type || "general",
      materialRef:task.materialRef,
      materialId:task.materialId || safeId(task.materialRef),
      description:task.description || "",
      location:task.location || "",
      band:task.band || "",
      date,
      systemQty,
      countedQty,
      diff,
      absDiff,
      result:hasDiff ? "Diferencia" : "Exacto",
      cause,
      support,
      obs,
      countedByUid:state.user.uid,
      countedByEmail:state.user.email,
      countedByRole:role(),
      createdAt:nowTS()
    });

    if(!hasDiff){
      await updateDoc(doc(db, "countTasks", task.id), {
        status:"pending_jefe_approval",
        lastCountId:countRef.id,
        updatedAt:nowTS(),
        lastComment:isCable ? "Metraje exacto pendiente de aprobación." : "Conteo exacto pendiente de aprobación."
      });

      await addDoc(collection(db, "cases"), {
        materialRef:task.materialRef,
        materialId:task.materialId || safeId(task.materialRef),
        description:task.description || "",
        location:task.location || "",
        status:"pending_jefe_approval",
        type:isCable ? "aprobacion_metraje_exacto" : "aprobacion_conteo_exacto",
        diff:0,
        sourceTaskId:task.id,
        lastCountId:countRef.id,
        lastComment:isCable ? "Metraje exacto pendiente de aprobación jefe logístico." : "Conteo exacto pendiente de aprobación jefe logístico.",
        createdAt:nowTS(),
        createdByUid:state.user.uid,
        createdByEmail:state.user.email,
        history:[historyEntry(isCable ? "metraje_exacto" : "conteo_exacto", "Pendiente aprobación jefe logístico.")]
      });

      toast(isCable ? "Metraje guardado. Pendiente aprobación del jefe logístico." : "Conteo guardado. Pendiente aprobación del jefe logístico.");
    }else{
      if(Number(task.recountRound || 0) < 1){
        const recountId = `${isCable ? "METERREC" : "REC"}-${todayISO()}-${safeId(task.materialRef)}-${Date.now()}`;

        await setDoc(doc(db, "countTasks", recountId), {
          ...task,
          status:"recount_required",
          type:isCable ? "reconteo_metraje" : "reconteo_inventario",
          taskType:isCable ? "cable_metraje" : "reconteo_inventario",
          recountRound:Number(task.recountRound || 0) + 1,
          scheduledDate:todayISO(),
          priority:120000,
          origin:isCable ? "reconteo_metraje_por_diferencia" : "reconteo_por_diferencia",
          createdAt:nowTS(),
          createdByUid:state.user.uid,
          createdByEmail:state.user.email,
          previousTaskId:task.id,
          previousCountId:countRef.id
        });

        await updateDoc(doc(db, "countTasks", task.id), {
          status:"closed_with_difference_recount_created",
          lastCountId:countRef.id,
          updatedAt:nowTS(),
          lastComment:"Diferencia detectada. Se generó reconteo obligatorio."
        });

        toast("Se detectó diferencia. Se generó reconteo obligatorio.");
      }else{
        await updateDoc(doc(db, "countTasks", task.id), {
          status:"pending_jefe_logistico",
          lastCountId:countRef.id,
          updatedAt:nowTS(),
          lastComment:"Diferencia persistente. Pasa a jefe logístico."
        });

        await addDoc(collection(db, "cases"), {
          materialRef:task.materialRef,
          materialId:task.materialId || safeId(task.materialRef),
          description:task.description || "",
          location:task.location || "",
          status:"pending_jefe_logistico",
          type:isCable ? "diferencia_persistente_metraje" : "diferencia_persistente_inventario",
          diff,
          sourceTaskId:task.id,
          lastCountId:countRef.id,
          lastComment:"La diferencia persistió en reconteo. Requiere validación del jefe logístico.",
          createdAt:nowTS(),
          createdByUid:state.user.uid,
          createdByEmail:state.user.email,
          history:[historyEntry("diferencia_persistente", obs || "Diferencia persistente.")]
        });

        toast("Diferencia persistente. Caso enviado al jefe logístico.");
      }
    }
  }else if(caseId){
    const caseRef = doc(db, "cases", caseId);
    const caseSnap = await getDoc(caseRef);
    if(!caseSnap.exists()){
      toast("El caso ya no existe o no tienes permiso para verlo.", "error");
      return;
    }

    const c = { id:caseSnap.id, ...caseSnap.data() };
    const countRef = await addDoc(collection(db, "counts"), {
      caseId:c.id,
      taskType:mode === "auditoria" ? "conteo_auditoria" : "conteo_jefe_logistico",
      materialRef:c.materialRef,
      materialId:c.materialId || safeId(c.materialRef),
      description:c.description || "",
      location:c.location || "",
      date,
      systemQty,
      countedQty,
      diff,
      absDiff,
      result:hasDiff ? "Diferencia" : "Exacto",
      cause,
      support,
      obs,
      countedByUid:state.user.uid,
      countedByEmail:state.user.email,
      countedByRole:role(),
      createdAt:nowTS()
    });

    await updateDoc(caseRef, {
      lastCountId:countRef.id,
      lastSystemQty:systemQty,
      lastCountedQty:countedQty,
      diff,
      lastComment:obs || (hasDiff ? "Se mantiene diferencia." : "Conteo exacto en verificación."),
      updatedAt:nowTS(),
      updatedByUid:state.user.uid,
      updatedByEmail:state.user.email,
      history:arrayUnion(historyEntry(mode === "auditoria" ? "conteo_auditoria" : "conteo_jefe_logistico", obs || `Resultado: ${hasDiff ? "Diferencia" : "Exacto"}`))
    });

    toast("Conteo del caso guardado.");
  }else{
    toast("No hay tarea o caso asociado al formulario.", "error");
    return;
  }

  $("#countDialog").close();
  await refreshAll();
}


function historyEntry(action, comment){ return { at:new Date().toISOString(), by:state.user?.email || "", role:role(), action, comment }; }
async function approveTask(taskId){
  if(!hasAny(["jefe_logistico"])) return toast("No tienes permiso.", "error");
  const taskSnap = await getDoc(doc(db, "countTasks", taskId)); if(!taskSnap.exists()) return;
  const task = { id:taskSnap.id, ...taskSnap.data() };
  const countSnap = task.lastCountId ? await getDoc(doc(db, "counts", task.lastCountId)) : null;
  const count = countSnap?.exists() ? countSnap.data() : null;
  const date = count?.date || todayISO();
  await closeTaskAndReschedule(task, date, "Aprobado por jefe logístico.");
  const caseSnap = await getDocs(query(collection(db, "cases"), where("sourceTaskId", "==", taskId), where("status", "==", "pending_jefe_approval"), limit(20)));
  const batch = writeBatch(db);
  caseSnap.docs.forEach(d => batch.update(d.ref, { status:"closed", finalDecision:"approved_by_jefe_logistico", closedAt:nowTS(), closedByUid:state.user.uid, closedByEmail:state.user.email, lastComment:"Aprobado por jefe logístico.", history:arrayUnion(historyEntry("aprobacion_jefe", "Aprobado por jefe logístico.")) }));
  await batch.commit();
  toast("Aprobado y reprogramado.");
  await refreshAll();
}
async function closeTaskAndReschedule(task, date, comment){
  const matRef = doc(db, "materials", task.materialId || safeId(task.materialRef));
  const batch = writeBatch(db);
  batch.update(doc(db, "countTasks", task.id), {
    status:"closed",
    closedAt:nowTS(),
    closedByUid:state.user.uid,
    closedByEmail:state.user.email,
    lastComment:comment
  });

  if(task.taskType === "cable_metraje"){
    batch.set(matRef, {
      lastCableCountDate:date,
      lastMeterCountDate:date,
      [meterFieldName()]:true,
      lastVerifiedDate:date,
      updatedAt:nowTS()
    }, { merge:true });
  }else{
    batch.set(matRef, {
      lastCountDate:date,
      lastVerifiedDate:date,
      [annualFieldName()]:true,
      updatedAt:nowTS()
    }, { merge:true });
  }

  await batch.commit();
}

function openCaseDialog(caseId, action){
  const c = state.cases.find(x => x.id === caseId); if(!c) return;
  $("#caseId").value = c.id; $("#caseAction").value = action; $("#caseComment").value = "";
  const labels = { close_justified:"Cerrar justificado", escalate_audit:"Enviar a auditoría", close_audit:"Cerrar auditoría", escalate_management:"Enviar a gerencia", approve_management:"Aprobar cierre gerencia", authorize_adjustment:"Autorizar ajuste" };
  $("#caseDialogTitle").textContent = labels[action] || "Gestionar caso";
  $("#caseDialogSubtitle").textContent = `${c.materialRef} · diferencia ${fmt(c.diff)}`;
  $("#caseDialog").showModal();
}
async function saveCaseAction(e){
  e.preventDefault();
  const caseId = $("#caseId").value, action = $("#caseAction").value, comment = $("#caseComment").value.trim(), c = state.cases.find(x => x.id === caseId);
  if(!c) return;
  const allowed = { close_justified:["jefe_logistico"], escalate_audit:["jefe_logistico"], close_audit:["auditoria"], escalate_management:["auditoria"], approve_management:["gerencia"], authorize_adjustment:["gerencia"] };
  if(!hasAny(allowed[action] || [])) return toast("Tu rol no permite esta acción.", "error");
  let status = c.status, finalDecision = "";
  if(action === "close_justified"){ status = "closed"; finalDecision = "closed_by_jefe_logistico"; }
  if(action === "escalate_audit"){ status = "pending_auditoria"; }
  if(action === "close_audit"){ status = "closed"; finalDecision = "closed_by_auditoria"; }
  if(action === "escalate_management"){ status = "pending_gerencia"; }
  if(action === "approve_management"){ status = "closed"; finalDecision = "approved_by_gerencia"; }
  if(action === "authorize_adjustment"){ status = "closed"; finalDecision = "adjustment_authorized_by_gerencia"; }
  await updateDoc(doc(db, "cases", caseId), { status, finalDecision, lastComment:comment, updatedAt:nowTS(), updatedByUid:state.user.uid, updatedByEmail:state.user.email, history:arrayUnion(historyEntry(action, comment)), ...(status === "closed" ? { closedAt:nowTS(), closedByUid:state.user.uid, closedByEmail:state.user.email } : {}) });
  if(status === "closed") await closeCaseMaterial(c, comment);
  $("#caseDialog").close();
  toast("Caso actualizado.");
  await refreshAll();
}
async function closeCaseMaterial(c, comment){
  const matRef = doc(db, "materials", c.materialId || safeId(c.materialRef));
  const snap = await getDoc(matRef); if(!snap.exists()) return;
  const mat = snap.data(), date = todayISO();
  await setDoc(matRef, { lastVerifiedDate:date, lastCountDate:mat.lastCountDate || date, nextDueDate:addActiveDays(date, Number(mat.frequency || 120)), lastCaseClosedComment:comment, updatedAt:nowTS() }, { merge:true });
}
function generateCaseReport(caseId){
  const c = state.cases.find(x => x.id === caseId); if(!c) return;
  const history = Array.isArray(c.history) ? c.history : [];
  const auditEntries = Array.isArray(c.auditEntries) ? c.auditEntries : [];
  const jefeEntries = Array.isArray(c.jefeEntries) ? c.jefeEntries : [];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Informe ${esc(c.materialRef)}</title><style>body{font-family:Century Gothic,Arial;padding:28px;color:#15352e}h1{color:#0b5d45}table{width:100%;border-collapse:collapse;margin-top:14px}td,th{border:1px solid #d7e5df;padding:8px;text-align:left}th{background:#edf6f2}.box{border:1px solid #d7e5df;padding:14px;border-radius:12px;margin:12px 0}</style></head><body><h1>Informe de diferencia de inventario</h1><div class="box"><b>Referencia:</b> ${esc(c.materialRef)}<br><b>Descripción:</b> ${esc(c.description || "")}<br><b>Ubicación:</b> ${esc(c.location || "")}<br><b>Estado:</b> ${esc(c.status)}<br><b>Diferencia:</b> ${fmt(c.diff)}</div><h2>Comentarios por referencia</h2><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Comentario</th></tr></thead><tbody>${history.map(h => `<tr><td>${esc(h.at || "")}</td><td>${esc(h.by || "")}</td><td>${esc(h.role || "")}</td><td>${esc(h.action || h.mode || "")}</td><td>${esc(h.comment || "")}</td></tr>`).join("")}</tbody></table><h2>Verificación jefe logístico</h2><table><thead><tr><th>Fecha</th><th>Sistema</th><th>Físico</th><th>Diferencia</th><th>Comentario</th></tr></thead><tbody>${jefeEntries.map(h => `<tr><td>${esc(h.at || "")}</td><td>${fmt(h.systemQty)}</td><td>${fmt(h.countedQty)}</td><td>${fmt(h.diff)}</td><td>${esc(h.comment || "")}</td></tr>`).join("")}</tbody></table><h2>Contabilización auditoría</h2><table><thead><tr><th>Fecha</th><th>Sistema</th><th>Físico</th><th>Diferencia</th><th>Comentario</th></tr></thead><tbody>${auditEntries.map(h => `<tr><td>${esc(h.at || "")}</td><td>${fmt(h.systemQty)}</td><td>${fmt(h.countedQty)}</td><td>${fmt(h.diff)}</td><td>${esc(h.comment || "")}</td></tr>`).join("")}</tbody></table><p>Generado por ${esc(state.user.email)} · ${new Date().toLocaleString("es-CO")}</p></body></html>`;
  const blob = new Blob([html], { type:"text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = `informe_inventario_${c.materialRef}_${todayISO()}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
}

function scheduleAutoSyncChecker(){
  if(state.autoTimer) clearInterval(state.autoTimer);
  if(!hasAny(["jefe_logistico"])) return;
  const check = async () => {
    const now = new Date();
    if(now.getHours() < Number(state.settings.autoSyncHour || 8)) return;
    const ref = doc(db, "syncState", "drive");
    const snap = await getDoc(ref);
    if(snap.exists() && snap.data().lastAutoSyncDate === todayISO()) return;
    try{
      logSync("Auto sync 8:00 a.m.: verificando. Si Drive no está conectado, no se abrirá ventana automática.");
      await syncFromDrive(true);
      await setDoc(ref, { lastAutoSyncDate:todayISO(), updatedAt:nowTS() }, { merge:true });
    }catch(err){
      logSync("Auto sync pendiente: primero presiona Conectar Drive. Motivo: " + (err.message || err));
      await ensureMandatoryDailyWork(false).catch(() => {});
    }
  };
  setTimeout(check, 2500);
  state.autoTimer = setInterval(check, 5 * 60 * 1000);
}


window.firebaseHealthCheck = async function firebaseHealthCheck(){
  const result = {
    authUser: auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email } : null,
    projectId: firebaseConfig.projectId,
    profile: null,
    settingsReadable: false,
    materialsReadable: false,
    tasksReadable: false,
    errors: []
  };

  try{
    if(auth.currentUser){
      const profileSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
      result.profile = profileSnap.exists() ? profileSnap.data() : null;
    }
  }catch(err){ result.errors.push(["users/{uid}", err.message || String(err)]); }

  try{
    await getDoc(doc(db, "settings", "inventory"));
    result.settingsReadable = true;
  }catch(err){ result.errors.push(["settings/inventory", err.message || String(err)]); }

  try{
    await getDocs(query(collection(db, "materials"), limit(1)));
    result.materialsReadable = true;
  }catch(err){ result.errors.push(["materials", err.message || String(err)]); }

  try{
    await getDocs(query(collection(db, "countTasks"), limit(1)));
    result.tasksReadable = true;
  }catch(err){ result.errors.push(["countTasks", err.message || String(err)]); }

  console.table(result);
  console.log("Firebase Health Check:", result);
  return result;
};


init();
async function forceCableMeterTasks(showToast = true){
  if(!hasAny(["jefe_logistico"])){
    if(showToast) toast("Solo super admin o jefe logístico pueden generar metraje.", "error");
    return;
  }

  const today = todayISO();
  await loadMaterials();

  const stateRef = doc(db, "syncState", "cable_metraje");
  const stateSnap = await getDoc(stateRef);
  const lastSessionDate = stateSnap.exists() ? (stateSnap.data().lastSessionDate || "") : "";
  const nextSession = nextCableSessionDateFrom(lastSessionDate);

  // Si ya hay metrajes abiertos, no bloquea: el operario debe terminarlos.
  const openSnap = await getDocs(query(collection(db, "countTasks"), where("status", "in", ["assigned","pending_inventory","recount_required","pending_jefe_approval","pending_jefe_logistico"]), limit(1500)));
  const openCableTasks = openSnap.docs.map(d => ({ id:d.id, ...d.data() })).filter(t => t.taskType === "cable_metraje");
  const openCableRefs = new Set(openCableTasks.map(t => t.materialRef));

  if(openCableTasks.length === 0 && lastSessionDate && today < nextSession){
    logSync(`Metraje bloqueado. Próxima sesión: ${nextSession}.`);
    if(showToast) toast(`Metraje bloqueado. Próxima sesión: ${nextSession}.`);
    return;
  }

  const year = yearOf(today);
  const allCables = state.materials.filter(m => m.active !== false && (m.isCable || isCableMaterial(m)));
  const pendingYear = allCables.filter(m => !wasMeterCountedThisYear(m));
  const matured = pendingYear.filter(m => {
    const base = m.lastMovementDate || m.firstSeenDate || "";
    if(!base) return true;
    return diffDays(base, today) >= Number(state.settings.cableCooldownDays || state.settings.cableMeterMaturationDays || 15);
  }).filter(m => !openCableRefs.has(m.ref));

  const remainingSessions = countCableSessionsRemaining(today);
  const target = Math.max(1, Math.ceil(pendingYear.length / remainingSessions));

  if(!allCables.length){
    logSync("No se identificaron cables desde SIESA.");
    if(showToast) toast("No se identificaron cables desde SIESA.", "error");
    return;
  }

  if(!matured.length){
    logSync("No hay cables maduros pendientes. No se repite metraje hasta completar condiciones.");
    if(showToast) toast("No hay cables maduros pendientes para metraje.", "error");
    return;
  }

  // Metraje: aleatorio puro, sin criticidad ni Pareto.
  const selected = [...matured]
    .map(m => ({ item:m, r:hash(`METRAJE-${year}-${today}-${m.ref}`) }))
    .sort((a,b) => b.r - a.r)
    .slice(0, target)
    .map(x => x.item);

  const tasks = selected.map((m, idx) => ({
    id:`METER-${today}-${safeId(m.ref)}`,
    data:makeTask(m, {
      scheduledDate:today,
      taskType:"cable_metraje",
      type:"cable_metraje",
      status:"assigned",
      priority:100000 - idx,
      origin:"metraje_anual_15_dias"
    })
  }));

  await batchSet("countTasks", tasks);
  await setDoc(stateRef, {
    lastSessionDate:today,
    nextSessionDate:addDays(today, Number(state.settings.cablePeriodDays || state.settings.cableMeterDays || 15)),
    updatedAt:nowTS()
  }, { merge:true });

  logSync(`Metraje creado: ${tasks.length}. Cables pendientes del año: ${pendingYear.length}. Sesiones restantes: ${remainingSessions}. Método: aleatorio puro cada 15 días.`);
  if(showToast) toast(`Metraje creado: ${tasks.length}`);
}


