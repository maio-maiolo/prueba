// finanzas.js - Gastos, deudas, ahorro, graficos, resumen
function guardarSueldo(){
  const u = getUsuarioActual(); if(!u){ alert('Creá un usuario primero'); document.getElementById('modalBienvenida').classList.remove('hidden'); return; }
  const val = parsearMonto(document.getElementById('input-sueldo').value);
  if(!isNaN(val)){ updateUsuarioData(u.id, (old)=>({...old, sueldo: val})); document.getElementById('input-sueldo').value=''; cargarDatos(); }
}

function crearDeudaAutomaticaDesdeGasto(gasto){
  try{
    if(!gasto) return;
    if(gasto.tipo!=='cuotas') return;
    const cuotas = parseInt(gasto.cuotasTotales)||0;
    if(cuotas<=1) return;
    const u = getUsuarioActual(); if(!u) return;
    const montoCuota = parseFloat(gasto.monto)||0;
    if(montoCuota<=0) return;
    // evitar duplicado por gastoId
    const deudasActuales = (getUsuarioActual()?.deudas||[]);
    if(deudasActuales.some(d=>String(d.gastoId)===String(gasto.id))) return;

    const montoTotal = montoCuota * cuotas;
    const saldoRestante = montoCuota * (cuotas - 1); // primera cuota ya contabilizada como gasto del mes
    const dia = (()=>{ try{ return new Date(gasto.fecha).getDate()||10 }catch{ return 10 } })();

    const nuevaDeuda = {
      id: Date.now()+Math.floor(Math.random()*1000),
      gastoId: gasto.id,
      acreedorTipo: 'tarjeta',
      acreedorNombre: gasto.descripcion || 'Compra en cuotas',
      montoOriginal: montoTotal,
      saldo: saldoRestante,
      cuotaMensual: montoCuota,
      vencimientoDia: dia,
      cuotasTotal: cuotas,
      cuotasPagadas: 1,
      notas: `Auto-generada desde movimiento "${gasto.descripcion}" - ${cuotas} x ${fmt?fmt(montoCuota):montoCuota}`,
      fechaAlta: new Date().toISOString(),
      pagos: [],
      origen: 'auto-cuotas'
    };

    updateUsuarioData(u.id, old=>{
      const deudas=[...(old.deudas||[])];
      deudas.push(nuevaDeuda);
      return {...old, deudas};
    });
  }catch(e){ console.warn('No se pudo crear deuda automática', e); }
}

function actualizarDeudaAutomaticaDesdeGasto(gasto){
  try{
    if(!gasto) return;
    const u = getUsuarioActual(); if(!u) return;
    updateUsuarioData(u.id, old=>{
      let deudas=[...(old.deudas||[])];
      const idx=deudas.findIndex(d=>String(d.gastoId)===String(gasto.id));
      if(idx<0){
        // si cambió a cuotas y no existía, la creamos fuera del map para no anidar updates
        return old;
      }
      if(gasto.tipo!=='cuotas'){
        // si ya no es en cuotas, eliminamos la deuda vinculada
        deudas = deudas.filter(d=>String(d.gastoId)!==String(gasto.id));
      } else {
        const cuotas = parseInt(gasto.cuotasTotales)||0;
        const montoCuota = parseFloat(gasto.monto)||0;
        const montoTotal = montoCuota * cuotas;
        const pagadas = deudas[idx].cuotasPagadas||1;
        const saldo = Math.max(0, montoTotal - (montoCuota * pagadas));
        deudas[idx] = {
          ...deudas[idx],
          acreedorNombre: gasto.descripcion || deudas[idx].acreedorNombre,
          montoOriginal: montoTotal,
          saldo: saldo,
          cuotaMensual: montoCuota,
          cuotasTotal: cuotas,
          notas: `Actualizada desde movimiento "${gasto.descripcion}" - ${cuotas} x ${fmt?fmt(montoCuota):montoCuota}`
        };
      }
      return {...old, deudas};
    });
    // si cambió a cuotas y no existía, crear
    const fresh = getUsuarioActual();
    if(fresh && gasto.tipo==='cuotas' && !(fresh.deudas||[]).some(d=>String(d.gastoId)===String(gasto.id))){
      crearDeudaAutomaticaDesdeGasto(gasto);
    }
  }catch(e){ console.warn('Error actualizando deuda automática', e); }
}


function mostrarConfirmDescuento(monto, contexto){
  const esPagoCuota = (contexto||'').toLowerCase().includes('pago cuota') || (contexto||'').toLowerCase().includes('cuota') || (contexto||'').toLowerCase().includes('amortiz');
  const prefKey = 'ledger_noMostrarConfirmDescuento_cuota';
  if(esPagoCuota && localStorage.getItem(prefKey)==='1'){
    return Promise.resolve(true);
  }
  const existente = document.getElementById('modalConfirmDescuento');
  if(existente) existente.remove();
  const montoFmt = fmt(monto||0);
  const htmlModal = `
  <div id="modalConfirmDescuento" class="fixed inset-0 z-[95] flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-[6px]" onclick="cerrarConfirmDescuento(false)"></div>
    <div class="relative w-full max-w-[420px] bg-white rounded-[20px] border border-line shadow-[0_24px_64px_-12px_rgba(0,0,0,.35)] overflow-hidden animate-[in_.22s_ease]">
      <div class="bg-ink px-5 py-4 flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-white grid place-items-center shrink-0 text-[16px]">⚠️</div>
          <div class="leading-tight">
            <h3 class="text-[16px] font-semibold text-white tracking-tight">Confirmar descuento</h3>
            <p class="text-[12px] text-white/70 mt-0.5 max-w-[240px] truncate">${contexto}</p>
          </div>
        </div>
        <button onclick="cerrarConfirmDescuento(false)" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 text-white grid place-items-center">✕</button>
      </div>
      <div class="p-5">
        <p class="text-[14px] leading-[1.5] text-[#3A3A39]">Se descontarán <b class="text-ink">${montoFmt}</b> de tu <b>saldo total disponible</b>.</p>
        <p class="text-[12px] text-[#9A9A98] mt-2">Esto ocurre al presionar <b class="text-ink">Guardar</b> y cada vez que presiones <b class="text-ink">Pagar cuota</b>. Este movimiento impactará en tu saldo principal.</p>
        ${esPagoCuota ? `
        <label class="mt-4 flex items-center gap-2.5 cursor-pointer group select-none">
          <input type="checkbox" id="chkNoMostrarDescuento" class="w-[18px] h-[18px] rounded-[4px] border border-line accent-ink">
          <span class="text-[12px] text-[#6B6B69] group-hover:text-ink">No volver a mostrar para pagos en cuotas</span>
        </label>` : ''}
        <div class="mt-5 flex gap-2">
          <button onclick="cerrarConfirmDescuento(false)" class="flex-1 h-11 rounded-full bg-stone border border-line text-[13px] font-medium hover:bg-line">Cancelar</button>
          <button onclick="cerrarConfirmDescuento(true)" class="flex-1 h-11 rounded-full bg-ink text-white text-[13px] font-medium hover:bg-[#1A1A1A]">Sí, continuar</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', htmlModal);
  return new Promise(resolve=>{
    window._resolveConfirmDescuento = resolve;
  });
}

function cerrarConfirmDescuento(confirmado){
  const el=document.getElementById('modalConfirmDescuento');
  const chk = document.getElementById('chkNoMostrarDescuento');
  if(confirmado && chk && chk.checked){
    localStorage.setItem('ledger_noMostrarConfirmDescuento_cuota','1');
  }
  if(el) el.remove();
  if(window._resolveConfirmDescuento){
    window._resolveConfirmDescuento(!!confirmado);
    window._resolveConfirmDescuento=null;
  }
}

// === MODAL PREMIUM CALENDAR CON CHECK NO VOLVER A MOSTRAR ===
function mostrarConfirmCalendarPremium(datos){
  const prefKey = 'ledger_noMostrarConfirmCalendar';
  if(localStorage.getItem(prefKey)==='1'){
    return Promise.resolve(false); // si tildó no volver a mostrar, no pregunta más (no agenda)
  }
  const existente = document.getElementById('modalConfirmCalendar');
  if(existente) existente.remove();
  const nombre = (datos.acreedorNombre || 'esta deuda').slice(0,40);
  const tipo = datos.acreedorTipo || 'cuotas';
  const dia = datos.vencimientoDia || 10;
  const htmlModal = `
  <div id="modalConfirmCalendar" class="fixed inset-0 z-[95] flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-[6px]" onclick="cerrarConfirmCalendar(false)"></div>
    <div class="relative w-full max-w-[420px] bg-white rounded-[20px] border border-line shadow-[0_24px_64px_-12px_rgba(0,0,0,.35)] overflow-hidden">
      <div class="bg-ink px-5 py-4 flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-white grid place-items-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </div>
          <div class="leading-tight">
            <h3 class="text-[16px] font-semibold text-white tracking-tight">Agendar vencimiento</h3>
            <p class="text-[12px] text-white/70 mt-0.5 max-w-[230px] truncate">Deuda con ${nombre} (${tipo})</p>
          </div>
        </div>
        <button onclick="cerrarConfirmCalendar(false)" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 text-white grid place-items-center">✕</button>
      </div>
      <div class="p-5">
        <p class="text-[14px] leading-[1.5] text-[#3A3A39]">¿Querés agendar el vencimiento <b class="text-ink">día ${dia}</b> de <b class="text-ink">${nombre}</b> en Google Calendar?</p>
        <div class="mt-3 rounded-[12px] bg-[#FFF8E1] border border-[#FFE082] px-3 py-2.5">
          <p class="text-[11px] leading-[1.4] text-[#7A5C1F] flex gap-1.5">
            <span>💸</span>
            <span><b class="text-ink">Aviso:</b> al <b class="text-ink">Guardar</b> se descuenta la cuota y se registra el gasto. Cada vez que toques <b class="text-ink">Pagar cuota</b> también se descuenta automáticamente.</span>
          </p>
        </div>
        <label class="mt-4 flex items-center gap-2.5 cursor-pointer group select-none">
          <input type="checkbox" id="chkNoMostrarCalendar" class="w-[18px] h-[18px] rounded-[4px] border border-line accent-ink">
          <span class="text-[12px] text-[#6B6B69] group-hover:text-ink">No volver a mostrar</span>
        </label>
        <div class="mt-5 flex gap-2">
          <button onclick="cerrarConfirmCalendar(false)" class="flex-1 h-11 rounded-full bg-stone border border-line text-[13px] font-medium hover:bg-line">No, por ahora</button>
          <button onclick="cerrarConfirmCalendar(true)" class="flex-1 h-11 rounded-full bg-ink text-white text-[13px] font-medium hover:bg-[#1A1A1A] flex items-center justify-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Sí, agendar
          </button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', htmlModal);
  return new Promise(resolve=>{
    window._resolveConfirmCalendar = resolve;
  });
}

function cerrarConfirmCalendar(confirmado){
  const el=document.getElementById('modalConfirmCalendar');
  const chk = document.getElementById('chkNoMostrarCalendar');
  if(chk && chk.checked){
    localStorage.setItem('ledger_noMostrarConfirmCalendar','1');
  }
  if(el) el.remove();
  if(window._resolveConfirmCalendar){
    window._resolveConfirmCalendar(!!confirmado);
    window._resolveConfirmCalendar=null;
  }
}


function guardarGasto(e){
  e.preventDefault();
  const u = getUsuarioActual(); if(!u){ alert('Creá un usuario primero'); document.getElementById('modalBienvenida').classList.remove('hidden'); return; }
  const idEdit = document.getElementById('gasto-id-editando').value;
  const descripcion = document.getElementById('descripcion').value.trim();
  const monto = parsearMonto(document.getElementById('monto').value);
  const fecha = document.getElementById('fecha').value;
  const tipo = document.getElementById('tipo').value;
  const cuotasInput = parseInt(document.getElementById('cuotas').value) || 1;
  let etiquetaTipo = tipo==='fijo'?'Fijo': tipo==='cuotas'?`${cuotasInput} cuotas`:'Único';
  const currentData = getUsuarioActual();
  let gastoResult = null;
  if(idEdit){
    const nuevosGastos = (currentData.gastos||[]).map(g=> {
      if(String(g.id)===String(idEdit)){
        const actualizado = {...g, descripcion, monto, fecha, tipo, etiquetaTipo, cuotasTotales: tipo==='cuotas'?cuotasInput:g.cuotasTotales, cuotasRestantes: tipo==='cuotas'?cuotasInput:g.cuotasRestantes};
        gastoResult = actualizado;
        return actualizado;
      }
      return g;
    });
    updateUsuarioData(u.id, (old)=>({...old, gastos: nuevosGastos}));
    if(gastoResult) actualizarDeudaAutomaticaDesdeGasto(gastoResult);
  } else {
    const nuevo = { id: Date.now(), descripcion, monto, fecha, tipo, etiquetaTipo, cuotasTotales: tipo==='cuotas'?cuotasInput:null, cuotasRestantes: tipo==='cuotas'?cuotasInput:null };
    gastoResult = nuevo;
    updateUsuarioData(u.id, (old)=>({...old, gastos: [...(old.gastos||[]), nuevo]}));
    if(tipo==='cuotas' && cuotasInput>1){
      crearDeudaAutomaticaDesdeGasto(nuevo);
    }
  }
  // Si es cuotas o fijo, ofrecer agendar justo después de guardar
  if(esMovimientoConVencimiento(tipo) && gastoResult){
    // Guarda temporal y muestra confirm
    const fecha = gastoResult.fecha ? new Date(gastoResult.fecha + 'T00:00:00') : new Date();
    const titulo = `Vencimiento: ${gastoResult.descripcion} ($${gastoResult.monto})`;
    const detalles = `Movimiento tipo: ${gastoResult.etiquetaTipo}\nDesde LEDGER - Agendado como recordatorio de vencimiento.`;
    // No abrimos automáticamente, solo dejamos el último gasto para agendar desde banner si quiere
    transaccionTemporalParaCalendar = { ...gastoResult, tipo };
    // Opcional: mostrar notificación con acción rápida
    setTimeout(async ()=>{
      const okMov = await mostrarConfirmCalendarPremium({acreedorNombre: gastoResult.descripcion, acreedorTipo: tipo, vencimientoDia: 10});
      if(okMov){
        const url = construirUrlGoogleCalendar({ titulo, descripcion: detalles, fechaVencimiento: fecha });
        window.open(url, '_blank');
      }
    }, 300);
  }

  cancelarEdicion(); cargarDatos();
  if(typeof renderDeudas==='function') renderDeudas();
}


