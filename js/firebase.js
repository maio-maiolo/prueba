import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, enableIndexedDbPersistence, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8Nt7g_xp4qm3E6tANnTsvbiSob9ShgBw",
  authDomain: "ledgerapp-1f5fc.firebaseapp.com",
  projectId: "ledgerapp-1f5fc",
  storageBucket: "ledgerapp-1f5fc.firebasestorage.app",
  messagingSenderId: "357003953831",
  appId: "1:357003953831:web:f294b43de3f8201086fd82",
  measurementId: "G-2W2VN9CXBK"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

try { await enableIndexedDbPersistence(db); } catch(e){ console.warn("Persistence:", e.message); }

window.firebaseAuth = auth;
window.firebaseDb = db;

let cloudUser = null;
let unsubCloud = null;
let isSyncingFromCloud = false;
let lastRemoteHash = "";

const ICON_CLOUD = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
const ICON_CLOUD_CONNECTED = `<span class="relative grid place-items-center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg><span class="absolute -top-1 -right-1 w-[8px] h-[8px] bg-[#22C55E] rounded-full border-2 border-[#E8F5E9]"></span></span>`;

function updateCloudUI(user){
  const els = {
    email: document.getElementById('userEmailDisplay'),
    name: document.getElementById('userNameDisplay'),
    initial: document.getElementById('userInitial'),
    cloudBtn: document.getElementById('cloudSyncBtn'),
    emailM: document.getElementById('userEmailDisplayMobile'),
    nameM: document.getElementById('userNameDisplayMobile'),
    initialM: document.getElementById('userInitialMobile'),
    cloudBtnM: document.getElementById('cloudSyncBtnMobile'),
    logoutBtn: document.getElementById('cloudLogoutBtn'),
    logoutBtnM: document.getElementById('cloudLogoutBtnMobile')
  };
  if(user){
    if(els.email) els.email.textContent = user.email + " • sincronizado";
    if(els.emailM) els.emailM.textContent = user.email;
    if(els.name) els.name.textContent = user.displayName || user.email.split('@')[0];
    if(els.nameM) els.nameM.textContent = user.displayName || user.email.split('@')[0];
    if(els.initial) els.initial.textContent = (user.displayName||user.email)[0].toUpperCase();
    if(els.initialM) els.initialM.textContent = (user.displayName||user.email)[0].toUpperCase();
    if(els.cloudBtn){ els.cloudBtn.innerHTML = ICON_CLOUD_CONNECTED; els.cloudBtn.className = "hidden md:grid w-9 h-9 rounded-[10px] bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9] place-items-center hover:bg-[#DFF2E0] transition-colors"; els.cloudBtn.onclick = ()=>{}; }
    if(els.cloudBtnM){ els.cloudBtnM.innerHTML = ICON_CLOUD_CONNECTED; els.cloudBtnM.className = "shrink-0 w-8 h-8 rounded-full bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9] grid place-items-center"; els.cloudBtnM.onclick = ()=>{}; }
    if(els.logoutBtn){ els.logoutBtn.classList.remove('hidden'); els.logoutBtn.classList.add('grid'); }
    if(els.logoutBtnM){ els.logoutBtnM.classList.remove('hidden'); els.logoutBtnM.classList.add('grid'); }
  } else {
    if(els.email) els.email.textContent = "Modo local — sin nube";
    if(els.emailM) els.emailM.textContent = "Modo local";
    if(els.cloudBtn){ els.cloudBtn.innerHTML = ICON_CLOUD; els.cloudBtn.className = "hidden md:grid w-9 h-9 rounded-[10px] bg-[#F6F6F5] border border-line place-items-center hover:bg-white transition-colors text-ink/80"; els.cloudBtn.onclick = ()=>loginGoogle(); }
    if(els.cloudBtnM){ els.cloudBtnM.innerHTML = ICON_CLOUD; els.cloudBtnM.className = "shrink-0 w-8 h-8 rounded-full bg-[#0A0A0A] text-white grid place-items-center"; els.cloudBtnM.onclick = ()=>{ toggleMobileMenu(); loginGoogle(); }; }
    if(els.logoutBtn){ els.logoutBtn.classList.add('hidden'); }
    if(els.logoutBtnM){ els.logoutBtnM.classList.add('hidden'); }
  }
}

