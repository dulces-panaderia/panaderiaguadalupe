import { $, escapar, dinero, mostrarMensaje, delegar, etiqueta, confirmarEnLinea, selector } from './utilidades.js';
import { ServicioVentas } from '../negocio/servicioVentas.js';
import { ServicioEntregas } from '../negocio/servicioEntregas.js';
import { ServicioAutenticacion } from '../negocio/servicioAutenticacion.js';
import { nombreMedio } from '../negocio/pagos.js';
import { verComprobante } from './comprobante.js';
let ventas = [], vista = 'todas', busqueda = '';
const pagos = v => ServicioVentas.porCobrar(v) ? '<span class="baja">Por cobrar al entregar</span>' : (v.pagos || []).filter(p => p.tipo === 'venta' && Number(p.monto) > 0).map(p => `${escapar(nombreMedio(p.medio))} ${dinero(p.monto)}`).join('<br>') || '—';
export function iniciar() {
  $('bus_ventas').addEventListener('input', () => { busqueda = $('bus_ventas').value; pintar(); });
  delegar($('s_ventas'), async (accion, d, boton) => {
    if (accion === 'vista') { vista = d.vista; pintar(); return; }
    if (accion === 'comprobante') { verComprobante(await ServicioVentas.comprobante(+d.id)); return; }
    if (accion === 'entregar') { await ServicioEntregas.marcar(+d.id, false); mostrarMensaje('Entrega registrada'); await dibujar(); }
    if (accion === 'entregar_cobrada' || accion === 'cobrar') {   // mueve dinero: pide confirmación
      const v = ventas.find(x => x.id === +d.id);
      confirmarEnLinea(boton.closest('td'), `¿El delivery cobró ${dinero(v.total)} en efectivo?`, { textoBoton: 'Sí, cobrada', alCancelar: pintar,
        alConfirmar: async () => { await (accion === 'cobrar' ? ServicioEntregas.cobrar(+d.id) : ServicioEntregas.marcar(+d.id, true)); mostrarMensaje('Cobro registrado'); await dibujar(); } });
    }
    if (accion === 'cancelar') confirmarEnLinea(boton.closest('td'), '¿Cancelar y devolver stock y dinero?', { textoBoton: 'Cancelar venta', alCancelar: pintar,
      alConfirmar: async () => { await ServicioVentas.cancelar(+d.id); mostrarMensaje('Venta cancelada'); await dibujar(); } });
  });
}
// Un pedido contra entrega se entrega y se cobra; si ya se entregó sin cobrar, solo falta marcarlo cobrado
const botonesEntrega = v => ServicioVentas.porCobrar(v)
  ? (v.estado === 'entregada' ? ` <button class="chico" data-accion="cobrar" data-id="${v.id}">Cobrada</button>`
    : ['pendiente', 'en_camino'].includes(v.estado) ? ` <button class="chico" data-accion="entregar_cobrada" data-id="${v.id}">Entregada y cobrada</button> <button class="chico secundario" data-accion="entregar" data-id="${v.id}">Entregada</button>` : '')
  : ['pendiente', 'en_camino'].includes(v.estado) ? ` <button class="chico" data-accion="entregar" data-id="${v.id}">Entregada</button>` : '';
export async function dibujar() { ventas = await ServicioVentas.historial(); pintar(); }
function pintar() {
  const admin = ServicioAutenticacion.esAdmin();
  $('sel_ventas').innerHTML = selector(ServicioVentas.opciones(ventas), vista);
  const lista = ServicioVentas.filtrar(ventas, { vista, busqueda });
  $('tventas').innerHTML = lista.length ? '<table><tr><th>Código</th><th>Fecha</th><th>Cliente</th><th>Entrega</th><th>Pago</th><th class="num">Total</th><th>Estado</th><th></th></tr>' + lista.map(v => `<tr><td class="codigo">${escapar(v.codigo || v.id)}</td><td>${new Date(v.created_at).toLocaleString('es-AR')}</td><td>${escapar(v.clientes?.nombre || 'General')}</td><td>${v.tipo_entrega}${v.direccion ? '<br><small>' + escapar(v.direccion) + '</small>' : ''}${Number(v.costo_envio) > 0 ? '<br><small>Envío ' + dinero(v.costo_envio) + '</small>' : ''}</td>
    <td><small>${pagos(v)}</small></td><td class="num"><b>${dinero(v.total)}</b></td><td>${etiqueta(ServicioVentas.nombreEstado(v.estado), v.estado)}</td>
    <td class="acciones"><button class="chico secundario" data-accion="comprobante" data-id="${v.id}">Comprobante</button>${admin ? botonesEntrega(v) : ''}${admin && v.estado !== 'cancelada' ? ` <button class="chico peligro" data-accion="cancelar" data-id="${v.id}">Cancelar</button>` : ''}</td></tr>`).join('') + '</table>' : '<p class="vacio">No hay ventas en esta vista.</p>';
}