function cerrarTourProductos(){
  // Solo este marca como visto (boton Entendido)
  const el = document.getElementById('tour-productos');
  if(el) el.classList.add('hidden');
  const firstRow = document.querySelector('#tabla-gastos tr');
  if(firstRow) firstRow.classList.remove('tour-row-highlight');
  marcarTourIconosVisto();
}
function cerrarTourProductosManual(){
  // Cierre con X o desde boton i - NO marca como visto
  const el = document.getElementById('tour-productos');
  if(el) el.classList.add('hidden');
  const firstRow = document.querySelector('#tabla-gastos tr');
  if(firstRow) firstRow.classList.remove('tour-row-highlight');
}
function abrirTourInfoManual(){
  // Apertura manual con el boton i - nunca marca como visto
  const tourEl = document.getElementById('tour-productos');
  if(!tourEl) return;
  tourEl.classList.remove('hidden');
  const firstRow = document.querySelector('#tabla-gastos tr');
  if(firstRow) firstRow.classList.add('tour-row-highlight');
  setTimeout(()=>{ tourEl.scrollIntoView({behavior:'smooth', block:'center'}); }, 200);
}
function mostrarTourPrimerProducto(filtradosCount){
  try{
    // LOGICA NUEVA: solo automatico para usuarios nuevos, una sola vez hasta Entendido
    // Si ya vio tour, no mostrar auto
    if(yaVioTourIconos()) return;
    const u = getUsuarioActual();
    if(!u || (u.gastos||[]).length === 0) return;
    if(filtradosCount === 0) return;
    const tourEl = document.getElementById('tour-productos');
    const firstRow = document.querySelector('#tabla-gastos tr');
    if(!tourEl || !firstRow) return;
    tourEl.classList.remove('hidden');
    firstRow.classList.add('tour-row-highlight');
    setTimeout(()=>{ tourEl.scrollIntoView({behavior:'smooth', block:'center'}); }, 300);
  }catch(e){ console.warn('tour error', e); }
}
// DEBUG: forzar tour desde consola con forzarTour()
function forzarTour(){
  // Borra tanto el flag global como el del usuario actual (útil para testear)
  localStorage.removeItem(STORAGE_TOUR);
  try{ localStorage.removeItem(getTourKeyPorUsuario()); }catch(e){}
  const tourEl = document.getElementById('tour-productos');
  const firstRow = document.querySelector('#tabla-gastos tr');
  if(tourEl) tourEl.classList.remove('hidden');
  if(firstRow) firstRow.classList.add('tour-row-highlight');
}


// === LIMPIEZA MENSUAL AUTOMATICA DE GASTOS UNICOS ===
// Espiritu de la app: cada mes nuevo, borrar unicos para tener cuentas ordenadas
// Solo quedan fijos y cuotas. Sincroniza con Firebase via updateUsuarioData + deletedIds
function verificarYLimpiezaMensualUnicos(){
  try{
    const u = getUsuarioActual();
    if(!u) return false;
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();
    const periodoActual = `${anioActual}-${String(mesActual+1).padStart(2,'0')}`; // ej 2026-10

    // Ultima limpieza guardada en el usuario para que funcione multi-dispositivo
    const ultima = u.ultimaLimpiezaUnicos || localStorage.getItem(`ledger_ultimo_mes_${u.id}`) || null;

    // Si nunca se limpio, guardar periodo actual y no borrar (evita borrar al primer uso)
    if(!ultima){
      updateUsuarioData(u.id, old=>({...old, ultimaLimpiezaUnicos: periodoActual}));
      try{ localStorage.setItem(`ledger_ultimo_mes_${u.id}`, periodoActual); }catch(e){}
      return false;
    }

    // Si el periodo es el mismo, no hacer nada
    if(ultima === periodoActual) return false;

    // Cambio de mes detectado -> borrar unicos
    const gastosViejos = u.gastos||[];
    // Solo borrar unicos que NO sean del mes actual (por si se ejecuta el 1ro con unicos del nuevo mes ya cargados)
    const gastosParaBorrar = gastosViejos.filter(g=>{
      if(g.tipo !== 'unico') return false;
      // Si el gasto es del mes actual, no borrarlo (es del nuevo mes)
      try{
        const fg = new Date(g.fecha+'T00:00:00');
        if(fg.getMonth()===mesActual && fg.getFullYear()===anioActual) return false;
      }catch(e){}
      return true;
    });

    if(gastosParaBorrar.length===0){
      // Aunque no haya unicos para borrar, actualizar periodo
      updateUsuarioData(u.id, old=>({...old, ultimaLimpiezaUnicos: periodoActual}));
      try{ localStorage.setItem(`ledger_ultimo_mes_${u.id}`, periodoActual); }catch(e){}
      return false;
    }

    const idsBorrar = gastosParaBorrar.map(g=>String(g.id));
    const gastosFiltrados = gastosViejos.filter(g=> !idsBorrar.includes(String(g.id)));

    // Guardar ids en lista de borrados para que Firebase no los restaure
    try{
      const key = 'ledger_deleted_gastos';
      const prev = JSON.parse(localStorage.getItem(key)||'[]');
      const combined = Array.from(new Set([...prev, ...idsBorrar]));
      localStorage.setItem(key, JSON.stringify(combined));
    }catch(e){}

    updateUsuarioData(u.id, old=>({...old, gastos: gastosFiltrados, ultimaLimpiezaUnicos: periodoActual}));
    try{ localStorage.setItem(`ledger_ultimo_mes_${u.id}`, periodoActual); }catch(e){}

    console.log(`🧹 Limpieza mensual automatica (${ultima} -> ${periodoActual}): borrados ${idsBorrar.length} gastos unicos. Quedan fijos y cuotas.`);
    
    // Forzar subida a Firebase
    try{ if(window._forceUpload) setTimeout(()=>window._forceUpload(), 500); else if(window.scheduleUpload) window.scheduleUpload(); }catch(e){}

    return true;
  }catch(e){
    console.warn('Error en limpieza mensual', e);
    return false;
  }
}


// === SISTEMA TOAST + MODAL PREMIUM LIMPIEZA ===
function mostrarToast(msg, type='info'){
  let wrap=document.getElementById('ledgerToastWrap');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='ledgerToastWrap';
    wrap.className='fixed bottom-[24px] left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none w-[92%] max-w-[420px]';
    document.body.appendChild(wrap);
  }
  const icon = type==='success'?'✅':type==='error'?'⛔':'ℹ️';
  const bg = type==='success'?'bg-ink text-white border-ink':type==='error'?'bg-[#B91C1C] text-white border-[#B91C1C]':'bg-white text-ink border-line';
  const el=document.createElement('div');
  el.className=`pointer-events-auto w-full px-4 py-3 rounded-[14px] border shadow-[0_12px_32px_-8px_rgba(0,0,0,.25)] text-[13px] leading-[1.4] flex items-center gap-3 animate-[slideUp_.25s_ease] ${bg}`;
  el.innerHTML=`<span class="text-[16px]">${icon}</span><span class="flex-1 font-medium">${msg}</span><button onclick="this.parentElement.remove()" class="w-6 h-6 grid place-items-center rounded-full bg-black/10 hover:bg-black/15 shrink-0">✕</button>`;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.transition='all .25s ease'; el.style.opacity='0'; el.style.transform='translateY(8px)'; setTimeout(()=>el.remove(),250); }, 3800);
}

