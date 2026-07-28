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
  arrayUnion,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const mainApp = initializeApp(firebaseConfig);
const secondaryApp = initializeApp(firebaseConfig, "secondary-user-creator");
analyticsSupported().then(ok => { if (ok) getAnalytics(mainApp); }).catch(() => {});

const auth = getAuth(mainApp);
const secondaryAuth = getAuth(secondaryApp);
const db = getFirestore(mainApp);
enableIndexedDbPersistence(db).catch(err => console.warn("Persistencia offline Firestore no disponible:", err?.code || err?.message || err));

const state = {
  user: null,
  profile: null,
  settings: structuredClone(defaultSettings),
  driveToken: null,
  driveTokenClient: null,
  driveTokenExpiresAt: 0,
  driveAuthPromise: null,
  localExcelFile: null,
  localExcelMeta: null,
  syncRunning: false,
  users: [],
  materials: [],
  tasks: [],
  cases: [],
  syncLogs: [],
  counts: [],
  referenceMemory: [],
  referenceMemoryV2: [],
  historyControl: null,
  cableSession: null,
  activeView: "dashboardView",
  autoTimer: null,
  deferredInstallPrompt: null,
  audioCtx: null,
  notificationsEnabled: localStorage.getItem("inventarioAlertsEnabled") === "1",
  lineCatalog: { materials:{}, lines:[], totals:{}, cableLineNames:[] },
  express: {
    selectedTaskId: localStorage.getItem("expressSelectedTaskId") || "",
    selectedLocation: "",
    selectedRef: "",
    scanMode: "",
    scanStream: null,
    scanTimer: null,
    countStartedAt: "",
    saveNextRequested: false
  },
  offlineQueue: JSON.parse(localStorage.getItem("inventarioOfflineCountQueue") || "[]"),
  labelQueue: JSON.parse(localStorage.getItem("inventarioLabelQueueV34") || localStorage.getItem("inventarioLabelQueueV33") || localStorage.getItem("inventarioLabelQueueV32") || localStorage.getItem("inventarioLabelQueueV31") || "[]")
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
  inventario: "Auxiliar de inventario",
  jefe_logistico: "Jefe logístico",
  auditoria: "Auditoría interna",
  gerencia: "Gerencia"
};

const VIEW_ACCESS = {
  dashboardView: ["super_admin", "jefe_logistico", "auditoria", "gerencia"],
  expressView: ["super_admin", "inventario"],
  usersView: ["super_admin"],
  driveView: ["super_admin", "jefe_logistico"],
  inventoryView: ["super_admin", "inventario"],
  historyView: ["super_admin", "inventario"],
  cableView: ["super_admin", "jefe_logistico"],
  jefeView: ["super_admin", "jefe_logistico"],
  auditoriaView: ["super_admin", "auditoria"],
  gerenciaView: ["super_admin", "gerencia"],
  materialsView: ["super_admin", "jefe_logistico", "auditoria", "gerencia"],
  qrLabelsView: ["super_admin", "jefe_logistico", "inventario"],
  lineCatalogView: ["super_admin", "jefe_logistico"],
  indicatorsView: ["super_admin", "jefe_logistico", "auditoria", "gerencia"],
  configView: ["super_admin", "jefe_logistico"]
};

const aliases = {
  ref:["referencia item","referencia","material","codigo","código","codigomaterial","codigo material","articulo","artículo","sku","ref"],
  desc:["nombre item","descripcion","descripción","desc item","desc. item","descitem","texto breve","nombre","producto","denominacion","denominación","detalle","descripcion item","descripción item","nombre material","nom item","descripcion larga","descripción larga","item","desc"],
  category:["desc_item1 item","desc_item2 item","desc_item3 item","desc_item4 item","desc_item5 item","categoria","categoría","grupo","familia","linea","línea","clase"],
  location:["ubicacion","ubicación","nombre ubicacion","nombre ubicación","almacen","almacén","bodega","localizacion","localización","posicion","posición","estante"],
  unit:["unidad_inventario item","unidad inventario","unidad","um","umb","unidad medida","unidad de medida"],
  stock:["cantidad_existencia_1","cantidad existencia","existencia","existencias","stock","cantidad","saldo","disponible","libre utilizacion","libre utilización","inventario"],
  cost:["costo_prom_uni","costo prom uni","costo promedio unitario","costo","costo unitario","valor unitario","valor unidad","precio","precio unitario","vlr unitario","costounitario","valorunitario","costopromedio","costo promedio"],
  totalValue:["costo_prom_tot","ultimo_costo_tot","valor total","costo total","valor inventario","vlr total","valor parcial","valor existencia","valor stock","total"],
  lastMove:["fecha_ult_salida","fecha_ult_entrada","fecha_ult_venta","fecha_ult_compra","fecha movimiento","fecha ultimo movimiento","fecha último movimiento","fecha ingreso","fecha salida"],
  movement:["consumo_promedio","fecha_ult_consumo_prom","abc_rotacion_veces","salidas","salida","movimiento","consumo","demanda","rotacion","rotación"]
};

const INVENTORY_HISTORY_VERSION = "local_excel_v2";
const INVENTORY_HISTORY_COLLECTION = "referenceMemoryV2";
const INVENTORY_HISTORY_CONTROL_DOC = "inventoryHistoryControl";


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

function isCableMaterial(material){
  if(material?.isCable === true) return true;
  const cat = catalogMaterial(material?.ref);
  if(cat?.isCable) return true;
  const line = norm(material?.catalogLine || material?.category || "");
  const cableLines = new Set((state.lineCatalog?.cableLineNames || []).map(norm));
  if(line && cableLines.has(line)) return true;
  const text = norm([material?.ref, material?.description, material?.category, material?.unit].join(" "));
  const unit = norm(material?.unit || "");
  const isMeterUnit = ["m","mt","mts","metro","metros"].includes(unit);
  const keywords = state.settings?.cableKeywords?.length ? state.settings.cableKeywords : ["cable","conductor","alambre","thhn","thw","awg","mcm","acsr","xlpe","lsfh","lshf","encauchetado","duplex","triplex","cuadruplex","utp","ftp","fibra","coaxial","soldador","retenida"];
  const hasStrongKeyword = keywords.some(k => text.includes(norm(k)));
  return Boolean(hasStrongKeyword && (isMeterUnit || text.includes("cable") || text.includes("conductor") || text.includes("alambre")));
}

function nextMeterSessionDate(){
  const today = todayISO();
  const period = Math.max(1, Number(state.settings?.cablePeriodDays || state.settings?.cableMeterDays || 15));
  const start = `${yearOf(today)}-01-01`;
  let d = start;
  let guard = 0;
  while(d < today && guard < 400){
    d = addDays(d, period);
    guard++;
  }
  return d;
}

