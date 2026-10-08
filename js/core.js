// core.js - Usuarios, storage, modales de usuario, auth UI
// Registrar Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registrado con éxito:', reg.scope))
      .catch(err => console.log('Error al registrar Service Worker:', err));
  });
}

const fmt = (n) => new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', minimumFractionDigits:2 }).format(n||0);

// === FORMATEO MILES CON PUNTO $ 1.000.000 ===
function formatearConPuntos(valor, conSigno=false){
  if(valor===null || valor===undefined) return "";
  let str = String(valor).replace(/[^\d]/g, "");
  if(str==="") return conSigno ? "" : "";
  str = str.replace(/^0+(?=\d)/, "");
  let conPuntos = str.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return conSigno ? (conPuntos ? "$ " + conPuntos : "") : conPuntos;
}
function formatearConPuntosConSigno(valor){
  return formatearConPuntos(valor, true);
}
function parsearMonto(valorFormateado){
  if(!valorFormateado) return 0;
  let str = String(valorFormateado).replace(/\$/g,"").replace(/\./g, "").replace(/[^\d.-]/g, "").trim();
  let num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}
function aplicarFormatoMilesAInput(input, conSigno=false){
  if(!input) return;
  input.type = 'text';
  input.inputMode = 'numeric';
  input.setAttribute('autocomplete','off');
  input.dataset.conSigno = conSigno ? "1" : "0";
  input.addEventListener('input', (e)=>{
    const target = e.target;
    const tieneSigno = target.dataset.conSigno==="1";
    const start = target.selectionStart || 0;
    const antes = target.value;
    const formateado = tieneSigno ? formatearConPuntosConSigno(antes) : formatearConPuntos(antes,false);
    target.value = formateado;
    let diff = formateado.length - antes.length;
    let nuevaPos = start + diff;
    // no dejar cursor antes del $ 
    if(tieneSigno && nuevaPos < 2) nuevaPos = formateado.length;
    try{ target.setSelectionRange(nuevaPos, nuevaPos); }catch(err){}
  });
  // focus: si esta vacio con signo, no hacer nada. Si tiene solo $ dejar listo
  input.addEventListener('focus', (e)=>{
    if(conSigno && !e.target.value){
      // opcional: no autocompletar $ hasta que escriba
    }
  });
}
function activarFormatoMiles(){
  // sin $: gastos generales
  const idsSinSigno = ['input-sueldo','monto','ahorroObjetivo','ahorroMensual','ahorroActual'];
  idsSinSigno.forEach(id=>{
    const el = document.getElementById(id);
    if(el) aplicarFormatoMilesAInput(el, false);
  });
  // con $: formulario de deudas
  const idsConSigno = ['dMontoOriginal','dSaldo','dCuotaMensual'];
  idsConSigno.forEach(id=>{
    const el = document.getElementById(id);
    if(el) aplicarFormatoMilesAInput(el, true);
  });
}

const STORAGE_USERS = 'ledger_users_v2';
const STORAGE_TOUR = 'ledger_tour_icons_v1'; // legacy global (retrocompatibilidad)
const STORAGE_TOUR_PREFIX = 'ledger_tour_icons_v1_';
const STORAGE_CURRENT = 'ledger_current_v2';

function getTourKeyPorUsuario(userId){
  const id = userId || getCurrentId();
  if(!id) return STORAGE_TOUR;
  return STORAGE_TOUR_PREFIX + String(id);
}
function yaVioTourIconos(userId){
  const key = getTourKeyPorUsuario(userId);
  // Soporta legacy global para no mostrar 2 veces a usuarios viejos
  if(localStorage.getItem(key) === 'visto') return true;
  if(localStorage.getItem(STORAGE_TOUR) === 'visto' && getUsuarioActual() && String(getUsuarioActual().id) === String(getCurrentId())){
    // migrar flag global a per-usuario si existe
    try{ localStorage.setItem(key, 'visto'); }catch(e){}
    return true;
  }
  return false;
}
function marcarTourIconosVisto(userId){
  try{
    localStorage.setItem(getTourKeyPorUsuario(userId), 'visto');
    // también marcamos global para usuarios viejos
    localStorage.setItem(STORAGE_TOUR, 'visto');
  }catch(e){}
}

function getUsuarios(){ 
  try{
    const raw = JSON.parse(localStorage.getItem(STORAGE_USERS)||'[]');
    // migración suave: asegurar campos nuevos
    let changed=false;
    raw.forEach(u=>{
      if(!('ownerEmail' in u)){ u.ownerEmail = (u.email||'').toLowerCase()||null; changed=true; }
      if(!('ownerUid' in u)){ u.ownerUid = u.ownerUid||null; changed=true; }
      if(!('deudas' in u)){ u.deudas=[]; changed=true; }
    });
    if(changed){
      try{ localStorage.setItem(STORAGE_USERS, JSON.stringify(raw)); }catch(e){}
    }
    return raw;
  }catch(e){ return []; }
}
function saveUsuarios(u){ 
  localStorage.setItem(STORAGE_USERS, JSON.stringify(u)); 
  try{ if(window.scheduleUpload) window.scheduleUpload(); }catch(e){}
}
function getCurrentId(){ 
  let id = localStorage.getItem(STORAGE_CURRENT);
  const users = getUsuariosSafe ? getUsuariosSafe() : getUsuarios();
  if(!id && users.length>0){
    // Auto-reparación: si no hay current pero hay usuarios, usar el primero
    id = String(users[0].id);
    try{ localStorage.setItem(STORAGE_CURRENT, id); }catch(e){}
  } else if(id && users.length>0){
    const existe = users.some(u=>String(u.id)===String(id));
    if(!existe){
      // El current apunta a un usuario borrado, restaurar al primero
      id = String(users[0].id);
      try{ localStorage.setItem(STORAGE_CURRENT, id); }catch(e){}
      console.warn('⚠️ Current ID inválido, restaurado a', users[0].name);
    }
  }
  return localStorage.getItem(STORAGE_CURRENT); 
}
function setCurrentId(id){ 
  localStorage.setItem(STORAGE_CURRENT, String(id)); 
  try{ localStorage.setItem('ledger_last_manual_select', Date.now().toString()); }catch(e){}
  try{ if(window.scheduleUpload) window.scheduleUpload(); }catch(e){}
}
function getUsuarioActual(){
  const id = getCurrentId();
  const users = getUsuariosSafe ? getUsuariosSafe() : getUsuarios();
  if(users.length===0) return null;
  if(!id){
    // Sin current pero hay usuarios, devolver primero
    try{ localStorage.setItem(STORAGE_CURRENT, String(users[0].id)); }catch(e){}
    return users[0];
  }
  const found = users.find(u=>String(u.id)===String(id));
  if(found) return found;
  // Fallback: si no se encontró, usar primero y corregir current
  try{ localStorage.setItem(STORAGE_CURRENT, String(users[0].id)); }catch(e){}
  return users[0];
}
// Helper seguro para firebase
function getUsuariosSafe(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_USERS)||'[]'); }catch(e){ return []; }
}
function updateUsuarioData(userId, updater){
  const users = getUsuarios();
  const idx = users.findIndex(u=>String(u.id)===String(userId));
  if(idx>=0){ 
    users[idx]=updater(users[idx]); 
    // actualizar timestamp interno para resolver conflictos
    users[idx].updatedAtLocal = Date.now();
    saveUsuarios(users); 
  }
}

