import { $, escapar, dinero, formatear, mostrarMensaje, delegar, protegido, etiqueta, editarEnLinea, limpiar, selector } from './utilidades.js';
import { ServicioProductos } from '../negocio/servicioProductos.js';
import { ServicioCategorias } from '../negocio/servicioCategorias.js';
import { aNumero } from '../negocio/texto.js';
import { porcentaje } from '../negocio/formato.js';
let productos = [], categorias = [], destacados = [], vista = 'todos', busqueda = '';
const opciones = (seleccionada, incluirInactiva) => '<option value="">Sin categoría</option>' + categorias
  .filter(c => c.activo || c.id === incluirInactiva).map(c => `<option value="${c.id}" ${c.id === seleccionada ? 'selected' : ''}>${escapar(c.nombre)}</option>`).join('');
export function iniciar() {
  $('bus_prod').addEventListener('input', () => { busqueda = $('bus_prod').value; pintar(); });
  delegar($('s_prod'), async (accion, d, boton) => {
    if (accion === 'vista') { vista = d.vista; pintar(); return; }
    if (accion === 'guardar') {
      await ServicioProductos.crear({ nombre: $('pn').value, categoria_id: $('pc').value ? +$('pc').value : null, unidad: $('pu').value,
        precio: $('pp').value === '' ? NaN : aNumero($('pp').value), stock_minimo: aNumero($('pm').value) || 0 });
      limpiar('pn', 'pc', 'pu', 'pp', 'pm'); mostrarMensaje('Producto guardado');
    } else {
      const p = productos.find(x => x.id === +d.id), celda = boton.closest('td');
      if (accion === 'precio') return editarEnLinea(celda, { valor: p.precio, tipo: 'number', paso: '0.01', alCancelar: pintar,
        alGuardar: async v => { await ServicioProductos.cambiarPrecio(p.id, aNumero(v)); mostrarMensaje('Precio actualizado'); await dibujar(); } });
      if (accion === 'stock') return editarEnLinea(celda, { alCancelar: pintar, campos: [{ tipo: 'select', valor: 'merma', opciones: ServicioProductos.tiposAjuste },
          { tipo: 'number', paso: '0.001', placeholder: 'Cantidad' }, { tipo: 'text', placeholder: 'Motivo (obligatorio)' }],
        alGuardar: async (tipo, cantidad, motivo) => { await ServicioProductos.ajustarStock(p, { tipo, cantidad, motivo }); mostrarMensaje('Stock ajustado'); await dibujar(); } });
      if (accion === 'alternar') await ServicioProductos.alternar(p);
    }
    await dibujar();
  });
  $('tprod').addEventListener('change', protegido(async ev => {
    const p = productos.find(x => x.id === +ev.target.dataset.id); if (!p) return;
    await ServicioProductos.cambiarCategoria(p, ev.target.value ? +ev.target.value : null); mostrarMensaje('Categoría actualizada'); await dibujar();
  }));
}
export async function dibujar() {
  [productos, categorias] = await Promise.all([ServicioProductos.listar(), ServicioCategorias.listar()]);
  destacados = await ServicioProductos.destacados(productos);
  const previa = $('pc').value; $('pc').innerHTML = opciones(null); $('pc').value = previa;
  pintar();
}
function pintar() {
  const ops = ServicioProductos.opciones(productos);
  if (!ops.some(o => o.id === vista)) vista = 'todos';
  $('sel_prod').innerHTML = selector(ops, vista);
  $('pista_prod').textContent = vista === 'todos' && !busqueda.trim() ? 'Se muestran los 5 productos más vendidos. Elegí una categoría o usá el buscador para ver el resto.' : '';
  const lista = ServicioProductos.filtrar(productos, { vista, busqueda, destacados });
  $('tprod').innerHTML = lista.length ? '<table><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="num">Precio</th><th class="num">Costo prom.</th><th class="num">Margen</th><th class="num">Stock</th><th>Estado</th><th></th></tr>' + lista.map(p => { const m = ServicioProductos.margen(p);
    return `<tr><td class="codigo">${escapar(p.codigo)}</td><td><b>${escapar(p.nombre)}</b></td><td><select data-id="${p.id}">${opciones(p.categoria_id, p.categoria_id)}</select></td>
    <td class="num">${dinero(p.precio)}<small> / ${p.unidad === 'kg' ? 'kg' : 'u'}</small></td><td class="num">${Number(p.costo) > 0 ? dinero(p.costo) : '<span class="tenue">—</span>'}</td>
    <td class="num">${m == null ? etiqueta('sin costo', 'pendiente') : `<span class="${m < 0.1 ? 'baja' : ''}">${porcentaje(m, 0)}</span>`}</td>
    <td class="num">${formatear(p.stock, p.unidad)} ${p.stock <= p.stock_minimo ? etiqueta('stock bajo', 'pendiente') : ''}</td><td>${etiqueta(p.activo ? 'activo' : 'inactivo')}</td>
    <td class="acciones"><button class="chico secundario" data-accion="precio" data-id="${p.id}">Precio</button> <button class="chico secundario" data-accion="stock" data-id="${p.id}">Ajustar stock</button> <button class="chico peligro" data-accion="alternar" data-id="${p.id}">${p.activo ? 'Desactivar' : 'Activar'}</button></td></tr>`; }).join('') + '</table>' : '<p class="vacio">No hay productos en esta vista.</p>';
}