function isMeterSessionOpen(){
  const today = todayISO();
  if(!state.lastCableSession?.nextSessionDate && !state.lastCableSession?.lastSessionDate){
    return today >= nextMeterSessionDate();
  }
  const last = state.lastCableSession?.lastSessionDate || "";
  const next = state.lastCableSession?.nextSessionDate || nextCableSessionDateFrom(last);
  return today >= next;
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
  if(material?.resetCountingCycle === true && material?.countCycleDate === todayISO()){
    return material[annualFieldName()] === true;
  }
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
function normalizeRole(rawRole){
  const key = String(rawRole || "inventario")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
  const aliases = {
    admin:"super_admin", administrador:"super_admin", superadmin:"super_admin", super_admin:"super_admin",
    inventario:"inventario", inventory:"inventario", auxiliar:"inventario", auxiliar_inventario:"inventario", auxiliar_de_inventario:"inventario", operario:"inventario", operador:"inventario", bodega:"inventario", almacen:"inventario", almacenista:"inventario",
    jefe:"jefe_logistico", jefe_logistico:"jefe_logistico", lider_logistico:"jefe_logistico", logistica:"jefe_logistico", logistico:"jefe_logistico",
    auditor:"auditoria", auditoria:"auditoria", auditoria_interna:"auditoria",
    gerente:"gerencia", gerencia:"gerencia"
  };
  return aliases[key] || key || "inventario";
}
function role(){ return normalizeRole(state.profile?.role); }
function isSuper(){ return role() === "super_admin"; }
function hasAny(roles){ return isSuper() || roles.includes(role()); }
function isOperatorRole(){ return role() === "inventario"; }
function formatDateTime(v){
  try{ if(v?.toDate) return v.toDate().toLocaleString("es-CO"); }catch(e){}
  return v ? String(v) : "—";
}
function groupBy(arr, fn){
  return arr.reduce((acc, item) => { const k = fn(item); (acc[k] ||= []).push(item); return acc; }, {});
}

async function init(){
  try{
    registerPWAFeatures();
    setupResponsiveMode();
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
      await loadLineCatalog();
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
  $("#connectDriveBtn")?.addEventListener("click", () => selectSiesaFile());
  $("#connectDriveBtn2")?.addEventListener("click", () => selectSiesaFile());
  $("#quickSyncBtn")?.addEventListener("click", () => { setView("driveView"); selectSiesaFile(); });
  $("#syncDriveBtn")?.addEventListener("click", () => syncFromLocalExcel(false));
  $("#siesaFileInput")?.addEventListener("change", handleSiesaFileSelected);
  $("#generateTodayBtn").addEventListener("click", () => forceMandatoryDailyTasks(true));
  $("#generateCableBtn").addEventListener("click", () => forceCableMeterTasks(true));
  $("#generateCableBtn2").addEventListener("click", () => forceCableMeterTasks(true));
  $("#createUserForm").addEventListener("submit", createUserFromAdmin);
  $("#refreshUsersBtn").addEventListener("click", loadAndRenderUsers);
  ["#taskSearch", "#taskFilter"].forEach(sel => $(sel).addEventListener("input", renderTasks));
  ["#expressLocationInput", "#expressRefInput", "#expressTaskTypeFilter"].forEach(sel => $(sel)?.addEventListener("input", renderExpress));
  $("#clearExpressFiltersBtn")?.addEventListener("click", clearExpressFilters);
  $("#scanLocationBtn")?.addEventListener("click", () => openScanner("location"));
  $("#scanRefBtn")?.addEventListener("click", () => openScanner("ref"));
  $("#closeScannerDialog")?.addEventListener("click", closeScanner);
  $("#manualScanApplyBtn")?.addEventListener("click", applyManualScanValue);
  ["#qrSearch", "#qrType", "#qrLimit", "#qrLabelSize"].forEach(sel => $(sel)?.addEventListener("input", renderQrLabels));
  ["#quickQrKind", "#quickQrRef", "#quickQrDescription", "#quickQrLocation", "#quickQrUnit"].forEach(sel => $(sel)?.addEventListener("input", renderQuickLabelDraft));
  $("#createQuickLabelBtn")?.addEventListener("click", createQuickLabelFromForm);
  $("#printQuickLabelBtn")?.addEventListener("click", printLabelQueue);
  $("#clearLabelQueueBtn")?.addEventListener("click", clearLabelQueue);
  $("#printQrLabelsBtn")?.addEventListener("click", printQrLabels);
  $("#printAllQrLabelsBtn")?.addEventListener("click", printAllQrLabels);
  $("#loadDailyLabelsBtn")?.addEventListener("click", loadDailyTaskLabels);
  $("#printDailyLabelsBtn")?.addEventListener("click", printDailyTaskLabels);
  $$('[data-qty-step]').forEach(btn => btn.addEventListener("click", () => bumpCountQty(Number(btn.dataset.qtyStep || 0))));
  $$('[data-qty-clear]').forEach(btn => btn.addEventListener("click", clearCountQty));
  window.addEventListener("online", () => { updateOfflineStatus(); flushOfflineCountQueue(); });
  window.addEventListener("offline", updateOfflineStatus);
  ["#materialSearch", "#materialBandFilter", "#materialCableFilter"].forEach(sel => $(sel)?.addEventListener("input", renderMaterials));
  ["#lineSearch", "#lineCableFilter"].forEach(sel => $(sel)?.addEventListener("input", renderLineCatalog));
  $("#saveSettingsBtn").addEventListener("click", saveSettingsFromUI);
  $("#closeCountDialog").addEventListener("click", () => $("#countDialog").close());
  $("#cancelCountBtn").addEventListener("click", () => $("#countDialog").close());
  $("#countForm").addEventListener("submit", saveCount);
  ["#countQty", "#countSystemQty", "#countCause"].forEach(sel => $(sel)?.addEventListener("input", updateCountPreview));
  $("#closeCaseDialog").addEventListener("click", () => $("#caseDialog").close());
  $("#cancelCaseBtn").addEventListener("click", () => $("#caseDialog").close());
  $("#caseActionForm").addEventListener("submit", saveCaseAction);
  $("#installAppBtn")?.addEventListener("click", installApp);
  $("#closeInstallDialog")?.addEventListener("click", () => $("#installDialog")?.close());
  $("#enableAlertsBtn")?.addEventListener("click", enableAlerts);
  $("#copyrightBtn")?.addEventListener("click", () => $("#copyrightDialog").showModal());
  $("#closeCopyrightDialog")?.addEventListener("click", () => $("#copyrightDialog").close());
}

function setupResponsiveMode(){
  applyResponsiveMode();
  window.addEventListener("resize", applyResponsiveMode, { passive:true });
  window.addEventListener("orientationchange", () => setTimeout(applyResponsiveMode, 150), { passive:true });
}
function applyResponsiveMode(){
  const root = document.documentElement;
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  const dpr = window.devicePixelRatio || 1;
  const compact = width <= 760 || height <= 760;
  const ultraCompact = width <= 430 || height <= 620;
  const lowResolution = compact || (dpr <= 1.1 && (width <= 960 || height <= 820));
  root.classList.toggle("auto-compact", compact);
  root.classList.toggle("auto-ultra-compact", ultraCompact);
  root.classList.toggle("auto-low-res", lowResolution);
  root.classList.toggle("auto-wide", width > 760 && height > 760);
  root.style.setProperty("--vh", `${height * 0.01}px`);
  root.dataset.viewportMode = ultraCompact ? "ultra" : compact ? "compact" : "wide";
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

async function loadLineCatalog(){
  try{
    const res = await fetch("./lineas_catalog.json", { cache:"no-store" });
    if(!res.ok) throw new Error(`lineas_catalog.json respondió ${res.status}`);
    state.lineCatalog = await res.json();
    console.info("Catálogo de líneas cargado", state.lineCatalog?.totals || {});
  }catch(err){
    console.warn("No se pudo cargar lineas_catalog.json. Se usará clasificación por palabras clave.", err);
    state.lineCatalog = { materials:{}, lines:[], totals:{}, cableLineNames:[] };
  }
}
function catalogMaterial(ref){
  const key = String(ref || "").trim();
  if(!key) return null;
  return state.lineCatalog?.materials?.[key] || state.lineCatalog?.materials?.[key.replace(/^0+/,"")] || null;
}
function enrichMaterialFromCatalog(base){
  const cat = catalogMaterial(base.ref);
  if(!cat) return { ...base, catalogFound:false };
  return {
    ...base,
    description: base.description || cat.description || "",
    category: base.category || cat.line || "",
    unit: base.unit || cat.unit || "",
    catalogLine: cat.line || "",
    catalogFound: true,
    cableReason: cat.cableReason || base.cableReason || "",
    isCable: Boolean(base.isCable || cat.isCable)
  };
}
function materialMetaByRef(ref){
  const exact = materialByRef(ref);
  const cat = catalogMaterial(ref);
  if(exact || cat) return { ...(cat || {}), ...(exact || {}) };
  const key = norm(ref);
  return state.materials.find(m => norm(m.ref) === key || norm(m.ref).replace(/^0+/, "") === key.replace(/^0+/, "")) || {};
}
function displayMeta(item = {}){
  const m = materialMetaByRef(item.materialRef || item.ref || item.materialId || "");
  const cat = catalogMaterial(item.materialRef || item.ref || "") || {};
  const ref = item.materialRef || item.ref || m.ref || "";
  const description = item.description || m.description || cat.description || "Referencia sin nombre cargado";
  const line = item.catalogLine || item.category || m.catalogLine || m.category || cat.line || "";
  const location = item.location || m.location || "";
  const unit = item.unit || m.unit || cat.unit || (item.taskType === "cable_metraje" ? "m" : "und");
  const systemQty = Number(item.systemQty ?? m.stockSystem ?? item.stockSystem ?? 0);
  const unitCost = Number(item.unitCost ?? m.unitCost ?? 0);
  const inventoryValue = Number(item.inventoryValue ?? m.inventoryValue ?? (systemQty * unitCost) ?? 0);
  return { ref, description, line, location, unit, systemQty, unitCost, inventoryValue, isCable:Boolean(item.isCable || m.isCable || cat.isCable) };
}
function taskLabel(item = {}){
  const meta = displayMeta(item);
  return `${meta.ref}${meta.description ? " · " + meta.description : ""}`;
}

function defaultInventoryHistoryControl(){
  return {
    mode:"draft",
    historyStatus:"draft",
    methodVersion:INVENTORY_HISTORY_VERSION,
    draftStartedDate:todayISO(),
    officialStartedDate:"",
    isPersisted:false,
    updatedAtLocal:new Date().toISOString()
  };
}
function normalizeInventoryHistoryControl(data = {}){
  const mode = data.mode === "official" ? "official" : "draft";
  return {
    ...defaultInventoryHistoryControl(),
    ...data,
    mode,
    historyStatus:mode === "official" ? "official" : "draft",
    methodVersion:data.methodVersion || INVENTORY_HISTORY_VERSION,
    draftStartedDate:data.draftStartedDate || data.startedDate || todayISO(),
    officialStartedDate:mode === "official" ? (data.officialStartedDate || data.startedDate || todayISO()) : (data.officialStartedDate || ""),
    isPersisted:data.isPersisted === true
  };
}
function currentHistoryControl(){
  state.historyControl = normalizeInventoryHistoryControl(state.historyControl || {});
  return state.historyControl;
}
function isOfficialHistoryActive(control = currentHistoryControl()){
  return control.mode === "official" && Boolean(control.officialStartedDate);
}
function historyStartDate(control = currentHistoryControl()){
  return isOfficialHistoryActive(control) ? control.officialStartedDate : control.draftStartedDate;
}
function isReferenceMemoryV2(memory = {}){
  return memory.methodVersion === INVENTORY_HISTORY_VERSION || memory.historyCollection === INVENTORY_HISTORY_COLLECTION || memory.historyOrigin === "local_excel_upload";
}
function isRelevantHistoryMemory(memory = {}, control = currentHistoryControl()){
  const date = String(memory.lastCountDate || memory.lastVerifiedDate || "").slice(0,10);
  if(!date) return false;
  const start = historyStartDate(control);
  if(start && date < start) return false;
  if(memory.methodVersion && memory.methodVersion !== INVENTORY_HISTORY_VERSION) return false;
  return true;
}
async function loadInventoryHistoryControl(){
  try{
    const snap = await getDoc(doc(db, "syncState", INVENTORY_HISTORY_CONTROL_DOC));
    state.historyControl = normalizeInventoryHistoryControl(snap.exists() ? { ...snap.data(), isPersisted:true } : { isPersisted:false });
  }catch(err){
    console.warn("No se pudo leer control de histórico nuevo", err);
    state.historyControl = defaultInventoryHistoryControl();
  }
  return state.historyControl;
}
async function ensureInventoryHistoryControl(){
  let control = state.historyControl ? normalizeInventoryHistoryControl(state.historyControl) : null;
  if(!control || control.isPersisted !== true){
    try{
      const ref = doc(db, "syncState", INVENTORY_HISTORY_CONTROL_DOC);
      const snap = await getDoc(ref);
      if(snap.exists()){
        control = normalizeInventoryHistoryControl({ ...snap.data(), isPersisted:true });
      }else{
        control = defaultInventoryHistoryControl();
        await setDoc(ref, {
          ...control,
          isPersisted:true,
          createdAt:nowTS(),
          createdByUid:state.user?.uid || "",
          createdByEmail:state.user?.email || "",
          updatedAt:nowTS()
        }, { merge:true });
        control = normalizeInventoryHistoryControl({ ...control, isPersisted:true });
      }
    }catch(err){
      console.warn("No se pudo crear control de histórico nuevo. Se usará modo borrador local.", err);
      control = defaultInventoryHistoryControl();
    }
  }
  state.historyControl = control;
  return control;
}
async function loadReferenceMemoryV2Map(control = currentHistoryControl()){
  try{
    const snap = await getDocs(query(collection(db, INVENTORY_HISTORY_COLLECTION), limit(8000)));
    state.referenceMemoryV2 = snap.docs.map(d => ({ id:d.id, ...d.data(), historyCollection:INVENTORY_HISTORY_COLLECTION }));
  }catch(err){
    console.warn("No se pudo leer referenceMemoryV2. La app continuará sin histórico nuevo.", err);
    state.referenceMemoryV2 = [];
  }
  const map = new Map();
  state.referenceMemoryV2
    .filter(m => isRelevantHistoryMemory(m, control))
    .forEach(m => {
      const k = norm(m.ref || m.materialRef || m.id || "");
      if(k) map.set(k, m);
    });
  return map;
}
function memoryV2ByRef(ref){
  const key = norm(ref);
  return state.referenceMemoryV2.find(m => norm(m.ref || m.materialRef) === key || norm(m.ref || m.materialRef).replace(/^0+/, "") === key.replace(/^0+/, "")) || null;
}
function preferredMemoryForMaterial(material, legacyMap, v2Map, control = currentHistoryControl()){
  const key = norm(material.ref || material.materialRef || "");
  const keyNoZero = key.replace(/^0+/, "");
  const v2 = v2Map?.get(key) || state.referenceMemoryV2.find(m => norm(m.ref || m.materialRef).replace(/^0+/, "") === keyNoZero);
  if(v2 && isRelevantHistoryMemory(v2, control)) return v2;
  if(material?.resetCountingCycle === true) return null;
  return legacyMap?.get(key) || state.referenceMemory.find(m => norm(m.ref || m.materialRef).replace(/^0+/, "") === keyNoZero) || null;
}

function memoryByRef(ref){
  const key = norm(ref);
  return state.referenceMemory.find(m => norm(m.ref || m.materialRef) === key || norm(m.ref || m.materialRef).replace(/^0+/, "") === key.replace(/^0+/, "")) || null;
}
function mergeReferenceMemory(material, memory){
  if(!memory) return material;
  const cycleReset = material?.resetCountingCycle === true && material?.countCycleDate === todayISO();
  const allowHistoryInReset = isReferenceMemoryV2(memory);
  return {
    ...material,
    referenceCode: material.referenceCode || memory.referenceCode || inventoryCode("material", material.ref),
    lastCountDate: cycleReset && !allowHistoryInReset ? (material.lastCountDate || "") : (material.lastCountDate || memory.lastCountDate || ""),
    lastVerifiedDate: cycleReset && !allowHistoryInReset ? (material.lastVerifiedDate || "") : (material.lastVerifiedDate || memory.lastVerifiedDate || memory.lastCountDate || ""),
    lastCableCountDate: material.lastCableCountDate || memory.lastCableCountDate || "",
    lastMeterCountDate: material.lastMeterCountDate || memory.lastMeterCountDate || "",
    lastCountedQty: memory.lastCountedQty ?? material.lastCountedQty ?? null,
    lastCountSystemQty: memory.lastSystemQty ?? material.lastCountSystemQty ?? null,
    lastCountDiff: memory.lastDiff ?? material.lastCountDiff ?? null,
    lastCountDiffValue: memory.lastDiffValue ?? material.lastCountDiffValue ?? null,
    lastCountResult: memory.lastResult || material.lastCountResult || "",
    lastCountSeverity: memory.lastSeverity || material.lastCountSeverity || "",
    lastCountCause: memory.lastCause || material.lastCountCause || "",
    lastCountedBy: memory.lastCountedBy || material.lastCountedBy || "",
    lastCountDurationSeconds: memory.lastDurationSeconds ?? material.lastCountDurationSeconds ?? 0,
    memoryUpdatedAt: memory.updatedAt || material.memoryUpdatedAt || "",
    memorySource: memory.source || material.memorySource || (allowHistoryInReset ? INVENTORY_HISTORY_COLLECTION : "referenceMemory"),
    historyMode:memory.historyMode || material.historyMode || currentHistoryControl().mode,
    historyStatus:memory.historyStatus || material.historyStatus || currentHistoryControl().historyStatus,
    historyVersion:memory.methodVersion || material.historyVersion || INVENTORY_HISTORY_VERSION
  };
}

async function refreshAll(){
  state.initWarnings = [];
  await safeLoad("syncState/inventoryHistoryControl", loadInventoryHistoryControl);
  await safeLoad("materials", loadMaterials);
  await safeLoad("countTasks", loadTasks);
  await safeLoad("cases", loadCases);
  await safeLoad("syncLogs", loadSyncLogs);
  await safeLoad("counts", loadRecentCounts);
  await safeLoad("syncState/cable_metraje", loadCableSessionState);
  if(isSuper()) await safeLoad("users", loadUsers);
  renderAll();
  notifyPendingWork("refresh");

  if(state.initWarnings.length){
    console.warn("La app inició con advertencias:", state.initWarnings);
    const msg = state.initWarnings.map(w => `${w.label}: ${w.message}`).join(" | ");
    toast("La app inició con advertencias. Revisa consola.", "error");
    console.warn(msg);
  }
}

async function loadMaterials(){
  const snap = await getDocs(query(collection(db, "materials"), limit(7000)));
  const materials = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  const control = state.historyControl || await loadInventoryHistoryControl();
  const v2Map = await loadReferenceMemoryV2Map(control);
  let legacyMap = new Map();
  try{
    const memSnap = await getDocs(query(collection(db, "referenceMemory"), limit(8000)));
    state.referenceMemory = memSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    legacyMap = new Map(state.referenceMemory.map(m => [norm(m.ref || m.materialRef), m]));
  }catch(err){
    console.warn("No se pudo leer referenceMemory antiguo. La app continuará con materials e histórico nuevo.", err);
    state.referenceMemory = [];
  }
  state.materials = materials.map(m => mergeReferenceMemory(m, preferredMemoryForMaterial(m, legacyMap, v2Map, control)));
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
  const snap = await getDocs(query(collection(db, "counts"), orderBy("createdAt", "desc"), limit(300)));
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
function getInitialViewFromUrl(){
  try{
    const requested = new URLSearchParams(window.location.search).get("view") || "";
    if(!requested && role() === "inventario") return "expressView";
    const key = requested.trim().toLowerCase();
    const viewAliases = {
      panel:"dashboardView", dashboard:"dashboardView", inicio:"dashboardView",
      express:"expressView", rapido:"expressView", rápido:"expressView", conteoexpress:"expressView", conteo_rapido:"expressView",
      usuarios:"usersView", users:"usersView",
      drive:"driveView", siesa:"driveView",
      inventario:"inventoryView", inventory:"inventoryView", pendientes:"inventoryView", conteo:"expressView",
      historial:"historyView", history:"historyView",
      cables:"cableView", cable:"cableView", metraje:"cableView",
      jefe:"jefeView", logistico:"jefeView", logistica:"jefeView",
      auditoria:"auditoriaView", auditoría:"auditoriaView", audit:"auditoriaView",
      gerencia:"gerenciaView", management:"gerenciaView",
      materiales:"materialsView", materials:"materialsView",
      etiquetas:"qrLabelsView", qr:"qrLabelsView", codigos:"qrLabelsView", códigos:"qrLabelsView",
      lineas:"lineCatalogView", líneas:"lineCatalogView", catalogo:"lineCatalogView", catálogo:"lineCatalogView",
      indicadores:"indicatorsView", indicators:"indicatorsView", kpi:"indicatorsView",
      configuracion:"configView", configuración:"configView", config:"configView"
    };
    const viewId = viewAliases[key] || (requested.endsWith("View") ? requested : "dashboardView");
    return VIEW_ACCESS[viewId] ? viewId : (role() === "inventario" ? "expressView" : "dashboardView");
  }catch(err){
    return "dashboardView";
  }
}

function showApp(){
  $("#loading").classList.add("hidden");
  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#userName").textContent = state.profile.displayName || state.user.email;
  $("#userEmail").textContent = state.profile.email || state.user.email;
  $("#userRoleBadge").textContent = ROLE_LABELS[role()] || role();
  applyRoleVisibility();
  setView(getInitialViewFromUrl());
}
function applyRoleVisibility(){
  document.documentElement.classList.toggle("operator-mode", role() === "inventario");
  $$('[data-roles]').forEach(el => {
    const allowed = el.dataset.roles.split(",").map(x => x.trim());
    el.classList.toggle("hidden", !hasAny(allowed));
  });
  $$(".nav-link").forEach(btn => {
    const allowed = VIEW_ACCESS[btn.dataset.view] || [];
    btn.classList.toggle("hidden", !hasAny(allowed));
    if(btn.dataset.view === "expressView") btn.textContent = role() === "inventario" ? "Conteo simple" : "Conteo Express";
    if(btn.dataset.view === "qrLabelsView" && role() === "inventario") btn.textContent = "Etiquetas diarias";
  });
}
function setView(viewId){
  if(!hasAny(VIEW_ACCESS[viewId] || [])){
    if(role() === "inventario" && viewId === "dashboardView") viewId = "expressView";
    else { toast("Tu usuario no tiene acceso a este módulo.", "error"); return; }
  }
  state.activeView = viewId;
  $$(".view").forEach(v => v.classList.remove("active"));
  $("#" + viewId).classList.add("active");
  $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.view === viewId));
  const titles = {
    dashboardView:["Panel general","Estado de sincronización, tareas y casos pendientes."],
    expressView:[role() === "inventario" ? "Conteo simple" : "Conteo Express", role() === "inventario" ? "Registra únicamente la cantidad física. El stock del sistema queda oculto para un conteo ciego y transparente." : "Flujo rápido por ubicación, referencia, cantidad física, evidencia y siguiente tarea."],
    usersView:["Usuarios","Creación y administración de roles por super admin."],
    driveView:["Carga diaria SIESA","Sube el Excel del día, reinicia la base operativa y genera el conteo obligatorio."],
    inventoryView:["Mis pendientes","Listado operativo de tareas asignadas."],
    historyView:["Historial","Conteos recientes, evidencia y tiempos registrados."],
    cableView:["Metraje cables","Conteo de metros físicos en referencias de cable."],
    jefeView:["Jefe logístico","Validación de novedades y escalamiento."],
    auditoriaView:["Auditoría interna","Contabilización independiente e informe."],
    gerenciaView:["Gerencia","Revisión y aprobación final."],
    materialsView:["Materiales","Catálogo consolidado desde SIESA."],
    qrLabelsView:["Etiquetas QR","Impresión de códigos para ubicación, referencia y conteo móvil."],
    lineCatalogView:["Líneas / Cables","Tabla base para completar nombres y clasificar metraje de cables."],
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


function getOpenTaskStatuses(){
  return ["assigned", "recount_required", "pending_inventory", "pending_jefe_approval", "pending_jefe_logistico"];
}
function materialByRef(ref){
  const target = String(ref || "");
  return state.materials.find(m => String(m.ref || "") === target) || null;
}
function daysSinceISO(iso){
  if(!iso) return 365;
  const d = diffDays(String(iso).slice(0,10), todayISO());
  return Number.isFinite(d) ? Math.max(0, d) : 365;
}
function taskRiskMeta(task){
  const m = materialByRef(task.materialRef) || {};
  const value = Number(task.inventoryValue || m.inventoryValue || (Number(task.systemQty || m.stockSystem || 0) * Number(task.unitCost || m.unitCost || 0)) || 0);
  const movement = Number(m.movementIndex || task.movementIndex || 0);
  const variability = Number(m.variabilityIndex || task.variabilityIndex || 0);
  const age = daysSinceISO(m.lastCountDate || m.lastVerifiedDate || task.lastCountDate || "");
  const bandWeight = {"A+":22,A:18,B:14,C:10,D:6,E:3}[task.band || m.band] || 5;
  const diffHistory = state.counts.filter(c => c.materialRef === task.materialRef && Number(c.absDiff || 0) > 0);
  const criticalHistory = diffHistory.filter(c => c.severity === "critica" || c.severity === "crítica").length;
  const score = Math.min(100, Math.round(
    bandWeight +
    Math.min(Math.log10(Math.max(value, 1)) * 7, 25) +
    Math.min(movement * 1.4, 16) +
    Math.min(variability / Math.max(Number(task.systemQty || m.stockSystem || 1), 1) * 10, 12) +
    Math.min(age / 5, 18) +
    Math.min(diffHistory.length * 6 + criticalHistory * 8, 22) +
    (task.status === "recount_required" ? 12 : 0) +
    ((task.taskType === "cable_metraje" || task.type === "cable_metraje") ? 4 : 0)
  ));
  const threshold = Number(state.settings.highRiskScoreThreshold ?? 70);
  const cls = score >= threshold ? "red" : score >= 50 ? "yellow" : score >= 30 ? "blue" : "green";
  const label = score >= threshold ? "Alto" : score >= 50 ? "Medio" : score >= 30 ? "Control" : "Bajo";
  const reasons = [];
  if(value > 0) reasons.push(`valor ${money(value)}`);
  if(age >= 30) reasons.push(`${fmt(age)} días sin contar`);
  if(diffHistory.length) reasons.push(`${diffHistory.length} diferencias previas`);
  if(task.status === "recount_required") reasons.push("reconteo");
  return { score, cls, label, reasons: reasons.join(" · ") || "control normal" };
}
function getExpressTasks(){
  let rows = state.tasks.filter(t => getOpenTaskStatuses().includes(t.status));
  if(!isSuper() && role() === "inventario") rows = rows.filter(t => ["assigned","recount_required","pending_inventory"].includes(t.status));
  rows = rows.map(t => {
    const meta = displayMeta(t);
    return {
      ...t,
      materialRef:t.materialRef || meta.ref,
      description:meta.description,
      location:meta.location || t.location || "",
      unit:meta.unit || t.unit || "",
      catalogLine:meta.line || t.catalogLine || t.category || "",
      systemQty:Number(t.systemQty ?? meta.systemQty ?? 0),
      unitCost:Number(t.unitCost ?? meta.unitCost ?? 0),
      inventoryValue:Number(t.inventoryValue ?? meta.inventoryValue ?? 0),
      isCable:Boolean(t.isCable || meta.isCable),
      risk:taskRiskMeta({ ...t, ...meta, materialRef:t.materialRef || meta.ref })
    };
  });
  const loc = norm($("#expressLocationInput")?.value || state.express.selectedLocation || "");
  const ref = norm($("#expressRefInput")?.value || state.express.selectedRef || "");
  const filter = $("#expressTaskTypeFilter")?.value || "";
  if(loc) rows = rows.filter(t => norm(t.location || "").includes(loc));
  if(ref) rows = rows.filter(t => [t.materialRef,t.description,t.catalogLine,t.category,t.location].some(v => norm(v).includes(ref)));
  if(filter === "today") rows = rows.filter(t => (t.scheduledDate || "") === todayISO());
  if(filter === "recount") rows = rows.filter(t => t.status === "recount_required" || norm(t.taskType || t.type).includes("reconteo"));
  if(filter === "cable") rows = rows.filter(t => t.taskType === "cable_metraje" || t.type === "cable_metraje" || t.isCable);
  if(filter === "risk") rows = rows.filter(t => taskRiskMeta(t).score >= Number(state.settings.highRiskScoreThreshold ?? 70));
  rows.sort((a,b) => {
    const statusA = a.status === "recount_required" ? 1 : 0;
    const statusB = b.status === "recount_required" ? 1 : 0;
    return statusB - statusA || String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")) || b.risk.score - a.risk.score || Number(b.inventoryValue || 0) - Number(a.inventoryValue || 0);
  });
  return rows;
}
function renderRoleDashboard(){
  const el = $("#roleQuickPanel");
  if(!el) return;
  const today = todayISO();
  const open = state.tasks.filter(t => getOpenTaskStatuses().includes(t.status));
  const pendingToday = open.filter(t => (t.scheduledDate || "") === today).length;
  const criticalCases = state.cases.filter(c => c.severity === "critica" || c.severity === "crítica" || Number(c.diffValue || 0) >= Number(state.settings.criticalDiffValue || 500000)).length;
  const diffValue = state.cases.reduce((s,c)=>s+Number(c.diffValue || 0),0);
  const texts = {
    inventario: { title:"Conteo simple", body:`Tienes ${fmt(pendingToday || open.length)} tareas abiertas. Solo debes abrir la tarea, escribir la cantidad física y guardar. El stock sistema permanece oculto.`, action:"Iniciar conteo", view:"expressView" },
    jefe_logistico: { title:"Control logístico", body:`Casos abiertos: ${fmt(state.cases.filter(c => ["pending_jefe_logistico","pending_jefe_approval"].includes(c.status)).length)}. Diferencias críticas: ${fmt(criticalCases)}. Valor pendiente: ${money(diffValue)}.`, action:"Revisar diferencias", view:"jefeView" },
    auditoria: { title:"Auditoría", body:`Casos para auditoría: ${fmt(state.cases.filter(c => c.status === "pending_auditoria").length)}. Revisa evidencia, historial y conteo independiente.`, action:"Abrir auditoría", view:"auditoriaView" },
    gerencia: { title:"Resumen para decisión", body:`Pendientes gerencia: ${fmt(state.cases.filter(c => c.status === "pending_gerencia").length)}. Valor en diferencia: ${money(diffValue)}.`, action:"Ver decisiones", view:"gerenciaView" },
    super_admin: { title:"Vista total", body:`Materiales: ${fmt(state.materials.length)}. Tareas abiertas: ${fmt(open.length)}. Casos: ${fmt(state.cases.length)}.`, action:"Conteo Express", view:"expressView" }
  };
  const t = texts[role()] || texts.super_admin;
  el.innerHTML = `<article class="role-card"><div><span class="tag blue">${esc(ROLE_LABELS[role()] || role())}</span><h3>${esc(t.title)}</h3><p>${esc(t.body)}</p></div><button class="btn primary" type="button" data-role-go="${esc(t.view)}">${esc(t.action)}</button></article>`;
  $('[data-role-go]')?.addEventListener("click", ev => setView(ev.currentTarget.dataset.roleGo));
}
function expressProgressMeta(){
  const today = todayISO();
  const openToday = state.tasks.filter(t => getOpenTaskStatuses().includes(t.status) && (t.scheduledDate || "") === today);
  const doneToday = state.counts.filter(c => (c.date || "") === today && (!state.user?.uid || c.countedByUid === state.user.uid));
  const doneTaskIds = new Set(doneToday.map(c => c.taskId).filter(Boolean));
  const total = openToday.length + doneTaskIds.size;
  const done = doneTaskIds.size;
  return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}

function renderExpressRoleHeader(progress){
  const operator = isOperatorRole();
  if($("#expressTitle")) $("#expressTitle").textContent = operator ? "Conteo simple" : "Conteo Express";
  if($("#expressHelpText")) $("#expressHelpText").textContent = operator
    ? "Abre una tarea, verifica referencia/nombre/ubicación, escribe la cantidad física y guarda. No se muestra el stock del sistema."
    : "Escanea ubicación o referencia, confirma el nombre del material, registra la cantidad física y pasa al siguiente material.";
  if($("#expressListTitle")) $("#expressListTitle").textContent = operator ? "Tus pendientes" : "Lista rápida";
  if($("#expressListHelp")) $("#expressListHelp").textContent = operator ? "Solo aparecen las tareas abiertas que debes contar." : "Ordenada por fecha, reconteo, riesgo y valor.";
  const filter = $("#expressTaskTypeFilter");
  if(filter){
    const current = filter.value;
    filter.innerHTML = operator
      ? `<option value="">Todas</option><option value="today">Solo hoy</option><option value="recount">Reconteos</option><option value="cable">Cables / metraje</option>`
      : `<option value="">Todas</option><option value="today">Solo hoy</option><option value="recount">Reconteos</option><option value="cable">Cables / metraje</option><option value="risk">Alto riesgo</option>`;
    filter.value = [...filter.options].some(o => o.value === current) ? current : "";
  }
  const hero = document.querySelector(".express-hero-kpis");
  if(hero){
    hero.innerHTML = operator
      ? `<div><span>Pendientes</span><b id="expressPendingToday">0</b></div><div><span>Contados</span><b id="expressDoneToday">0</b></div><div><span>Offline</span><b id="expressOfflineQueue">0</b></div>`
      : `<div><span>Pendientes hoy</span><b id="expressPendingToday">0</b></div><div><span>Reconteos</span><b id="expressRecounts">0</b></div><div><span>Críticos</span><b id="expressRiskHigh">0</b></div><div><span>Offline</span><b id="expressOfflineQueue">0</b></div>`;
  }
  $("#expressProgressBar") && ($("#expressProgressBar").style.width = `${progress.pct}%`);
  if($("#expressProgressText")) $("#expressProgressText").textContent = `${fmt(progress.done)} de ${fmt(progress.total)} · ${progress.pct}%`;
  if($("#expressPendingToday")) $("#expressPendingToday").textContent = fmt(state.tasks.filter(t => getOpenTaskStatuses().includes(t.status) && (t.scheduledDate || "") === todayISO()).length);
  if($("#expressDoneToday")) $("#expressDoneToday").textContent = fmt(progress.done);
  if($("#expressRecounts")) $("#expressRecounts").textContent = fmt(state.tasks.filter(t => t.status === "recount_required").length);
  if($("#expressRiskHigh")) $("#expressRiskHigh").textContent = fmt(state.tasks.filter(t => taskRiskMeta(t).score >= Number(state.settings.highRiskScoreThreshold ?? 70)).length);
  if($("#expressOfflineQueue")) $("#expressOfflineQueue").textContent = fmt(state.offlineQueue?.length || 0);
}

function renderExpress(){
  const list = $("#expressWorklist");
  const current = $("#expressCurrentCard");
  if(!list || !current) return;
  const rows = getExpressTasks();
  const progress = expressProgressMeta();
  renderExpressRoleHeader(progress);

  let selected = rows.find(t => t.id === state.express.selectedTaskId) || rows[0] || null;
  if(selected){
    state.express.selectedTaskId = selected.id;
    localStorage.setItem("expressSelectedTaskId", selected.id);
  }
  current.innerHTML = selected ? expressTaskDetail(selected) : `<div class="empty">No hay tareas que coincidan con los filtros. Limpia búsqueda o genera el conteo diario.</div>`;
  list.innerHTML = rows.length ? rows.slice(0,80).map(t => expressTaskMiniCard(t, selected?.id === t.id)).join("") : `<div class="empty small">Sin tareas abiertas para el filtro actual.</div>`;
  bindExpressButtons();
}
function expressTaskDetail(t){
  const meta = displayMeta(t);
  const risk = t.risk || taskRiskMeta(t);
  const isCable = t.taskType === "cable_metraje" || t.type === "cable_metraje" || meta.isCable;
  const operator = isOperatorRole();
  const mem = memoryByRef(meta.ref) || meta;
  const hasMem = Boolean(mem?.lastCountDate);
  if(operator){
    const memHtml = hasMem
      ? `<div class="memory-box operator-memory"><span>Historial interno</span><b>Referencia ya tiene memoria registrada</b><small>Último conteo guardado: ${esc(mem.lastCountDate || "")}. Las cantidades históricas no se muestran para evitar sesgo.</small></div>`
      : `<div class="memory-box operator-memory"><span>Historial interno</span><b>Primer conteo de esta referencia</b><small>Al guardar, la APP memorizará esta referencia aunque cambie el Excel SIESA.</small></div>`;
    return `<div class="express-current-card operator-count-card">
      <div class="express-current-top"><span class="pill blue">Conteo ciego activo</span>${statusPill(t.status)}</div>
      <div class="express-ref-title operator-ref-title">
        <span>Referencia</span>
        <h2>${esc(meta.ref || "")}</h2>
        <strong>${esc(meta.description || "Referencia sin nombre cargado")}</strong>
        ${meta.line ? `<small>${esc(meta.line)}</small>` : ""}
      </div>
      <div class="operator-data-grid">
        <div><span>Ubicación</span><b>${esc(meta.location || "Sin ubicación")}</b></div>
        <div><span>Unidad</span><b>${esc(meta.unit || (isCable ? "m" : "und"))}</b></div>
        <div><span>Tipo</span><b>${isCable ? "Metraje de cable" : "Inventario"}</b></div>
      </div>
      ${memHtml}
      <div class="operator-blind-note"><b>No se muestra el stock del sistema.</b><span>Escribe únicamente lo que ves físicamente. La diferencia la calcularán el sistema y el jefe logístico después de guardar.</span></div>
      <div class="button-row express-main-actions operator-actions">
        <button class="btn primary big-action" type="button" data-express-count="${esc(t.id)}">Contar ahora</button>
      </div>
    </div>`;
  }
  const value = Number(meta.inventoryValue || Number(meta.systemQty || 0) * Number(meta.unitCost || 0));
  const memHtml = hasMem
    ? `<div class="memory-box"><span>Última contabilización guardada</span><b>${esc(mem.lastCountDate || "")} · ${esc(mem.lastResult || meta.lastCountResult || "")}</b><small>Físico: ${fmt(mem.lastCountedQty ?? meta.lastCountedQty ?? 0)} · Sistema: ${fmt(mem.lastSystemQty ?? meta.lastCountSystemQty ?? 0)} · Dif: ${fmt(mem.lastDiff ?? meta.lastCountDiff ?? 0)} · ${esc(mem.lastCountedBy || meta.lastCountedBy || "sin usuario")}</small></div>`
    : `<div class="memory-box"><span>Memoria de referencia</span><b>Sin conteo histórico registrado</b><small>Cuando se guarde el primer conteo, esta referencia quedará memorizada aunque cambie el Excel SIESA.</small></div>`;
  return `<div class="express-current-card">
    <div class="express-current-top"><span class="pill ${risk.cls}">Riesgo ${risk.label} · ${risk.score}</span>${statusPill(t.status)}</div>
    <div class="express-ref-title">
      <span>Referencia</span>
      <h2>${esc(meta.ref || "")}</h2>
      <strong>${esc(meta.description || "Referencia sin nombre cargado")}</strong>
      ${meta.line ? `<small>${esc(meta.line)}</small>` : ""}
    </div>
    <div class="express-data-grid">
      <div><span>Ubicación</span><b>${esc(meta.location || "Sin ubicación")}</b></div>
      <div><span>Unidad</span><b>${esc(meta.unit || (isCable ? "m" : "und"))}</b></div>
      <div><span>${isCable ? "Metros sistema" : "Stock sistema"}</span><b>${shouldBlindCount() ? "Oculto" : fmt(meta.systemQty)}</b></div>
      <div><span>Valor inventario</span><b>${money(value)}</b></div>
      <div><span>Motivo riesgo</span><b>${esc(risk.reasons)}</b></div>
    </div>
    ${memHtml}
    <div class="express-code-strip"><span>Código interno sugerido</span><b>${esc(inventoryCode("material", meta.ref || ""))}</b><small>Formato simple: QR + Code128 + texto visible para digitar si falla la cámara.</small></div>
    <div class="button-row express-main-actions">
      <button class="btn primary big-action" type="button" data-express-count="${esc(t.id)}">Contar ahora</button>
      <button class="btn blue" type="button" data-label-task="${esc(t.id)}" data-label-kind="material">Agregar sticker ref</button>
      <button class="btn secondary" type="button" data-label-task="${esc(t.id)}" data-label-kind="location">Agregar sticker ubicación</button>
      <button class="btn warn" type="button" data-print-label-task="${esc(t.id)}" data-label-kind="material">Imprimir sticker</button>
    </div>
  </div>`;
}
function expressTaskMiniCard(t, active=false){
  const meta = displayMeta(t);
  const risk = t.risk || taskRiskMeta(t);
  const isCable = t.taskType === "cable_metraje" || t.type === "cable_metraje" || meta.isCable;
  if(isOperatorRole()){
    return `<button class="express-mini-card operator-mini ${active ? "active" : ""}" type="button" data-select-express="${esc(t.id)}">
      <span class="mini-ref">${esc(meta.ref || "")}</span>
      <span class="mini-desc"><b>${esc(meta.description || "Sin nombre")}</b></span>
      <span class="mini-meta">${esc(meta.location || "Sin ubicación")} · ${esc(meta.unit || (isCable ? "m" : "und"))}</span>
      <span class="mini-footer">${statusPill(t.status)}<b class="pill blue">Contar</b></span>
    </button>`;
  }
  return `<button class="express-mini-card ${active ? "active" : ""}" type="button" data-select-express="${esc(t.id)}">
    <span class="mini-ref">${esc(meta.ref || "")}</span>
    <span class="mini-desc"><b>${esc(meta.description || "Sin nombre")}</b></span>
    <span class="mini-meta">${esc(meta.location || "Sin ubicación")} · ${isCable ? "Cable" : esc(t.band || "")}${meta.line ? " · " + esc(meta.line) : ""}</span>
    <span class="mini-footer"><b class="pill ${risk.cls}">${risk.score}</b>${statusPill(t.status)}</span>
  </button>`;
}
function bindExpressButtons(){
  $$('[data-select-express]').forEach(btn => btn.addEventListener("click", () => {
    state.express.selectedTaskId = btn.dataset.selectExpress;
    localStorage.setItem("expressSelectedTaskId", state.express.selectedTaskId);
    renderExpress();
  }));
  $$('[data-express-count]').forEach(btn => btn.addEventListener("click", () => openTaskCountDialog(btn.dataset.expressCount)));
  $$('[data-copy-ref]').forEach(btn => btn.addEventListener("click", async () => {
    try{ await navigator.clipboard.writeText(btn.dataset.copyRef || ""); toast("Referencia copiada."); }catch(e){ toast(btn.dataset.copyRef || ""); }
  }));
  $$('[data-label-task]').forEach(btn => btn.addEventListener("click", () => addTaskLabelToQueue(btn.dataset.labelTask, btn.dataset.labelKind || "material")));
  $$('[data-print-label-task]').forEach(btn => btn.addEventListener("click", () => printTaskLabel(btn.dataset.printLabelTask, btn.dataset.labelKind || "material")));
}
function clearExpressFilters(){
  if($("#expressLocationInput")) $("#expressLocationInput").value = "";
  if($("#expressRefInput")) $("#expressRefInput").value = "";
  if($("#expressTaskTypeFilter")) $("#expressTaskTypeFilter").value = "";
  state.express.selectedLocation = "";
  state.express.selectedRef = "";
  renderExpress();
}
function internalCodeSlug(value){
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34) || "SIN-CODIGO";
}
function inventoryCode(kind, value){
  const type = kind === "location" ? "UBI" : kind === "bin" ? "BIN" : "REF";
  return `EI-${type}-${internalCodeSlug(value)}`;
}
function inventoryPayload(kind, value, extra = {}){
  const code = inventoryCode(kind, value);
  const ref = String(extra.ref || (kind === "material" ? value : "")).trim();
  const loc = String(extra.location || (kind === "location" ? value : "")).trim();
  const desc = String(extra.description || "").trim();
  const unit = String(extra.unit || "").trim();
  return [`EI`, kind === "location" ? "LOC" : "MAT", code, ref ? `REF:${ref}` : "", loc ? `LOC:${loc}` : "", unit ? `UM:${unit}` : "", desc ? `DESC:${desc.slice(0,90)}` : ""].filter(Boolean).join("|");
}
function resolveInternalCode(value){
  const raw = String(value || "").trim();
  const upper = raw.toUpperCase();
  if(!upper.startsWith("EI-")) return null;
  if(upper.startsWith("EI-UBI-") || upper.startsWith("EI-BIN-")){
    const loc = [...new Set(state.materials.map(m => String(m.location || "").trim()).filter(Boolean))]
      .find(l => inventoryCode("location", l) === upper || internalCodeSlug(l) === upper.replace(/^EI-(UBI|BIN)-/, ""));
    return loc ? { mode:"location", value:loc, code:upper } : { mode:"location", value:raw.replace(/^EI-(UBI|BIN)-/i, ""), code:upper };
  }
  if(upper.startsWith("EI-REF-") || upper.startsWith("EI-MAT-")){
    const mat = state.materials.find(m => inventoryCode("material", m.ref) === upper || internalCodeSlug(m.ref) === upper.replace(/^EI-(REF|MAT)-/, ""));
    return mat ? { mode:"ref", value:mat.ref, code:upper } : { mode:"ref", value:raw.replace(/^EI-(REF|MAT)-/i, ""), code:upper };
  }
  return null;
}
function normalizeScanPayload(raw){
  const value = String(raw || "").trim();
  const upper = value.toUpperCase();
  if(!value) return { mode:state.express.scanMode || "ref", value:"" };
  if(upper.startsWith("EI|")){
    const parts = value.split("|");
    const kind = (parts[1] || "").toUpperCase();
    const fields = {};
    parts.slice(3).forEach(part => {
      const idx = part.indexOf(":");
      if(idx > -1) fields[part.slice(0, idx).toUpperCase()] = part.slice(idx + 1);
    });
    if(kind === "LOC") return { mode:"location", value:fields.LOC || fields.UBI || parts[2] || "", code:parts[2] || "" };
    if(kind === "MAT") return { mode:"ref", value:fields.REF || parts[2] || "", code:parts[2] || "" };
  }
  if(upper.startsWith("LOC:") || upper.startsWith("UBI:")) return { mode:"location", value:value.slice(4).trim() };
  if(upper.startsWith("MAT:") || upper.startsWith("REF:")) return { mode:"ref", value:value.slice(4).trim() };
  const internal = resolveInternalCode(value);
  if(internal) return internal;
  return { mode:state.express.scanMode || "ref", value };
}
async function openScanner(mode){
  state.express.scanMode = mode;
  $("#scannerTitle") && ($("#scannerTitle").textContent = mode === "location" ? "Escanear ubicación" : "Escanear referencia");
  $("#scannerSubtitle") && ($("#scannerSubtitle").textContent = mode === "location" ? "Lee el QR de bodega, pasillo o estante." : "Lee el QR/código de barras del material.");
  $("#manualScanValue") && ($("#manualScanValue").value = "");
  $("#scannerDialog")?.showModal();
  const status = $("#scannerStatus");
  if(!navigator.mediaDevices?.getUserMedia){
    if(status) status.textContent = "Este navegador no permite cámara. Usa el campo manual.";
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:"environment" }, width:{ ideal:1280 }, height:{ ideal:720 } }, audio:false });
    state.express.scanStream = stream;
    const video = $("#scannerVideo");
    video.setAttribute("playsinline", "true");
    video.srcObject = stream;
    await video.play();

    if("BarcodeDetector" in window){
      const formats = window.BarcodeDetector.getSupportedFormats ? await window.BarcodeDetector.getSupportedFormats().catch(() => []) : [];
      const detector = new window.BarcodeDetector({ formats: formats.length ? formats : ["qr_code","code_128","code_39","ean_13"] });
      if(status) status.textContent = "Cámara activa. Apunta al QR o código de barras.";
      state.express.scanTimer = setInterval(async () => {
        try{
          const codes = await detector.detect(video);
          if(codes?.length){ applyScanValue(codes[0].rawValue || codes[0].rawValueText || ""); }
        }catch(e){}
      }, 500);
      return;
    }

    if(window.jsQR){
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently:true });
      if(status) status.textContent = "Cámara activa en modo iPhone. Lee QR; si es código de barras, usa ingreso manual.";
      state.express.scanTimer = setInterval(() => {
        try{
          if(!video.videoWidth || !video.videoHeight) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qr = window.jsQR(img.data, img.width, img.height, { inversionAttempts:"attemptBoth" });
          if(qr?.data) applyScanValue(qr.data);
        }catch(e){}
      }, 500);
      return;
    }

    if(status) status.textContent = "Cámara activa, pero este navegador no trae lector QR. Usa ingreso manual.";
  }catch(err){
    if(status) status.textContent = "No se pudo activar la cámara. Revisa permisos o usa ingreso manual.";
  }
}
function closeScanner(){
  clearInterval(state.express.scanTimer);
  state.express.scanTimer = null;
  if(state.express.scanStream){
    state.express.scanStream.getTracks().forEach(t => t.stop());
    state.express.scanStream = null;
  }
  $("#scannerDialog")?.close();
}
function applyManualScanValue(){ applyScanValue($("#manualScanValue")?.value || ""); }
function applyScanValue(raw){
  const parsed = normalizeScanPayload(raw);
  if(!parsed.value) return;
  if(parsed.mode === "location"){
    if($("#expressLocationInput")) $("#expressLocationInput").value = parsed.value;
    state.express.selectedLocation = parsed.value;
    toast("Ubicación aplicada.");
  }else{
    if($("#expressRefInput")) $("#expressRefInput").value = parsed.value;
    state.express.selectedRef = parsed.value;
    const match = state.tasks.find(t => {
      const meta = displayMeta(t);
      return norm(t.materialRef) === norm(parsed.value) || norm(meta.ref) === norm(parsed.value) || norm(t.materialRef).includes(norm(parsed.value)) || norm(inventoryCode("material", meta.ref || t.materialRef)).includes(norm(parsed.code || parsed.value));
    });
    if(match) state.express.selectedTaskId = match.id;
    toast(match ? "Referencia encontrada." : "Referencia aplicada como filtro.");
  }
  closeScanner();
  setView("expressView");
  renderExpress();
}
function bumpCountQty(step){
  const input = $("#countQty");
  if(!input) return;
  const current = input.value === "" ? 0 : num(input.value);
  input.value = Number(current + Number(step || 0)).toFixed(3).replace(/\.000$/, "");
  input.dispatchEvent(new Event("input", { bubbles:true }));
}
function clearCountQty(){
  const input = $("#countQty");
  if(input){ input.value = ""; input.dispatchEvent(new Event("input", { bubbles:true })); }
}
function countDurationSeconds(){
  const start = $("#countStartedAt")?.value || state.express.countStartedAt;
  const startMs = start ? Date.parse(start) : NaN;
  return Number.isFinite(startMs) ? Math.max(0, Math.round((Date.now() - startMs) / 1000)) : 0;
}
function countContextItem(){
  const taskId = $("#countTaskId")?.value;
  const caseId = $("#countCaseId")?.value;
  if(taskId) return state.tasks.find(t => t.id === taskId) || null;
  if(caseId) return state.cases.find(c => c.id === caseId) || null;
  return null;
}
function requiresPhotoForCount(meta, item){
  const dmeta = item ? displayMeta(item) : {};
  const isCable = item?.taskType === "cable_metraje" || item?.type === "cable_metraje" || norm(item?.type).includes("metraje") || dmeta.isCable;
  if(Number(meta.absDiff || 0) <= 0.0001) return false;
  if((meta.severity === "critica" || meta.severity === "crítica") && state.settings.requirePhotoCritical !== false) return true;
  if(isCable && state.settings.requirePhotoCableDiff !== false) return true;
  return false;
}
function requiresSupportForCount(meta){
  return ["media","critica","crítica"].includes(meta.severity) && state.settings.requireEvidenceMedium !== false;
}
function openNextExpressTask(previousTaskId=""){
  const rows = getExpressTasks().filter(t => t.id !== previousTaskId);
  const next = rows[0];
  if(next){
    state.express.selectedTaskId = next.id;
    localStorage.setItem("expressSelectedTaskId", next.id);
    setView("expressView");
    setTimeout(() => openTaskCountDialog(next.id), 250);
  }else{
    setView("expressView");
    toast("No quedan más tareas abiertas para el filtro actual.");
  }
}
function labelItemFromMaterial(m){
  const meta = displayMeta({ materialRef:m.ref, ...m });
  return {
    kind:"material",
    label:meta.ref,
    value:meta.ref,
    ref:meta.ref,
    location:meta.location || "",
    description:meta.description || "Referencia",
    unit:meta.unit || "",
    data:inventoryPayload("material", meta.ref, meta),
    code:inventoryCode("material", meta.ref),
    sub:meta.description || meta.location || "Referencia"
  };
}
function labelItemFromLocation(location){
  const loc = String(location || "").trim();
  const count = state.materials.filter(m => norm(m.location) === norm(loc)).length;
  return { kind:"location", label:loc, value:loc, location:loc, description:`Ubicación física · ${fmt(count)} referencia(s)`, unit:"", data:inventoryPayload("location", loc, { location:loc }), code:inventoryCode("location", loc), sub:`Ubicación física · ${fmt(count)} referencia(s)` };
}
function buildManualLabelItem(){
  const kind = $("#quickQrKind")?.value || "material";
  const ref = String($("#quickQrRef")?.value || "").trim();
  const desc = String($("#quickQrDescription")?.value || "").trim();
  const loc = String($("#quickQrLocation")?.value || "").trim();
  const unit = String($("#quickQrUnit")?.value || "").trim();
  const main = kind === "location" ? loc : ref;
  if(!main) return null;
  return {
    kind,
    label:main,
    value:main,
    ref:kind === "material" ? ref : "",
    location:loc,
    description:desc || (kind === "location" ? "Ubicación física" : "Referencia manual"),
    unit,
    data:inventoryPayload(kind, main, { ref, location:loc, description:desc, unit }),
    code:inventoryCode(kind, main),
    sub:desc || (kind === "location" ? "Ubicación física" : "Referencia manual")
  };
}
function saveLabelQueue(){
  localStorage.setItem("inventarioLabelQueueV34", JSON.stringify((state.labelQueue || []).slice(-320)));
}
async function persistGeneratedLabel(item){
  if(!state.user || navigator.onLine === false || !item?.code) return;
  try{
    await setDoc(doc(db, "generatedLabels", safeId(item.code)), {
      kind:item.kind || "material",
      code:item.code || "",
      label:item.label || "",
      ref:item.ref || "",
      location:item.location || "",
      description:item.description || item.sub || "",
      unit:item.unit || "",
      payload:item.data || "",
      createdAt:item.createdAt || nowTS(),
      updatedAt:nowTS(),
      createdByUid:state.user.uid,
      createdByEmail:state.user.email,
      source:"v34_operator_simple_count"
    }, { merge:true });
  }catch(err){ console.warn("No se pudo registrar etiqueta generada en Firestore", err); }
}
function addLabelToQueue(item){
  if(!item || !String(item.label || item.value || "").trim()) return toast("No hay datos suficientes para crear la etiqueta.", "error");
  state.labelQueue ||= [];
  const key = `${item.kind}|${item.code}`;
  state.labelQueue = state.labelQueue.filter(x => `${x.kind}|${x.code}` !== key);
  state.labelQueue.unshift({ ...item, createdAt:new Date().toISOString(), createdBy:state.user?.email || "" });
  state.labelQueue = state.labelQueue.slice(0, 80);
  saveLabelQueue();
  persistGeneratedLabel(item);
  renderLabelQueue();
  renderQuickLabelDraft();
}
function createQuickLabelFromForm(){
  const item = buildManualLabelItem();
  if(!item) return toast("Escribe al menos una referencia o ubicación para crear la etiqueta.", "error");
  addLabelToQueue(item);
  toast("Etiqueta agregada a la cola de impresión.");
}
function clearLabelQueue(){
  state.labelQueue = [];
  saveLabelQueue();
  renderLabelQueue();
  toast("Cola de etiquetas limpiada.");
}
function renderQuickLabelDraft(){
  const el = $("#quickLabelDraft");
  if(!el) return;
  const item = buildManualLabelItem();
  el.innerHTML = item ? qrLabelHtml(item) : `<div class="empty small">Escribe una referencia o ubicación para generar una etiqueta inmediata.</div>`;
}
function renderLabelQueue(){
  const el = $("#quickLabelQueue");
  if(!el) return;
  const rows = state.labelQueue || [];
  if(!rows.length){ el.innerHTML = `<div class="empty small">Sin etiquetas en cola. Puedes agregarlas desde Conteo Express o desde el formulario manual.</div>`; return; }
  el.innerHTML = `<div class="queue-list">${rows.slice(0,40).map((x,i) => `<div class="queue-row"><span><b>${esc(x.code || "")}</b><small>${esc(x.label || "")} · ${esc(x.description || "")}</small></span><button type="button" class="tiny" data-print-queue-index="${i}">Imprimir</button></div>`).join("")}</div>`;
  $$('[data-print-queue-index]').forEach(btn => btn.addEventListener("click", () => {
    const item = state.labelQueue[Number(btn.dataset.printQueueIndex)];
    if(item) printLabelItems([item], $("#qrLabelSize")?.value || "standard");
  }));
}
function renderQrLabels(){
  const el = $("#qrLabelPreview");
  if(!el) return;
  const q = norm($("#qrSearch")?.value || "");
  const type = $("#qrType")?.value || "material";
  const size = $("#qrLabelSize")?.value || "standard";
  const max = Math.max(1, Math.min(200, Number($("#qrLimit")?.value || 48)));
  el.classList.toggle("large", size === "large");
  el.classList.toggle("compact", size === "compact");
  let items = [];
  if(type === "location"){
    const locs = [...new Set(state.materials.map(m => String(m.location || "").trim()).filter(Boolean))].sort();
    items = locs.filter(l => !q || norm(l).includes(q) || norm(inventoryCode("location", l)).includes(q)).slice(0,max).map(labelItemFromLocation);
  }else{
    items = state.materials
      .map(labelItemFromMaterial)
      .filter(m => !q || [m.ref,m.description,m.location,m.code].some(v => norm(v).includes(q)))
      .slice(0,max);
  }
  el.innerHTML = items.length ? items.map(qrLabelHtml).join("") : `<div class="empty small">No hay etiquetas para mostrar.</div>`;
}
function qrUrl(item, size=140){
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(item.data || item.code || item.label || "")}`;
}
function barcodeUrl(item){
  return `https://bwipjs-api.metafloor.com/?bcid=code128&scale=2&height=9&includetext&text=${encodeURIComponent(item.code || item.label || "")}`;
}
function qrLabelHtml(item){
  return `<div class="qr-label v32-label" data-qr="${esc(item.data || "")}" data-code="${esc(item.code || "")}">
    <div class="label-kind">${item.kind === "location" ? "UBICACIÓN" : "REFERENCIA"}</div>
    <div class="label-code-top">${esc(item.code || "")}</div>
    <div class="label-media">
      <img class="qr-img" alt="QR ${esc(item.label)}" src="${qrUrl(item)}">
      <img class="barcode-img" alt="Código de barras ${esc(item.code)}" src="${barcodeUrl(item)}">
    </div>
    <b>${esc(item.label || "")}</b>
    <span>${esc(item.sub || item.description || "")}</span>
    ${item.location && item.kind !== "location" ? `<em>${esc(item.location)}</em>` : ""}
    ${item.unit ? `<em>Unidad: ${esc(item.unit)}</em>` : ""}
    <div class="stock-marker"><strong>STOCK FÍSICO</strong><i></i></div>
    <small>Texto manual: ${esc(item.kind === "location" ? item.location || item.label || "" : item.ref || item.label || "")}</small>
  </div>`;
}
function qrLabelItemsFromFilters({ all=false } = {}){
  const type = $("#qrType")?.value || "material";
  const q = norm($("#qrSearch")?.value || "");
  const visibleLimit = Math.max(1, Math.min(160, Number($("#qrLimit")?.value || 16)));
  let items;
  if(type === "location"){
    items = [...new Set(state.materials.map(m => String(m.location || "").trim()).filter(Boolean))]
      .sort()
      .filter(l => !q || norm(l).includes(q) || norm(inventoryCode("location", l)).includes(q))
      .map(labelItemFromLocation);
  }else{
    items = state.materials
      .map(labelItemFromMaterial)
      .filter(m => !q || [m.ref,m.description,m.location,m.code].some(v => norm(v).includes(q)));
  }
  return all ? items : items.slice(0, visibleLimit);
}