function migrarDatosAntiguos(){
  const oldGastos = JSON.parse(localStorage.getItem('gastos')||'null');
  const oldSueldo = parseFloat(localStorage.getItem('sueldo')||'0');
  if((oldGastos && oldGastos.length>0 || oldSueldo>0) && getUsuarios().length===0){
    const defaultUser = { id: Date.now(), name:'Mi cuenta', email:'', note:'Migrado del sistema anterior', gastos: oldGastos||[], sueldo: oldSueldo||0, createdAt: new Date().toISOString() };
    saveUsuarios([defaultUser]); setCurrentId(defaultUser.id);
    localStorage.removeItem('gastos'); localStorage.removeItem('sueldo');
  }
}

function toggleMobileMenu(){
  const menu = document.getElementById('mobileMenu');
  if(!menu) return;
  
  // Crear backdrop si no existe
  let backdrop = document.getElementById('mobileMenuBackdrop');
  if(!backdrop){
    backdrop = document.createElement('div');
    backdrop.id = 'mobileMenuBackdrop';
    backdrop.className = 'fixed inset-0 bg-black/30 backdrop-blur-sm z-20 md:hidden';
    backdrop.onclick = cerrarMobileMenu;
    document.body.appendChild(backdrop);
  }

  const isHidden = menu.classList.contains('hidden');
  
  if(isHidden){
    menu.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', escListenerMenu);
    setTimeout(()=>{
      document.addEventListener('click', outsideClickListenerMenu, true);
    }, 50);
  } else {
    cerrarMobileMenu();
  }
}

function cerrarMobileMenu(){
  const menu = document.getElementById('mobileMenu');
  const backdrop = document.getElementById('mobileMenuBackdrop');
  if(menu) menu.classList.add('hidden');
  if(backdrop) backdrop.classList.add('hidden');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', escListenerMenu);
  document.removeEventListener('click', outsideClickListenerMenu, true);
}

function escListenerMenu(e){
  if(e.key === 'Escape') cerrarMobileMenu();
}

function outsideClickListenerMenu(e){
  const menu = document.getElementById('mobileMenu');
  if(!menu || menu.classList.contains('hidden')) return;
  // Ignorar clicks en el boton hamburguesa
  if(e.target.closest && e.target.closest('[onclick*="toggleMobileMenu"]')) return;
  if(e.target.closest && e.target.closest('#mobileMenu')) return;
  // Si tocó fuera del menu, cerrar
  if(!menu.contains(e.target)){
    cerrarMobileMenu();
  }
}

window.cerrarMobileMenu = cerrarMobileMenu;

function abrirModalUsuarios(){ renderListaUsuariosModal(); document.getElementById('modalUsuarios').classList.remove('hidden'); }
function cerrarModalUsuarios(){ document.getElementById('modalUsuarios').classList.add('hidden'); }
function actualizarVisibilidadCamposSync(){
  var cb = document.getElementById('newUserSync');
  var campos = document.getElementById('camposNombreNota');
  var infoSync = document.getElementById('infoSyncActiva');
  var sub = document.getElementById('syncNewUserSub');
  var icon = document.getElementById('syncNewUserIcon');
  var hint = document.getElementById('syncNewUserHint');
  var hasCloud = false;
  try{ hasCloud = !!(window.firebaseAuth && window.firebaseAuth.currentUser); }catch(e){}
  try{ if(typeof cloudUser !== 'undefined' && cloudUser) hasCloud = true; }catch(e){}
  var ICON_LOCK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="black" stroke-opacity="0.85" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var ICON_CLOUD_WHITE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>';
  if(!cb) return;
  if(cb.checked){
    if(campos) campos.classList.add('hidden');
    if(infoSync) infoSync.classList.remove('hidden');
    if(sub) sub.textContent = hasCloud ? 'Respaldo y multi-dispositivo • Activo' : 'Se conectará a la nube al crear';
    if(icon) { icon.innerHTML = ICON_CLOUD_WHITE; icon.className = 'w-9 h-9 rounded-[10px] bg-[#0A0A0A] text-white grid place-items-center shadow-sm'; }
    if(hint && !hasCloud){ hint.textContent = 'Al crear se abrirá el login de Google para sincronizar.'; hint.classList.remove('hidden'); }
    if(hint && hasCloud) hint.classList.add('hidden');
  } else {
    if(campos) campos.classList.remove('hidden');
    if(infoSync) infoSync.classList.add('hidden');
    if(sub) sub.textContent = 'Se guardará solo en este dispositivo (local)';
    if(icon) { icon.innerHTML = ICON_LOCK; icon.className = 'w-9 h-9 rounded-[10px] bg-white border border-line grid place-items-center shadow-sm'; }
    if(hint) { hint.textContent = 'Se guardará solo en este dispositivo (local)'; hint.classList.remove('hidden'); if(!hasCloud){ hint.textContent = 'Conectá Google para sincronizar. Si lo activás ahora, te pediremos iniciar sesión.'; } }
  }
}

