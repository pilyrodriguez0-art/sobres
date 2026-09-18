/* Sobres · núcleo: datos, sobres, registro de gastos, ajustes, historial, CSV, respaldo.
   Este archivo debe cargar ANTES que caja.js. */
var APP = (function(){
  "use strict";

  var LLAVE = "sobres-v2";
  var CASA  = "pilyrodriguez0-art.github.io";

  if(location.protocol.indexOf("http") === 0 &&
     location.hostname !== CASA && location.hostname !== "localhost" &&
     location.hostname !== "127.0.0.1"){
    location.replace("https://" + CASA + "/sobres/");
  }

  var $ = function(i){ return document.getElementById(i); };
  function nid(){ return Math.random().toString(36).slice(2,9); }
  function mesDe(f){ f = f || new Date(); return f.getFullYear()+"-"+String(f.getMonth()+1).padStart(2,"0"); }
  function mesPrevio(k){
    var a = +k.slice(0,4), m = +k.slice(5,7) - 1;
    if(m < 1){ m = 12; a--; }
    return a+"-"+String(m).padStart(2,"0");
  }
  function mesSiguiente(k){
    var a = +k.slice(0,4), m = +k.slice(5,7) + 1;
    if(m > 12){ m = 1; a++; }
    return a+"-"+String(m).padStart(2,"0");
  }
  function mesesDesde(desde, hasta){
    var out = [], a = +desde.slice(0,4), m = +desde.slice(5,7), g = 0;
    while(g++ < 600){
      var k = a+"-"+String(m).padStart(2,"0");
      if(k >= hasta) break;
      out.push(k); m++; if(m > 12){ m = 1; a++; }
    }
    return out;
  }
  function nombreMes(k){
    var d = new Date(+k.slice(0,4), +k.slice(5,7)-1, 1);
    var s = d.toLocaleDateString("es-GT",{month:"long", year:"numeric"});
    return s.charAt(0).toUpperCase()+s.slice(1);
  }
  function soloMes(k){
    var d = new Date(+k.slice(0,4), +k.slice(5,7)-1, 1);
    var s = d.toLocaleDateString("es-GT",{month:"long"});
    return s.charAt(0).toUpperCase()+s.slice(1);
  }
  function Q(n){
    var r = Math.round(n*100)/100;
    return "Q" + r.toLocaleString("es-GT",{minimumFractionDigits: r%1?2:0, maximumFractionDigits:2});
  }
  function diaCorto(f){
    return f ? new Date(f).toLocaleDateString("es-GT",{day:"numeric",month:"short"}) : "";
  }
  function diaLargo(f){
    return f ? f.toLocaleDateString("es-GT",{day:"numeric",month:"long"}) : "";
  }

  var SECCIONES = [
    {id:"fijos",      titulo:"Fijos"},
    {id:"salud",      titulo:"Salud"},
    {id:"compras",    titulo:"Compras"},
    {id:"transporte", titulo:"Transporte"},
    {id:"personales", titulo:"Personales"},
    {id:"ahorro",     titulo:"Ahorro"}
  ];

  var SEMILLA = {
    fijos:      ["Renta","Luz","Agua","Internet","Teléfono","Seguro médico"],
    salud:      ["Medicación","Otras medicinas","Sesión psicóloga","Sesión psiquiatra"],
    compras:    ["Mercado","Supermercado"],
    transporte: ["Uber","Transporte"],
    personales: ["Comida fuera","Ropa","Clases de capoeira","Paseos","Salidas con amigos",
                 "Artículos varios","Donaciones","Regalos","Imprevistos"],
    ahorro:     ["Ahorro"]
  };

  var MEDIOS_BASE = ["Efectivo","Débito","Transferencia"];
  function medios(){
    return MEDIOS_BASE.concat((datos && datos.tarjetas ? datos.tarjetas : [])
      .map(function(t){ return t.nombre; })
      .filter(function(n){ return !!n; }));
  }

  var datos = null;

  function nuevaCat(nombre, seccion, tipo, extra){
    var c = {id:nid(), nombre:nombre, seccion:seccion, tipo:tipo || "gasto",
             arrastra:false, pideNota:false, cuotas:null};
    if(extra){ for(var k in extra){ c[k] = extra[k]; } }
    return c;
  }

  function sembrar(){
    var cats = [], mes = mesDe();
    SEMILLA.fijos.forEach(function(n){ cats.push(nuevaCat(n, "fijos", "fijo")); });
    cats.push(nuevaCat("Sillón", "fijos", "fijo", {cuotas:{hasta:"2027-01"}}));
    SEMILLA.salud.forEach(function(n){ cats.push(nuevaCat(n, "salud", "gasto", {arrastra:true})); });
    SEMILLA.compras.forEach(function(n){ cats.push(nuevaCat(n, "compras", "gasto", {arrastra:true})); });
    SEMILLA.transporte.forEach(function(n){ cats.push(nuevaCat(n, "transporte")); });
    SEMILLA.personales.forEach(function(n){
      cats.push(nuevaCat(n, "personales", "gasto", {pideNota: (n === "Regalos" || n === "Imprevistos")}));
    });
    SEMILLA.ahorro.forEach(function(n){ cats.push(nuevaCat(n, "ahorro", "ahorro")); });

    return {
      v:6, inicio:mes, visto:mes,
      categorias: cats,
      presupuestos: {}, movimientos: [], plegados: {},
      ingresos: [], cortesPagados: {},
      fuentes: [
        {id:"f-sueldo", nombre:"Sueldo"},
        {id:"f-indep",  nombre:"Trabajo independiente"},
        {id:"f-venta",  nombre:"Ventas"},
        {id:"f-otro",   nombre:"Otros"}
      ],
      tarjetas: [
        {id:"t-visa", nombre:"Visa", corte:21, pago:15},
        {id:"t-mc",   nombre:"Mastercard", corte:21, pago:15}
      ]
    };
  }

  /* Junta los rubros de un grupo viejo en un solo sobre y conserva sus movimientos. */
  function migrarAgrupados(){
    if(!datos.grupos || !datos.grupos.length) return;
    datos.grupos.forEach(function(g){
      var hijos = datos.categorias.filter(function(c){ return c.grupo === g.id; });
      var ya = datos.categorias.filter(function(c){ return c.id === g.id; })[0];
      if(!ya){
        datos.categorias.push({
          id:g.id, nombre:g.nombre, seccion:"compras", tipo:"gasto",
          arrastra:true, pideNota:false, cuotas:null
        });
      }
      var ids = {};
      hijos.forEach(function(h){ ids[h.id] = true; });
      datos.movimientos.forEach(function(m){ if(ids[m.catId]){ m.catId = g.id; } });
      datos.categorias = datos.categorias.filter(function(c){ return !ids[c.id]; });
    });
    delete datos.grupos;
  }

  function cargar(){
    try{
      var crudo = localStorage.getItem(LLAVE);
      if(crudo){ datos = JSON.parse(crudo); }
    }catch(e){ datos = null; }
    if(!datos || !datos.categorias || !datos.categorias.length){ datos = sembrar(); return; }

    if(!datos.presupuestos){ datos.presupuestos = {}; }
    if(!datos.movimientos){ datos.movimientos = []; }
    if(!datos.plegados){ datos.plegados = {}; }
    if(!datos.ingresos){ datos.ingresos = []; }
    if(!datos.cortesPagados){ datos.cortesPagados = {}; }
    if(!datos.inicio){ datos.inicio = mesDe(); }
    if(!datos.fuentes){
      datos.fuentes = [
        {id:"f-sueldo", nombre:"Sueldo"},
        {id:"f-indep",  nombre:"Trabajo independiente"},
        {id:"f-venta",  nombre:"Ventas"},
        {id:"f-otro",   nombre:"Otros"}
      ];
    }
    if(!datos.tarjetas){
      datos.tarjetas = [
        {id:"t-visa", nombre:"Visa", corte:21, pago:15},
        {id:"t-mc",   nombre:"Mastercard", corte:21, pago:15}
      ];
    }

    if(!datos.v || datos.v < 6){
      datos.categorias.forEach(function(c){
        if(c.nombre === "Uber" || c.nombre === "Transporte"){ c.seccion = "transporte"; }
        if(c.nombre === "Comida fuera"){ c.seccion = "personales"; }
        if(c.seccion === "variables"){ c.seccion = "personales"; }
      });
      migrarAgrupados();
      /* la forma de pago habitual por sobre ya no se usa */
      datos.categorias.forEach(function(c){ delete c.medio; delete c.grupo; });
      datos.v = 6;
    }
  }

  function guardar(){
    try{ localStorage.setItem(LLAVE, JSON.stringify(datos)); }
    catch(e){ alert("No se pudo guardar. Puede que el almacenamiento esté lleno."); }
  }

  /* ---------- presupuestos y saldos ---------- */
  function presu(catId, mes){
    var p = datos.presupuestos[mes];
    return (p && typeof p[catId] === "number") ? p[catId] : 0;
  }
  function ponerPresu(catId, mes, monto){
    if(!datos.presupuestos[mes]){ datos.presupuestos[mes] = {}; }
    datos.presupuestos[mes][catId] = monto;
  }
  function gastado(catId, mes){
    var s = 0;
    for(var i=0;i<datos.movimientos.length;i++){
      var m = datos.movimientos[i];
      if(m.catId === catId && (!mes || m.fecha.slice(0,7) === mes)){ s += m.monto; }
    }
    return s;
  }
  function arrastre(c){
    if(!c.arrastra || c.tipo === "ahorro") return 0;
    var s = 0, ms = mesesDesde(datos.inicio, mesDe());
    for(var i=0;i<ms.length;i++){
      var p = presu(c.id, ms[i]);
      if(p > 0){ s += p - gastado(c.id, ms[i]); }
    }
    return s;
  }
  function disponible(c, mes){ return presu(c.id, mes) + arrastre(c); }

  function cuotasRestantes(c){
    if(!c.cuotas || !c.cuotas.hasta) return null;
    var mes = mesDe();
    if(mes > c.cuotas.hasta) return 0;
    var n = mesesDesde(mes, c.cuotas.hasta).length + 1;
    if(gastado(c.id, mes) > 0){ n -= 1; }
    return n;
  }

  /* Cómo pagó este sobre las últimas veces. */
  function recuerdoDePago(c){
    var ult = datos.movimientos
      .filter(function(m){ return m.catId === c.id && m.medio; })
      .sort(function(a,b){ return a.fecha < b.fecha ? 1 : -1; })
      .slice(0, 6);
    if(ult.length < 2) return "";
    var cuenta = {};
    ult.forEach(function(m){ cuenta[m.medio] = (cuenta[m.medio] || 0) + 1; });
    var top = null;
    Object.keys(cuenta).forEach(function(k){
      if(!top || cuenta[k] > top.n){ top = {medio:k, n:cuenta[k]}; }
    });
    if(!top || top.n / ult.length < 0.6) return "";
    if(top.n === ult.length){
      return "Las últimas " + ult.length + " veces pagaste con " + top.medio + ".";
    }
    return "Solés pagarlo con " + top.medio + " (" + top.n + " de las últimas " + ult.length + ").";
  }

  function revisarMes(){
    var mes = mesDe();
    if(datos.visto === mes) return false;
    var prev = mesPrevio(mes), copiado = false;
    if(datos.presupuestos[prev] && !datos.presupuestos[mes]){
      datos.presupuestos[mes] = JSON.parse(JSON.stringify(datos.presupuestos[prev]));
      copiado = true;
    }
    datos.visto = mes;
    guardar();
    return copiado;
  }

  /* ---------- pintado ---------- */
  function filaHTML(){
    var b = document.createElement("button");
    b.className = "fila";
    b.innerHTML = '<span class="top"><span class="nom"></span><span class="cifra val"></span></span>' +
                  '<span class="barra"><i></i></span><span class="nota"></span>';
    return b;
  }
  function sinBarra(b){
    var x = b.querySelector(".barra");
    if(x){ x.remove(); }
  }

  function nodoCat(c, mes){
    var b = filaHTML();
    b.setAttribute("data-cat", c.id);
    b.querySelector(".nom").textContent = c.nombre;
    var val = b.querySelector(".val"), nota = b.querySelector(".nota"), rell = b.querySelector("i");

    if(c.tipo === "ahorro"){
      var junta = gastado(c.id, null), meta = presu(c.id, mes);
      val.textContent = Q(junta);
      rell.style.width = (meta > 0 ? Math.min(1, junta/meta)*100 : 0) + "%";
      nota.textContent = meta > 0
        ? "llevás juntado · meta " + Q(meta) + " · falta " + Q(Math.max(meta - junta, 0))
        : "llevás juntado · sin meta";
      return b;
    }

    var g = gastado(c.id, mes), p = presu(c.id, mes), disp = disponible(c, mes);

    if(c.tipo === "fijo"){
      var cuot = cuotasRestantes(c);
      var pagado = g > 0, t;
      if(pagado){ b.className += " pagado"; }
      val.textContent = pagado ? Q(g) : (p > 0 ? Q(p) : "—");
      sinBarra(b);
      if(pagado){
        var ult = null;
        datos.movimientos.forEach(function(m){
          if(m.catId === c.id && m.fecha.slice(0,7) === mes){
            if(!ult || m.fecha > ult){ ult = m.fecha; }
          }
        });
        t = "pagado" + (ult ? " el " + diaCorto(ult) : "");
      }else{
        t = (p > 0 ? "por pagar" : "sin monto · tocá para registrar");
      }
      if(cuot !== null && cuot > 0){ t += " · quedan " + cuot + (cuot === 1 ? " cuota" : " cuotas"); }
      if(!pagado && p > 0){ t += " · esperado " + Q(p); }
      nota.textContent = t;
      return b;
    }

    if(p <= 0 && arrastre(c) === 0){
      val.textContent = Q(g);
      sinBarra(b);
      nota.textContent = g > 0 ? "llevás gastado · sin monto" : "sin movimientos este mes";
      return b;
    }

    var queda = disp - g;
    if(queda < 0){ b.className += " pasado"; }
    val.textContent = Q(Math.max(queda, 0));
    rell.style.width = (disp > 0 ? Math.max(0, Math.min(1, queda/disp))*100 : 100) + "%";
    var arr = arrastre(c), txt;
    txt = queda >= 0 ? "te quedan de " + Q(disp) : "te pasaste por " + Q(-queda) + " de " + Q(disp);
    if(Math.round(arr) > 0){ txt += " (Q" + Math.round(arr) + " arrastrados)"; }
    else if(Math.round(arr) < 0){ txt += " (Q" + Math.round(-arr) + " de saldo negativo)"; }
    txt += " · llevás " + Q(g);
    nota.textContent = txt;
    return b;
  }

  function pintar(){
    var mes = mesDe();
    $("mes").textContent = nombreMes(mes);
    var tab = $("tablero");
    tab.innerHTML = "";
    var totalDisp = 0, totalGas = 0, pasados = 0, fijosPend = 0;

    SECCIONES.forEach(function(sec){
      var propias = datos.categorias.filter(function(c){ return c.seccion === sec.id; });
      if(!propias.length) return;

      var secGas = 0, secPre = 0, cuantos = 0;
      var cont = document.createElement("div");
      cont.className = "contenido";

      propias.forEach(function(c){
        if(c.tipo === "fijo" && cuotasRestantes(c) === 0) return;
        if(c.tipo === "fijo" && gastado(c.id, mes) === 0 && presu(c.id, mes) > 0){ fijosPend++; }
        cont.appendChild(nodoCat(c, mes));
        cuantos++;
        var g = gastado(c.id, mes);
        secGas += g; secPre += presu(c.id, mes);
        if(c.tipo !== "ahorro" && presu(c.id, mes) > 0){
          totalDisp += disponible(c, mes); totalGas += g;
          if(disponible(c, mes) - g < 0){ pasados++; }
        }
      });

      var plegada = datos.plegados["sec-" + sec.id] !== false;
      if(plegada){ cont.style.display = "none"; }

      var cab = filaHTML();
      cab.className = "fila seccion";
      cab.setAttribute("data-seccion", sec.id);
      cab.setAttribute("aria-expanded", plegada ? "false" : "true");
      cab.querySelector(".nom").textContent = sec.titulo;
      var chev = document.createElement("span");
      chev.className = "chev";
      chev.textContent = plegada ? "▸" : "▾";
      cab.querySelector(".nom").appendChild(chev);
      cab.querySelector(".val").textContent = Q(secGas);
      sinBarra(cab);
      cab.querySelector(".nota").textContent = secPre > 0
        ? "gastado · de " + Q(secPre) + " presupuestados · " + cuantos + " sobres"
        : "gastado · sin montos · " + cuantos + " sobres";
      if(secPre > 0 && secGas > secPre){ cab.className += " pasado"; }

      tab.appendChild(cab);
      tab.appendChild(cont);
    });

    var gastoMes = 0;
    datos.movimientos.forEach(function(m){
      if(m.fecha.slice(0,7) !== mes) return;
      var c = datos.categorias.filter(function(x){ return x.id === m.catId; })[0];
      if(c && c.tipo === "ahorro") return;
      gastoMes += m.monto;
    });

    $("totalQueda").textContent = Q(gastoMes);
    var pie = ["llevás gastado este mes"];
    if(pasados){ pie.push(pasados + (pasados === 1 ? " sobre pasado" : " sobres pasados")); }
    if(fijosPend){ pie.push(fijosPend + (fijosPend === 1 ? " fijo por pagar" : " fijos por pagar")); }
    $("totalPie").textContent = pie.join(" · ");

    var seg = totalDisp > 0
      ? "Te quedan " + Q(Math.max(totalDisp - totalGas, 0)) + " de " + Q(totalDisp) + " presupuestados"
      : "Todavía no asignaste montos";
    var ing = datos.ingresos.reduce(function(s,i){
      return i.fecha.slice(0,7) === mes ? s + i.monto : s;
    }, 0);
    if(ing > 0){ seg += " · entraron " + Q(ing) + " este mes"; }
    $("totalSegunda").textContent = seg;
  }

  function aviso(texto, accion, etiqueta){
    var d = document.createElement("div");
    d.className = "banner";
    var s = document.createElement("span");
    s.textContent = texto + " ";
    if(accion){
      var a = document.createElement("button");
      a.textContent = etiqueta;
      a.addEventListener("click", accion);
      s.appendChild(a);
    }
    d.appendChild(s);
    var x = document.createElement("button");
    x.className = "cerrar";
    x.setAttribute("aria-label", "Cerrar aviso");
    x.textContent = "×";
    x.addEventListener("click", function(){ d.remove(); });
    d.appendChild(x);
    $("avisos").appendChild(d);
  }

  /* ---------- hojas ---------- */
  var HOJAS = ["hojaMonto","hojaAjustes","hojaHist","hojaCaja","hojaTar","hojaResp"];
  function abrir(id){ $("fondo").classList.add("ver"); $(id).classList.add("ver"); }
  function cerrarTodo(){
    $("fondo").classList.remove("ver");
    HOJAS.forEach(function(h){ var e = $(h); if(e){ e.classList.remove("ver"); } });
    activa = null;
  }
  $("fondo").addEventListener("click", cerrarTodo);
  Array.prototype.forEach.call(document.querySelectorAll("[data-cerrar]"), function(b){
    b.addEventListener("click", cerrarTodo);
  });

  /* ---------- registro ---------- */
  var activa = null, buffer = "", medio = null;

  function pintarMedios(){
    var c = $("medios");
    c.innerHTML = "";
    medios().forEach(function(m){
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-medio", m);
      b.setAttribute("aria-pressed", m === medio ? "true" : "false");
      b.textContent = m;
      c.appendChild(b);
    });
  }
  $("medios").addEventListener("click", function(e){
    var b = e.target.closest("button[data-medio]");
    if(!b) return;
    medio = b.getAttribute("data-medio");
    pintarMedios();
    refrescarBotones();
    if(APP.avisarCiclo){ APP.avisarCiclo(medio); }
  });

  function refrescarBotones(){
    var ok = parseFloat(buffer) > 0 && !!medio;
    $("btnGuardar").disabled = !ok;
    var soloM = $("btnSoloMonto");
    soloM.disabled = !(parseFloat(buffer) > 0);
  }
  function pintarMonto(){
    $("pantalla").textContent = "Q" + (buffer === "" ? "0" : buffer);
    refrescarBotones();
  }

  function abrirMonto(c){
    activa = c;
    buffer = "";
    medio = null;
    var mes = mesDe();
    if(c.tipo === "fijo" && presu(c.id, mes) > 0 && gastado(c.id, mes) === 0){
      buffer = String(presu(c.id, mes));
    }
    $("tMonto").textContent = c.nombre;
    var sub;
    if(c.tipo === "ahorro"){
      sub = "Llevás " + Q(gastado(c.id, null)) + " juntados";
      $("btnGuardar").textContent = "Guardar abono";
    }else if(c.tipo === "fijo"){
      sub = gastado(c.id, mes) > 0
        ? "Ya registraste " + Q(gastado(c.id, mes)) + " este mes"
        : (presu(c.id, mes) > 0
            ? "Monto esperado. Corregilo si el recibo vino distinto."
            : "Sin monto esperado.");
      $("btnGuardar").textContent = "Marcar como pagado";
    }else{
      var p = presu(c.id, mes);
      sub = (p > 0 || arrastre(c) !== 0)
        ? "Te quedan " + Q(disponible(c, mes) - gastado(c.id, mes)) + " este mes"
        : "Sin monto asignado · solo se registra";
      $("btnGuardar").textContent = "Guardar gasto";
    }
    $("sMonto").textContent = sub;
    $("recuerdo").textContent = recuerdoDePago(c);
    $("txtNota").value = "";
    $("cajaNota").hidden = !c.pideNota;
    $("verNota").hidden = c.pideNota;
    $("btnSoloMonto").hidden = (c.tipo !== "fijo");
    pintarMedios();
    pintarMonto();
    if(APP.avisarCiclo){ APP.avisarCiclo(null); }
    abrir("hojaMonto");
  }

  $("verNota").addEventListener("click", function(){
    $("cajaNota").hidden = false;
    this.hidden = true;
    $("txtNota").focus();
  });

  $("teclado").addEventListener("click", function(e){
    var t = e.target.getAttribute("data-t");
    if(t === null) return;
    if(t === "b"){ buffer = buffer.slice(0,-1); }
    else if(t === "."){ if(buffer.indexOf(".") === -1 && buffer !== ""){ buffer += "."; } }
    else{
      var p = buffer.split(".");
      if(p[1] && p[1].length >= 2) return;
      if(buffer.replace(".","").length >= 9) return;
      buffer += t;
    }
    pintarMonto();
  });

  $("btnGuardar").addEventListener("click", function(){
    var monto = parseFloat(buffer);
    if(!(monto > 0) || !activa || !medio) return;
    var mov = {id:nid(), catId:activa.id, monto:monto, fecha:new Date().toISOString(), medio:medio};
    var nota = $("txtNota").value.trim();
    if(nota){ mov.nota = nota; }
    datos.movimientos.push(mov);
    guardar(); pintar(); cerrarTodo();
  });

  $("btnSoloMonto").addEventListener("click", function(){
    var m = parseFloat(buffer);
    if(!(m > 0) || !activa) return;
    ponerPresu(activa.id, mesDe(), m);
    guardar(); pintar(); cerrarTodo();
  });

  $("tablero").addEventListener("click", function(e){
    var sb = e.target.closest("button.seccion");
    if(sb){
      var sid = "sec-" + sb.getAttribute("data-seccion");
      datos.plegados[sid] = datos.plegados[sid] === false ? true : false;
      guardar(); pintar();
      return;
    }
    var b = e.target.closest("button.fila");
    if(!b) return;
    var c = datos.categorias.filter(function(x){ return x.id === b.getAttribute("data-cat"); })[0];
    if(c){ abrirMonto(c); }
  });

  /* ---------- ajustes ---------- */
  function filaCfg(c){
    var mes = mesDe();
    var d = document.createElement("div");
    d.className = "cfg";
    d.setAttribute("data-id", c.id);
    d.innerHTML =
      '<div class="l1"><input type="text" class="n" aria-label="Nombre">' +
      '<input type="number" class="mo" inputmode="decimal" min="0" step="1" aria-label="Monto del mes">' +
      '<button class="quitar" type="button">Quitar</button></div>' +
      '<div class="l2"><label><input type="checkbox" class="ar"> Arrastra saldo</label>' +
      '<label><input type="checkbox" class="nt"> Pide nota</label></div>';
    d.querySelector(".n").value = c.nombre;
    var p = presu(c.id, mes);
    d.querySelector(".mo").value = p > 0 ? p : "";
    d.querySelector(".ar").checked = !!c.arrastra;
    d.querySelector(".nt").checked = !!c.pideNota;
    if(c.tipo === "ahorro"){ d.querySelector(".ar").disabled = true; }
    d.querySelector(".quitar").addEventListener("click", function(){
      if(confirm("\u00bfQuitar " + c.nombre + "? Sus movimientos quedan en el historial.")){ d.remove(); }
    });
    return d;
  }

  function abrirAjustes(){
    var cont = $("campos"), mes = mesDe();
    cont.innerHTML = "";
    $("sAj").textContent = "Montos de " + nombreMes(mes) + ". Dejalo vacío si este mes solo querés medir.";
    SECCIONES.forEach(function(sec){
      var propias = datos.categorias.filter(function(c){ return c.seccion === sec.id; });
      if(!propias.length) return;
      var r = document.createElement("p");
      r.className = "subrotulo";
      r.textContent = sec.titulo.toUpperCase();
      cont.appendChild(r);
      propias.forEach(function(c){ cont.appendChild(filaCfg(c)); });
    });
    abrir("hojaAjustes");
  }
  $("btnAjustes").addEventListener("click", abrirAjustes);

  $("agregarCat").addEventListener("click", function(){
    var c = nuevaCat("", "personales");
    datos.categorias.push(c);
    var f = filaCfg(c);
    $("campos").appendChild(f);
    f.querySelector(".n").focus();
  });

  $("guardarAjustes").addEventListener("click", function(){
    var mes = mesDe(), vivos = {};
    Array.prototype.forEach.call($("campos").querySelectorAll(".cfg"), function(d){
      var id = d.getAttribute("data-id");
      var nombre = d.querySelector(".n").value.trim();
      if(!nombre) return;
      vivos[id] = true;
      var monto = parseFloat(d.querySelector(".mo").value);
      if(!(monto > 0)){ monto = 0; }
      ponerPresu(id, mes, monto);
      var c = datos.categorias.filter(function(x){ return x.id === id; })[0];
      if(c){
        c.nombre = nombre;
        c.arrastra = d.querySelector(".ar").checked;
        c.pideNota = d.querySelector(".nt").checked;
      }
    });
    datos.categorias = datos.categorias.filter(function(c){ return vivos[c.id]; });
    guardar(); pintar(); cerrarTodo();
  });

  /* ---------- historial ---------- */
  $("btnHistorial").addEventListener("click", function(){
    var cont = $("movimientos");
    cont.innerHTML = "";
    var todos = datos.movimientos.slice().sort(function(a,b){ return a.fecha < b.fecha ? 1 : -1; });
    $("sHist").textContent = todos.length
      ? todos.length + (todos.length === 1 ? " movimiento en total" : " movimientos en total")
      : "Todavía no hay movimientos.";
    var mesAct = null;
    todos.slice(0, 400).forEach(function(m){
      var k = m.fecha.slice(0,7);
      if(k !== mesAct){
        mesAct = k;
        var r = document.createElement("p");
        r.className = "subrotulo";
        r.textContent = nombreMes(k).toUpperCase();
        cont.appendChild(r);
      }
      var c = datos.categorias.filter(function(x){ return x.id === m.catId; })[0];
      var f = new Date(m.fecha);
      var d = document.createElement("div");
      d.className = "mov";
      d.innerHTML = '<span><span class="nm"></span><small></small></span>' +
                    '<span class="der"><span class="cifra mt"></span>' +
                    '<button class="quitar" type="button">Borrar</button></span>';
      d.querySelector(".nm").textContent = c ? c.nombre : "Sobre eliminado";
      var pie = f.toLocaleDateString("es-GT",{day:"numeric",month:"short"}) + " · " +
                f.toLocaleTimeString("es-GT",{hour:"numeric",minute:"2-digit"});
      if(m.medio){ pie += " · " + m.medio; }
      if(m.nota){ pie += " · " + m.nota; }
      d.querySelector("small").textContent = pie;
      d.querySelector(".mt").textContent = (c && c.tipo === "ahorro" ? "+" : "") + Q(m.monto);
      d.querySelector(".quitar").addEventListener("click", function(){
        datos.movimientos = datos.movimientos.filter(function(x){ return x.id !== m.id; });
        guardar(); pintar(); d.remove();
      });
      cont.appendChild(d);
    });
    abrir("hojaHist");
  });

  /* ---------- CSV ---------- */
  function esc(v){
    v = (v === undefined || v === null) ? "" : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
  }
  function csv(){
    var lineas = [["tipo","fecha","hora","seccion","sobre_o_fuente","monto","forma_de_pago","nota","presupuesto_del_mes"].join(",")];
    datos.movimientos.slice().sort(function(a,b){ return a.fecha < b.fecha ? -1 : 1; }).forEach(function(m){
      var c = datos.categorias.filter(function(x){ return x.id === m.catId; })[0];
      var f = new Date(m.fecha);
      lineas.push([
        "gasto", esc(m.fecha.slice(0,10)), esc(f.toTimeString().slice(0,5)),
        esc(c ? c.seccion : ""), esc(c ? c.nombre : "eliminado"),
        esc(m.monto), esc(m.medio || ""), esc(m.nota || ""),
        esc(c ? presu(c.id, m.fecha.slice(0,7)) : "")
      ].join(","));
    });
    datos.ingresos.slice().sort(function(a,b){ return a.fecha < b.fecha ? -1 : 1; }).forEach(function(i){
      var fu = datos.fuentes.filter(function(x){ return x.id === i.fuenteId; })[0];
      lineas.push([
        "ingreso", esc(i.fecha.slice(0,10)), "", "ingresos",
        esc(fu ? fu.nombre : "otra"), esc(i.monto), "", esc(i.nota || ""), ""
      ].join(","));
    });
    return lineas.join("\n");
  }
  $("btnCsv").addEventListener("click", function(){
    var blob = new Blob(["\ufeff" + csv()], {type:"text/csv;charset=utf-8"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "sobres-" + mesDe() + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1500);
  });

  /* ---------- respaldo ---------- */
  $("btnRespaldo").addEventListener("click", function(){
    $("areaResp").value = JSON.stringify(datos);
    abrir("hojaResp");
  });
  $("restaurar").addEventListener("click", function(){
    try{
      var n = JSON.parse($("areaResp").value);
      if(!n.categorias || !n.movimientos){ throw new Error("formato"); }
      datos = n;
      cargar.normaliza = null;
      if(!datos.presupuestos){ datos.presupuestos = {}; }
      if(!datos.plegados){ datos.plegados = {}; }
      if(!datos.ingresos){ datos.ingresos = []; }
      if(!datos.fuentes){ datos.fuentes = []; }
      if(!datos.tarjetas){ datos.tarjetas = []; }
      if(!datos.cortesPagados){ datos.cortesPagados = {}; }
      if(!datos.inicio){ datos.inicio = mesDe(); }
      guardar(); pintar(); cerrarTodo();
    }catch(e){
      alert("Ese texto no tiene el formato correcto. Pegá el respaldo completo, desde la primera llave hasta la última.");
    }
  });

  /* ---------- modo claro / oscuro ---------- */
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  function modo(){ document.documentElement.setAttribute("data-m", mq.matches ? "oscuro" : "claro"); }
  mq.addEventListener("change", modo);
  modo();

  /* ---------- arranque ---------- */
  cargar();
  var copiado = revisarMes();
  guardar();
  pintar();

  if(copiado){
    aviso("Mes nuevo. Copié los montos del mes pasado —", abrirAjustes, "revisalos");
  }
  if(/iPad|iPhone|iPod/.test(navigator.userAgent) &&
     navigator.standalone === false && location.protocol.indexOf("http") === 0){
    aviso("Estás en Safari. Agregá Sobres a la pantalla de inicio y usalo siempre desde el ícono.");
  }

  /* Lo que caja.js necesita */
  return {
    $: $, nid: nid, Q: Q, esc: esc,
    mesDe: mesDe, mesSiguiente: mesSiguiente, nombreMes: nombreMes, soloMes: soloMes,
    diaCorto: diaCorto, diaLargo: diaLargo,
    medios: medios, abrir: abrir, cerrarTodo: cerrarTodo,
    guardar: guardar, pintar: pintar,
    presu: presu, gastado: gastado, disponible: disponible, cuotasRestantes: cuotasRestantes,
    datosRef: function(){ return datos; }
  };
})();