let _resolverSyncNube = null;
function mostrarModalSyncNube(cantidad){
  const modal = document.getElementById('modalSyncNube');
  const textEl = document.getElementById('modalSyncNubeText');
  if(textEl) textEl.innerHTML = `Tenés <b class="text-ink">${cantidad} ${cantidad===1?'usuario':'usuarios'}</b> en la nube.`;
  if(modal){ modal.classList.remove('hidden'); modal.classList.add('flex'); }
  return new Promise(resolve=>{ _resolverSyncNube = resolve; });
}
function resolverSyncNube(valor){
  const modal = document.getElementById('modalSyncNube');
  if(modal){ modal.classList.add('hidden'); modal.classList.remove('flex'); }
  if(_resolverSyncNube){ _resolverSyncNube(valor); _resolverSyncNube=null; }
}
window.mostrarModalSyncNube = mostrarModalSyncNube;
window.resolverSyncNube = resolverSyncNube;

window.loginGoogle = async () => { 
  try { 
    const freshProvider = new GoogleAuthProvider();
    freshProvider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, freshProvider); 
  } catch(e){ 
    if(e.code !== 'auth/popup-closed-by-user'){
      alert("Error login: "+e.message); 
    }
  } 
};
window.mostrarModalDesconectar = () => {
  const user = cloudUser || auth.currentUser;
  if(!user) { logoutCloudForzado(); return; }
  const modal = document.getElementById('modalDesconectarNube');
  if(modal){ modal.classList.remove('hidden'); modal.classList.add('flex'); }
};
window.cerrarModalDesconectar = () => {
  const modal = document.getElementById('modalDesconectarNube');
  if(modal){ modal.classList.add('hidden'); modal.classList.remove('flex'); }
};
window.confirmarDesconectarNube = async () => { cerrarModalDesconectar(); await logoutCloudForzado(); };
async function logoutCloudForzado(){
  try{ 
    if(unsubCloud){ unsubCloud(); unsubCloud=null; } 
    isSyncingFromCloud = true;
    try{
      const todos = getUsuariosSafe();
      const soloLocales = todos.filter(u => u && u.syncMode === 'local');
      
      if(soloLocales.length > 0){
        localStorage.setItem('ledger_users_v2', JSON.stringify(soloLocales));
        const curr = localStorage.getItem('ledger_current_v2');
        const currEsLocal = soloLocales.some(u => String(u.id) === String(curr));
        if(!currEsLocal){
          localStorage.setItem('ledger_current_v2', String(soloLocales[0].id));
        }
      } else {
        localStorage.removeItem('ledger_users_v2');
        localStorage.removeItem('ledger_current_v2');
      }

      localStorage.removeItem('ledger_last_manual_select');
      localStorage.removeItem('ledger_last_sync');
      localStorage.removeItem('ledger_deleted_ids');
      localStorage.removeItem('ledger_deleted_gastos');
      localStorage.removeItem('ledger_deleted_deudas');
      localStorage.removeItem('ledger_last_sync');
      
      lastRemoteHash = "";
      cloudUser = null;

      console.log("🔒 Logout: datos cloud eliminados del dispositivo, quedan", soloLocales.length, "usuarios locales");
    }catch(e){ console.warn("Error limpiando localStorage en logout", e); }
    
    await signOut(auth);
    setTimeout(()=>{ 
      isSyncingFromCloud = false;
      location.reload(); 
    }, 300);
  }catch(e){ 
    console.error(e);
    isSyncingFromCloud = false;
    location.reload();
  }
}
window.logoutCloud = () => mostrarModalDesconectar();

function getMejorUsuarioId(lista, respetarActualId){
  if(!lista || lista.length===0) return null;
  let mejor = lista[0];
  let mejorScore = ((mejor.gastos||[]).length*10) + ((mejor.deudas||[]).length*5) + (mejor.sueldo?1:0);
  for(let i=1;i<lista.length;i++){ const u=lista[i]; const score=((u.gastos||[]).length*10)+((u.deudas||[]).length*5)+(u.sueldo?1:0); if(score>mejorScore){ mejor=u; mejorScore=score; } }
  return mejor.id;
}