function abrirModalAgregarUsuario(){ 
  try{ cerrarModalUsuarios(); }catch(e){}
  try{ cerrarModalCambiarUsuario(); }catch(e){}

  // limpiar inputs
  ['newUserName','newUserNote','newUserNameSync','newUserNoteSync','newUserEmail'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  ['newUserError','newUserErrorSync'].forEach(function(id){
    var el=document.getElementById(id); if(el){ el.classList.add('hidden'); el.textContent=''; }
  });

  var hasCloud = false;
  try{ hasCloud = !!(window.firebaseAuth && window.firebaseAuth.currentUser); }catch(e){}
  try{ if(typeof cloudUser !== 'undefined' && cloudUser) hasCloud = true; }catch(e){}

  var stateNoSync = document.getElementById('modalStateNoSync');
  var stateSync = document.getElementById('modalStateSync');
  var subtitle = document.getElementById('modalAgregarSubtitle');

  // reset form wrappers
  var w1=document.getElementById('formLocalWrapper');
  var w2=document.getElementById('formLocalWrapperSync');
  if(w1) w1.classList.add('hidden');
  if(w2) w2.classList.add('hidden');
  var btnNoSync=document.getElementById('btnMostrarFormLocalNoSync');
  var btnSync=document.getElementById('btnMostrarFormLocalSync');
  if(btnNoSync) btnNoSync.classList.remove('hidden');
  if(btnSync) btnSync.classList.remove('hidden');

  if(hasCloud){
    // MODO SINCRONIZADO
    if(stateNoSync) stateNoSync.classList.add('hidden');
    if(stateSync) stateSync.classList.remove('hidden');
    if(subtitle) subtitle.textContent='Sesión activa';
    try{
      var u = window.firebaseAuth.currentUser || cloudUser;
      var email = u?.email || '';
      var name = u?.displayName || email.split('@')[0] || 'Usuario';
      var init = (name||email||'U')[0].toUpperCase();
      var e1=document.getElementById('syncStateEmail'); if(e1) e1.textContent=email;
      var e2=document.getElementById('syncStateName'); if(e2) e2.textContent=name;
      var e3=document.getElementById('syncStateInitial'); if(e3) e3.textContent=init;
    }catch(e){}
  } else {
    // MODO NO SINCRONIZADO
    if(stateSync) stateSync.classList.add('hidden');
    if(stateNoSync) stateNoSync.classList.remove('hidden');
    if(subtitle) subtitle.textContent='Elige una opción';
  }

  var modal = document.getElementById('modalAgregarUsuario');
  if(modal) modal.classList.remove('hidden'); 
}
function cerrarModalAgregarUsuario(){ 
  var m=document.getElementById('modalAgregarUsuario');
  if(m) m.classList.add('hidden');
}

// --- FUNCIONES QUE FALTABAN (causa del modal vacío) ---
function mostrarFormLocal(){
  var hasCloud = false;
  try{ hasCloud = !!(window.firebaseAuth && window.firebaseAuth.currentUser); }catch(e){}
  try{ if(typeof cloudUser !== 'undefined' && cloudUser) hasCloud = true; }catch(e){}

  if(hasCloud){
    var w=document.getElementById('formLocalWrapperSync');
    var btn=document.getElementById('btnMostrarFormLocalSync');
    if(w) w.classList.remove('hidden');
    if(btn) btn.classList.add('hidden');
    setTimeout(function(){ var el=document.getElementById('newUserNameSync'); if(el) el.focus(); },100);
  } else {
    var w2=document.getElementById('formLocalWrapper');
    var btn2=document.getElementById('btnMostrarFormLocalNoSync');
    if(w2) w2.classList.remove('hidden');
    if(btn2) btn2.classList.add('hidden');
    setTimeout(function(){ var el=document.getElementById('newUserName'); if(el) el.focus(); },100);
  }
}
function ocultarFormLocal(){
  var w1=document.getElementById('formLocalWrapper');
  var w2=document.getElementById('formLocalWrapperSync');
  if(w1) w1.classList.add('hidden');
  if(w2) w2.classList.add('hidden');
  var b1=document.getElementById('btnMostrarFormLocalNoSync');
  var b2=document.getElementById('btnMostrarFormLocalSync');
  if(b1) b1.classList.remove('hidden');
  if(b2) b2.classList.remove('hidden');
  ['newUserError','newUserErrorSync'].forEach(function(id){
    var el=document.getElementById(id); if(el){ el.classList.add('hidden'); el.textContent=''; }
  });
}
function accionLoginGoogleDesdeModal(){
  cerrarModalAgregarUsuario();
  if(typeof loginGoogle==='function') loginGoogle();
  else if(window.firebaseAuth){ 
    // fallback
    try{ const { signInWithPopup } = window; }catch(e){}
  }
}
function cerrarSesionDesdeModal(){
  cerrarModalAgregarUsuario();
  // usa el modal de confirmación existente si existe
  var modalDesc=document.getElementById('modalDesconectarNube');
  if(modalDesc){ modalDesc.classList.remove('hidden'); }
  else if(typeof logoutCloud==='function'){ logoutCloud(); }
  else if(typeof confirmarDesconectarNube==='function'){ confirmarDesconectarNube(); }
}
function crearUsuarioLocal(){
  var hasCloud = false;
  try{ hasCloud = !!(window.firebaseAuth && window.firebaseAuth.currentUser); }catch(e){}
  try{ if(typeof cloudUser !== 'undefined' && cloudUser) hasCloud = true; }catch(e){}

  var nameEl = hasCloud ? document.getElementById('newUserNameSync') : document.getElementById('newUserName');
  var noteEl = hasCloud ? document.getElementById('newUserNoteSync') : document.getElementById('newUserNote');
  var errorEl = hasCloud ? document.getElementById('newUserErrorSync') : document.getElementById('newUserError');

  var name = nameEl ? nameEl.value.trim() : '';
  var note = noteEl ? noteEl.value.trim() : '';

  if(!name){
    if(errorEl){ errorEl.textContent='⚠️ Poné un nombre'; errorEl.classList.remove('hidden'); }
    if(nameEl) nameEl.focus();
    return;
  }
  if(errorEl){ errorEl.classList.add('hidden'); }

  try{
    var users = typeof getUsuarios==='function' ? getUsuarios() : JSON.parse(localStorage.getItem('ledger_usuarios_v2')||'[]');
    var nuevo = { id: Date.now(), name: name, email: '', note: note||'Usuario local - offline', gastos:[], sueldo:0, deudas:[], ahorro:null, createdAt: new Date().toISOString(), syncMode: 'local' };
    users.push(nuevo);
    if(typeof saveUsuarios==='function') saveUsuarios(users);
    else localStorage.setItem('ledger_usuarios_v2', JSON.stringify(users));
    if(typeof setCurrentId==='function') setCurrentId(nuevo.id);
    else localStorage.setItem('ledger_current_v2', String(nuevo.id));
    try{ 
      var k = (typeof getTourKeyPorUsuario==='function') ? getTourKeyPorUsuario(nuevo.id) : 'ledger_tour_icons_v1_'+nuevo.id;
      localStorage.removeItem(k); 
    }catch(e){}
    cerrarModalAgregarUsuario();
    if(typeof refrescarTodo==='function') refrescarTodo();
    else location.reload();
  }catch(e){
    console.error(e);
    if(errorEl){ errorEl.textContent='Error: '+e.message; errorEl.classList.remove('hidden'); }
  }
}


document.addEventListener('DOMContentLoaded', function(){
  var cb = document.getElementById('newUserSync');
  if(cb){
    cb.addEventListener('change', function(){
      actualizarVisibilidadCamposSync();
    });
  }
  var bg = document.getElementById('modalLoginSyncBackdrop');
  if(bg) bg.addEventListener('click', function(){ cerrarModalLoginSync(); });
});

// MODALES LOGIN SYNC
function mostrarModalLoginSync(nombre, email){
  const modal = document.getElementById('modalLoginSync');
  const nameEl = document.getElementById('loginSyncUserName');
  const emailEl = document.getElementById('loginSyncUserEmail');
  const initialEl = document.getElementById('loginSyncInitial');
  if(nameEl) nameEl.textContent = nombre || 'este usuario';
  if(emailEl) emailEl.textContent = email ? email + ' • modo local' : 'Usuario creado en modo local';
  if(initialEl) initialEl.textContent = (nombre||'U')[0].toUpperCase();
  if(modal){ modal.classList.remove('hidden'); modal.classList.add('flex'); }
}
function cerrarModalLoginSync(){
  const modal = document.getElementById('modalLoginSync');
  if(modal){ modal.classList.add('hidden'); modal.classList.remove('flex'); }
}
function confirmarLoginSync(){
  cerrarModalLoginSync();
  if(typeof loginGoogle === 'function') loginGoogle();
}
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape'){
    const m = document.getElementById('modalLoginSync');
    if(m && !m.classList.contains('hidden')) cerrarModalLoginSync();
  }
});