function mostrarConfirmLimpiezaUnicos(count){
  const existente=document.getElementById('modalConfirmLimpieza');
  if(existente) existente.remove();
  const html=`
  <div id="modalConfirmLimpieza" class="fixed inset-0 z-[95] flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-[#0A0A0A]/55 backdrop-blur-[6px]" onclick="cerrarConfirmLimpiezaUnicos(false)"></div>
    <div class="relative w-full max-w-[420px] bg-white rounded-[20px] border border-line shadow-[0_24px_64px_-12px_rgba(0,0,0,.4)] overflow-hidden animate-[scaleIn_.22s_ease]">
      <div class="bg-ink px-5 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-[12px] bg-white/10 grid place-items-center text-[16px]">🧹</div>
          <div class="leading-tight">
            <h3 class="text-[14px] font-semibold text-white tracking-tight">Limpiar gastos del mes</h3>
            <p class="text-[11px] text-white/60 mt-0.5">Irreversible \u2022 Sincroniza con Firebase</p>
          </div>
        </div>
        <button onclick="cerrarConfirmLimpiezaUnicos(false)" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 text-white grid place-items-center">✕</button>
      </div>
      <div class="p-5">
        <div class="w-12 h-12 mx-auto rounded-full bg-[#FFF7ED] border border-[#FFD9A8] grid place-items-center text-[20px] mb-3">⚠️</div>
        <h4 class="text-center text-[15px] font-semibold text-ink leading-tight">¿Borrar ${count} gasto${count!==1?'s':''} único${count!==1?'s':''}?</h4>
        <p class="text-center text-[12.5px] leading-[1.5] text-[#6B6B6A] mt-2">Se eliminarán <b class="text-ink">${count} movimientos únicos</b> de este usuario.<br>Se conservan <span class="inline-flex px-1.5 py-0.5 rounded-full bg-[#F6F6F5] border border-line text-[10px] font-medium text-ink">fijos</span> y <span class="inline-flex px-1.5 py-0.5 rounded-full bg-[#F6F6F5] border border-line text-[10px] font-medium text-ink">en cuotas</span>.</p>
        <div class="mt-4 rounded-[12px] bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2.5 flex gap-2">
          <span class="text-[12px] shrink-0">🔒</span>
          <p class="text-[11px] leading-[1.4] text-[#92400E]">Esta acción se sincroniza y <b>no se puede deshacer</b>. Si te arrepentís, tendrás que cargarlos de nuevo.</p>
        </div>
        <div class="mt-5 flex gap-2">
          <button onclick="cerrarConfirmLimpiezaUnicos(false)" class="flex-1 h-11 rounded-full bg-white border border-line text-[13px] font-medium hover:bg-stone">Cancelar</button>
          <button onclick="cerrarConfirmLimpiezaUnicos(true)" class="flex-1 h-11 rounded-full bg-[#B91C1C] text-white text-[13px] font-medium hover:bg-[#991B1B]">Sí, borrar ${count}</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.addEventListener('keydown', function escLimp(e){ if(e.key==='Escape'){ cerrarConfirmLimpiezaUnicos(false); document.removeEventListener('keydown', escLimp); }});
  return new Promise(res=>{ window._resolveConfirmLimpieza=res; });
}
function cerrarConfirmLimpiezaUnicos(ok){
  const el=document.getElementById('modalConfirmLimpieza');
  if(el) el.remove();
  if(window._resolveConfirmLimpieza){ window._resolveConfirmLimpieza(!!ok); window._resolveConfirmLimpieza=null; }
}
function mostrarInfoLimpiezaVacia(){
  const existente=document.getElementById('modalConfirmLimpieza');
  if(existente) existente.remove();
  const html=`
  <div id="modalConfirmLimpieza" class="fixed inset-0 z-[95] flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-[#0A0A0A]/50 backdrop-blur-[6px]" onclick="cerrarConfirmLimpiezaUnicos(false)"></div>
    <div class="relative w-full max-w-[380px] bg-white rounded-[20px] border border-line shadow-[0_24px_64px_-12px_rgba(0,0,0,.3)] overflow-hidden p-6 text-center">
      <div class="w-12 h-12 mx-auto rounded-full bg-[#F0FDF4] border border-[#BBF7D0] grid place-items-center text-[20px] mb-3">✨</div>
      <h4 class="text-[15px] font-semibold text-ink">Todo limpio</h4>
      <p class="text-[12.5px] text-[#6B6B6A] mt-1.5 leading-[1.45]">No tenés gastos únicos para borrar.<br>Solo quedan fijos y cuotas, que se conservan.</p>
      <button onclick="cerrarConfirmLimpiezaUnicos(false)" class="mt-5 w-full h-11 rounded-full bg-ink text-white text-[13px] font-medium hover:bg-[#1A1A1A]">Entendido</button>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function forzarLimpiezaUnicosAhora(){
  const u=getUsuarioActual(); if(!u) return;
  const gastosViejos=u.gastos||[];
  const paraBorrar=gastosViejos.filter(g=>g.tipo==='unico');
  if(paraBorrar.length===0){ mostrarInfoLimpiezaVacia(); return; }
  const ok=await mostrarConfirmLimpiezaUnicos(paraBorrar.length);
  if(!ok) return;
  const ids=paraBorrar.map(g=>String(g.id));
  try{
    const key='ledger_deleted_gastos';
    const prev=JSON.parse(localStorage.getItem(key)||'[]');
    localStorage.setItem(key, JSON.stringify(Array.from(new Set([...prev, ...ids]))));
  }catch(e){}
  const filtrados=gastosViejos.filter(g=>g.tipo!=='unico');
  updateUsuarioData(u.id, old=>({...old, gastos: filtrados, ultimaLimpiezaUnicos: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`}));
  cargarDatos();
  if(window._forceUpload) window._forceUpload();
  mostrarToast(`Se borraron ${ids.length} gastos únicos. Quedan fijos y cuotas.`, 'success');
}



function cargarDatos(){
  refrescarHeaderUsuario();
  // Limpieza mensual automatica antes de mostrar datos
  try{
    const hizoLimpieza = verificarYLimpiezaMensualUnicos();
    if(hizoLimpieza){
      // Si hubo limpieza, recargar usuario actualizado
      setTimeout(()=>cargarDatos(), 100);
      return;
    }
  }catch(e){}
  const u = getUsuarioActual();
  let gastos = (u?.gastos||[]);
  const sueldo = u?.sueldo || 0;

  // Control aviso sutil si el sueldo está en 0
  const avisoSueldoZero = document.getElementById('aviso-sueldo-zero');
  if(sueldo === 0) {
    avisoSueldoZero.classList.remove('hidden');
  } else {
    avisoSueldoZero.classList.add('hidden');
  }

  const filtro = (document.getElementById('filtro')?.value || '').toLowerCase();
  let filtrados = filtro ? gastos.filter(g=> g.descripcion.toLowerCase().includes(filtro)) : [...gastos];
  filtrados.sort((a,b)=> new Date(b.fecha)-new Date(a.fecha));

  const tbody = document.getElementById('tabla-gastos'); tbody.innerHTML='';
  const empty = document.getElementById('empty-state');
  if(!u){ empty.innerHTML=`<p class="text-[13px] text-[#9A9A98]">Creá o seleccioná un usuario para empezar.</p>`; empty.classList.remove('hidden'); }
  else if(filtrados.length===0 && gastos.length===0){ empty.innerHTML=`<p class="text-[13px] text-[#9A9A98]">Sin movimientos para ${u.name}. Agregá el primero.</p>`; empty.classList.remove('hidden'); }
  else if(filtrados.length===0){ empty.innerHTML=`<p class="text-[13px] text-[#9A9A98]">Sin resultados para "${filtro}"</p>`; empty.classList.remove('hidden'); }
  else { empty.classList.add('hidden'); }

  filtrados.forEach(gasto=>{
    const tr = document.createElement('tr'); tr.className='group hover:bg-[#FAFAF9] transition-colors';
    const fechaFmt = new Date(gasto.fecha+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit', month:'short'});
    tr.innerHTML = `
      <td class="py-3.5 pl-5 md:pl-7 pr-3 mono text-[11px] md:text-[12px] text-[#6B6B6A]">${fechaFmt.toUpperCase()}</td>
      <td class="py-3.5 px-3"><span class="text-[13px] font-[500] tracking-[-0.01em]">${gasto.descripcion}</span></td>
      <td class="py-3.5 px-3"><div class="cell-cuotas-wrapper"><span class="chip chip-cuotas">${(() => { let et = gasto.etiquetaTipo||''; if((gasto.descripcion||'').toLowerCase().includes('pago cuota')){ const mm = (gasto.descripcion||'').match(/\((\d+)\/(\d+)\)/); if(mm){ return `Pago cuota ${mm[1]}/${mm[2]}`; } } return et; })()}</span> ${gasto.tipo==='cuotas' && gasto.cuotasTotales!==null ? `<span class="ml-1 text-[11px] ${ (gasto.cuotasRestantes||0)===0 ? 'text-[#2E7D32] font-medium' : 'text-[#9A9A98]' }">${ (gasto.cuotasRestantes||0)===0 ? gasto.cuotasTotales : Math.max(1, (gasto.cuotasTotales - (gasto.cuotasRestantes||0) + 1)) }/${gasto.cuotasTotales}</span>`:``}</div></td>
      <td class="py-3.5 px-3 text-right mono text-[13px] font-medium">${fmt(gasto.monto)}</td>
      <td class="py-3.5 pr-5 md:pr-7 pl-3 text-right">
        <div class="flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button onclick="agregarAGoogleCalendar(${gasto.id})" title="Calendar" class="w-7 h-7 rounded-full bg-stone grid place-items-center text-[11px] hover:bg-ink hover:text-white transition-colors">📅</button>
          ${gasto.tipo==='cuotas' && (gasto.cuotasRestantes||0)>0 ? `<button onclick="pagarCuota(${gasto.id})" title="Pagar cuota ${(gasto.cuotasTotales||0) - (gasto.cuotasRestantes||0) +1}/${gasto.cuotasTotales} - Descuenta ${fmt(gasto.monto)}" class="w-7 h-7 rounded-full bg-[#E8F5E9] border border-[#C8E6C9] text-[#2E7D32] grid place-items-center text-[11px] hover:bg-[#2E7D32] hover:text-white transition-colors font-bold shadow-sm">✓</button>`:''}
          <button onclick="editarGasto(${gasto.id})" title="Editar" class="w-7 h-7 rounded-full bg-stone grid place-items-center text-[11px] hover:bg-line">↗</button>
          <button onclick="eliminarGasto(${gasto.id})" title="Eliminar" class="w-7 h-7 rounded-full bg-ink text-white grid place-items-center text-[11px] hover:bg-[#333]">✕</button>
        </div>
      `;
    tbody.appendChild(tr);
  });
  actualizarResumen();
  mostrarTourPrimerProducto(filtrados.length);
}

function agregarAGoogleCalendar(id) {
  const u = getUsuarioActual();
  if(!u) return;
  const g = (u.gastos || []).find(x => String(x.id) === String(id));
  if(!g) return;
  const fecha = g.fecha ? new Date(g.fecha + 'T00:00:00') : new Date();
  const titulo = `Vencimiento: ${g.descripcion} (${fmt(g.monto)})`;
  const detalles = `Recordatorio generado desde LEDGER.\nMovimiento: ${g.descripcion}\nMonto: ${fmt(g.monto)}\nTipo: ${g.etiquetaTipo}\n\nPodés agendarlo cuando quieras desde el icono calendario.`;
  const urlCalendar = construirUrlGoogleCalendar({ titulo, descripcion: detalles, fechaVencimiento: fecha });
  window.open(urlCalendar, '_blank');
}

function editarGasto(id){
  const u = getUsuarioActual(); const g = (u?.gastos||[]).find(x=>String(x.id)===String(id)); if(!g) return;
  document.getElementById('gasto-id-editando').value = g.id;
  document.getElementById('descripcion').value = g.descripcion;
  document.getElementById('monto').value = formatearConPuntos(g.monto);
  document.getElementById('fecha').value = g.fecha;
  document.getElementById('tipo').value = g.tipo;
  if(g.tipo==='cuotas'){ document.getElementById('campo-cuotas').classList.remove('hidden'); document.getElementById('cuotas').value = g.cuotasTotales; } else { document.getElementById('campo-cuotas').classList.add('hidden'); }
  document.getElementById('form-titulo').innerText = 'Editar movimiento'; document.getElementById('btn-submit').innerText = 'Guardar cambios'; document.getElementById('btn-cancelar-edit').classList.remove('hidden'); 
  mostrarBannerCalendarSiAplica(g.tipo, { tipo: g.tipo, concepto: g.descripcion, monto: g.monto, fecha: g.fecha });
  window.scrollTo({top:0, behavior:'smooth'});
}
function cancelarEdicion(){ 
  document.getElementById('gasto-form').reset(); 
  document.getElementById('gasto-id-editando').value=''; 
  document.getElementById('fecha').valueAsDate = new Date(); 
  document.getElementById('campo-cuotas').classList.add('hidden'); 
  document.getElementById('form-titulo').innerText='Nuevo movimiento'; 
  document.getElementById('btn-submit').innerText='Agregar movimiento'; 
  document.getElementById('btn-cancelar-edit').classList.add('hidden'); 
  document.getElementById('alerta-saldo-negativo').classList.add('hidden');
  cerrarBannerCalendar();
}
async function pagarCuota(id){
  const u=getUsuarioActual(); if(!u) return;
  const gasto = (u.gastos||[]).find(g=>String(g.id)===String(id));
  if(!gasto) return;
  if(gasto.tipo!=='cuotas') return;
  if((gasto.cuotasRestantes||0)<=0) { alert('Ya pagaste todas las cuotas'); return; }
  let montoCuota = parseFloat(gasto.monto)||0;
  let deudaVinculada = null;
  if(gasto.deudaId){
    deudaVinculada = (u.deudas||[]).find(d=>String(d.id)===String(gasto.deudaId));
    if(deudaVinculada) montoCuota = deudaVinculada.cuotaMensual || montoCuota;
  }
  const cuotaActual = (gasto.cuotasTotales||0) - (gasto.cuotasRestantes||0) + 1;
  const ok = await mostrarConfirmDescuento(montoCuota, `Pagar cuota ${cuotaActual}/${gasto.cuotasTotales||'?'}: ${gasto.descripcion}`);
  if(!ok) return;
  let quedoEnCeroDeuda = false;
  let deudaIdPreg = null;
  let nombreDeudaPreg = '';
  updateUsuarioData(u.id, old=>{
    let gastos = [...(old.gastos||[])];
    let deudas = [...(old.deudas||[])];
    gastos = gastos.map(g=>{
      if(String(g.id)===String(id) && g.tipo==='cuotas'){
        return {...g, cuotasRestantes: Math.max(0,(g.cuotasRestantes||0)-1)};
      }
      return g;
    });
    if(deudaVinculada){
      deudas = deudas.map(d=>{
        if(String(d.id)===String(deudaVinculada.id)){
          const nuevoSaldo = Math.max(0,(d.saldo||0)-montoCuota);
          if(nuevoSaldo<=0) quedoEnCeroDeuda=true;
          deudaIdPreg=d.id; nombreDeudaPreg=d.acreedorNombre;
          return {...d, saldo:nuevoSaldo, cuotasPagadas:(d.cuotasPagadas||0)+1, pagos:[...(d.pagos||[]),{fecha:new Date().toISOString(),monto:montoCuota,origenGastoId:id}], ultimoPagoFecha:new Date().toISOString()};
        }
        return d;
      });
    }
    const fechaHoy = new Date().toISOString().split('T')[0];
    const descPago = deudaVinculada ? `Pago cuota: ${deudaVinculada.acreedorNombre} (${cuotaActual}/${deudaVinculada.cuotasTotal||gasto.cuotasTotales})` : `Pago cuota: ${gasto.descripcion} (${cuotaActual}/${gasto.cuotasTotales})`;
    gastos = [...gastos, { id: Date.now()+Math.floor(Math.random()*10000)+5, descripcion: descPago, monto: montoCuota, fecha: fechaHoy, tipo: 'unico', etiquetaTipo: 'Pago cuota', origenDeudaId: deudaVinculada?deudaVinculada.id:null, origenGastoId:id, origen: deudaVinculada?'pago-deuda-cuota':'pago-cuota-movimiento' }];
    return {...old, gastos, deudas};
  });
  cargarDatos(); if(typeof renderDeudas==='function') renderDeudas(); actualizarResumen?.();
  if(quedoEnCeroDeuda && deudaIdPreg){ setTimeout(()=>preguntarEliminarDeudaSaldada(deudaIdPreg,nombreDeudaPreg),250); }
}

function actualizarResumen(){
  const u = getUsuarioActual(); const gastos = u?.gastos||[]; const sueldo = u?.sueldo||0;
  let totalGastos = gastos.reduce((acc,g)=>acc+(parseFloat(g.monto)||0),0); 
  let saldoRestante = sueldo - totalGastos;
  document.getElementById('resumen-sueldo').innerText = fmt(sueldo);
  document.getElementById('resumen-gastos').innerText = fmt(totalGastos);
  document.getElementById('count-gastos').innerText = `${gastos.length} movimientos`;
  const elSaldo = document.getElementById('resumen-saldo'); 
  elSaldo.innerText = fmt(saldoRestante);
  const card = document.getElementById('card-saldo-container');
  if(saldoRestante<0){ 
    card.className='md:col-span-4 card p-5 md:p-7 bg-[#FF3B30] text-white border-[#FF3B30] relative overflow-hidden'; 
  } else { 
    card.className='md:col-span-4 card p-5 md:p-7 bg-ink text-white border-ink relative overflow-hidden'; 
  }
  const detalle = document.getElementById('saldo-detalle');
  if(detalle && u){
    const deudas = u.deudas||[];
    const totalDeudas = deudas.reduce((s,d)=>s+(d.saldo||0),0);
    const ahorro = u.ahorro;
    if(totalDeudas>0){
      detalle.innerHTML = `${(u.gastos||[]).length} movimientos · Deuda pendiente: ${fmt(totalDeudas)}`;
    } else if(ahorro && ahorro.actual>0){
      detalle.innerHTML = `${(u.gastos||[]).length} movimientos · Ahorrado: ${fmt(ahorro.actual)} / ${fmt(ahorro.objetivo||0)}`;
    } else {
      detalle.innerText = `${(u.gastos||[]).length} movimientos · ${u.email||'Cuenta personal'}`;
    }
  }
}




function eliminarGasto(id){
  if(!confirm('¿Eliminar este movimiento?')) return;
  const u=getUsuarioActual(); 
  if(!u) return;
  // FIX: guardar tombstone para que el sync no lo resucite
  try{
    const key='ledger_deleted_gastos';
    let lista = JSON.parse(localStorage.getItem(key)||'[]');
    lista = lista.map(String);
    const sId = String(id);
    if(!lista.includes(sId)){
      lista.push(sId);
      localStorage.setItem(key, JSON.stringify(lista));
    }
    console.log('🗑️ Gasto marcado como borrado:', sId, 'total borrados:', lista.length);
  }catch(e){ console.warn('Error guardando deleted gasto', e); }

  const nuevos = (u.gastos||[]).filter(g=>String(g.id)!==String(id));
  updateUsuarioData(u.id, old=>{ 
    let deudas = [...(old.deudas||[])];
    deudas = deudas.filter(d=>String(d.gastoId)!==String(id));
    return {...old, gastos:nuevos, deudas};
  });
  cargarDatos(); 
  if(typeof renderDeudas==='function') renderDeudas();
  // forzar subida para que se borre también en la nube
  if(window.scheduleUpload) window.scheduleUpload();
  else if(window._forceUpload) window._forceUpload();
}

function abrirProyeccionMes(){
  const u=getUsuarioActual(); if(!u) { alert('Seleccioná un usuario'); return; }
  let gastos = u.gastos||[];
  let deudas = u.deudas||[];
  let totalFijos = gastos.filter(g=>g.tipo==='fijo').reduce((a,g)=>a+(Number(g.monto)||0),0);
  let cuotasVigentes = gastos.filter(g=>g.tipo==='cuotas' && typeof g.cuotasRestantes==='number' && g.cuotasRestantes>0);
  let unicos = gastos.filter(g=>{
    if(g.tipo!=='unico') return false;
    const origen = String(g.origen||'');
    if(origen.startsWith('pago-')) return false; // pago-deuda-cuota, pago-cuota-movimiento
    if((g.descripcion||'').toLowerCase().includes('pago cuota')) return false;
    return true;
  });
  let fechaActual = new Date();
  let tbodyLegacy = document.getElementById('tabla-proyeccion');
  let mesesCont = document.getElementById('tabla-proyeccion-meses');
  let valoresCont = document.getElementById('tabla-proyeccion-valores');
  if(tbodyLegacy) tbodyLegacy.innerHTML='';
  if(mesesCont) mesesCont.innerHTML='';
  if(valoresCont) valoresCont.innerHTML='';

  let deudasProyectables = deudas.filter(d=>{
    const saldo = Number(d.saldo)||0;
    const cuota = Number(d.cuotaMensual)||0;
    if(saldo<=0 || cuota<=0) return false;
    if(d.origen==='auto-cuotas') return false;
    return true;
  });

  for(let i=0;i<6;i++){
    let f = new Date(fechaActual.getFullYear(), fechaActual.getMonth()+i,1);
    let nombre = f.toLocaleString('es-AR',{month:'long'});
    nombre = nombre.charAt(0).toUpperCase()+nombre.slice(1) + ' ' + f.getFullYear();
    if(i===0) nombre+=' (actual)';

    let sumaCuotasGastos=0;
    cuotasVigentes.forEach(c=>{
      if(c.cuotasRestantes>i) sumaCuotasGastos+= Number(c.monto)||0;
    });

    let sumaCuotasDeudas=0;
    deudasProyectables.forEach(d=>{
      const cuota = Number(d.cuotaMensual)||0;
      const total = Number(d.cuotasTotal)||0;
      const pagadas = Number(d.cuotasPagadas)||0;
      if(total>0){
        const restantes = total - pagadas;
        if(restantes > i) sumaCuotasDeudas += cuota;
      } else {
        const saldoRest = (Number(d.saldo)||0) - (cuota * i);
        if(saldoRest > 0) sumaCuotasDeudas += Math.min(cuota, Number(d.saldo)||0);
      }
    });

    let sumaCuotas = sumaCuotasGastos + sumaCuotasDeudas;

    let sumaUnicos=0;
    unicos.forEach(g=>{
      const fg = new Date(g.fecha+'T00:00:00');
      if(fg.getFullYear()===f.getFullYear() && fg.getMonth()===f.getMonth()){
        sumaUnicos += Number(g.monto)||0;
      }
    });

    let total = totalFijos + sumaCuotas + sumaUnicos;

    if(tbodyLegacy){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td class="py-4 px-4 font-medium">${nombre}</td><td class="py-4 px-4 mono">${fmt(totalFijos)}</td><td class="py-4 px-4 mono ${sumaUnicos?'font-semibold bg-amber-50 rounded':''}">${fmt(sumaUnicos)}</td><td class="py-4 px-4 mono">${fmt(sumaCuotas)}</td><td class="py-4 px-4 text-right mono font-semibold">${fmt(total)}</td>`;
      tbodyLegacy.appendChild(tr);
    }

    if(mesesCont){
      const isActual = i===0;
      const div = document.createElement('div');
      div.className = `h-[52px] flex items-center px-4 text-[12px] ${isActual?'font-semibold bg-[#FFFBEB]/70':'font-medium'} leading-tight`;
      div.innerHTML = `<span class="${isActual?'text-ink':'text-[#3A3A3A]'}">${nombre}</span>`;
      mesesCont.appendChild(div);
    }
    if(valoresCont){
      const isActual = i===0;
      const row = document.createElement('div');
      row.className = `flex h-[52px] items-center ${isActual?'bg-[#FFFBEB]/40':''}`;
      row.innerHTML = `
        <div class="w-[110px] shrink-0 px-3 text-center mono text-[12px] text-[#5A5A58]">${fmt(totalFijos)}</div>
        <div class="w-[110px] shrink-0 px-3 text-center mono text-[12px] ${sumaUnicos?'font-bold text-ink bg-amber-50/70 rounded-md py-1 mx-1':''}">${fmt(sumaUnicos)}</div>
        <div class="w-[110px] shrink-0 px-3 text-center mono text-[12px] text-[#5A5A58]">${fmt(sumaCuotas)}</div>
        <div class="w-[130px] shrink-0 px-3 text-center mono text-[13px] font-bold text-ink bg-[#FFF8E1]/60 h-full flex items-center justify-center border-l border-[#FFE082]/30">${fmt(total)}</div>
      `;
      valoresCont.appendChild(row);
    }
  }
  document.getElementById('modalProyeccion').classList.remove('hidden');
  setTimeout(()=>{
    const hs = document.getElementById('proyHeaderScroll');
    const bs = document.getElementById('proyBodyScroll');
    const mesesEl = document.getElementById('tabla-proyeccion-meses');
    if(hs) hs.scrollLeft=0;
    if(bs){ bs.scrollLeft=0; bs.scrollTop=0; }
    if(mesesEl && mesesEl.parentElement) mesesEl.parentElement.scrollTop=0;
  },10);
}

function cerrarModalProyeccion(){ document.getElementById('modalProyeccion').classList.add('hidden'); }

function toggleCuotas(){ 
  const tipoVal = document.getElementById('tipo').value;
  document.getElementById('campo-cuotas').classList.toggle('hidden', tipoVal!=='cuotas');
  // Mostrar banner si es cuotas o fijo
  mostrarBannerCalendarSiAplica(tipoVal, {
    tipo: tipoVal,
    concepto: document.getElementById('descripcion')?.value || '',
    monto: document.getElementById('monto')?.value || '',
    fecha: document.getElementById('fecha')?.value || ''
  });
}

let transaccionTemporalParaCalendar = null;

function esMovimientoConVencimiento(tipo){
  if(!tipo) return false;
  const t = String(tipo).toLowerCase();
  return t.includes('cuota') || t === 'fijo' || t === 'recurrente' || t === 'suscripcion';
}

function mostrarBannerCalendarSiAplica(tipoMovimiento, datosTransaccion){
  const banner = document.getElementById('calendarInfoBanner');
  const texto = document.getElementById('calendarInfoText');
  if(!banner) return;
  if(esMovimientoConVencimiento(tipoMovimiento)){
    transaccionTemporalParaCalendar = datosTransaccion || { tipo: tipoMovimiento };
    const esCuota = String(tipoMovimiento).toLowerCase().includes('cuota');
    if(texto){
      texto.textContent = esCuota
        ? 'Este movimiento es en cuotas. ¿Querés agendar la fecha de vencimiento en Google Calendar?'
        : 'Este es un gasto fijo mensual. ¿Querés agendar su vencimiento en Google Calendar?';
    }
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function cerrarBannerCalendar(){
  document.getElementById('calendarInfoBanner')?.classList.add('hidden');
}

function construirUrlGoogleCalendar({ titulo, descripcion, fechaVencimiento }){
  const fecha = fechaVencimiento ? new Date(fechaVencimiento) : new Date();
  if(isNaN(fecha.getTime())) fecha.setTime(Date.now());
  fecha.setHours(9,0,0,0);
  const start = fecha.toISOString().replace(/-|:|\.\d+/g, '').slice(0,15) + 'Z';
  const endDate = new Date(fecha.getTime() + 60*60*1000);
  const end = endDate.toISOString().replace(/-|:|\.\d+/g, '').slice(0,15) + 'Z';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo,
    details: descripcion,
    dates: `${start}/${end}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function agendarVencimientoActualEnCalendar(){
  const monto = document.getElementById('monto')?.value || '';
  const concepto = document.getElementById('descripcion')?.value || 'Vencimiento';
  const fechaInput = document.getElementById('fecha')?.value;
  const tipo = document.getElementById('tipo')?.value || '';
  const fecha = fechaInput ? new Date(fechaInput) : new Date();

  const titulo = `Vencimiento: ${concepto}${monto? ' - $'+monto : ''}`;
  const descripcion = `Movimiento tipo: ${tipo}\nConcepto: ${concepto}\nMonto: $${monto}\nAgendado desde LEDGER.\n\nPodés agendarlo cuando quieras desde el icono calendario.`;

  const url = construirUrlGoogleCalendar({ titulo, descripcion, fechaVencimiento: fecha });
  window.open(url, '_blank');
  cerrarBannerCalendar();
}

function agendarTransaccionEnCalendar(transaccionId){
  try{
    const u = typeof getUsuarioActual==='function' ? getUsuarioActual() : null;
    const gastos = u?.gastos || [];
    const tx = gastos.find(g => String(g.id)===String(transaccionId));
    if(!tx){ alert('No se encontró el movimiento'); return; }
    const fecha = tx.fecha ? new Date(tx.fecha) : new Date();
    const titulo = `Vencimiento: ${tx.descripcion || 'Cuota'}`;
    const descripcion = `Monto: $${tx.monto}\nTipo: ${tx.etiquetaTipo || tx.tipo}\nDesde LEDGER`;
    const url = construirUrlGoogleCalendar({ titulo, descripcion, fechaVencimiento: fecha });
    window.open(url, '_blank');
  }catch(e){ console.error(e); alert('Error al agendar'); }
}


// CALCULADORA
// === CALENDAR PARA DEUDAS - Todas las opciones: banco, mercado pago, tarjeta, amigo/familia, otro ===
let deudaTemporalParaCalendar = null;

function mostrarBannerDeudaCalendar(datos){
  const banner = document.getElementById('calendarDeudaBanner');
  const texto = document.getElementById('calendarDeudaText');
  const nombreSpan = document.getElementById('calendarDeudaNombre');
  if(!banner) return;
  deudaTemporalParaCalendar = datos || {};
  const tipo = (datos?.acreedorTipo || document.getElementById('dAcreedorTipo')?.value || '').toLowerCase();
  const nombre = datos?.acreedorNombre || document.getElementById('dAcreedorNombre')?.value || 'esta deuda';
  // Actualiza nombre dinámico dentro del banner con aviso de descuento
  if(nombreSpan){
    let label = nombre;
    if(tipo.includes('mercado')) label = `${nombre} (Mercado Pago)`;
    else if(tipo.includes('tarjeta')) label = `la tarjeta ${nombre}`;
    else if(tipo.includes('banco')) label = `${nombre} (banco)`;
    nombreSpan.textContent = label;
  } else if(texto){
    // fallback por si no existe span
    let msg = '';
    if(tipo.includes('mercado')) msg = `¿Querés agendar el vencimiento de ${nombre} (Mercado Pago) en Google Calendar?`;
    else if(tipo.includes('tarjeta')) msg = `¿Querés agendar el vencimiento de la tarjeta ${nombre} en Google Calendar?`;
    else if(tipo.includes('amigo')||tipo.includes('familia')) msg = `¿Querés agendar el vencimiento con ${nombre} en Google Calendar?`;
    else if(tipo.includes('banco')) msg = `¿Querés agendar el vencimiento con ${nombre} (banco) en Google Calendar?`;
    else msg = `¿Querés agendar la fecha de vencimiento de ${nombre} en Google Calendar?`;
    texto.textContent = msg;
  }
  banner.classList.remove('hidden');
}

function cerrarBannerDeudaCalendar(){
  document.getElementById('calendarDeudaBanner')?.classList.add('hidden');
}

function agendarDeudaActualEnCalendar(){
  const tipo = document.getElementById('dAcreedorTipo')?.value || 'otro';
  const nombre = (document.getElementById('dAcreedorNombre')?.value || '').trim() || 'Deuda';
  const cuota = parsearMonto(document.getElementById('dCuotaMensual')?.value)||0;
  const saldo = parsearMonto(document.getElementById('dSaldo')?.value)||0;
  const dia = parseInt(document.getElementById('dVencDia')?.value)||10;
  // Calcula próxima fecha de vencimiento con el día elegido
  const hoy = new Date();
  let fechaVenc = new Date(hoy.getFullYear(), hoy.getMonth(), dia);
  if(fechaVenc < hoy) fechaVenc = new Date(hoy.getFullYear(), hoy.getMonth()+1, dia);

  const titulo = `Vencimiento deuda: ${nombre} - $${cuota||saldo}`;
  const descripcion = `Acreedor: ${nombre}\nTipo: ${tipo}\nCuota mensual: $${cuota}\nSaldo: $${saldo}\nDía vencimiento: ${dia}\n\nAgendado desde LEDGER. Podés agendarlo cuando quieras desde el icono calendario.`;

  // Usa función global si existe, si no construye directo
  const url = (typeof construirUrlGoogleCalendar==='function')
    ? construirUrlGoogleCalendar({ titulo, descripcion, fechaVencimiento: fechaVenc })
    : (()=>{ 
        const s = fechaVenc.toISOString().replace(/-|:|\.\d+/g,'').slice(0,15)+'Z';
        const e = new Date(fechaVenc.getTime()+3600000).toISOString().replace(/-|:|\.\d+/g,'').slice(0,15)+'Z';
        const p = new URLSearchParams({action:'TEMPLATE', text:titulo, details:descripcion, dates:`${s}/${e}`});
        return `https://calendar.google.com/calendar/render?${p.toString()}`;
      })();

  window.open(url, '_blank');
  cerrarBannerDeudaCalendar();
}

function agendarDeudaExistenteEnCalendar(deudaId){
  try{
    const deudas = (typeof getDeudasUsuario==='function') ? getDeudasUsuario() : (getUsuarioActual()?.deudas||[]);
    const d = deudas.find(x=>String(x.id)===String(deudaId));
    if(!d){ alert('No se encontró la deuda'); return; }
    const hoy = new Date();
    let fechaVenc = new Date(hoy.getFullYear(), hoy.getMonth(), d.vencimientoDia||10);
    if(fechaVenc < hoy) fechaVenc = new Date(hoy.getFullYear(), hoy.getMonth()+1, d.vencimientoDia||10);
    const titulo = `Vencimiento deuda: ${d.acreedorNombre} - $${d.cuotaMensual||d.saldo}`;
    const descripcion = `Acreedor: ${d.acreedorNombre}\nTipo: ${d.acreedorTipo}\nCuota: $${d.cuotaMensual}\nSaldo: $${d.saldo}\nDesde LEDGER`;
    const url = (typeof construirUrlGoogleCalendar==='function')
      ? construirUrlGoogleCalendar({ titulo, descripcion, fechaVencimiento: fechaVenc })
      : (()=>{ 
          const s = fechaVenc.toISOString().replace(/-|:|\.\d+/g,'').slice(0,15)+'Z';
          const e = new Date(fechaVenc.getTime()+3600000).toISOString().replace(/-|:|\.\d+/g,'').slice(0,15)+'Z';
          const p = new URLSearchParams({action:'TEMPLATE', text:titulo, details:descripcion, dates:`${s}/${e}`});
          return `https://calendar.google.com/calendar/render?${p.toString()}`;
        })();
    window.open(url, '_blank');
  }catch(e){ console.error(e); alert('Error al agendar'); }
}


function toggleCalculadora(){ document.getElementById('floatingCalc').classList.toggle('hidden'); }
let calcExpression='0';
function calcClear(){ calcExpression='0'; updateCalcScreen(); }
function calcBackspace(){
  if(calcExpression.length<=1 || calcExpression==='Error'){ calcExpression='0'; }
  else { calcExpression = calcExpression.slice(0,-1); if(calcExpression===''||calcExpression==='-'){ calcExpression='0'; } }
  updateCalcScreen();
}
function calcAppend(v){
  if(calcExpression==='Error') calcExpression='0';
  if(calcExpression==='0' && v!=='00' && !isNaN(v) && v!=='.'){ calcExpression=v; }
  else if(calcExpression==='0' && v==='00'){ calcExpression='0'; }
  else if(calcExpression==='0' && v==='.'){ calcExpression='0.'; }
  else { calcExpression+=v; }
  // evitar multiples puntos en mismo numero
  updateCalcScreen();
}
function calcCalculate(){
  try{
    let s=calcExpression.replace(/×/g,'*').replace(/÷/g,'/').replace(/,/g,'.').replace(/[^0-9+\-*/().]/g,'');
    if(!s) return;
    let r=Function('"use strict";return ('+s+')')();
    calcExpression= !isFinite(r)?'Error':String(r);
  }catch(e){ calcExpression='Error'; }
  updateCalcScreen();
}
function formatNumberWithDots(numStr){
  if(!numStr || numStr==='Error' || numStr==='-') return numStr;
  let negative = numStr.startsWith('-') ? '-' : '';
  let s = negative ? numStr.slice(1) : numStr;
  let parts = s.split('.');
  let intPart = parts[0] || '0';
  let decPart = parts[1];
  // formatear miles con punto
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if(decPart!==undefined){
    // quitar ceros extras pero mostrar coma si hay decimal
    return negative + intPart + ',' + decPart;
  }
  return negative + intPart;
}
function formatCalcDisplay(expr){
  if(expr==='Error') return 'Error';
  // formatear cada numero dentro de la expresion manteniendo operadores
  return expr.replace(/-?\d+(?:\.\d+)?/g, function(match){
    return formatNumberWithDots(match);
  });
}
function updateCalcScreen(){
  const el = document.getElementById('calcScreen');
  if(!el) return;
  el.innerText = formatCalcDisplay(calcExpression);
}
function usarResultadoCalc(){ const raw = calcExpression.replace(/\./g,'').replace(',', '.').split(/[^0-9.\-]/).pop() || calcExpression; const val = parseFloat(String(raw).replace(/[^0-9.\-]/g,'') || calcExpression); if(!isNaN(val)){ document.getElementById('monto').value = val; validarMontoDisponible(document.getElementById('monto')); toggleCalculadora(); document.getElementById('monto').focus(); } }

const MP_LINK = "https://link.mercadopago.com.ar/academiadigital2026";
function abrirModalColaborar(){ document.getElementById('modalColaborar').classList.remove('hidden'); }
function cerrarModalColaborar(){ document.getElementById('modalColaborar').classList.add('hidden'); }
function irAMP(){ window.open(MP_LINK, '_blank'); }

function exportarExcel(){
  const u=getUsuarioActual(); if(!u||!u.gastos.length){ alert('No hay datos'); return; }
  let csv='data:text/csv;charset=utf-8,Fecha,Descripcion,Monto,Tipo,Usuario\n';
  u.gastos.forEach(g=>{ 
    let desc = (g.descripcion||'').replace(/"/g, '""');
    csv+= [g.fecha,'"'+desc+'"',g.monto,g.etiquetaTipo,u.name].join(',')+'\n'; 
  });
  let link=document.createElement('a'); link.setAttribute('href', encodeURI(csv)); link.setAttribute('download','ledger_'+u.name+'.csv'); document.body.appendChild(link); link.click(); link.remove();
}

function exportarPDF(){
  const u=getUsuarioActual(); 
  if(!u){ alert('Seleccioná un usuario'); return; }
  const gastos = u.gastos||[];
  if(gastos.length===0){ alert('No hay movimientos para exportar'); return; }
  const total = gastos.reduce((a,g)=>a+g.monto,0);
  const fmtLocal = (n) => new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', minimumFractionDigits:2 }).format(n||0);
  const w = window.open('', '_blank');
  if(!w){ alert('Tu navegador bloqueó la ventana. Permití pop-ups para exportar PDF.'); return; }
  w.document.write(`<!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>LEDGER - ${u.name}</title>
    <style>
      body{font-family:Inter,Arial,sans-serif; padding:40px; color:#0A0A0A; background:white;}
      h1{font-size:20px; margin-bottom:4px;} .sub{color:#9A9A98; font-size:12px; margin-bottom:24px;}
      table{width:100%; border-collapse:collapse; margin-top:16px;}
      th{font-size:11px; text-align:left; color:#9A9A98; text-transform:uppercase; letter-spacing:.05em; padding:8px 12px; border-bottom:1px solid #E8E8E6;}
      td{padding:10px 12px; border-bottom:1px solid #F0F0EF; font-size:13px;}
      .right{text-align:right} .total{font-weight:600; background:#F6F6F5;}
      .footer{margin-top:40px; font-size:9px; color:#9A9A98; border-top:1px solid #E8E8E6; padding-top:12px;}
    </style></head><body>
    <h1>LEDGER — ${u.name}</h1>
    <div class="sub">Tus cuentas, al día. · Generado el ${new Date().toLocaleString('es-AR')} · ACADEMIA DIGITAL BY MARIO MAIOLO</div>
    <table><thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th class="right">Monto</th></tr></thead>
    <tbody>${gastos.map(g=>`<tr><td>${g.fecha}</td><td>${g.descripcion}</td><td>${g.etiquetaTipo||g.tipo}</td><td class="right">${fmtLocal(g.monto)}</td></tr>`).join('')}
    <tr class="total"><td colspan="3">TOTAL GASTOS</td><td class="right">${fmtLocal(total)}</td></tr>
    </tbody></table>
    <div class="footer">ACADEMIA DIGITAL — BY MARIO MAIOLO — TODOS LOS DERECHOS RESERVADOS — 2026 · LEDGER</div>
    </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(()=>{ w.print(); }, 600);
}


// === GRAFICOS Y AHORRO - INTEGRADO LIMPIO - FINAL v4 ===
let chartDonaInstance=null, chartBarInstance=null, chartEvolInstance=null;
let chartView='tipo';

function abrirModalGraficos(){
  const u=getUsuarioActual(); 
  if(!u){ alert('Creá un usuario primero'); return; }
  const el=document.getElementById('modalGraficos');
  if(!el){ alert('Modal gráficos no encontrado'); return; }
  el.classList.remove('hidden');
  document.body.style.overflow='hidden';
  requestAnimationFrame(function(){
    setTimeout(function(){
      actualizarGraficos();
      try{
        if(chartDonaInstance) chartDonaInstance.resize();
        if(chartBarInstance) chartBarInstance.resize();
        if(chartEvolInstance) chartEvolInstance.resize();
      }catch(e){}
      const body=el.querySelector('.overflow-y-auto');
      if(body) body.scrollTop=0;
    },180);
  });
}
function cerrarModalGraficos(){ 
  const el=document.getElementById('modalGraficos');
  if(el){ el.classList.add('hidden'); }
  document.body.style.overflow='';
}
function setChartView(v){
  chartView=v;
  const bT=document.getElementById('btnChartTipo');
  const bC=document.getElementById('btnChartCat');
  if(bT && bC){
    if(v==='tipo'){
      bT.className='px-3 h-7 rounded-full bg-ink text-white text-[11px] font-medium';
      bC.className='px-3 h-7 rounded-full text-[11px] font-medium text-[#9A9A98]';
    }else{
      bC.className='px-3 h-7 rounded-full bg-ink text-white text-[11px] font-medium';
      bT.className='px-3 h-7 rounded-full text-[11px] font-medium text-[#9A9A98]';
    }
  }
  document.querySelectorAll('.btnChartTipoMobile').forEach(function(el){
    el.className = v==='tipo' ? 'btnChartTipoMobile px-4 h-8 rounded-full bg-ink text-white text-[11px] font-medium' : 'btnChartTipoMobile px-4 h-8 rounded-full text-[11px] text-[#9A9A98] bg-transparent';
  });
  document.querySelectorAll('.btnChartCatMobile').forEach(function(el){
    el.className = v==='categoria' ? 'btnChartCatMobile px-4 h-8 rounded-full bg-ink text-white text-[11px] font-medium' : 'btnChartCatMobile px-4 h-8 rounded-full text-[11px] text-[#9A9A98] bg-transparent';
  });
  const lb=document.getElementById('labelBar');
  if(lb) lb.textContent=v;
  actualizarGraficos();
}
function actualizarGraficos(){
  const u=getUsuarioActual();
  const legendEl=document.getElementById('legendDona');
  const insEl=document.getElementById('insightTexto');
  const ctxEvol=document.getElementById('chartEvolucion');
  if(!u || !(u.gastos||[]).length){
    if(legendEl) legendEl.innerHTML='<p class="text-[12px] text-[#9A9A98]">Sin gastos para graficar</p>';
    if(insEl) insEl.textContent='Agregá gastos para ver estadísticas';
    if(ctxEvol){
      if(chartEvolInstance){ try{ chartEvolInstance.destroy(); }catch(e){} chartEvolInstance=null; }
      const p=ctxEvol.parentElement;
      if(p){ p.innerHTML='<p class="text-[12px] text-[#9A9A98] text-center py-10">Sin datos de evolución</p><canvas id="chartEvolucion" style="display:none"></canvas>'; }
    }
    return;
  }
  if(typeof Chart==='undefined'){
    if(legendEl) legendEl.innerHTML='<p class="text-[12px] text-[#FF3B30]">Chart.js no cargó</p>';
    return;
  }
  const filtrados=(u.gastos||[]).filter(function(g){
    const o=String(g.origen||'');
    if(o.indexOf('pago-')===0) return false;
    if((g.descripcion||'').toLowerCase().indexOf('pago cuota')!==-1) return false;
    if(o==='ahorro-mensual') return false;
    return true;
  });
  const agrupado={};
  if(chartView==='tipo'){
    filtrados.forEach(function(g){
      const k=(g.tipo||'otros').toLowerCase();
      let label='Otros';
      if(k==='fijo') label='Fijos';
      else if(k==='unico') label='Únicos';
      else if(k==='cuota' || k==='cuotas') label='Cuotas';
      agrupado[label]=(agrupado[label]||0)+parseFloat(g.monto||0);
    });
  }else{
    filtrados.forEach(function(g){
      const k=g.categoria||g.etiquetaTipo||'Otros';
      agrupado[k]=(agrupado[k]||0)+parseFloat(g.monto||0);
    });
  }
  const labels=Object.keys(agrupado);
  const values=Object.values(agrupado);
  const total=values.reduce(function(a,b){return a+b;},0) || 1;
  function fmtLocal(n){ return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n||0); }
  const palette=labels.map(function(_,i){ return ['#0A0A0A','#FF3B30','#007AFF','#34C759','#FF9500','#AF52DE','#FF2D55','#5AC8FA','#FFCC02','#30D158','#5856D6','#FF6B00'][i%12]; });
  const ctxD=document.getElementById('chartDona');
  if(ctxD){
    if(chartDonaInstance){ try{ chartDonaInstance.destroy(); }catch(e){} }
    chartDonaInstance=new Chart(ctxD, {
      type:'doughnut',
      data:{ labels:labels, datasets:[{ data:values, backgroundColor:palette, borderWidth:3, borderColor:'#FFFFFF', hoverOffset:8 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'64%', plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(c){ return ' '+c.label+': '+fmtLocal(c.parsed)+' ('+((c.parsed/total)*100).toFixed(1)+'%)'; } } } } }
    });
  }
  if(legendEl){
    let html='';
    for(let i=0;i<labels.length;i++){
      html+='<div class="flex justify-between items-center text-[12px] py-2 border-b border-line/60 last:border-0"><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:'+palette[i]+'"></span><span class="font-medium">'+labels[i]+'</span></div><div class="mono flex items-center gap-2"><span class="font-medium">'+fmtLocal(values[i])+'</span><span class="text-[11px] text-[#9A9A98]">'+((values[i]/total)*100).toFixed(1)+'%</span></div></div>';
    }
    legendEl.innerHTML=html;
  }
  const ctxB=document.getElementById('chartBar');
  if(ctxB){
    if(chartBarInstance){ try{ chartBarInstance.destroy(); }catch(e){} }
    chartBarInstance=new Chart(ctxB, {
      type:'bar',
      data:{ labels:labels, datasets:[{ label:'Monto', data:values, backgroundColor:palette, borderWidth:1, borderRadius:8, barThickness:28 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true, grid:{ color:'#E8E8E6' } }, x:{ grid:{ display:false } } } }
    });
  }
  if(ctxEvol){
    if(chartEvolInstance){ try{ chartEvolInstance.destroy(); }catch(e){} }
    const meses=[];
    const ahora=new Date();
    for(let i=5;i>=0;i--){
      const d=new Date(ahora.getFullYear(), ahora.getMonth()-i, 1);
      meses.push({ label: d.toLocaleString('es-AR',{month:'short'}).replace('.',''), year:d.getFullYear(), month:d.getMonth() });
    }
    const valoresMes=meses.map(function(m){
      return (u.gastos||[]).filter(function(g){
        const o=String(g.origen||'');
        if(o.indexOf('pago-')===0) return false;
        if(o==='ahorro-mensual') return false;
        try{ const fg=new Date(g.fecha+'T00:00:00'); return fg.getFullYear()===m.year && fg.getMonth()===m.month; }catch(e){ return false; }
      }).reduce(function(a,g){ return a+ (Number(g.monto)||0); },0);
    });
    chartEvolInstance=new Chart(ctxEvol, {
      type:'line',
      data:{ labels: meses.map(function(m){ return m.label.charAt(0).toUpperCase()+m.label.slice(1); }), datasets:[{ label:'Gastos', data:valoresMes, borderColor:'#0A0A0A', backgroundColor:'rgba(10,10,10,0.08)', borderWidth:2.5, tension:0.4, fill:true, pointRadius:4 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true }, x:{ grid:{ display:false } } } }
    });
  }
  const maxIdx=values.indexOf(Math.max.apply(null, values));
  if(insEl && labels[maxIdx]){
    const pct=((values[maxIdx]/total)*100).toFixed(1);
    insEl.innerHTML='Mayor gasto en <b>'+labels[maxIdx]+'</b> con '+fmtLocal(values[maxIdx])+' ('+pct+'% del total).';
  }
}


function abrirModalAhorro(){

  const u=getUsuarioActual(); if(!u){ alert('Creá un usuario primero'); return; }
  if(!u.ahorro){ u.ahorro={ nombre:'', objetivo:0, mensual:0, actual:0 }; }
  const el=document.getElementById('modalAhorro'); if(!el){ alert('Modal ahorro no encontrado'); return; }
  el.classList.remove('hidden');
  document.getElementById('ahorroNombre').value=u.ahorro.nombre||'';
  document.getElementById('ahorroObjetivo').value=u.ahorro.objetivo||'';
  document.getElementById('ahorroMensual').value=u.ahorro.mensual||'';
  document.getElementById('ahorroActual').value=u.ahorro.actual||'';
  actualizarCalculosAhorro();
}
function cerrarModalAhorro(){ document.getElementById('modalAhorro')?.classList.add('hidden'); }
function actualizarCalculosAhorro(){
  const objetivo=parsearMonto(document.getElementById('ahorroObjetivo')?.value)||0;
  const mensual=parsearMonto(document.getElementById('ahorroMensual')?.value)||0;
  const actual=parsearMonto(document.getElementById('ahorroActual')?.value)||0;
  const falta=Math.max(0, objetivo-actual);
  const porcentaje=objetivo>0?Math.min(100,(actual/objetivo)*100):0;
  const meses=mensual>0?Math.ceil(falta/mensual):'—';
  const u=getUsuarioActual();
  const sueldo=u?.sueldo||0;
  const totalGastos=(u?.gastos||[]).reduce((a,b)=>a+b.monto,0);
  const saldoRealLibre=sueldo-totalGastos-mensual;
  const pEl=document.getElementById('ahorroPorcentaje'); if(pEl) pEl.innerText=porcentaje.toFixed(1)+'%';
  const bEl=document.getElementById('ahorroBar'); if(bEl) bEl.style.width=porcentaje+'%';
  const fEl=document.getElementById('ahorroFalta'); if(fEl) fEl.innerText=fmt(falta);
  const sEl=document.getElementById('ahorroSaldoReal'); if(sEl) sEl.innerText=fmt(saldoRealLibre);
  const mEl=document.getElementById('ahorroMeses'); if(mEl) mEl.innerText=typeof meses==='number'?meses+' meses':meses;
}
function guardarAhorro(){
  const u=getUsuarioActual(); if(!u) return;
  const nombre=(document.getElementById('ahorroNombre')?.value||'').trim();
  const objetivo=parsearMonto(document.getElementById('ahorroObjetivo')?.value)||0;
  const mensual=parsearMonto(document.getElementById('ahorroMensual')?.value)||0;
  const actual=parsearMonto(document.getElementById('ahorroActual')?.value)||0;
  const esNueva = !u.ahorro;
  updateUsuarioData(u.id, old=>({ ...old, ahorro:{ nombre, objetivo, mensual, actual } }));
  cerrarModalAhorro();
  actualizarResumen();
  // 1er mensaje: aviso descuento automático solo si es nueva meta
  if(esNueva || mensual>0){
    setTimeout(()=> mostrarModalAhorroAviso({ nombre, objetivo, mensual, actual }), 250);
  }
  // 2do mensaje: si ya cumplió objetivo al guardar
  if(objetivo>0 && actual>=objetivo){
    setTimeout(()=> mostrarModalMetaLograda({ nombre, objetivo, mensual, actual }), 400);
  }
}
async function sumarAhorroMensual(){
  const mensual=parsearMonto(document.getElementById('ahorroMensual')?.value)||0;
  if(mensual<=0){ alert('Poné un monto mensual primero'); return; }
  const ok = await mostrarConfirmDescuento(mensual, `Ahorro mensual`);
  if(!ok) return;
  const actualEl=document.getElementById('ahorroActual'); if(!actualEl) return;
  const actual=parseFloat(actualEl.value)||0;
  const nuevoActual=actual+mensual;
  actualEl.value=nuevoActual;
  const u=getUsuarioActual(); if(!u) return;
  const nombre=(document.getElementById('ahorroNombre')?.value||'').trim() || 'Ahorro';
  const objetivo=parsearMonto(document.getElementById('ahorroObjetivo')?.value)||0;
  const fechaHoy = new Date().toISOString().split('T')[0];
  const nuevoGasto = {
    id: Date.now()+Math.floor(Math.random()*1000),
    descripcion: `Ahorro: ${nombre}`,
    monto: mensual,
    fecha: fechaHoy,
    tipo: 'unico',
    etiquetaTipo: 'Ahorro',
    origen: 'ahorro-mensual'
  };
  updateUsuarioData(u.id, old=>({ 
    ...old, 
    gastos: [...(old.gastos||[]), nuevoGasto],
    ahorro:{ nombre, objetivo, mensual, actual:nuevoActual } 
  }));
  actualizarCalculosAhorro();
  cargarDatos();
  actualizarResumen();
  if(objetivo>0 && nuevoActual>=objetivo){
    setTimeout(()=> mostrarModalMetaLograda({ nombre, objetivo, mensual, actual:nuevoActual }), 300);
  }
}

function eliminarAhorro(){
  const u=getUsuarioActual(); if(!u) return;
  if(confirm('¿Eliminar la meta de ahorro actual?')){
    updateUsuarioData(u.id, old=>({ ...old, ahorro:null }));
    cerrarModalAhorro();
    actualizarResumen();
  }
}


function toggleFxCard(force){
  const card=document.getElementById('fxCard'); const chevron=document.getElementById('fxChevron');
  if(!card) return; const isHidden=card.classList.contains('hidden'); const show=typeof force==='boolean'?force:isHidden;
  if(show){ card.classList.remove('hidden'); if(chevron) chevron.style.transform='rotate(180deg)'; }
  else { card.classList.add('hidden'); if(chevron) chevron.style.transform='rotate(0deg)'; }
}
async function cargarCotizaciones(){
  const $=id=>document.getElementById(id);
  const fmt=n=>{ if(n==null||isNaN(n)) return '—'; return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n); };
  try{
    const [of,blue,mep,eur,blu]=await Promise.all([
      fetch('https://dolarapi.com/v1/dolares/oficial').then(r=>r.json()).catch(()=>null),
      fetch('https://dolarapi.com/v1/dolares/blue').then(r=>r.json()).catch(()=>null),
      fetch('https://dolarapi.com/v1/dolares/bolsa').then(r=>r.json()).catch(()=>null),
      fetch('https://dolarapi.com/v1/cotizaciones/eur').then(r=>r.json()).catch(()=>null),
      fetch('https://api.bluelytics.com.ar/v2/latest').then(r=>r.json()).catch(()=>null)
    ]);
    if(of){ $('usdOfCompra').textContent=fmt(of.compra); $('usdOfVenta').textContent=fmt(of.venta); }
    else if(blu){ $('usdOfCompra').textContent=fmt(blu.oficial.value_buy); $('usdOfVenta').textContent=fmt(blu.oficial.value_sell); }
    if(blue){ $('usdBlueCompra').textContent=fmt(blue.compra); $('usdBlueVenta').textContent=fmt(blue.venta); }
    else if(blu){ $('usdBlueCompra').textContent=fmt(blu.blue.value_buy); $('usdBlueVenta').textContent=fmt(blu.blue.value_sell); }
    if(mep){ $('usdMepCompra').textContent=fmt(mep.compra); $('usdMepVenta').textContent=fmt(mep.venta); }
    if(eur){ $('eurOfCompra').textContent=fmt(eur.compra); $('eurOfVenta').textContent=fmt(eur.venta); }
    else if(blu){ $('eurOfCompra').textContent=fmt(blu.oficial_euro.value_buy); $('eurOfVenta').textContent=fmt(blu.oficial_euro.value_sell); }
    if(blu && blu.blue_euro){ $('eurBlueCompra').textContent=fmt(blu.blue_euro.value_buy); $('eurBlueVenta').textContent=fmt(blu.blue_euro.value_sell); }
    const ahora=new Date(); const t=$('fxTime'); if(t) t.textContent='Actualizado '+ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  }catch(e){ console.warn(e); }
}

document.addEventListener('click',e=>{
  const card=document.getElementById('fxCard'); if(!card||card.classList.contains('hidden')) return;
  if(!e.target.closest('#fxCard') && !e.target.closest('#btnFx')) toggleFxCard(false);
});

function refrescarTodo(){ cargarDatos(); renderListaUsuariosModal(); renderListaCambiarUsuario(); }

document.addEventListener('DOMContentLoaded', ()=>{
  try{ migrarDatosAntiguos(); }catch(e){}
  let users = [];
  try{ users = getUsuarios(); }catch(e){ users=[]; }
  let currentId = null;
  try{ currentId = getCurrentId(); }catch(e){}
  let activeUser = null;
  try{ activeUser = users.find(u => String(u.id) === String(currentId)); }catch(e){}
  if (users.length === 0 || !activeUser) {
    if (users.length > 0) {
      try{ setCurrentId(users[0].id); }catch(e){ try{ localStorage.setItem('ledger_current_v2', String(users[0].id)); }catch(e2){} }
    } else {
      try{ localStorage.removeItem(STORAGE_CURRENT); }catch(e){}
      try{ document.getElementById('modalBienvenida')?.classList.remove('hidden'); }catch(e){}
    }
  }
  try{ const f=document.getElementById('fecha'); if(f) f.valueAsDate=new Date(); }catch(e){}
  try{ activarFormatoMiles(); }catch(e){}
  try{ refrescarTodo(); }catch(e){ console.error('refrescarTodo error', e); }
  try{ cargarCotizaciones(); }catch(e){}
  try{ setInterval(cargarCotizaciones,300000); }catch(e){}
  // Si sigue sin usuario despues de 500ms, forzar seleccion
  setTimeout(()=>{
    try{
      const u=getUsuarioActual();
      if(!u){
        const us=getUsuarios();
        if(us.length>0){
          setCurrentId(us[0].id);
          refrescarTodo();
        }
      }
    }catch(e){}
  }, 500);
});

/* ================== DEUDAS MODULE - LEDGER ================== */
let filtroDeudasActual = 'todas';
let deudaEditId = null;

function getDeudasUsuario(){
  const u = getUsuarioActual?.();
  if(!u) return [];
  if(!u.deudas) u.deudas = [];
  return u.deudas;
}

function setFiltroDeudas(f){
  filtroDeudasActual = f;
  document.querySelectorAll('.filtroDeuda').forEach(b=>{
    const is=b.dataset.filtro===f;
    b.classList.toggle('activo',is);
    if(is){ b.classList.remove('bg-stone'); b.classList.add('bg-ink','text-white'); }
    else { b.classList.add('bg-stone'); b.classList.remove('bg-ink','text-white'); }
  });
  renderDeudas();
}

function abrirModalDeudas(){
  const el=document.getElementById('modalDeudas');
  if(!el){ alert('Modal deudas no encontrado - verifica que pegaste el HTML'); return; }
  el.classList.remove('hidden');
  renderDeudas();
}
function cerrarModalDeudas(){ document.getElementById('modalDeudas')?.classList.add('hidden'); }

function abrirFormDeuda(id=null){
  deudaEditId = id;
  const wrap=document.getElementById('formDeudaWrap');
  const titulo=document.getElementById('formDeudaTitulo');
  const btnDel=document.getElementById('btnEliminarDeuda');
  let datosParaBanner = null;
  if(id){
    const d=getDeudasUsuario().find(x=>String(x.id)===String(id));
    if(!d) return;
    titulo.textContent='Editar deuda';
    btnDel.classList.remove('hidden');
    document.getElementById('dAcreedorTipo').value=d.acreedorTipo||'banco';
    document.getElementById('dAcreedorNombre').value=d.acreedorNombre||'';
    document.getElementById('dMontoOriginal').value=formatearConPuntosConSigno(d.montoOriginal||'');
    document.getElementById('dSaldo').value=formatearConPuntosConSigno(d.saldo||'');
    document.getElementById('dCuotaMensual').value=formatearConPuntosConSigno(d.cuotaMensual||'');
    document.getElementById('dVencDia').value=d.vencimientoDia||10;
    document.getElementById('dCuotasTotal').value=d.cuotasTotal||'';
    document.getElementById('dCuotasPagadas').value=d.cuotasPagadas||0;
    document.getElementById('dNotas').value=d.notas||'';
    datosParaBanner = d;
  } else {
    titulo.textContent='Nueva deuda';
    btnDel.classList.add('hidden');
    ['dAcreedorNombre','dMontoOriginal','dSaldo','dCuotaMensual','dCuotasTotal','dNotas'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
    document.getElementById('dAcreedorTipo').value='banco';
    document.getElementById('dVencDia').value=10;
    document.getElementById('dCuotasPagadas').value=0;
    datosParaBanner = { acreedorTipo: 'banco', acreedorNombre: 'Nueva deuda' };
  }
  wrap.classList.remove('hidden');
  // Mostrar cartel de Google Calendar para TODAS las opciones
  setTimeout(()=> mostrarBannerDeudaCalendar(datosParaBanner), 50);
}

// Actualiza texto del banner cuando cambia tipo de acreedor en deudas
document.getElementById('dAcreedorTipo')?.addEventListener('change', (e)=>{
  mostrarBannerDeudaCalendar({ acreedorTipo: e.target.value, acreedorNombre: document.getElementById('dAcreedorNombre')?.value || 'esta deuda' });
});
document.getElementById('dAcreedorNombre')?.addEventListener('input', (e)=>{
  mostrarBannerDeudaCalendar({ acreedorTipo: document.getElementById('dAcreedorTipo')?.value || 'banco', acreedorNombre: e.target.value || 'esta deuda' });
});

function cerrarFormDeuda(){ document.getElementById('formDeudaWrap')?.classList.add('hidden'); deudaEditId=null; cerrarBannerDeudaCalendar(); }

function guardarDeuda(){
  const u=getUsuarioActual(); if(!u) return;
  const data={
    acreedorTipo: document.getElementById('dAcreedorTipo').value,
    acreedorNombre: (document.getElementById('dAcreedorNombre').value||'').trim() || 'Sin nombre',
    montoOriginal: parsearMonto(document.getElementById('dMontoOriginal').value)||0,
    saldo: parsearMonto(document.getElementById('dSaldo').value)||0,
    cuotaMensual: parsearMonto(document.getElementById('dCuotaMensual').value)||0,
    vencimientoDia: Math.min(31, Math.max(1, parseInt(document.getElementById('dVencDia').value)||10)),
    cuotasTotal: parseInt(document.getElementById('dCuotasTotal').value)||0,
    cuotasPagadas: parseInt(document.getElementById('dCuotasPagadas').value)||0,
    notas: (document.getElementById('dNotas').value||'').trim()
  };
  if(data.saldo<=0 && data.montoOriginal>0 && !deudaEditId){ data.saldo=data.montoOriginal; }
  if(!data.acreedorNombre){ alert('Poné un acreedor'); return; }

  let deudaIdGenerada = null;
  let gastoIdGenerado = null;
  updateUsuarioData(u.id, old=>{
    const deudas=[...(old.deudas||[])];
    const gastos=[...(old.gastos||[])];
    if(deudaEditId){
      const idx=deudas.findIndex(x=>String(x.id)===String(deudaEditId));
      if(idx>=0) deudas[idx]={...deudas[idx], ...data};
      return {...old, deudas};
    } else {
      deudaIdGenerada = Date.now()+Math.random();
      gastoIdGenerado = Date.now()+1+Math.floor(Math.random()*10000);
      const fechaHoy = new Date().toISOString().split('T')[0];
      const esEnCuotas = (data.cuotasTotal||0) > 1;
      
      // FIX: respetar cuotas pagas ingresadas - no sumar +1 y no hardcodear 1/Total
      const cuotaADebitar = data.cuotaMensual || 0;
      const montoOriginal = data.montoOriginal || data.saldo || 0;
      const cuotasPagadasUsuario = parseInt(data.cuotasPagadas) || 0;
      const cuotasTotalUsuario = parseInt(data.cuotasTotal) || 0;

      // Saldo = total - (pagas * cuota)
      let saldoInicial = montoOriginal;
      if(cuotasTotalUsuario > 0 && cuotaADebitar > 0){
        saldoInicial = Math.max(0, montoOriginal - (cuotaADebitar * cuotasPagadasUsuario));
      } else if(data.saldo > 0){
        saldoInicial = data.saldo;
      }
      let cuotasPagadasInicial = cuotasPagadasUsuario;
      let pagosIniciales = [];
      if(cuotasPagadasUsuario > 0 && cuotaADebitar > 0){
        pagosIniciales = Array.from({length: cuotasPagadasUsuario}, (_,i)=>({
          fecha: new Date().toISOString(),
          monto: cuotaADebitar,
          cuotaNro: i+1
        }));
      }

      data.saldo = saldoInicial;
      data.cuotasPagadas = cuotasPagadasInicial;

      const nuevaDeuda = { 
        id: deudaIdGenerada, 
        fechaAlta: new Date().toISOString(), 
        pagos: pagosIniciales, 
        gastoId: gastoIdGenerado,
        ultimoPagoFecha: pagosIniciales.length ? pagosIniciales[0].fecha : null,
        ...data,
        saldo: saldoInicial,
        cuotasPagadas: cuotasPagadasInicial
      };
      deudas.push(nuevaDeuda);

      // Si cargaste 4/5, el movimiento debe decir 4/5, no 1/5
      let nroCuotaParaGasto = cuotasPagadasInicial > 0 ? cuotasPagadasInicial : 1;
      // Caso especial: deuda nueva con 0 pagas -> registrar primera cuota como paga ahora
      if(cuotasTotalUsuario > 0 && cuotasPagadasUsuario === 0 && cuotaADebitar > 0){
        nroCuotaParaGasto = 1;
        nuevaDeuda.cuotasPagadas = 1;
        nuevaDeuda.saldo = Math.max(0, montoOriginal - cuotaADebitar);
        nuevaDeuda.pagos = [{ fecha: new Date().toISOString(), monto: cuotaADebitar, cuotaNro: 1 }];
        data.cuotasPagadas = 1;
        data.saldo = nuevaDeuda.saldo;
      }

      const montoGastoInicial = cuotaADebitar > 0 ? cuotaADebitar : montoOriginal;
      const descripcionMov = `Pago cuota: ${data.acreedorNombre} (${nroCuotaParaGasto}/${data.cuotasTotal||'?'})` + (data.notas ? ` - ${data.notas}` : '');
      const nuevoGasto = {
        id: gastoIdGenerado,
        descripcion: descripcionMov.slice(0,120),
        monto: montoGastoInicial,
        fecha: fechaHoy,
        tipo: 'unico',
        etiquetaTipo: `Pago cuota ${nroCuotaParaGasto}/${data.cuotasTotal||''}`.trim() || 'Pago cuota',
        origen: 'deuda-manual',
        deudaId: deudaIdGenerada,
        origenDeudaId: deudaIdGenerada
      };
      if(!gastos.some(g=>String(g.deudaId)===String(deudaIdGenerada)) && !gastos.some(g=>String(g.origenDeudaId)===String(deudaIdGenerada))){
        gastos.push(nuevoGasto);
      }
      return {...old, deudas, gastos};
    }
  });
  const datosGuardados = {...data};
  if(!deudaEditId && typeof cargarDatos==='function'){
    try{ cargarDatos(); }catch(e){}
  }
  cerrarFormDeuda();
  renderDeudas();
  actualizarResumen?.();
  // Ofrecer agendar en Google Calendar - Modal premium LEDGER con check no volver a mostrar
  setTimeout(async ()=>{
    const ok = await mostrarConfirmCalendarPremium(datosGuardados);
    if(ok){
      try{
        const hoy = new Date();
        let fechaVenc = new Date(hoy.getFullYear(), hoy.getMonth(), datosGuardados.vencimientoDia||10);
        if(fechaVenc < hoy) fechaVenc = new Date(hoy.getFullYear(), hoy.getMonth()+1, datosGuardados.vencimientoDia||10);
        const titulo = `Vencimiento deuda: ${datosGuardados.acreedorNombre} - $${datosGuardados.cuotaMensual||datosGuardados.saldo}`;
        const descripcion = `Acreedor: ${datosGuardados.acreedorNombre}\nTipo: ${datosGuardados.acreedorTipo}\nCuota: $${datosGuardados.cuotaMensual}\nSaldo: $${datosGuardados.saldo}\nDesde LEDGER`;
        const url = (typeof construirUrlGoogleCalendar==='function')
          ? construirUrlGoogleCalendar({ titulo, descripcion, fechaVencimiento: fechaVenc })
          : (()=>{ 
              const s = fechaVenc.toISOString().replace(/-|:|\.\d+/g,'').slice(0,15)+'Z';
              const e = new Date(fechaVenc.getTime()+3600000).toISOString().replace(/-|:|\.\d+/g,'').slice(0,15)+'Z';
              const p = new URLSearchParams({action:'TEMPLATE', text:titulo, details:descripcion, dates:`${s}/${e}`});
              return `https://calendar.google.com/calendar/render?${p.toString()}`;
            })();
        window.open(url, '_blank');
      }catch(e){ console.error(e); }
    }
  }, 350);
}

