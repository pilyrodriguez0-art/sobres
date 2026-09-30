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

  /* ---------- caja ---------- */
  function caja(mes){
    var r = {tarjetas:[], fijos:0, variables:0, total:0};
    var esteMes = (mes === mesDe());

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
        var monto = montoCorte(t, corteF);
        if(monto <= 0) continue;
        r.tarjetas.push({nombre:t.nombre, monto:monto, vence:pagoF, abierto:corteF > new Date(),
                         incompleto:!completo(t, corteF) && typeof D().montosCorte[cl] !== "number"});
        r.total += monto;
      }
    });

    D().categorias.forEach(function(c){
      if(c.comp === "ahorro") return;
      var subs = APP.subsDe(c.id, mes);
      if(c.comp === "fijo"){
        subs.forEach(function(s){
          if(APP.esCredito(medioHabitual(uno(s.id)))) return;
          var esp = APP.esperado(s, mes);
          if(esp <= 0) return;
          var falta = esteMes ? esp - APP.gastadoSub(s.id, mes) : esp;
          if(falta > 0){ r.fijos += falta; r.total += falta; }
        });
        return;
      }
      /* variables: el tope de la categoría, o lo que suman sus subcategorías */
      var ids = {};
      subs.forEach(function(s){ ids[s.id] = true; });
      var cuotas = subs.filter(function(s){ return APP.compDe(s) === "fijo"; });
      cuotas.forEach(function(s){
        if(APP.esCredito(medioHabitual(uno(s.id)))) return;
        var esp = APP.esperado(s, mes);
        var falta = esteMes ? esp - APP.gastadoSub(s.id, mes) : esp;
        if(falta > 0){ r.fijos += falta; r.total += falta; }
      });
      if(APP.esCredito(medioHabitual(ids))) return;
      var ref = APP.presu(c.id, mes) > 0 ? APP.presu(c.id, mes)
        : subs.filter(function(s){ return APP.compDe(s) !== "fijo"; })
              .reduce(function(t, s){ return t + APP.presu(s.id, mes); }, 0);
      if(ref <= 0) return;
      var gas = 0;
      if(esteMes){
        subs.forEach(function(s){ if(APP.compDe(s) !== "fijo"){ gas += APP.gastadoSub(s.id, mes); } });
      }
      var falta = ref - gas;
      if(falta > 0){ r.variables += falta; r.total += falta; }
    });
    return r;
  }

  /* ---------- aviso de ciclo al registrar ---------- */
  APP.avisarCiclo = function(medio, fecha){
    var e = $("avisoCiclo");
    var t = APP.tarjetaPorNombre(medio);
    if(!listoParaCiclos(t)){ e.textContent = ""; return; }
    var corteF = fechaCorte(t, fecha || new Date());
    e.textContent = "Entra al corte del " + diaLargo(corteF) + " · lo pagás el " + diaLargo(fechaPago(t, corteF)) + ".";
  };

  /* ---------- pantalla: caja ---------- */
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
  function bloqueCaja(cont, titulo, mes, pie){
    var c = caja(mes);
    var r = document.createElement("p");
    r.className = "subrotulo"; r.textContent = titulo;
    cont.appendChild(r);
    var b = document.createElement("div");
    b.className = "bloque";
    b.innerHTML = '<div class="cifra ng"></div><div class="pe"></div>';
    b.querySelector(".ng").textContent = Q(c.total);
    b.querySelector(".pe").textContent = pie;
    cont.appendChild(b);
    c.tarjetas.forEach(function(t){
      var det = "vence el " + diaLargo(t.vence);
      if(t.abierto){ det += " · ciclo aún abierto"; }
      if(t.incompleto){ det += " · incompleto"; }
      lineaSimple(cont, t.nombre, det, t.monto);
    });
    lineaSimple(cont, "Fijos y cuotas", "sin tarjeta de crédito", c.fijos);
    lineaSimple(cont, "Variables", "presupuestado", c.variables);
    return c;
  }

  function filaFuente(f){
    var d = document.createElement("div");
    d.className = "cfgT";
    d.setAttribute("data-id", f.id);
    d.innerHTML = '<input type="text" class="fn" aria-label="Nombre de la fuente"><button class="quitar" type="button">Quitar</button>';
    d.querySelector(".fn").value = f.nombre;
    d.querySelector(".quitar").addEventListener("click", function(){ d.remove(); });
    return d;
  }

  function pintarCaja(){
    var mes = mesDe(), prox = mesSiguiente(mes);
    $("sCaja").textContent = nombreMes(mes);
    var hoy = new Date();
    var quedan = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).getDate() - hoy.getDate();
    var c1 = $("cajaHoy"); c1.innerHTML = "";
    var caja1 = bloqueCaja(c1, "TE FALTA PAGAR EN " + soloMes(mes).toUpperCase(), mes,
      "de una sola cuenta · quedan " + quedan + (quedan === 1 ? " día" : " días") + " del mes");
    var c2 = $("cajaProx"); c2.innerHTML = "";
    var caja2 = bloqueCaja(c2, "NECESITARÁS EN " + soloMes(prox).toUpperCase(), prox,
      "tenelo en la cuenta al arrancar el mes");

    var c3 = $("ingresosMes"); c3.innerHTML = "";
    var r = document.createElement("p");
    r.className = "subrotulo";
    r.textContent = "INGRESOS DE " + soloMes(mes).toUpperCase();
    c3.appendChild(r);
    var total = ingresoMes(mes);
    var b = document.createElement("div");
    b.className = "bloque";
    b.innerHTML = '<div class="cifra ng"></div><div class="pe"></div>';
    b.querySelector(".ng").textContent = Q(total);
    b.querySelector(".pe").textContent = total > 0
      ? "entraron este mes · cubriendo lo de " + soloMes(mes).toLowerCase() + " te quedan " +
        Q(Math.max(total - caja1.total, 0)) + " · " + soloMes(prox).toLowerCase() + " pide " + Q(caja2.total)
      : "todavía no registraste ingresos este mes";
    c3.appendChild(b);

    D().ingresos.filter(function(i){ return i.fecha.slice(0,7) === mes; })
      .sort(function(a, b2){ return a.fecha < b2.fecha ? 1 : -1; })
      .forEach(function(i){
        var fu = D().fuentes.filter(function(x){ return x.id === i.fuenteId; })[0];
        var d = document.createElement("div");
        d.className = "linea";
        d.innerHTML = '<span class="et"></span><span style="display:flex;gap:10px;align-items:baseline"><span class="ci"></span><button class="quitar" type="button">Borrar</button></span>';
        d.querySelector(".et").appendChild(document.createTextNode((fu ? fu.nombre : "Otra") + " "));
        var s = document.createElement("small");
        s.textContent = "· " + APP.diaCorto(i.fecha) + (i.nota ? " · " + i.nota : "");
        d.querySelector(".et").appendChild(s);
        d.querySelector(".ci").textContent = Q(i.monto);
        d.querySelector(".quitar").addEventListener("click", function(){
          if(!confirm("¿Borrar este ingreso?")) return;
          D().ingresos = D().ingresos.filter(function(x){ return x.id !== i.id; });
          APP.guardar(); pintarCaja();
        });
        c3.appendChild(d);
      });

    var sel = $("inFuente");
    sel.innerHTML = "";
    D().fuentes.forEach(function(f){
      var o = document.createElement("option");
      o.value = f.id; o.textContent = f.nombre;
      sel.appendChild(o);
    });
    var cf = $("cfgFuentes");
    cf.innerHTML = "";
    D().fuentes.forEach(function(f){ cf.appendChild(filaFuente(f)); });
  }
  APP.alMostrar.caja = function(){ $("formIngreso").hidden = true; pintarCaja(); };

  $("btnNuevoIngreso").addEventListener("click", function(){
    var f = $("formIngreso");
    f.hidden = !f.hidden;
    if(!f.hidden){
      $("inMonto").value = ""; $("inNota").value = "";
      $("inFecha").value = hoyISO();
      $("inMonto").focus();
    }
  });
  $("guardarIngreso").addEventListener("click", function(){
    var monto = parseFloat($("inMonto").value);
    if(!(monto > 0)){ alert("Escribí un monto mayor que cero."); return; }
    var f = $("inFecha").value;
    if(!f){ alert("Elegí una fecha."); return; }
    if(!$("inFuente").value){ alert("Agregá primero una fuente de ingreso."); return; }
    var ing = {id:nid(), fuenteId:$("inFuente").value, monto:monto, fecha:new Date(f + "T12:00:00").toISOString()};
    var nota = $("inNota").value.trim();
    if(nota){ ing.nota = nota; }
    D().ingresos.push(ing);
    APP.guardar();
    $("formIngreso").hidden = true;
    pintarCaja();
  });
  $("agregarFuente").addEventListener("click", function(){
    var d = filaFuente({id:nid(), nombre:""});
    $("cfgFuentes").appendChild(d);
    d.querySelector(".fn").focus();
  });
  $("guardarFuentes").addEventListener("click", function(){
    var nuevas = [];
    Array.prototype.forEach.call($("cfgFuentes").querySelectorAll(".cfgT"), function(d){
      var n = d.querySelector(".fn").value.trim();
      if(n){ nuevas.push({id:d.getAttribute("data-id"), nombre:n}); }
    });
    D().fuentes = nuevas;
    APP.guardar(); pintarCaja();
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
    window.scrollTo(0, 0);
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
    var credito = (D().tarjetas || []).filter(function(t){ return t.tipo === "credito"; });
    if(!credito.length) return;
    var r = document.createElement("p");
    r.className = "subrotulo"; r.textContent = "PAGOS DE TARJETA DE CRÉDITO";
    cont.appendChild(r);
    credito.forEach(function(t){
      var h = document.createElement("p");
      h.style.cssText = "font-weight:600;margin:16px 0 4px;font-size:16px";
      h.textContent = t.nombre;
      cont.appendChild(h);
      if(!listoParaCiclos(t)){
        var s = document.createElement("p");
        s.className = "segunda";
        s.textContent = "Tocá la tarjeta arriba y poné su día de corte y de pago.";
        cont.appendChild(s);
        return;
      }
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
    var mes = mesDe(), cont = $("porMedio");
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
    rot.textContent = "GASTADO EN " + soloMes(mes).toUpperCase() + " POR FORMA DE PAGO";
    cont.appendChild(rot);
    Object.keys(r).forEach(function(k){
      lineaSimple(cont, k, total > 0 ? Math.round(r[k]/total*100) + "%" : "", r[k]);
    });
  }

  function pintarTarjetas(){ pintarListaTar(); pintarPagos(); pintarPorMedio(); }
  APP.alMostrar.tar = function(){ $("editorTar").hidden = true; pintarTarjetas(); };
})();
