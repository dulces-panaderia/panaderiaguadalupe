// Resumen y tabla del historial de repartos. Los usan el repartidor (sus propios repartos) y el admin (los de cada repartidor, en Empleados).
import { escapar, dinero } from './utilidades.js';
import { duracion } from '../negocio/formato.js';
const fecha = d => d ? new Date(d).toLocaleString('es-AR') : '—';
const kpi = (etiqueta, valor) => `<div class="caja"><small>${etiqueta}</small><b>${valor}</b></div>`;
export const htmlResumenRepartos = r => kpi('Entregas realizadas', r.cantidad) + kpi('Total de los pedidos', dinero(r.total)) + kpi('Efectivo cobrado al entregar', dinero(r.cobradoEfectivo)) + kpi('Entregado y sin cobrar', dinero(r.porCobrar))
  + kpi('Tiempo promedio en camino', r.promedioMs == null ? '—' : duracion(r.promedioMs));
export const htmlTablaRepartos = filas => !filas.length ? '<p class="vacio">No hay entregas realizadas en este período.</p>'
  : '<table><tr><th>Pedido</th><th>Entregada</th><th>Cliente</th><th>Dirección</th><th class="num">En camino</th><th>Cobro</th><th class="num">Total</th></tr>' + filas.map(f =>
    `<tr><td class="codigo">${escapar(f.codigo)}<br><small>${escapar(f.detalle || '')}</small></td><td>${fecha(f.entregada_en)}</td><td>${escapar(f.cliente || 'Cliente general')}</td><td>${escapar(f.direccion || '')}</td>
    <td class="num">${f.en_camino_en && f.entregada_en ? duracion(new Date(f.entregada_en) - new Date(f.en_camino_en)) : '—'}</td><td>${f.contra_entrega ? (f.cobrada_en ? `<span class="sube">Cobrado en efectivo</span><br><small>${fecha(f.cobrada_en)}</small>` : '<span class="baja">Falta cobrar</span>') : '<small>Pagado en el local</small>'}</td><td class="num">${dinero(f.total)}${Number(f.costo_envio) > 0 ? `<br><small>incluye envío ${dinero(f.costo_envio)}</small>` : ''}</td></tr>`).join('') + '</table>';
