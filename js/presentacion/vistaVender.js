import { $, escapar, dinero, formatear, mostrarMensaje, delegar, normalizarTexto, limpiar } from './utilidades.js';
import { ServicioProductos } from '../negocio/servicioProductos.js';
import { ServicioClientes } from '../negocio/servicioClientes.js';
import { ServicioVentas } from '../negocio/servicioVentas.js';
import { ServicioCaja } from '../negocio/servicioCaja.js';
import { MEDIOS, armarPagos, resumenPagos } from '../negocio/pagos.js';
import { aNumero } from '../negocio/texto.js';
import { verComprobante } from './comprobante.js';
let productos = [], filtro = null, busqueda = '', ultimaVenta = null;
const categoriaDe = p => p.categoria_id ?? 0;   // 0 = sin categoría
const CAMPOS_PAGO = MEDIOS.map(m => 'pg_' + m.id);
const leerPagos = () => armarPagos(Object.fromEntries(MEDIOS.map(m => [m.id, $('pg_' + m.id).value])));
function pintarPagos() {
  const total = ServicioVentas.total(), r = resumenPagos(total, leerPagos());
  $('pg_resumen').innerHTML = total === 0 ? '' : `Total <b>${dinero(total)}</b> &nbsp;·&nbsp; Cobrado <b>${dinero(r.pagado)}</b> &nbsp;·&nbsp; `
    + (r.exceso > 0.005 ? `<span class="baja">Sobran ${dinero(r.exceso)}</span>` : r.falta > 0.005 ? `<span class="baja">Falta ${dinero(r.falta)}</span>` : '<span class="sube">Completo</span>');
}
// La deuda solo se puede usar con un cliente registrado
function actualizarDeuda() { const hay = $('cliSel').value !== ''; $('pg_deuda').disabled = !hay; if (!hay) $('pg_deuda').value = ''; $('pg_deuda_nota').style.display = hay ? 'none' : ''; }
function reiniciarPagos() { limpiar(...CAMPOS_PAGO); const t = ServicioVentas.total(); $('pg_efectivo').value = t > 0 ? String(t) : ''; actualizarDeuda(); pintarPagos(); }
// El envío cambia el total y los cobros se recalculan
function cambiarEnvio() { ServicioVentas.configurarEnvio($('envio').value); dibujarCarrito(); reiniciarPagos(); pintarContra(); }
// Contra entrega: no se registran pagos ahora; el delivery cobra el total en efectivo y la venta cuenta cuando lo marca cobrado
function cambiarCobro() { ServicioVentas.configurarContraEntrega($('tipo').value === 'delivery' && $('cobro_entrega').value === 'contra'); pintarContra(); }
function pintarContra() {
  const contra = ServicioVentas.contraEntrega();
  $('bloque_pagos').style.display = contra ? 'none' : ''; $('aviso_contra').style.display = contra ? '' : 'none';
  $('aviso_contra').innerHTML = `Contra entrega: el cliente le paga <b>${dinero(ServicioVentas.total())}</b> en efectivo al delivery. La venta suma a las ventas y a la caja cuando el delivery la marque como cobrada.`;
}
function pintarAviso() {
  const v = ultimaVenta; $('venta_ok').style.display = v ? '' : 'none';
  if (v) $('venta_ok').innerHTML = `<span>Venta <b>${escapar(v.codigo)}</b> registrada por <b>${dinero(v.total)}</b>${v.contra_entrega ? ' · contra entrega: la cobra el delivery' : ''}</span><span><button class="chico" data-accion="comprobante">Ver comprobante</button> <button class="chico secundario" data-accion="cerrar_aviso">Cerrar</button></span>`;
}
export function iniciar() {
  $('tipo').onchange = () => { const d = $('tipo').value === 'delivery'; $('dir').style.display = $('envio').style.display = $('cobro_entrega').style.display = d ? '' : 'none'; if (!d) { $('envio').value = ''; $('cobro_entrega').value = 'ahora'; } cambiarCobro(); cambiarEnvio(); };
  $('envio').addEventListener('input', cambiarEnvio);
  $('cobro_entrega').addEventListener('change', () => { cambiarCobro(); reiniciarPagos(); });
  $('cliSel').addEventListener('change', () => { actualizarDeuda(); pintarPagos(); });
  CAMPOS_PAGO.forEach(id => $(id).addEventListener('input', pintarPagos));
  // El buscador es general: al escribir se busca en todos los productos y se deselecciona la categoría
  $('buscar').addEventListener('input', () => { busqueda = $('buscar').value; if (busqueda.trim()) filtro = null; dibujarProductos(); });
  $('cuadricula').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) e.target.closest('.tarjeta').querySelector('button').click(); });
  delegar($('s_vender'), async (accion, d, boton) => {
    if (accion === 'filtro') { filtro = filtro === +d.id ? null : +d.id; busqueda = ''; $('buscar').value = ''; dibujarProductos(); }
    if (accion === 'add') {
      const p = productos.find(x => x.id === +d.id), campo = boton.closest('.tarjeta').querySelector('input');
      ServicioVentas.agregar(p, campo.value); campo.value = p.unidad === 'kg' ? '' : '1'; dibujarCarrito(); reiniciarPagos();
    }
    if (accion === 'quitar') { ServicioVentas.quitar(+d.i); dibujarCarrito(); reiniciarPagos(); }
    if (accion === 'resto') {   // completa este medio con lo que falta cobrar
      const campo = $('pg_' + d.medio); if (campo.disabled) throw new Error('Elegí un cliente registrado para dejar el resto a cuenta');
      const r = resumenPagos(ServicioVentas.total(), leerPagos().filter(p => p.medio !== d.medio));
      campo.value = r.falta > 0 ? String(r.falta) : ''; pintarPagos();
    }
    if (accion === 'confirmar') {
      const id = await ServicioVentas.confirmar({ clienteId: $('cliSel').value || null, tipo: $('tipo').value, direccion: $('dir').value.trim(), pagos: leerPagos() });
      let aviso = 'Venta registrada', exito = true;   // si el comprobante falla, la venta igual está registrada: se muestra el motivo real
      ultimaVenta = await ServicioVentas.comprobante(id).catch(e => { aviso = 'Venta registrada, pero no se pudo cargar el comprobante: ' + e.message; exito = false; return null; });
      limpiar('cliSel', 'tipo', 'dir', 'envio', 'cobro_entrega'); $('dir').style.display = $('envio').style.display = $('cobro_entrega').style.display = 'none'; reiniciarPagos(); pintarContra(); mostrarMensaje(aviso, exito); await dibujar();
    }
    if (accion === 'comprobante') verComprobante(ultimaVenta);
    if (accion === 'cerrar_aviso') { ultimaVenta = null; pintarAviso(); }
  });
}
export async function dibujar() {
  const [ps, cs, caja] = await Promise.all([ServicioProductos.listar(), ServicioClientes.listar(), ServicioCaja.abierta()]); productos = ps.filter(p => p.activo);
  const elegido = $('cliSel').value;
  $('cliSel').innerHTML = '<option value="">Cliente general (sin registrar)</option>' + cs.filter(c => c.activo).map(c => `<option value="${c.id}">${escapar(c.nombre)}</option>`).join(''); $('cliSel').value = elegido;
  const cerrada = !caja, b = $('btnConfirmar'); $('aviso_caja').style.display = cerrada ? '' : 'none'; b.disabled = cerrada;
  if (cerrada) b.setAttribute('data-bloqueado', '1'); else b.removeAttribute('data-bloqueado');
  dibujarProductos(); dibujarCarrito(); pintarAviso(); actualizarDeuda(); pintarPagos();
}
function dibujarProductos() {
  const cats = new Map(); productos.forEach(p => cats.set(categoriaDe(p), p.categorias?.nombre || 'Sin categoría'));
  if (filtro !== null && !cats.has(filtro)) filtro = null;
  $('filtros').innerHTML = [...cats].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => `<button class="chip ${filtro === id ? 'activo' : ''}" data-accion="filtro" data-id="${id}">${escapar(n)}</button>`).join('');
  const q = normalizarTexto(busqueda.trim());
  if (filtro === null && !q) { $('cuadricula').innerHTML = '<p class="vacio">Elegí una categoría o escribí en el buscador para ver los productos.</p>'; return; }
  const lista = productos.filter(p => (filtro === null || categoriaDe(p) === filtro) && (!q || normalizarTexto(`${p.nombre} ${p.codigo} ${p.categorias?.nombre || ''}`).includes(q)));
  $('cuadricula').innerHTML = lista.map(p => { const kg = p.unidad === 'kg';
    return `<div class="tarjeta ${p.stock <= 0 ? 'agotado' : ''}"><small>${escapar(p.codigo)} · ${escapar(p.categorias?.nombre || 'Sin categoría')}</small><b>${escapar(p.nombre)}</b>
    <span class="precio">${dinero(p.precio)} / ${kg ? 'kg' : 'u'}</span><small>${p.stock <= 0 ? 'Agotado' : 'Stock ' + formatear(p.stock, p.unidad)}</small>
    <div class="agregar"><input inputmode="decimal" autocomplete="off" placeholder="${kg ? 'Kg (ej: 0,350)' : 'Cantidad'}" value="${kg ? '' : '1'}"><button class="chico" data-accion="add" data-id="${p.id}">Agregar</button></div></div>`; }).join('') || '<p class="vacio">No se encontraron productos.</p>';
}
function dibujarCarrito() {
  const it = ServicioVentas.items();
  $('carrito').innerHTML = it.length ? '<table>' + it.map((c, i) => `<tr><td>${escapar(c.producto.nombre)}</td><td>${formatear(c.cantidad, c.producto.unidad)}</td><td>${dinero(c.subtotal)}</td><td class="acciones"><button class="chico peligro" data-accion="quitar" data-i="${i}">Quitar</button></td></tr>`).join('') + (ServicioVentas.envio() > 0 ? `<tr><td colspan="2">Costo de envío</td><td colspan="2">${dinero(ServicioVentas.envio())}</td></tr>` : '') + `<tr class="total"><th colspan="2">Total</th><th colspan="2">${dinero(ServicioVentas.total())}</th></tr></table>` : '<p class="vacio">Agregá productos desde la lista de arriba.</p>';
}