function abrirModalCambiarUsuario(){ renderListaCambiarUsuario(); document.getElementById('modalCambiarUsuario').classList.remove('hidden'); }
function cerrarModalCambiarUsuario(){ document.getElementById('modalCambiarUsuario').classList.add('hidden'); }
function abrirModalVerUsuario(){
  const u = getUsuarioActual();
  if(!u){ alert('Seleccioná un usuario primero'); return; }
  document.getElementById('viewUserInitial').innerText = (u.name||'?').charAt(0).toUpperCase();
  document.getElementById('viewUserName').innerText = u.name;
  document.getElementById('viewUserEmail').innerText = u.email||'Sin email';
  document.getElementById('viewUserGastosCount').innerText = (u.gastos||[]).length;
  document.getElementById('viewUserTotal').innerText = fmt((u.gastos||[]).reduce((a,b)=>a+b.monto,0));
  document.getElementById('viewUserSueldo').innerText = fmt(u.sueldo||0);
  const noteEl = document.getElementById('viewUserNote');
  if(u.note){ noteEl.innerText = u.note; noteEl.classList.remove('hidden'); } else { noteEl.classList.add('hidden'); }
  document.getElementById('modalVerUsuario').classList.remove('hidden');
}
function cerrarModalVerUsuario(){ document.getElementById('modalVerUsuario').classList.add('hidden'); }

function esEmailValido(email){
  if(!email) return true; // opcional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function emailExiste(email){
  if(!email) return false;
  const low = email.toLowerCase().trim();
  return getUsuarios().some(u=> (u.email||'').toLowerCase().trim() === low);
}

function crearUsuario(){
  console.log("crearUsuario clicked");
  const nameEl = document.getElementById('newUserName');
  const noteEl = document.getElementById('newUserNote');
  const errorEl = document.getElementById('newUserError');
  const syncEl = document.getElementById('newUserSync');
  const syncWanted = syncEl ? syncEl.checked : false;
  // Si sync activo, nombre y nota se ocultan y NO son requeridos: usamos nombre de Google
  let name = nameEl ? nameEl.value.trim() : '';
  let note = noteEl ? noteEl.value.trim() : '';
  if(!syncWanted){
    if(!name){
      if(errorEl){ errorEl.textContent='⚠️ Poné un nombre'; errorEl.classList.remove('hidden'); }
      else alert('Poné un nombre');
      if(nameEl) nameEl.focus();
      return;
    }
  } else {
    // sync activo: si no hay nombre, lo dejamos vacío para que lo reemplace Google
    // note también opcional y se ignora si sync activo (se usa nota por defecto)
    if(!name){
      try{
        const gName = window.firebaseAuth?.currentUser?.displayName || window.firebaseAuth?.currentUser?.email?.split('@')[0] || '';
        if(gName) name = gName;
      }catch(e){}
    }
    // si aun vacío, usar placeholder temporal, luego se reemplaza con nombre de Google
    if(!name) name = 'Usuario';
  }

  if(errorEl){ errorEl.classList.add('hidden'); errorEl.textContent=''; }

  // Verificar si hay sesión de Google
  let currentEmail = '';
  let currentUid = null;
  try{
    const authObj = window.firebaseAuth;
    if(authObj && authObj.currentUser){
      currentEmail = authObj.currentUser.email || '';
      currentUid = authObj.currentUser.uid || null;
    }
  }catch(e){ console.warn(e); }

  if(syncWanted){
    if(currentEmail){
      // LOGICA NUEVA: si sync activo, ocultamos nombre/nota, usamos datos de Google
      const googleDisplay = window.firebaseAuth?.currentUser?.displayName || currentEmail.split('@')[0] || name;
      const finalName = googleDisplay.trim() || name;
      window._pendingNewUser = { name: finalName, note: '' };
      const modal = document.getElementById('modalElegirMailSync');
      const nameSpan = document.getElementById('elegirMailUserName');
      const mailSpan = document.getElementById('elegirMailActual');
      const initialSpan = document.getElementById('elegirMailInitial');
      if(nameSpan) nameSpan.textContent = finalName;
      if(mailSpan) mailSpan.textContent = currentEmail;
      if(initialSpan) initialSpan.textContent = (currentEmail[0]||'U').toUpperCase();
      const cm1 = document.getElementById('cambiarMailActual');
      const cm2 = document.getElementById('cambiarMailActual2');
      const cmUser = document.getElementById('cambiarMailNuevoUser');
      if(cm1) cm1.textContent = currentEmail;
      if(cm2) cm2.textContent = currentEmail;
      if(cmUser) cmUser.textContent = finalName;
      if(modal){ modal.classList.remove('hidden'); modal.classList.add('flex'); return; }
      finalizarCreacionUsuario(finalName, '', currentEmail, 'cloud');
      return;
    } else {
      // No logueado: crear pendiente y pedir login directo
      try{ localStorage.setItem('ledger_pending_profile', name || 'Usuario'); localStorage.setItem('ledger_pending_note', ''); }catch(e){}
      finalizarCreacionUsuario(name || 'Usuario', '', '', 'pending-cloud');
      if(typeof mostrarModalLoginSync==='function') setTimeout(()=> mostrarModalLoginSync(name || 'Usuario', ''), 300);
      else {
        (async ()=>{
          try{
            const { GoogleAuthProvider, signInWithPopup } = await import("https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js");
            const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
            await signInWithPopup(window.firebaseAuth, p);
          }catch(e){ console.error(e); }
        })();
      }
      return;
    }
  }
  // Solo local: respetar nombre y nota
  finalizarCreacionUsuario(name, note, '', 'local');
}

