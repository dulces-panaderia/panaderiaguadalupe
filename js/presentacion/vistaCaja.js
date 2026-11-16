import { $, escapar, dinero, mostrarMensaje, delegar, limpiar, selector } from './utilidades.js';
import { ServicioCaja } from '../negocio/servicioCaja.js';
import { ServicioAutenticacion } from '../negocio/servicioAutenticacion.js';
import { ServicioEmpleados } from '../negocio/servicioEmpleados.js';
import { nombreMedio } from '../negocio/pagos.js';
const OPCIONES = [{ id: 'actual', texto: 'Caja actual' }, { id: 'historial', texto: 'Historial de cajas' }];
const fecha = d => d ? new Date(d).toLocaleString('es-AR') : '—';
const celda = n => n === 0 ? '<span class="tenue">—</span>' : `<span class="${n < 0 ? 'baja' : ''}">${dinero(n)}</span>`;
let vista = 'actual', ultimoCierre = null, nombres = new Map();
export function iniciar() {
  delegar($('s_caja'), async (accion, d) => {
    if (accion === 'vista') { vista = d.vista; await dibujar(); return; }
    if (accion === 'abrir') { await ServicioCaja.abrir($('ca_monto').value); limpiar('ca_monto'); ultimoCierre = null; mostrarMensaje('Caja abierta'); }
    if (accion === 'cerrar') { ultimoCierre = await ServicioCaja.cerrar($('cc_contado').value, $('cc_obs').value); limpiar('cc_contado', 'cc_obs'); mostrarMensaje('Caja cerrada'); }
    if (accion === 'egreso') {
      await ServicioCaja.egreso({ tipo: $('eg_tipo').value, concepto: $('eg_concepto').value, medio: $('eg_medio').value, monto: $('eg_monto').value });
      limpiar('eg_tipo', 'eg_concepto', 'eg_medio', 'eg_monto'); mostrarMensaje('Egreso registrado');
    }
    await dibujar();
  });
}
export async function dibujar() {
  $('sel_caja').innerHTML = selector(OPCIONES, vista);
  $('caja_actual').style.display = vista === 'actual' ? '' : 'none'; $('caja_historial').style.display = vista === 'historial' ? '' : 'none';
  const admin = ServicioAutenticacion.esAdmin(), yo = ServicioAutenticacion.usuario();
  nombres = new Map([[yo.id, yo.nombre]]);
  if (admin) { try { (await ServicioEmpleados.listar()).forEach(e => nombres.set(e.id, e.nombre)); } catch { /* sin nombres */ } }
  if (vista === 'historial') return pintarHistorial();
  const caja = await ServicioCaja.abierta();
  $('caja_cerrada').style.display = caja ? 'none' : ''; $('caja_abierta').style.display = caja ? '' : 'none'; pintarUltimoCierre();
  if (!caja) { const sug = await ServicioCaja.montoSugerido(); $('ca_monto').placeholder = sug > 0 ? `Efectivo inicial (la última caja cerró con ${dinero(sug)})` : 'Efectivo inicial en caja'; return; }
  const [r, movs] = await Promise.all([ServicioCaja.resumen(caja.id), ServicioCaja.movimientos(caja.id, admin)]);
  $('caja_egreso').style.display = admin ? '' : 'none';
  $('caja_kpis').innerHTML = [['Caja abierta', `${escapar(caja.codigo)}<small>${fecha(caja.abierta_en)} · ${escapar(nombres.get(caja.abierta_por) || '—')}</small>`], ['Efectivo inicial', dinero(r.inicial)], ['Ventas', r.cantidadVentas], ['Efectivo esperado en caja', dinero(r.esperado)]]
    .map(k => `<div class="caja"><small>${k[0]}</small><b>${k[1]}</b></div>`).join('');
  $('caja_tabla').innerHTML = '<table><tr><th>Concepto</th>' + r.medios.map(m => `<th class="num">${escapar(nombreMedio(m))}</th>`).join('') + '</tr>'
    + r.filas.map(f => `<tr><td>${f.texto}</td>${f.valores.map(v => `<td class="num">${celda(v)}</td>`).join('')}</tr>`).join('')
    + `<tr class="total"><th>Neto del día</th>${r.neto.map(v => `<th class="num">${dinero(v)}</th>`).join('')}</tr></table>`;
  $('caja_nota').textContent = 'El efectivo esperado es el efectivo inicial más el neto en efectivo. Lo que se vende "a cuenta" no entra a la caja hasta que el cliente paga.';
  $('caja_movs').innerHTML = movs.length ? '<table><tr><th>Hora</th><th>Código</th><th>Tipo</th><th>Detalle</th><th>Medio</th><th class="num">Monto</th></tr>' + movs.map(m =>
    `<tr><td>${new Date(m.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td><td class="codigo">${escapar(m.codigo)}</td><td>${m.tipo}</td><td>${escapar(m.detalle)}</td><td>${escapar(nombreMedio(m.medio))}</td><td class="num">${celda(m.monto)}</td></tr>`).join('') + '</table>' : '<p class="vacio">Todavía no hubo movimientos en esta caja.</p>';
}
function pintarUltimoCierre() {
  const c = ultimoCierre; $('caja_ultima').style.display = c ? '' : 'none'; if (!c) return;
  const dif = Number(c.diferencia), txt = dif === 0 ? 'Sin diferencia' : dif > 0 ? `Sobrante ${dinero(dif)}` : `Faltante ${dinero(-dif)}`;
  $('caja_ultima').innerHTML = `<h3>Caja ${escapar(c.codigo)} cerrada</h3><p>Efectivo esperado <b>${dinero(c.efectivo_esperado)}</b> · Contado <b>${dinero(c.efectivo_contado)}</b> · <b class="${dif === 0 ? 'sube' : 'baja'}">${txt}</b></p>${c.observaciones ? `<p class="pista">${escapar(c.observaciones)}</p>` : ''}`;
}
async function pintarHistorial() {
  const lista = await ServicioCaja.historial();
  $('tcajas').innerHTML = lista.length ? '<table><tr><th>Código</th><th>Apertura</th><th>Cierre</th><th class="num">Inicial</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Abrió</th><th>Cerró</th></tr>' + lista.map(c => {
    const dif = c.diferencia == null ? null : Number(c.diferencia);
    return `<tr><td class="codigo">${escapar(c.codigo)}</td><td>${fecha(c.abierta_en)}</td><td>${c.estado === 'abierta' ? '<span class="etiqueta e-activo">abierta</span>' : fecha(c.cerrada_en)}</td><td class="num">${dinero(c.monto_inicial)}</td>
    <td class="num">${c.efectivo_esperado == null ? '—' : dinero(c.efectivo_esperado)}</td><td class="num">${c.efectivo_contado == null ? '—' : dinero(c.efectivo_contado)}</td>
    <td class="num">${dif == null ? '—' : `<span class="${dif === 0 ? 'sube' : 'baja'}">${dinero(dif)}</span>`}</td><td>${escapar(nombres.get(c.abierta_por) || '—')}</td><td>${escapar(nombres.get(c.cerrada_por) || '—')}</td></tr>`; }).join('') + '</table>' : '<p class="vacio">Todavía no hay cajas.</p>';
}
