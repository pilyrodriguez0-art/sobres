/* Sobres · Ingresos, saldo del banco, Tarjetas, Resumen, informe y respaldo.
   Carga DESPUÉS de sobres.js y se engancha a APP. */
(function(A){
  "use strict";
  var $ = A.$, Q = A.Q, esc = A.esc, r2 = A.r2;
  function D(){ return A.datos(); }

  /* ================= SALDO DEL BANCO =================
     Parte del monto que escribiste y se actualiza con lo que registrás después:
     suma ingresos; resta gastos en efectivo, transferencia, débito u otro,
     aportes a ahorro y pagos de tarjeta. Las compras con tarjeta de crédito
     se restan recién cuando pagás la tarjeta. */
  function saldoBanco(){
    var d = D(), b = d.banco;
    if(!b){ return null; }
    var s = b.monto;
    d.ingresos.forEach(function(i){ if(i.creado > b.ts){ s += i.monto; } });
    d.gastos.forEach(function(g){
      if(g.creado > b.ts && !A.tarjetaDeMedio(g.medio) && (g.moneda || "Q") === "Q"){ s -= g.monto; }
    });
    d.pagos.forEach(function(p){
      var t = A.tarDe(p.tarjetaId);
      if(p.creado > b.ts && !(t && t.moneda === "$")){ s -= p.monto; }
    });
    return r2(s);
  }

  /* Aviso en Sobres al empezar cada mes. */
  A.pintarAvisos = function(){
    var d = D(), mes = A.mesDe(), h = "";
    if(A.catsVivas().length && d.bancoMes !== mes){
      var txt = d.banco ? "Empezó " + A.soloMes(mes) + ". ¿Cuánto tenés hoy en el banco?" : "¿Cuánto tenés hoy en el banco?";
      h = '<div class="banner"><span>' + txt + '</span><button type="button" id="irBanco">Escribirlo</button></div>';
    }
    $("avisos").innerHTML = h;
    if(h){ $("irBanco").addEventListener("click", function(){ editBanco = true; A.mostrarTab("ing"); enfocarBanco(); }); }
  };

  /* ================= INGRESOS ================= */
  var editBanco = false;
  var SUG_ING = ["Sueldo","Trabajo independiente","Ventas","Otros"];

  function enfocarBanco(){ var i = $("bancoInp"); if(i){ i.focus(); } }

  A.pintarIngresos = function(){
    var d = D(), mes = A.mesDe(), s = saldoBanco();
    $("ingMes").textContent = A.nombreMes(mes);
    var h = '<p class="subrotulo" style="margin-top:14px">¿CUÁNTO TENÉS HOY EN EL BANCO?</p>';
    if(s === null || editBanco){
      h += '<div class="saldoCampo"><span>Q</span><input type="number" id="bancoInp" inputmode="decimal" step="0.01" placeholder="0" value="' + (s === null ? "" : s) + '" aria-label="Saldo del banco"></div>' +
           '<p class="segunda">Escribí el saldo de tu cuenta hoy. Desde ahí se va actualizando con lo que registrás.</p>';
    }else{
      h += '<div class="bloque"><div class="ng' + (s < 0 ? ' alerta' : '') + '">' + Q(s) + '</div>' +
           '<div class="pe">Escribiste ' + Q(d.banco.monto) + ' el ' + A.diaCorto(d.banco.fecha) +
           ' · se fue actualizando con lo que registraste · <button type="button" class="enlace" id="actBanco">actualizar</button></div></div>';
    }
    $("bancoBox").innerHTML = h;
    var inp = $("bancoInp");
    if(inp){
      var hecho = false;
      inp.addEventListener("blur", function(){
        if(hecho){ return; }
        hecho = true;
        var v = A.numero(inp.value);
        if(!isNaN(v)){
          d.banco = {monto:r2(v), fecha:A.hoyISO(), ts:Date.now()};
          d.bancoMes = mes;
          A.guardar();
        }
        editBanco = false;
        A.pintarIngresos();
      });
      inp.addEventListener("keydown", function(e){ if(e.key === "Enter"){ inp.blur(); } });
    }else{
      $("actBanco").addEventListener("click", function(){ editBanco = true; A.pintarIngresos(); enfocarBanco(); });
    }

    var ings = d.ingresos.filter(function(i){ return A.mesDe(i.fecha) === mes; });
    var tot = r2(ings.reduce(function(t, i){ return t + i.monto; }, 0));
    var h2 = '<p class="subrotulo">INGRESOS DE ' + A.soloMes(mes).toUpperCase() + '</p>' +
             '<div class="bloque"><div class="ng">' + Q(tot) + '</div></div><div style="margin-top:10px">';
    d.fuentes.forEach(function(f){
      if(f.borrada){ return; }
      var l = ings.filter(function(i){ return i.fuenteId === f.id; });
      var t = r2(l.reduce(function(a, i){ return a + i.monto; }, 0));
      h2 += '<button type="button" class="fila" data-fuente="' + f.id + '"><div class="top"><span class="nom">' + esc(f.nombre) +
            '</span><span class="cifra val">' + Q(t) + '</span></div><div class="nota">' +
            (l.length ? l.length + (l.length === 1 ? " registro" : " registros") + " · tocá para agregar otro" : "sin registros este mes · tocá para agregar") +
            '</div></button>';
    });
    h2 += '<button type="button" class="agregar" id="nuevaFuente">+ Agregar fuente de ingreso</button></div>';
    $("ingBox").innerHTML = h2;
  };

  $("ingBox").addEventListener("click", function(e){
    var b = e.target.closest("[data-fuente]");
    if(b){ abrirIngreso(b.getAttribute("data-fuente")); return; }
    if(e.target.closest("#nuevaFuente")){ abrirFuente(); }
  });

  /* nueva fuente */
  var fu = null;
  function abrirFuente(){
    fu = {nombre:null, otro:false};
    $("fOtro").value = ""; $("fAviso").hidden = true;
    pintarFuente();
    A.abrir("hojaFuente");
  }
  function pintarFuente(){
    var ya = D().fuentes.filter(function(f){ return !f.borrada; }).map(function(f){ return A.norm(f.nombre); });
    var h = "";
    SUG_ING.forEach(function(n){
      if(ya.indexOf(A.norm(n)) >= 0){ return; }
      h += '<button type="button" data-fn="' + esc(n) + '" aria-pressed="' + (!fu.otro && fu.nombre === n) + '">' + esc(n) + '</button>';
    });
    h += '<button type="button" class="nueva" data-fn="__otro" aria-pressed="' + fu.otro + '">Otro…</button>';
    $("fNombres").innerHTML = h;
    $("fOtro").hidden = !fu.otro;
  }
  $("fNombres").addEventListener("click", function(e){
    var b = e.target.closest("[data-fn]");
    if(!b){ return; }
    var v = b.getAttribute("data-fn");
    if(v === "__otro"){ fu.otro = true; fu.nombre = null; pintarFuente(); $("fOtro").focus(); }
    else { fu.otro = false; fu.nombre = v; pintarFuente(); }
  });
  $("fGuardar").addEventListener("click", function(){
    var n = fu.otro ? $("fOtro").value.trim() : fu.nombre;
    var aviso = $("fAviso");
    if(!n){ aviso.textContent = "Elegí o escribí el nombre."; aviso.hidden = false; return; }
    if(D().fuentes.some(function(f){ return !f.borrada && A.norm(f.nombre) === A.norm(n); })){
      aviso.textContent = "Ya tenés una fuente con ese nombre."; aviso.hidden = false; return;
    }
    var f = {id:A.nid(), nombre:n};
    D().fuentes.push(f);
    A.guardar();
    ing = {fuenteId:f.id, id:null};
    cargarIng();
    A.reemplazar("hojaIng");
  });

  /* registrar / editar ingreso */
  var ing = null;
  function abrirIngreso(fid, iid){
    ing = {fuenteId:fid, id:iid || null};
    cargarIng();
    A.abrir("hojaIng");
  }
  A.abrirIngreso = abrirIngreso;
  function cargarIng(){
    var d = D(), f = A.porId(d.fuentes, ing.fuenteId), r = ing.id ? A.porId(d.ingresos, ing.id) : null;
    $("tIng").textContent = r ? "Editar ingreso · " + f.nombre : f.nombre;
    $("iMonto").value = r ? r.monto : "";
    $("iFecha").value = r ? r.fecha : A.hoyISO();
    A.rangoFecha($("iFecha"), r ? r.fecha : null);
    $("iNota").value = r ? (r.nota || "") : "";
    $("iGuardar").textContent = r ? "Guardar cambios" : "Guardar ingreso";
    $("iEliminar").hidden = !r;
    $("iAcc").hidden = !!r || !!f.borrada;
    var mes = A.mesDe(), h = "";
    d.ingresos.filter(function(i){ return i.fuenteId === f.id && A.mesDe(i.fecha) === mes; })
      .sort(function(a, b){ return a.fecha < b.fecha ? 1 : -1; })
      .forEach(function(i){
        h += '<button type="button" class="linea" data-ing="' + i.id + '"><span class="et">' + A.diaCorto(i.fecha) +
             (i.nota ? '<small>' + esc(i.nota) + '</small>' : '') + '</span><span class="ci">' + Q(i.monto) + '</span></button>';
      });
    $("iListaEt").hidden = !h || !!r;
    $("iLista").innerHTML = r ? "" : h;
  }
  $("iLista").addEventListener("click", function(e){
    var b = e.target.closest("[data-ing]");
    if(b){ ing.id = b.getAttribute("data-ing"); cargarIng(); $("hojaIng").scrollTop = 0; }
  });
  $("iGuardar").addEventListener("click", function(){
    var m = A.numero($("iMonto").value), f = $("iFecha").value;
    if(!(m > 0)){ $("iMonto").focus(); return; }
    if(!f || f > A.hoyISO()){ f = A.hoyISO(); }
    var d = D(), r = ing.id ? A.porId(d.ingresos, ing.id) : {id:A.nid(), fuenteId:ing.fuenteId, creado:Date.now()};
    r.monto = r2(m); r.fecha = f; r.nota = $("iNota").value.trim();
    if(!ing.id){ d.ingresos.push(r); }
    A.guardar();
    A.atras();
  });
  $("iEliminar").addEventListener("click", function(){
    if(!confirm("¿Eliminar este ingreso?")){ return; }
    var d = D();
    d.ingresos = d.ingresos.filter(function(i){ return i.id !== ing.id; });
    A.guardar();
    A.atras();
  });
  $("iRenombrar").addEventListener("click", function(){
    var f = A.porId(D().fuentes, ing.fuenteId);
    var n = prompt("Nuevo nombre de la fuente", f.nombre);
    if(n && n.trim()){ f.nombre = n.trim(); A.guardar(); cargarIng(); }
  });
  $("iBorrarFuente").addEventListener("click", function(){
    var f = A.porId(D().fuentes, ing.fuenteId);
    if(!confirm("¿Eliminar la fuente " + f.nombre + "? Sus ingresos anteriores se quedan en el historial.")){ return; }
    f.borrada = true;
    A.guardar();
    A.atras();
  });
  A.alVolver.hojaIng = function(){ if(ing){ if(ing.id && !A.porId(D().ingresos, ing.id)){ ing.id = null; } cargarIng(); } };

  /* ================= TARJETAS ================= */

  /* Qué pago mostrar: si el último corte ya cerró, tiene compras, todavía no
     vence y no registraste un pago después del corte, se muestra ese.
     Si no, se muestra lo que va juntando el corte abierto. */
  function porcionesTarjeta(t){
    return A.todasPorciones().filter(function(p){ return p.g.medio === "t:" + t.id; });
  }
  function estado(t){
    var hoy = A.hoyISO(), abierto = A.corteDe(t, hoy), cerrado = A.corteMas(t, abierto, -1);
    var pc = porcionesTarjeta(t);
    function total(c){ var k = A.aISO(c); return r2(pc.reduce(function(a, p){ return a + (p.corte === k ? p.monto : 0); }, 0)); }
    var tc = total(cerrado), pagoC = A.pagoDe(t, cerrado);
    /* Pagos hechos después del último corte: primero cubren ese corte;
       lo que sobra (si pagaste antes de tiempo) se descuenta del corte abierto. */
    var pagado = r2(D().pagos.reduce(function(a, p){
      return a + (p.tarjetaId === t.id && p.fecha > A.aISO(cerrado) ? p.monto : 0);
    }, 0));
    var r = {abierto:abierto, pagoAbierto:A.pagoDe(t, abierto), desde:A.diaDespues(cerrado)};
    if(tc > 0 && pagado < tc && A.aISO(pagoC) >= hoy){ r.corte = cerrado; r.pago = pagoC; r.total = r2(tc - pagado); }
    else { r.corte = abierto; r.pago = r.pagoAbierto; r.bruto = total(abierto); r.total = Math.max(0, r2(r.bruto - Math.max(0, pagado - tc))); }
    return r;
  }
  function ultimoPago(t){
    var l = D().pagos.filter(function(p){ return p.tarjetaId === t.id; }).sort(function(a, b){ return a.fecha < b.fecha ? 1 : -1; });
    return l[0] || null;
  }
  function colorT(t){ return (A.COLORES[t.color] || A.COLORES[7]).bg; }

  /* Bloque "Tarjetas de crédito" al final de Sobres. No se suma al gasto. */
  A.bloqueTarjetas = function(){
    var ts = A.tarjetasVivas();
    if(!ts.length){ return ""; }
    var h = '<div class="seccionT"><h3>Tarjetas de crédito</h3><div class="pe">No se suma al gasto: las compras ya están en sus categorías.</div></div><div class="contenido">';
    ts.forEach(function(t){
      var e = estado(t), up = ultimoPago(t), nota = "", val;
      if(e.total > 0){
        val = A.dinero(e.total, t.moneda);
        nota = "Según tus registros · vence el " + A.diaLargo(A.aISO(e.pago)) + " · tocá para pagar";
      }else{
        val = A.dinero(0, t.moneda);
        nota = (e.bruto > 0 ? "Nada pendiente para el " + A.diaLargo(A.aISO(e.pago)) : "Sin compras por pagar") + " · tocá para registrar un pago";
      }
      if(up && up.fecha >= A.aISO(A.corteMas(t, e.abierto, -1))){
        nota = "Pagaste " + A.dinero(up.monto, t.moneda) + " el " + A.diaCorto(up.fecha) + " · " + nota;
      }
      h += '<button type="button" class="fila filaT" data-pagar="' + t.id + '"><div class="top"><span class="nom"><i class="punto" style="background:' +
           colorT(t) + '"></i>' + esc(t.nombre) + '</span><span class="cifra val">' + val + '</span></div><div class="nota">' + nota + '</div></button>';
    });
    return h + '</div>';
  };

  A.pintarTarjetas = function(){
    var ts = A.tarjetasVivas(), h = "";
    ts.forEach(function(t){ h += '<button type="button" class="elige" data-tar="' + t.id + '" aria-label="' + esc(t.nombre) + '">' + A.tarjetaHTML(t) + '</button>'; });
    h += '<button type="button" class="tarMas" id="nuevaTar" aria-label="Agregar tarjeta">+</button>';
    $("listaTar").innerHTML = h;
    $("tarAyuda").textContent = ts.length ? "Tocá una tarjeta para ver sus gastos y fechas de pago." : "Tocá + para agregar tu primera tarjeta de crédito.";
  };
  $("listaTar").addEventListener("click", function(e){
    var b = e.target.closest("[data-tar]");
    if(b){ abrirSeccion(b.getAttribute("data-tar")); return; }
    if(e.target.closest("#nuevaTar")){ abrirCfg(null); }
  });

  /* sección de una tarjeta */
  var tarSel = null;
  function abrirSeccion(id){ tarSel = id; pintarSeccion(); A.abrir("hojaTar"); }
  function pintarSeccion(){
    var t = A.tarDe(tarSel), e = estado(t), mon = t.moneda, hoy = A.hoyISO();
    $("tTar").textContent = t.nombre;
    var h = '<div class="prev">' + A.tarjetaHTML(t) + '</div>';
    h += '<p class="explica">Lo que compres del <b>' + A.diaLargo(A.aISO(e.desde)) + ' al ' + A.diaLargo(A.aISO(e.abierto)) +
         '</b> se paga el <b>' + A.diaLargo(A.aISO(e.pagoAbierto)) + '</b>.</p>';
    h += '<p class="subrotulo">TOTAL A PAGAR</p><div class="bloque"><span class="ng">' + A.dinero(e.total, mon) + '</span>' +
         (t.limite > 0 ? ' <span class="deLim">de ' + A.dinero(t.limite, mon) + ' de límite</span>' : '') + '</div>';
    if(t.limite > 0){
      var pct = Math.min(100, e.total / t.limite * 100);
      h += '<div class="limBar' + (e.total > t.limite ? ' pasado' : '') + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
    }
    h += '<div class="pe">' + (e.total > 0 ? 'vence el ' + A.diaLargo(A.aISO(e.pago)) : (e.bruto > 0 ? 'Ya cubriste el pago del ' : 'Todavía no hay compras para el pago del ') + A.diaLargo(A.aISO(e.pago))) + '</div>';
    var up = ultimoPago(t);
    if(up){ h += '<div class="pe">Último pago: ' + A.dinero(up.monto, mon) + ' el ' + A.diaCorto(up.fecha) + '</div>'; }
    h += '<button type="button" class="principal" id="secPagar">Registrar pago</button>';
    var lista = porcionesTarjeta(t).filter(function(p){ return p.pago >= hoy; })
      .sort(function(a, b){ return a.pago === b.pago ? (a.g.fecha < b.g.fecha ? 1 : -1) : (a.pago < b.pago ? -1 : 1); });
    h += '<p class="subrotulo">GASTOS CON ESTA TARJETA</p>';
    if(!lista.length){ h += '<p class="segunda">Todavía no hay gastos pendientes de pago con esta tarjeta.</p>'; }
    lista.forEach(function(p){
      var s = A.subDe(p.g.subId);
      h += '<button type="button" class="linea" data-gasto="' + p.g.id + '"><span class="et">' + esc(s ? s.nombre : "") +
           (p.n > 1 ? ' · cuota ' + p.i + ' de ' + p.n : '') + '<small>comprado el ' + A.diaCorto(p.g.fecha) + ' · se paga el ' + A.diaCorto(p.pago) +
           '</small></span><span class="ci">' + A.dinero(p.monto, mon) + '</span></button>';
    });
    $("tarCont").innerHTML = h;
  }
  $("tarCont").addEventListener("click", function(e){
    var b = e.target.closest("[data-gasto]");
    if(b){ A.abrirRegistro({gastoId:b.getAttribute("data-gasto")}); return; }
    if(e.target.closest("#secPagar")){ abrirPago(tarSel); }
  });
  $("tarEditar").addEventListener("click", function(){ abrirCfg(tarSel); });
  A.alVolver.hojaTar = function(){ var t = A.tarDe(tarSel); if(t && !t.borrada){ pintarSeccion(); } };

  /* configurar tarjeta */
  var cfg = null;
  function abrirCfg(id){
    var t = id ? A.tarDe(id) : null;
    cfg = {id:id, red:t ? t.red : "Visa", color:t ? t.color : 0, moneda:t ? t.moneda : "Q"};
    $("tCfg").textContent = t ? "Editar tarjeta" : "Nueva tarjeta";
    $("cfgNombre").value = t ? t.nombre : "";
    $("cfgLimite").value = t && t.limite ? t.limite : "";
    $("cfgCorte").value = t ? t.corte : "";
    $("cfgPago").value = t ? t.pago : "";
    $("cfgEliminar").hidden = !t;
    $("cfgAviso").hidden = true;
    var h = "";
    A.COLORES.forEach(function(c, i){ h += '<button type="button" data-c="' + i + '" aria-label="' + c.n + '" style="background:' + c.bg + '"></button>'; });
    $("cfgColor").innerHTML = h;
    pintarCfg();
    A.abrir("hojaCfg");
  }
  function pintarCfg(){
    function marca(cont, v){
      Array.prototype.forEach.call($(cont).children, function(b){
        b.setAttribute("aria-pressed", String(b.getAttribute("data-v") || b.getAttribute("data-c")) === String(v) ? "true" : "false");
      });
    }
    marca("cfgRed", cfg.red); marca("cfgColor", cfg.color); marca("cfgMoneda", cfg.moneda);
    var tmp = {nombre:$("cfgNombre").value.trim() || "Tu tarjeta", red:cfg.red, color:cfg.color, moneda:cfg.moneda};
    $("cfgPrev").innerHTML = A.tarjetaHTML(tmp);
    var c = parseInt($("cfgCorte").value, 10), p = parseInt($("cfgPago").value, 10), ex = $("cfgExplica");
    if(c >= 1 && c <= 31 && p >= 1 && p <= 31){
      var t2 = {corte:c, pago:p}, ab = A.corteDe(t2, A.hoyISO()), ce = A.corteMas(t2, ab, -1);
      ex.innerHTML = "Con estas fechas, lo que compres del <b>" + A.diaLargo(A.aISO(A.diaDespues(ce))) + " al " + A.diaLargo(A.aISO(ab)) +
                     "</b> se paga el <b>" + A.diaLargo(A.aISO(A.pagoDe(t2, ab))) + "</b>.";
      ex.hidden = false;
    }else{ ex.hidden = true; }
  }
  [["cfgRed","red"],["cfgMoneda","moneda"]].forEach(function(x){
    $(x[0]).addEventListener("click", function(e){
      var b = e.target.closest("[data-v]");
      if(b){ cfg[x[1]] = b.getAttribute("data-v"); pintarCfg(); }
    });
  });
  $("cfgColor").addEventListener("click", function(e){
    var b = e.target.closest("[data-c]");
    if(b){ cfg.color = +b.getAttribute("data-c"); pintarCfg(); }
  });
  ["cfgNombre","cfgCorte","cfgPago"].forEach(function(id){ $(id).addEventListener("input", pintarCfg); });
  $("cfgGuardar").addEventListener("click", function(){
    var n = $("cfgNombre").value.trim(), c = parseInt($("cfgCorte").value, 10), p = parseInt($("cfgPago").value, 10);
    var lim = A.numero($("cfgLimite").value), av = $("cfgAviso");
    function falla(t){ av.textContent = t; av.hidden = false; }
    if(!n){ falla("Escribí el nombre de la tarjeta."); return; }
    if(!(c >= 1 && c <= 31)){ falla("Escribí el día de corte (1 a 31)."); return; }
    if(!(p >= 1 && p <= 31)){ falla("Escribí el día de pago (1 a 31)."); return; }
    var d = D(), t = cfg.id ? A.tarDe(cfg.id) : {id:A.nid()};
    t.nombre = n; t.red = cfg.red; t.color = cfg.color; t.moneda = cfg.moneda;
    t.limite = lim > 0 ? r2(lim) : 0; t.corte = c; t.pago = p;
    if(!cfg.id){ d.tarjetas.push(t); }
    A.guardar();
    A.atras();
  });
  $("cfgEliminar").addEventListener("click", function(){
    var t = A.tarDe(cfg.id);
    if(!confirm("¿Eliminar la tarjeta " + t.nombre + "? Sus gastos se quedan en el historial.")){ return; }
    t.borrada = true;
    A.guardar();
    A.cerrarTodo();
  });

  /* pago de tarjeta */
  var pagoT = null;
  function abrirPago(id){ pagoT = id; pintarPago(); $("pgMonto").value = ""; $("pgFecha").value = A.hoyISO(); A.rangoFecha($("pgFecha")); A.abrir("hojaPago"); }
  A.abrirPago = abrirPago;
  function pintarPago(){
    var t = A.tarDe(pagoT), e = estado(t);
    $("tPago").textContent = "Pago · " + t.nombre;
    $("pgPrev").innerHTML = A.tarjetaHTML(t);
    $("pgMonto").placeholder = t.moneda === "$" ? "$" : "Q";
    $("pgRef").textContent = e.total > 0
      ? "Según tus registros: " + A.dinero(e.total, t.moneda) + " · vence el " + A.diaLargo(A.aISO(e.pago))
      : (e.bruto > 0 ? "Ya cubriste el pago del " + A.diaLargo(A.aISO(e.pago)) + "." : "Todavía no hay compras registradas para el próximo pago.");
    var h = "";
    D().pagos.filter(function(p){ return p.tarjetaId === t.id; })
      .sort(function(a, b){ return a.fecha < b.fecha ? 1 : -1; })
      .forEach(function(p){
        h += '<button type="button" class="linea" data-pg="' + p.id + '"><span class="et">Pagado el ' + A.diaCorto(p.fecha) +
             '<small>tocá para eliminarlo</small></span><span class="ci">' + A.dinero(p.monto, t.moneda) + '</span></button>';
      });
    $("pgListaEt").hidden = !h;
    $("pgLista").innerHTML = h;
  }
  $("pgGuardar").addEventListener("click", function(){
    var m = A.numero($("pgMonto").value), f = $("pgFecha").value;
    if(!(m > 0)){ $("pgMonto").focus(); return; }
    if(!f || f > A.hoyISO()){ f = A.hoyISO(); }
    D().pagos.push({id:A.nid(), tarjetaId:pagoT, monto:r2(m), fecha:f, creado:Date.now()});
    A.guardar();
    A.atras();
  });
  $("pgLista").addEventListener("click", function(e){
    var b = e.target.closest("[data-pg]");
    if(!b){ return; }
    var d = D(), p = A.porId(d.pagos, b.getAttribute("data-pg"));
    if(!confirm("¿Eliminar el pago de " + A.dinero(p.monto, (A.tarDe(p.tarjetaId) || {}).moneda) + " del " + A.diaCorto(p.fecha) + "?")){ return; }
    d.pagos = d.pagos.filter(function(x){ return x.id !== p.id; });
    A.guardar();
    pintarPago();
  });

  /* ================= RESUMEN ================= */
  var resMes = null;
  var COL_BARRAS = ["#5C4A33","#8C6F4E","#9A8A76","#6E7A5A","#7A5C6E","#4F6A7A","#A08050","#6B5B4B","#7D6A55"];

  function mesesConDatos(){
    var d = D(), hoy = A.mesDe(), min = hoy, max = hoy;
    A.todasPorciones().forEach(function(p){ if(p.mes < min){ min = p.mes; } if(p.mes > max){ max = p.mes; } });
    d.ingresos.forEach(function(i){ var m = A.mesDe(i.fecha); if(m < min){ min = m; } });
    var out = [], k = max, g = 0;
    while(k >= min && g++ < 240){ out.push(k); k = A.mesPrevio(k); }
    return out;
  }

  A.pintarResumen = function(){
    cargarXLSX();
    if(!resMes){ resMes = A.mesDe(); }
    var sel = $("resMes"), h = "";
    mesesConDatos().forEach(function(k){ h += '<option value="' + k + '"' + (k === resMes ? ' selected' : '') + '>' + A.nombreMes(k) + '</option>'; });
    sel.innerHTML = h;
    var ps = A.porcionesMes(resMes), total = 0, dol = 0;
    ps.forEach(function(p){ if(p.moneda === "$"){ dol += p.monto; } else { total += p.monto; } });
    total = r2(total);
    $("resTotal").textContent = Q(total);
    $("resDolar").textContent = dol > 0 ? "y " + A.dinero(dol, "$") + " en tarjetas en dólares" : "";

    var d = D(), cols = [];
    d.categorias.forEach(function(c, i){
      var g = A.gastadoCat(c.id, resMes);
      if(g <= 0){ return; }
      var p = A.presuCat(c.id, resMes);
      cols.push({c:c, g:g, pct:total ? g / total * 100 : 0, over:c.tipo !== "ahorro" && p > 0 && g > p, color:COL_BARRAS[i % COL_BARRAS.length]});
    });
    if(!cols.length){ $("grafica").innerHTML = '<p class="segunda" style="text-align:center;padding:30px 0">Todavía no hay gastos en ' + A.soloMes(resMes) + '.</p>'; return; }
    var max = Math.max.apply(null, cols.map(function(x){ return x.pct; }));
    var b = '<div class="graf">', e = '<div class="etqs">';
    cols.forEach(function(x){
      var alto = Math.max(22, Math.round(x.pct / max * 170));
      b += '<button type="button" class="col" data-barra="' + x.c.id + '" aria-label="' + esc(x.c.nombre) + ' ' + Math.round(x.pct) + ' por ciento">' +
           (x.over ? '<span class="warn" title="Pasó el presupuesto">⚠</span>' : '') +
           '<span class="bar" style="height:' + alto + 'px;background:' + (x.over ? 'var(--alerta)' : x.color) + '">' + Math.round(x.pct) + '%</span></button>';
      e += '<span>' + esc(x.c.nombre) + '</span>';
    });
    $("grafica").innerHTML = b + '</div>' + e + '</div><p class="segunda" style="text-align:center;font-size:12px">Tocá una barra para ver sus gastos' +
      (cols.some(function(x){ return x.over; }) ? ' · ⚠ pasó el presupuesto' : '') + '</p>';
  };
  $("resMes").addEventListener("change", function(){ resMes = this.value; A.pintarResumen(); });
  $("grafica").addEventListener("click", function(e){
    var b = e.target.closest("[data-barra]");
    if(b){ abrirLista({tipo:"cat", catId:b.getAttribute("data-barra"), mes:resMes}); }
  });

  /* lista: gastos de una categoría o todos los movimientos */
  var lista = null;
  function abrirLista(o){ lista = o; pintarLista(); A.abrir("hojaLista"); }
  function lineaGasto(p){
    var s = A.subDe(p.g.subId), c = s ? A.catDe(s.catId) : null;
    var nombre = (lista.tipo === "mov" && c ? c.nombre + " · " : "") + (s ? s.nombre : "");
    var det = A.diaCorto(p.g.fecha) + " · " + A.nombreMedio(p.g.medio) + (p.n > 1 ? " · cuota " + p.i + " de " + p.n : "") + (p.g.nota ? " · " + p.g.nota : "");
    return '<button type="button" class="linea" data-lg="' + p.g.id + '"><span class="et">' + esc(nombre) + '<small>' + esc(det) +
           '</small></span><span class="ci">' + A.dinero(p.monto, p.moneda) + '</span></button>';
  }
  function clave(p){ return p.i > 1 ? p.mes + "-01" : p.g.fecha; }
  function pintarLista(){
    var d = D(), mes = lista.mes, h = "", items = [];
    if(lista.tipo === "cat"){
      var c = A.catDe(lista.catId);
      $("tLista").textContent = c.nombre + " · " + A.soloMes(mes);
      A.porcionesMes(mes).forEach(function(p){
        var s = A.subDe(p.g.subId);
        if(s && s.catId === c.id){ items.push({f:clave(p), h:lineaGasto(p)}); }
      });
    }else{
      $("tLista").textContent = "Movimientos · " + A.soloMes(mes);
      A.porcionesMes(mes).forEach(function(p){ items.push({f:clave(p), h:lineaGasto(p)}); });
      d.ingresos.forEach(function(i){
        if(A.mesDe(i.fecha) !== mes){ return; }
        var f = A.porId(d.fuentes, i.fuenteId);
        items.push({f:i.fecha, h:'<button type="button" class="linea" data-li="' + i.id + '"><span class="et">Ingreso · ' + esc(f ? f.nombre : "") +
          '<small>' + A.diaCorto(i.fecha) + (i.nota ? ' · ' + esc(i.nota) : '') + '</small></span><span class="ci">+' + Q(i.monto) + '</span></button>'});
      });
      d.pagos.forEach(function(p){
        if(A.mesDe(p.fecha) !== mes){ return; }
        var t = A.tarDe(p.tarjetaId);
        items.push({f:p.fecha, h:'<button type="button" class="linea" data-lp="' + p.tarjetaId + '"><span class="et">Pago de tarjeta · ' + esc(t ? t.nombre : "") +
          '<small>' + A.diaCorto(p.fecha) + ' · no se suma al gasto</small></span><span class="ci">' + A.dinero(p.monto, t ? t.moneda : "Q") + '</span></button>'});
      });
    }
    items.sort(function(a, b){ return a.f < b.f ? 1 : (a.f > b.f ? -1 : 0); });
    items.forEach(function(x){ h += x.h; });
    $("listaCont").innerHTML = (h || '<p class="segunda">No hay movimientos en este mes.</p>') +
      (h ? '<p class="segunda" style="font-size:13px">Tocá un registro para editarlo.</p>' : '');
  }
  $("listaCont").addEventListener("click", function(e){
    var b;
    if((b = e.target.closest("[data-lg]"))){ A.abrirRegistro({gastoId:b.getAttribute("data-lg")}); return; }
    if((b = e.target.closest("[data-li]"))){
      var i = A.porId(D().ingresos, b.getAttribute("data-li"));
      abrirIngreso(i.fuenteId, i.id); return;
    }
    if((b = e.target.closest("[data-lp]"))){ var t = A.tarDe(b.getAttribute("data-lp")); if(t){ abrirPago(t.id); } }
  });
  A.alVolver.hojaLista = function(){ if(lista){ pintarLista(); } };
  A.alVolver.hojaPago = function(){ if(pagoT){ pintarPago(); } };
  $("btnMov").addEventListener("click", function(){ abrirLista({tipo:"mov", mes:resMes || A.mesDe()}); });

  /* ================= ARCHIVOS: compartir ================= */
  function compartir(blob, nombre){
    var file = null;
    try{ file = new File([blob], nombre, {type:blob.type}); }catch(e){}
    if(file && navigator.canShare && navigator.canShare({files:[file]})){
      navigator.share({files:[file]}).catch(function(){});
      return;
    }
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }
  function fechaArchivo(){
    var d = new Date(), M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    return d.getDate() + "-" + M[d.getMonth()] + "-" + d.getFullYear();
  }

  /* ================= INFORME MENSUAL (Excel) ================= */
  var cargandoXLSX = false;
  function cargarXLSX(){
    if(window.XLSX || cargandoXLSX){ return; }
    cargandoXLSX = true;
    var s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onerror = function(){ cargandoXLSX = false; s.remove(); };
    document.head.appendChild(s);
  }
  var FQ = '"Q"#,##0.00', FD = '"$"#,##0.00';
  function num(v, f){ return {t:"n", v:r2(v), z:f || FQ}; }
  function fx(iso){ return iso.slice(8,10) + "/" + iso.slice(5,7) + "/" + iso.slice(0,4); }

  function hojaResumen(mes){
    var d = D(), rows = [], ps = A.porcionesMes(mes);
    var total = 0, dol = 0;
    ps.forEach(function(p){ if(p.moneda === "$"){ dol += p.monto; } else { total += p.monto; } });
    var ings = d.ingresos.filter(function(i){ return A.mesDe(i.fecha) === mes; });
    var ti = ings.reduce(function(t, i){ return t + i.monto; }, 0);
    rows.push(["Informe mensual · " + A.nombreMes(mes)]);
    rows.push([]);
    rows.push(["Total gastado", num(total)]);
    if(dol > 0){ rows.push(["Gastado en dólares", num(dol, FD)]); }
    rows.push(["Total de ingresos", num(ti)]);
    rows.push([]);
    rows.push(["INGRESOS POR FUENTE"]);
    rows.push(["Fuente", "Monto"]);
    d.fuentes.forEach(function(f){
      var t = ings.filter(function(i){ return i.fuenteId === f.id; }).reduce(function(a, i){ return a + i.monto; }, 0);
      if(t > 0 || !f.borrada){ rows.push([f.nombre, num(t)]); }
    });
    rows.push([]);
    rows.push(["CATEGORÍAS"]);
    rows.push(["Categoría", "Presupuestado", "Gastado", "Diferencia"]);
    d.categorias.forEach(function(c){
      var g = A.gastadoCat(c.id, mes), p = A.presuCat(c.id, mes);
      if(c.borrada && g <= 0){ return; }
      rows.push([c.nombre, num(p), num(g), num(p - g)]);
    });
    var ahorro = d.subs.filter(function(s){ var c = A.catDe(s.catId); return c && c.tipo === "ahorro" && (!s.borrada || A.gastadoSub(s.id, mes) > 0); });
    if(ahorro.length){
      rows.push([]);
      rows.push(["AHORRO"]);
      rows.push(["Subcategoría", "Aporte del mes", "Acumulado", "Meta", "Falta"]);
      ahorro.forEach(function(s){
        var acum = A.juntadoTotal(s.id);
        rows.push([s.nombre, num(A.gastadoSub(s.id, mes)), num(acum), s.meta > 0 ? num(s.meta) : "", s.meta > 0 ? num(Math.max(0, s.meta - acum)) : ""]);
      });
    }
    rows.push([]);
    rows.push(["POR FORMA DE PAGO"]);
    rows.push(["Forma de pago", "Monto"]);
    var fp = {}, orden = [];
    ps.forEach(function(p){
      var k = A.nombreMedio(p.g.medio) + (p.moneda === "$" ? " ($)" : "");
      if(!(k in fp)){ fp[k] = {v:0, m:p.moneda}; orden.push(k); }
      fp[k].v += p.monto;
    });
    orden.forEach(function(k){ rows.push([k, num(fp[k].v, fp[k].m === "$" ? FD : FQ)]); });
    return rows;
  }
  function hojaMovimientos(mes){
    var d = D(), items = [];
    A.porcionesMes(mes).forEach(function(p){
      var s = A.subDe(p.g.subId), c = s ? A.catDe(s.catId) : null;
      items.push({f:p.i > 1 ? p.mes + "-01" : p.g.fecha, r:[fx(p.g.fecha), c && c.tipo === "ahorro" ? "Ahorro" : "Gasto", c ? c.nombre : "", s ? s.nombre : "",
        num(p.monto, p.moneda === "$" ? FD : FQ), A.nombreMedio(p.g.medio), [p.n > 1 ? "Cuota " + p.i + " de " + p.n : "", p.g.nota || ""].filter(Boolean).join(" · ")]});
    });
    d.ingresos.forEach(function(i){
      if(A.mesDe(i.fecha) !== mes){ return; }
      var f = A.porId(d.fuentes, i.fuenteId);
      items.push({f:i.fecha, r:[fx(i.fecha), "Ingreso", "Ingresos", f ? f.nombre : "", num(i.monto), "", i.nota || ""]});
    });
    d.pagos.forEach(function(p){
      if(A.mesDe(p.fecha) !== mes){ return; }
      var t = A.tarDe(p.tarjetaId);
      items.push({f:p.fecha, r:[fx(p.fecha), "Pago de tarjeta", "Tarjetas de crédito", t ? t.nombre : "", num(p.monto, t && t.moneda === "$" ? FD : FQ), "", "No se suma al gasto"]});
    });
    items.sort(function(a, b){ return a.f < b.f ? -1 : (a.f > b.f ? 1 : 0); });
    return [["Fecha", "Tipo", "Categoría", "Subcategoría", "Monto", "Forma de pago", "Detalle"]].concat(items.map(function(x){ return x.r; }));
  }
  $("btnInforme").addEventListener("click", function(){
    if(!window.XLSX){
      cargarXLSX();
      alert("Estoy preparando el informe. Revisá que tengás internet y tocá otra vez en unos segundos.");
      return;
    }
    var mes = resMes || A.mesDe(), X = window.XLSX, wb = X.utils.book_new();
    var h1 = X.utils.aoa_to_sheet(hojaResumen(mes));
    h1["!cols"] = [{wch:28}, {wch:16}, {wch:14}, {wch:14}, {wch:14}];
    var h2 = X.utils.aoa_to_sheet(hojaMovimientos(mes));
    h2["!cols"] = [{wch:12}, {wch:16}, {wch:20}, {wch:24}, {wch:12}, {wch:18}, {wch:22}];
    X.utils.book_append_sheet(wb, h1, "Resumen del mes");
    X.utils.book_append_sheet(wb, h2, "Movimientos");
    var buf = X.write(wb, {type:"array", bookType:"xlsx"});
    var blob = new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    compartir(blob, "sobres-informe-" + A.soloMes(mes) + "-" + mes.slice(0,4) + ".xlsx");
  });

  /* ================= RESPALDO ================= */
  $("btnGuardarResp").addEventListener("click", function(){
    var d = D();
    d.respaldoDel = A.hoyISO();
    var blob = new Blob([JSON.stringify(d)], {type:"application/json"});
    compartir(blob, "sobres-respaldo-" + fechaArchivo() + ".json");
  });
  $("btnRestaurar").addEventListener("click", function(){ $("archivoResp").value = ""; $("archivoResp").click(); });
  $("archivoResp").addEventListener("change", function(){
    var f = this.files && this.files[0];
    if(!f){ return; }
    var lector = new FileReader();
    lector.onload = function(){
      var o = null;
      try{ o = JSON.parse(lector.result); }catch(e){}
      if(!o || o.v !== 3 || !Array.isArray(o.gastos) || !Array.isArray(o.categorias)){
        alert("Ese archivo no es un respaldo de Sobres.");
        return;
      }
      var cuando = o.respaldoDel ? " del " + A.fechaCompleta(o.respaldoDel) : "";
      if(!confirm("¿Restaurar el respaldo" + cuando + "? Reemplaza todo lo que hay ahora en la app.")){ return; }
      A.reemplazarDatos(o);
      resMes = null;
      alert("Listo, se restauró el respaldo.");
      A.mostrarTab("sobres");
    };
    lector.readAsText(f);
  });

  A.saldoBanco = saldoBanco;
  A.estadoTarjeta = estado;
})(APP);