// === TOMBSTONES ===
function getDeletedGastosIds(){
  try{ return JSON.parse(localStorage.getItem('ledger_deleted_gastos')||'[]').map(String); }catch(e){ return []; }
}
function getDeletedDeudasIds(){
  try{ return JSON.parse(localStorage.getItem('ledger_deleted_deudas')||'[]').map(String); }catch(e){ return []; }
}
function getDeletedUsuariosIds(){
  try{ return JSON.parse(localStorage.getItem('ledger_deleted_ids')||'[]').map(String); }catch(e){ return []; }
}
function mergeDeletedLists(a, b){
  const set = new Set([...(a||[]).map(String), ...(b||[]).map(String)]);
  return Array.from(set);
}
function saveDeletedListsLocally(combinedUsuarios, combinedGastos, combinedDeudas){
  try{ localStorage.setItem('ledger_deleted_ids', JSON.stringify(combinedUsuarios)); }catch(e){}
  try{ localStorage.setItem('ledger_deleted_gastos', JSON.stringify(combinedGastos)); }catch(e){}
  try{ if(combinedDeudas) localStorage.setItem('ledger_deleted_deudas', JSON.stringify(combinedDeudas)); }catch(e){}
}

// === MERGE MEJORADO PARA FINANZAS.JS ACTUAL ===
async function mergeUsuariosPorId(localArr, remoteArr, delIdsOverride, delGastosOverride, delDeudasOverride){
  const byId = new Map();
  const byName = new Map();
  const delIds = delIdsOverride || getDeletedUsuariosIds();
  const delGastosIds = delGastosOverride || getDeletedGastosIds();
  const delDeudasIds = delDeudasOverride || getDeletedDeudasIds();

  const todos = [...(remoteArr||[]), ...(localArr||[])];

  for(let u of todos){
    if(!u || !u.id) continue;
    if(delIds.includes(String(u.id))) continue;
    const nameKey = (u.name||'').toLowerCase().trim();
    if(!nameKey) continue;

    if(byName.has(nameKey)){
      const principalId = byName.get(nameKey);
      const principal = byId.get(principalId);
      if(!principal) continue;

      // --- GASTOS: merge inteligente ---
      const gastosMap = new Map();
      // precargar principal
      (principal.gastos||[]).forEach(g=>{ if(g&&g.id) gastosMap.set(String(g.id), g); });
      // mergear con u.gastos
      (u.gastos||[]).forEach(g=>{
        if(!g || !g.id) return;
        const gid = String(g.id);
        if(delGastosIds.includes(gid)) { gastosMap.delete(gid); return; }
        if(!gastosMap.has(gid)){
          gastosMap.set(gid, g);
        } else {
          const prev = gastosMap.get(gid);
          // Merge: conservar campos nuevos de finanzas.js
          // cuotasRestantes: quedarnos con el menor (más pagado)
          // saldo/descripcion/monto: quedarnos con el más reciente según lógica
          const merged = {...prev, ...g};
          // Si ambos tienen cuotasRestantes, elegir el menor
          if(typeof prev.cuotasRestantes==='number' && typeof g.cuotasRestantes==='number'){
            merged.cuotasRestantes = Math.min(prev.cuotasRestantes, g.cuotasRestantes);
          }
          // Conservar origen, etiquetaTipo, deudaId, gastoId, origenDeudaId, origenGastoId si existen
          if(prev.origen && !merged.origen) merged.origen = prev.origen;
          if(prev.etiquetaTipo && !g.etiquetaTipo) merged.etiquetaTipo = prev.etiquetaTipo;
          if(prev.deudaId && !merged.deudaId) merged.deudaId = prev.deudaId;
          if(prev.gastoId && !merged.gastoId) merged.gastoId = prev.gastoId;
          if(prev.origenDeudaId && !merged.origenDeudaId) merged.origenDeudaId = prev.origenDeudaId;
          if(prev.origenGastoId && !merged.origenGastoId) merged.origenGastoId = prev.origenGastoId;
          gastosMap.set(gid, merged);
        }
      });
      principal.gastos = Array.from(gastosMap.values()).filter(g=> g && g.id && !delGastosIds.includes(String(g.id))).sort((a,b)=> new Date(b.fecha||0) - new Date(a.fecha||0));

      // --- DEUDAS: merge con pagos ---
      const dMap = new Map();
      (principal.deudas||[]).forEach(d=>{ if(d&&d.id) dMap.set(String(d.id), d); });
      (u.deudas||[]).forEach(d=>{
        if(!d || !d.id) return;
        const did = String(d.id);
        if(delDeudasIds.includes(did)) { dMap.delete(did); return; }
        if(d.gastoId && delGastosIds.includes(String(d.gastoId))) { dMap.delete(did); return; }
        if(!dMap.has(did)){
          dMap.set(did, d);
        } else {
          const prev = dMap.get(did);
          // Merge pagos: unir y deduplicar por fecha+monto
          const pagosPrev = prev.pagos||[];
          const pagosNew = d.pagos||[];
          const pagosMap = new Map();
          [...pagosPrev, ...pagosNew].forEach(p=>{
            const key = `${p.fecha||''}_${p.monto||0}_${p.tipo||''}`;
            pagosMap.set(key, p);
          });
          const pagosMerged = Array.from(pagosMap.values()).sort((a,b)=> new Date(a.fecha||0)-new Date(b.fecha||0));
          const merged = {
            ...prev,
            ...d,
            pagos: pagosMerged,
            // saldo: menor (más pagado), cuotasPagadas: mayor
            saldo: Math.min(Number(prev.saldo||0), Number(d.saldo||0)),
            cuotasPagadas: Math.max(Number(prev.cuotasPagadas||0), Number(d.cuotasPagadas||0))
          };
          // Conservar gastoId, origen, acreedorTipo si faltan
          if(prev.gastoId && !merged.gastoId) merged.gastoId = prev.gastoId;
          if(prev.origen && !merged.origen) merged.origen = prev.origen;
          if(prev.acreedorTipo && !d.acreedorTipo) merged.acreedorTipo = prev.acreedorTipo;
          dMap.set(did, merged);
        }
      });
      principal.deudas = Array.from(dMap.values()).filter(d=> !delDeudasIds.includes(String(d.id)) && (!d.gastoId || !delGastosIds.includes(String(d.gastoId))));

      const sP = principal.sueldo||0;
      const sN = u.sueldo||0;
      if(sN>0) principal.sueldo = Math.max(sP, sN);

      // Sueldo, ahorro, etc: merge simple
      if(u.ahorro) principal.ahorro = {...(principal.ahorro||{}), ...u.ahorro};

      if(u.ownerUid) principal.ownerUid = u.ownerUid;
      if(u.ownerEmail) principal.ownerEmail = u.ownerEmail;

      byId.set(principalId, principal);
    } else {
      const clone = JSON.parse(JSON.stringify(u));
      if(clone.gastos){
        clone.gastos = clone.gastos.filter(g=> g && g.id && !delGastosIds.includes(String(g.id)));
      }
      if(clone.deudas){
        clone.deudas = clone.deudas.filter(d=> !delDeudasIds.includes(String(d.id)) && (!d.gastoId || !delGastosIds.includes(String(d.gastoId))));
      }
      byId.set(String(clone.id), clone);
      byName.set(nameKey, String(clone.id));
    }
  }

  let resultado = Array.from(byId.values());
  // FIX CRITICO: Nunca dejar sin usuarios
  if(resultado.length > 1){
    const conDatos = resultado.filter(u=> (u.gastos?.length||0)>0 || (u.deudas?.length||0)>0 || (u.sueldo||0)>0);
    if(conDatos.length>0){
      resultado = resultado.filter(u=>{
        const esVacio = (u.gastos?.length||0)==0 && (u.deudas?.length||0)==0 && (u.sueldo||0)==0;
        const nombreNorm = (u.name||'').toLowerCase().trim();
        if(esVacio && (nombreNorm==='' || nombreNorm==='usuario' || nombreNorm==='mi perfil')) return false;
        return true;
      });
    }
  }
  if(resultado.length===0 && byId.size>0){
    resultado = [Array.from(byId.values())[0]];
  }
  console.log("🔄 MERGE RESULTADO:", resultado.map(u=>({name:u.name, sueldo:u.sueldo, gastos:u.gastos?.length, deudas:u.deudas?.length})));
  return resultado;
}