function eliminarDeudaActual(){
  if(!deudaEditId) return;
  if(!confirm('¿Eliminar esta deuda?')) return;
  const u=getUsuarioActual(); if(!u) return;
  try{
    const key='ledger_deleted_deudas';
    let lista=JSON.parse(localStorage.getItem(key)||'[]').map(String);
    const sId=String(deudaEditId);
    if(!lista.includes(sId)){ lista.push(sId); localStorage.setItem(key, JSON.stringify(lista)); }
  }catch(e){}
  updateUsuarioData(u.id, old=>({ ...old, deudas:(old.deudas||[]).filter(x=>String(x.id)!==String(deudaEditId)) }));
  cerrarFormDeuda(); renderDeudas(); actualizarResumen?.();
  if(window.scheduleUpload) window.scheduleUpload();
}

function eliminarDeuda(id){ 
  if(!id) return; 
  if(!confirm('¿Eliminar esta deuda? Esta acción no se puede deshacer.')) return; 
  const u=getUsuarioActual(); if(!u) return; 
  try{
    const key='ledger_deleted_deudas';
    let lista=JSON.parse(localStorage.getItem(key)||'[]').map(String);
    const sId=String(id);
    if(!lista.includes(sId)){ lista.push(sId); localStorage.setItem(key, JSON.stringify(lista)); }
  }catch(e){}
  updateUsuarioData(u.id, old=>({ ...old, deudas:(old.deudas||[]).filter(x=>String(x.id)!==String(id)) })); 
  renderDeudas(); 
  try{ actualizarResumen?.(); }catch(e){}
  if(window.scheduleUpload) window.scheduleUpload();
}

