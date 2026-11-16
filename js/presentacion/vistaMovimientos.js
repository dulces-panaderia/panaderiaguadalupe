import { $, escapar, formatear, etiqueta, selector } from './utilidades.js';
import { ServicioMovimientos, TIPOS_MOVIMIENTO } from '../negocio/servicioMovimientos.js';
import { ServicioEmpleados } from '../negocio/servicioEmpleados.js';
let movimientos = [], nombres = new Map(), vista = 'todos', busqueda = '';
const CLASE = { inicial: 'entregada', compra: 'activo', venta: 'completada', anulacion: 'cancelada', ajuste: 'pendiente', merma: 'inactivo' };
export function iniciar() {
  $('bus_mov').addEventListener('input', () => { busqueda = $('bus_mov').value; pintar(); });
  $('sel_mov').addEventListener('click', e => { const b = e.target.closest('[data-vista]'); if (b) { vista = b.dataset.vista; pintar(); } });
}
export async function dibujar() {
  [movimientos, nombres] = await Promise.all([ServicioMovimientos.listar(), ServicioEmpleados.listar().then(l => new Map(l.map(e => [e.id, e.nombre])))]); pintar();
}
function pintar() {
  $('sel_mov').innerHTML = selector(ServicioMovimientos.opciones(movimientos), vista, 'vista');
  const lista = ServicioMovimientos.filtrar(movimientos, { vista, busqueda });
  $('tmov').innerHTML = lista.length ? '<table><tr><th>Fecha</th><th>Código</th><th>Producto</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Stock resultante</th><th>Motivo</th><th>Usuario</th></tr>' + lista.map(m => {
    const u = m.productos?.unidad, c = Number(m.cantidad);
    return `<tr><td>${new Date(m.created_at).toLocaleString('es-AR')}</td><td class="codigo">${escapar(m.codigo)}</td><td><b>${escapar(m.productos?.nombre || '')}</b><br><small>${escapar(m.productos?.codigo || '')}</small></td><td>${etiqueta(TIPOS_MOVIMIENTO[m.tipo] || m.tipo, CLASE[m.tipo])}</td>
    <td class="num"><span class="${c < 0 ? 'baja' : 'sube'}">${c > 0 ? '+' : ''}${formatear(c, u)}</span></td><td class="num">${formatear(m.stock_resultante, u)}</td><td>${escapar(m.motivo || '')}</td><td>${escapar(nombres.get(m.usuario_id) || '—')}</td></tr>`; }).join('') + '</table>' : '<p class="vacio">No hay movimientos en esta vista.</p>';
}