function getUsuariosSafe(){
  try{ return JSON.parse(localStorage.getItem('ledger_users_v2')||'[]'); }catch(e){ return []; }
}
function asegurarOwnerFields(lista, user){
  if(!user) return lista;
  return lista.map(u=>{
    if(u.syncMode==='local') return u;
    if(!u.ownerUid) u.ownerUid = user.uid;
    if(!u.ownerEmail) u.ownerEmail = (user.email||'').toLowerCase();
    if(!u.syncMode) u.syncMode = 'cloud';
    if(!u.dataVersion) u.dataVersion = 2;
    return u;
  });
}

async function uploadToCloud(){
  if(!cloudUser) return;
  if(isSyncingFromCloud) return;
  try{
    const allUsuarios = getUsuariosSafe();
    const localDelUsuarios = getDeletedUsuariosIds();
    const localDelGastos = getDeletedGastosIds();
    const localDelDeudas = getDeletedDeudasIds();
    if(allUsuarios.length===0 && localDelUsuarios.length===0 && localDelGastos.length===0 && localDelDeudas.length===0) return;
    const myEmail = (cloudUser.email||'').toLowerCase();
    const myUid = cloudUser.uid;
    let deletedIds = localDelUsuarios;

    let usuariosPropios = allUsuarios.filter(u=>{
      if(deletedIds.includes(String(u.id))) return false;
      if(u.syncMode==='local') return false;
      if(!u.ownerUid && !u.ownerEmail) return true;
      if(u.ownerUid && u.ownerUid===myUid) return true;
      if(u.ownerEmail && u.ownerEmail.toLowerCase()===myEmail) return true;
      return false;
    });
    usuariosPropios = asegurarOwnerFields(usuariosPropios, cloudUser);

    if(usuariosPropios.length===0 && localDelUsuarios.length===0 && localDelGastos.length===0 && localDelDeudas.length===0) return;

    const ref = doc(db, 'users', cloudUser.uid);
    let finalUsuarios = usuariosPropios;
    let remoteDelUsuarios = [];
    let remoteDelGastos = [];
    let remoteDelDeudas = [];
    try{
      const existingSnap = await getDoc(ref);
      if(existingSnap.exists()){
        const d = existingSnap.data();
        remoteDelUsuarios = (d.deletedIds||d.ledger_deleted_ids||[]).map(String);
        remoteDelGastos = (d.deletedGastosIds||d.ledger_deleted_gastos||[]).map(String);
        remoteDelDeudas = (d.deletedDeudasIds||d.ledger_deleted_deudas||[]).map(String);
        if((d.usuarios||[]).length>0){
          const remoteUsuarios = d.usuarios||[];
          const combinedDelUsuarios = mergeDeletedLists(localDelUsuarios, remoteDelUsuarios);
          const combinedDelGastos = mergeDeletedLists(localDelGastos, remoteDelGastos);
          const combinedDelDeudas = mergeDeletedLists(localDelDeudas, remoteDelDeudas);
          finalUsuarios = await mergeUsuariosPorId(usuariosPropios, remoteUsuarios, combinedDelUsuarios, combinedDelGastos, combinedDelDeudas);
          finalUsuarios = asegurarOwnerFields(finalUsuarios, cloudUser);
          remoteDelUsuarios = combinedDelUsuarios;
          remoteDelGastos = combinedDelGastos;
          remoteDelDeudas = combinedDelDeudas;
        }
      }
    }catch(e){ console.warn("Pre-merge fail", e); }

    try{
      const delG = mergeDeletedLists(localDelGastos, remoteDelGastos);
      const delU = mergeDeletedLists(localDelUsuarios, remoteDelUsuarios);
      const delD = mergeDeletedLists(localDelDeudas, remoteDelDeudas);
      if(delG.length>0 || delU.length>0 || delD.length>0){
        finalUsuarios = finalUsuarios.map(u=>{
          if(delU.includes(String(u.id))) return null;
          let filtradosG = u.gastos ? u.gastos.filter(g=> g && g.id && !delG.includes(String(g.id))) : u.gastos;
          let filtradosD = u.deudas ? u.deudas.filter(d=> !delD.includes(String(d.id)) && (!d.gastoId || !delG.includes(String(d.gastoId)))) : u.deudas;
          return {...u, gastos: filtradosG, deudas: filtradosD};
        }).filter(Boolean);
      }
    }catch(e){}

    const current = localStorage.getItem('ledger_current_v2') || null;
    const finalDeletedUsuarios = mergeDeletedLists(localDelUsuarios, remoteDelUsuarios);
    const finalDeletedGastos = mergeDeletedLists(localDelGastos, remoteDelGastos);
    const finalDeletedDeudas = mergeDeletedLists(localDelDeudas, remoteDelDeudas);
    saveDeletedListsLocally(finalDeletedUsuarios, finalDeletedGastos, finalDeletedDeudas);
    const payload = {
      usuarios: finalUsuarios,
      deletedIds: finalDeletedUsuarios,
      deletedGastosIds: finalDeletedGastos,
      deletedDeudasIds: finalDeletedDeudas,
      ledger_deleted_ids: finalDeletedUsuarios,
      ledger_deleted_gastos: finalDeletedGastos,
      ledger_deleted_deudas: finalDeletedDeudas,
      currentId: current,
      updatedAt: serverTimestamp(),
      email: cloudUser.email,
      multiMailSupport: true,
      appVersion: '2.1-finanzas-sync'
    };

    await setDoc(ref, payload, { merge: true });
    lastRemoteHash = JSON.stringify({u: payload.usuarios, dU: finalDeletedUsuarios, dG: finalDeletedGastos, dD: finalDeletedDeudas});
    localStorage.setItem('ledger_last_sync', Date.now().toString());
    console.log("☁️ Subido OK", finalUsuarios.length, "usuarios");
  }catch(e){ console.error("Error upload:", e); }
}