async function pagarCuotaDeuda(id){
  const u=getUsuarioActual(); if(!u) return;
  const d=(u.deudas||[]).find(x=>String(x.id)===String(id)); if(!d) return;
  const montoPago = d.cuotaMensual||0;
  if(montoPago<=0){ alert('Esta deuda no tiene cuota mensual definida'); return; }
  const ok = await mostrarConfirmDescuento(montoPago, `Pago cuota: ${d.acreedorNombre} (${(d.cuotasPagadas||0)+1}/${d.cuotasTotal||'?'})`);
  if(!ok) return;
  let quedoEnCero=false;
  const fechaHoy = new Date().toISOString().split('T')[0];
  updateUsuarioData(u.id, old=>{
    const deudas=(old.deudas||[]).map(x=>{
      if(String(x.id)!==String(id)) return x;
      const nuevoSaldo=Math.max(0,(x.saldo||0)-(x.cuotaMensual||0));
      if(nuevoSaldo<=0) quedoEnCero=true;
      const nuevasCuotas=(x.cuotasPagadas||0)+1;
      const ahora=new Date().toISOString();
      const pagos=[...(x.pagos||[]), { fecha:ahora, monto:x.cuotaMensual }];
      return {...x, saldo:nuevoSaldo, cuotasPagadas:nuevasCuotas, pagos, ultimoPagoFecha:ahora};
    });
    let gastos = [...(old.gastos||[])];
    gastos = gastos.map(g=>{
      if(g.deudaId && String(g.deudaId)===String(id) && g.tipo==='cuotas' && (g.cuotasRestantes||0)>0){
        return {...g, cuotasRestantes: g.cuotasRestantes -1};
      }
      return g;
    });
    const nuevoGasto = {
      id: Date.now()+Math.floor(Math.random()*1000),
      descripcion: `Pago cuota: ${d.acreedorNombre} (${(d.cuotasPagadas||0)+1}/${d.cuotasTotal||'?'})`,
      monto: montoPago,
      fecha: fechaHoy,
      tipo: 'unico',
      etiquetaTipo: 'Pago cuota',
      origenDeudaId: id,
      origen: 'pago-deuda'
    };
    gastos = [...gastos, nuevoGasto];
    return {...old, deudas, gastos};
  });
  cargarDatos(); renderDeudas(); actualizarResumen?.();
  if(quedoEnCero){
    setTimeout(()=>preguntarEliminarDeudaSaldada(id, d.acreedorNombre), 200);
  }
}


