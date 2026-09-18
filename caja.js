/* Sobres · ingresos, caja y tarjetas. Debe cargar DESPUÉS de sobres.js. */
(function(){
  "use strict";
  if(typeof APP === "undefined"){ return; }

  var $ = APP.$, Q = APP.Q, nid = APP.nid;
  var mesDe = APP.mesDe, mesSiguiente = APP.mesSiguiente;
  var nombreMes = APP.nombreMes, soloMes = APP.soloMes, diaLargo = APP.diaLargo;
  function D(){ return APP.datosRef(); }

  /* ---------- ciclos de tarjeta ---------- */
  function fechaCorte(t, ref){
    if(!t.corte) return null;
    var f = new Date(ref.getFullYear(), ref.getMonth(), t.corte);
    if(ref.getDate() > t.corte){ f = new Date(ref.getFullYear(), ref.getMonth()+1, t.corte); }
    return f;
  }
  function fechaPago(t, corteF){
    if(!t.pago || !corteF) return null;
    var desplaza = (t.pago > t.corte) ? 0 : 1;
    return new Date(corteF.getFullYear(), corteF.getMonth() + desplaza, t.pago);
  }
  function claveCorte(t, corteF){
    return t.id + "|" + corteF.getFullYear() + "-" +
           String(corteF.getMonth()+1).padStart(2,"0") + "-" +
           String(corteF.getDate()).padStart(2,"0");
  }
  function diasHasta(f){
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    return Math.round((f - hoy) / 86400000);
  }
  function gastoCiclo(t, corteF){
    if(!corteF) return 0;
    var ini = new Date(corteF.getFullYear(), corteF.getMonth()-1, t.corte, 23, 59, 59);
    var fin = new Date(corteF.getFullYear(), corteF.getMonth(), corteF.getDate(), 23, 59, 59);
    var s = 0;
    D().movimientos.forEach(function(m){
      if(m.medio !== t.nombre) return;
      var f = new Date(m.fecha);
      if(f > ini && f <= fin){ s += m.monto; }
    });
    return s;
  }
  function esCredito(nombre){
    return (D().tarjetas || []).some(function(t){ return t.nombre === nombre; });
  }

  /* La forma de pago dominante de un sobre, según su historial. */
  function medioHabitual(c){
    var ult = D().movimientos
      .filter(function(m){ return m.catId === c.id && m.medio; })
      .sort(function(a,b){ return a.fecha < b.fecha ? 1 : -1; })
      .slice(0, 6);
    if(!ult.length) return null;
    var cuenta = {}, top = null;
    ult.forEach(function(m){ cuenta[m.medio] = (cuenta[m.medio] || 0) + 1; });
    Object.keys(cuenta).forEach(function(k){
      if(!top || cuenta[k] > top.n){ top = {medio:k, n:cuenta[k]}; }
    });
    return (top && top.n / ult.length >= 0.6) ? top.medio : null;
  }

  function ingresoMes(mes){
    return D().ingresos.reduce(function(s,i){
      return i.fecha.slice(0,7) === mes ? s + i.monto : s;
    }, 0);
  }
  function gastoPorMedio(mes){
    var r = {};
    APP.medios().forEach(function(m){ r[m] = 0; });
    D().movimientos.forEach(function(m){
      if(m.fecha.slice(0,7) !== mes) return;
      var c = D().categorias.filter(function(x){ return x.id === m.catId; })[0];
      if(c && c.tipo === "ahorro") return;
      var k = m.medio || "Sin especificar";
      r[k] = (r[k] || 0) + m.monto;
    });
    return r;
  }

  /* ---------- caja: lo que tiene que salir de la cuenta ---------- */
  function caja(mes){
    var r = {tarjetas:[], fijos:0, variables:0, total:0};
    var esteMes = (mes === mesDe());

    (D().tarjetas || []).forEach(function(t){
      if(!t.corte || !t.pago) return;
      var vistos = {};
      for(var k = -2; k <= 2; k++){
        var ref = new Date(+mes.slice(0,4), +mes.slice(5,7)-1 + k, 15);
        var corteF = fechaCorte(t, ref);
        var pagoF = fechaPago(t, corteF);
        if(!pagoF) continue;
        var mesPago = pagoF.getFullYear() + "-" + String(pagoF.getMonth()+1).padStart(2,"0");
        if(mesPago !== mes) continue;
        var cl = claveCorte(t, corteF);
        if(vistos[cl] || D().cortesPagados[cl]) continue;
        vistos[cl] = true;
        var monto = gastoCiclo(t, corteF);
        if(monto <= 0) continue;
        r.tarjetas.push({nombre:t.nombre, monto:monto, vence:pagoF, clave:cl, abierto: corteF > new Date()});
        r.total += monto;
      }
    });

    var mesPresu = D().presupuestos[mes] ? mes : mesDe();
    D().categorias.forEach(function(c){
      if(c.tipo === "ahorro") return;
      if(esCredito(medioHabitual(c))) return;
      if(c.cuotas && c.cuotas.hasta && mes > c.cuotas.hasta) return;
      var p = APP.presu(c.id, mesPresu);
      if(p <= 0) return;
      var falta = esteMes ? (p - APP.gastado(c.id, mes)) : p;
      if(falta <= 0) return;
      if(c.tipo === "fijo"){ r.fijos += falta; } else { r.variables += falta; }
      r.total += falta;
    });

    return r;
  }

  /* ---------- aviso de ciclo al registrar ---------- */
  var elAviso = null;
  function cajaAviso(){
    if(elAviso) return elAviso;
    elAviso = document.createElement("p");
    elAviso.className = "recuerdo";
    var anchor = $("recuerdo");
    if(anchor && anchor.parentNode){ anchor.parentNode.insertBefore(elAviso, anchor.nextSibling); }
    return elAviso;
  }
  APP.avisarCiclo = function(medio){
    var e = cajaAviso();
    var t = (D().tarjetas || []).filter(function(x){ return x.nombre === medio; })[0];
    if(!t || !t.corte || !t.pago){ e.textContent = ""; return; }
    var corteF = fechaCorte(t, new Date());
    e.textContent = "Entra al corte del " + diaLargo(corteF) +
                    " · lo pagás el " + diaLargo(fechaPago(t, corteF)) + ".";
  };

  /* ---------- pantalla: ingresos y caja ---------- */
  function bloqueCaja(cont, titulo, mes, pie){
    var c = caja(mes);
    var r = document.createElement("p");
    r.className = "subrotulo";
    r.textContent = titulo;
    cont.appendChild(r);

    var b = document.createElement("div");
    b.className = "bloque";
    b.innerHTML = '<div class="cifra ng"></div><div class="pe"></div>';
    b.querySelector(".ng").textContent = Q(c.total);
    b.querySelector(".pe").textContent = pie;
    cont.appendChild(b);

    c.tarjetas.forEach(function(t){
      var d = document.createElement("div");
      d.className = "linea";
      d.innerHTML = '<span class="et"></span><span class="ci"></span>';
      d.querySelector(".et").innerHTML = "";
      d.querySelector(".et").appendChild(document.createTextNode(t.nombre + " "));
      var s = document.createElement("small");
      s.textContent = "· vence el " + diaLargo(t.vence) + (t.abierto ? " · ciclo aún abierto" : "");
      d.querySelector(".et").appendChild(s);
      d.querySelector(".ci").textContent = Q(t.monto);
      cont.appendChild(d);
    });

    [["Fijos", c.fijos, "sin tarjeta de crédito"],
     ["Compras y variables", c.variables, "presupuestado"]].forEach(function(par){
      var d = document.createElement("div");
      d.className = "linea";
      d.innerHTML = '<span class="et"></span><span class="ci"></span>';
      d.querySelector(".et").appendChild(document.createTextNode(par[0] + " "));
      var s = document.createElement("small");
      s.textContent = "· " + par[2];
      d.querySelector(".et").appendChild(s);
      d.querySelector(".ci").textContent = Q(par[1]);
      cont.appendChild(d);
    });
    return c;
  }

  function pintarCaja(){
    var mes = mesDe(), prox = mesSiguiente(mes);
    $("sCaja").textContent = nombreMes(mes);

    var c1 = $("cajaHoy"); c1.innerHTML = "";
    var hoy = new Date();
    var ultimo = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).getDate();
    var quedan = ultimo - hoy.getDate();
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
      ? "entraron este mes · cubriendo lo de " + soloMes(mes).toLowerCase() +
        " te quedan " + Q(Math.max(total - caja1.total, 0)) +
        " · " + soloMes(prox).toLowerCase() + " pide " + Q(caja2.total)
      : "todavía no registraste ingresos este mes";
    c3.appendChild(b);

    D().ingresos
      .filter(function(i){ return i.fecha.slice(0,7) === mes; })
      .sort(function(a,b2){ return a.fecha < b2.fecha ? 1 : -1; })
      .forEach(function(i){
        var fu = D().fuentes.filter(function(x){ return x.id === i.fuenteId; })[0];
        var d = document.createElement("div");
        d.className = "linea";
        d.innerHTML = '<span class="et"></span><span class="der" style="display:flex;gap:10px;align-items:baseline"><span class="ci"></span><button class="quitar" type="button">Borrar</button></span>';
        d.querySelector(".et").appendChild(document.createTextNode((fu ? fu.nombre : "Otra") + " "));
        var s = document.createElement("small");
        s.textContent = "· " + APP.diaCorto(i.fecha) + (i.nota ? " · " + i.nota : "");
        d.querySelector(".et").appendChild(s);
        d.querySelector(".ci").textContent = Q(i.monto);
        d.querySelector(".quitar").addEventListener("click", function(){
          D().ingresos = D().ingresos.filter(function(x){ return x.id !== i.id; });
          APP.guardar(); APP.pintar(); pintarCaja();
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
    D().fuentes.forEach(function(f){
      var d = document.createElement("div");
      d.className = "cfgT";
      d.setAttribute("data-id", f.id);
      d.innerHTML = '<input type="text" class="fn" aria-label="Nombre de la fuente">' +
                    '<button class="quitar" type="button">Quitar</button>';
      d.querySelector(".fn").value = f.nombre;
      d.querySelector(".quitar").addEventListener("click", function(){ d.remove(); });
      cf.appendChild(d);
    });
  }

  $("btnCaja").addEventListener("click", function(){
    $("formIngreso").hidden = true;
    pintarCaja();
    APP.abrir("hojaCaja");
  });

  $("btnNuevoIngreso").addEventListener("click", function(){
    var f = $("formIngreso");
    f.hidden = !f.hidden;
    if(!f.hidden){
      $("inMonto").value = "";
      $("inNota").value = "";
      var h = new Date();
      $("inFecha").value = h.getFullYear() + "-" +
        String(h.getMonth()+1).padStart(2,"0") + "-" + String(h.getDate()).padStart(2,"0");
      $("inMonto").focus();
    }
  });

  $("guardarIngreso").addEventListener("click", function(){
    var monto = parseFloat($("inMonto").value);
    if(!(monto > 0)){ alert("Escribí un monto mayor que cero."); return; }
    var f = $("inFecha").value;
    if(!f){ alert("Elegí una fecha."); return; }
    var ing = {
      id: nid(),
      fuenteId: $("inFuente").value,
      monto: monto,
      fecha: new Date(f + "T12:00:00").toISOString()
    };
    var nota = $("inNota").value.trim();
    if(nota){ ing.nota = nota; }
    D().ingresos.push(ing);
    APP.guardar(); APP.pintar();
    $("formIngreso").hidden = true;
    pintarCaja();
  });

  $("agregarFuente").addEventListener("click", function(){
    var f = {id:nid(), nombre:""};
    D().fuentes.push(f);
    var d = document.createElement("div");
    d.className = "cfgT";
    d.setAttribute("data-id", f.id);
    d.innerHTML = '<input type="text" class="fn" aria-label="Nombre de la fuente">' +
                  '<button class="quitar" type="button">Quitar</button>';
    d.querySelector(".quitar").addEventListener("click", function(){ d.remove(); });
    $("cfgFuentes").appendChild(d);
    d.querySelector(".fn").focus();
  });

  $("guardarFuentes").addEventListener("click", function(){
    var nuevas = [];
    Array.prototype.forEach.call($("cfgFuentes").querySelectorAll(".cfgT"), function(d){
      var n = d.querySelector(".fn").value.trim();
      if(!n) return;
      nuevas.push({id: d.getAttribute("data-id"), nombre: n});
    });
    D().fuentes = nuevas;
    APP.guardar(); pintarCaja();
  });

  /* ---------- pantalla: tarjetas ---------- */
  function filaTarjeta(t){
    var d = document.createElement("div");
    d.className = "cfgT";
    d.setAttribute("data-id", t.id);
    d.innerHTML = '<input type="text" class="tn" aria-label="Nombre de la tarjeta">' +
      '<span>corta</span><input type="number" class="tc" min="1" max="31" inputmode="numeric" aria-label="Día de corte">' +
      '<span>paga</span><input type="number" class="tp" min="1" max="31" inputmode="numeric" aria-label="Día límite de pago">' +
      '<button class="quitar" type="button">Quitar</button>';
    d.querySelector(".tn").value = t.nombre;
    d.querySelector(".tc").value = t.corte || "";
    d.querySelector(".tp").value = t.pago || "";
    d.querySelector(".quitar").addEventListener("click", function(){ d.remove(); });
    return d;
  }

  function pintarTarjetas(){
    var mes = mesDe(), hoy = new Date();
    $("sTar").textContent = nombreMes(mes);

    var pm = gastoPorMedio(mes), cont = $("porMedio");
    cont.innerHTML = "";
    var r = document.createElement("p");
    r.className = "subrotulo";
    r.textContent = "ESTE MES POR FORMA DE PAGO";
    cont.appendChild(r);
    var total = 0;
    Object.keys(pm).forEach(function(k){ total += pm[k]; });
    Object.keys(pm).forEach(function(k){
      var d = document.createElement("div");
      d.className = "linea";
      d.innerHTML = '<span class="et"></span><span class="ci"></span>';
      d.querySelector(".et").textContent = k + (total > 0 ? "  ·  " + Math.round(pm[k]/total*100) + "%" : "");
      d.querySelector(".ci").textContent = Q(pm[k]);
      cont.appendChild(d);
    });

    var cic = $("ciclos");
    cic.innerHTML = "";
    var r2 = document.createElement("p");
    r2.className = "subrotulo";
    r2.textContent = "CICLOS DE TARJETA";
    cic.appendChild(r2);

    var conCiclo = (D().tarjetas || []).filter(function(t){ return t.corte && t.pago; });
    if(!conCiclo.length){
      var vac = document.createElement("p");
      vac.className = "sub";
      vac.style.marginTop = "8px";
      vac.textContent = "Configurá abajo el día de corte y de pago para ver los ciclos.";
      cic.appendChild(vac);
    }

    conCiclo.forEach(function(t){
      var corteF = fechaCorte(t, hoy);
      var pagoF = fechaPago(t, corteF);
      var dias = diasHasta(corteF);
      var corteAnt = new Date(corteF.getFullYear(), corteF.getMonth()-1, t.corte);
      var pagoAnt = fechaPago(t, corteAnt);

      var d = document.createElement("div");
      d.className = "tarj";
      var h = document.createElement("h3");
      h.textContent = t.nombre;
      d.appendChild(h);

      var p1 = document.createElement("p");
      var g = document.createElement("span");
      g.className = "grande";
      g.textContent = Q(gastoCiclo(t, corteF));
      p1.appendChild(g);
      p1.appendChild(document.createTextNode(
        " en el ciclo abierto · corta el " + diaLargo(corteF) +
        (dias === 0 ? " (hoy)" : " (en " + dias + (dias === 1 ? " día" : " días") + ")")
      ));
      d.appendChild(p1);

      var p2 = document.createElement("p");
      p2.textContent = "Ese corte se paga el " + diaLargo(pagoF);
      d.appendChild(p2);

      var clAnt = claveCorte(t, corteAnt);
      var deuda = gastoCiclo(t, corteAnt);
      if(deuda > 0 && !D().cortesPagados[clAnt]){
        var p3 = document.createElement("p");
        p3.textContent = "Corte cerrado: " + Q(deuda) + " · vence el " + diaLargo(pagoAnt);
        d.appendChild(p3);
        var bt = document.createElement("button");
        bt.className = "txt";
        bt.type = "button";
        bt.style.marginTop = "8px";
        bt.textContent = "Marcar ese corte como pagado";
        bt.addEventListener("click", function(){
          D().cortesPagados[clAnt] = true;
          APP.guardar(); pintarTarjetas();
        });
        d.appendChild(bt);
      }
      cic.appendChild(d);
    });

    var cfg = $("cfgTarjetas");
    cfg.innerHTML = "";
    (D().tarjetas || []).forEach(function(t){ cfg.appendChild(filaTarjeta(t)); });
  }

  $("btnTarjetas").addEventListener("click", function(){
    pintarTarjetas();
    APP.abrir("hojaTar");
  });
  $("agregarTarjeta").addEventListener("click", function(){
    var t = {id:nid(), nombre:"", corte:null, pago:null};
    D().tarjetas.push(t);
    var f = filaTarjeta(t);
    $("cfgTarjetas").appendChild(f);
    f.querySelector(".tn").focus();
  });
  $("guardarTarjetas").addEventListener("click", function(){
    var nuevas = [];
    Array.prototype.forEach.call($("cfgTarjetas").querySelectorAll(".cfgT"), function(d){
      var nombre = d.querySelector(".tn").value.trim();
      if(!nombre) return;
      var c = parseInt(d.querySelector(".tc").value, 10);
      var p = parseInt(d.querySelector(".tp").value, 10);
      nuevas.push({
        id: d.getAttribute("data-id"),
        nombre: nombre,
        corte: (c >= 1 && c <= 31) ? c : null,
        pago:  (p >= 1 && p <= 31) ? p : null
      });
    });
    D().tarjetas = nuevas;
    APP.guardar(); APP.pintar(); pintarTarjetas();
  });
})();