function finalizarCreacionUsuario(name, note, email, syncMode){
  try{
    const users = typeof getUsuarios==='function' ? getUsuarios() : JSON.parse(localStorage.getItem('ledger_users_v2')||'[]');
    let ownerUid = null;
    let ownerEmail = email ? email.toLowerCase() : null;
    try{
      if(window.firebaseAuth && window.firebaseAuth.currentUser){
        ownerUid = window.firebaseAuth.currentUser.uid;
        if(!ownerEmail) ownerEmail = window.firebaseAuth.currentUser.email ? window.firebaseAuth.currentUser.email.toLowerCase() : null;
      }
    }catch(e){}
    // Si es sync cloud, ignorar nota personal (segun requerimiento ocultar nombre/nota)
    const notaFinal = (syncMode==='cloud' || syncMode==='pending-cloud') ? '' : (note||'');
    const nombreFinal = (syncMode==='cloud' || syncMode==='pending-cloud') ? (name || (email? email.split('@')[0] : 'Usuario')) : name;
    const nuevo = {
      id: Date.now(),
      name: nombreFinal,
      email: email ? email.toLowerCase() : (ownerEmail||''),
      note: notaFinal,
      gastos:[], sueldo:0, deudas:[], ahorro:null,
      createdAt: new Date().toISOString(),
      syncMode,
      ownerUid,
      ownerEmail,
      dataVersion: 2
    };
    users.push(nuevo);
    if(typeof saveUsuarios==='function') saveUsuarios(users);
    else localStorage.setItem('ledger_users_v2', JSON.stringify(users));
    if(typeof setCurrentId==='function') setCurrentId(nuevo.id);
    else localStorage.setItem('ledger_current_v2', String(nuevo.id));
    try{ localStorage.removeItem((typeof getTourKeyPorUsuario==='function'? getTourKeyPorUsuario(nuevo.id) : 'ledger_tour_icons_v1_'+nuevo.id)); }catch(e){}
    if(typeof cerrarModalAgregarUsuario==='function') cerrarModalAgregarUsuario();
    if(typeof cerrarModalElegirMail==='function') cerrarModalElegirMail();
    if(typeof cerrarModalCambiarMail==='function') cerrarModalCambiarMail();
    const bienv = document.getElementById('modalBienvenida'); if(bienv) bienv.classList.add('hidden');
    if(typeof refrescarTodo==='function') refrescarTodo();
    else if(typeof cargarDatos==='function') cargarDatos();
    // limpiar pending
    try{ localStorage.removeItem('ledger_pending_profile'); localStorage.removeItem('ledger_pending_note'); }catch(e){}
  }catch(e){
    console.error("Error finalizarCreacion", e);
    alert("Error al crear usuario: "+e.message);
  }
}