async function amortizarDeuda(id){
  const monto=parseFloat(prompt('Monto amortización anticipada:')||'');
  if(!monto||monto<=0) return;
  const u=getUsuarioActual(); if(!u) return;
  const ok = await mostrarConfirmDescuento(monto, `Amortización anticipada`);
  if(!ok) return;
  let quedoEnCero=false;
  let nombreDeuda='';
  const fechaHoy = new Date().toISOString().split('T')[0];
  updateUsuarioData(u.id, old=>{
    const deudas=(old.deudas||[]).map(x=>{
      if(String(x.id)!==String(id)) return x;
      nombreDeuda=x.acreedorNombre;
      const nuevoSaldo=Math.max(0,(x.saldo||0)-monto);
      if(nuevoSaldo<=0) quedoEnCero=true;
      const pagos=[...(x.pagos||[]), { fecha:new Date().toISOString(), monto, tipo:'amortizacion' }];
      return {...x, saldo:nuevoSaldo, pagos};
    });
    const nuevoGasto = {
      id: Date.now()+Math.floor(Math.random()*1000),
      descripcion: `Amortización: ${nombreDeuda||'deuda'}`,
      monto: monto,
      fecha: fechaHoy,
      tipo: 'unico',
      etiquetaTipo: 'Pago deuda',
      origenDeudaId: id,
      origen: 'amortizacion-deuda'
    };
    const gastos = [...(old.gastos||[]), nuevoGasto];
    return {...old, deudas, gastos};
  });
  cargarDatos(); renderDeudas(); actualizarResumen?.();
  if(quedoEnCero){
    setTimeout(()=>preguntarEliminarDeudaSaldada(id, nombreDeuda), 200);
  }
}