function dailyTaskLabelItems(){
  const today = todayISO();
  let rows = state.tasks.filter(t => getOpenTaskStatuses().includes(t.status) && (t.scheduledDate || "") === today);
  if(isOperatorRole()) rows = rows.filter(t => ["assigned","recount_required","pending_inventory"].includes(t.status));
  rows.sort((a,b) => String(a.location || "").localeCompare(String(b.location || "")) || String(a.materialRef || "").localeCompare(String(b.materialRef || "")));
  return rows.map(t => taskLabelItem(t, "material")).filter(Boolean);
}
function loadDailyTaskLabels(){
  const items = dailyTaskLabelItems();
  if(!items.length) return toast("No hay pendientes de hoy para cargar etiquetas.", "error");
  state.labelQueue ||= [];
  const byKey = new Map((state.labelQueue || []).map(x => [`${x.kind}|${x.code}`, x]));
  items.forEach(item => byKey.set(`${item.kind}|${item.code}`, { ...item, createdAt:new Date().toISOString(), createdBy:state.user?.email || "", source:"daily_tasks" }));
  state.labelQueue = [...byKey.values()].slice(0, 160);
  saveLabelQueue();
  renderLabelQueue();
  renderQuickLabelDraft();
  toast(`Etiquetas diarias cargadas: ${items.length}`);
}
function printDailyTaskLabels(){
  const items = dailyTaskLabelItems();
  if(!items.length) return toast("No hay stickers diarios para imprimir.", "error");
  printLabelItems(items, $("#qrLabelSize")?.value || "sheet16", { title:"Stickers diarios de conteo" });
}