function cerrarModalElegirMail(){
  const m=document.getElementById('modalElegirMailSync');
  if(m){ m.classList.add('hidden'); m.classList.remove('flex'); }
  window._pendingNewUser=null;
}
function elegirMailSync(opcion){
  const pending = window._pendingNewUser;
  if(!pending) return;
  const { name, note } = pending;
  if(opcion==='mismo'){
    // USUARIO ACTUAL: si está sincronizado, solo sincroniza con mail actual
    let mail = '';
    try{ mail = window.firebaseAuth?.currentUser?.email || ''; }catch(e){}
    console.log("➡️ Sincronizando con usuario actual:", mail);
    cerrarModalElegirMail();
    finalizarCreacionUsuario(name, note, mail, 'cloud');
  } else {
    // USUARIO NUEVO: mostrar modal aviso debes cerrar sesion
    console.log("➡️ Usuario nuevo - mostrar aviso cierre sesion");
    const modal1 = document.getElementById('modalElegirMailSync');
    const modal2 = document.getElementById('modalCambiarMail');
    const actual = window.firebaseAuth?.currentUser?.email || '';
    const cm1 = document.getElementById('cambiarMailActual');
    const cm2 = document.getElementById('cambiarMailActual2');
    const cmUser = document.getElementById('cambiarMailNuevoUser');
    if(cm1) cm1.textContent = actual || 'cuenta actual';
    if(cm2) cm2.textContent = actual || 'cuenta actual';
    if(cmUser) cmUser.textContent = name;
    if(modal1){ modal1.classList.add('hidden'); modal1.classList.remove('flex'); }
    if(modal2){ modal2.classList.remove('hidden'); modal2.classList.add('flex'); }
  }
}
function volverAUsuarioActual(){
  // volver al modal 1 o directo a crear con usuario actual
  const m2=document.getElementById('modalCambiarMail');
  if(m2){ m2.classList.add('hidden'); m2.classList.remove('flex'); }
  // volver a lógica de mismo usuario
  elegirMailSync('mismo');
}
function agregarCuentaConNuevoMail(){ 
  // FIX: crear cuenta con nuevo mail sin pedir nombre
  const pending = window._pendingNewUser || {};
  const note = pending.note || document.getElementById('newUserNote')?.value || '';
  window._pendingNewUser = { name: '', note: note }; // nombre vacío, se tomará de Google
  cerrarModalAgregarUsuario(); 
  const actual = window.firebaseAuth?.currentUser?.email||null; 
  if(actual){ 
    if(typeof abrirModalCambiarMail==='function') abrirModalCambiarMail(); 
  } else { 
    // si no hay sesión, login directo con Google sin pedir nombre
    (async ()=>{
      try{
        const { GoogleAuthProvider, signInWithPopup } = await import("https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js");
        const freshProvider = new GoogleAuthProvider();
        freshProvider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(window.firebaseAuth, freshProvider);
        const newMail = result?.user?.email || '';
        const googleName = result?.user?.displayName || newMail.split('@')[0] || 'Mi perfil';
        finalizarCreacionUsuario(googleName, note, newMail, 'cloud');
      }catch(e){ console.error(e); abrirModalAgregarUsuario(); }
    })();
  } 
}
function abrirModalCambiarMail(){
  const pending = window._pendingNewUser;
  const name = pending?.name || document.getElementById('newUserName')?.value || 'nuevo usuario';
  const actual = window.firebaseAuth?.currentUser?.email||'';
  const el=document.getElementById('cambiarMailActual'); if(el) el.textContent=actual||'cuenta actual';
  const el2=document.getElementById('cambiarMailActual2'); if(el2) el2.textContent=actual||'cuenta actual';
  const elUser=document.getElementById('cambiarMailNuevoUser'); if(elUser) elUser.textContent=name;
  const m=document.getElementById('modalCambiarMail'); if(m){ m.classList.remove('hidden'); m.classList.add('flex'); }
}
function cerrarModalCambiarMail(){ const m=document.getElementById('modalCambiarMail'); if(m){ m.classList.add('hidden'); m.classList.remove('flex'); } }
function confirmarCambiarMail(){
  const pending = window._pendingNewUser;
  // FIX: si es con nuevo mail, NO usamos el nombre escrito, usamos el de Google
  const note = pending?.note || '';
  console.log("🔄 Cerrando sesión actual para sincronización con mail nuevo - sin pedir nombre...");
  cerrarModalCambiarMail();
  cerrarModalAgregarUsuario();
  (async ()=>{
    try{
      const authInst = window.firebaseAuth;
      if(authInst){
        try{ const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js"); await signOut(authInst); }catch(e){ console.warn(e); }
      }
      try{
        // Guardamos solo nota, no nombre, porque nombre vendrá de Google
        localStorage.setItem('ledger_pending_note', note);
        localStorage.setItem('ledger_switch_account','1');
      }catch(e){}
      await new Promise(r=>setTimeout(r,500));
      const { GoogleAuthProvider, signInWithPopup } = await import("https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js");
      const freshProvider = new GoogleAuthProvider();
      freshProvider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(window.firebaseAuth, freshProvider);
      const newMail = result?.user?.email || window.firebaseAuth?.currentUser?.email || '';
      const googleName = result?.user?.displayName || window.firebaseAuth?.currentUser?.displayName || '';
      // Nombre = nombre de Google o primera parte del mail, NO lo que escribió antes
      const finalName = (googleName || newMail.split('@')[0] || 'Mi perfil').trim();
      console.log("✅ Nuevo login con:", newMail, " nombre:", finalName);
      localStorage.removeItem('ledger_switch_account');
      localStorage.removeItem('ledger_pending_profile');
      // Crear usuario directamente con mail, sin pedir nombre
      finalizarCreacionUsuario(finalName, note, newMail, 'cloud');
    }catch(e){
      console.error("Error cambio mail", e);
      if(e.code!=='auth/popup-closed-by-user'){
        // si falla, no crear usuario con nombre viejo, volver a modal
        setTimeout(()=>abrirModalAgregarUsuario(),600);
      } else {
        setTimeout(()=>abrirModalAgregarUsuario(),600);
      }
      try{ localStorage.removeItem('ledger_switch_account'); }catch(_e){}
    }
  })();
}



window.crearUsuario = crearUsuario;
window.finalizarCreacionUsuario = finalizarCreacionUsuario;
window.cerrarModalElegirMail = cerrarModalElegirMail;
window.elegirMailSync = elegirMailSync;
window.volverAUsuarioActual = volverAUsuarioActual;
window.agregarCuentaConNuevoMail = agregarCuentaConNuevoMail;
window.abrirModalCambiarMail = abrirModalCambiarMail;
window.cerrarModalCambiarMail = cerrarModalCambiarMail;
window.confirmarCambiarMail = confirmarCambiarMail;



// Asegurar exposición global de funciones críticas para onclick
try{
  if(typeof abrirModalAgregarUsuario!=='undefined') window.abrirModalAgregarUsuario = abrirModalAgregarUsuario;
  if(typeof cerrarModalAgregarUsuario!=='undefined') window.cerrarModalAgregarUsuario = cerrarModalAgregarUsuario;
  if(typeof cerrarModalUsuarios!=='undefined') window.cerrarModalUsuarios = cerrarModalUsuarios;
  if(typeof abrirModalUsuarios!=='undefined') window.abrirModalUsuarios = abrirModalUsuarios;
  if(typeof mostrarModalLoginSync!=='undefined') window.mostrarModalLoginSync = mostrarModalLoginSync;
  if(typeof cerrarModalLoginSync!=='undefined') window.cerrarModalLoginSync = cerrarModalLoginSync;
  if(typeof confirmarLoginSync!=='undefined') window.confirmarLoginSync = confirmarLoginSync;
}catch(e){ console.warn(e); }

function updateSyncCards(){
  const googleSvg = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';
  const val = document.querySelector('input[name="syncPref"]:checked')?.value || 'cloud';
  const cardCloud = document.getElementById('cardSyncCloud');
  const cardLocal = document.getElementById('cardSyncLocal');
  const btn = document.getElementById('btnBienvenida');
  if(val==='cloud'){
    cardCloud.className = "relative flex flex-col gap-2 p-3 rounded-[12px] border-2 border-[#0A0A0A] bg-white cursor-pointer transition-all";
    cardLocal.className = "relative flex flex-col gap-2 p-3 rounded-[12px] border border-[#E5E5E3] bg-[#FAFAF8] cursor-pointer transition-all";
    if(btn) btn.innerHTML = googleSvg + "<span>Continuar con Google</span>";
  } else {
    cardLocal.className = "relative flex flex-col gap-2 p-3 rounded-[12px] border-2 border-[#0A0A0A] bg-white cursor-pointer transition-all";
    cardCloud.className = "relative flex flex-col gap-2 p-3 rounded-[12px] border border-[#E5E5E3] bg-[#FAFAF8] cursor-pointer transition-all";
    if(btn) btn.innerHTML = "<span>Continuar</span><span>→</span>";
  }
}
function handleBienvenidaSubmit(e){
  e.preventDefault();
  const syncPref = document.querySelector('input[name="syncPref"]:checked')?.value || 'cloud';
  localStorage.setItem('ledger_sync_pref', syncPref);
  if(syncPref==='cloud'){
    // NUBE: login directo con Google
    const btn = document.getElementById('btnBienvenida');
    if(btn){ btn.innerHTML = '<span>Conectando...</span>'; btn.disabled = true; }
    loginGoogle().then(()=>{
      // FIX: cerrar modal bienvenida al conectar
      try{ document.getElementById('modalBienvenida')?.classList.add('hidden'); }catch(e){}
      if(btn){ btn.disabled = false; updateSyncCards(); }
    }).catch(()=>{
      try{ document.getElementById('modalBienvenida')?.classList.remove('hidden'); }catch(e){}
      if(btn){ btn.disabled = false; updateSyncCards(); }
    });
  } else {
    // LOCAL: ir al modal Agregar usuario YA EXISTENTE
    document.getElementById('modalBienvenida').classList.add('hidden');
    // Usar la función ya existente que limpia campos y abre el modal
    if(typeof abrirModalAgregarUsuario === 'function'){
      abrirModalAgregarUsuario();
    } else {
      document.getElementById('newUserName').value='';
      document.getElementById('newUserEmail').value='';
      document.getElementById('newUserNote').value='';
      document.getElementById('modalAgregarUsuario').classList.remove('hidden');
      setTimeout(()=> document.getElementById('newUserName').focus(), 100);
    }
  }
}
function crearUsuarioLocalDesdeBienvenida(name){
  const users = getUsuarios();
  const nuevo = { id: Date.now(), name, email: '', note:'Usuario local - offline', gastos:[], sueldo:0, createdAt: new Date().toISOString(), syncMode: 'local' };
  users.push(nuevo); saveUsuarios(users); setCurrentId(nuevo.id);
  try{ localStorage.removeItem(getTourKeyPorUsuario(nuevo.id)); }catch(err){}
  localStorage.removeItem('ledger_pending_profile');
  document.getElementById('modalBienvenida').classList.add('hidden');
  refrescarTodo();
}
function crearUsuarioObligatorio(e){

  e.preventDefault();
  const name = document.getElementById('welcomeUserName').value.trim();
  const email = document.getElementById('welcomeUserEmail').value.trim();
  if(!name) return;
  const users = getUsuarios();
  const nuevo = { id: Date.now(), name, email, note:'Usuario principal', gastos:[], sueldo:0, createdAt: new Date().toISOString() };
  users.push(nuevo); saveUsuarios(users); setCurrentId(nuevo.id);
  // Nuevo usuario obligatorio: resetea flag informativo para que vea el tour en su primer movimiento
  try{ localStorage.removeItem(getTourKeyPorUsuario(nuevo.id)); }catch(e){}
  document.getElementById('modalBienvenida').classList.add('hidden');
  refrescarTodo();
}

function cambiarUsuario(id){
  try{
    console.log('🔄 Cambiando usuario a', id);
    setCurrentId(String(id));
    // Cerrar modales si existen
    try{ cerrarModalCambiarUsuario(); }catch(e){}
    try{ cerrarModalUsuarios(); }catch(e){}
    // Forzar refresco
    setTimeout(()=>{ 
      try{ refrescarTodo(); }catch(e){ console.error(e); location.reload(); }
    }, 50);
  }catch(e){ console.error('Error cambiarUsuario', e); }
}

let _userToDeleteId = null;
function abrirModalEliminarUsuario(id=null){
  const u = id ? getUsuarios().find(x=>String(x.id)===String(id)) : getUsuarioActual();
  if(!u) return;
  _userToDeleteId = u.id;
  document.getElementById('eliminarUserName').textContent = u.name;
  document.getElementById('eliminarUserNameCard').textContent = u.name;
  document.getElementById('eliminarUserEmailCard').textContent = u.email || 'Sin email';
  document.getElementById('eliminarUserInitial').textContent = (u.name||'U')[0].toUpperCase();
  document.getElementById('modalEliminarUsuario').classList.remove('hidden');
}
function cerrarModalEliminarUsuario(){
  document.getElementById('modalEliminarUsuario').classList.add('hidden');
  _userToDeleteId = null;
}
function confirmarEliminarUsuario(){
  if(!_userToDeleteId) return;
  let users = getUsuarios().filter(x=>String(x.id)!==String(_userToDeleteId));
  const wasCurrent = String(getCurrentId())===String(_userToDeleteId);
  const deletedUser = getUsuarios().find(x=>String(x.id)===String(_userToDeleteId));
  saveUsuarios(users);
  // Si era sincronizado, borrar también de Firebase para que no vuelva
  try{
    if(deletedUser && deletedUser.syncMode!=='local' && window.firebaseAuth?.currentUser){
      const idBorrar = String(_userToDeleteId);
      // Marcar para que el merge no lo restaure
      try{
        const listaBorrados = JSON.parse(localStorage.getItem('ledger_deleted_ids')||'[]');
        if(!listaBorrados.includes(idBorrar)){
          listaBorrados.push(idBorrar);
          localStorage.setItem('ledger_deleted_ids', JSON.stringify(listaBorrados));
        }
      }catch(e){}
      // Forzar subida inmediata sin ese usuario
      if(typeof uploadToCloud==='function'){
        setTimeout(()=>{ uploadToCloud(); }, 300);
      }
      console.log("🗑️ Usuario sincronizado borrado y marcado para no restaurar:", idBorrar);
    }
  }catch(e){ console.warn(e); }
  cerrarModalEliminarUsuario();
  cerrarModalVerUsuario();
  if(wasCurrent){
    if(users.length>0){
      // elegir mejor de los que quedan, respetando local
      try{
        const mejorId = (typeof getMejorUsuarioId==='function') ? getMejorUsuarioId(users, null) : users[0].id;
        setCurrentId(mejorId || users[0].id);
      }catch(e){ setCurrentId(users[0].id); }
    } else {
      localStorage.removeItem(STORAGE_CURRENT);
      document.getElementById('modalBienvenida').classList.remove('hidden');
    }
  }
  try{ renderListaUsuariosModal(); }catch(e){}
  try{ renderListaCambiarUsuario(); }catch(e){}
  refrescarTodo();
}
function eliminarUsuarioActual(){
  abrirModalEliminarUsuario();
}
function eliminarUsuarioDesdeVista(){ cerrarModalVerUsuario(); setTimeout(()=>abrirModalEliminarUsuario(_userToDeleteId || getUsuarioActual()?.id),200); }
function eliminarUsuarioPorId(id){
  abrirModalEliminarUsuario(id);
}

function renderListaUsuariosModal(){
  const cont = document.getElementById('lista-usuarios-modal'); const users = getUsuarios(); const curr = getCurrentId();
  if(users.length===0){ cont.innerHTML=`<p class="text-[13px] text-[#9A9A98] text-center py-8">No hay usuarios. Creá el primero.</p>`; return; }
  cont.innerHTML = users.map(u=>`
    <div class="flex items-center justify-between p-3 rounded-xl border ${String(curr)===String(u.id)?'border-ink bg-stone':'border-line bg-white'}">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="w-9 h-9 rounded-full bg-ink text-white grid place-items-center text-[12px] shrink-0">${u.name.charAt(0).toUpperCase()}</div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <p class="text-[13px] font-medium truncate">${u.name}</p>
            ${u.ownerEmail||u.email?`<span class="text-[8px] px-1.5 py-0.5 rounded-full bg-[#E8F5E9] text-[#2E7D32] font-bold tracking-wide shrink-0">BD propia</span>`:''}
            ${u.syncMode==='cloud'?'<span class="text-[8px] px-1 py-0.5 rounded-full bg-[#E0F2FF] text-[#0A84FF] shrink-0">☁️</span>':''}
          </div>
          <p class="text-[11px] text-[#9A9A98] truncate">${u.email||'Sin email'} · ${(u.gastos||[]).length} mov. · ${(u.deudas||[]).length} deudas</p>
        </div>
      </div>
      <div class="flex gap-1 shrink-0 ml-2">
        <button onclick="cambiarUsuario(${u.id})" class="h-8 px-3 rounded-full bg-ink text-white text-[11px]">Usar</button>
        <button onclick="eliminarUsuarioPorId(${u.id})" class="w-8 h-8 rounded-full bg-white border border-line grid place-items-center text-[11px] text-[#FF3B30]">✕</button>
      </div>
    </div>`).join('');
}
function renderListaCambiarUsuario(){
  const cont = document.getElementById('lista-cambiar-usuario'); const users = getUsuarios(); const curr = getCurrentId();
  if(users.length===0){ cont.innerHTML=`<p class="text-[13px] text-[#9A9A98]">No hay usuarios</p>`; return; }
  cont.innerHTML = users.map(u=>`
    <button onclick="cambiarUsuario(${u.id})" class="w-full flex items-center justify-between p-3 rounded-xl border text-left ${String(curr)===String(u.id)?'border-ink bg-ink text-white':'border-line hover:border-ink'}">
      <span class="flex items-center gap-2"><span class="w-7 h-7 rounded-full ${String(curr)===String(u.id)?'bg-white/20':'bg-stone'} grid place-items-center text-[11px]">${u.name.charAt(0).toUpperCase()}</span><span class="text-[13px] font-medium">${u.name}</span></span>
      <span class="text-[11px] ${String(curr)===String(u.id)?'text-white/60':'text-[#9A9A98]'}">${(u.gastos||[]).length} mov.</span>
    </button>`).join('');
}

function refrescarHeaderUsuario(){
  const u = getUsuarioActual();
  const initialEl = document.getElementById('userInitial');
  const nameEl = document.getElementById('userNameDisplay');
  const emailEl = document.getElementById('userEmailDisplay');
  const initialMob = document.getElementById('userInitialMobile');
  const nameMob = document.getElementById('userNameDisplayMobile');
  const emailMob = document.getElementById('userEmailDisplayMobile');
  const histEl = document.getElementById('historial-usuario');
  const saldoDetalle = document.getElementById('saldo-detalle');

  if(!u){
    if(initialEl) initialEl.innerText='-';
    if(nameEl) nameEl.innerText='Sin usuario';
    if(emailEl) emailEl.innerText='Creá uno para empezar';
    if(initialMob) initialMob.innerText='-';
    if(nameMob) nameMob.innerText='Sin usuario';
    if(emailMob) emailMob.innerText='Creá uno para empezar';
    if(histEl) histEl.innerText='—';
    if(saldoDetalle) saldoDetalle.innerText='Sin usuario seleccionado';
    document.getElementById('empty-state').classList.remove('hidden');
  } else {
    if(initialEl) initialEl.innerText = u.name.charAt(0).toUpperCase();
    if(nameEl) nameEl.innerText = u.name;
    if(emailEl) emailEl.innerText = u.email||u.note||'Activo';
    if(initialMob) initialMob.innerText = u.name.charAt(0).toUpperCase();
    if(nameMob) nameMob.innerText = u.name;
    if(emailMob) emailMob.innerText = u.email||u.note||'Activo';
    if(histEl) histEl.innerText = u.name;
    if(saldoDetalle) saldoDetalle.innerText = `${(u.gastos||[]).length} movimientos · ${u.email||'Cuenta personal'}`;
  }
}

// VALIDACIÓN EN TIEMPO REAL DEL MONTO Y SALDO DISPONIBLE
function validarMontoDisponible(inputEl) {
  const u = getUsuarioActual();
  if(!u) return;
  const montoIngresado = parsearMonto(inputEl.value) || 0;
  const gastosActuales = (u.gastos || []).reduce((acc, g) => acc + g.monto, 0);
  const sueldo = u.sueldo || 0;
  const saldoActual = sueldo - gastosActuales;
  const alertaEl = document.getElementById('alerta-saldo-negativo');

  // Si el usuario edita y ya hay un ID cargado, contemplamos sumarlo/reemplazarlo
  const idEdit = document.getElementById('gasto-id-editando').value;
  let saldoFuturo = saldoActual - montoIngresado;
  if(idEdit) {
    const gastoViejo = (u.gastos || []).find(g => String(g.id) === String(idEdit));
    if(gastoViejo) {
      saldoFuturo = saldoActual + gastoViejo.monto - montoIngresado;
    }
  }

  if (saldoFuturo < 0 && sueldo > 0) {
    alertaEl.classList.remove('hidden');
    document.getElementById('texto-alerta-negativa').innerText = `Atención: este movimiento dejará tu saldo en ${fmt(saldoFuturo)}.`;
  } else {
    alertaEl.classList.add('hidden');
  }
}



// Auto-cerrar menu al hacer click en una opcion interna
document.addEventListener('DOMContentLoaded', ()=>{
  const menu = document.getElementById('mobileMenu');
  if(!menu) return;
  menu.addEventListener('click', (e)=>{
    const isAction = e.target.closest('button, a');
    // No cerrar si es el propio boton de cerrar (ya lo maneja)
    if(isAction && !isAction.closest('#mobileMenu')) return;
    // Si es un boton de accion dentro del menu, cerrar despues de ejecutar
    if(isAction){
      setTimeout(()=>{ 
        // Solo cerrar si no abre un modal (dejar que el modal se vea)
        if(!document.getElementById('modalUsuarios') || document.getElementById('modalUsuarios').classList.contains('hidden')){
          // delay leve para que se vea la accion
        }
        cerrarMobileMenu(); 
      }, 150);
    }
  });
});