function preguntarEliminarDeudaSaldada(id, nombre){
  if(document.getElementById('modalSaldada')) document.getElementById('modalSaldada').remove();
  const safeNombre = (nombre||'Deuda').replace(/</g,'&lt;');
  const html = `
  <div id="modalSaldada" class="fixed inset-0 z-[80] flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-[6px]" onclick="cerrarModalSaldada()"></div>
    <div class="relative w-full max-w-[420px] bg-white rounded-[20px] border border-line shadow-[0_24px_64px_-12px_rgba(0,0,0,.35)] overflow-hidden animate-[in_.22s_ease]">
      <!-- HEADER estilo colaborar -->
      <div class="bg-ink px-5 py-4 flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-white grid place-items-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div class="leading-tight">
            <h3 class="text-[18px] font-semibold text-white tracking-tight">¡Deuda saldada! 💰</h3>
            <p class="text-[16px] text-white/70 mt-0.5">Tu deuda quedó en $ 0,00</p>
          </div>
        </div>
        <button onclick="cerrarModalSaldada()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 text-white grid place-items-center transition-colors shrink-0">✕</button>
      </div>

      <!-- BODY -->
      <div class="p-5">
        <p class="text-[16px] leading-[1.5] text-[#3A3A39]">La deuda <b class="text-ink font-semibold">${safeNombre}</b> está completamente paga. Ya figura como <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#2E7D32] text-[13px] mono font-medium ml-1">SALDADA</span></p>
        <p class="text-[11px] text-[#9A9A98] mt-2 leading-[1.4]">¿Querés eliminarla de la lista y mantener todo ordenado?</p>

        <div class="mt-5 rounded-[14px] bg-stone border border-line p-3 flex items-center gap-3">
          <div class="w-9 h-9 rounded-[10px] bg-white border border-line grid place-items-center font-bold text-[10px] text-ink">${safeNombre.slice(0,2).toUpperCase()}</div>
          <div class="flex-1 min-w-0">
            <p class="text-[12px] font-medium truncate">${safeNombre}</p>
            <p class="text-[10px] mono text-[#9A9A98]">Saldo: $ 0,00 • 100% pagado</p>
          </div>
          <div class="w-2 h-2 rounded-full bg-[#22C55E]"></div>
        </div>

        <div class="mt-5 grid grid-cols-2 gap-2">
          <button onclick="cerrarModalSaldada()" class="h-11 rounded-full bg-stone border border-line text-[13px] font-medium hover:bg-line transition-colors">Conservar</button>
          <button onclick="confirmarEliminarSaldada('${id}')" class="h-11 rounded-full bg-ink text-white text-[13px] font-medium hover:bg-[#1A1A1A] transition-colors flex items-center justify-center gap-1.5">
            <span>Sí, eliminar</span><span>→</span>
          </button>
        </div>
        <p class="text-[11px] mono text-[#9A9A98] text-center mt-3">Podés eliminarla después con el botón ✎ editar</p>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
function cerrarModalSaldada(){
  const el=document.getElementById('modalSaldada');
  if(el){ el.style.opacity='0'; el.style.transform='scale(.98)'; setTimeout(()=>el.remove(), 150); } 
}
function confirmarEliminarSaldada(id){
  const u=getUsuarioActual(); if(!u) return;
  updateUsuarioData(u.id, old=>({ ...old, deudas:(old.deudas||[]).filter(x=>String(x.id)!==String(id)) }));
  cerrarModalSaldada();
  setTimeout(()=>{ renderDeudas(); actualizarResumen?.(); }, 160);
}

function mostrarModalAhorroAviso(meta){
  const existente=document.getElementById('modalAhorroAviso'); if(existente) existente.remove();
  const safeNombre=(meta.nombre||'Meta').replace(/</g,'&lt;');
  const mensualFmt = fmt(meta.mensual||0);
  const objetivoFmt = fmt(meta.objetivo||0);
  const iniciales = safeNombre.slice(0,2).toUpperCase();
  const html = `
  <div id="modalAhorroAviso" class="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm grid place-items-center p-4 transition-all" style="opacity:0">
    <div class="w-full max-w-[420px] rounded-[24px] overflow-hidden bg-white shadow-[0_20px_60px_-12px_rgba(0,0,0,.4)] border border-line animate-[scaleIn_.2s_ease] transition-all" style="transform:scale(.98)">
      <!-- HEADER NEGRO IGUAL A DEUDA SALDADA -->
      <div class="bg-ink px-5 py-4 flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-white grid place-items-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div class="leading-tight">
            <h3 class="text-[18px] font-semibold text-white tracking-tight">¡Meta / Ahorro guardado! 💰</h3>
            <p class="text-[14px] text-white/70 mt-0.5">Ahorro automático activado</p>
          </div>
        </div>
        <button onclick="cerrarModalAhorroAviso()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 text-white grid place-items-center transition-colors shrink-0">✕</button>
      </div>

      <!-- BODY -->
      <div class="p-5">
        <p class="text-[14px] leading-[1.5] text-[#3A3A39]">El dinero informado en <b class="text-ink font-semibold">ahorro mensual (${mensualFmt})</b> se descontará del <b class="text-ink">saldo total disponible</b> cada vez que toques el boton <b class="text-ink">+Ahorrar</b></p>
        <p class="text-[11px] mono text-[#9A9A98] mt-2 leading-[1.4]">Saldo real libre = disponible - ahorro</p>

        <div class="mt-5 rounded-[14px] bg-stone border border-line p-3 flex items-center gap-3">
          <div class="w-9 h-9 rounded-[10px] bg-white border border-line grid place-items-center font-bold text-[10px] text-ink">${iniciales}</div>
          <div class="flex-1 min-w-0">
            <p class="text-[12px] font-medium truncate">${safeNombre}</p>
            <p class="text-[10px] mono text-[#9A9A98]">Ahorro: ${mensualFmt} / mes • Objetivo: ${objetivoFmt}</p>
          </div>
          <div class="w-2 h-2 rounded-full bg-[#22C55E]"></div>
        </div>

        <div class="mt-5 grid grid-cols-2 gap-2">
          <button onclick="cerrarModalAhorroAviso()" class="h-11 rounded-full bg-stone border border-line text-[13px] font-medium hover:bg-line transition-colors">Entendido</button>
          <button onclick="cerrarModalAhorroAviso()" class="h-11 rounded-full bg-ink text-white text-[13px] font-medium hover:bg-[#1A1A1A] transition-colors flex items-center justify-center gap-1.5">
            <span>Sí, activar</span><span>→</span>
          </button>
        </div>
        <p class="text-[10px] mono text-[#9A9A98] text-center mt-3">Podés modificarlo después con el botón ✎ editar</p>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  requestAnimationFrame(()=>{
    const el=document.getElementById('modalAhorroAviso');
    if(el){ el.style.opacity='1'; const card=el.querySelector('div > div'); if(card) card.style.transform='scale(1)'; }
  });
}
function cerrarModalAhorroAviso(){
  const el=document.getElementById('modalAhorroAviso');
  if(el){ el.style.opacity='0'; const card=el.querySelector('div > div'); if(card) card.style.transform='scale(.98)'; setTimeout(()=>el.remove(), 150); }
}

