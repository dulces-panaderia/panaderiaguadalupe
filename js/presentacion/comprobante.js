// Comprobante NO fiscal: primero una vista previa dentro de la aplicación; desde ahí se descarga en PDF o Excel, o se imprime.
import { $, escapar, dinero, formatear } from './utilidades.js';
import { nombreMedio } from '../negocio/pagos.js';
import { abrirVistaPrevia } from './vistaPrevia.js';
import { exportarComprobantePDF, exportarComprobanteExcel } from './exportador.js';
const linea = (a, b, fuerte) => `<div class="cmp-linea${fuerte ? ' fuerte' : ''}"><span>${a}</span><span>${b}</span></div>`;
export function htmlComprobante(c) {
  const deuda = (c.pagos || []).filter(p => p.medio === 'deuda').reduce((s, p) => s + Number(p.monto), 0);
  return `<div class="cmp-cab"><img src="img/logo.png" alt=""><h2>Panadería Guadalupe</h2><p class="cmp-aviso">COMPROBANTE NO FISCAL<br>No válido como factura</p></div>
  ${c.estado === 'cancelada' ? '<p class="cmp-anulada">VENTA CANCELADA</p>' : ''}
  <div class="cmp-datos">${linea('Comprobante', escapar(c.codigo))}${linea('Fecha', new Date(c.fecha).toLocaleString('es-AR'))}${c.vendedor ? linea('Atendió', escapar(c.vendedor)) : ''}
  ${c.cliente ? linea('Cliente', escapar(c.cliente.nombre)) : ''}${c.tipo_entrega === 'delivery' ? linea('Entrega', 'Delivery') + (c.direccion ? `<div class="cmp-dir">${escapar(c.direccion)}</div>` : '') + (c.repartidor ? linea('Repartidor', escapar(c.repartidor)) : '') : ''}</div>
  <table class="cmp-items"><tr><th>Detalle</th><th>Cant.</th><th>Importe</th></tr>${c.items.map(i => `<tr><td>${escapar(i.nombre)}<small>${dinero(i.precio)} / ${i.unidad === 'kg' ? 'kg' : 'u'}</small></td><td>${formatear(i.cantidad, i.unidad)}</td><td>${dinero(i.subtotal)}</td></tr>`).join('')}</table>
  ${Number(c.costo_envio) > 0 ? linea('Costo de envío', dinero(c.costo_envio)) : ''}
  ${linea('TOTAL', dinero(c.total), true)}
  ${(c.pagos || []).length ? `<div class="cmp-pagos"><b>Forma de pago</b>${c.pagos.map(p => linea(escapar(nombreMedio(p.medio)), dinero(p.monto))).join('')}</div>` : ''}
  ${deuda > 0 ? `<p class="cmp-deuda">Queda a cuenta: ${dinero(deuda)}${c.cliente ? `<br>Saldo total del cliente: ${dinero(c.saldo_cliente)}` : ''}</p>` : ''}
  ${c.contra_entrega && !c.cobrada_en ? `<p class="cmp-deuda">Pago contra entrega: ${dinero(c.total)} en efectivo, se cobra al delivery</p>` : ''}
  <p class="cmp-pie">¡Gracias por su compra!</p>`;
}
// Impresión con el diálogo del navegador (opcional, desde la vista previa)
export async function imprimirComprobante(c) {
  const caja = $('comprobante'); caja.classList.add('cmp'); caja.innerHTML = htmlComprobante(c);
  const img = caja.querySelector('img'); if (img && !img.complete) await new Promise(r => { img.onload = img.onerror = r; });
  window.print();
}
export function verComprobante(c) {
  if (!c) throw new Error('No se pudo cargar el comprobante');
  abrirVistaPrevia({ titulo: `Comprobante ${c.codigo}`, html: `<div class="cmp hoja">${htmlComprobante(c)}</div>`, acciones: [
    { texto: 'Descargar PDF', alHacerClic: () => exportarComprobantePDF(c) },
    { texto: 'Descargar Excel', clase: 'secundario', alHacerClic: () => exportarComprobanteExcel(c) },
    { texto: 'Imprimir', clase: 'secundario', alHacerClic: () => imprimirComprobante(c) }] });
}
