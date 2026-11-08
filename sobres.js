/* Sobres · núcleo: datos, cálculos, pestañas, hojas, Sobres, registrar gasto,
   categorías y Presupuesto. Debe cargar ANTES que caja.js. */
var APP = (function(){
  "use strict";

  var LLAVE = "sobres-v3";

  /* ---------- utilidades ---------- */
  var $ = function(i){ return document.getElementById(i); };
  function nid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
  function dos(n){ return (n < 10 ? "0" : "") + n; }
  function aISO(d){ return d.getFullYear()+"-"+dos(d.getMonth()+1)+"-"+dos(d.getDate()); }
  function deISO(s){ var p = s.split("-"); return new Date(+p[0], +p[1]-1, +p[2], 12); }
  function hoyISO(){ return aISO(new Date()); }
  function mesDe(x){
    if(!x){ x = new Date(); }
    if(typeof x === "string"){ return x.slice(0,7); }
    return x.getFullYear()+"-"+dos(x.getMonth()+1);
  }
  function sumaMeses(k, n){
    var a = +k.slice(0,4), m = +k.slice(5,7) - 1 + n;
    a += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return a + "-" + dos(m + 1);
  }
  function mesPrevio(k){ return sumaMeses(k, -1); }
  function mesSiguiente(k){ return sumaMeses(k, 1); }
  var MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  var MES_C = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  function capital(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
  function nombreMes(k){ return capital(MESES[+k.slice(5,7)-1]) + " " + k.slice(0,4); }
  function soloMes(k){ return MESES[+k.slice(5,7)-1]; }
  function diaCorto(iso){ var d = deISO(iso); return d.getDate() + " " + MES_C[d.getMonth()]; }
  function diaLargo(iso){ var d = deISO(iso); return d.getDate() + " de " + MESES[d.getMonth()]; }
  function fechaCompleta(iso){ return diaLargo(iso) + " de " + iso.slice(0,4); }
  function r2(n){ return Math.round(n * 100) / 100; }
  function fmt(n){
    var r = r2(Math.abs(n));
    var ent = Math.floor(r), dec = Math.round((r - ent) * 100);
    var s = String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return dec ? s + "." + dos(dec) : s;
  }
  function dinero(n, mon){ return (n < 0 ? "-" : "") + (mon === "$" ? "$" : "Q") + fmt(n); }
  function Q(n){ return dinero(n, "Q"); }
  function norm(s){
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim();
  }
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function unir(lista){
    if(lista.length < 2){ return lista.join(""); }
    return lista.slice(0, -1).join(", ") + " y " + lista[lista.length-1];
  }
  function porId(lista, id){
    for(var i = 0; i < lista.length; i++){ if(lista[i].id === id){ return lista[i]; } }
    return null;
  }
  function numero(v){ var n = parseFloat(String(v).replace(/,/g, "")); return isNaN(n) ? NaN : n; }
  /* Fechas permitidas: hasta dos meses atrás, nunca en el futuro. */
  function rangoFecha(inp, actual){
    var h = new Date(), min = aISO(new Date(h.getFullYear(), h.getMonth()-2, h.getDate()));
    if(actual && actual < min){ min = actual; }
    inp.min = min; inp.max = aISO(h);
  }

  /* ---------- sugerencias ---------- */
  var SUG = [
    {n:"Fijos",       t:"fija",     s:["Renta","Luz","Agua","Internet","Teléfono","Seguro médico","Gas","Cuota de préstamo"]},
    {n:"Membresías",  t:"fija",     s:["Música","Películas y series","Almacenamiento en la nube","Aplicaciones","Gimnasio"]},
    {n:"Salud",       t:"variable", s:["Medicación","Consultas médicas","Psicología","Psiquiatría","Dentista","Exámenes de laboratorio","Lentes"]},
    {n:"Compras",     t:"variable", s:["Supermercado","Mercado","Farmacia","Limpieza","Higiene personal"]},
    {n:"Transporte",  t:"variable", s:["Uber","Bus","Gasolina","Parqueo","Mantenimiento del vehículo"]},
    {n:"Personales",  t:"variable", s:["Comida fuera","Ropa","Salidas","Regalos","Cuidado personal","Cursos","Libros","Donaciones","Imprevistos"]},
    {n:"Hogar",       t:"variable", s:["Muebles","Reparaciones","Artículos para la casa"]},
    {n:"Mascotas",    t:"variable", s:["Comida","Veterinario"]},
    {n:"Ahorro",      t:"ahorro",   s:["Fondo de emergencia","Metas"]}
  ];
  function sugDe(nombre){
    for(var i = 0; i < SUG.length; i++){ if(norm(SUG[i].n) === norm(nombre)){ return SUG[i]; } }
    return null;
  }
  var MEDIOS_FIJOS = ["Efectivo","Transferencia","Tarjeta de débito"];
  var COLORES = [
    {n:"Rosa",      bg:"hsl(350,55%,76%)", tx:"hsl(350,45%,18%)"},
    {n:"Terracota", bg:"hsl(15,50%,48%)",  tx:"#FFFFFF"},
    {n:"Ocre",      bg:"hsl(40,62%,58%)",  tx:"hsl(40,50%,15%)"},
    {n:"Oliva",     bg:"hsl(70,25%,40%)",  tx:"#FFFFFF"},
    {n:"Verde",     bg:"hsl(150,30%,38%)", tx:"#FFFFFF"},
    {n:"Azul",      bg:"hsl(215,45%,44%)", tx:"#FFFFFF"},
    {n:"Ciruela",   bg:"hsl(320,25%,36%)", tx:"#FFFFFF"},
    {n:"Gris",      bg:"hsl(30,4%,52%)",   tx:"#FFFFFF"}
  ];
  var AYUDA_TIPO = {
    fija: "Mismo monto cada mes, como la renta.",
    variable: "El monto cambia cada mes, como el supermercado.",
    ahorro: "Lo que apartás para ahorrar. Se cuenta como dinero que sale."
  };

  /* ---------- datos ---------- */
  var datos;
  function vacio(){
    return {v:3, categorias:[], subs:[], pres:{}, gastos:[], fuentes:[], ingresos:[],
            tarjetas:[], pagos:[], otrosMedios:[], banco:null, bancoMes:null, mesVisto:null};
  }
  function normalizar(){
    var b = vacio();
    Object.keys(b).forEach(function(k){ if(datos[k] === undefined){ datos[k] = b[k]; } });
  }
  function cargar(){
    try{ var c = localStorage.getItem(LLAVE); datos = c ? JSON.parse(c) : null; }
    catch(e){ datos = null; }
    if(!datos || datos.v !== 3){ datos = vacio(); }
    normalizar();
    /* La versión anterior queda borrada: se empieza de cero. */
    try{ localStorage.removeItem("sobres-v2"); }catch(e){}
  }
  var cache = {};
  function guardar(){
    cache = {};
    try{ localStorage.setItem(LLAVE, JSON.stringify(datos)); }
    catch(e){ alert("No se pudo guardar. Revisá el espacio libre del teléfono."); }
  }
  function reemplazarDatos(nuevo){
    datos = nuevo; normalizar(); guardar();
  }

  /* ---------- búsquedas ---------- */
  function catDe(id){ return porId(datos.categorias, id); }
  function subDe(id){ return porId(datos.subs, id); }
  function tarDe(id){ return porId(datos.tarjetas, id); }
  function catsVivas(){ return datos.categorias.filter(function(c){ return !c.borrada; }); }
  function subsVivas(catId){ return datos.subs.filter(function(s){ return s.catId === catId && !s.borrada; }); }
  function tarjetasVivas(){ return datos.tarjetas.filter(function(t){ return !t.borrada; }); }
  function tipoSub(s){ var c = s ? catDe(s.catId) : null; return c ? c.tipo : "variable"; }
  function tarjetaDeMedio(m){ return (m && m.indexOf("t:") === 0) ? tarDe(m.slice(2)) : null; }
  function nombreMedio(m){ var t = tarjetaDeMedio(m); return t ? t.nombre : (m || ""); }

  /* ---------- tarjetas: fechas ---------- */
  function diaEn(a, m0, dia){
    var f = new Date(a, m0, 1, 12);
    var ult = new Date(f.getFullYear(), f.getMonth()+1, 0).getDate();
    f.setDate(Math.min(dia, ult));
    return f;
  }
  /* Corte en el que entra una compra hecha ese día. */
  function corteDe(t, iso){
    var d = deISO(iso), c = diaEn(d.getFullYear(), d.getMonth(), t.corte);
    if(iso > aISO(c)){ c = diaEn(d.getFullYear(), d.getMonth()+1, t.corte); }
    return c;
  }
  function corteMas(t, c, k){ return diaEn(c.getFullYear(), c.getMonth()+k, t.corte); }
  /* Fecha de pago de un corte: el primer día de pago después del corte. */
  function pagoDe(t, c){
    var p = diaEn(c.getFullYear(), c.getMonth(), t.pago);
    if(aISO(p) <= aISO(c)){ p = diaEn(c.getFullYear(), c.getMonth()+1, t.pago); }
    return p;
  }
  function diaDespues(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()+1, 12); }

  /* ---------- gastos y porciones ----------
     Un gasto normal es una sola porción en el mes de la compra.
     Un gasto en cuotas se reparte: una porción por mes y por corte. */
  function porciones(g){
    var n = g.cuotas > 1 ? g.cuotas : 1;
    var base = Math.floor(g.monto * 100 / n) / 100, acum = 0, out = [];
    var t = tarjetaDeMedio(g.medio), c0 = t ? corteDe(t, g.fecha) : null;
    for(var i = 0; i < n; i++){
      var m = (i === n - 1) ? r2(g.monto - acum) : base;
      acum = r2(acum + m);
      var p = {g:g, i:i+1, n:n, mes:sumaMeses(mesDe(g.fecha), i), monto:m, moneda:g.moneda || "Q"};
      if(t){ var c = corteMas(t, c0, i); p.corte = aISO(c); p.pago = aISO(pagoDe(t, c)); }
      out.push(p);
    }
    return out;
  }
  function todasPorciones(){
    if(!cache.todas){
      var out = [];
      datos.gastos.forEach(function(g){ porciones(g).forEach(function(p){ out.push(p); }); });
      cache.todas = out;
    }
    return cache.todas;
  }
  function porcionesMes(mes){
    var k = "m" + mes;
    if(!cache[k]){ cache[k] = todasPorciones().filter(function(p){ return p.mes === mes; }); }
    return cache[k];
  }
  function gastadoSub(id, mes, mon){
    mon = mon || "Q";
    return r2(porcionesMes(mes).reduce(function(t, p){
      return t + (p.g.subId === id && p.moneda === mon ? p.monto : 0);
    }, 0));
  }
  function gastadoCat(catId, mes, mon){
    mon = mon || "Q";
    return r2(porcionesMes(mes).reduce(function(t, p){
      var s = subDe(p.g.subId);
      return t + (s && s.catId === catId && p.moneda === mon ? p.monto : 0);
    }, 0));
  }
  function juntadoTotal(id){
    return r2(datos.gastos.reduce(function(t, g){
      return t + (g.subId === id && (g.moneda || "Q") === "Q" && g.fecha <= hoyISO() ? g.monto : 0);
    }, 0));
  }

  /* ---------- presupuesto ----------
     Cada mes que no tiene su propio monto usa el del mes anterior. */
  function tiene(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }
  function presu(id, mes){
    var k = mes;
    for(var n = 0; n < 120; n++){
      var o = datos.pres[k];
      if(o && tiene(o, id)){ return o[id]; }
      k = mesPrevio(k);
    }
    return 0;
  }
  function presuCat(catId, mes){
    return r2(subsVivas(catId).reduce(function(t, s){ return t + presu(s.id, mes); }, 0));
  }
  /* Deja fijos los montos de un mes (copiados del anterior). */
  function materializar(mes){
    var o = datos.pres[mes] || {};
    datos.subs.forEach(function(s){ if(!s.borrada && !tiene(o, s.id)){ o[s.id] = presu(s.id, mes); } });
    datos.pres[mes] = o;
  }
  function ponerPresu(id, mes, v){ materializar(mes); datos.pres[mes][id] = v; }
  function arrastre(s){
    if(!s.arrastra || tipoSub(s) !== "variable"){ return 0; }
    var hoy = mesDe(), k = s.desde || hoy, t = 0, g = 0;
    while(k < hoy && g++ < 240){
      var p = presu(s.id, k);
      if(p > 0){ t += p - gastadoSub(s.id, k); }
      k = mesSiguiente(k);
    }
    return r2(t);
  }
  function revisarMes(){
    var m = mesDe();
    if(datos.mesVisto !== m){
      if(datos.mesVisto){ materializar(m); }
      datos.mesVisto = m;
      guardar();
    }
  }

  /* ---------- pestañas ---------- */
  var tabActual = "sobres";
  var TABS = ["sobres","pres","ing","tar","res"];
  function pintarTab(){
    var f = {sobres:pintarSobres, pres:pintarPres, ing:api.pintarIngresos, tar:api.pintarTarjetas, res:api.pintarResumen}[tabActual];
    if(f){ f(); }
  }
  function mostrarTab(k){
    tabActual = k;
    TABS.forEach(function(x){ $("v-" + x).hidden = x !== k; });
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function(b){
      if(b.getAttribute("data-tab") === k){ b.setAttribute("aria-current", "page"); }
      else { b.removeAttribute("aria-current"); }
    });
    $("scroller").scrollTop = 0;
    pintarTab();
  }
  $("tabs").addEventListener("click", function(e){
    var b = e.target.closest("[data-tab]");
    if(b){ mostrarTab(b.getAttribute("data-tab")); }
  });

  /* ---------- hojas (se apilan; ← regresa a la anterior) ---------- */
  var pila = [];
  var alVolver = {};
  function abrir(id){
    if(pila.length){ $(pila[pila.length-1]).classList.remove("ver"); }
    pila.push(id);
    $("fondo").classList.add("ver");
    $(id).classList.add("ver");
    $(id).scrollTop = 0;
  }
  function atras(){
    var id = pila.pop();
    if(id){ $(id).classList.remove("ver"); }
    if(pila.length){
      var p = pila[pila.length-1];
      if(alVolver[p]){ alVolver[p](); }
      $(p).classList.add("ver");
    }else{
      $("fondo").classList.remove("ver");
    }
    pintarTab();
  }
  /* Cambia la hoja de arriba por otra, sin pasar por la anterior. */
  function reemplazar(id){
    var v = pila.pop();
    if(v){ $(v).classList.remove("ver"); }
    abrir(id);
  }
  function cerrarTodo(){
    pila.forEach(function(id){ $(id).classList.remove("ver"); });
    pila = [];
    $("fondo").classList.remove("ver");
    pintarTab();
  }
  $("fondo").addEventListener("click", cerrarTodo);
  document.addEventListener("click", function(e){
    if(e.target.closest("[data-atras]")){ atras(); }
  });
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape" && pila.length){ atras(); }
  });

  /* ---------- tarjeta dibujada ---------- */
  function colorDe(t){ return COLORES[t.color] || COLORES[7]; }
  function tarjetaHTML(t, chica){
    var c = colorDe(t);
    return '<div class="tarjeta' + (chica ? ' chica' : '') + '" style="background:' + c.bg + ';color:' + c.tx + '">' +
      '<div class="tNom">' + esc(t.nombre || "Sin nombre") + '</div><div class="tChip"></div>' +
      '<div class="tTipo">Crédito' + (t.moneda === "$" ? ' · $' : '') + '</div>' +
      '<div class="tRed">' + esc(t.red || "") + '</div></div>';
  }

  /* ================= SOBRES ================= */
  var abiertas = {};

  function pintarSobres(){
    var mes = mesDe(), hoy = hoyISO();
    $("fechaHoy").textContent = fechaCompleta(hoy);
    var total = 0, credito = 0, dolar = 0, mesesPago = {};
    porcionesMes(mes).forEach(function(p){
      if(p.moneda === "$"){ dolar += p.monto; return; }
      total += p.monto;
      if(p.pago){ credito += p.monto; mesesPago[p.pago.slice(0,7)] = 1; }
    });
    total = r2(total); credito = r2(credito); dolar = r2(dolar);
    $("totalGasto").textContent = Q(total);

    var l = ['<div>llevás gastado este mes</div>'];
    if(credito > 0){
      l.push('<div>de eso, ' + Q(credito) + ' con tarjeta de crédito, se paga en ' +
             unir(Object.keys(mesesPago).sort().map(soloMes)) + '</div>');
    }
    if(dolar > 0){ l.push('<div>y ' + dinero(dolar, "$") + ' con tarjeta en dólares</div>'); }
    var pt = r2(catsVivas().reduce(function(t, c){ return t + presuCat(c.id, mes); }, 0));
    if(pt > 0){
      var q = r2(pt - total);
      l.push(q >= 0 ? '<div class="tinta">Te quedan ' + Q(q) + ' de ' + Q(pt) + ' presupuestados</div>'
                    : '<div class="tinta alerta">Te pasaste por ' + Q(-q) + ' de ' + Q(pt) + ' presupuestados</div>');
    }
    $("totalPie").innerHTML = l.join("");

    var cats = catsVivas(), h = "";
    if(!cats.length){
      h += '<div class="vacio"><p>Todavía no tenés categorías.</p>' +
           '<button type="button" class="botonMas" data-accion="nuevaCat" aria-label="Agregar categoría">+</button>' +
           '<p class="chico">Tocá + para crear tu primera categoría.</p></div>';
    }
    cats.forEach(function(c){ h += bloqueCat(c, mes); });
    if(api.bloqueTarjetas){ h += api.bloqueTarjetas(); }
    if(cats.length){ h += '<button type="button" class="agregarCat" data-accion="nuevaCat">+ Agregar nueva categoría</button>'; }
    $("tablero").innerHTML = h;
    if(api.pintarAvisos){ api.pintarAvisos(); }
  }

  function bloqueCat(c, mes){
    var g = gastadoCat(c.id, mes), gd = gastadoCat(c.id, mes, "$"), p = presuCat(c.id, mes), ab = !!abiertas[c.id];
    var pasado = c.tipo !== "ahorro" && p > 0 && g > p, nota;
    if(c.tipo === "ahorro"){ nota = "Juntado " + Q(g) + (p > 0 ? " de " + Q(p) : "") + " este mes"; }
    else { nota = p > 0 ? "Gastado " + Q(g) + " de " + Q(p) + " presupuestados" : "Gastado " + Q(g) + " · sin presupuesto"; }
    var val = Q(g) + (gd > 0 ? " + " + dinero(gd, "$") : "");
    var h = '<div class="seccion' + (pasado ? ' pasado' : '') + '" data-tog="' + c.id + '">' +
      '<div class="top"><div class="izq"><span class="tog">' + esc(c.nombre) + '<span class="chev">' + (ab ? '▾' : '▸') + '</span></span>' +
      '<button type="button" class="editar" data-edcat="' + c.id + '">Editar</button></div>' +
      '<span class="cifra val">' + val + '</span></div><div class="nota">' + nota + '</div></div>';
    if(ab){
      h += '<div class="contenido">';
      subsVivas(c.id).forEach(function(s){ h += filaSub(s, c, mes); });
      h += '<button type="button" class="agregar" data-addsub="' + c.id + '">+ agregar subcategoría</button></div>';
    }
    return h;
  }

  function filaSub(s, c, mes){
    var g = gastadoSub(s.id, mes), gd = gastadoSub(s.id, mes, "$"), p = presu(s.id, mes);
    var cls = "", nota = "", val = Q(g) + (gd > 0 ? " + " + dinero(gd, "$") : "");
    if(c.tipo === "fija"){
      var reg = porcionesMes(mes).filter(function(x){ return x.g.subId === s.id; });
      if(reg.length){
        var u = reg[reg.length-1];
        nota = "pagado el " + diaCorto(u.g.fecha) + " · " + esc(nombreMedio(u.g.medio));
        cls = " pagado";
      }else{
        nota = p > 0 ? "por pagar · esperado " + Q(p) : "por pagar";
        if(p > 0){ val = Q(p); }
      }
    }else if(c.tipo === "ahorro"){
      var tot = juntadoTotal(s.id);
      nota = "Juntado en total " + Q(tot);
      if(s.meta > 0){ nota += " de " + Q(s.meta) + " · " + (tot >= s.meta ? "¡meta cumplida!" : "faltan " + Q(s.meta - tot)); }
    }else{
      var a = arrastre(s), d = r2(p + a);
      if(p > 0 || a !== 0){
        var q = r2(d - g);
        nota = q >= 0 ? "Te quedan " + Q(q) + " de " + Q(d) : "Te pasaste por " + Q(-q) + " de " + Q(d);
        if(a !== 0){ nota += " (" + (a > 0 ? "incluye " + Q(a) + " que sobró" : "descuenta " + Q(-a) + " que te pasaste") + " antes)"; }
        if(q < 0){ cls = " pasado"; }
      }else{
        nota = "sin presupuesto";
      }
    }
    return '<button type="button" class="fila' + cls + '" data-sub="' + s.id + '"><div class="top"><span class="nom">' +
      esc(s.nombre) + '</span><span class="cifra val">' + val + '</span></div><div class="nota">' + nota + '</div></button>';
  }

  $("tablero").addEventListener("click", function(e){
    var b;
    if((b = e.target.closest("[data-edcat]"))){ abrirEdCat(b.getAttribute("data-edcat")); return; }
    if((b = e.target.closest("[data-sub]"))){ abrirRegistro({subId:b.getAttribute("data-sub")}); return; }
    if((b = e.target.closest("[data-addsub]"))){ abrirNueva("sub", b.getAttribute("data-addsub")); return; }
    if((b = e.target.closest("[data-pagar]"))){ api.abrirPago(b.getAttribute("data-pagar")); return; }
    if((b = e.target.closest('[data-accion="nuevaCat"]'))){ abrirNueva("cat"); return; }
    if((b = e.target.closest("[data-tog]"))){
      var id = b.getAttribute("data-tog");
      abiertas[id] = !abiertas[id];
      pintarSobres();
    }
  });

  /* ================= REGISTRAR / EDITAR GASTO ================= */
  var reg = null;

  function abrirRegistro(o){
    cargarReg(o);
    abrir("hojaReg");
  }
  function cargarReg(o){
    if(o.gastoId){
      var g = porId(datos.gastos, o.gastoId);
      reg = {id:g.id, subId:g.subId, buffer:String(g.monto), fecha:g.fecha, medio:g.medio,
             enCuotas:(g.cuotas || 1) > 1, cuotas:(g.cuotas || 1) > 1 ? g.cuotas : ""};
    }else{
      var s = subDe(o.subId);
      reg = {id:null, subId:s.id, buffer:"", fecha:hoyISO(), medio:null, enCuotas:false, cuotas:""};
      var mes = mesDe();
      if(tipoSub(s) === "fija" && gastadoSub(s.id, mes) === 0 && presu(s.id, mes) > 0){
        reg.buffer = String(presu(s.id, mes));
      }
    }
    $("rNuevaSub").hidden = true; $("rNuevaNombre").value = "";
    $("rOtroNombre").value = ""; $("rOtroNombre").hidden = true;
    $("inpFecha").hidden = true;
    pintarReg();
    $("hojaReg").scrollTop = 0;
  }

  function pintarReg(){
    var s = subDe(reg.subId), c = catDe(s.catId), tipo = c.tipo, mes = mesDe(reg.fecha);
    $("tReg").textContent = reg.id ? "Editar gasto" : (tipo === "ahorro" ? "Registrar aporte" : "Registrar gasto");
    $("rEtiq").textContent = c.nombre.toUpperCase() + " · SUBCATEGORÍA";

    var h = "";
    var lista = subsVivas(c.id);
    if(s.borrada){ lista = [s].concat(lista); }
    lista.forEach(function(x){
      h += '<button type="button" data-rsub="' + x.id + '" aria-pressed="' + (x.id === reg.subId) + '">' + esc(x.nombre) + '</button>';
    });
    h += '<button type="button" class="nueva" data-rnueva="1">+ nueva</button>';
    $("rSubs").innerHTML = h;

    var info = "";
    if(tipo === "ahorro"){
      info = "Llevás " + Q(juntadoTotal(s.id)) + " juntados" + (s.meta > 0 ? " de " + Q(s.meta) : "");
    }else if(tipo === "fija"){
      var g = gastadoSub(s.id, mes);
      info = g > 0 && !reg.id ? "Ya registraste " + Q(g) + " este mes"
           : (presu(s.id, mes) > 0 ? "Esperado " + Q(presu(s.id, mes)) + ". Corregilo si el recibo vino distinto." : "");
    }else{
      var p = presu(s.id, mes) + (mes === mesDe() ? arrastre(s) : 0);
      if(p > 0){ info = "Te quedan " + Q(p - gastadoSub(s.id, mes)) + " de " + Q(p) + " en " + soloMes(mes); }
    }
    $("rInfo").textContent = info;

    pintarFecha();
    pintarMedios(tipo);
    pintarMonto();

    var g0 = reg.id ? porId(datos.gastos, reg.id) : null;
    $("rNotaEdit").textContent = g0 && g0.cuotas > 1 ? "Este gasto es en " + g0.cuotas + " cuotas: los cambios se aplican a todas." : "";
    $("rEliminar").hidden = !reg.id;
    $("rEliminar").textContent = tipo === "ahorro" ? "Eliminar aporte" : "Eliminar gasto";

    /* registros de este mes en la subcategoría */
    var mesHoy = mesDe(), rows = "";
    porcionesMes(mesHoy).filter(function(x){ return x.g.subId === s.id; })
      .sort(function(a, b){ return a.g.fecha < b.g.fecha ? 1 : -1; })
      .forEach(function(x){
        rows += '<button type="button" class="linea" data-rg="' + x.g.id + '"><span class="et">' + diaCorto(x.g.fecha) +
          '<small>' + esc(nombreMedio(x.g.medio)) + (x.n > 1 ? ' · cuota ' + x.i + ' de ' + x.n : '') + '</small></span>' +
          '<span class="ci">' + dinero(x.monto, x.moneda) + '</span></button>';
      });
    $("rListaEt").hidden = !rows || !!reg.id;
    $("rLista").innerHTML = reg.id ? "" : rows;
  }

  function pintarMonto(){
    $("pantalla").textContent = (reg.medio && tarjetaDeMedio(reg.medio) && tarjetaDeMedio(reg.medio).moneda === "$" ? "$" : "Q") +
      (reg.buffer === "" ? "0" : reg.buffer);
    var tipo = tipoSub(subDe(reg.subId));
    var medioOk = tipo === "ahorro" || (reg.medio && (reg.medio !== "__otro" || $("rOtroNombre").value.trim()));
    $("rGuardar").disabled = !(parseFloat(reg.buffer) > 0 && medioOk);
    $("rGuardar").textContent = reg.id ? "Guardar cambios" : (tipo === "ahorro" ? "Guardar aporte" : "Guardar gasto");
    pintarCuotasInfo();
  }

  function pintarFecha(){
    var b = $("btnFecha");
    b.innerHTML = (reg.fecha === hoyISO() ? "Hoy, " : "") + fechaCompleta(reg.fecha) + '<span class="cambia">cambiar</span>';
  }
  $("btnFecha").addEventListener("click", function(){
    var i = $("inpFecha");
    rangoFecha(i, reg.fecha);
    i.value = reg.fecha;
    i.hidden = false;
    if(i.showPicker){ try{ i.showPicker(); }catch(e){ i.focus(); } } else { i.focus(); }
  });
  $("inpFecha").addEventListener("change", function(){
    if(!this.value || this.value > hoyISO()){ return; }
    reg.fecha = this.value;
    this.hidden = true;
    pintarReg();
  });

  function pintarMedios(tipo){
    $("rMedioBox").hidden = tipo === "ahorro";
    if(tipo === "ahorro"){ return; }
    var h = "";
    var ts = tarjetasVivas();
    var actual = tarjetaDeMedio(reg.medio);
    if(actual && actual.borrada){ ts = [actual].concat(ts); }
    ts.forEach(function(t){
      var m = "t:" + t.id;
      h += '<button type="button" class="elige" data-medio="' + m + '" aria-pressed="' + (m === reg.medio) + '" aria-label="' + esc(t.nombre) + '">' + tarjetaHTML(t, true) + '</button>';
    });
    $("rTarjetas").innerHTML = h;
    $("rTarjetas").hidden = !ts.length;
    var lista = MEDIOS_FIJOS.concat(datos.otrosMedios);
    if(reg.medio && !tarjetaDeMedio(reg.medio) && reg.medio !== "__otro" && lista.indexOf(reg.medio) < 0){ lista.push(reg.medio); }
    h = "";
    lista.forEach(function(m){
      h += '<button type="button" data-medio="' + esc(m) + '" aria-pressed="' + (m === reg.medio) + '">' + esc(m) + '</button>';
    });
    h += '<button type="button" class="nueva" data-medio="__otro" aria-pressed="' + (reg.medio === "__otro") + '">Otro…</button>';
    $("rMedios").innerHTML = h;
    $("rOtroNombre").hidden = reg.medio !== "__otro";
    var t = tarjetaDeMedio(reg.medio);
    $("rCuotasBox").hidden = !t;
    $("rCuotas").checked = !!reg.enCuotas;
    $("rCuotasCampos").hidden = !reg.enCuotas;
    $("rNCuotas").value = reg.cuotas;
  }

  function pintarCuotasInfo(){
    var n = parseInt(reg.cuotas, 10), m = parseFloat(reg.buffer), t = tarjetaDeMedio(reg.medio);
    if(!t || !reg.enCuotas || !(n >= 2) || !(m > 0)){ $("rCuotasInfo").textContent = ""; return; }
    var s = subDe(reg.subId), c = catDe(s.catId), cuota = Math.floor(m * 100 / n) / 100;
    var desde = mesDe(reg.fecha), hasta = sumaMeses(desde, n - 1);
    $("rCuotasInfo").textContent = n + " cuotas de " + dinero(cuota, t.moneda) + ". Se cuenta " + dinero(cuota, t.moneda) +
      " cada mes en " + c.nombre + ", de " + soloMes(desde) + " a " + soloMes(hasta) + ".";
  }

  $("teclado").addEventListener("click", function(e){
    var b = e.target.closest("[data-t]");
    if(!b){ return; }
    var k = b.getAttribute("data-t"), v = reg.buffer;
    if(k === "b"){ v = v.slice(0, -1); }
    else if(k === "."){ if(v.indexOf(".") < 0){ v = (v || "0") + "."; } }
    else{
      if(v.indexOf(".") >= 0 && v.split(".")[1].length >= 2){ return; }
      if(v.replace(".", "").length >= 9){ return; }
      v = (v === "0") ? k : v + k;
    }
    reg.buffer = v;
    pintarMonto();
  });

  $("rSubs").addEventListener("click", function(e){
    var b = e.target.closest("[data-rsub]");
    if(b){ reg.subId = b.getAttribute("data-rsub"); pintarReg(); return; }
    if(e.target.closest("[data-rnueva]")){
      $("rNuevaSub").hidden = false;
      $("rNuevaNombre").focus();
    }
  });
  $("rNuevaCrear").addEventListener("click", function(){
    var n = $("rNuevaNombre").value.trim(), s0 = subDe(reg.subId);
    if(!n){ return; }
    var ya = subsVivas(s0.catId).filter(function(x){ return norm(x.nombre) === norm(n); })[0];
    if(ya){ reg.subId = ya.id; }
    else{
      var s = {id:nid(), catId:s0.catId, nombre:n, desde:mesDe()};
      datos.subs.push(s); guardar();
      reg.subId = s.id;
    }
    $("rNuevaSub").hidden = true; $("rNuevaNombre").value = "";
    pintarReg();
  });

  function clicMedio(e){
    var b = e.target.closest("[data-medio]");
    if(!b){ return; }
    reg.medio = b.getAttribute("data-medio");
    if(!tarjetaDeMedio(reg.medio)){ reg.enCuotas = false; }
    pintarMedios("variable");
    pintarMonto();
    if(reg.medio === "__otro"){ $("rOtroNombre").focus(); }
  }
  $("rTarjetas").addEventListener("click", clicMedio);
  $("rMedios").addEventListener("click", clicMedio);
  $("rOtroNombre").addEventListener("input", pintarMonto);
  $("rCuotas").addEventListener("change", function(){
    reg.enCuotas = this.checked;
    $("rCuotasCampos").hidden = !reg.enCuotas;
    if(reg.enCuotas){ $("rNCuotas").focus(); }
    pintarMonto();
  });
  $("rNCuotas").addEventListener("input", function(){ reg.cuotas = this.value; pintarCuotasInfo(); });
  $("rLista").addEventListener("click", function(e){
    var b = e.target.closest("[data-rg]");
    if(b){ cargarReg({gastoId:b.getAttribute("data-rg")}); }
  });

  $("rGuardar").addEventListener("click", function(){
    var s = subDe(reg.subId), tipo = tipoSub(s), monto = r2(parseFloat(reg.buffer));
    if(!(monto > 0)){ return; }
    var medio = tipo === "ahorro" ? "Ahorro" : reg.medio;
    if(medio === "__otro"){
      var n = $("rOtroNombre").value.trim();
      if(!n){ return; }
      var todos = MEDIOS_FIJOS.concat(datos.otrosMedios);
      var ya = todos.filter(function(x){ return norm(x) === norm(n); })[0];
      medio = ya || n;
      if(!ya){ datos.otrosMedios.push(n); }
    }
    if(!medio){ return; }
    var t = tarjetaDeMedio(medio), n2 = parseInt(reg.cuotas, 10);
    var cuotas = (t && reg.enCuotas && n2 >= 2) ? Math.min(n2, 60) : 1;
    var g = reg.id ? porId(datos.gastos, reg.id) : {id:nid(), creado:Date.now()};
    g.subId = s.id; g.monto = monto; g.fecha = reg.fecha; g.medio = medio; g.cuotas = cuotas;
    g.moneda = (t && t.moneda === "$") ? "$" : "Q";
    if(!reg.id){ datos.gastos.push(g); }
    guardar();
    atras();
  });
  $("rEliminar").addEventListener("click", function(){
    if(!reg.id){ return; }
    if(!confirm("¿Eliminar este registro? No se puede deshacer.")){ return; }
    datos.gastos = datos.gastos.filter(function(g){ return g.id !== reg.id; });
    guardar();
    atras();
  });
  alVolver.hojaReg = function(){
    if(reg && reg.id && !porId(datos.gastos, reg.id)){ reg.id = null; }
    if(reg && subDe(reg.subId)){ pintarReg(); }
  };

  /* ================= NUEVA CATEGORÍA / SUBCATEGORÍA ================= */
  var nv = null;

  function abrirNueva(modo, catId){
    nv = {modo:modo, catId:catId || null, nombre:null, otro:false, tipo:null, sel:[], extras:[], metas:{}};
    if(modo === "sub"){ nv.tipo = catDe(catId).tipo; }
    $("nOtro").value = ""; $("nOtro").hidden = true;
    $("nSubOtro").value = ""; $("nSubOtroBox").hidden = true;
    $("nAviso").hidden = true;
    pintarNueva();
    abrir("hojaNueva");
  }

  function pintarNueva(){
    var cat = nv.modo === "sub" ? catDe(nv.catId) : null;
    $("tNueva").textContent = cat ? "Nueva subcategoría · " + cat.nombre : "Nueva categoría";
    $("nCatBox").hidden = !!cat;
    $("nGuardar").textContent = cat ? "Guardar" : "Guardar categoría";
    var h = "";
    if(!cat){
      var ya = catsVivas().map(function(c){ return norm(c.nombre); });
      SUG.forEach(function(x){
        if(ya.indexOf(norm(x.n)) >= 0){ return; }
        h += '<button type="button" data-nnom="' + esc(x.n) + '" aria-pressed="' + (!nv.otro && nv.nombre === x.n) + '">' + esc(x.n) + '</button>';
      });
      h += '<button type="button" class="nueva" data-nnom="__otro" aria-pressed="' + nv.otro + '">Otro…</button>';
      $("nNombres").innerHTML = h;
      $("nOtro").hidden = !nv.otro;
      Array.prototype.forEach.call($("nTipo").children, function(b){
        b.setAttribute("aria-pressed", b.getAttribute("data-v") === nv.tipo ? "true" : "false");
      });
      $("nTipoAyuda").textContent = nv.tipo ? AYUDA_TIPO[nv.tipo] : "";
    }
    /* subcategorías sugeridas */
    var base = cat ? sugDe(cat.nombre) : (!nv.otro && nv.nombre ? sugDe(nv.nombre) : null);
    var existentes = cat ? subsVivas(cat.id).map(function(s){ return norm(s.nombre); }) : [];
    var opciones = [];
    (base ? base.s : []).forEach(function(n){ if(existentes.indexOf(norm(n)) < 0){ opciones.push(n); } });
    nv.extras.forEach(function(n){ if(opciones.indexOf(n) < 0){ opciones.push(n); } });
    h = "";
    opciones.forEach(function(n){
      var on = nv.sel.indexOf(n) >= 0;
      h += '<button type="button" data-nsub="' + esc(n) + '" aria-pressed="' + on + '">' + (on ? '✓ ' : '') + esc(n) + '</button>';
    });
    h += '<button type="button" class="nueva" data-nsub="__otro">Otro…</button>';
    $("nSubs").innerHTML = h;

    /* metas para ahorro */
    h = "";
    if(nv.tipo === "ahorro" && nv.sel.length){
      h += '<span class="etiq">META TOTAL (OPCIONAL)</span>';
      nv.sel.forEach(function(n){
        var m = nv.metas[n] || {on:false, v:""};
        h += '<div class="metaFila" data-meta="' + esc(n) + '"><label class="check"><input type="checkbox" class="mOn"' + (m.on ? ' checked' : '') + '> ' + esc(n) + ' tiene meta</label>' +
             '<input type="number" class="mV" inputmode="decimal" min="0" step="0.01" placeholder="Q" value="' + esc(m.v) + '"' + (m.on ? '' : ' hidden') + '></div>';
      });
    }
    $("nMetas").innerHTML = h;
  }

  $("nNombres").addEventListener("click", function(e){
    var b = e.target.closest("[data-nnom]");
    if(!b){ return; }
    var v = b.getAttribute("data-nnom");
    if(v === "__otro"){
      nv.otro = true; nv.nombre = null;
      nv.sel = nv.sel.filter(function(n){ return nv.extras.indexOf(n) >= 0; });
      pintarNueva(); $("nOtro").focus(); return;
    }
    nv.otro = false; nv.nombre = v;
    var s = sugDe(v);
    nv.tipo = s.t;
    nv.sel = nv.sel.filter(function(n){ return nv.extras.indexOf(n) >= 0; });
    pintarNueva();
  });
  $("nTipo").addEventListener("click", function(e){
    var b = e.target.closest("[data-v]");
    if(b){ nv.tipo = b.getAttribute("data-v"); pintarNueva(); }
  });
  $("nSubs").addEventListener("click", function(e){
    var b = e.target.closest("[data-nsub]");
    if(!b){ return; }
    var v = b.getAttribute("data-nsub");
    if(v === "__otro"){ $("nSubOtroBox").hidden = false; $("nSubOtro").focus(); return; }
    var i = nv.sel.indexOf(v);
    if(i >= 0){ nv.sel.splice(i, 1); } else { nv.sel.push(v); }
    pintarNueva();
  });
  function agregarSubOtro(){
    var n = $("nSubOtro").value.trim();
    if(!n){ return; }
    var ya = nv.sel.concat(nv.extras).filter(function(x){ return norm(x) === norm(n); })[0];
    if(!ya){ nv.extras.push(n); nv.sel.push(n); }
    else if(nv.sel.indexOf(ya) < 0){ nv.sel.push(ya); }
    $("nSubOtro").value = "";
    $("nSubOtroBox").hidden = true;
    pintarNueva();
  }
  $("nSubAgregar").addEventListener("click", agregarSubOtro);
  $("nSubOtro").addEventListener("keydown", function(e){ if(e.key === "Enter"){ e.preventDefault(); agregarSubOtro(); } });
  $("nMetas").addEventListener("input", function(e){
    var f = e.target.closest("[data-meta]");
    if(!f){ return; }
    var n = f.getAttribute("data-meta");
    nv.metas[n] = {on:f.querySelector(".mOn").checked, v:f.querySelector(".mV").value};
    f.querySelector(".mV").hidden = !nv.metas[n].on;
  });
  $("nMetas").addEventListener("change", function(e){
    var f = e.target.closest("[data-meta]");
    if(!f){ return; }
    var n = f.getAttribute("data-meta");
    nv.metas[n] = {on:f.querySelector(".mOn").checked, v:f.querySelector(".mV").value};
    f.querySelector(".mV").hidden = !nv.metas[n].on;
    if(nv.metas[n].on){ f.querySelector(".mV").focus(); }
  });

  function avisoNueva(t){ $("nAviso").textContent = t; $("nAviso").hidden = false; }
  $("nGuardar").addEventListener("click", function(){
    $("nAviso").hidden = true;
    if($("nSubOtro").value.trim()){ agregarSubOtro(); }
    var cat;
    if(nv.modo === "cat"){
      var nombre = nv.otro ? $("nOtro").value.trim() : nv.nombre;
      if(!nombre){ avisoNueva("Elegí o escribí el nombre de la categoría."); return; }
      if(catsVivas().some(function(c){ return norm(c.nombre) === norm(nombre); })){ avisoNueva("Ya tenés una categoría con ese nombre."); return; }
      if(!nv.tipo){ avisoNueva("Elegí el tipo: fija, variable o ahorro."); return; }
      if(!nv.sel.length){ avisoNueva("Elegí al menos una subcategoría."); return; }
      cat = {id:nid(), nombre:nombre, tipo:nv.tipo};
      datos.categorias.push(cat);
      abiertas[cat.id] = true;
    }else{
      cat = catDe(nv.catId);
      if(!nv.sel.length){ avisoNueva("Elegí o escribí al menos una subcategoría."); return; }
    }
    nv.sel.forEach(function(n){
      var s = {id:nid(), catId:cat.id, nombre:n, desde:mesDe()};
      var m = nv.metas[n];
      if(cat.tipo === "ahorro" && m && m.on && numero(m.v) > 0){ s.meta = r2(numero(m.v)); }
      datos.subs.push(s);
    });
    guardar();
    atras();
  });

  /* ================= EDITAR CATEGORÍA ================= */
  var ed = null;

  function iniciarEd(id){
    var c = catDe(id);
    ed = {id:id, nombre:c.nombre, tipo:c.tipo, subs:{}, quitar:{}};
    subsVivas(id).forEach(function(s){
      ed.subs[s.id] = {nombre:s.nombre, metaOn:s.meta > 0, meta:s.meta > 0 ? s.meta : "", arrastra:!!s.arrastra};
    });
  }
  function abrirEdCat(id){
    iniciarEd(id);
    pintarEd();
    abrir("hojaEd");
  }
  function pintarEd(){
    $("edNombre").value = ed.nombre;
    $("edAviso").hidden = true;
    Array.prototype.forEach.call($("edTipo").children, function(b){
      b.setAttribute("aria-pressed", b.getAttribute("data-v") === ed.tipo ? "true" : "false");
    });
    var h = "";
    subsVivas(ed.id).forEach(function(s){
      if(ed.quitar[s.id]){ return; }
      var x = ed.subs[s.id];
      h += '<div class="edSub" data-es="' + s.id + '"><div class="l1"><input type="text" class="esN" value="' + esc(x.nombre) + '" aria-label="Nombre de la subcategoría">' +
           '<button type="button" class="quitar" data-quitar="' + s.id + '">Quitar</button></div>';
      if(ed.tipo === "ahorro"){
        h += '<div class="metaFila"><label class="check"><input type="checkbox" class="esM"' + (x.metaOn ? ' checked' : '') + '> Tiene meta total</label>' +
             '<input type="number" class="esMV" inputmode="decimal" min="0" step="0.01" placeholder="Q" value="' + esc(x.meta) + '"' + (x.metaOn ? '' : ' hidden') + '></div>';
      }
      if(ed.tipo === "variable"){
        h += '<label class="check"><input type="checkbox" class="esA"' + (x.arrastra ? ' checked' : '') + '> Pasar lo que sobra al mes siguiente</label>';
      }
      h += '</div>';
    });
    $("edSubs").innerHTML = h || '<p class="segunda">Esta categoría no tiene subcategorías.</p>';
  }
  function leerEd(){
    ed.nombre = $("edNombre").value;
    Array.prototype.forEach.call($("edSubs").querySelectorAll("[data-es]"), function(f){
      var x = ed.subs[f.getAttribute("data-es")];
      x.nombre = f.querySelector(".esN").value;
      if(f.querySelector(".esM")){ x.metaOn = f.querySelector(".esM").checked; x.meta = f.querySelector(".esMV").value; }
      if(f.querySelector(".esA")){ x.arrastra = f.querySelector(".esA").checked; }
    });
  }
  $("edSubs").addEventListener("change", function(e){
    if(e.target.classList.contains("esM")){
      var v = e.target.closest(".edSub").querySelector(".esMV");
      v.hidden = !e.target.checked;
      if(e.target.checked){ v.focus(); }
    }
  });
  $("edTipo").addEventListener("click", function(e){
    var b = e.target.closest("[data-v]");
    if(!b){ return; }
    leerEd(); ed.tipo = b.getAttribute("data-v"); pintarEd();
  });
  $("edSubs").addEventListener("click", function(e){
    var b = e.target.closest("[data-quitar]");
    if(!b){ return; }
    var s = subDe(b.getAttribute("data-quitar"));
    if(!confirm("¿Quitar " + s.nombre + "? Sus gastos anteriores se quedan en el historial.")){ return; }
    leerEd(); ed.quitar[s.id] = true; pintarEd();
  });
  function guardarEd(){
    leerEd();
    var n = ed.nombre.trim();
    if(!n){ $("edAviso").textContent = "Escribí el nombre de la categoría."; $("edAviso").hidden = false; return false; }
    if(catsVivas().some(function(c){ return c.id !== ed.id && norm(c.nombre) === norm(n); })){
      $("edAviso").textContent = "Ya tenés otra categoría con ese nombre."; $("edAviso").hidden = false; return false;
    }
    var c = catDe(ed.id);
    c.nombre = n; c.tipo = ed.tipo;
    Object.keys(ed.subs).forEach(function(id){
      var s = subDe(id), x = ed.subs[id];
      if(ed.quitar[id]){ s.borrada = true; return; }
      if(x.nombre.trim()){ s.nombre = x.nombre.trim(); }
      var m = numero(x.meta);
      if(x.metaOn && m > 0){ s.meta = r2(m); } else { delete s.meta; }
      s.arrastra = !!x.arrastra;
    });
    guardar();
    return true;
  }
  $("edGuardar").addEventListener("click", function(){ if(guardarEd()){ atras(); } });
  $("edAgregar").addEventListener("click", function(){ if(guardarEd()){ abrirNueva("sub", ed.id); } });
  $("edEliminar").addEventListener("click", function(){
    var c = catDe(ed.id);
    if(!confirm("¿Eliminar la categoría " + c.nombre + "? Sus gastos anteriores se quedan en el historial y en el Resumen.")){ return; }
    c.borrada = true;
    datos.subs.forEach(function(s){ if(s.catId === c.id){ s.borrada = true; } });
    guardar();
    cerrarTodo();
  });
  alVolver.hojaEd = function(){ if(ed && catDe(ed.id)){ iniciarEd(ed.id); pintarEd(); } };

  /* ================= PRESUPUESTO ================= */
  var presMes = mesDe();

  function pintarPres(){
    $("pMes").textContent = nombreMes(presMes);
    var cats = catsVivas(), total = 0, h = "";
    if(!cats.length){ $("pLista").innerHTML = '<p class="segunda">Primero creá tus categorías en Sobres.</p>'; return; }
    cats.forEach(function(c){
      var filas = "", pc = 0;
      subsVivas(c.id).forEach(function(s){
        var p = presu(s.id, presMes);
        pc += p;
        filas += '<div class="pFila"><div class="pn">' + esc(s.nombre) +
          '<button type="button" class="editar" data-edp="' + s.id + '">Editar</button>' +
          (s.meta > 0 ? '<small>meta ' + Q(s.meta) + '</small>' : '') + '</div>' +
          '<span class="cifra pv" id="pv-' + s.id + '">' + Q(p) + '</span></div>';
      });
      total += pc;
      h += '<div class="pCat"><div class="pCab"><b>' + esc(c.nombre) + '</b><span class="cifra">' + Q(pc) + '</span></div>' +
           '<div class="pSubs">' + (filas || '<p class="segunda">Sin subcategorías. Agregalas en Sobres.</p>') + '</div></div>';
    });
    $("pLista").innerHTML = '<div class="pTotal"><b>Total del mes</b><span class="cifra">' + Q(total) + '</span></div>' + h;
  }
  $("pAnt").addEventListener("click", function(){ presMes = mesPrevio(presMes); pintarPres(); });
  $("pSig").addEventListener("click", function(){ presMes = mesSiguiente(presMes); pintarPres(); });
  $("pLista").addEventListener("click", function(e){
    var b = e.target.closest("[data-edp]");
    if(!b){ return; }
    var id = b.getAttribute("data-edp"), sp = $("pv-" + id);
    if(!sp){ return; }
    var inp = document.createElement("input");
    inp.type = "number"; inp.inputMode = "decimal"; inp.min = "0"; inp.step = "0.01";
    var p = presu(id, presMes);
    inp.value = p ? String(p) : "";
    inp.setAttribute("aria-label", "Monto");
    sp.parentNode.replaceChild(inp, sp);
    inp.focus();
    var hecho = false;
    inp.addEventListener("blur", function(){
      if(hecho){ return; }
      hecho = true;
      var v = numero(inp.value);
      if(isNaN(v) || v < 0){ v = 0; }
      ponerPresu(id, presMes, r2(v));
      guardar();
      pintarPres();
    });
    inp.addEventListener("keydown", function(ev){ if(ev.key === "Enter"){ inp.blur(); } });
  });

  /* ---------- modo claro / oscuro ---------- */
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function modo(){ document.documentElement.setAttribute("data-m", mq && mq.matches ? "oscuro" : "claro"); }
  if(mq && mq.addEventListener){ mq.addEventListener("change", modo); }
  modo();

  /* ---------- arranque ---------- */
  cargar();
  revisarMes();

  var api = {
    $:$, nid:nid, Q:Q, dinero:dinero, esc:esc, r2:r2, numero:numero, norm:norm, unir:unir, porId:porId,
    aISO:aISO, deISO:deISO, hoyISO:hoyISO, mesDe:mesDe, sumaMeses:sumaMeses, mesPrevio:mesPrevio, mesSiguiente:mesSiguiente,
    nombreMes:nombreMes, soloMes:soloMes, diaCorto:diaCorto, diaLargo:diaLargo, fechaCompleta:fechaCompleta, rangoFecha:rangoFecha,
    datos:function(){ return datos; }, guardar:guardar, reemplazarDatos:reemplazarDatos,
    catDe:catDe, subDe:subDe, tarDe:tarDe, catsVivas:catsVivas, subsVivas:subsVivas, tarjetasVivas:tarjetasVivas,
    tipoSub:tipoSub, tarjetaDeMedio:tarjetaDeMedio, nombreMedio:nombreMedio,
    corteDe:corteDe, corteMas:corteMas, pagoDe:pagoDe, diaDespues:diaDespues,
    porciones:porciones, todasPorciones:todasPorciones, porcionesMes:porcionesMes,
    gastadoSub:gastadoSub, gastadoCat:gastadoCat, juntadoTotal:juntadoTotal, presu:presu, presuCat:presuCat,
    COLORES:COLORES, tarjetaHTML:tarjetaHTML,
    mostrarTab:mostrarTab, pintarTab:pintarTab, abrir:abrir, atras:atras, reemplazar:reemplazar, cerrarTodo:cerrarTodo,
    alVolver:alVolver, abrirRegistro:abrirRegistro, pintarSobres:pintarSobres
  };

  /* Se pinta después de que caja.js se engancha. */
  setTimeout(function(){ mostrarTab("sobres"); }, 0);

  return api;
})();