function printQrLabels(){
  const items = qrLabelItemsFromFilters({ all:false });
  printLabelItems(items, $("#qrLabelSize")?.value || "sheet16", { title:"Etiquetas visibles" });
}
function printAllQrLabels(){
  const items = qrLabelItemsFromFilters({ all:true });
  if(!items.length) return toast("No hay stickers para imprimir con ese filtro.", "error");
  printLabelItems(items, $("#qrLabelSize")?.value || "sheet16", { title:"Todos los stickers filtrados" });
}
function printLabelQueue(){
  const rows = state.labelQueue || [];
  if(!rows.length) return toast("No hay etiquetas en cola para imprimir.", "error");
  printLabelItems(rows, $("#qrLabelSize")?.value || "sheet16", { title:"Cola de codificación" });
}
function chunkItems(arr, size=16){
  const out = [];
  for(let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function printLabelItems(items, size="sheet16", options={}){
  if(!items?.length) return toast("No hay etiquetas para imprimir.", "error");
  const normalized = items
    .filter(Boolean)
    .map(x => ({ ...x, code:x.code || inventoryCode(x.kind || "material", x.label || x.ref || x.location || "") }));
  const pages = chunkItems(normalized, 16).map(page => {
    const fill = Array.from({ length:Math.max(0, 16 - page.length) }, () => `<div class="label-placeholder"></div>`).join("");
    return `<section class="label-page">${page.map(qrLabelHtml).join("")}${fill}</section>`;
  }).join("");
  const w = window.open("", "_blank");
  if(!w) return toast("El navegador bloqueó la ventana de impresión.", "error");
  const title = options.title || "Etiquetas inventario EI";
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} · 16 por hoja</title><style>
    *{box-sizing:border-box}
    html,body{margin:0;color:#0b2d5c;background:#fff}
    body{font-family:"Century Gothic",Arial,sans-serif}
    .print-note{font-size:10px;color:#475467;margin:0 auto 4mm;width:190mm;font-weight:700}
    .label-page{display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(4,62mm);gap:3mm;width:190mm;margin:0 auto;break-after:page;page-break-after:always}
    .label-page:last-child{break-after:auto;page-break-after:auto}
    .qr-label,.label-placeholder{min-width:0;min-height:0}
    .qr-label{border:1px solid #111827;border-radius:5mm;padding:3mm;text-align:center;page-break-inside:avoid;break-inside:avoid;display:grid;grid-template-rows:auto auto 1fr auto auto auto auto;justify-items:center;align-items:center;gap:1.1mm;overflow:hidden;background:#fff}
    .label-placeholder{border:1px dashed transparent;border-radius:5mm}
    .label-kind{font-size:7.5px;font-weight:900;letter-spacing:.08em;color:#344054;border:1px solid #98a2b3;border-radius:99px;padding:1mm 2mm;line-height:1}
    .label-code-top{font-size:8.5px;font-weight:900;color:#0b2d5c;word-break:break-all;line-height:1.05;max-width:100%}
    .label-media{display:grid;grid-template-columns:21mm 1fr;gap:1.5mm;align-items:center;width:100%;min-height:20mm}
    .qr-img{width:21mm;height:21mm;object-fit:contain;background:#fff;border-radius:2mm}
    .barcode-img{width:100%;height:12mm;object-fit:contain;background:#fff;border-radius:1mm}
    .qr-label b{font-size:10.5px;line-height:1.05;color:#0b2d5c;word-break:break-word;max-width:100%}
    .qr-label span{font-size:7.5px;line-height:1.1;color:#344054;max-height:9mm;overflow:hidden}
    .qr-label em{font-style:normal;font-size:7px;line-height:1.05;color:#475467;max-height:7mm;overflow:hidden}
    .stock-marker{width:100%;display:grid;grid-template-columns:auto 1fr;gap:2mm;align-items:center;border:1px dashed #111827;border-radius:2mm;padding:1.4mm 1.6mm;margin-top:.5mm;min-height:8mm;background:#fff}
    .stock-marker strong{font-size:7px;color:#111827;white-space:nowrap}.stock-marker i{display:block;border-bottom:2px solid #111827;height:4mm;width:100%}
    .qr-label small{font-size:6.5px;line-height:1;color:#111827;word-break:break-word;font-weight:800;max-width:100%}
    @page{size:letter;margin:8mm}
    @media screen{body{padding:12px;background:#f3f5f8}.label-page{background:#fff;box-shadow:0 0 0 1px #d0d5dd,0 16px 40px rgba(15,76,151,.12);padding:0}.print-note{margin-bottom:8px}}
    @media print{body{margin:0;background:#fff}.print-note{display:none}.label-page{box-shadow:none}.qr-label{border-color:#111827}}
  </style></head><body><p class="print-note">${esc(title)} · ${normalized.length} sticker(s). Formato hoja carta: 16 stickers por página en matriz 4 x 4, con espacio para stock físico.</p>${pages}<script>setTimeout(()=>print(),900)<\/script></body></html>`);
  w.document.close();
}
function taskLabelItem(task, kind="material"){
  const meta = displayMeta(task);
  if(kind === "location") return meta.location ? labelItemFromLocation(meta.location || task.location || "") : null;
  if(!meta.ref) return null;
  return { kind:"material", label:meta.ref, value:meta.ref, ref:meta.ref, location:meta.location || "", description:meta.description || "Referencia", unit:meta.unit || "", data:inventoryPayload("material", meta.ref, meta), code:inventoryCode("material", meta.ref), sub:meta.description || meta.location || "Referencia" };
}
function addTaskLabelToQueue(taskId, kind="material"){
  const task = state.tasks.find(t => t.id === taskId);
  if(!task) return;
  const item = taskLabelItem(task, kind);
  if(!item?.label) return toast("Esta tarea no tiene datos suficientes para crear etiqueta.", "error");
  addLabelToQueue(item);
  toast(kind === "location" ? "Etiqueta de ubicación agregada." : "Etiqueta de referencia agregada.");
}
function printTaskLabel(taskId, kind="material"){
  const task = state.tasks.find(t => t.id === taskId);
  if(!task) return;
  const item = taskLabelItem(task, kind);
  if(!item?.label) return toast("Esta tarea no tiene datos suficientes para imprimir etiqueta.", "error");
  printLabelItems([item], "sheet16");
}
function referenceMemoryDocId(ref){ return safeId(ref || "sin-referencia"); }
function referenceMemoryFromCount(payload = {}){
  const ref = payload.materialRef || payload.ref || "";
  const date = payload.date || todayISO();
  const countedQty = Number(payload.countedQty || 0);
  const systemQty = Number(payload.systemQty || 0);
  const diff = Number(payload.diff ?? (countedQty - systemQty));
  const unitCost = Number(payload.unitCost || 0);
  const diffValue = Number(payload.diffValue || Math.abs(diff) * unitCost || 0);
  const taskType = payload.taskType || payload.type || "general";
  return {
    ref,
    materialRef:ref,
    referenceCode:inventoryCode("material", ref),
    description:payload.description || "",
    location:payload.location || "",
    unit:payload.unit || "",
    band:payload.band || "",
    lastCountDate:date,
    lastVerifiedDate:date,
    lastSystemQty:systemQty,
    lastCountedQty:countedQty,
    lastDiff:diff,
    lastAbsDiff:Math.abs(diff),
    lastDiffPercent:Number(payload.diffPercent || 0),
    lastDiffValue:diffValue,
    lastSeverity:payload.severity || "",
    lastResult:Math.abs(diff) > 0.0001 ? "Diferencia" : "Exacto",
    lastCause:payload.cause || "N/A",
    lastSupport:payload.support || "",
    lastObs:payload.obs || "",
    lastCountId:payload.countId || "",
    lastTaskId:payload.taskId || "",
    lastTaskType:taskType,
    lastDurationSeconds:Number(payload.countDurationSeconds || 0),
    lastCountedBy:payload.countedByEmail || state.user?.email || "",
    lastCountedByUid:payload.countedByUid || state.user?.uid || "",
    lastCountedByRole:payload.countedByRole || role(),
    countTimes:Number(payload.previousCountTimes || 0) + 1,
    [annualFieldName()]:true,
    ...(taskType === "cable_metraje" ? { [meterFieldName()]:true, lastCableCountDate:date, lastMeterCountDate:date } : {}),
    source:payload.source || "count_saved",
    methodVersion:INVENTORY_HISTORY_VERSION,
    historyCollection:INVENTORY_HISTORY_COLLECTION,
    historyMode:currentHistoryControl().mode,
    historyStatus:currentHistoryControl().historyStatus,
    historyStartDate:historyStartDate(currentHistoryControl()),
    updatedAt:nowTS()
  };
}
async function persistReferenceMemoryFromCount(payload = {}){
  const ref = payload.materialRef || payload.ref || "";
  if(!ref) return;
  try{
    const control = await ensureInventoryHistoryControl();
    const currentV2 = memoryV2ByRef(ref) || {};
    const currentLegacy = memoryByRef(ref) || {};
    const data = {
      ...referenceMemoryFromCount({ ...payload, previousCountTimes:Number(currentV2.countTimes || 0) }),
      methodVersion:INVENTORY_HISTORY_VERSION,
      historyCollection:INVENTORY_HISTORY_COLLECTION,
      historyMode:control.mode,
      historyStatus:control.historyStatus,
      historyStartDate:historyStartDate(control),
      officialStartedDate:control.officialStartedDate || "",
      draftStartedDate:control.draftStartedDate || "",
      historyOrigin:"local_excel_upload"
    };

    await setDoc(doc(db, INVENTORY_HISTORY_COLLECTION, referenceMemoryDocId(ref)), { ...currentV2, ...data }, { merge:true });
    const v2Index = state.referenceMemoryV2.findIndex(m => referenceMemoryDocId(m.ref || m.materialRef || m.id) === referenceMemoryDocId(ref));
    if(v2Index >= 0) state.referenceMemoryV2[v2Index] = { ...state.referenceMemoryV2[v2Index], ...data };
    else state.referenceMemoryV2.push({ id:referenceMemoryDocId(ref), ...data });

    if(isOfficialHistoryActive(control)){
      await setDoc(doc(db, "referenceMemory", referenceMemoryDocId(ref)), { ...currentLegacy, ...data, source:"official_local_excel_history" }, { merge:true });
    }
  }catch(err){
    console.warn("No se pudo actualizar memoria de referencia", err);
  }
}
function saveOfflineQueue(){
  localStorage.setItem("inventarioOfflineCountQueue", JSON.stringify(state.offlineQueue || []));
  updateOfflineStatus();
}
function updateOfflineStatus(){
  const online = navigator.onLine !== false;
  const qty = state.offlineQueue?.length || 0;
  const label = $("#offlineStateBadge");
  const count = $("#offlineQueueCount");
  const pill = $("#offlineStatusPill");
  if(label) label.textContent = online ? "En línea" : "Sin conexión";
  if(count) count.textContent = fmt(qty);
  if(pill){
    pill.classList.toggle("offline", !online);
    pill.classList.toggle("queued", qty > 0);
    pill.title = qty ? `${qty} conteo(s) guardado(s) localmente pendientes por sincronizar.` : (online ? "Conexión disponible" : "Sin conexión. Puedes guardar conteos sin foto para sincronizar después.");
  }
  if($("#expressOfflineQueue")) $("#expressOfflineQueue").textContent = fmt(qty);
}
function enqueueOfflineCount(item){
  state.offlineQueue ||= [];
  state.offlineQueue.push({ ...item, localId:item.localId || `OFF-${Date.now()}-${Math.round(Math.random()*9999)}` });
  saveOfflineQueue();
  toast("Conteo guardado en modo offline. Se sincronizará cuando vuelva internet.");
  notifyUser("Conteo offline guardado", `${item.materialRef || "Referencia"} queda pendiente de sincronizar.`, { tag:item.localId || `off-${Date.now()}` });
}
function buildOfflinePayload({ task=null, caseItem=null, mode="task", saveAndNext=false }){
  const item = task || caseItem || {};
  const meta = displayMeta(item);
  const systemQty = num($("#countSystemQty")?.value || 0);
  const countedQty = num($("#countQty")?.value || 0);
  const diff = countedQty - systemQty;
  const diffMeta = buildDiffMeta(diff, systemQty, Number($("#countUnitCost")?.value || meta.unitCost || 0));
  return {
    localId:`OFF-${Date.now()}-${safeId(meta.ref || item.materialRef || "ref")}`,
    kind:task ? "task" : "case",
    mode,
    saveAndNext,
    task: task ? { ...task, ...meta } : null,
    caseItem: caseItem ? { ...caseItem, ...meta } : null,
    materialRef:meta.ref || item.materialRef || "",
    description:meta.description || item.description || "",
    location:meta.location || item.location || "",
    date:$("#countDate")?.value || todayISO(),
    systemQty, countedQty, diff, absDiff:Math.abs(diff),
    unitCost:Number($("#countUnitCost")?.value || meta.unitCost || 0),
    diffPercent:diffMeta.percent,
    diffValue:diffMeta.value,
    severity:diffMeta.severity,
    recommendedAction:diffMeta.recommendation,
    cause:$("#countCause")?.value || "N/A",
    support:$("#countSupport")?.value || "",
    obs:$("#countObs")?.value || "",
    countStartedAt:$("#countStartedAt")?.value || state.express.countStartedAt || "",
    countDurationSeconds:countDurationSeconds(),
    countedByUid:state.user?.uid || "",
    countedByEmail:state.user?.email || "",
    countedByRole:role(),
    createdLocalAt:new Date().toISOString()
  };
}
async function persistQueuedTaskCount(q){
  const taskId = q.task?.id || q.taskId || "";
  let task = q.task || {};
  if(taskId){
    try{
      const snap = await getDoc(doc(db, "countTasks", taskId));
      if(snap.exists()) task = { id:snap.id, ...snap.data() };
    }catch(err){ console.warn("No se pudo refrescar tarea offline", err); }
  }
  const isCable = task.taskType === "cable_metraje" || task.type === "cable_metraje" || q.task?.isCable;
  const hasDiff = Number(q.absDiff || 0) > 0.0001;
  const countRef = await addDoc(collection(db, "counts"), {
    taskId:task.id || taskId, taskType:task.taskType || task.type || q.task?.taskType || "general",
    materialRef:q.materialRef, materialId:task.materialId || q.task?.materialId || safeId(q.materialRef), description:q.description || task.description || "", location:q.location || task.location || "", band:task.band || q.task?.band || "", date:q.date || todayISO(), systemQty:Number(q.systemQty || 0), countedQty:Number(q.countedQty || 0), diff:Number(q.diff || 0), absDiff:Number(q.absDiff || 0), unitCost:Number(q.unitCost || 0), diffPercent:Number(q.diffPercent || 0), diffValue:Number(q.diffValue || 0), severity:q.severity || "", recommendedAction:q.recommendedAction || "", result:hasDiff ? "Diferencia" : "Exacto", cause:q.cause || "N/A", support:q.support || "", obs:q.obs || "", countedByUid:q.countedByUid, countedByEmail:q.countedByEmail, countedByRole:q.countedByRole, countStartedAt:q.countStartedAt || "", countDurationSeconds:Number(q.countDurationSeconds || 0), offlineLocalId:q.localId, offlineCreatedAt:q.createdLocalAt || "", syncedFromOffline:true, createdAt:nowTS()
  });
  await persistReferenceMemoryFromCount({ ...q, taskId:task.id || taskId, countId:countRef.id, taskType:task.taskType || task.type || q.task?.taskType || "general", source:"offline_task_count" });
  if(!task.id) return;
  if(!hasDiff){
    await updateDoc(doc(db, "countTasks", task.id), { status:"pending_jefe_approval", lastCountId:countRef.id, updatedAt:nowTS(), lastComment:isCable ? "Metraje exacto registrado offline y sincronizado." : "Conteo exacto registrado offline y sincronizado." });
    await addDoc(collection(db, "cases"), { materialRef:q.materialRef, materialId:task.materialId || safeId(q.materialRef), description:q.description || "", location:q.location || "", status:"pending_jefe_approval", type:isCable ? "aprobacion_metraje_exacto" : "aprobacion_conteo_exacto", diff:0, unitCost:Number(q.unitCost || 0), diffPercent:0, diffValue:0, severity:"exacto", sourceTaskId:task.id, lastCountId:countRef.id, lastComment:"Conteo exacto sincronizado desde modo offline. Pendiente aprobación jefe logístico.", createdAt:nowTS(), createdByUid:q.countedByUid, createdByEmail:q.countedByEmail, history:[{ at:new Date().toISOString(), by:q.countedByEmail, role:q.countedByRole, action:"sincronizacion_offline", comment:"Conteo exacto guardado offline y sincronizado." }] });
  }else if(Number(task.recountRound || 0) < 1){
    const recountId = `${isCable ? "METERREC" : "REC"}-${todayISO()}-${safeId(q.materialRef)}-${Date.now()}`;
    await setDoc(doc(db, "countTasks", recountId), { ...task, status:"recount_required", type:isCable ? "reconteo_metraje" : "reconteo_inventario", taskType:isCable ? "cable_metraje" : "reconteo_inventario", recountRound:Number(task.recountRound || 0) + 1, scheduledDate:todayISO(), priority:120000, origin:"offline_reconteo_por_diferencia", createdAt:nowTS(), createdByUid:q.countedByUid, createdByEmail:q.countedByEmail, previousTaskId:task.id, previousCountId:countRef.id });
    await updateDoc(doc(db, "countTasks", task.id), { status:"closed_with_difference_recount_created", lastCountId:countRef.id, updatedAt:nowTS(), lastComment:"Diferencia detectada offline. Se generó reconteo obligatorio." });
  }else{
    await updateDoc(doc(db, "countTasks", task.id), { status:"pending_jefe_logistico", lastCountId:countRef.id, updatedAt:nowTS(), lastComment:"Diferencia persistente sincronizada desde modo offline." });
    await addDoc(collection(db, "cases"), { materialRef:q.materialRef, materialId:task.materialId || safeId(q.materialRef), description:q.description || "", location:q.location || "", status:"pending_jefe_logistico", type:isCable ? "diferencia_persistente_metraje" : "diferencia_persistente_inventario", diff:Number(q.diff || 0), unitCost:Number(q.unitCost || 0), diffPercent:Number(q.diffPercent || 0), diffValue:Number(q.diffValue || 0), severity:q.severity || "media", sourceTaskId:task.id, lastCountId:countRef.id, lastComment:"La diferencia persistió y fue sincronizada desde modo offline.", createdAt:nowTS(), createdByUid:q.countedByUid, createdByEmail:q.countedByEmail, history:[{ at:new Date().toISOString(), by:q.countedByEmail, role:q.countedByRole, action:"diferencia_persistente_offline", comment:q.obs || "Diferencia persistente sincronizada desde offline." }] });
  }
}
async function persistQueuedCaseCount(q){
  const c = q.caseItem || {};
  const caseId = c.id || q.caseId;
  if(!caseId) return;
  const countRef = await addDoc(collection(db, "counts"), { caseId, taskType:q.mode === "auditoria" ? "conteo_auditoria" : "conteo_jefe_logistico", materialRef:q.materialRef, materialId:c.materialId || safeId(q.materialRef), description:q.description || c.description || "", location:q.location || c.location || "", date:q.date || todayISO(), systemQty:Number(q.systemQty || 0), countedQty:Number(q.countedQty || 0), diff:Number(q.diff || 0), absDiff:Number(q.absDiff || 0), unitCost:Number(q.unitCost || 0), diffPercent:Number(q.diffPercent || 0), diffValue:Number(q.diffValue || 0), severity:q.severity || "", recommendedAction:q.recommendedAction || "", result:Number(q.absDiff || 0) > 0.0001 ? "Diferencia" : "Exacto", cause:q.cause || "N/A", support:q.support || "", obs:q.obs || "", countedByUid:q.countedByUid, countedByEmail:q.countedByEmail, countedByRole:q.countedByRole, countStartedAt:q.countStartedAt || "", countDurationSeconds:Number(q.countDurationSeconds || 0), offlineLocalId:q.localId, syncedFromOffline:true, createdAt:nowTS() });
  await persistReferenceMemoryFromCount({ ...q, caseId, countId:countRef.id, taskType:q.mode === "auditoria" ? "conteo_auditoria" : "conteo_jefe_logistico", source:"offline_case_count" });
  await updateDoc(doc(db, "cases", caseId), { lastCountId:countRef.id, lastSystemQty:Number(q.systemQty || 0), lastCountedQty:Number(q.countedQty || 0), diff:Number(q.diff || 0), diffPercent:Number(q.diffPercent || 0), diffValue:Number(q.diffValue || 0), severity:q.severity || "", lastComment:q.obs || "Conteo de caso sincronizado desde modo offline.", updatedAt:nowTS(), updatedByUid:q.countedByUid, updatedByEmail:q.countedByEmail, history:arrayUnion({ at:new Date().toISOString(), by:q.countedByEmail, role:q.countedByRole, action:q.mode === "auditoria" ? "conteo_auditoria_offline" : "conteo_jefe_offline", comment:q.obs || "Sincronizado desde offline." }) });
}
async function flushOfflineCountQueue(){
  updateOfflineStatus();
  if(navigator.onLine === false || !state.offlineQueue?.length) return;
  const pending = [...state.offlineQueue];
  let ok = 0;
  for(const item of pending){
    try{
      if(item.kind === "task") await persistQueuedTaskCount(item);
      else await persistQueuedCaseCount(item);
      state.offlineQueue = state.offlineQueue.filter(x => x.localId !== item.localId);
      ok++;
      saveOfflineQueue();
    }catch(err){
      console.warn("No se pudo sincronizar conteo offline", item, err);
      break;
    }
  }
  if(ok){
    toast(`Modo offline: ${ok} conteo(s) sincronizados.`);
    await refreshAll();
  }
}

function renderAll(){
  renderKpis();
  renderDashboard();
  renderRoleDashboard();
  renderExpress();
  renderTasks();
  renderHistory();
  renderCableTasks();
  renderCases();
  renderExecutiveDashboard();
  renderMaterials();
  renderSettings();
  renderLineCatalog();
  renderQrLabels();
  renderQuickLabelDraft();
  renderLabelQueue();
  renderIndicators();
  renderDriveConfig();
  if(isSuper()) renderUsers();
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
  const pendingValueEl = $("#kpiPendingValue");
  const countedValueEl = $("#kpiCountedValue");
  if(pendingValueEl) pendingValueEl.textContent = money(active.filter(m => !wasCountedThisYear(m)).reduce((s,m)=>s+Number(m.inventoryValue||0),0));
  if(countedValueEl) countedValueEl.textContent = money(active.filter(wasCountedThisYear).reduce((s,m)=>s+Number(m.inventoryValue||0),0));
}

function renderDashboard(){
  const bands = groupBy(state.materials, m => m.band || "E");
  const total = state.materials.length || 1;
  const countedYear = state.materials.filter(m => m.active !== false && wasCountedThisYear(m)).length;
  const pendingYear = Math.max(0, state.materials.filter(m => m.active !== false).length - countedYear);
  const dailyNeeded = annualDailyTarget(pendingYear, Number(state.settings.dailyLimit || 30));
  const pendingValue = state.materials.filter(m => m.active !== false && !wasCountedThisYear(m)).reduce((s,m)=>s+Number(m.inventoryValue||0),0);
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
    `<div class="summary-item"><span>Valor pendiente por contar</span><b>${money(pendingValue)}</b></div>` +
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
  const totalCables = state.materials.filter(m => isCableMaterial(m)).length;
  const counted = state.materials.filter(m => isCableMaterial(m) && lastCableCountYear(m) === yearOf(today)).length;
  const mature = state.materials.filter(m => isCableMaterial(m) && isCableMature(m, today) && lastCableCountYear(m) !== yearOf(today)).length;
  const notice = !isOpen
    ? `<div class="notice"><b>Módulo bloqueado:</b> la próxima sesión aleatoria de metraje se habilita el <b>${esc(nextSession)}</b>. Cables pendientes del año: <b>${fmt(Math.max(0,totalCables-counted))}</b>. Cables maduros disponibles: <b>${fmt(mature)}</b>.</div>`
    : `<div class="notice"><b>Módulo habilitado:</b> sesión aleatoria de metraje. No usa criticidad ni Pareto; excluye cables recién ingresados o cortados hasta cumplir <b>${fmt(state.settings.cableCooldownDays || 15)} días</b>.</div>`;
  $("#cableTasksTable").innerHTML = notice + taskTable(rows, true);
  bindTaskButtons();
}
function taskTable(rows, cable = false){
  if(!rows.length) return `<div class="empty">No hay tareas abiertas.</div>`;
  if(isOperatorRole()){
    return `<div class="task-card-list operator-task-list">${rows.map(t => {
      const meta = displayMeta(t);
      const isCable = t.taskType === "cable_metraje" || t.type === "cable_metraje" || meta.isCable;
      const canCount = ["assigned","recount_required","pending_inventory"].includes(t.status);
      return `<article class="task-card operator-task-card">
        <div class="task-card-top"><b>${esc(meta.ref || t.materialRef || "")}</b>${statusPill(t.status)}</div>
        <p>${esc(meta.description || "Referencia sin nombre")}</p>
        <div class="task-card-meta"><span>${esc(meta.location || "Sin ubicación")}</span><span>Unidad: ${esc(meta.unit || (isCable ? "m" : "und"))}</span><span>${isCable ? "Cable / metraje" : "Inventario"}</span></div>
        <div class="task-card-actions">${canCount ? `<button class="tiny blue" data-count-task="${esc(t.id)}">Contar</button>` : ""}</div>
      </article>`;
    }).join("")}</div>`;
  }
  const cards = `<div class="task-card-list">${rows.map(t => {
    const risk = taskRiskMeta(t);
    const value = Number(t.inventoryValue || ((t.unitCost || 0) * (t.systemQty || 0)) || 0);
    const canCount = ["assigned","recount_required","pending_inventory"].includes(t.status);
    return `<article class="task-card">
      <div class="task-card-top"><b>${esc(t.materialRef || "")}</b><span class="pill ${risk.cls}">Riesgo ${risk.score}</span></div>
      <p>${esc(t.description || "")}</p>
      <div class="task-card-meta"><span>${esc(t.location || "Sin ubicación")}</span><span>${esc(t.band || "")}</span><span>${money(value)}</span></div>
      <div class="task-card-actions">${statusPill(t.status)}${canCount ? `<button class="tiny" data-count-task="${esc(t.id)}">Contar</button>` : ""}${t.status === "pending_jefe_approval" && hasAny(["jefe_logistico"]) ? `<button class="tiny blue" data-approve-task="${esc(t.id)}">Aprobar</button>` : ""}</div>
    </article>`;
  }).join("")}</div>`;
  const table = `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Referencia</th><th>Descripción</th><th>Línea</th><th>Ubicación</th><th>Banda</th><th>${cable ? "Metros sistema" : "Stock"}</th><th>Costo</th><th>Valor</th><th>Riesgo</th><th>Tipo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows.map(t => {
    const cat = catalogMaterial(t.materialRef);
    const desc = t.description || cat?.description || "";
    const line = t.catalogLine || t.category || cat?.line || "";
    const value = Number(t.inventoryValue || ((t.unitCost || 0) * (t.systemQty || 0)) || 0);
    const risk = taskRiskMeta(t);
    return `<tr><td>${esc(t.scheduledDate || "")}</td><td><b>${esc(t.materialRef)}</b></td><td>${esc(desc)}</td><td>${esc(line)}</td><td>${esc(t.location || "")}</td><td><span class="pill dark">${esc(t.band || "")}</span></td><td>${shouldBlindCount() ? "Oculto" : fmt(t.systemQty)}</td><td>${money(t.unitCost || 0)}</td><td>${money(value)}</td><td><span class="pill ${risk.cls}">${risk.score}</span></td><td>${esc(t.taskType || t.type || "general")}</td><td>${statusPill(t.status)}</td><td><div class="row-actions">${["assigned","recount_required","pending_inventory"].includes(t.status) ? `<button class="tiny" data-count-task="${esc(t.id)}">Registrar</button>` : ""}${t.status === "pending_jefe_approval" && hasAny(["jefe_logistico"]) ? `<button class="tiny blue" data-approve-task="${esc(t.id)}">Aprobar</button>` : ""}</div></td></tr>`;
  }).join("")}</tbody></table></div>`;
  return cards + table;
}
function bindTaskButtons(){
  $$('[data-count-task]').forEach(btn => btn.addEventListener("click", () => openTaskCountDialog(btn.dataset.countTask)));
  $$('[data-approve-task]').forEach(btn => btn.addEventListener("click", () => approveTask(btn.dataset.approveTask)));
}


function renderHistory(){
  const el = $("#historyTable");
  if(!el) return;
  let rows = [...state.counts];
  if(!isSuper()) rows = rows.filter(c => c.countedByUid === state.user?.uid || c.countedByEmail === state.user?.email);
  rows = rows.slice(0,120);
  if(!rows.length){ el.innerHTML = `<div class="empty">Aún no hay conteos recientes para mostrar.</div>`; return; }
  if(isOperatorRole()){
    el.innerHTML = `<div class="task-card-list operator-history-list">${rows.map(c => `<article class="task-card operator-task-card"><div class="task-card-top"><b>${esc(c.materialRef || "")}</b><span class="pill blue">Guardado</span></div><p>${esc(c.description || "")}</p><div class="task-card-meta"><span>${esc(c.date || formatDateTime(c.createdAt))}</span><span>Físico registrado: ${fmt(c.countedQty || 0)}</span><span>${c.countDurationSeconds ? fmt(Math.round(Number(c.countDurationSeconds)/60)) + " min" : "—"}</span></div></article>`).join("")}</div>`;
    return;
  }
  const cards = `<div class="task-card-list">${rows.map(c => `<article class="task-card"><div class="task-card-top"><b>${esc(c.materialRef || "")}</b><span class="pill ${severityClass(c.severity || (Number(c.absDiff||0)>0 ? "media" : "exacto"))}">${severityLabel(c.severity || (Number(c.absDiff||0)>0 ? "media" : "exacto"))}</span></div><p>${esc(c.description || "")}</p><div class="task-card-meta"><span>${esc(c.date || "")}</span><span>Diferencia ${fmt(c.diff || 0)}</span><span>${money(c.diffValue || 0)}</span></div></article>`).join("")}</div>`;
  const table = `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Referencia</th><th>Descripción</th><th>Sistema</th><th>Físico</th><th>Diferencia</th><th>Valor</th><th>Severidad</th><th>Tiempo</th><th>Usuario</th></tr></thead><tbody>${rows.map(c => `<tr><td>${esc(c.date || formatDateTime(c.createdAt))}</td><td><b>${esc(c.materialRef || "")}</b></td><td>${esc(c.description || "")}</td><td>${fmt(c.systemQty || 0)}</td><td>${fmt(c.countedQty || 0)}</td><td>${fmt(c.diff || 0)}</td><td>${money(c.diffValue || 0)}</td><td><span class="pill ${severityClass(c.severity || (Number(c.absDiff||0)>0 ? "media" : "exacto"))}">${severityLabel(c.severity || (Number(c.absDiff||0)>0 ? "media" : "exacto"))}</span></td><td>${c.countDurationSeconds ? fmt(Math.round(Number(c.countDurationSeconds)/60)) + " min" : "—"}</td><td>${esc(c.countedByEmail || "")}</td></tr>`).join("")}</tbody></table></div>`;
  el.innerHTML = cards + table;
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
  if(cable === "cable") rows = rows.filter(m => isCableMaterial(m));
  rows = rows.slice(0, 1000);
  if(!rows.length){ $("#materialsTable").innerHTML = `<div class="empty">No hay materiales para mostrar.</div>`; return; }
  $("#materialsTable").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Referencia</th><th>Descripción</th><th>Línea</th><th>Ubicación</th><th>Stock</th><th>Costo</th><th>Valor</th><th>Banda</th><th>Cable</th><th>Razón cable</th><th>Disponible metraje</th></tr></thead><tbody>${rows.map(m => `${(() => { const cat = catalogMaterial(m.ref); const desc = m.description || cat?.description || ""; const line = m.catalogLine || m.category || cat?.line || ""; return `<tr><td><b>${esc(m.ref)}</b></td><td>${esc(desc)}</td><td>${esc(line)}</td><td>${esc(m.location || "")}</td><td>${fmt(m.stockSystem)}</td><td>${money(m.unitCost)}</td><td>${money(m.inventoryValue)}</td><td><span class="pill dark">${esc(m.band || "")}</span></td><td>${isCableMaterial(m) ? '<span class="pill blue">Cable</span>' : '<span class="pill gray">Normal</span>'}</td><td>${esc(m.cableReason || "")}</td><td>${esc(m.cableAvailableDate || "")}</td></tr>`; })()}`).join("")}</tbody></table></div>`;
}

function renderLineCatalog(){
  const el = $("#lineCatalogTable");
  if(!el) return;
  const q = norm($("#lineSearch")?.value || "");
  const f = $("#lineCableFilter")?.value || "";
  let rows = [...(state.lineCatalog?.lines || [])];
  if(q) rows = rows.filter(l => [l.line,l.reason].some(v => norm(v).includes(q)));
  if(f === "cable") rows = rows.filter(l => l.isCableLine);
  if(f === "normal") rows = rows.filter(l => !l.isCableLine);
  rows.sort((a,b) => Number(b.isCableLine)-Number(a.isCableLine) || String(a.line).localeCompare(String(b.line)));
  if(!rows.length){ el.innerHTML = `<div class="empty">No hay líneas para mostrar.</div>`; return; }
  const totals = state.lineCatalog?.totals || {};
  el.innerHTML = `<div class="summary-list" style="margin-bottom:12px"><div class="summary-item"><span>Líneas cargadas</span><b>${fmt(totals.lines || rows.length)}</b></div><div class="summary-item"><span>Referencias catálogo</span><b>${fmt(totals.materials || 0)}</b></div><div class="summary-item"><span>Líneas cable</span><b>${fmt(totals.cableLines || 0)}</b></div><div class="summary-item"><span>Referencias cable</span><b>${fmt(totals.cableMaterials || 0)}</b></div></div>` +
  `<div class="table-wrap"><table><thead><tr><th>Línea</th><th>Tipo</th><th>Referencias</th><th>Refs cable</th><th>% cable</th><th>Razón</th></tr></thead><tbody>${rows.map(l => `<tr><td><b>${esc(l.line || "")}</b></td><td>${l.isCableLine ? '<span class="pill blue">Cable</span>' : '<span class="pill gray">Normal</span>'}</td><td>${fmt(l.total || 0)}</td><td>${fmt(l.cableCount || 0)}</td><td>${fmt(l.cablePercent || 0)}%</td><td>${esc(l.reason || "")}</td></tr>`).join("")}</tbody></table></div>`;
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
  if($("#setBlindCount")) $("#setBlindCount").value = state.settings.blindCountInventory === false ? "false" : "true";
  if($("#setMinorDiffPercent")) $("#setMinorDiffPercent").value = Number(state.settings.minorDiffPercent ?? 1);
  if($("#setCriticalDiffPercent")) $("#setCriticalDiffPercent").value = Number(state.settings.criticalDiffPercent ?? 10);
  if($("#setCriticalDiffValue")) $("#setCriticalDiffValue").value = Number(state.settings.criticalDiffValue ?? 500000);
  if($("#setHighRiskScore")) $("#setHighRiskScore").value = Number(state.settings.highRiskScoreThreshold ?? 70);
  if($("#setPhotoCritical")) $("#setPhotoCritical").value = state.settings.requirePhotoCritical === false ? "false" : "true";
  if($("#setPhotoCableDiff")) $("#setPhotoCableDiff").value = state.settings.requirePhotoCableDiff === false ? "false" : "true";
  if($("#setEvidenceMedium")) $("#setEvidenceMedium").value = state.settings.requireEvidenceMedium === false ? "false" : "true";
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
  next.blindCountInventory = $("#setBlindCount") ? $("#setBlindCount").value !== "false" : true;
  next.minorDiffPercent = Number($("#setMinorDiffPercent")?.value || 1);
  next.criticalDiffPercent = Number($("#setCriticalDiffPercent")?.value || 10);
  next.criticalDiffValue = Number($("#setCriticalDiffValue")?.value || 500000);
  next.highRiskScoreThreshold = Number($("#setHighRiskScore")?.value || 70);
  next.requirePhotoCritical = $("#setPhotoCritical") ? $("#setPhotoCritical").value !== "false" : true;
  next.requirePhotoCableDiff = $("#setPhotoCableDiff") ? $("#setPhotoCableDiff").value !== "false" : true;
  next.requireEvidenceMedium = $("#setEvidenceMedium") ? $("#setEvidenceMedium").value !== "false" : true;
  $$('[data-band]').forEach(input => { const idx = Number(input.dataset.band), field = input.dataset.field; next.bands[idx][field] = field === "limit" || field === "frequency" ? Number(input.value) : input.value; });
  next.bands.sort((a,b) => Number(a.limit) - Number(b.limit));
  next.updatedAt = nowTS();
  await setDoc(doc(db, "settings", "inventory"), next, { merge:true });
  state.settings = next;
  toast("Configuración guardada.");
  renderAll();
}


function diffPercent(absDiff, systemQty){
  const base = Math.abs(Number(systemQty || 0));
  const diff = Math.abs(Number(absDiff || 0));
  if(base <= 0) return diff > 0 ? 100 : 0;
  return diff / base * 100;
}
function buildDiffMeta(diff, systemQty, unitCost = 0){
  const absDiff = Math.abs(Number(diff || 0));
  const percent = diffPercent(absDiff, systemQty);
  const value = absDiff * Math.max(Number(unitCost || 0), 0);
  const criticalPercent = Number(state.settings.criticalDiffPercent ?? 10);
  const criticalValue = Number(state.settings.criticalDiffValue ?? 500000);
  const minorPercent = Number(state.settings.minorDiffPercent ?? 1);
  let severity = "exacto";
  let recommendation = "Sin diferencia. Pasar a aprobación del jefe logístico.";
  if(absDiff > 0.0001){
    if(value >= criticalValue || percent >= criticalPercent){
      severity = "critica";
      recommendation = "Diferencia crítica: conservar evidencia, revisar movimiento documental y escalar si se repite en reconteo.";
    }else if(percent >= minorPercent){
      severity = "media";
      recommendation = "Diferencia media: registrar causa, soporte y ejecutar reconteo obligatorio.";
    }else{
      severity = "menor";
      recommendation = "Diferencia menor: registrar soporte y validar unidad de medida o ubicación antes del reconteo.";
    }
  }
  return { absDiff, percent, value, severity, recommendation };
}
function severityLabel(severity){
  return { exacto:"Exacto", menor:"Menor", media:"Media", critica:"Crítica" }[severity] || "Sin clasificar";
}
function severityClass(severity){
  return { exacto:"green", menor:"yellow", media:"blue", critica:"red" }[severity] || "gray";
}
function shouldBlindCount(){
  return role() === "inventario";
}
function setSystemQtyVisibility(blind){
  const label = $("#systemQtyLabel");
  if(!label) return;
  label.classList.toggle("blind-hidden", Boolean(blind));
}
function updateCountPreview(){
  const el = $("#countDiffPreview");
  if(!el) return;
  if(shouldBlindCount()){
    el.innerHTML = `<div class="operator-preview-note"><b>Conteo ciego activo.</b><span>La APP no muestra diferencia, porcentaje, valor ni stock sistema al auxiliar. Solo guarda la cantidad física para validación posterior.</span></div>`;
    return;
  }
  const systemQty = num($("#countSystemQty")?.value || 0);
  const countedRaw = $("#countQty")?.value;
  if(countedRaw === "" || countedRaw === undefined){
    el.innerHTML = `<span class="muted-mini">Ingrese la cantidad física para calcular diferencia, porcentaje, impacto y ruta de control.</span>`;
    return;
  }
  const countedQty = num(countedRaw);
  const unitCost = num($("#countUnitCost")?.value || 0);
  const diff = countedQty - systemQty;
  const meta = buildDiffMeta(diff, systemQty, unitCost);
  const item = countContextItem();
  const evidenceNote = requiresPhotoForCount(meta, item) ? " Foto obligatoria por severidad o metraje." : (requiresSupportForCount(meta) ? " Registre soporte, causa u observación para cerrar trazabilidad." : "");
  el.innerHTML = `
    <div class="count-preview-row">
      <span>Diferencia</span><b>${fmt(diff)}</b>
      <span>%</span><b>${fmt(meta.percent)}%</b>
      <span>Impacto</span><b>${money(meta.value)}</b>
      <span>Semáforo</span><b><span class="pill ${severityClass(meta.severity)}">${severityLabel(meta.severity)}</span></b>
    </div>
    <div class="count-preview-note">${esc(meta.recommendation)}${esc(evidenceNote)}${shouldBlindCount() ? " El stock de sistema está oculto para evitar sesgo en el conteo." : ""}</div>`;
}
function causeParetoRows(counts){
  const map = new Map();
  counts.filter(c => Number(c.absDiff || 0) > 0).forEach(c => {
    const key = c.cause || "Sin causa";
    const value = Number(c.diffValue || 0) || Math.abs(Number(c.diff || 0)) * Number(c.unitCost || 0);
    const current = map.get(key) || { cause:key, qty:0, value:0 };
    current.qty += 1;
    current.value += value;
    map.set(key, current);
  });
  return [...map.values()].sort((a,b) => b.qty - a.qty || b.value - a.value).slice(0, 6);
}


function heatMapRows(counts){
  const map = new Map();
  counts.filter(c => Number(c.absDiff || 0) > 0).forEach(c => {
    const key = c.location || "Sin ubicación";
    const value = Number(c.diffValue || 0) || Math.abs(Number(c.diff || 0)) * Number(c.unitCost || 0);
    const current = map.get(key) || { location:key, qty:0, value:0 };
    current.qty += 1;
    current.value += value;
    map.set(key, current);
  });
  return [...map.values()].sort((a,b) => b.value - a.value || b.qty - a.qty).slice(0, 6);
}
function repeatedDifferenceRows(counts){
  const map = new Map();
  counts.filter(c => Number(c.absDiff || 0) > 0).forEach(c => {
    const key = c.materialRef || "Sin referencia";
    const value = Number(c.diffValue || 0) || Math.abs(Number(c.diff || 0)) * Number(c.unitCost || 0);
    const current = map.get(key) || { ref:key, qty:0, value:0 };
    current.qty += 1;
    current.value += value;
    map.set(key, current);
  });
  return [...map.values()].filter(r => r.qty > 1).sort((a,b) => b.qty - a.qty || b.value - a.value).slice(0, 6);
}
function productivityRows(counts){
  const map = new Map();
  counts.filter(c => Number(c.countDurationSeconds || 0) > 0).forEach(c => {
    const key = c.countedByEmail || "Sin usuario";
    const current = map.get(key) || { user:key, qty:0, seconds:0 };
    current.qty += 1;
    current.seconds += Number(c.countDurationSeconds || 0);
    map.set(key, current);
  });
  return [...map.values()].map(r => ({ ...r, avg:r.qty ? Math.round(r.seconds / r.qty) : 0 })).sort((a,b) => b.qty - a.qty).slice(0, 6);
}

function renderIndicators(){
  const cov = $("#coverageIndicators");
  const qual = $("#qualityIndicators");
  const pareto = $("#variancePareto");
  if(!cov || !qual) return;

  const total = state.materials.filter(m => m.active !== false).length;
  const counted = state.materials.filter(m => m.active !== false && wasCountedThisYear(m)).length;
  const pending = Math.max(0, total - counted);
  const pendingValue = state.materials.filter(m => m.active !== false && !wasCountedThisYear(m)).reduce((s,m)=>s+Number(m.inventoryValue||0),0);
  const countedValue = state.materials.filter(m => m.active !== false && wasCountedThisYear(m)).reduce((s,m)=>s+Number(m.inventoryValue||0),0);
  const totalValue = state.materials.filter(m => m.active !== false).reduce((s,m)=>s+Number(m.inventoryValue||0),0);
  const dailyTarget = annualDailyTarget(pending, Number(state.settings.dailyLimit || 30));
  const cables = state.materials.filter(m => m.active !== false && isCableMaterial(m));
  const meterDone = cables.filter(wasMeterCountedThisYear).length;

  const diffs = state.counts.filter(c => Number(c.absDiff || 0) > 0);
  const totalCounts = state.counts.length;
  const accuracy = totalCounts ? Math.round((totalCounts - diffs.length) / totalCounts * 100) : 0;
  const diffValueTotal = state.counts.reduce((s,c) => s + (Number(c.diffValue || 0) || Math.abs(Number(c.diff || 0)) * Number(c.unitCost || 0)), 0);
  const countedValueSample = state.counts.reduce((s,c) => s + Math.abs(Number(c.systemQty || 0) * Number(c.unitCost || 0)), 0);
  const valueAccuracy = countedValueSample ? Math.max(0, Math.round((1 - diffValueTotal / countedValueSample) * 100)) : 0;
  const criticalDiffs = state.counts.filter(c => c.severity === "critica" || c.severity === "crítica").length;
  const avgDiffValue = totalCounts ? diffValueTotal / totalCounts : 0;
  const reliability = reliabilityMetrics();
  const health = inventoryHealthMetrics();

  cov.innerHTML = `
    <div class="summary-item"><span>Materiales activos</span><b>${fmt(total)}</b></div>
    <div class="summary-item"><span>Contados en el año</span><b>${fmt(counted)}</b></div>
    <div class="summary-item"><span>Pendientes del año</span><b>${fmt(pending)}</b></div>
    <div class="summary-item"><span>Meta diaria calculada</span><b>${fmt(dailyTarget)}</b></div>
    <div class="summary-item"><span>Valor total inventario</span><b>${money(totalValue)}</b></div>
    <div class="summary-item"><span>Valor pendiente por contar</span><b>${money(pendingValue)}</b></div>
    <div class="summary-item"><span>Valor contado/verificado</span><b>${money(countedValue)}</b></div>
    <div class="summary-item"><span>Cobertura anual general</span><b>${total ? Math.round(counted/total*100) : 0}%</b></div>
    <div class="summary-item"><span>Cables identificados</span><b>${fmt(cables.length)}</b></div>
    <div class="summary-item"><span>Metrajes hechos en el año</span><b>${fmt(meterDone)}</b></div>
    <div class="summary-item"><span>Cobertura anual metraje</span><b>${cables.length ? Math.round(meterDone/cables.length*100) : 0}%</b></div>
  `;

  qual.innerHTML = `
    <div class="summary-item"><span>Conteos registrados recientes</span><b>${fmt(totalCounts)}</b></div>
    <div class="summary-item"><span>Conteos con diferencia</span><b>${fmt(diffs.length)}</b></div>
    <div class="summary-item"><span>Exactitud reciente por referencia</span><b>${accuracy}%</b></div>
    <div class="summary-item"><span>Exactitud reciente por valor</span><b>${valueAccuracy}%</b></div>
    <div class="summary-item"><span>Impacto total diferencias</span><b>${money(diffValueTotal)}</b></div>
    <div class="summary-item"><span>Impacto promedio por conteo</span><b>${money(avgDiffValue)}</b></div>
    <div class="summary-item"><span>Diferencias críticas</span><b>${fmt(criticalDiffs)}</b></div>
    <div class="summary-item"><span>Confiabilidad operativa</span><b>${reliability.score}% · ${esc(reliability.level)}</b></div>
    <div class="summary-item"><span>Memoria de referencias</span><b>${reliability.memoryCoverage}%</b></div>
    <div class="summary-item"><span>Completitud de datos</span><b>${reliability.dataCompleteness}%</b></div>
    <div class="summary-item"><span>Tasa de diferencias</span><b>${health.differenceRate}%</b></div>
    <div class="summary-item"><span>Desviación sobre valor contado</span><b>${health.shrinkageRate}%</b></div>
    <div class="summary-item"><span>Diferencia neta valorizada</span><b>${money(health.netDiffValue)}</b></div>
    <div class="summary-item"><span>Cumplimiento plan diario</span><b>${health.planCompliance}%</b></div>
    <div class="summary-item"><span>Productividad estimada</span><b>${health.countsPerHour ? health.countsPerHour + " conteos/h" : "—"}</b></div>
    <div class="summary-item"><span>Memoria mayor a 180 días</span><b>${fmt(health.staleMemory)}</b></div>
    <div class="summary-item"><span>Casos abiertos</span><b>${fmt(state.cases.length)}</b></div>
    <div class="summary-item"><span>Jefe logístico pendientes</span><b>${fmt(state.cases.filter(c => String(c.status).includes("jefe")).length)}</b></div>
    <div class="summary-item"><span>Auditoría pendientes</span><b>${fmt(state.cases.filter(c => String(c.status).includes("auditoria")).length)}</b></div>
    <div class="summary-item"><span>Gerencia pendientes</span><b>${fmt(state.cases.filter(c => String(c.status).includes("gerencia")).length)}</b></div>
  `;

  if(pareto){
    const causeRows = causeParetoRows(state.counts);
    const severityRows = ["critica","media","menor","exacto"].map(sev => ({
      sev,
      qty:state.counts.filter(c => (c.severity || (Number(c.absDiff||0)>0 ? "media" : "exacto")) === sev).length
    }));
    const heatRows = heatMapRows(state.counts);
    const repeatRows = repeatedDifferenceRows(state.counts);
    const prodRows = productivityRows(state.counts);
    pareto.innerHTML = `
      <div class="mini-table"><h4>Causas más repetidas</h4>${causeRows.length ? causeRows.map(r => `<div class="mini-row"><span>${esc(r.cause)}</span><b>${fmt(r.qty)}</b><small>${money(r.value)}</small></div>`).join("") : `<div class="empty small">Aún no hay diferencias recientes.</div>`}</div>
      <div class="mini-table"><h4>Mapa de calor por ubicación</h4>${heatRows.length ? heatRows.map(r => `<div class="mini-row"><span>${esc(r.location)}</span><b>${fmt(r.qty)}</b><small>${money(r.value)}</small></div>`).join("") : `<div class="empty small">Sin ubicaciones con diferencia.</div>`}</div>
      <div class="mini-table"><h4>Referencias repetidas</h4>${repeatRows.length ? repeatRows.map(r => `<div class="mini-row"><span>${esc(r.ref)}</span><b>${fmt(r.qty)}</b><small>${money(r.value)}</small></div>`).join("") : `<div class="empty small">No hay repetición reciente.</div>`}</div>
      <div class="mini-table"><h4>Productividad de conteo</h4>${prodRows.length ? prodRows.map(r => `<div class="mini-row"><span>${esc(r.user)}</span><b>${fmt(r.qty)}</b><small>${fmt(Math.round(r.avg/60))} min prom.</small></div>`).join("") : `<div class="empty small">Aún no hay tiempos registrados.</div>`}</div>
      <div class="mini-table"><h4>Semáforo de conteos</h4>${severityRows.map(r => `<div class="mini-row"><span><span class="pill ${severityClass(r.sev)}">${severityLabel(r.sev)}</span></span><b>${fmt(r.qty)}</b><small>conteos</small></div>`).join("")}</div>
    `;
  }
}

function totalDiffValue(rows){
  return rows.reduce((s,x) => s + (Number(x.diffValue || 0) || Math.abs(Number(x.diff || 0)) * Number(x.unitCost || 0)), 0);
}
function avgCountDuration(counts = state.counts){
  const durations = counts.map(c => Number(c.countDurationSeconds || 0)).filter(v => v > 0);
  return durations.length ? durations.reduce((s,v)=>s+v,0) / durations.length : 0;
}
function reliabilityMetrics(){
  const active = state.materials.filter(m => m.active !== false);
  const totalCounts = state.counts.length;
  const diffs = state.counts.filter(c => Number(c.absDiff || 0) > 0.0001);
  const countAccuracy = totalCounts ? (totalCounts - diffs.length) / totalCounts * 100 : 0;
  const diffValue = totalDiffValue(state.counts);
  const countedValue = state.counts.reduce((s,c)=>s + Math.abs(Number(c.systemQty || 0) * Number(c.unitCost || 0)), 0);
  const valueAccuracy = countedValue ? Math.max(0, (1 - diffValue / countedValue) * 100) : 0;
  const dataCompleteness = active.length ? active.filter(m => m.ref && m.description && (m.location || m.catalogLine || m.category)).length / active.length * 100 : 0;
  const memoryCoverage = active.length ? active.filter(m => m.lastCountDate || memoryByRef(m.ref)?.lastCountDate).length / active.length * 100 : 0;
  const repeatedPenalty = Math.min(18, repeatedDifferenceRows(state.counts).reduce((s,r)=>s + Math.max(0, r.qty - 1), 0) * 3);
  const openCasePenalty = Math.min(15, state.cases.length * 1.5);
  const criticalPenalty = Math.min(15, state.counts.filter(c => ["critica","crítica"].includes(c.severity)).length * 3);
  const score = Math.max(0, Math.min(100, Math.round(
    countAccuracy * 0.34 + valueAccuracy * 0.34 + dataCompleteness * 0.12 + memoryCoverage * 0.12 + 8 - repeatedPenalty - openCasePenalty - criticalPenalty
  )));
  const level = score >= 95 ? "Alta" : score >= 85 ? "Buena" : score >= 70 ? "Media" : "Baja";
  const cls = score >= 95 ? "green" : score >= 85 ? "blue" : score >= 70 ? "yellow" : "red";
  return { score, level, cls, countAccuracy:Math.round(countAccuracy), valueAccuracy:Math.round(valueAccuracy), dataCompleteness:Math.round(dataCompleteness), memoryCoverage:Math.round(memoryCoverage), repeatedPenalty, openCasePenalty, criticalPenalty };
}
function inventoryHealthMetrics(){
  const totalCounts = state.counts.length;
  const diffs = state.counts.filter(c => Number(c.absDiff || 0) > 0.0001);
  const diffValue = totalDiffValue(state.counts);
  const countedValue = state.counts.reduce((sum,c) => sum + Math.abs(Number(c.systemQty || 0) * Number(c.unitCost || 0)), 0);
  const netDiffValue = state.counts.reduce((sum,c) => sum + Number(c.diff || 0) * Number(c.unitCost || 0), 0);
  const differenceRate = totalCounts ? Math.round(diffs.length / totalCounts * 100) : 0;
  const shrinkageRate = countedValue ? Math.round((diffValue / countedValue) * 10000) / 100 : 0;
  const avgSeconds = avgCountDuration();
  const countsPerHour = avgSeconds ? Math.round(3600 / avgSeconds * 10) / 10 : 0;
  const today = todayISO();
  const planned = state.tasks.filter(t => (t.scheduledDate || "") === today);
  const open = getOpenTaskStatuses();
  const finished = planned.filter(t => !open.includes(t.status)).length;
  const planCompliance = planned.length ? Math.round(finished / planned.length * 100) : 0;
  const staleMemory = state.materials.filter(m => {
    const mem = memoryByRef(m.ref) || m;
    const date = mem.lastCountDate || mem.lastVerifiedDate || "";
    if(!date) return true;
    return daysSinceISO(date) > 180;
  }).length;
  return { totalCounts, differenceRate, shrinkageRate, netDiffValue, countedValue, avgSeconds, countsPerHour, planCompliance, plannedToday:planned.length, finishedToday:finished, staleMemory };
}

function intelligentAlertRows(){
  const alerts = [];
  const criticalLimit = Number(state.settings.criticalDiffValue || 500000);
  state.cases.filter(c => c.status === "pending_gerencia").forEach(c => {
    const value = Number(c.diffValue || 0) || Math.abs(Number(c.diff || 0)) * Number(c.unitCost || 0);
    alerts.push({ level:value >= criticalLimit ? "red" : "yellow", title:"Caso pendiente de decisión", body:`${c.materialRef || ""} · ${money(value)} · ${c.lastComment || "Sin comentario"}`, action:"Revisar informe PDF antes de cerrar o ajustar." });
  });
  repeatedDifferenceRows(state.counts).slice(0,4).forEach(r => alerts.push({ level:"red", title:"Referencia repetida", body:`${r.ref} aparece con diferencia ${r.qty} veces. Impacto ${money(r.value)}.`, action:"Solicitar revisión de ubicación, unidad de medida o movimiento documental." }));
  heatMapRows(state.counts).slice(0,4).filter(r => r.value >= criticalLimit || r.qty >= 3).forEach(r => alerts.push({ level:"yellow", title:"Ubicación caliente", body:`${r.location}: ${r.qty} diferencias y ${money(r.value)}.`, action:"Programar revisión física de la ubicación." }));
  const avg = avgCountDuration();
  if(avg > 0 && avg > 20 * 60) alerts.push({ level:"blue", title:"Conteo lento", body:`Tiempo promedio ${fmt(Math.round(avg/60))} minutos por conteo.`, action:"Revisar si las ubicaciones están claras o si faltan etiquetas QR." });
  if(state.offlineQueue?.length) alerts.push({ level:"blue", title:"Pendientes offline", body:`${state.offlineQueue.length} conteo(s) guardados localmente sin sincronizar.`, action:"Conectar a internet y mantener abierta la APP para sincronizar." });
  return alerts.slice(0,12);
}
function heatRowHtml(r, maxValue){
  const pct = maxValue ? Math.max(8, Math.round(Number(r.value || 0) / maxValue * 100)) : 0;
  const cls = pct >= 70 ? "red" : pct >= 35 ? "yellow" : "blue";
  return `<div class="heat-row"><div><b>${esc(r.location)}</b><small>${fmt(r.qty)} diferencia(s) · ${money(r.value)}</small></div><span class="heat-bar ${cls}" style="--w:${pct}%"></span></div>`;
}
function rankingRowHtml(r, idx){
  return `<div class="ranking-row"><strong>${idx + 1}</strong><span>${esc(r.cause || r.ref || "Sin dato")}</span><b>${fmt(r.qty)}</b><small>${money(r.value || 0)}</small></div>`;
}
function renderExecutiveDashboard(){
  const box = $("#executiveDashboard");
  const heat = $("#gerenciaHeatMap");
  const causes = $("#gerenciaCauseRanking");
  const alertsEl = $("#gerenciaSmartAlerts");
  if(!box && !heat && !causes && !alertsEl) return;
  const totalCounts = state.counts.length;
  const diffs = state.counts.filter(c => Number(c.absDiff || 0) > 0);
  const accuracy = totalCounts ? Math.round((totalCounts - diffs.length) / totalCounts * 100) : 0;
  const diffValue = totalDiffValue(state.counts);
  const countedValue = state.counts.reduce((s,c)=>s + Math.abs(Number(c.systemQty || 0) * Number(c.unitCost || 0)), 0);
  const valueAccuracy = countedValue ? Math.max(0, Math.round((1 - diffValue / countedValue) * 100)) : 0;
  const pendingMgmt = state.cases.filter(c => c.status === "pending_gerencia");
  const criticalCases = state.cases.filter(c => c.severity === "critica" || c.severity === "crítica" || (Number(c.diffValue || 0) >= Number(state.settings.criticalDiffValue || 500000)));
  const avgMin = avgCountDuration() ? Math.round(avgCountDuration()/60) : 0;
  const reliability = reliabilityMetrics();
  const health = inventoryHealthMetrics();
  if(box){
    box.innerHTML = `
      <article class="executive-hero card">
        <div><span class="tag dark">Tablero gerencial</span><h3>Decisiones de inventario cíclico</h3><p>Vista resumida para aprobar, devolver o autorizar ajustes con base en valor, criticidad, causa y trazabilidad.</p></div>
        <div class="executive-kpis">
          <div><span>Exactitud cantidad</span><b>${accuracy}%</b></div>
          <div><span>Exactitud valor</span><b>${valueAccuracy}%</b></div>
          <div><span>Valor diferencia</span><b>${money(diffValue)}</b></div>
          <div><span>Pendientes gerencia</span><b>${fmt(pendingMgmt.length)}</b></div>
          <div><span>Críticos</span><b>${fmt(criticalCases.length)}</b></div>
          <div><span>Tiempo promedio</span><b>${avgMin ? fmt(avgMin) + " min" : "—"}</b></div>
          <div><span>Confiabilidad</span><b>${reliability.score}% · ${esc(reliability.level)}</b></div>
          <div><span>Memoria referencias</span><b>${reliability.memoryCoverage}%</b></div>
          <div><span>Plan diario</span><b>${health.planCompliance}%</b></div>
          <div><span>Tasa diferencias</span><b>${health.differenceRate}%</b></div>
          <div><span>Desviación valor</span><b>${health.shrinkageRate}%</b></div>
        </div>
      </article>`;
  }
  const heatRows = heatMapRows(state.counts);
  if(heat){
    const max = Math.max(1, ...heatRows.map(r => Number(r.value || 0)));
    heat.innerHTML = heatRows.length ? heatRows.map(r => heatRowHtml(r, max)).join("") : `<div class="empty small">Sin diferencias por ubicación.</div>`;
  }
  const causeRows = causeParetoRows(state.counts);
  if(causes){
    causes.innerHTML = causeRows.length ? causeRows.map((r,i) => rankingRowHtml(r,i)).join("") : `<div class="empty small">Sin causas registradas.</div>`;
  }
  const alerts = intelligentAlertRows();
  if(alertsEl){
    alertsEl.innerHTML = alerts.length ? alerts.map(a => `<div class="smart-alert ${a.level}"><b>${esc(a.title)}</b><span>${esc(a.body)}</span><small>${esc(a.action)}</small></div>`).join("") : `<div class="empty small">Sin alertas inteligentes en este momento.</div>`;
  }
}

function renderDriveConfig(){
  const mode = $("#cfgDriveClient");
  const base = $("#cfgDriveFolder");
  const file = $("#cfgDriveFile");
  const sheet = $("#cfgDriveSheet");
  if(mode) mode.value = "Carga local diaria, sin API de Drive";
  if(base) base.value = "La base se reinicia con cada Excel cargado";
  if(file) file.value = "Excel_siesa.xls / .xlsx";
  if(sheet) sheet.value = state.settings.sheetName || driveConfig.sheetName || "Sheet1";
  updateLocalExcelBadge();
  renderHistoryControlStatus();
}
function selectSiesaFile(){
  setView("driveView");
  const input = $("#siesaFileInput");
  if(input) input.click();
}
function handleSiesaFileSelected(event){
  const file = event?.target?.files?.[0] || null;
  if(!file){
    state.localExcelFile = null;
    state.localExcelMeta = null;
    updateLocalExcelBadge();
    return;
  }
  state.localExcelFile = file;
  state.localExcelMeta = { name:file.name, size:file.size, lastModified:file.lastModified || Date.now() };
  updateLocalExcelBadge();
  logSync(`Archivo seleccionado: ${file.name} · ${Math.round(file.size/1024)} KB. Presiona Procesar Excel diario.`);
}
function updateLocalExcelBadge(){
  const badge = $("#driveState");
  const meta = state.localExcelMeta;
  if(badge){
    badge.textContent = meta ? "Archivo listo" : "Esperando Excel";
    badge.className = meta ? "tag green" : "tag yellow";
  }
  const box = $("#siesaFileMeta");
  if(box){
    if(meta){
      const date = new Date(meta.lastModified || Date.now()).toLocaleString("es-CO");
      box.innerHTML = `<b>${esc(meta.name)}</b><br><small>${fmt(Math.round((meta.size || 0)/1024))} KB · modificado ${esc(date)}</small>`;
    }else{
      box.innerHTML = `<b>No hay archivo seleccionado.</b><br><small>Sube el Excel diario exportado desde SIESA para reconstruir la base del día.</small>`;
    }
  }
}
function renderHistoryControlStatus(){
  const control = currentHistoryControl();
  const official = isOfficialHistoryActive(control);
  const badge = $("#historyModeBadge");
  const box = $("#historyStatusBox");
  const btn = $("#activateHistoryBtn");
  if(badge){
    badge.textContent = official ? "Histórico oficial" : "Histórico borrador";
    badge.className = official ? "tag green" : "tag yellow";
  }
  if(box){
    const start = historyStartDate(control);
    box.innerHTML = official
      ? `<b>Histórico oficial corriendo desde ${esc(control.officialStartedDate || start)}.</b><br><small>Las referencias contadas desde esa fecha bloquean repetición anual en la metodología local.</small>`
      : `<b>Histórico nuevo en borrador desde ${esc(start)}.</b><br><small>Ya evita repetir referencias durante pruebas, pero no actualiza el histórico oficial antiguo hasta que se active.</small>`;
  }
  if(btn){
    btn.disabled = official;
    btn.textContent = official ? "Histórico oficial activo" : "Activar histórico oficial desde hoy";
    btn.classList.toggle("secondary", official);
    btn.classList.toggle("primary", !official);
  }
}
async function startOfficialInventoryHistory(){
  if(!hasAny(["jefe_logistico"])){
    toast("Solo super admin o jefe logístico pueden activar el histórico oficial.", "error");
    return;
  }
  const ok = window.confirm("¿Activar el histórico oficial desde hoy? Desde este momento los conteos del nuevo método quedarán como base oficial para no repetir referencias.");
  if(!ok) return;
  const today = todayISO();
  const control = normalizeInventoryHistoryControl({
    ...(state.historyControl || {}),
    mode:"official",
    historyStatus:"official",
    officialStartedDate:today,
    methodVersion:INVENTORY_HISTORY_VERSION,
    isPersisted:true
  });
  await setDoc(doc(db, "syncState", INVENTORY_HISTORY_CONTROL_DOC), {
    ...control,
    activatedAt:nowTS(),
    activatedByUid:state.user?.uid || "",
    activatedByEmail:state.user?.email || "",
    updatedAt:nowTS()
  }, { merge:true });
  state.historyControl = control;
  renderHistoryControlStatus();
  logSync(`Histórico oficial activado desde ${today}. Los conteos del nuevo método ya alimentan referenceMemory oficial.`);
  toast("Histórico oficial activado desde hoy.");
}
async function syncFromLocalExcel(silent = false){
  if(!hasAny(["jefe_logistico"])){
    if(!silent) toast("Solo super admin o jefe logístico pueden cargar el Excel SIESA.", "error");
    return;
  }
  if(state.syncRunning){
    if(!silent) toast("Ya hay una carga en curso. Espera a que termine.");
    return;
  }
  const file = state.localExcelFile || $("#siesaFileInput")?.files?.[0] || null;
  if(!file){
    if(!silent) toast("Selecciona primero el Excel diario de SIESA.", "error");
    selectSiesaFile();
    return;
  }
  state.syncRunning = true;
  try{
    await ensureAlertsForDailyCounts(false);
    const historyControl = await ensureInventoryHistoryControl();
    renderHistoryControlStatus();
    logSync(`Histórico nuevo activo en modo ${historyControl.mode === "official" ? "OFICIAL" : "BORRADOR"}. Se usará para no repetir referencias contadas desde esta metodología.`);
    logSync("Iniciando lectura local del Excel SIESA. No se usará Drive ni OAuth.");
    const buffer = await file.arrayBuffer();
    logSync(`Archivo leído desde el equipo/celular. Tamaño aproximado: ${Math.round(buffer.byteLength/1024)} KB.`);
    const rows = parseExcel(buffer);
    logSync(`Hoja leída correctamente. Filas detectadas: ${rows.length}.`);
    const materials = rows.map(normalizeMaterial).filter(Boolean);
    logSync(`Materiales válidos normalizados: ${materials.length}.`);
    if(!materials.length) throw new Error("No se detectaron materiales válidos. Revisa encabezados: Referencia Item, Nombre Item, Ubicacion y Cantidad_existencia_1.");

    await resetOpenDailyWorkBeforeUpload();
    const localFileMeta = {
      id:`LOCAL-${todayISO()}-${Date.now()}`,
      name:file.name || "Excel_siesa.xls",
      modifiedTime:new Date(file.lastModified || Date.now()).toISOString(),
      size:file.size || buffer.byteLength,
      source:"local_upload",
      resetCountingCycle:true
    };
    await processSiesaMaterials(materials, localFileMeta, rows.length, { resetCountingCycle:true, source:"local_upload" });
    await setDoc(doc(db, "syncState", "localExcel"), {
      lastFileName:localFileMeta.name,
      lastFileModifiedTime:localFileMeta.modifiedTime,
      lastSyncDate:todayISO(),
      lastRowsRead:rows.length,
      lastMaterialsProcessed:materials.length,
      resetCountingCycle:true,
      historyMode:historyControl.mode,
      historyStatus:historyControl.historyStatus,
      historyVersion:INVENTORY_HISTORY_VERSION,
      historyStartDate:historyStartDate(historyControl),
      updatedAt:nowTS(),
      updatedByUid:state.user.uid,
      updatedByEmail:state.user.email
    }, { merge:true });
    await refreshAll();
    logSync("Carga local finalizada. Base del día reconstruida; el histórico nuevo evita repetir referencias ya contadas.");
    if(!silent) toast("Excel diario cargado. Base reiniciada y pendientes generados sin repetir histórico nuevo.");
    notifyPendingWork("local_excel_upload");
  }catch(err){
    console.error(err);
    logSync("ERROR: " + (err.message || err));
    if(!silent) toast(err.message || "Error cargando Excel SIESA", "error");
    if(silent) throw err;
  }finally{
    state.syncRunning = false;
  }
}
async function resetOpenDailyWorkBeforeUpload(){
  const openStatuses = ["assigned", "recount_required", "pending_inventory"];
  const snap = await getDocs(query(collection(db, "countTasks"), where("status", "in", openStatuses), limit(1500)));
  if(!snap.size){
    logSync("No había tareas/reconteos operativos abiertos para reiniciar.");
    return;
  }
  let batch = writeBatch(db);
  let count = 0;
  for(const d of snap.docs){
    batch.set(d.ref, {
      status:"superseded_by_daily_upload",
      supersededAt:nowTS(),
      supersededReason:"Carga diaria local: se reinicia base y no se conserva reconteo viejo",
      updatedAt:nowTS(),
      updatedByUid:state.user?.uid || "",
      updatedByEmail:state.user?.email || ""
    }, { merge:true });
    count++;
    if(count % 430 === 0){ await batch.commit(); batch = writeBatch(db); }
  }
  if(count % 430 !== 0) await batch.commit();
  state.express.selectedTaskId = "";
  localStorage.removeItem("expressSelectedTaskId");
  logSync(`Reinicio operativo: ${count} tareas/reconteos abiertos fueron cerrados como reemplazados por la carga diaria.`);
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
          reject(new Error("No autorizaste todos los permisos de Drive. Debes aceptar drive.metadata.readonly, drive.readonly y drive.file para lectura y carga de evidencias."));
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


function guessFileExtension(file){
  const byName = String(file?.name || "").split(".").pop();
  if(byName && byName !== file?.name) return byName.toLowerCase();
  const map = {"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic"};
  return map[file?.type] || "jpg";
}
function buildCountPhotoName(materialRef, date, description, file){
  const refPart = safeId(materialRef || "material").slice(0, 60) || "material";
  const descPart = safeId((description || "").split(" ").slice(0, 4).join("-")).slice(0, 40);
  const ext = guessFileExtension(file);
  return `${refPart}${descPart ? "_" + descPart : ""}_${date}.${ext}`;
}
async function driveApiJson(url, options = {}){
  const res = await fetch(url, options);
  if(!res.ok){
    const txt = await res.text();
    throw new Error(`Drive respondió ${res.status}: ${txt.slice(0,220)}`);
  }
  return await res.json();
}
function imageFileToDataUrl(file, maxSide = 960, quality = 0.72){
  return new Promise(resolve => {
    if(!file || !file.type?.startsWith("image/")){ resolve(""); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try{
        const scale = Math.min(1, maxSide / Math.max(img.width || maxSide, img.height || maxSide));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((img.width || maxSide) * scale));
        canvas.height = Math.max(1, Math.round((img.height || maxSide) * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      }catch(err){
        URL.revokeObjectURL(url);
        console.warn("No se pudo comprimir la foto", err);
        resolve("");
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(""); };
    img.src = url;
  });
}
async function uploadCountPhotoToDrive(file, materialRef, date, description = ""){
  const fileName = buildCountPhotoName(materialRef, date, description, file);
  const dataUrl = await imageFileToDataUrl(file);
  const safeDataUrl = dataUrl && dataUrl.length < 850000 ? dataUrl : "";
  const meta = {
    id:`LOCAL-PHOTO-${Date.now()}`,
    name:fileName,
    webViewLink:"",
    webContentLink:"",
    mimeType:file.type || "image/jpeg",
    size:file.size || 0,
    localDataUrl:safeDataUrl,
    storageMode:"firestore_inline_metadata"
  };
  logSync(`Foto registrada en la app: ${fileName}${safeDataUrl ? " con miniatura comprimida" : " como metadato"}.`);
  return meta;
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
    logSync("Agenda diaria no generada: no hay materiales en Firestore. Primero debe cargarse el Excel diario de SIESA dentro de la app.");
    if(showToast) toast("No hay materiales cargados. Primero sube y procesa el Excel diario de SIESA.", "error");
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
    const score =
      (cells.some(c => aliases.ref.some(a => c.includes(norm(a)))) ? 5 : 0) +
      (cells.some(c => aliases.stock.some(a => c.includes(norm(a)))) ? 3 : 0) +
      (cells.some(c => aliases.cost.some(a => c.includes(norm(a)))) ? 2 : 0) +
      (cells.some(c => aliases.desc.some(a => c.includes(norm(a)))) ? 1 : 0);
    if(score > bestScore){ bestScore = score; headerIndex = idx; }
  });
  if(headerIndex < 0 || bestScore < 5) throw new Error("No se detectó una fila de encabezados válida.");

  const headers = matrix[headerIndex].map((h,i) => String(h || `Columna_${i+1}`).trim());

  return matrix
    .slice(headerIndex + 1)
    .filter(row => row.some(v => String(v ?? "").trim() !== ""))
    .map(row => {
      const obj = Object.fromEntries(headers.map((h,i) => [h, row[i] ?? ""]));

      // Respaldo por posición real de Excel.
      // A=0, B=1, C=2, D=3, E=4. El nombre del material en tu SIESA viene en E.
      obj.__cells = row;
      obj.__colA = row[0] ?? "";
      obj.__colB = row[1] ?? "";
      obj.__colC = row[2] ?? "";
      obj.__colD = row[3] ?? "";
      obj.__colE = row[4] ?? "";
      obj.__colF = row[5] ?? "";
      obj.__colG = row[6] ?? "";
      obj.__colH = row[7] ?? "";

      return obj;
    });
}
function getByAliases(row, list){
  const keys = Object.keys(row || {}), map = new Map(keys.map(k => [norm(k), row[k]]));
  for(const a of list){ const na = norm(a); if(map.has(na)) return map.get(na); }
  for(const k of keys){ const nk = norm(k); if(list.some(a => nk.includes(norm(a)))) return row[k]; }
  return "";
}

function getByHeader(row, candidates = []){
  const keys = Object.keys(row || {});
  const map = new Map(keys.map(k => [norm(k), row[k]]));
  for(const c of candidates){
    const key = norm(c);
    if(map.has(key)) return map.get(key);
  }
  for(const k of keys){
    const nk = norm(k);
    if(candidates.some(c => nk === norm(c) || nk.includes(norm(c)))) return row[k];
  }
  return "";
}
function siesaField(row, name, fallback = ""){
  const value = getByHeader(row, Array.isArray(name) ? name : [name]);
  return value === "" || value === null || value === undefined ? fallback : value;
}

function rawColumn(row, zeroIndex){
  const letter = String.fromCharCode(65 + zeroIndex);
  const direct = row?.[`__col${letter}`];
  if(direct !== undefined && direct !== null && String(direct).trim() !== "") return direct;
  if(Array.isArray(row?.__cells)) return row.__cells[zeroIndex] ?? "";
  return Object.values(row || {})[zeroIndex] ?? "";
}

function looksLikeDescription(value){
  const s = String(value ?? "").trim();
  if(!s || s.length < 3) return false;
  if(/^\d+(\.\d+)?$/.test(s)) return false;
  return /[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]/.test(s);
}

function bestDescriptionFromRow(row){
  const byHeader = String(getByAliases(row, aliases.desc) || "").trim();
  if(looksLikeDescription(byHeader)) return byHeader;

  // Corrección principal: en el Excel SIESA el nombre del material viene en columna E.
  const colE = String(rawColumn(row, 4) || "").trim();
  if(looksLikeDescription(colE)) return colE;

  // Respaldos por si otro export ubica el nombre en B, C, D o F.
  for(const idx of [1,2,3,5]){
    const candidate = String(rawColumn(row, idx) || "").trim();
    if(looksLikeDescription(candidate)) return candidate;
  }

  return byHeader;
}
function normalizeMaterial(row){
  const ref = String(siesaField(row, "Referencia Item", getByAliases(row, aliases.ref) || rawColumn(row, 1) || rawColumn(row, 0))).trim();
  if(!ref) return null;

  const stock = num(siesaField(row, ["Cantidad_existencia_1", "Cantidad existencia", "Existencia"], getByAliases(row, aliases.stock)));
  const availableQty = num(siesaField(row, ["Cantidad_disponible_1", "Cantidad disponible"], ""));
  const committedQty = num(siesaField(row, ["Cantidad_comprometida_1", "Cantidad comprometida"], ""));
  const unitCost = num(siesaField(row, ["Costo_prom_uni", "Ultimo_costo_uni"], getByAliases(row, aliases.cost)));
  const totalValue = num(siesaField(row, ["Costo_prom_tot", "Ultimo_costo_tot"], getByAliases(row, aliases.totalValue)));

  let description = String(siesaField(row, "Nombre Item", bestDescriptionFromRow(row))).trim();
  const families = [
    siesaField(row, "Desc_Item1 Item", ""),
    siesaField(row, "Desc_Item2 Item", ""),
    siesaField(row, "Desc_Item3 Item", ""),
    siesaField(row, "Desc_Item4 Item", ""),
    siesaField(row, "Desc_Item5 Item", "")
  ].map(v => String(v || "").trim()).filter(Boolean);
  let category = families.length ? families.join(" / ") : String(getByAliases(row, aliases.category) || "").trim();
  let unit = String(siesaField(row, "Unidad_inventario Item", getByAliases(row, aliases.unit))).trim();
  let location = String(siesaField(row, "Ubicacion", getByAliases(row, aliases.location))).trim();
  const locationName = String(siesaField(row, "Nombre Ubicacion", "")).trim();
  const warehouse = String(siesaField(row, "Bodega", "")).trim();
  const lot = String(siesaField(row, "Lote", "")).trim();
  const abcCost = String(siesaField(row, "ABC_rotacion_costo", "")).trim();
  const abcTurns = String(siesaField(row, "ABC_rotacion_veces", "")).trim();

  let base = { ref, id:safeId(ref), description, category, location, unit };
  base = enrichMaterialFromCatalog(base);
  description = base.description || description;
  category = base.category || category;
  unit = base.unit || unit;

  const joined = norm(`${ref} ${description} ${category} ${unit}`);
  const isMeterUnit = ["m","mt","mts","metro","metros"].includes(norm(unit));
  const keywordCable = (state.settings.cableKeywords || []).some(k => joined.includes(norm(k))) || joined.includes("cable") || joined.includes("conductor") || joined.includes("alambre");
  const isCable = Boolean(base.isCable || (keywordCable && (isMeterUnit || joined.includes("cable") || joined.includes("conductor") || joined.includes("alambre"))));

  return {
    ref, id:safeId(ref), description, category, catalogLine:base.catalogLine || category,
    location, locationName, warehouse, lot, unit,
    stockSystem:stock, availableQty, committedQty, unitCost, inventoryValue: totalValue || stock * unitCost,
    abcCost, abcTurns,
    lastPurchaseDate:toISO(siesaField(row, "Fecha_ult_compra", "")),
    lastSaleDate:toISO(siesaField(row, "Fecha_ult_venta", "")),
    lastEntryDate:toISO(siesaField(row, "Fecha_ult_entrada", "")),
    lastExitDate:toISO(siesaField(row, "Fecha_ult_salida", "")),
    sourceMovement:num(siesaField(row, "Consumo_promedio", getByAliases(row, aliases.movement))),
    sourceLastMoveDate:toISO(siesaField(row, ["Fecha_ult_salida", "Fecha_ult_entrada", "Fecha_ult_venta", "Fecha_ult_compra"], getByAliases(row, aliases.lastMove))),
    isCable, cableReason:base.cableReason || (isCable ? (isMeterUnit ? "unidad_metro_y_palabra_clave" : "palabras_clave") : "material_normal"), catalogFound:Boolean(base.catalogFound), active:true
  };
}

async function processSiesaMaterials(incoming, file, rowsRead, options = {}){
  const existingSnap = await getDocs(query(collection(db, "materials"), limit(7000)));
  const existingMap = new Map(existingSnap.docs.map(d => [d.data().ref, { id:d.id, ...d.data() }]));
  const historyControl = await ensureInventoryHistoryControl();
  const newHistoryMap = await loadReferenceMemoryV2Map(historyControl);
  let memoryMap = new Map();
  try{
    const memorySnap = await getDocs(query(collection(db, "referenceMemory"), limit(8000)));
    memoryMap = new Map(memorySnap.docs.map(d => { const data = { id:d.id, ...d.data() }; return [data.ref || data.materialRef || d.id, data]; }));
  }catch(err){
    console.warn("No se pudo cargar referenceMemory durante sincronización SIESA", err);
  }
  const firstSync = existingSnap.empty;
  const today = todayISO();
  const yearField = annualFieldName();
  const resetCycle = options.resetCountingCycle === true || file?.resetCountingCycle === true;

  const prepared = incoming.map(m => {
    const old = existingMap.get(m.ref);
    const newMem = newHistoryMap.get(norm(m.ref)) || newHistoryMap.get(norm(safeId(m.ref))) || null;
    const legacyMem = memoryMap.get(m.ref) || memoryMap.get(safeId(m.ref)) || null;
    const mem = resetCycle ? newMem : (newMem || legacyMem);
    const countedInNewHistory = Boolean(newMem && isRelevantHistoryMemory(newMem, historyControl));
    const isNewAfterBase = !firstSync && !old && !mem;
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
      lastVerifiedDate: resetCycle ? (countedInNewHistory ? (mem?.lastVerifiedDate || mem?.lastCountDate || "") : "") : (isNewAfterBase ? today : (old?.lastVerifiedDate || mem?.lastVerifiedDate || mem?.lastCountDate || "")),
      lastMovementDate: change !== 0 ? today : (old?.lastMovementDate || m.sourceLastMoveDate || ""),
      lastCountDate: resetCycle ? (countedInNewHistory ? (mem?.lastCountDate || "") : "") : (isNewAfterBase ? today : (old?.lastCountDate || mem?.lastCountDate || "")),
      lastCountedQty: mem?.lastCountedQty ?? old?.lastCountedQty ?? null,
      lastCountSystemQty: mem?.lastSystemQty ?? old?.lastCountSystemQty ?? null,
      lastCountDiff: mem?.lastDiff ?? old?.lastCountDiff ?? null,
      lastCountDiffValue: mem?.lastDiffValue ?? old?.lastCountDiffValue ?? null,
      lastCountResult: mem?.lastResult || old?.lastCountResult || "",
      lastCountSeverity: mem?.lastSeverity || old?.lastCountSeverity || "",
      lastCountCause: mem?.lastCause || old?.lastCountCause || "",
      lastCountedBy: mem?.lastCountedBy || old?.lastCountedBy || "",
      referenceCode: mem?.referenceCode || old?.referenceCode || inventoryCode("material", m.ref),
      [yearField]: resetCycle ? countedInNewHistory : (isNewAfterBase ? true : (old?.[yearField] === true || mem?.[yearField] === true || (mem?.lastCountDate || "").startsWith(String(yearOf(today))) ? true : false)),
      autoCountedReason: resetCycle ? (countedInNewHistory ? "historico_nuevo_local" : "") : (isNewAfterBase ? "nuevo_registro_siesa" : (old?.autoCountedReason || "")),
      historyMode:historyControl.mode,
      historyStatus:historyControl.historyStatus,
      historyVersion:INVENTORY_HISTORY_VERSION,
      historyStartDate:historyStartDate(historyControl),
      resetCountingCycle:resetCycle,
      countCycleDate:resetCycle ? today : (old?.countCycleDate || ""),
      sourceFileId: file.id,
      sourceFileName: file.name,
      sourceModifiedTime: file.modifiedTime,
      sourceMode: options.source || file.source || "drive",
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
    cableAvailableDate: isCableMaterial(m) ? cableAvailableDate(m) : "",
    nextCableDueDate: ""
  }));

  await batchSet("materials", finalMaterials.map(m => ({ id:m.id || safeId(m.ref), data:compactMaterial(m) })));
  state.materials = finalMaterials;
  await refreshOpenTasksFromMaterials(finalMaterials);
  await loadTasks();

  await addDoc(collection(db, "syncLogs"), {
    fileId:file.id,
    fileName:file.name,
    fileModifiedTime:file.modifiedTime,
    rowsRead,
    materialsProcessed:finalMaterials.length,
    firstSync,
    sourceMode:options.source || file.source || "drive",
    resetCountingCycle:resetCycle,
    countCycleDate:resetCycle ? today : "",
    historyMode:historyControl.mode,
    historyStatus:historyControl.historyStatus,
    historyVersion:INVENTORY_HISTORY_VERSION,
    historyStartDate:historyStartDate(historyControl),
    newAutoCounted:finalMaterials.filter(m => m.autoCountedReason === "nuevo_registro_siesa" && m[yearField] === true).length,
    createdAt:nowTS(),
    createdByUid:state.user.uid,
    createdByEmail:state.user.email
  });

  logSync(`Repositorio SIESA actualizado. Primera base: ${firstSync ? "SI" : "NO"}. Reinicio conteo: ${resetCycle ? "SI" : "NO"}. Histórico nuevo: ${historyControl.mode === "official" ? "OFICIAL" : "BORRADOR"}. Ya contados por histórico nuevo: ${finalMaterials.filter(m => m.autoCountedReason === "historico_nuevo_local" && m[yearField] === true).length}. Nuevos auto-contados: ${finalMaterials.filter(m => m.autoCountedReason === "nuevo_registro_siesa" && m[yearField] === true).length}.`);
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
    catalogLine:m.catalogLine || m.category || "",
    catalogFound:Boolean(m.catalogFound),
    cableReason:m.cableReason || "",
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
    referenceCode:m.referenceCode || inventoryCode("material", m.ref),
    lastCountedQty:m.lastCountedQty ?? null,
    lastCountSystemQty:m.lastCountSystemQty ?? null,
    lastCountDiff:m.lastCountDiff ?? null,
    lastCountDiffValue:m.lastCountDiffValue ?? null,
    lastCountResult:m.lastCountResult || "",
    lastCountSeverity:m.lastCountSeverity || "",
    lastCountCause:m.lastCountCause || "",
    lastCountedBy:m.lastCountedBy || "",
    lastCableCountDate:m.lastCableCountDate || "",
    lastMeterCountDate:m.lastMeterCountDate || "",
    [meterField]: m[meterField] === true,
    cableAvailableDate:m.cableAvailableDate || "",
    nextCableDueDate:"",
    sourceFileId:m.sourceFileId || "",
    sourceFileName:m.sourceFileName || "",
    sourceModifiedTime:m.sourceModifiedTime || "",
    sourceMode:m.sourceMode || "",
    resetCountingCycle:Boolean(m.resetCountingCycle),
    countCycleDate:m.countCycleDate || "",
    historyMode:m.historyMode || currentHistoryControl().mode,
    historyStatus:m.historyStatus || currentHistoryControl().historyStatus,
    historyVersion:m.historyVersion || INVENTORY_HISTORY_VERSION,
    historyStartDate:m.historyStartDate || historyStartDate(currentHistoryControl()),
    warehouse:m.warehouse || "",
    locationName:m.locationName || "",
    lot:m.lot || "",
    availableQty:Number(m.availableQty || 0),
    committedQty:Number(m.committedQty || 0),
    abcCost:m.abcCost || "",
    abcTurns:m.abcTurns || "",
    lastPurchaseDate:m.lastPurchaseDate || "",
    lastSaleDate:m.lastSaleDate || "",
    lastEntryDate:m.lastEntryDate || "",
    lastExitDate:m.lastExitDate || "",
    lastSyncDate:m.lastSyncDate || "",
    active:m.active !== false,
    updatedAt:m.updatedAt || nowTS()
  };
}


async function refreshOpenTasksFromMaterials(materials){
  try{
    const map = new Map(materials.map(m => [m.ref, m]));
    const snap = await getDocs(query(collection(db, "countTasks"), where("status", "in", ["assigned","recount_required","pending_inventory","pending_jefe_approval","pending_jefe_logistico"]), limit(1500)));
    let batch = writeBatch(db);
    let count = 0;
    for(const d of snap.docs){
      const t = d.data();
      const m = map.get(t.materialRef);
      if(!m) continue;
      batch.set(d.ref, {
        description:m.description || t.description || "",
        category:m.category || t.category || "",
        catalogLine:m.catalogLine || m.category || t.catalogLine || "",
        unit:m.unit || t.unit || "",
        isCable:isCableMaterial(m),
        unitCost:Number(m.unitCost || t.unitCost || 0),
        inventoryValue:Number(m.inventoryValue || (Number(m.unitCost||0) * Number(m.stockSystem||0)) || t.inventoryValue || 0),
        systemQty:Number(m.stockSystem || t.systemQty || 0),
        band:m.band || t.band || "",
        updatedAt:nowTS()
      }, { merge:true });
      count++;
      if(count >= 400){ await batch.commit(); batch = writeBatch(db); count = 0; }
    }
    if(count > 0) await batch.commit();
    if(snap.size) logSync(`Tareas abiertas enriquecidas con nombres/costos: ${snap.size}.`);
  }catch(err){
    console.warn("No se pudieron actualizar tareas abiertas con el catálogo", err);
  }
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
  return { materialRef:m.ref, materialId:m.id || safeId(m.ref), description:m.description || "", location:m.location || "", category:m.category || "", catalogLine:m.catalogLine || m.category || "", unit:m.unit || "", isCable:Boolean(m.isCable), unitCost:Number(m.unitCost || 0), inventoryValue:Number(m.inventoryValue || 0), band:m.band || "", frequency:Number(m.frequency || 120), systemQty:Number(m.stockSystem || 0), scheduledDate:extra.scheduledDate || todayISO(), taskType:extra.taskType || extra.type || "general", status:extra.status || "assigned", priority:Number(extra.priority || taskPriority(m)), recountRound:Number(extra.recountRound || 0), origin:extra.origin || "agenda", syncLogId:extra.syncLogId || "", createdAt:nowTS(), createdByUid:state.user?.uid || "", createdByEmail:state.user?.email || "" };
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


function renderCountCodePanel(item){
  const el = $("#countCodePanel");
  if(!el) return;
  if(isOperatorRole()){ el.innerHTML = ""; return; }
  const meta = displayMeta(item || {});
  const refCode = inventoryCode("material", meta.ref || item?.materialRef || "");
  const locCode = meta.location ? inventoryCode("location", meta.location) : "Sin ubicación";
  el.innerHTML = `<div class="count-code-box"><div><span>Codificación sugerida</span><b>${esc(refCode)}</b><small>${esc(meta.description || "")}</small></div><div><span>Ubicación</span><b>${esc(locCode)}</b><small>${esc(meta.location || "Sin ubicación")}</small></div><div class="count-code-actions"><button type="button" class="tiny blue" data-count-label-kind="material">Crear etiqueta ref</button><button type="button" class="tiny" data-count-label-kind="location">Crear etiqueta ubicación</button><button type="button" class="tiny warn" data-count-print-kind="material">Imprimir ref</button></div></div>`;
  $$('[data-count-label-kind]').forEach(btn => btn.addEventListener("click", () => addLabelToQueue(taskLabelItem(item, btn.dataset.countLabelKind || "material"))));
  $$('[data-count-print-kind]').forEach(btn => btn.addEventListener("click", () => printLabelItems([taskLabelItem(item, btn.dataset.countPrintKind || "material")], "large")));
}
function openTaskCountDialog(taskId){
  const rawTask = state.tasks.find(t => t.id === taskId);
  if(!rawTask) return;
  const meta = displayMeta(rawTask);
  const task = { ...rawTask, description:meta.description, location:meta.location || rawTask.location || "", unit:meta.unit, systemQty:meta.systemQty, unitCost:meta.unitCost, inventoryValue:meta.inventoryValue, isCable:meta.isCable };
  state.express.selectedTaskId = taskId;
  localStorage.setItem("expressSelectedTaskId", taskId);
  state.express.countStartedAt = new Date().toISOString();
  const cable = task.taskType === "cable_metraje" || task.type === "cable_metraje" || meta.isCable;
  $("#countTaskId").value = task.id;
  $("#countCaseId").value = "";
  $("#countMode").value = "task";
  $("#countMaterialRef").value = meta.ref || task.materialRef;
  $("#countDate").value = todayISO();
  if($("#countStartedAt")) $("#countStartedAt").value = state.express.countStartedAt;
  $("#countSystemQty").value = Number(meta.systemQty || 0);
  $("#countQty").value = shouldBlindCount() ? "" : Number(meta.systemQty || 0);
  if($("#countUnitCost")) $("#countUnitCost").value = Number(meta.unitCost || 0);
  $("#countSupport").value = ""; $("#countCause").value = "N/A"; $("#countObs").value = ""; if($("#countPhoto")) $("#countPhoto").value = "";
  setSystemQtyVisibility(shouldBlindCount());
  $("#countDialogTitle").textContent = isOperatorRole() ? (cable ? "Contar metros físicos" : "Contar cantidad física") : (cable ? "Registrar metraje físico" : "Registrar conteo físico");
  $("#systemQtyLabel").childNodes[0].textContent = cable ? "Metros sistema" : "Stock sistema";
  $("#countQtyLabel").childNodes[0].textContent = cable ? "Metros físicos contados" : "Cantidad física contada";
  $("#countDialogSubtitle").textContent = isOperatorRole() ? `${meta.ref} · ${meta.description || "Referencia sin nombre"} · ${meta.location || "Sin ubicación"} · CONTEO CIEGO` : `${meta.ref} · ${meta.description || "Referencia sin nombre"} · ${meta.location || "Sin ubicación"}`;
  renderCountCodePanel(task);
  updateCountPreview();
  $("#countDialog").showModal();
}
function openCaseCountDialog(caseId, mode){
  const c = state.cases.find(x => x.id === caseId);
  if(!c) return;
  if(mode === "jefe" && !hasAny(["jefe_logistico"])) return toast("No tienes permiso.", "error");
  if(mode === "auditoria" && !hasAny(["auditoria"])) return toast("No tienes permiso.", "error");
  state.express.countStartedAt = new Date().toISOString();
  $("#countTaskId").value = "";
  $("#countCaseId").value = c.id;
  $("#countMode").value = mode;
  $("#countMaterialRef").value = c.materialRef;
  $("#countDate").value = todayISO();
  if($("#countStartedAt")) $("#countStartedAt").value = state.express.countStartedAt;
  $("#countSystemQty").value = Number(c.systemQty ?? c.lastSystemQty ?? 0);
  $("#countQty").value = Number(c.systemQty ?? c.lastSystemQty ?? 0);
  if($("#countUnitCost")) $("#countUnitCost").value = Number(c.unitCost || 0);
  $("#countSupport").value = ""; $("#countCause").value = "N/A"; $("#countObs").value = ""; if($("#countPhoto")) $("#countPhoto").value = "";
  setSystemQtyVisibility(false);
  $("#countDialogTitle").textContent = mode === "auditoria" ? "Contabilización auditoría" : "Verificación jefe logístico";
  $("#systemQtyLabel").childNodes[0].textContent = "Stock sistema";
  $("#countQtyLabel").childNodes[0].textContent = "Cantidad física";
  $("#countDialogSubtitle").textContent = `${c.materialRef} · ${c.description || ""}`;
  renderCountCodePanel(c);
  updateCountPreview();
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
    logSync("No se puede crear conteo obligatorio: no hay materiales. Carga primero Excel_siesa.xls desde la app.");
    if(showToast) toast("No hay materiales en Firestore. Primero sube el Excel diario de SIESA.", "error");
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
  await ensureAlertsForDailyCounts(false);
  if(showToast) toast(`Conteo obligatorio creado: ${tasks.length}`);
  notifyUser("Conteo obligatorio generado", `${tasks.length} materiales para contar hoy.`, { tag:`conteo-${todayISO()}`, urgent:true });
  notifyPendingWork("daily_tasks_generated");
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

  const saveAndNext = e.submitter?.id === "saveNextCountBtn";
  state.express.saveNextRequested = saveAndNext;
  const taskId = $("#countTaskId").value;
  const caseId = $("#countCaseId").value;
  const mode = $("#countMode").value || "task";
  const date = $("#countDate").value || todayISO();
  const systemQty = num($("#countSystemQty").value);
  const countedQty = num($("#countQty").value);
  const diff = countedQty - systemQty;
  const absDiff = Math.abs(diff);
  const hasDiff = absDiff > 0.0001;
  let support = $("#countSupport").value || "";
  const photoFile = $("#countPhoto")?.files?.[0] || null;
  const cause = $("#countCause").value || "N/A";
  const obs = $("#countObs").value || "";

  if(navigator.onLine === false){
    const task = taskId ? state.tasks.find(t => t.id === taskId) : null;
    const caseItem = caseId ? state.cases.find(c => c.id === caseId) : null;
    const context = task || caseItem;
    const diffMeta = buildDiffMeta(diff, systemQty, Number($("#countUnitCost")?.value || context?.unitCost || 0));
    const blindOperator = shouldBlindCount() && isOperatorRole();
    if(photoFile){ toast("Sin conexión no se puede adjuntar foto. Espera conexión o guarda sin foto.", "error"); return; }
    if(!blindOperator && requiresPhotoForCount(diffMeta, context)){ toast("Este conteo requiere foto obligatoria; debe guardarse cuando vuelva la conexión.", "error"); return; }
    if(!blindOperator && requiresSupportForCount(diffMeta) && !support && !obs && cause === "N/A"){ toast("Registra causa, soporte u observación para dejar trazabilidad de la diferencia.", "error"); return; }
    enqueueOfflineCount(buildOfflinePayload({ task, caseItem, mode, saveAndNext }));
    $("#countDialog").close();
    renderAll();
    if(saveAndNext && taskId) openNextExpressTask(taskId);
    return;
  }

  if(taskId){
    const taskSnap = await getDoc(doc(db, "countTasks", taskId));
    if(!taskSnap.exists()){
      toast("La tarea ya no existe o no tienes permiso para verla.", "error");
      return;
    }

    const task = { id:taskSnap.id, ...taskSnap.data() };
    const diffMeta = buildDiffMeta(diff, systemQty, Number(task.unitCost || 0));
    const isCable = task.taskType === "cable_metraje" || task.type === "cable_metraje";
    const blindOperator = shouldBlindCount() && isOperatorRole();
    if(!blindOperator && requiresPhotoForCount(diffMeta, task) && !photoFile){ toast("La diferencia requiere foto obligatoria antes de guardar.", "error"); return; }
    if(!blindOperator && requiresSupportForCount(diffMeta) && !support && !obs && cause === "N/A"){ toast("Registra causa, soporte u observación para dejar trazabilidad de la diferencia.", "error"); return; }
    let photoMeta = null;
    if(photoFile){
      try{
        photoMeta = await uploadCountPhotoToDrive(photoFile, task.materialRef, date, task.description || "");
        support = support ? `${support} | Foto: ${photoMeta.webViewLink || photoMeta.name}` : (photoMeta.webViewLink || photoMeta.name);
      }catch(err){
        toast("No se pudo adjuntar la foto: " + (err.message || err), "error");
        throw err;
      }
    }

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
      unitCost:Number(task.unitCost || 0),
      diffPercent:diffMeta.percent,
      diffValue:diffMeta.value,
      severity:diffMeta.severity,
      recommendedAction:diffMeta.recommendation,
      evidencePending:Boolean(blindOperator && requiresPhotoForCount(diffMeta, task)),
      blindCount:Boolean(blindOperator),
      result:hasDiff ? "Diferencia" : "Exacto",
      cause,
      support,
      obs,
      photoDriveId: photoMeta?.id || "",
      photoDriveName: photoMeta?.name || "",
      photoDriveUrl: photoMeta?.webViewLink || "",
      photoDriveDownloadUrl: photoMeta?.webContentLink || "",
      photoLocalDataUrl: photoMeta?.localDataUrl || "",
      photoStorageMode: photoMeta?.storageMode || "",
      countedByUid:state.user.uid,
      countedByEmail:state.user.email,
      countedByRole:role(),
      countStartedAt:$("#countStartedAt")?.value || "",
      countDurationSeconds:countDurationSeconds(),
      createdAt:nowTS()
    });

    await persistReferenceMemoryFromCount({
      taskId:task.id,
      countId:countRef.id,
      taskType:task.taskType || task.type || "general",
      materialRef:task.materialRef,
      description:task.description || "",
      location:task.location || "",
      unit:task.unit || "",
      band:task.band || "",
      date, systemQty, countedQty, diff,
      unitCost:Number(task.unitCost || 0),
      diffPercent:diffMeta.percent,
      diffValue:diffMeta.value,
      severity:diffMeta.severity,
      cause, support, obs,
      countDurationSeconds:countDurationSeconds(),
      countedByUid:state.user.uid,
      countedByEmail:state.user.email,
      countedByRole:role(),
      source:"task_count"
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
        unitCost:Number(task.unitCost || 0),
        diffPercent:0,
        diffValue:0,
        severity:"exacto",
        sourceTaskId:task.id,
        lastCountId:countRef.id,
        lastComment:isCable ? "Metraje exacto pendiente de aprobación jefe logístico." : "Conteo exacto pendiente de aprobación jefe logístico.",
        createdAt:nowTS(),
        createdByUid:state.user.uid,
        createdByEmail:state.user.email,
        history:[historyEntry(isCable ? "metraje_exacto" : "conteo_exacto", "Pendiente aprobación jefe logístico.")]
      });

      toast(blindOperator ? "Conteo guardado. Pasa a validación interna." : (isCable ? "Metraje guardado. Pendiente aprobación del jefe logístico." : "Conteo guardado. Pendiente aprobación del jefe logístico."));
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

        toast(blindOperator ? "Conteo guardado. Se programó validación interna." : "Se detectó diferencia. Se generó reconteo obligatorio.");
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
          unitCost:Number(task.unitCost || 0),
          diffPercent:diffMeta.percent,
          diffValue:diffMeta.value,
          severity:diffMeta.severity,
          sourceTaskId:task.id,
          lastCountId:countRef.id,
          lastComment:"La diferencia persistió en reconteo. Requiere validación del jefe logístico.",
          createdAt:nowTS(),
          createdByUid:state.user.uid,
          createdByEmail:state.user.email,
          history:[historyEntry("diferencia_persistente", obs || "Diferencia persistente.")]
        });

        toast(blindOperator ? "Conteo guardado. Caso enviado a validación del jefe logístico." : "Diferencia persistente. Caso enviado al jefe logístico.");
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
    const diffMeta = buildDiffMeta(diff, systemQty, Number(c.unitCost || 0));
    if(requiresPhotoForCount(diffMeta, c) && !photoFile){ toast("La diferencia requiere foto obligatoria antes de guardar.", "error"); return; }
    if(requiresSupportForCount(diffMeta) && !support && !obs && cause === "N/A"){ toast("Registra causa, soporte u observación para dejar trazabilidad de la diferencia.", "error"); return; }
    let photoMeta = null;
    if(photoFile){
      try{
        photoMeta = await uploadCountPhotoToDrive(photoFile, c.materialRef, date, c.description || "");
        support = support ? `${support} | Foto: ${photoMeta.webViewLink || photoMeta.name}` : (photoMeta.webViewLink || photoMeta.name);
      }catch(err){
        toast("No se pudo adjuntar la foto: " + (err.message || err), "error");
        throw err;
      }
    }
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
      unitCost:Number(c.unitCost || 0),
      diffPercent:diffMeta.percent,
      diffValue:diffMeta.value,
      severity:diffMeta.severity,
      recommendedAction:diffMeta.recommendation,
      result:hasDiff ? "Diferencia" : "Exacto",
      cause,
      support,
      obs,
      photoDriveId: photoMeta?.id || "",
      photoDriveName: photoMeta?.name || "",
      photoDriveUrl: photoMeta?.webViewLink || "",
      photoDriveDownloadUrl: photoMeta?.webContentLink || "",
      photoLocalDataUrl: photoMeta?.localDataUrl || "",
      photoStorageMode: photoMeta?.storageMode || "",
      countedByUid:state.user.uid,
      countedByEmail:state.user.email,
      countedByRole:role(),
      countStartedAt:$("#countStartedAt")?.value || "",
      countDurationSeconds:countDurationSeconds(),
      createdAt:nowTS()
    });

    await persistReferenceMemoryFromCount({
      caseId:c.id,
      countId:countRef.id,
      taskType:mode === "auditoria" ? "conteo_auditoria" : "conteo_jefe_logistico",
      materialRef:c.materialRef,
      description:c.description || "",
      location:c.location || "",
      unit:c.unit || "",
      band:c.band || "",
      date, systemQty, countedQty, diff,
      unitCost:Number(c.unitCost || 0),
      diffPercent:diffMeta.percent,
      diffValue:diffMeta.value,
      severity:diffMeta.severity,
      cause, support, obs,
      countDurationSeconds:countDurationSeconds(),
      countedByUid:state.user.uid,
      countedByEmail:state.user.email,
      countedByRole:role(),
      source:"case_count"
    });

    await updateDoc(caseRef, {
      lastCountId:countRef.id,
      lastSystemQty:systemQty,
      lastCountedQty:countedQty,
      diff,
      diffPercent:diffMeta.percent,
      diffValue:diffMeta.value,
      severity:diffMeta.severity,
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
  if(saveAndNext) openNextExpressTask(taskId);
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
  const relatedCounts = state.counts.filter(x => x.caseId === caseId || x.taskId === c.sourceTaskId || x.id === c.lastCountId);
  const title = `Informe caso ${c.materialRef || "inventario"}`;
  if(window.jspdf?.jsPDF){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"portrait", unit:"pt", format:"letter" });
    const margin = 42;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = 44;
    const addPageIfNeeded = (h=40) => { if(y + h > pageH - 42){ doc.addPage(); y = 44; } };
    const text = (value, x, yy, opts={}) => doc.text(String(value ?? ""), x, yy, opts);
    const wrapped = (value, x, yy, maxW, lineH=13) => {
      const lines = doc.splitTextToSize(String(value ?? ""), maxW);
      lines.forEach(line => { addPageIfNeeded(lineH); text(line, x, y); y += lineH; });
      return lines.length;
    };
    doc.setFillColor(11,45,92);
    doc.rect(0,0,pageW,86,"F");
    doc.setTextColor(255,255,255);
    doc.setFont("helvetica","bold"); doc.setFontSize(18); text("Inventario Cíclico SIESA", margin, 36);
    doc.setFontSize(12); doc.setFont("helvetica","normal"); text("Informe automático PDF por caso", margin, 58);
    doc.setTextColor(13,44,82); y = 112;
    doc.setFont("helvetica","bold"); doc.setFontSize(16); text(title, margin, y); y += 22;
    const summary = [
      ["Referencia", c.materialRef || ""], ["Descripción", c.description || ""], ["Ubicación", c.location || ""], ["Estado", c.status || ""],
      ["Diferencia", fmt(c.diff || 0)], ["% diferencia", `${fmt(c.diffPercent || 0)}%`], ["Impacto", money(c.diffValue || 0)], ["Severidad", severityLabel(c.severity || "")],
      ["Último comentario", c.lastComment || ""]
    ];
    doc.setFontSize(10);
    summary.forEach(([k,v]) => { addPageIfNeeded(28); doc.setFont("helvetica","bold"); text(k + ":", margin, y); doc.setFont("helvetica","normal"); wrapped(v, margin + 105, y, pageW - margin*2 - 105, 12); y += 8; });
    y += 8;
    const section = (name) => { addPageIfNeeded(34); doc.setFillColor(238,245,255); doc.roundedRect(margin, y, pageW-margin*2, 24, 6, 6, "F"); doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(11,45,92); text(name, margin+10, y+16); y += 38; doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(13,44,82); };
    section("Historial y comentarios por referencia");
    if(history.length){ history.forEach(h => { addPageIfNeeded(44); doc.setFont("helvetica","bold"); text(`${formatDateTime(h.at || h.createdAt)} · ${h.role || ""} · ${h.action || h.mode || ""}`, margin, y); y += 12; doc.setFont("helvetica","normal"); wrapped(`${h.by || ""}: ${h.comment || ""}`, margin, y, pageW-margin*2, 11); y += 6; }); }
    else { text("Sin historial registrado.", margin, y); y += 16; }
    section("Verificación jefe logístico");
    if(jefeEntries.length){ jefeEntries.forEach(h => { addPageIfNeeded(34); wrapped(`${h.at || ""} · Sistema ${fmt(h.systemQty)} · Físico ${fmt(h.countedQty)} · Diferencia ${fmt(h.diff)} · ${h.comment || ""}`, margin, y, pageW-margin*2, 11); y += 6; }); }
    else { text("Sin verificación adicional registrada.", margin, y); y += 16; }
    section("Contabilización auditoría");
    if(auditEntries.length){ auditEntries.forEach(h => { addPageIfNeeded(34); wrapped(`${h.at || ""} · Sistema ${fmt(h.systemQty)} · Físico ${fmt(h.countedQty)} · Diferencia ${fmt(h.diff)} · ${h.comment || ""}`, margin, y, pageW-margin*2, 11); y += 6; }); }
    else { text("Sin contabilización de auditoría registrada.", margin, y); y += 16; }
    section("Conteos relacionados");
    if(relatedCounts.length){ relatedCounts.forEach(x => { addPageIfNeeded(34); wrapped(`${x.date || formatDateTime(x.createdAt)} · ${x.materialRef || ""} · Sistema ${fmt(x.systemQty)} · Físico ${fmt(x.countedQty)} · Dif. ${fmt(x.diff)} · ${money(x.diffValue || 0)} · ${x.countedByEmail || ""}`, margin, y, pageW-margin*2, 11); y += 6; }); }
    else { text("No hay conteos recientes cargados para este caso en memoria local.", margin, y); y += 16; }
    addPageIfNeeded(42);
    y += 10; doc.setFontSize(8); doc.setTextColor(100,117,141);
    text(`Generado por ${state.user?.email || ""} · ${new Date().toLocaleString("es-CO")}`, margin, y);
    doc.save(`informe_inventario_${safeId(c.materialRef || "caso")}_${todayISO()}.pdf`);
    return;
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Informe ${esc(c.materialRef)}</title><style>body{font-family:Century Gothic,Arial;padding:28px;color:#15352e}h1{color:#0b5d45}table{width:100%;border-collapse:collapse;margin-top:14px}td,th{border:1px solid #d7e5df;padding:8px;text-align:left}th{background:#edf6f2}.box{border:1px solid #d7e5df;padding:14px;border-radius:12px;margin:12px 0}</style></head><body><h1>Informe de diferencia de inventario</h1><div class="box"><b>Referencia:</b> ${esc(c.materialRef)}<br><b>Descripción:</b> ${esc(c.description || "")}<br><b>Ubicación:</b> ${esc(c.location || "")}<br><b>Estado:</b> ${esc(c.status)}<br><b>Diferencia:</b> ${fmt(c.diff)}<br><b>Impacto:</b> ${money(c.diffValue || 0)}</div><h2>Comentarios por referencia</h2><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Comentario</th></tr></thead><tbody>${history.map(h => `<tr><td>${esc(h.at || "")}</td><td>${esc(h.by || "")}</td><td>${esc(h.role || "")}</td><td>${esc(h.action || h.mode || "")}</td><td>${esc(h.comment || "")}</td></tr>`).join("")}</tbody></table><h2>Verificación jefe logístico</h2><table><thead><tr><th>Fecha</th><th>Sistema</th><th>Físico</th><th>Diferencia</th><th>Comentario</th></tr></thead><tbody>${jefeEntries.map(h => `<tr><td>${esc(h.at || "")}</td><td>${fmt(h.systemQty)}</td><td>${fmt(h.countedQty)}</td><td>${fmt(h.diff)}</td><td>${esc(h.comment || "")}</td></tr>`).join("")}</tbody></table><h2>Contabilización auditoría</h2><table><thead><tr><th>Fecha</th><th>Sistema</th><th>Físico</th><th>Diferencia</th><th>Comentario</th></tr></thead><tbody>${auditEntries.map(h => `<tr><td>${esc(h.at || "")}</td><td>${fmt(h.systemQty)}</td><td>${fmt(h.countedQty)}</td><td>${fmt(h.diff)}</td><td>${esc(h.comment || "")}</td></tr>`).join("")}</tbody></table><p>Generado por ${esc(state.user.email)} · ${new Date().toLocaleString("es-CO")}</p></body></html>`;
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
    const ref = doc(db, "syncState", "localExcelReminder");
    const snap = await getDoc(ref);
    if(snap.exists() && snap.data().lastReminderDate === todayISO()) return;
    await setDoc(ref, { lastReminderDate:todayISO(), updatedAt:nowTS() }, { merge:true });
    logSync("Recordatorio: hoy debes subir el Excel SIESA desde la app para reconstruir la base diaria. No se ejecuta lectura automática por Drive.");
    notifyUser("Subir Excel SIESA", "Carga el Excel diario para reiniciar la base y generar conteos.", { tag:`excel-reminder-${todayISO()}`, urgent:true });
  };
  setTimeout(check, 2500);
  state.autoTimer = setInterval(check, 5 * 60 * 1000);
}



function registerPWAFeatures(){
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./service-worker.js")
      .then(reg => console.info("Service Worker registrado", reg.scope))
      .catch(err => console.warn("No se pudo registrar Service Worker", err));
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    const btn = $("#installAppBtn");
    if(btn) btn.classList.remove("hidden");
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    toast("APP instalada correctamente.");
  });
}

async function installApp(){
  if(state.deferredInstallPrompt){
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice.catch(() => null);
    state.deferredInstallPrompt = null;
    return;
  }
  $("#installDialog")?.showModal();
}

function initAudioContext(){
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if(!AudioContext) return null;
  if(!state.audioCtx) state.audioCtx = new AudioContext();
  if(state.audioCtx.state === "suspended") state.audioCtx.resume().catch(() => {});
  return state.audioCtx;
}

function playAlertSound(kind = "info"){
  try{
    const ctx = initAudioContext();
    if(!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(kind === "urgent" ? 880 : 660, now);
    osc.frequency.setValueAtTime(kind === "urgent" ? 660 : 880, now + 0.10);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }catch(err){ console.warn("No se pudo reproducir sonido", err); }
}

async function ensureAlertsForDailyCounts(showToast = false){
  state.notificationsEnabled = true;
  localStorage.setItem("inventarioAlertsEnabled", "1");
  initAudioContext();
  if("Notification" in window && Notification.permission === "default"){
    try{ await Notification.requestPermission(); }catch(_){}
  }
  playAlertSound("info");
  if(showToast) toast("Alertas activadas para conteos diarios.");
}

async function enableAlerts(){
  initAudioContext();
  state.notificationsEnabled = true;
  localStorage.setItem("inventarioAlertsEnabled", "1");

  if(!("Notification" in window)){
    toast("Este navegador no soporta notificaciones. Los sonidos quedan activos mientras la app esté abierta.", "error");
    playAlertSound();
    return;
  }

  let permission = Notification.permission;
  if(permission === "default"){
    permission = await Notification.requestPermission();
  }

  if(permission === "granted"){
    toast("Alertas, sonidos y notificaciones activadas.");
    notifyUser("Inventario Cíclico", "Alertas activadas correctamente.", { tag:"alerts-enabled" });
    notifyPendingWork("manual");
  }else{
    toast("No se concedió permiso de notificaciones. Los sonidos quedan activos dentro de la app.", "error");
    playAlertSound("urgent");
  }
}

function notificationStorageKey(){
  return `inventarioNotified_${state.user?.uid || "anon"}`;
}

function getNotifiedSet(){
  try{ return new Set(JSON.parse(localStorage.getItem(notificationStorageKey()) || "[]")); }
  catch(e){ return new Set(); }
}

function saveNotifiedSet(set){
  localStorage.setItem(notificationStorageKey(), JSON.stringify([...set].slice(-500)));
}

function notifyUser(title, body, options = {}){
  if(!state.notificationsEnabled) return;
  playAlertSound(options.urgent ? "urgent" : "info");
  if("Notification" in window && Notification.permission === "granted"){
    try{
      navigator.serviceWorker?.ready?.then(reg => {
        reg.showNotification(title, {
          body,
          icon:"./icons/icon-192.png",
          badge:"./icons/icon-192.png",
          tag: options.tag || "inventario-siesa",
          renotify: Boolean(options.urgent),
          data:{ url:"./index.html?source=notification" }
        });
      }).catch(() => new Notification(title, { body, tag: options.tag || "inventario-siesa" }));
    }catch(e){
      try{ new Notification(title, { body, tag: options.tag || "inventario-siesa" }); }catch(_){}
    }
  }
}

function relevantNotificationItems(){
  const currentRole = role();
  const items = [];

  if(["inventario","super_admin"].includes(currentRole)){
    state.tasks
      .filter(t => ["assigned","pending_inventory","recount_required"].includes(t.status))
      .forEach(t => items.push({
        key:`task:${t.id}:${t.status}`,
        title:t.status === "recount_required" ? "Reconteo pendiente" : "Conteo asignado",
        body:`${t.materialRef || ""} · ${t.description || "Material pendiente"}`.slice(0, 140),
        urgent:t.status === "recount_required"
      }));
  }

  if(["jefe_logistico","super_admin"].includes(currentRole)){
    state.cases
      .filter(c => ["pending_jefe_logistico","pending_jefe_approval"].includes(c.status))
      .forEach(c => items.push({
        key:`case:${c.id}:${c.status}`,
        title:"Caso pendiente jefe logístico",
        body:`${c.materialRef || ""} · ${c.lastComment || "Requiere revisión"}`.slice(0, 140),
        urgent:c.status === "pending_jefe_logistico"
      }));
  }

  if(["auditoria","super_admin"].includes(currentRole)){
    state.cases
      .filter(c => c.status === "pending_auditoria")
      .forEach(c => items.push({
        key:`audit:${c.id}`,
        title:"Caso pendiente auditoría",
        body:`${c.materialRef || ""} · ${c.lastComment || "Requiere revisión"}`.slice(0, 140),
        urgent:true
      }));
  }

  if(["gerencia","super_admin"].includes(currentRole)){
    state.cases
      .filter(c => c.status === "pending_gerencia")
      .forEach(c => items.push({
        key:`mgmt:${c.id}`,
        title:"Caso pendiente gerencia",
        body:`${c.materialRef || ""} · ${c.lastComment || "Requiere aprobación"}`.slice(0, 140),
        urgent:true
      }));
  }

  return items;
}

function notifyPendingWork(source = "refresh"){
  if(!state.notificationsEnabled || !state.user) return;
  const notified = getNotifiedSet();
  const items = relevantNotificationItems();
  const fresh = items.filter(item => !notified.has(item.key));

  if(!fresh.length) return;

  fresh.slice(0, 3).forEach(item => {
    notified.add(item.key);
    notifyUser(item.title, item.body, { tag:item.key, urgent:item.urgent });
  });

  if(fresh.length > 3){
    notifyUser("Inventario Cíclico", `Tienes ${fresh.length} novedades pendientes.`, { tag:`summary-${Date.now()}`, urgent:true });
  }

  saveNotifiedSet(notified);
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
  const allCables = state.materials.filter(m => m.active !== false && isCableMaterial(m));
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
  notifyUser("Metraje de cables generado", `${tasks.length} cables para medir.`, { tag:`metraje-${todayISO()}` });
}


