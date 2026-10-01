/* Sobres · ingresos, caja y tarjetas. Debe cargar DESPUÉS de sobres.js. */
(function(){
  "use strict";
  if(typeof APP === "undefined"){ return; }

  var $ = APP.$, Q = APP.Q, nid = APP.nid;
  var mesDe = APP.mesDe, mesSiguiente = APP.mesSiguiente;
  var nombreMes = APP.nombreMes, soloMes = APP.soloMes, diaLargo = APP.diaLargo;
  function D(){ return APP.datosRef(); }
  function hoyISO(){ return APP.aISO(new Date()); }

  function inicioRegistro(){
    var p = (D().inicioRegistro || hoyISO()).split("-");
    return new Date(+p[0], +p[1]-1, +p[2]);
  }
  function diaMes(f){ return f ? f.toLocaleDateString("es-GT",{day:"numeric",month:"short"}) : ""; }

  /* ---------- ciclos de tarjeta ---------- */
  function fechaCorte(t, ref){
    if(!t.corte) return null;
    var f = new Date(ref.getFullYear(), ref.getMonth(), t.corte);
    if(ref.getDate() > t.corte){ f = new Date(ref.getFullYear(), ref.getMonth()+1, t.corte); }
    return f;
  }
  function cortePrevio(t, corteF){ return new Date(corteF.getFullYear(), corteF.getMonth()-1, t.corte); }
  function fechaPago(t, corteF){
    if(!t.pago || !corteF) return null;
    var desplaza = (t.pago > t.corte) ? 0 : 1;
    return new Date(corteF.getFullYear(), corteF.getMonth() + desplaza, t.pago);
  }
  function claveCorte(t, corteF){
    return t.id + "|" + corteF.getFullYear() + "-" + String(corteF.getMonth()+1).padStart(2,"0") +
           "-" + String(corteF.getDate()).padStart(2,"0");
  }
  function diasHasta(f){
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    return Math.round((f - hoy) / 86400000);
  }
  function gastoCiclo(t, corteF){
    if(!corteF) return 0;
    var ant = cortePrevio(t, corteF);
    var ini = new Date(ant.getFullYear(), ant.getMonth(), ant.getDate(), 23, 59, 59);
    var fin = new Date(corteF.getFullYear(), corteF.getMonth(), corteF.getDate(), 23, 59, 59);
    var s = 0;
    D().movimientos.forEach(function(m){
      if(m.medio !== t.nombre) return;
      var f = new Date(m.fecha);
      if(f > ini && f <= fin){ s += m.monto; }
    });
    return s;
  }
  function completo(t, corteF){
    var ant = cortePrevio(t, corteF);
    return new Date(ant.getFullYear(), ant.getMonth(), ant.getDate() + 1) >= inicioRegistro();
  }
  function montoCorte(t, corteF){
    var man = D().montosCorte[claveCorte(t, corteF)];
    return (typeof man === "number") ? man : gastoCiclo(t, corteF);
  }
  function pagoDe(clave){ return D().pagosTarjeta.filter(function(p){ return p.clave === clave; })[0] || null; }
  function estaPagado(clave){ return !!pagoDe(clave) || !!(D().cortesPagados && D().cortesPagados[clave]); }
  function listoParaCiclos(t){ return t && t.tipo === "credito" && t.corte && t.pago; }

  /* Forma de pago dominante en un conjunto de subcategorías, según el historial. */
  function medioHabitual(ids){
    var ult = D().movimientos
      .filter(function(m){ return ids[m.subId] && m.medio; })
      .sort(function(a,b){ return a.fecha < b.fecha ? 1 : -1; }).slice(0, 8);
    if(!ult.length) return null;
    var cuenta = {}, top = null;
    ult.forEach(function(m){ cuenta[m.medio] = (cuenta[m.medio] || 0) + 1; });
    Object.keys(cuenta).forEach(function(k){ if(!top || cuenta[k] > top.n){ top = {medio:k, n:cuenta[k]}; } });
    return (top && top.n / ult.length >= 0.6) ? top.medio : null;
  }
  function uno(id){ var o = {}; o[id] = true; return o; }

  function ingresoMes(mes){
    return D().ingresos.reduce(function(s, i){ return i.fecha.slice(0,7) === mes ? s + i.monto : s; }, 0);
  }

  /* ---------- caja: lo que tiene que salir de la cuenta, con nombre ---------- */
  function caja(mes){
    var items = [], total = 0;
    var esteMes = (mes === mesDe());
    function suma(nombre, detalle, monto){
      if(monto <= 0) return;
      items.push({nombre:nombre, detalle:detalle, monto:monto});
      total += monto;
    }

    (D().tarjetas || []).forEach(function(t){
      if(!listoParaCiclos(t)) return;
      var vistos = {};
      for(var k = -2; k <= 2; k++){
        var ref = new Date(+mes.slice(0,4), +mes.slice(5,7)-1 + k, 15);
        var corteF = fechaCorte(t, ref), pagoF = fechaPago(t, corteF);
        if(!pagoF) continue;
        var mesPago = pagoF.getFullYear() + "-" + String(pagoF.getMonth()+1).padStart(2,"0");
        if(mesPago !== mes) continue;
        var cl = claveCorte(t, corteF);
        if(vistos[cl] || estaPagado(cl)) continue;
        vistos[cl] = true;
        var det = "pago de tarjeta · vence el " + diaLargo(pagoF);
        if(corteF > new Date()){ det += " · todavía sumando compras"; }
        if(!completo(t, corteF) && typeof D().montosCorte[cl] !== "number"){ det += " · falta el monto del estado de cuenta"; }
        suma(t.nombre, det, montoCorte(t, corteF));
      }
    });

    /* si el mes todavía no tiene presupuesto propio, se usa el del mes en curso */
    var mp = (D().presupuestos[mes] && Object.keys(D().presupuestos[mes]).length) ? mes : mesDe();
    D().categorias.forEach(function(c){
      if(c.comp === "ahorro") return;
      var subs = APP.subsDe(c.id, mes);
      /* fijos y cuotas, uno por uno */
      subs.forEach(function(s){
        if(APP.compDe(s) !== "fijo") return;
        /* si ya se pagó este mes, el recibo real reemplaza al estimado: no queda nada pendiente */
        if(esteMes && APP.gastadoSub(s.id, mes) > 0) return;
        if(APP.esCredito(medioHabitual(uno(s.id)))) return;
        suma(s.nombre, s.cuotas ? "cuota · " + c.nombre : c.nombre, APP.esperado(s, mp));
      });
      if(c.comp === "fijo") return;
      /* lo que queda del presupuesto de la categoría */
      var vars = subs.filter(function(s){ return APP.compDe(s) !== "fijo"; });
      var ids = {};
      vars.forEach(function(s){ ids[s.id] = true; });
      if(APP.esCredito(medioHabitual(ids))) return;
      var ref = APP.presu(c.id, mp) > 0 ? APP.presu(c.id, mp)
        : vars.reduce(function(t, s){ return t + APP.presu(s.id, mp); }, 0);
      if(ref <= 0) return;
      var gas = esteMes ? vars.reduce(function(t, s){ return t + APP.gastadoSub(s.id, mes); }, 0) : 0;
      suma(c.nombre, esteMes ? "lo que te queda del presupuesto" : "presupuesto del mes", ref - gas);
    });
    return {items:items, total:total};
  }

  /* Lo que ya salió de la cuenta este mes: gastos sin tarjeta de crédito y pagos de tarjeta. */
  function salidoMes(mes){
    var t = 0;
    D().movimientos.forEach(function(m){
      if(m.fecha.slice(0,7) === mes && !APP.esCredito(m.medio)){ t += m.monto; }
    });
    D().pagosTarjeta.forEach(function(p){ if(p.fecha.slice(0,7) === mes){ t += p.monto; } });
    return t;
  }

  /* ---------- aviso de ciclo al registrar ---------- */
  APP.avisarCiclo = function(medio, fecha){
    var e = $("avisoCiclo");
    var t = APP.tarjetaPorNombre(medio);
    if(!listoParaCiclos(t)){ e.textContent = ""; return; }
    var corteF = fechaCorte(t, fecha || new Date());
    e.textContent = "Entra al corte del " + diaLargo(corteF) + " · lo pagás el " + diaLargo(fechaPago(t, corteF)) + ".";
  };

  /* ---------- pantalla: ingresos y caja ---------- */
  function lineaSimple(cont, etiqueta, detalle, monto){
    var d = document.createElement("div");
    d.className = "linea";
    d.innerHTML = '<span class="et"></span><span class="ci"></span>';
    d.querySelector(".et").appendChild(document.createTextNode(etiqueta + " "));
    if(detalle){
      var s = document.createElement("small");
      s.textContent = "· " + detalle;
      d.querySelector(".et").appendChild(s);
    }
    d.querySelector(".ci").textContent = Q(monto);
    cont.appendChild(d);
  }
  function rotulo(cont, texto){
    var r = document.createElement("p");
    r.className = "subrotulo"; r.textContent = texto;
    cont.appendChild(r);
  }
  function bloque(cont, monto, pie){
    var b = document.createElement("div");
    b.className = "bloque";
    b.innerHTML = '<div class="cifra ng"></div><div class="pe"></div>';
    b.querySelector(".ng").textContent = Q(monto);
    b.querySelector(".pe").textContent = pie;
    cont.appendChild(b);
    return b;
  }

  function pintarCaja(){
    var mes = mesDe(), prox = mesSiguiente(mes);
    var nMes = soloMes(mes), nProx = soloMes(prox);
    $("sCaja").textContent = nombreMes(mes);

    /* saldo con que arrancó el mes */
    var cs = $("cSaldo"); cs.innerHTML = "";
    var saldo = typeof D().saldos[mes] === "number" ? D().saldos[mes] : null;
    rotulo(cs, "SALDO AL 1 DE " + nMes.toUpperCase());
    var bs = document.createElement("div");
    bs.className = "bloque";
    bs.innerHTML = '<div class="saldoCampo"><span>Q</span><input type="number" id="inSaldo" inputmode="decimal" step="0.01" placeholder="0" aria-label="Saldo en el banco al 1 del mes"></div>' +
                   '<div class="pe">lo que tenías en tu cuenta del banco ese día · no es un ingreso</div>';
    if(saldo !== null){ bs.querySelector("input").value = saldo; }
    bs.querySelector("input").addEventListener("change", function(){
      var v = parseFloat(this.value);
      if(isNaN(v)){ delete D().saldos[mes]; } else { D().saldos[mes] = v; }
      APP.guardar(); pintarCaja();
    });
    cs.appendChild(bs);

    /* ingresos por fuente */
    var ci = $("cIngresos"); ci.innerHTML = "";
    var totalIng = ingresoMes(mes);
    rotulo(ci, "INGRESOS DE " + nMes.toUpperCase());
    bloque(ci, totalIng, totalIng > 0 ? "lo que entró este mes" : "tocá una fuente para registrar lo que entra");
    D().fuentes.forEach(function(f){
      var monto = D().ingresos.reduce(function(t, i){
        return (i.fuenteId === f.id && i.fecha.slice(0,7) === mes) ? t + i.monto : t;
      }, 0);
      var n = D().ingresos.filter(function(i){ return i.fuenteId === f.id && i.fecha.slice(0,7) === mes; }).length;
      var b = document.createElement("button");
      b.className = "fila ingFila";
      b.innerHTML = '<span class="top"><span class="nom"></span><span class="cifra val"></span></span><span class="nota"></span>';
      b.querySelector(".nom").textContent = f.nombre;
      b.querySelector(".val").textContent = Q(monto);
      b.querySelector(".nota").textContent = n ? n + (n === 1 ? " registro" : " registros") + " · tocá para agregar otro" : "tocá para registrar";
      b.addEventListener("click", function(){ abrirIngreso(f.id); });
      ci.appendChild(b);
    });
    var af = document.createElement("button");
    af.type = "button"; af.className = "agregar";
    af.textContent = "+ Agregar fuente";
    af.addEventListener("click", function(){
      var nombre = prompt("Nombre de la nueva fuente de ingreso");
      if(!nombre || !nombre.trim()) return;
      nombre = nombre.trim();
      if(D().fuentes.some(function(x){ return APP.norm(x.nombre) === APP.norm(nombre); })){
        alert("Ya tenés una fuente con ese nombre."); return;
      }
      D().fuentes.push({id:nid(), nombre:nombre});
      APP.guardar(); pintarCaja();
    });
    ci.appendChild(af);

    /* por pagar este mes */
    var cp = $("cPagar"); cp.innerHTML = "";
    var c1 = caja(mes);
    rotulo(cp, "POR PAGAR EN " + nMes.toUpperCase());
    bloque(cp, c1.total, c1.items.length ? "lo que todavía tiene que salir de tu cuenta este mes" : "no tenés pagos pendientes con monto asignado");
    c1.items.forEach(function(x){ lineaSimple(cp, x.nombre, x.detalle, x.monto); });

    /* balance */
    var cb = $("cBalance"); cb.innerHTML = "";
    var salido = salidoMes(mes);
    var bal = (saldo || 0) + totalIng - salido - c1.total;
    rotulo(cb, "BALANCE DE " + nMes.toUpperCase());
    var bb = bloque(cb, Math.abs(bal), bal >= 0 ? "te sobran después de pagar todo" : "te faltan para cubrir todo");
    if(bal < 0){ bb.querySelector(".ng").style.color = "var(--alerta)"; bb.querySelector(".pe").style.color = "var(--alerta)"; }
    lineaSimple(cb, "Saldo al 1 de " + nMes.toLowerCase(), saldo === null ? "todavía no lo escribiste" : "", saldo || 0);
    lineaSimple(cb, "Entró", "ingresos del mes", totalIng);
    lineaSimple(cb, "Ya salió", "lo pagado con débito, efectivo, transferencia y pagos de tarjeta", salido);
    lineaSimple(cb, "Falta pagar", "", c1.total);

    /* próximo mes */
    var cx = $("cProx"); cx.innerHTML = "";
    var c2 = caja(prox);
    rotulo(cx, "PARA " + nProx.toUpperCase());
    bloque(cx, c2.total, "lo que deberías tener en tu cuenta el 1 de " + nProx.toLowerCase());
    c2.items.forEach(function(x){ lineaSimple(cx, x.nombre, x.detalle, x.monto); });

    pintarPorMedio();
  }
  APP.alMostrar.caja = pintarCaja;

  /* ---------- hoja: ingreso por fuente ---------- */
  var fuenteActual = null;
  function abrirIngreso(id){
    fuenteActual = D().fuentes.filter(function(f){ return f.id === id; })[0];
    if(!fuenteActual) return;
    $("tIng").textContent = fuenteActual.nombre;
    $("iMonto").value = ""; $("iNota").value = "";
    $("iFecha").value = hoyISO();
    pintarIngresos();
    APP.abrir("hojaIng");
    setTimeout(function(){ $("iMonto").focus(); }, 300);
  }
  function pintarIngresos(){
    var mes = mesDe();
    var regs = D().ingresos.filter(function(i){ return i.fuenteId === fuenteActual.id && i.fecha.slice(0,7) === mes; })
      .sort(function(a, b){ return a.fecha < b.fecha ? 1 : -1; });
    var total = regs.reduce(function(t, i){ return t + i.monto; }, 0);
    $("sIng").textContent = "Llevás " + Q(total) + " en " + soloMes(mes).toLowerCase();
    $("iRotulo").hidden = !regs.length;
    var l = $("iLista"); l.innerHTML = "";
    regs.forEach(function(i){
      var d = document.createElement("div");
      d.className = "mov";
      d.innerHTML = '<span><span class="nm"></span><small></small></span><span class="der"><span class="cifra mt"></span><button class="quitar" type="button">Borrar</button></span>';
      d.querySelector(".nm").textContent = APP.diaCorto(i.fecha);
      d.querySelector("small").textContent = i.nota || "";
      d.querySelector(".mt").textContent = Q(i.monto);
      d.querySelector(".quitar").addEventListener("click", function(){
        if(!confirm("¿Borrar este ingreso?")) return;
        D().ingresos = D().ingresos.filter(function(x){ return x.id !== i.id; });
        APP.guardar(); pintarIngresos(); pintarCaja();
      });
      l.appendChild(d);
    });
  }
  $("iGuardar").addEventListener("click", function(){
    var monto = parseFloat($("iMonto").value);
    if(!(monto > 0)){ alert("Escribí un monto mayor que cero."); return; }
    var f = $("iFecha").value;
    if(!f){ alert("Elegí una fecha."); return; }
    var ing = {id:nid(), fuenteId:fuenteActual.id, monto:monto, fecha:new Date(f + "T12:00:00").toISOString()};
    var nota = $("iNota").value.trim();
    if(nota){ ing.nota = nota; }
    D().ingresos.push(ing);
    APP.guardar(); APP.pintar(); pintarCaja();
    APP.cerrarTodo();
  });
  $("iRenombrar").addEventListener("click", function(){
    var nombre = prompt("Nuevo nombre para " + fuenteActual.nombre, fuenteActual.nombre);
    if(!nombre || !nombre.trim()) return;
    nombre = nombre.trim();
    if(D().fuentes.some(function(x){ return x.id !== fuenteActual.id && APP.norm(x.nombre) === APP.norm(nombre); })){
      alert("Ya tenés una fuente con ese nombre."); return;
    }
    fuenteActual.nombre = nombre;
    $("tIng").textContent = nombre;
    APP.guardar(); pintarCaja();
  });
  $("iEliminar").addEventListener("click", function(){
    var n = D().ingresos.filter(function(i){ return i.fuenteId === fuenteActual.id; }).length;
    var msg = n ? "¿Eliminar " + fuenteActual.nombre + "? Sus " + n + " ingresos registrados también se borran."
                : "¿Eliminar " + fuenteActual.nombre + "?";
    if(!confirm(msg)) return;
    var id = fuenteActual.id;
    D().fuentes = D().fuentes.filter(function(f){ return f.id !== id; });
    D().ingresos = D().ingresos.filter(function(i){ return i.fuenteId !== id; });
    APP.guardar(); APP.pintar(); pintarCaja();
    APP.cerrarTodo();
  });

  /* ---------- pantalla: tarjetas ---------- */
  var borrador = null, nombreOriginal = null;

  function pintarListaTar(){
    var cont = $("listaTar");
    cont.innerHTML = "";
    (D().tarjetas || []).forEach(function(t){
      var b = document.createElement("button");
      b.type = "button"; b.className = "elige";
      b.setAttribute("aria-label", "Personalizar " + (t.nombre || "tarjeta"));
      b.appendChild(APP.tarjetaNodo(t, false));
      b.addEventListener("click", function(){ abrirEditor(t); });
      cont.appendChild(b);
    });
  }
  function pintarPrevia(){ var p = $("prevTar"); p.innerHTML = ""; p.appendChild(APP.tarjetaNodo(borrador, false)); }
  function pintarSegm(id, valor){
    Array.prototype.forEach.call($(id).querySelectorAll("button"), function(b){
      b.setAttribute("aria-pressed", b.getAttribute("data-v") === valor ? "true" : "false");
    });
  }
  function pintarPaleta(){
    var cont = $("etColor");
    cont.innerHTML = "";
    APP.LUCES.forEach(function(l){
      APP.HUES.forEach(function(h){
        var b = document.createElement("button");
        b.type = "button";
        var col = {h:h, l:l};
        b.style.background = APP.colorFondo(col);
        b.setAttribute("aria-label", "Color");
        b.setAttribute("aria-pressed", (borrador.color && borrador.color.h === h && borrador.color.l === l) ? "true" : "false");
        b.addEventListener("click", function(){ borrador.color = col; pintarPaleta(); pintarPrevia(); });
        cont.appendChild(b);
      });
    });
  }
  function pintarExplica(){
    var e = $("etExplica");
    var c = parseInt($("etCorte").value, 10), p = parseInt($("etPago").value, 10);
    if(!(c >= 1 && c <= 31) || !(p >= 1 && p <= 31)){ e.hidden = true; return; }
    var tmp = {corte:c, pago:p};
    var corteF = fechaCorte(tmp, new Date());
    var ant = cortePrevio(tmp, corteF);
    var desde = new Date(ant.getFullYear(), ant.getMonth(), ant.getDate() + 1);
    e.textContent = "Lo que compres del " + diaLargo(desde) + " al " + diaLargo(corteF) +
                    " lo pagás el " + diaLargo(fechaPago(tmp, corteF)) + ".";
    e.hidden = false;
  }
  function abrirEditor(t){
    nombreOriginal = t.nombre || null;
    borrador = JSON.parse(JSON.stringify(t));
    $("etNombre").value = borrador.nombre || "";
    $("etCorte").value = borrador.corte || "";
    $("etPago").value = borrador.pago || "";
    pintarSegm("etTipo", borrador.tipo);
    pintarSegm("etRed", borrador.red);
    $("etFechas").hidden = (borrador.tipo === "debito");
    $("etQuitar").hidden = !D().tarjetas.some(function(x){ return x.id === t.id; });
    pintarPaleta(); pintarPrevia(); pintarExplica();
    $("editorTar").hidden = false;
    $("editorTar").scrollIntoView({block:"start", behavior:"smooth"});
  }
  $("etNombre").addEventListener("input", function(){ borrador.nombre = this.value; pintarPrevia(); });
  $("etTipo").addEventListener("click", function(e){
    var b = e.target.closest("button[data-v]"); if(!b) return;
    borrador.tipo = b.getAttribute("data-v");
    pintarSegm("etTipo", borrador.tipo);
    $("etFechas").hidden = (borrador.tipo === "debito");
    pintarPrevia();
  });
  $("etRed").addEventListener("click", function(e){
    var b = e.target.closest("button[data-v]"); if(!b) return;
    borrador.red = b.getAttribute("data-v");
    pintarSegm("etRed", borrador.red);
    pintarPrevia();
  });
  $("etCorte").addEventListener("input", pintarExplica);
  $("etPago").addEventListener("input", pintarExplica);
  $("agregarTarjeta").addEventListener("click", function(){
    abrirEditor({id:nid(), nombre:"", tipo:"credito", red:"Visa", color:null, corte:null, pago:null});
  });
  $("etGuardar").addEventListener("click", function(){
    var nombre = $("etNombre").value.trim();
    if(!nombre){ alert("Ponele un nombre a la tarjeta."); return; }
    if(D().tarjetas.some(function(x){ return x.id !== borrador.id && x.nombre === nombre; })){
      alert("Ya tenés otra tarjeta con ese nombre. Elegí uno distinto."); return;
    }
    if(nombre === "Efectivo" || nombre === "Transferencia"){ alert("Ese nombre ya lo usa otra forma de pago."); return; }
    borrador.nombre = nombre;
    if(borrador.tipo === "credito"){
      var c = parseInt($("etCorte").value, 10), p = parseInt($("etPago").value, 10);
      borrador.corte = (c >= 1 && c <= 31) ? c : null;
      borrador.pago  = (p >= 1 && p <= 31) ? p : null;
    }else{ borrador.corte = null; borrador.pago = null; }
    if(nombreOriginal && nombreOriginal !== nombre){
      D().movimientos.forEach(function(m){ if(m.medio === nombreOriginal){ m.medio = nombre; } });
    }
    var i = -1;
    D().tarjetas.forEach(function(x, k){ if(x.id === borrador.id){ i = k; } });
    if(i >= 0){ D().tarjetas[i] = borrador; } else { D().tarjetas.push(borrador); }
    APP.guardar();
    $("editorTar").hidden = true;
    pintarTarjetas();
    $("scroller").scrollTop = 0;
  });
  $("etQuitar").addEventListener("click", function(){
    if(!confirm("¿Quitar " + (borrador.nombre || "esta tarjeta") + "? Los gastos registrados con ella se conservan.")) return;
    D().tarjetas = D().tarjetas.filter(function(x){ return x.id !== borrador.id; });
    APP.guardar();
    $("editorTar").hidden = true;
    pintarTarjetas();
  });

  function cortesDe(t){
    var ini = inicioRegistro(), out = [];
    var c = fechaCorte(t, new Date());
    for(var k = 0; k < 8; k++){
      if(fechaPago(t, c) < ini) break;
      out.push(c);
      c = cortePrevio(t, c);
    }
    return out.reverse();
  }

  function filaCorte(t, corteF){
    var cl = claveCorte(t, corteF), pagoF = fechaPago(t, corteF);
    var abierto = corteF > new Date(), comp = completo(t, corteF);
    var calc = gastoCiclo(t, corteF), man = D().montosCorte[cl], pago = pagoDe(cl);

    var d = document.createElement("div");
    d.className = "corte";
    var cab = document.createElement("div");
    cab.className = "cab";
    var b = document.createElement("b");
    b.textContent = "Corte " + diaMes(corteF) + " · vence " + diaMes(pagoF);
    var ci = document.createElement("span");
    ci.className = "ci cifra";
    ci.textContent = Q(pago ? pago.monto : montoCorte(t, corteF));
    cab.appendChild(b); cab.appendChild(ci);
    d.appendChild(cab);

    var info = document.createElement("p");
    if(pago){
      info.style.color = "var(--tinta)";
      info.textContent = "Pagado " + Q(pago.monto) + " el " + diaMes(new Date(pago.fecha));
    }else if(abierto){
      var dd = diasHasta(corteF);
      info.textContent = "Ciclo abierto · corta en " + dd + (dd === 1 ? " día" : " días") +
        (comp ? "" : " · registrado desde el " + diaMes(inicioRegistro()) + ": " + Q(calc));
    }else if(comp){
      info.textContent = "Calculado con tus registros";
    }else{
      info.textContent = calc > 0
        ? "Registrado desde el " + diaMes(inicioRegistro()) + ": " + Q(calc) + " · incompleto"
        : "Sin registro en la app · usá el monto del estado de cuenta";
    }
    d.appendChild(info);

    if(pago){
      var des = document.createElement("button");
      des.className = "secundaria";
      des.style.textAlign = "left"; des.style.paddingLeft = "0";
      des.textContent = "Deshacer pago";
      des.addEventListener("click", function(){
        D().pagosTarjeta = D().pagosTarjeta.filter(function(x){ return x.clave !== cl; });
        APP.guardar(); pintarTarjetas();
      });
      d.appendChild(des);
      return d;
    }
    if(!comp){
      var mw = document.createElement("div");
      mw.className = "manual";
      var inp = document.createElement("input");
      inp.type = "number"; inp.inputMode = "decimal"; inp.min = "0"; inp.step = "0.01";
      inp.placeholder = "Monto del estado de cuenta";
      inp.setAttribute("aria-label", "Monto del estado de cuenta");
      if(typeof man === "number"){ inp.value = man; }
      inp.addEventListener("change", function(){
        var v = parseFloat(this.value);
        if(v >= 0){ D().montosCorte[cl] = v; } else { delete D().montosCorte[cl]; }
        APP.guardar(); pintarTarjetas();
      });
      mw.appendChild(inp);
      d.appendChild(mw);
    }
    if(!abierto){
      var btn = document.createElement("button");
      btn.className = "txt"; btn.type = "button"; btn.style.marginTop = "10px";
      btn.textContent = "Marcar como pagado";
      var form = document.createElement("div");
      form.hidden = true;
      form.innerHTML =
        '<div class="dias"><div><label class="etiq">MONTO PAGADO</label><input type="number" class="pm" inputmode="decimal" min="0" step="0.01"></div>' +
        '<div><label class="etiq">FECHA</label><input type="date" class="pf"></div></div>' +
        '<button class="principal pc" type="button">Confirmar pago</button>';
      btn.addEventListener("click", function(){
        form.hidden = !form.hidden;
        var v = Math.round(montoCorte(t, corteF) * 100) / 100;
        form.querySelector(".pm").value = v > 0 ? v : "";
        form.querySelector(".pf").value = hoyISO();
      });
      form.querySelector(".pc").addEventListener("click", function(){
        var m = parseFloat(form.querySelector(".pm").value), f = form.querySelector(".pf").value;
        if(!(m > 0)){ alert("Escribí el monto que pagaste."); return; }
        if(!f){ alert("Elegí la fecha del pago."); return; }
        D().pagosTarjeta.push({id:nid(), tarjetaId:t.id, tarjeta:t.nombre, clave:cl, monto:m,
                               fecha:new Date(f + "T12:00:00").toISOString()});
        APP.guardar(); pintarTarjetas();
      });
      d.appendChild(btn);
      d.appendChild(form);
    }
    return d;
  }

  function pintarPagos(){
    var cont = $("pagosTar");
    cont.innerHTML = "";
    var credito = (D().tarjetas || []).filter(listoParaCiclos);
    if(!credito.length && !D().pagosTarjeta.length) return;
    var r = document.createElement("p");
    r.className = "subrotulo"; r.textContent = "PAGOS DE TARJETA DE CRÉDITO";
    cont.appendChild(r);
    credito.forEach(function(t){
      var h = document.createElement("p");
      h.style.cssText = "font-weight:600;margin:16px 0 4px;font-size:16px";
      h.textContent = t.nombre;
      cont.appendChild(h);
      cortesDe(t).forEach(function(c){ cont.appendChild(filaCorte(t, c)); });
    });
    var hist = D().pagosTarjeta.slice().sort(function(a, b){ return a.fecha < b.fecha ? 1 : -1; });
    if(hist.length){
      var r2 = document.createElement("p");
      r2.className = "subrotulo"; r2.textContent = "HISTORIAL DE PAGOS";
      cont.appendChild(r2);
      hist.forEach(function(p){
        var t = (D().tarjetas || []).filter(function(x){ return x.id === p.tarjetaId; })[0];
        lineaSimple(cont, t ? t.nombre : (p.tarjeta || "Tarjeta"), "pagado el " + diaMes(new Date(p.fecha)), p.monto);
      });
    }
  }

  function pintarPorMedio(){
    var mes = mesDe(), cont = $("cMedios");
    cont.innerHTML = "";
    var r = {};
    APP.medios().forEach(function(m){ r[m] = 0; });
    D().movimientos.forEach(function(m){
      if(m.fecha.slice(0,7) !== mes) return;
      var s = APP.subDe(m.subId);
      if(s && APP.compDe(s) === "ahorro") return;
      var k = m.medio || "Sin especificar";
      r[k] = (r[k] || 0) + m.monto;
    });
    var total = 0;
    Object.keys(r).forEach(function(k){ total += r[k]; });
    var rot = document.createElement("p");
    rot.className = "subrotulo";
    rot.textContent = "CON QUÉ PAGASTE EN " + soloMes(mes).toUpperCase();
    cont.appendChild(rot);
    Object.keys(r).forEach(function(k){
      lineaSimple(cont, k, total > 0 ? Math.round(r[k]/total*100) + "%" : "", r[k]);
    });
  }

  function pintarTarjetas(){ pintarListaTar(); pintarPagos(); }
  APP.alMostrar.tar = function(){ $("editorTar").hidden = true; pintarTarjetas(); };
})();