let uploadTimer = null;
function scheduleUpload(){
  if(!cloudUser) return;
  clearTimeout(uploadTimer);
  uploadTimer = setTimeout(async ()=>{
    if(isSyncingFromCloud){ setTimeout(()=>scheduleUpload(), 800); return; }
    await uploadToCloud();
  }, 600);
}
window.scheduleUpload = scheduleUpload;

function hookLocalSaves(){
  let attempts=0;
  const tryHook=()=>{
    attempts++;
    if(typeof saveUsuarios==='function' && !saveUsuarios._hooked){
      const orig=saveUsuarios;
      const hooked=function(u){ const r=orig(u); scheduleUpload(); return r; };
      hooked._hooked=true; window.saveUsuarios=hooked; try{ saveUsuarios=hooked; }catch(e){}
    }
    if(typeof setCurrentId==='function' && !setCurrentId._hooked){
      const orig=setCurrentId;
      const hooked=function(id){ const r=orig(id); try{ localStorage.setItem('ledger_last_manual_select', Date.now().toString()); }catch(e){} scheduleUpload(); return r; };
      hooked._hooked=true; window.setCurrentId=hooked; try{ setCurrentId=hooked; }catch(e){}
    }
    if(typeof updateUsuarioData==='function' && !updateUsuarioData._hooked){
      const orig=updateUsuarioData;
      const hooked=function(userId, updater){ const r=orig(userId, updater); scheduleUpload(); return r; };
      hooked._hooked=true; window.updateUsuarioData=hooked; try{ updateUsuarioData=hooked; }catch(e){}
    }
    if(!localStorage._hooked){
      const _setItem=localStorage.setItem.bind(localStorage);
      localStorage.setItem=function(k,v){
        const old=localStorage.getItem(k);
        _setItem(k,v);
        if(isSyncingFromCloud) return;
        if((k==='ledger_users_v2' || k==='ledger_current_v2' || k==='ledger_deleted_gastos' || k==='ledger_deleted_deudas' || k==='ledger_deleted_ids') && old!==v){ scheduleUpload(); }
      };
      localStorage._hooked=true;
    }
    if(attempts<80) setTimeout(tryHook, 300);
  };
  tryHook();
}
hookLocalSaves();

