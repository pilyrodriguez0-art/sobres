/* Sobres · núcleo: datos, categorías, subcategorías, registro, presupuesto,
   movimientos, CSV y respaldo. Debe cargar ANTES que caja.js. */
var APP = (function(){
  "use strict";

  var LLAVE = "sobres-v2";

  /* ---------- utilidades ---------- */
  var $ = function(i){ return document.getElementById(i); };
  function nid(){ return Math.random().toString(36).slice(2,9); }
  function dos(n){ return String(n).padStart(2,"0"); }
  function mesDe(f){ f = f || new Date(); return f.getFullYear()+"-"+dos(f.getMonth()+1); }
  function aISO(d){ return d.getFullYear()+"-"+dos(d.getMonth()+1)+"-"+dos(d.getDate()); }
  function mesPrevio(k){
    var a = +k.slice(0,4), m = +k.slice(5,7) - 1;
    if(m < 1){ m = 12; a--; }
    return a+"-"+dos(m);
  }
  function mesSiguiente(k){
    var a = +k.slice(0,4), m = +k.slice(5,7) + 1;
    if(m > 12){ m = 1; a++; }
    return a+"-"+dos(m);
  }
  function mesesDesde(desde, hasta){
    var out = [], k = desde, g = 0;
    while(k < hasta && g++ < 600){ out.push(k); k = mesSiguiente(k); }
    return out;
  }
  function capital(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
  function nombreMes(k){
    var d = new Date(+k.slice(0,4), +k.slice(5,7)-1, 1);
    return capital(d.toLocaleDateString("es-GT",{month:"long", year:"numeric"}));
  }
  function soloMes(k){
    var d = new Date(+k.slice(0,4), +k.slice(5,7)-1, 1);
    return capital(d.toLocaleDateString("es-GT",{month:"long"}));
  }
  function Q(n){
    var r = Math.round(n*100)/100;
    return "Q" + r.toLocaleString("es-GT",{minimumFractionDigits: r%1?2:0, maximumFractionDigits:2});
  }
  function diaCorto(f){ return f ? new Date(f).toLocaleDateString("es-GT",{day:"numeric",month:"short"}) : ""; }
  function diaLargo(f){ return f ? f.toLocaleDateString("es-GT",{day:"numeric",month:"long"}) : ""; }
  function norm(s){
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
  }

  /* ---------- estructura base ---------- */
  var CATS_BASE = [
    {id:"c-fijos",   nombre:"Fijos",       comp:"fijo"},
    {id:"c-memb",    nombre:"Membresías",  comp:"fijo"},
    {id:"c-salud",   nombre:"Salud",       comp:"variable"},
    {id:"c-compras", nombre:"Compras",     comp:"variable"},
    {id:"c-trans",   nombre:"Transporte",  comp:"variable"},
    {id:"c-pers",    nombre:"Personales",  comp:"variable"},
    {id:"c-ahorro",  nombre:"Ahorro",      comp:"ahorro"}
  ];
  /* Subcategorías con que arranca quien ya usaba la versión anterior. */
  var SUBS_MIGRACION = {
    "c-fijos":   ["Renta","Luz","Agua","Internet","Teléfono","Seguro médico"],
    "c-salud":   ["Medicación"],
    "c-compras": ["Mercado","Supermercado"],
    "c-trans":   ["Uber"],
    "c-ahorro":  ["Ahorro"]
  };
  var MEDIOS_BASE = ["Efectivo","Transferencia"];

  var datos = null;

  function copiaCats(){ return CATS_BASE.map(function(c){ return {id:c.id, nombre:c.nombre, comp:c.comp}; }); }
  function nuevaSub(catId, nombre, comp){
    return {id:nid(), catId:catId, nombre:nombre, arrastra:(comp === "variable"), pideNota:false, cuotas:null};
  }
  function fuentesIniciales(){
    return [{id:"f-sueldo",nombre:"Sueldo"},{id:"f-indep",nombre:"Trabajo independiente"},
            {id:"f-venta",nombre:"Ventas"},{id:"f-otro",nombre:"Otros"}];
  }

  function sembrar(){
    var hoy = new Date();
    return {
      v:8, inicio:mesDe(), visto:mesDe(), inicioRegistro:aISO(hoy),
      categorias: copiaCats(), subs: [],
      presupuestos:{}, movimientos:[], ingresos:[], fuentes:fuentesIniciales(),
      tarjetas:[
        {id:nid(), nombre:"Tarjeta de crédito", tipo:"credito", red:"Visa", color:null, corte:null, pago:null},
        {id:nid(), nombre:"Tarjeta de débito",  tipo:"debito",  red:"Visa", color:null, corte:null, pago:null}
      ],
      pagosTarjeta:[], montosCorte:{}, cortesPagados:{}, plegados:{}
    };
  }

  /* De la versión de sobres sueltos a categorías con subcategorías, arrancando en cero. */
  function migrarV8(){
    var tarjetas = (datos.tarjetas || []).map(function(t){
      return {id:t.id || nid(), nombre:t.nombre, tipo:t.tipo || "credito",
              red:t.red || (t.nombre === "Mastercard" ? "Mastercard" : "Visa"),
              color:(t.color === undefined ? null : t.color),
              corte:(datos.v >= 7 ? t.corte : null), pago:(datos.v >= 7 ? t.pago : null)};
    });
    if(!tarjetas.some(function(t){ return t.tipo === "debito"; })){
      tarjetas.push({id:nid(), nombre:"Débito", tipo:"debito", red:"Visa", color:null, corte:null, pago:null});
    }
    var cats = copiaCats(), subs = [];
    cats.forEach(function(c){
      (SUBS_MIGRACION[c.id] || []).forEach(function(n){ subs.push(nuevaSub(c.id, n, c.comp)); });
    });
    datos = {
      v:8, inicio:mesDe(), visto:mesDe(), inicioRegistro:"2026-10-01",
      categorias:cats, subs:subs,
      presupuestos:{}, movimientos:[], ingresos:[],
      fuentes:(datos.fuentes && datos.fuentes.length) ? datos.fuentes : fuentesIniciales(),
      tarjetas:tarjetas, pagosTarjeta:[], montosCorte:{}, cortesPagados:{}, plegados:{}
    };
  }

  function normalizar(){
    ["presupuestos","montosCorte","cortesPagados","plegados"].forEach(function(k){ if(!datos[k]){ datos[k] = {}; } });
    ["movimientos","ingresos","pagosTarjeta","subs","tarjetas"].forEach(function(k){ if(!datos[k]){ datos[k] = []; } });
    if(!datos.fuentes){ datos.fuentes = fuentesIniciales(); }
    if(!datos.categorias || !datos.categorias.length){ datos.categorias = copiaCats(); }
    if(!datos.inicio){ datos.inicio = mesDe(); }
    if(!datos.inicioRegistro){ datos.inicioRegistro = aISO(new Date()); }
  }

  function cargar(){
    try{
      var crudo = localStorage.getItem(LLAVE);
      if(crudo){ datos = JSON.parse(crudo); }
    }catch(e){ datos = null; }
    if(!datos){ datos = sembrar(); return; }
    if(!datos.v || datos.v < 8){ migrarV8(); }
    normalizar();
  }
  function guardar(){
    try{ localStorage.setItem(LLAVE, JSON.stringify(datos)); }
    catch(e){ alert("No se pudo guardar. Puede que el almacenamiento esté lleno."); }
  }

  /* ---------- consultas ---------- */
  function catDe(id){ return datos.categorias.filter(function(c){ return c.id === id; })[0] || null; }
  function subDe(id){ return datos.subs.filter(function(s){ return s.id === id; })[0] || null; }
  function cuotaActiva(s, mes){ return !s.cuotas || !s.cuotas.hasta || mes <= s.cuotas.hasta; }
  function subsDe(catId, mes){
    mes = mes || mesDe();
    return datos.subs.filter(function(s){ return s.catId === catId && cuotaActiva(s, mes); });
  }
  function compDe(s){
    if(s.cuotas) return "fijo";
    var c = catDe(s.catId);
    return c ? c.comp : "variable";
  }
  function presu(id, mes){
    var p = datos.presupuestos[mes];
    return (p && typeof p[id] === "number") ? p[id] : 0;
  }
  function ponerPresu(id, mes, monto){
    if(!datos.presupuestos[mes]){ datos.presupuestos[mes] = {}; }
    if(monto > 0){ datos.presupuestos[mes][id] = monto; }
    else { delete datos.presupuestos[mes][id]; }
  }
  function gastadoSub(id, mes){
    var s = 0;
    datos.movimientos.forEach(function(m){
      if(m.subId === id && (!mes || m.fecha.slice(0,7) === mes)){ s += m.monto; }
    });
    return s;
  }
  function gastadoCat(catId, mes){
    var ids = {};
    datos.subs.forEach(function(s){ if(s.catId === catId){ ids[s.id] = true; } });
    var s = 0;
    datos.movimientos.forEach(function(m){
      if(ids[m.subId] && (!mes || m.fecha.slice(0,7) === mes)){ s += m.monto; }
    });
    return s;
  }
  function esperado(s, mes){
    var p = presu(s.id, mes);
    if(p > 0) return p;
    return (s.cuotas && cuotaActiva(s, mes)) ? (s.cuotas.monto || 0) : 0;
  }
  function arrastre(s){
    if(!s.arrastra || compDe(s) !== "variable") return 0;
    var t = 0, ms = mesesDesde(datos.inicio, mesDe());
    ms.forEach(function(k){
      var p = presu(s.id, k);
      if(p > 0){ t += p - gastadoSub(s.id, k); }
    });
    return t;
  }
  function disponible(s, mes){ return presu(s.id, mes) + arrastre(s); }
  function cuotasRestantes(s){
    if(!s.cuotas || !s.cuotas.hasta) return null;
    var mes = mesDe();
    if(mes > s.cuotas.hasta) return 0;
    var n = mesesDesde(mes, s.cuotas.hasta).length + 1;
    if(gastadoSub(s.id, mes) > 0){ n -= 1; }
    return n;
  }
  /* Referencia de una categoría: su tope, o si no tiene, lo que suman sus subcategorías. */
  function refCat(c, mes){
    var p = presu(c.id, mes);
    if(p > 0) return p;
    return subsDe(c.id, mes).reduce(function(t, s){
      return t + (compDe(s) === "fijo" ? esperado(s, mes) : presu(s.id, mes));
    }, 0);
  }

  /* ---------- tarjetas: color y dibujo ---------- */
  var HUES = [0,340,280,215,185,145,48,25,-1];
  var LUCES = [86,72,58,44,30];
  function colorFondo(col){
    if(!col) return "#9A9A96";
    return col.h < 0 ? "hsl(30,4%," + col.l + "%)" : "hsl(" + col.h + ",55%," + col.l + "%)";
  }
  function colorTexto(col){
    if(!col) return "#FFFFFF";
    if(col.l >= 58){ return col.h < 0 ? "hsl(30,6%,18%)" : "hsl(" + col.h + ",45%,18%)"; }
    return "#FFFFFF";
  }
  function tarjetaNodo(t, chica){
    var d = document.createElement("div");
    d.className = "tarjeta" + (chica ? " chica" : "");
    d.style.background = colorFondo(t.color);
    d.style.color = colorTexto(t.color);
    [["tNom", t.nombre || "Sin nombre"], ["tChip", ""],
     ["tTipo", t.tipo === "debito" ? "Débito" : "Crédito"], ["tRed", t.red || ""]].forEach(function(p){
      var e = document.createElement("div");
      e.className = p[0]; e.textContent = p[1];
      d.appendChild(e);
    });
    return d;
  }
  function medios(){
    return (datos.tarjetas || []).map(function(t){ return t.nombre; })
      .filter(function(n){ return !!n; }).concat(MEDIOS_BASE);
  }
  function tarjetaPorNombre(n){
    return (datos.tarjetas || []).filter(function(t){ return t.nombre === n; })[0] || null;
  }
  function esCredito(n){ var t = tarjetaPorNombre(n); return !!(t && t.tipo === "credito"); }

  function recuerdoDePago(subId){
    var ult = datos.movimientos
      .filter(function(m){ return m.subId === subId && m.medio; })
      .sort(function(a,b){ return a.fecha < b.fecha ? 1 : -1; }).slice(0, 6);
    if(ult.length < 2) return "";
    var cuenta = {}, top = null;
    ult.forEach(function(m){ cuenta[m.medio] = (cuenta[m.medio] || 0) + 1; });
    Object.keys(cuenta).forEach(function(k){ if(!top || cuenta[k] > top.n){ top = {medio:k, n:cuenta[k]}; } });
    if(!top || top.n / ult.length < 0.6) return "";
    if(top.n === ult.length){ return "Las últimas " + ult.length + " veces pagaste con " + top.medio + "."; }
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

  /* ---------- pestañas y hojas ---------- */
  var alMostrar = {};
  var tabActual = "sobres";
  function mostrarTab(k){
    tabActual = k;
    ["sobres","pres","caja","tar","mas"].forEach(function(x){ $("v-" + x).hidden = (x !== k); });
    Array.prototype.forEach.call($("tabs").querySelectorAll("button"), function(b){
      if(b.getAttribute("data-tab") === k){ b.setAttribute("aria-current","page"); }
      else { b.removeAttribute("aria-current"); }
    });
    if(k === "sobres"){ pintar(); }
    if(k === "pres"){ pintarPres(); }
    if(alMostrar[k]){ alMostrar[k](); }
    $("scroller").scrollTop = 0;
  }
  $("tabs").addEventListener("click", function(e){
    var b = e.target.closest("button[data-tab]");
    if(b){ mostrarTab(b.getAttribute("data-tab")); }
  });

  var HOJAS = ["hojaReg","hojaHist","hojaResp","hojaIng","hojaEdCat"];
  function abrir(id){ $("fondo").classList.add("ver"); $(id).classList.add("ver"); $(id).scrollTop = 0; }
  function cerrarTodo(){
    $("fondo").classList.remove("ver");
    HOJAS.forEach(function(h){ $(h).classList.remove("ver"); });
  }
  $("fondo").addEventListener("click", cerrarTodo);

  var ACCION_ARRIBA = { hojaEdCat: "edGuardar" };
  HOJAS.forEach(function(id){
    var h = $(id), titulo = h.querySelector("h2");
    var barra = document.createElement("div");
    barra.className = "barraHoja";
    var atras = document.createElement("button");
    atras.type = "button"; atras.className = "atras";
    atras.setAttribute("aria-label", "Volver");
    atras.textContent = "\u2190";
    atras.addEventListener("click", cerrarTodo);
    barra.appendChild(atras);
    h.insertBefore(barra, h.firstChild);
    barra.appendChild(titulo);
    if(ACCION_ARRIBA[id]){
      var g = document.createElement("button");
      g.type = "button"; g.className = "guarda"; g.textContent = "Guardar";
      g.addEventListener("click", function(){ $(ACCION_ARRIBA[id]).click(); });
      barra.appendChild(g);
    }
  });

  /* ---------- pantalla: sobres ---------- */
  function filaHTML(){
    var b = document.createElement("button");
    b.className = "fila";
    b.innerHTML = '<span class="top"><span class="nom"></span><span class="cifra val"></span></span>' +
                  '<span class="barra"><i></i></span><span class="nota"></span>';
    return b;
  }
  function sinBarra(b){ var x = b.querySelector(".barra"); if(x){ x.remove(); } }

  function nodoSub(s, mes){
    var b = filaHTML();
    b.setAttribute("data-sub", s.id);
    b.querySelector(".nom").textContent = s.nombre;
    var val = b.querySelector(".val"), nota = b.querySelector(".nota"), rell = b.querySelector("i");
    var comp = compDe(s);

    if(comp === "ahorro"){
      var junta = gastadoSub(s.id, null), meta = presu(s.id, mes);
      val.textContent = Q(junta);
      rell.style.width = (meta > 0 ? Math.min(1, junta/meta)*100 : 0) + "%";
      nota.textContent = meta > 0
        ? "llevás juntado · meta " + Q(meta) + " · falta " + Q(Math.max(meta - junta, 0))
        : "llevás juntado · sin meta";
      return b;
    }

    var g = gastadoSub(s.id, mes);

    if(comp === "fijo"){
      var esp = esperado(s, mes), cuot = cuotasRestantes(s), pagado = g > 0, t;
      if(pagado){ b.className += " pagado"; }
      val.textContent = pagado ? Q(g) : (esp > 0 ? Q(esp) : "—");
      sinBarra(b);
      if(pagado){
        var ult = null;
        datos.movimientos.forEach(function(m){
          if(m.subId === s.id && m.fecha.slice(0,7) === mes && (!ult || m.fecha > ult)){ ult = m.fecha; }
        });
        t = "pagado" + (ult ? " el " + diaCorto(ult) : "");
      }else{
        t = esp > 0 ? "por pagar · esperado " + Q(esp) : "sin monto esperado";
      }
      if(cuot !== null && cuot > 0){ t += " · quedan " + cuot + (cuot === 1 ? " cuota" : " cuotas"); }
      nota.textContent = t;
      return b;
    }

    var p = presu(s.id, mes), arr = arrastre(s), disp = p + arr;
    if(p <= 0 && arr === 0){
      val.textContent = Q(g);
      sinBarra(b);
      nota.textContent = g > 0 ? "llevás gastado · sin monto" : "sin movimientos este mes";
      return b;
    }
    var queda = disp - g;
    if(queda < 0){ b.className += " pasado"; }
    val.textContent = Q(Math.max(queda, 0));
    rell.style.width = (disp > 0 ? Math.max(0, Math.min(1, queda/disp))*100 : 100) + "%";
    var txt = queda >= 0 ? "te quedan de " + Q(disp) : "te pasaste por " + Q(-queda) + " de " + Q(disp);
    if(Math.round(arr) > 0){ txt += " (Q" + Math.round(arr) + " arrastrados)"; }
    else if(Math.round(arr) < 0){ txt += " (Q" + Math.round(-arr) + " de saldo negativo)"; }
    nota.textContent = txt + " · llevás " + Q(g);
    return b;
  }

  function pintar(){
    var mes = mesDe();
    $("fechaHoy").textContent = capital(new Date().toLocaleDateString("es-GT",{day:"numeric",month:"long",year:"numeric"}));
    var tab = $("tablero");
    tab.innerHTML = "";
    var totalRef = 0, totalGas = 0, pasados = 0, fijosPend = 0;

    datos.categorias.forEach(function(c){
      var subs = subsDe(c.id, mes);
      var ref = refCat(c, mes);
      var gas = c.comp === "ahorro"
        ? subs.reduce(function(t, s){ return t + gastadoSub(s.id, null); }, 0)
        : gastadoCat(c.id, mes);

      if(c.comp !== "ahorro"){
        totalRef += ref; totalGas += gastadoCat(c.id, mes);
        if(ref > 0 && gas > ref){ pasados++; }
      }

      var cont = document.createElement("div");
      cont.className = "contenido";
      subs.forEach(function(s){
        cont.appendChild(nodoSub(s, mes));
        var comp = compDe(s);
        if(comp === "fijo" && gastadoSub(s.id, mes) === 0 && esperado(s, mes) > 0){ fijosPend++; }
        if(comp === "variable" && presu(s.id, mes) > 0 && disponible(s, mes) - gastadoSub(s.id, mes) < 0){ pasados++; }
      });
      if(!subs.length){
        var vac = document.createElement("p");
        vac.className = "nota"; vac.style.margin = "10px 0";
        vac.textContent = "Sin subcategorías. Tocá Editar para agregar.";
        cont.appendChild(vac);
      }

      var plegada = datos.plegados["cat-" + c.id] !== false;
      if(plegada){ cont.hidden = true; }

      var cab = filaHTML();
      cab.className = "fila seccion";
      cab.setAttribute("data-cat", c.id);
      cab.setAttribute("aria-expanded", plegada ? "false" : "true");
      cab.querySelector(".nom").textContent = c.nombre;
      var chev = document.createElement("span");
      chev.className = "chev"; chev.textContent = plegada ? "▸" : "▾";
      cab.querySelector(".nom").appendChild(chev);
      cab.querySelector(".val").textContent = Q(gas);
      sinBarra(cab);
      var n = subs.length;
      var cuenta = n ? n + (n === 1 ? " subcategoría" : " subcategorías") : "sin subcategorías";
      var etiqueta = c.comp === "ahorro" ? "juntado" : "gastado";
      cab.querySelector(".nota").textContent = ref > 0
        ? etiqueta + " · de " + Q(ref) + " · " + cuenta
        : etiqueta + " · " + c.comp + " · " + cuenta;
      if(c.comp !== "ahorro" && ref > 0 && gas > ref){ cab.className += " pasado"; }

      tab.appendChild(envolverConEditar(cab, c.id));
      tab.appendChild(cont);
    });
    var nueva = document.createElement("button");
    nueva.type = "button"; nueva.className = "agregarCat";
    nueva.setAttribute("data-nuevacat", "1");
    nueva.textContent = "+ Agregar nueva categoría";
    tab.appendChild(nueva);

    $("totalGasto").textContent = Q(totalGas);
    var pie = ["llevás gastado este mes"];
    if(pasados){ pie.push(pasados + (pasados === 1 ? " pasado" : " pasados")); }
    if(fijosPend){ pie.push(fijosPend + (fijosPend === 1 ? " fijo por pagar" : " fijos por pagar")); }
    $("totalPie").textContent = pie.join(" · ");

    var seg = totalRef > 0
      ? "Te quedan " + Q(Math.max(totalRef - totalGas, 0)) + " de " + Q(totalRef) + " presupuestados"
      : "Todavía no asignaste montos";
    var ing = datos.ingresos.reduce(function(t, i){ return i.fecha.slice(0,7) === mes ? t + i.monto : t; }, 0);
    if(ing > 0){ seg += " · entraron " + Q(ing); }
    $("totalSegunda").textContent = seg;
  }

  /* Encabezado de categoría con su botón Editar al lado. */
  function envolverConEditar(cab, catId){
    var w = document.createElement("div");
    w.className = "catCab";
    w.appendChild(cab);
    var ed = document.createElement("button");
    ed.type = "button"; ed.className = "editar";
    ed.setAttribute("data-editar", catId);
    ed.textContent = "Editar";
    w.appendChild(ed);
    return w;
  }

  $("tablero").addEventListener("click", function(e){
    if(e.target.closest("button[data-nuevacat]")){ abrirEdCat(null); return; }
    var ed = e.target.closest("button[data-editar]");
    if(ed){ abrirEdCat(ed.getAttribute("data-editar")); return; }
    var sec = e.target.closest("button.seccion");
    if(sec){
      var k = "cat-" + sec.getAttribute("data-cat");
      datos.plegados[k] = datos.plegados[k] === false ? true : false;
      guardar(); pintar();
      return;
    }
    var f = e.target.closest("button[data-sub]");
    if(f){
      var s = subDe(f.getAttribute("data-sub"));
      if(s){ abrirRegistro(s.catId, s.id, false); }
    }
  });

  /* ---------- panel Editar: categoría y sus subcategorías ---------- */
  var ed = null;   /* borrador: {catId, nombre, comp, subs:[{id, nombre, cuotas, nueva, borrar}]} */
  var AYUDA_COMP = {
    fijo: "Mismo monto cada mes, como la renta. Se marca como pagado.",
    variable: "Cambia mes a mes, como el súper. Se registra y se va sumando.",
    ahorro: "No se gasta: se va llenando hasta una meta."
  };

  function abrirEdCat(catId){
    var c = catId ? catDe(catId) : null;
    ed = {
      catId: c ? c.id : null,
      nombre: c ? c.nombre : "",
      comp: c ? c.comp : "variable",
      subs: c ? datos.subs.filter(function(s){ return s.catId === c.id; }).map(function(s){
        return {id:s.id, nombre:s.nombre, cuotas: s.cuotas ? {monto:s.cuotas.monto, hasta:s.cuotas.hasta} : null};
      }) : []
    };
    $("tEdCat").textContent = c ? "Editar " + c.nombre : "Nueva categoría";
    $("edEliminarCat").hidden = !c;
    pintarEdCat();
    abrir("hojaEdCat");
    if(!c){ setTimeout(function(){ $("edNombre").focus(); }, 300); }
  }

  function pintarEdCat(){
    $("edNombre").value = ed.nombre;
    Array.prototype.forEach.call($("edComp").querySelectorAll("button"), function(b){
      b.setAttribute("aria-pressed", b.getAttribute("data-v") === ed.comp ? "true" : "false");
    });
    $("edAyuda").textContent = AYUDA_COMP[ed.comp];
    var l = $("edSubs");
    l.innerHTML = "";
    var vivas = ed.subs.filter(function(s){ return !s.borrar; });
    if(!vivas.length){
      var p = document.createElement("p");
      p.className = "nota"; p.textContent = "Todavía no hay subcategorías.";
      l.appendChild(p);
    }
    vivas.forEach(function(s){
      var d = document.createElement("div");
      d.className = "edSub";
      var r1 = document.createElement("div");
      r1.className = "l1";
      var inp = document.createElement("input");
      inp.type = "text"; inp.value = s.nombre; inp.placeholder = "Nombre";
      inp.setAttribute("aria-label", "Nombre de la subcategoría");
      inp.addEventListener("input", function(){ s.nombre = this.value; });
      var del = document.createElement("button");
      del.type = "button"; del.className = "quitar"; del.textContent = "Eliminar";
      del.addEventListener("click", function(){
        var n = s.nueva ? 0 : datos.movimientos.filter(function(m){ return m.subId === s.id; }).length;
        if(n && !confirm("¿Eliminar " + (s.nombre || "esta subcategoría") + "? Sus " + n + " gastos quedan en el historial.")) return;
        if(s.nueva){ ed.subs = ed.subs.filter(function(x){ return x !== s; }); } else { s.borrar = true; }
        pintarEdCat();
      });
      r1.appendChild(inp); r1.appendChild(del);
      d.appendChild(r1);

      var lc = document.createElement("label");
      lc.className = "check";
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = !!s.cuotas;
      cb.addEventListener("change", function(){
        s.cuotas = this.checked ? {monto:0, hasta:""} : null;
        pintarEdCat();
      });
      lc.appendChild(cb);
      lc.appendChild(document.createTextNode(" Se paga en cuotas"));
      d.appendChild(lc);

      if(s.cuotas){
        var cu = document.createElement("div");
        cu.className = "dias";
        cu.innerHTML = '<div><label class="etiq">MONTO DE CADA CUOTA</label><input type="number" class="cm" inputmode="decimal" min="0" step="0.01"></div>' +
                       '<div><label class="etiq">ÚLTIMA CUOTA</label><input type="month" class="ch"></div>';
        var cm = cu.querySelector(".cm"), ch = cu.querySelector(".ch");
        if(s.cuotas.monto){ cm.value = s.cuotas.monto; }
        ch.value = s.cuotas.hasta || "";
        cm.addEventListener("input", function(){ s.cuotas.monto = parseFloat(this.value) || 0; });
        ch.addEventListener("change", function(){ s.cuotas.hasta = this.value; });
        d.appendChild(cu);
      }
      l.appendChild(d);
    });
  }

  $("edNombre").addEventListener("input", function(){ ed.nombre = this.value; });
  $("edComp").addEventListener("click", function(e){
    var b = e.target.closest("button[data-v]"); if(!b) return;
    ed.comp = b.getAttribute("data-v"); pintarEdCat();
  });
  $("edAgregarSub").addEventListener("click", function(){
    ed.subs.push({id:nid(), nombre:"", cuotas:null, nueva:true});
    pintarEdCat();
    var ins = $("edSubs").querySelectorAll("input[type=text]");
    if(ins.length){ ins[ins.length-1].focus(); }
  });

  $("edGuardar").addEventListener("click", function(){
    var nombre = ed.nombre.trim().replace(/\s+/g," ");
    if(!nombre){ alert("Escribí el nombre de la categoría."); return; }
    var otra = datos.categorias.filter(function(c){ return c.id !== ed.catId && norm(c.nombre) === norm(nombre); })[0];
    if(otra){ alert("Ya tenés una categoría llamada " + otra.nombre + "."); return; }

    var vivas = ed.subs.filter(function(s){ return !s.borrar; });
    var vistos = {};
    for(var i = 0; i < vivas.length; i++){
      var sn = vivas[i].nombre.trim().replace(/\s+/g," ");
      if(!sn){ alert("Hay una subcategoría sin nombre. Escribile uno o eliminala."); return; }
      if(vistos[norm(sn)]){ alert("Hay dos subcategorías llamadas " + sn + "."); return; }
      vistos[norm(sn)] = true;
      var cu = vivas[i].cuotas;
      if(cu && (!(cu.monto > 0) || !/^\d{4}-\d{2}$/.test(cu.hasta || ""))){
        alert("Completá el monto y el mes de la última cuota de " + sn + "."); return;
      }
      vivas[i].nombre = sn;
    }

    var catId = ed.catId;
    if(catId){
      var c = catDe(catId);
      c.nombre = nombre; c.comp = ed.comp;
    }else{
      catId = "c-" + nid();
      datos.categorias.push({id:catId, nombre:nombre, comp:ed.comp});
      datos.plegados["cat-" + catId] = false;
    }
    var borrar = {};
    ed.subs.forEach(function(s){ if(s.borrar){ borrar[s.id] = true; } });
    datos.subs = datos.subs.filter(function(s){ return !borrar[s.id]; });
    vivas.forEach(function(e2){
      var s = subDe(e2.id);
      if(!s){
        s = nuevaSub(catId, e2.nombre, ed.comp);
        s.id = e2.id;
        datos.subs.push(s);
      }
      s.nombre = e2.nombre;
      s.cuotas = e2.cuotas ? {monto:e2.cuotas.monto, hasta:e2.cuotas.hasta} : null;
      if(s.cuotas){ s.arrastra = false; }
    });
    guardar(); pintar(); pintarPres(); cerrarTodo();
  });

  $("edEliminarCat").addEventListener("click", function(){
    var c = catDe(ed.catId); if(!c) return;
    var n = datos.subs.filter(function(s){ return s.catId === c.id; }).length;
    var msg = "¿Eliminar la categoría " + c.nombre + " completa" +
      (n ? ", con sus " + n + (n === 1 ? " subcategoría" : " subcategorías") : "") +
      "? Los gastos ya registrados quedan en el historial.";
    if(!confirm(msg)) return;
    datos.categorias = datos.categorias.filter(function(x){ return x.id !== c.id; });
    datos.subs = datos.subs.filter(function(s){ return s.catId !== c.id; });
    guardar(); pintar(); pintarPres(); cerrarTodo();
  });

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

  /* ---------- registrar gasto ---------- */
  var reg = {catId:null, subId:null, buffer:"", medio:null, fecha:new Date()};

  function esHoy(d){ return aISO(d) === aISO(new Date()); }

  function abrirRegistro(catId, subId, nueva){
    reg = {catId:catId, subId:subId, buffer:"", medio:null, fecha:new Date()};
    $("formNueva").hidden = !nueva;
    $("nsNombre").value = ""; $("nsCuotas").checked = false;
    $("nsCuotasCampos").hidden = true; $("nsCuotaMonto").value = ""; $("nsFin").value = "";
    $("nsAviso").hidden = true; $("nsSug").innerHTML = "";
    $("txtNota").value = "";
    $("inpFecha").hidden = true;
    precargar();
    pintarReg();
    abrir("hojaReg");
    if(nueva){ setTimeout(function(){ $("nsNombre").focus(); }, 300); }
  }

  function precargar(){
    var s = reg.subId ? subDe(reg.subId) : null;
    reg.buffer = "";
    if(s && compDe(s) === "fijo"){
      var mes = mesDe(reg.fecha);
      if(gastadoSub(s.id, mes) === 0 && esperado(s, mes) > 0){ reg.buffer = String(esperado(s, mes)); }
    }
  }

  function pintarReg(){
    var cats = $("rCats");
    cats.innerHTML = "";
    datos.categorias.forEach(function(c){
      var b = document.createElement("button");
      b.type = "button"; b.textContent = c.nombre;
      b.setAttribute("data-cat", c.id);
      b.setAttribute("aria-pressed", c.id === reg.catId ? "true" : "false");
      cats.appendChild(b);
    });

    var subs = $("rSubs");
    subs.innerHTML = "";
    if(!reg.catId){
      subs.innerHTML = '<span class="recuerdo" style="margin:0">Elegí primero una categoría.</span>';
    }else{
      subsDe(reg.catId, mesDe(reg.fecha)).forEach(function(s){
        var b = document.createElement("button");
        b.type = "button"; b.textContent = s.nombre;
        b.setAttribute("data-sub", s.id);
        b.setAttribute("aria-pressed", s.id === reg.subId ? "true" : "false");
        subs.appendChild(b);
      });
      var nv = document.createElement("button");
      nv.type = "button"; nv.className = "nueva"; nv.textContent = "+ nueva";
      nv.setAttribute("data-nueva", "1");
      subs.appendChild(nv);
    }

    var s = reg.subId ? subDe(reg.subId) : null;
    var info = "", mes = mesDe(reg.fecha);
    if(s){
      var comp = compDe(s);
      if(comp === "ahorro"){ info = "Llevás " + Q(gastadoSub(s.id, null)) + " juntados"; }
      else if(comp === "fijo"){
        var g = gastadoSub(s.id, mes);
        info = g > 0 ? "Ya registraste " + Q(g) + " este mes"
             : (esperado(s, mes) > 0 ? "Monto esperado. Corregilo si el recibo vino distinto." : "Sin monto esperado");
      }else{
        info = (presu(s.id, mes) > 0 || arrastre(s) !== 0)
          ? "Te quedan " + Q(disponible(s, mes) - gastadoSub(s.id, mes)) + " este mes"
          : "Sin monto asignado · solo se registra";
      }
      $("btnGuardar").textContent = comp === "ahorro" ? "Guardar abono" : (comp === "fijo" ? "Marcar como pagado" : "Guardar gasto");
      $("cajaNota").hidden = !s.pideNota;
      $("verNota").hidden = !!s.pideNota;
      $("recuerdo").textContent = recuerdoDePago(s.id);
    }else{
      $("btnGuardar").textContent = "Guardar gasto";
      $("cajaNota").hidden = true; $("verNota").hidden = false;
      $("recuerdo").textContent = "";
    }
    $("rInfo").textContent = info;
    pintarFecha();
    pintarMedios();
    pintarMonto();
    if(APP.avisarCiclo){ APP.avisarCiclo(reg.medio, reg.fecha); }
  }

  function pintarMonto(){
    $("pantalla").textContent = "Q" + (reg.buffer === "" ? "0" : reg.buffer);
    $("btnGuardar").disabled = !(reg.subId && parseFloat(reg.buffer) > 0 && reg.medio);
  }

  function pintarFecha(){
    var b = $("btnFecha");
    b.textContent = (esHoy(reg.fecha) ? "Hoy, " : "") + reg.fecha.toLocaleDateString("es-GT",{day:"numeric",month:"long"});
    var s = document.createElement("span");
    s.className = "cambia"; s.textContent = "cambiar";
    b.appendChild(s);
  }
  $("btnFecha").addEventListener("click", function(){
    var i = $("inpFecha"), hoy = new Date();
    i.min = aISO(new Date(hoy.getFullYear(), hoy.getMonth()-2, hoy.getDate()));
    i.max = aISO(hoy);
    i.value = aISO(reg.fecha);
    i.hidden = false;
    if(i.showPicker){ try{ i.showPicker(); }catch(e){} } else { i.focus(); }
  });
  $("inpFecha").addEventListener("change", function(){
    if(!this.value) return;
    var p = this.value.split("-");
    reg.fecha = new Date(+p[0], +p[1]-1, +p[2], 12, 0, 0);
    this.hidden = true;
    pintarReg();
  });

  function pintarMedios(){
    var c = $("medios");
    c.innerHTML = "";
    var rej = document.createElement("div");
    rej.className = "rejillaT";
    (datos.tarjetas || []).forEach(function(t){
      if(!t.nombre) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "elige";
      b.setAttribute("data-medio", t.nombre);
      b.setAttribute("aria-pressed", t.nombre === reg.medio ? "true" : "false");
      b.setAttribute("aria-label", t.nombre + ", " + (t.tipo === "debito" ? "débito" : "crédito"));
      b.appendChild(tarjetaNodo(t, true));
      rej.appendChild(b);
    });
    c.appendChild(rej);
    var fila = document.createElement("div");
    fila.className = "filaBase";
    MEDIOS_BASE.forEach(function(m){
      var b = document.createElement("button");
      b.type = "button"; b.textContent = m;
      b.setAttribute("data-medio", m);
      b.setAttribute("aria-pressed", m === reg.medio ? "true" : "false");
      fila.appendChild(b);
    });
    c.appendChild(fila);
  }

  $("rCats").addEventListener("click", function(e){
    var b = e.target.closest("button[data-cat]"); if(!b) return;
    var id = b.getAttribute("data-cat");
    if(id !== reg.catId){ reg.catId = id; reg.subId = null; reg.buffer = ""; }
    $("formNueva").hidden = true;
    pintarReg();
  });
  $("rSubs").addEventListener("click", function(e){
    var b = e.target.closest("button"); if(!b) return;
    if(b.getAttribute("data-nueva")){
      $("formNueva").hidden = false;
      $("nsNombre").value = ""; $("nsAviso").hidden = true; $("nsSug").innerHTML = "";
      $("nsNombre").focus();
      return;
    }
    reg.subId = b.getAttribute("data-sub");
    $("formNueva").hidden = true;
    precargar();
    pintarReg();
  });
  $("medios").addEventListener("click", function(e){
    var b = e.target.closest("button[data-medio]"); if(!b) return;
    reg.medio = b.getAttribute("data-medio");
    pintarMedios(); pintarMonto();
    if(APP.avisarCiclo){ APP.avisarCiclo(reg.medio, reg.fecha); }
  });
  $("teclado").addEventListener("click", function(e){
    var t = e.target.getAttribute("data-t");
    if(t === null) return;
    var bf = reg.buffer;
    if(t === "b"){ bf = bf.slice(0,-1); }
    else if(t === "."){ if(bf.indexOf(".") === -1 && bf !== ""){ bf += "."; } }
    else{
      var p = bf.split(".");
      if(p[1] && p[1].length >= 2) return;
      if(bf.replace(".","").length >= 9) return;
      bf += t;
    }
    reg.buffer = bf;
    pintarMonto();
  });
  $("verNota").addEventListener("click", function(){
    $("cajaNota").hidden = false; this.hidden = true; $("txtNota").focus();
  });

  /* nueva subcategoría: sugerencias y duplicados */
  function parecidas(catId, texto){
    var n = norm(texto);
    if(!n) return [];
    return datos.subs.filter(function(s){
      if(s.catId !== catId) return false;
      var m = norm(s.nombre);
      return m === n || m.indexOf(n) >= 0 || n.indexOf(m) >= 0;
    });
  }
  $("nsNombre").addEventListener("input", function(){
    var sug = $("nsSug");
    sug.innerHTML = "";
    $("nsAviso").hidden = true;
    if(!reg.catId) return;
    parecidas(reg.catId, this.value).forEach(function(s){
      var b = document.createElement("button");
      b.type = "button"; b.textContent = "Usar " + s.nombre;
      b.addEventListener("click", function(){
        reg.subId = s.id;
        $("formNueva").hidden = true;
        precargar(); pintarReg();
      });
      sug.appendChild(b);
    });
  });
  $("nsCuotas").addEventListener("change", function(){ $("nsCuotasCampos").hidden = !this.checked; });

  $("nsCrear").addEventListener("click", function(){
    var aviso = $("nsAviso");
    function falla(t){ aviso.textContent = t; aviso.hidden = false; }
    if(!reg.catId){ falla("Elegí primero una categoría."); return; }
    var nombre = $("nsNombre").value.trim().replace(/\s+/g," ");
    if(!nombre){ falla("Escribí un nombre."); return; }
    var igual = datos.subs.filter(function(s){ return s.catId === reg.catId && norm(s.nombre) === norm(nombre); })[0];
    if(igual){
      reg.subId = igual.id;
      $("formNueva").hidden = true;
      precargar(); pintarReg();
      return;
    }
    var sim = parecidas(reg.catId, nombre);
    if(sim.length && !confirm("Ya tenés \u201c" + sim[0].nombre + "\u201d. ¿Crear \u201c" + nombre + "\u201d de todas formas?")) return;

    var c = catDe(reg.catId);
    var s = nuevaSub(reg.catId, nombre, c.comp);
    if($("nsCuotas").checked){
      var cm = parseFloat($("nsCuotaMonto").value), fin = $("nsFin").value;
      if(!(cm > 0)){ falla("Escribí el monto de cada cuota."); return; }
      if(!/^\d{4}-\d{2}$/.test(fin)){ falla("Elegí el mes de la última cuota."); return; }
      if(fin < mesDe()){ falla("La última cuota no puede ser de un mes que ya pasó."); return; }
      s.cuotas = {monto: cm, hasta: fin};
      s.arrastra = false;
    }
    datos.subs.push(s);
    guardar();
    reg.subId = s.id;
    $("formNueva").hidden = true;
    precargar(); pintarReg(); pintar();
  });

  $("btnGuardar").addEventListener("click", function(){
    var monto = parseFloat(reg.buffer);
    if(!(monto > 0) || !reg.subId || !reg.medio) return;
    var f = esHoy(reg.fecha) ? new Date() : reg.fecha;
    var mov = {id:nid(), subId:reg.subId, monto:monto, fecha:f.toISOString(), medio:reg.medio};
    var nota = $("txtNota").value.trim();
    if(nota){ mov.nota = nota; }
    datos.movimientos.push(mov);
    guardar(); pintar(); cerrarTodo();
  });

  /* ---------- pantalla: presupuesto ---------- */
  var presMes = mesDe();

  function campoMonto(id, placeholder){
    var i = document.createElement("input");
    i.type = "number"; i.inputMode = "decimal"; i.min = "0"; i.step = "0.01";
    i.placeholder = placeholder;
    var v = presu(id, presMes);
    if(v > 0){ i.value = v; }
    i.setAttribute("data-id", id);
    return i;
  }

  function pintarPres(){
    $("pMes").textContent = nombreMes(presMes);
    var lista = $("pLista");
    lista.innerHTML = "";
    var total = 0;
    datos.categorias.forEach(function(c){
      var subs = subsDe(c.id, presMes);
      var ref = c.comp === "ahorro" ? 0 : refCat(c, presMes);
      total += ref;

      var bloque = document.createElement("div");
      bloque.className = "pCat";
      var cab = document.createElement("div");
      cab.className = "pFila";
      var n = document.createElement("span");
      n.className = "pn"; n.textContent = c.nombre;
      cab.appendChild(n);
      var edb = document.createElement("button");
      edb.type = "button"; edb.className = "editar"; edb.textContent = "Editar";
      edb.setAttribute("data-editar", c.id);
      cab.appendChild(edb);
      var ph = c.comp === "fijo" ? "suma: " + Q(subs.reduce(function(t,s){ return t + esperado(s, presMes); }, 0))
             : (c.comp === "ahorro" ? "—" : "sin tope");
      var ic = campoMonto(c.id, ph);
      ic.setAttribute("aria-label", "Monto de " + c.nombre);
      if(c.comp === "ahorro"){ ic.disabled = true; ic.value = ""; }
      cab.appendChild(ic);
      bloque.appendChild(cab);

      var cont = document.createElement("div");
      cont.className = "pSubs";
      var sumaSubs = 0;
      subs.forEach(function(s){
        var f = document.createElement("div");
        f.className = "pFila";
        var sn = document.createElement("span");
        sn.className = "pn";
        sn.textContent = s.nombre + (s.cuotas ? " · cuota" : "");
        f.appendChild(sn);
        var php = s.cuotas ? Q(s.cuotas.monto) : (c.comp === "ahorro" ? "meta" : "sin monto");
        var inp = campoMonto(s.id, php);
        inp.setAttribute("aria-label", "Monto de " + s.nombre);
        f.appendChild(inp);
        cont.appendChild(f);
        sumaSubs += compDe(s) === "fijo" ? esperado(s, presMes) : presu(s.id, presMes);
      });
      if(!subs.length){
        var v = document.createElement("p");
        v.className = "nota"; v.style.margin = "4px 0";
        v.textContent = "Sin subcategorías. Tocá Editar para agregar.";
        cont.appendChild(v);
      }
      bloque.appendChild(cont);

      var tope = presu(c.id, presMes);
      if(tope > 0 && sumaSubs > tope){
        var w = document.createElement("p");
        w.className = "aviso";
        w.textContent = "Las subcategorías suman " + Q(sumaSubs) + ", más que el tope de " + Q(tope) + ".";
        bloque.appendChild(w);
      }
      lista.appendChild(bloque);
    });
    var nueva = document.createElement("button");
    nueva.type = "button"; nueva.className = "agregarCat";
    nueva.setAttribute("data-nuevacat", "1");
    nueva.textContent = "+ Agregar nueva categoría";
    lista.appendChild(nueva);

    var ing = datos.ingresos.reduce(function(t, i){ return i.fecha.slice(0,7) === presMes ? t + i.monto : t; }, 0);
    var txt = "Presupuestado " + Q(total);
    if(ing > 0){ txt += " · ingresos " + Q(ing) + " · sin asignar " + Q(ing - total); }
    $("pResumen").textContent = txt;
  }

  $("pLista").addEventListener("click", function(e){
    if(e.target.closest("button[data-nuevacat]")){ abrirEdCat(null); return; }
    var ed2 = e.target.closest("button[data-editar]");
    if(ed2){ abrirEdCat(ed2.getAttribute("data-editar")); }
  });
  $("pLista").addEventListener("change", function(e){
    var i = e.target;
    if(!i.getAttribute || !i.getAttribute("data-id")) return;
    var v = parseFloat(i.value);
    ponerPresu(i.getAttribute("data-id"), presMes, v > 0 ? v : 0);
    guardar(); pintarPres(); pintar();
  });
  $("pAnt").addEventListener("click", function(){ presMes = mesPrevio(presMes); pintarPres(); });
  $("pSig").addEventListener("click", function(){ presMes = mesSiguiente(presMes); pintarPres(); });
  $("pCopiar").addEventListener("click", function(){
    var prev = mesPrevio(presMes), orig = datos.presupuestos[prev];
    if(!orig || !Object.keys(orig).length){ alert("El mes anterior no tiene montos."); return; }
    var hay = datos.presupuestos[presMes] && Object.keys(datos.presupuestos[presMes]).length;
    if(hay && !confirm("Esto reemplaza los montos de " + nombreMes(presMes) + ". ¿Seguir?")) return;
    datos.presupuestos[presMes] = JSON.parse(JSON.stringify(orig));
    guardar(); pintarPres(); pintar();
  });

  /* ---------- hoja: movimientos ---------- */
  $("btnHistorial").addEventListener("click", function(){
    var cont = $("movimientos");
    cont.innerHTML = "";
    var todos = datos.movimientos.slice().sort(function(a,b){ return a.fecha < b.fecha ? 1 : -1; });
    $("sHist").textContent = todos.length
      ? todos.length + (todos.length === 1 ? " movimiento en total" : " movimientos en total")
      : "Todavía no hay movimientos.";
    var mesAct = null;
    todos.slice(0, 500).forEach(function(m){
      var k = m.fecha.slice(0,7);
      if(k !== mesAct){
        mesAct = k;
        var r = document.createElement("p");
        r.className = "subrotulo";
        r.textContent = nombreMes(k).toUpperCase();
        cont.appendChild(r);
      }
      var s = subDe(m.subId), c = s ? catDe(s.catId) : null;
      var f = new Date(m.fecha);
      var d = document.createElement("div");
      d.className = "mov";
      d.innerHTML = '<span><span class="nm"></span><small></small></span>' +
                    '<span class="der"><span class="cifra mt"></span><button class="quitar" type="button">Borrar</button></span>';
      d.querySelector(".nm").textContent = s ? s.nombre + (c ? " · " + c.nombre : "") : "Subcategoría eliminada";
      var pie = f.toLocaleDateString("es-GT",{day:"numeric",month:"short"}) + " · " +
                f.toLocaleTimeString("es-GT",{hour:"numeric",minute:"2-digit"});
      if(m.medio){ pie += " · " + m.medio; }
      if(m.nota){ pie += " · " + m.nota; }
      d.querySelector("small").textContent = pie;
      d.querySelector(".mt").textContent = (s && compDe(s) === "ahorro" ? "+" : "") + Q(m.monto);
      d.querySelector(".quitar").addEventListener("click", function(){
        if(!confirm("¿Borrar este movimiento?")) return;
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
    var lineas = [["tipo","fecha","hora","categoria","subcategoria","monto","forma_de_pago","nota","presupuesto_subcategoria"].join(",")];
    datos.movimientos.slice().sort(function(a,b){ return a.fecha < b.fecha ? -1 : 1; }).forEach(function(m){
      var s = subDe(m.subId), c = s ? catDe(s.catId) : null, f = new Date(m.fecha);
      lineas.push(["gasto", esc(m.fecha.slice(0,10)), esc(dos(f.getHours()) + ":" + dos(f.getMinutes())),
        esc(c ? c.nombre : ""), esc(s ? s.nombre : "eliminada"), esc(m.monto),
        esc(m.medio || ""), esc(m.nota || ""), esc(s ? presu(s.id, m.fecha.slice(0,7)) : "")].join(","));
    });
    datos.ingresos.slice().sort(function(a,b){ return a.fecha < b.fecha ? -1 : 1; }).forEach(function(i){
      var fu = datos.fuentes.filter(function(x){ return x.id === i.fuenteId; })[0];
      lineas.push(["ingreso", esc(i.fecha.slice(0,10)), "", "Ingresos", esc(fu ? fu.nombre : "otra"),
        esc(i.monto), "", esc(i.nota || ""), ""].join(","));
    });
    (datos.pagosTarjeta || []).forEach(function(p){
      lineas.push(["pago_tarjeta", esc(p.fecha.slice(0,10)), "", "Tarjetas", esc(p.tarjeta || ""),
        esc(p.monto), "", "", ""].join(","));
    });
    return lineas.join("\n");
  }
  $("btnCsv").addEventListener("click", function(){
    var blob = new Blob(["\ufeff" + csv()], {type:"text/csv;charset=utf-8"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "sobres-" + mesDe() + ".csv";
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1500);
  });

  /* ---------- respaldo y empezar de cero ---------- */
  $("btnRespaldo").addEventListener("click", function(){
    $("areaResp").value = JSON.stringify(datos);
    abrir("hojaResp");
  });
  $("restaurar").addEventListener("click", function(){
    try{
      var n = JSON.parse($("areaResp").value);
      if(!n.categorias || !n.movimientos){ throw new Error("formato"); }
      datos = n;
      if(!datos.v || datos.v < 8){ migrarV8(); }
      normalizar();
      guardar(); pintar(); cerrarTodo();
    }catch(e){
      alert("Ese texto no tiene el formato correcto. Pegá el respaldo completo, desde la primera llave hasta la última.");
    }
  });
  $("btnCero").addEventListener("click", function(){
    if(!confirm("Se borran todos los gastos, ingresos, presupuestos y pagos de tarjeta. Se conservan tus categorías, subcategorías y tarjetas. ¿Seguir?")) return;
    if(!confirm("No se puede deshacer. Si querés, primero copiá el Respaldo. ¿Borrar ahora?")) return;
    datos.movimientos = []; datos.ingresos = []; datos.presupuestos = {};
    datos.pagosTarjeta = []; datos.montosCorte = {}; datos.cortesPagados = {};
    datos.inicio = mesDe(); datos.visto = mesDe(); datos.inicioRegistro = aISO(new Date());
    guardar(); pintar();
    mostrarTab("sobres");
  });

  /* ---------- modo claro / oscuro ---------- */
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  function modo(){ document.documentElement.setAttribute("data-m", mq.matches ? "oscuro" : "claro"); }
  if(mq.addEventListener){ mq.addEventListener("change", modo); }
  modo();

  /* ---------- arranque ---------- */
  cargar();
  var copiado = revisarMes();
  guardar();

  var api = {
    $: $, nid: nid, Q: Q, esc: esc, aISO: aISO,
    mesDe: mesDe, mesSiguiente: mesSiguiente, nombreMes: nombreMes, soloMes: soloMes,
    diaCorto: diaCorto, diaLargo: diaLargo,
    medios: medios, guardar: guardar, pintar: pintar, mostrarTab: mostrarTab, alMostrar: alMostrar,
    abrir: abrir, cerrarTodo: cerrarTodo, norm: norm,
    presu: presu, gastadoSub: gastadoSub, gastadoCat: gastadoCat, esperado: esperado,
    subsDe: subsDe, subDe: subDe, catDe: catDe, compDe: compDe, refCat: refCat,
    datosRef: function(){ return datos; },
    HUES: HUES, LUCES: LUCES, colorFondo: colorFondo, colorTexto: colorTexto,
    tarjetaNodo: tarjetaNodo, tarjetaPorNombre: tarjetaPorNombre, esCredito: esCredito
  };

  /* Se pinta después de que caja.js se engancha. */
  setTimeout(function(){
    mostrarTab("sobres");
    if(copiado){
      aviso("Mes nuevo. Copié los montos del mes pasado —", function(){ mostrarTab("pres"); }, "revisalos");
    }
    if(/iPad|iPhone|iPod/.test(navigator.userAgent) &&
       navigator.standalone === false && location.protocol.indexOf("http") === 0){
      aviso("Estás en Safari. Agregá Sobres a la pantalla de inicio y usalo siempre desde el ícono.");
    }
  }, 0);

  return api;
})();