function mostrarModalMetaLograda(meta){
  const existente=document.getElementById('modalMetaLograda'); if(existente) existente.remove();
  const safeNombre=(meta.nombre||'Meta').replace(/</g,'&lt;');
  const objetivoFmt = fmt(meta.objetivo||0);
  const actualesFmt = fmt(meta.actual||0);
  const iniciales = safeNombre.slice(0,2).toUpperCase();
  const html = `
  <div id="modalMetaLograda" class="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm grid place-items-center p-4 transition-all" style="opacity:0">
    <div class="w-full max-w-[420px] rounded-[24px] overflow-hidden bg-white shadow-[0_20px_60px_-12px_rgba(0,0,0,.4)] border border-line animate-[scaleIn_.2s_ease] transition-all" style="transform:scale(.98)">
      <!-- HEADER NEGRO IGUAL A DEUDA SALDADA -->
      <div class="bg-ink px-5 py-4 flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-white grid place-items-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div class="leading-tight">
            <h3 class="text-[18px] font-semibold text-white tracking-tight">¡Meta lograda! 🎉</h3>
            <p class="text-[14px] text-white/70 mt-0.5">Llegaste a tu objetivo de ${objetivoFmt}</p>
          </div>
        </div>
        <button onclick="cerrarModalMetaLograda()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 text-white grid place-items-center transition-colors shrink-0">✕</button>
      </div>

      <!-- BODY -->
      <div class="p-5">
        <p class="text-[14px] leading-[1.5] text-[#3A3A39]">La meta <b class="text-ink font-semibold">${safeNombre}</b> alcanzó el 100%. Ya figura como <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#2E7D32] text-[11px] mono font-medium ml-1">LOGRADA</span></p>
        <p class="text-[11px] text-[#9A9A98] mt-2 leading-[1.4]">¿Querés conservarla o archivarla para mantener todo ordenado?</p>

        <div class="mt-5 rounded-[14px] bg-stone border border-line p-3 flex items-center gap-3">
          <div class="w-9 h-9 rounded-[10px] bg-white border border-line grid place-items-center font-bold text-[10px] text-ink">${iniciales}</div>
          <div class="flex-1 min-w-0">
            <p class="text-[12px] font-medium truncate">${safeNombre}</p>
            <p class="text-[10px] mono text-[#9A9A98]">Ahorrado: ${actualesFmt} • 100% completado</p>
          </div>
          <div class="w-2 h-2 rounded-full bg-[#22C55E]"></div>
        </div>

        <div class="mt-5 grid grid-cols-2 gap-2">
          <button onclick="cerrarModalMetaLograda()" class="h-11 rounded-full bg-stone border border-line text-[13px] font-medium hover:bg-line transition-colors">Conservar</button>
          <button onclick="cerrarModalMetaLograda(); if(confirm('¿Archivar meta lograda?')){ eliminarAhorroSinConfirm(); }" class="h-11 rounded-full bg-ink text-white text-[13px] font-medium hover:bg-[#1A1A1A] transition-colors flex items-center justify-center gap-1.5">
            <span>Sí, archivar</span><span>→</span>
          </button>
        </div>
        <p class="text-[10px] mono text-[#9A9A98] text-center mt-3">Podés eliminarla después con el botón 🗑️ eliminar meta</p>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  requestAnimationFrame(()=>{
    const el=document.getElementById('modalMetaLograda');
    if(el){ el.style.opacity='1'; const card=el.querySelector('div > div'); if(card) card.style.transform='scale(1)'; }
  });
}
function cerrarModalMetaLograda(){
  const el=document.getElementById('modalMetaLograda');
  if(el){ el.style.opacity='0'; const card=el.querySelector('div > div'); if(card) card.style.transform='scale(.98)'; setTimeout(()=>el.remove(), 150); }
}
function eliminarAhorroSinConfirm(){
  const u=getUsuarioActual(); if(!u) return;
  updateUsuarioData(u.id, old=>({ ...old, ahorro:null }));
  cerrarModalAhorro();
  actualizarResumen();
}




function esDeudaVencida(d){
  if((d.saldo||0)<=0) return false;
  const hoy=new Date();
  const dia=d.vencimientoDia||10;
  if(d.ultimoPagoFecha){
    const up=new Date(d.ultimoPagoFecha);
    if(up.getMonth()===hoy.getMonth() && up.getFullYear()===hoy.getFullYear()) return false;
  }
  if(d.pagos && d.pagos.length){
    const pagoEsteMes = d.pagos.some(p=>{
      const f=new Date(p.fecha);
      return f.getMonth()===hoy.getMonth() && f.getFullYear()===hoy.getFullYear();
    });
    if(pagoEsteMes) return false;
  }
  return hoy.getDate() > dia;
}
function getProximoVencimiento(deudas){
  const hoy=new Date();
  return deudas
    .filter(d=>(d.saldo||0)>0)
    .map(d=>{
      let y=hoy.getFullYear(), m=hoy.getMonth();
      let dia=Math.min(d.vencimientoDia||10, 28);
      let fecha=new Date(y,m,dia);
      if(fecha<hoy){ fecha=new Date(y,m+1,dia); }
      return { deuda:d, fecha };
    })
    .sort((a,b)=>a.fecha-b.fecha);
}

function renderDeudas(){
  const lista=document.getElementById('deudasLista');
  const empty=document.getElementById('deudasEmpty');
  const calLista=document.getElementById('deudasCalendarioLista');
  if(!lista) return;
  let deudas=getDeudasUsuario();

  // Filtro
  if(filtroDeudasActual!=='todas'){
    deudas=deudas.filter(d=>(d.acreedorTipo||'').toLowerCase()===filtroDeudasActual);
  }
  // Orden
  const orden=document.getElementById('deudasOrden')?.value||'vencimiento';
  if(orden==='saldo_desc') deudas=[...deudas].sort((a,b)=>(b.saldo||0)-(a.saldo||0));
  if(orden==='saldo_asc') deudas=[...deudas].sort((a,b)=>(a.saldo||0)-(b.saldo||0));
  if(orden==='vencimiento') deudas=[...deudas].sort((a,b)=>(a.vencimientoDia||10)-(b.vencimientoDia||10));

  // Resumen global usa TODAS (no filtradas) para total real
  const todas=getDeudasUsuario();
  const total=todas.reduce((s,d)=>s+(d.saldo||0),0);
  const cuotaMes=todas.filter(d=>(d.saldo||0)>0).reduce((s,d)=>s+(d.cuotaMensual||0),0);
  const prox=getProximoVencimiento(todas);

  document.getElementById('deudasTotal').textContent=fmt(total);
  document.getElementById('deudasTotalSub').textContent=`${todas.length} deuda${todas.length!==1?'s':''} • ${todas.filter(d=>(d.saldo||0)>0).length} activas`;
  document.getElementById('deudasCuotaMes').textContent=fmt(cuotaMes);
  const bar = document.getElementById('deudasProgressGlobal');
  const barText = document.getElementById('deudasProgressText');
  let porcentaje = 0;
  if(todas.length > 0){
    const saldadas = todas.filter(d => (d.saldo||0) <= 0).length;
    porcentaje = Math.round((saldadas / todas.length) * 100);
  } else {
    porcentaje = 0;
  }
  if(bar) bar.style.width = porcentaje + '%';
  if(barText) barText.textContent = porcentaje + '%';
  if(!barText){
    const oldSpan = bar?.parentElement?.previousElementSibling?.querySelector?.('span:last-child');
    if(oldSpan && bar) oldSpan.textContent = porcentaje + '%';
  }

  if(prox[0]){
    document.getElementById('deudasProxFecha').textContent=prox[0].fecha.toLocaleDateString('es-AR',{day:'2-digit',month:'short'});
    document.getElementById('deudasProxMonto').textContent=fmt(prox[0].deuda.cuotaMensual);
    document.getElementById('deudasProxAcreedor').textContent=prox[0].deuda.acreedorNombre;
  } else {
    document.getElementById('deudasProxFecha').textContent='—';
    document.getElementById('deudasProxMonto').textContent='—';
    document.getElementById('deudasProxAcreedor').textContent='Sin vencimientos';
  }

  // Badge si existe
  const badge=document.getElementById('deudasBadgeMobile');
  if(badge){ if(total>0){ badge.textContent=fmt(total).slice(0,12); badge.classList.remove('hidden'); } else badge.classList.add('hidden'); }

  if(deudas.length===0){ lista.innerHTML=''; empty.classList.remove('hidden'); }
  else {
    empty.classList.add('hidden');
    lista.innerHTML=deudas.map(d=>{
      const pctTotal=d.cuotasTotal?Math.round(((d.cuotasPagadas||0)/d.cuotasTotal)*100):0;
      const restante=(d.cuotasTotal||0)-(d.cuotasPagadas||0);
      const vencido = esDeudaVencida(d);
      const tipoColor = d.acreedorTipo==='mercado pago' ? 'bg-[#E0F2FF] text-[#009EE3]' : d.acreedorTipo==='amigo/familia' ? 'bg-[#E8F5E9] text-[#2E7D32]' : d.acreedorTipo==='tarjeta' ? 'bg-[#FFF3E0] text-[#E65100]' : 'bg-stone text-[#6B6B6A]';
      return `<div class="group flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-[16px] border ${vencido?'border-[#FECACA] bg-[#FFFBFB]':'border-line bg-white hover:border-ink/20'} transition-colors">
        <div class="flex items-start gap-3 min-w-0 flex-1">
          <div class="w-10 h-10 rounded-[12px] ${tipoColor} grid place-items-center shrink-0 font-bold text-[11px] uppercase">${(d.acreedorNombre||'?').slice(0,2)}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-[13px] font-medium truncate">${d.acreedorNombre}</p>
              <span class="text-[9px] mono px-1.5 py-0.5 rounded-full border border-line bg-stone uppercase">${d.acreedorTipo}</span>
              ${vencido?'<span class="text-[9px] mono px-1.5 py-0.5 rounded-full bg-[#FFE8E8] text-[#B91C1C]">VENCIDO</span>':''}
              ${(d.saldo||0)<=0?'<span class="text-[9px] mono px-1.5 py-0.5 rounded-full bg-[#E8F5E9] text-[#2E7D32]">SALDADA</span>':''}
            </div>
            <div class="mt-1 flex items-center gap-3 text-[11px] mono text-[#9A9A98]">
              <span>Saldo: <b class="text-ink">${fmt(d.saldo||0)}</b></span>
              <span class="hidden sm:inline">•</span>
              <span>Cuota: ${fmt(d.cuotaMensual||0)}</span>
              ${d.cuotasTotal?`<span>• ${d.cuotasPagadas||0}/${d.cuotasTotal} (${pctTotal}%)</span>`:''}
            </div>
            ${d.cuotasTotal?`<div class="mt-2 h-[4px] w-full bg-stone rounded-full overflow-hidden max-w-[240px]"><div class="h-full bg-ink" style="width:${pctTotal}%"></div></div>`:''}
            ${d.notas?`<p class="text-[11px] text-[#9A9A98] mt-1 truncate">${d.notas}</p>`:''}
          </div>
        </div>
        <div class="flex items-center gap-1.5 md:justify-end">
          <button onclick="agendarDeudaExistenteEnCalendar('${d.id}')" title="Agendar vencimiento en Google Calendar" class="w-8 h-8 rounded-full bg-white border border-line grid place-items-center hover:bg-stone hover:border-ink/20">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </button>
          <button onclick="pagarCuotaDeuda('${d.id}')" ${((d.saldo||0)<=0)?'disabled':''} class="h-8 px-3 rounded-full bg-ink text-white text-[11px] font-medium disabled:opacity-30 hover:bg-[#1A1A1A]">Pagar cuota</button>
          <button onclick="amortizarDeuda('${d.id}')" class="h-8 px-3 rounded-full bg-stone border border-line text-[11px] hover:bg-line">Amortizar</button>
          <button onclick="abrirFormDeuda('${d.id}')" class="w-8 h-8 rounded-full bg-white border border-line grid place-items-center hover:bg-stone" title="Editar">✎</button>
          <button onclick="eliminarDeuda('${d.id}')" class="w-8 h-8 rounded-full bg-[#FFF0F0] border border-[#FECACA] grid place-items-center hover:bg-[#FFE8E8] text-[#B91C1C] text-[12px]" title="Eliminar deuda">🗑</button>
        </div>
      </div>`;
    }).join('');
  }

  // Calendario
  if(calLista){
    if(prox.length===0) calLista.innerHTML='<p class="text-[11px] text-[#9A9A98] col-span-2">No hay vencimientos pendientes.</p>';
    else calLista.innerHTML=prox.slice(0,8).map(({deuda,fecha})=>{
      const diff=Math.ceil((fecha-new Date())/(1000*60*60*24));
      return `<div class="flex items-center justify-between p-3 rounded-[12px] bg-white border border-line">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-[10px] bg-stone grid place-items-center text-[11px] font-bold">${fecha.getDate()}</div>
          <div><p class="text-[12px] font-medium">${deuda.acreedorNombre}</p><p class="text-[10px] mono text-[#9A9A98]">Vence ${fecha.toLocaleDateString('es-AR')} • ${diff<=2?'¡en '+diff+' días!':''}</p></div>
        </div>
        <p class="text-[12px] mono font-medium">${fmt(deuda.cuotaMensual)}</p>
      </div>`;
    }).join('');
  }
}

// Integración con tu actualizarResumen existente - llama renderDeudas si existe modal abierto
const _origActualizarResumen = typeof actualizarResumen!=='undefined' ? actualizarResumen : null;
if(_origActualizarResumen){
  const original = _origActualizarResumen;
  window.actualizarResumen = function(){
    original();
    if(!document.getElementById('modalDeudas')?.classList.contains('hidden')) renderDeudas();
  }
}

// Cerrar con ESC
document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){
    if(!document.getElementById('formDeudaWrap')?.classList.contains('hidden')) cerrarFormDeuda();
    else if(!document.getElementById('modalDeudas')?.classList.contains('hidden')) cerrarModalDeudas();
  }
});