onAuthStateChanged(auth, async (user)=>{
  cloudUser=user;
  updateCloudUI(user);
  if(user){
    try{
      document.getElementById('modalBienvenida')?.classList.add('hidden');
    }catch(e){}
  }
  if(!user){ 
    if(unsubCloud){ unsubCloud(); unsubCloud=null; } 
    try{
      updateCloudUI(null);
    }catch(e){}
    return; 
  }
  const ref=doc(db, 'users', user.uid);
  let snap;
  try{ snap=await getDoc(ref); }catch(e){ console.error(e); }

  if(snap && snap.exists() && snap.data().usuarios?.length>0){
    const data=snap.data();
    const remoteUsuarios=data.usuarios||[];
    const remoteDelU = (data.deletedIds||data.ledger_deleted_ids||[]).map(String);
    const remoteDelG = (data.deletedGastosIds||data.ledger_deleted_gastos||[]).map(String);
    const remoteDelD = (data.deletedDeudasIds||data.ledger_deleted_deudas||[]).map(String);
    lastRemoteHash=JSON.stringify({u: remoteUsuarios, dU: remoteDelU, dG: remoteDelG, dD: remoteDelD});
    const localUsers=getUsuariosSafe();
    const localCloudUsers=localUsers.filter(u=>u.syncMode!=='local');

    if(localUsers.length===0 || localCloudUsers.length===0){
      console.log("☁️ Primera sync: cargando nube");
      isSyncingFromCloud=true;
      const asegurados=asegurarOwnerFields(remoteUsuarios, user);
      localStorage.setItem('ledger_users_v2', JSON.stringify(asegurados));
      if(data.currentId) localStorage.setItem('ledger_current_v2', data.currentId);
      saveDeletedListsLocally(mergeDeletedLists(getDeletedUsuariosIds(), remoteDelU), mergeDeletedLists(getDeletedGastosIds(), remoteDelG), mergeDeletedLists(getDeletedDeudasIds(), remoteDelD));
      localStorage.setItem('ledger_last_sync', (data.updatedAt?.toMillis?.()||Date.now()).toString());
      isSyncingFromCloud=false;
      try{ refrescarTodo(); }catch(e){ location.reload(); }
    } else {
      const combinedDelU = mergeDeletedLists(getDeletedUsuariosIds(), remoteDelU);
      const combinedDelG = mergeDeletedLists(getDeletedGastosIds(), remoteDelG);
      const combinedDelD = mergeDeletedLists(getDeletedDeudasIds(), remoteDelD);
      saveDeletedListsLocally(combinedDelU, combinedDelG, combinedDelD);
      const merged=await mergeUsuariosPorId(localCloudUsers, remoteUsuarios, combinedDelU, combinedDelG, combinedDelD);
      const localOnly=localUsers.filter(u=>u.syncMode==='local');
      const finalLocal=[...merged, ...localOnly];
      const dedup=new Map();
      finalLocal.forEach(u=>{ if(u&&u.id) dedup.set(String(u.id), u); });
      const finalArr=Array.from(dedup.values());
      const localStr=JSON.stringify(localUsers);
      const finalStr=JSON.stringify(finalArr);
      if(finalStr!==localStr){
        isSyncingFromCloud=true;
        localStorage.setItem('ledger_users_v2', finalStr);
        const mejorId=data.currentId || getMejorUsuarioId(finalArr, localStorage.getItem('ledger_current_v2'));
        if(mejorId) localStorage.setItem('ledger_current_v2', mejorId);
        localStorage.setItem('ledger_last_sync', Date.now().toString());
        isSyncingFromCloud=false;
        await uploadToCloud();
        try{ refrescarTodo(); }catch(e){}
      }
    }
  } else {
    const users=getUsuariosSafe();
    if(users.length===0){
      const pendingName=localStorage.getItem('ledger_pending_profile') || user.displayName || user.email?.split('@')[0] || 'Mi perfil';
      const nuevo={ id: Date.now(), name: pendingName, email: user.email||'', note:'Usuario en la nube - '+user.email, gastos:[], sueldo:0, deudas:[], ahorro:null, createdAt: new Date().toISOString(), syncMode: 'cloud', ownerUid: user.uid, ownerEmail: user.email.toLowerCase(), dataVersion: 2 };
      users.push(nuevo);
      if(typeof saveUsuarios==='function') saveUsuarios(users); else localStorage.setItem('ledger_users_v2', JSON.stringify(users));
      if(typeof setCurrentId==='function') setCurrentId(nuevo.id); else localStorage.setItem('ledger_current_v2', nuevo.id);
      document.getElementById('modalBienvenida')?.classList.add('hidden');
      setTimeout(()=>{ try{ refrescarTodo(); }catch(e){} }, 300);
    }
    await uploadToCloud();
  }

  if(unsubCloud) unsubCloud();
  unsubCloud=onSnapshot(ref, (docSnap)=>{
    if(!docSnap.exists() || isSyncingFromCloud) return;
    const data = docSnap.data();
    const remoteUsuariosRaw=data.usuarios||[];
    const remoteDelUsuariosRaw = (data.deletedIds||data.ledger_deleted_ids||[]).map(String);
    const remoteDelGastosRaw = (data.deletedGastosIds||data.ledger_deleted_gastos||[]).map(String);
    const remoteDelDeudasRaw = (data.deletedDeudasIds||data.ledger_deleted_deudas||[]).map(String);
    const newHash=JSON.stringify({u: remoteUsuariosRaw, dU: remoteDelUsuariosRaw, dG: remoteDelGastosRaw, dD: remoteDelDeudasRaw});
    if(newHash===lastRemoteHash) return;

    console.log("☁️ Cambio remoto detectado");
    const localUsers=getUsuariosSafe();
    const localOnly=localUsers.filter(u=>u.syncMode==='local');
    const localDelU = getDeletedUsuariosIds();
    const localDelG = getDeletedGastosIds();
    const localDelD = getDeletedDeudasIds();
    const combinedDelU = mergeDeletedLists(localDelU, remoteDelUsuariosRaw);
    const combinedDelG = mergeDeletedLists(localDelG, remoteDelGastosRaw);
    const combinedDelD = mergeDeletedLists(localDelD, remoteDelDeudasRaw);
    if(combinedDelU.length !== localDelU.length || combinedDelG.length !== localDelG.length || combinedDelD.length !== localDelD.length){
      saveDeletedListsLocally(combinedDelU, combinedDelG, combinedDelD);
    }

    mergeUsuariosPorId(localUsers.filter(u=>u.syncMode!=='local'), remoteUsuariosRaw, combinedDelU, combinedDelG, combinedDelD).then(merged=>{
      const finalArr=[...merged, ...localOnly];
      const dedup=new Map();
      finalArr.forEach(u=>{ if(u&&u.id) dedup.set(String(u.id), u); });
      const finalList=Array.from(dedup.values());
      lastRemoteHash=newHash;
      isSyncingFromCloud=true;
      localStorage.setItem('ledger_users_v2', JSON.stringify(finalList));
      const remoteCurrentId=docSnap.data().currentId;
      if(remoteCurrentId){
        const lastManual=parseInt(localStorage.getItem('ledger_last_manual_select')||'0');
        if(Date.now()-lastManual>5000){
          const exists=finalList.find(u=> String(u.id)===String(remoteCurrentId));
          if(exists) localStorage.setItem('ledger_current_v2', remoteCurrentId);
        }
      }
      localStorage.setItem('ledger_last_sync', (docSnap.data().updatedAt?.toMillis?.()||Date.now()).toString());
      isSyncingFromCloud=false;
      try{ refrescarTodo(); }catch(e){ location.reload(); }
    });
  }, (err)=>{ console.error("onSnapshot error", err); });
});

window._forceUpload=uploadToCloud;
window._forceDownload=async()=>{
  if(!cloudUser) return alert("No logueado");
  const ref=doc(db, 'users', cloudUser.uid);
  const snap=await getDoc(ref);
  console.log("NUBE RAW:", snap.data());
  return snap.data();
};
window._debugLocal=()=>{
  const users=getUsuariosSafe();
  console.log("LOCAL:", users.map(u=>({id:u.id, name:u.name, sueldo:u.sueldo, gastos:u.gastos?.length, deudas:u.deudas?.length})));
};
