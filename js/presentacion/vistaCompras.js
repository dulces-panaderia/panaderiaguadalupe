import { $, escapar, dinero, formatear, mostrarMensaje, delegar, limpiar, selector, editarEnLinea, etiqueta } from './utilidades.js';
import { ServicioCompras } from '../negocio/servicioCompras.js';
import { ServicioProveedores } from '../negocio/servicioProveedores.js';
import { ServicioProductos } from '../negocio/servicioProductos.js';
import { aNumero } from '../negocio/texto.js';
const LIMITE = 8;   // cuántos productos se muestran por vez en el selector
let compras = [], productos = [], vista = 'todas', busqueda = '', elegido = null, categoria = null, limite = LIMITE, activo = 0;
const CAMPOS_PAGO = ['cpg_efectivo', 'cpg_transferencia', 'cpg_tarjeta'];
const MEDIOS = [{ id: 'efectivo', texto: 'Efectivo' }, { id: 'transferencia', texto: 'Transferencia' }, { id: 'tarjeta', texto: 'Tarjeta' }];
const fecha = d => new Date(d).toLocaleDateString('es-AR');
function pintarResumen() {
  const total = ServicioCompras.total(), pagado = CAMPOS_PAGO.reduce((s, id) => { const n = aNumero($(id).value); return s + (Number.isFinite(n) ? n : 0); }, 0);
  $('cp_resumen').innerHTML = total === 0 ? '' : `Total <b>${dinero(total)}</b> &nbsp;·&nbsp; Pagás ahora <b>${dinero(pagado)}</b> &nbsp;·&nbsp; ` + (pagado > total + 0.005 ? '<span class="baja">Pagás de más</span>' : `Queda a deber <b>${dinero(Math.max(0, total - pagado))}</b>`);
}
function pintarItems() {
  const it = ServicioCompras.items();
  $('cp_items').innerHTML = it.length ? '<table><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Costo unit.</th><th class="num">Subtotal</th><th></th></tr>' + it.map((i, n) =>
    `<tr><td>${escapar(i.producto.nombre)}</td><td class="num">${formatear(i.cantidad, i.producto.unidad)}</td><td class="num">${dinero(i.costo)}</td><td class="num">${dinero(i.subtotal)}</td><td class="acciones"><button class="chico peligro" data-accion="quitar" data-i="${n}">Quitar</button></td></tr>`).join('')
    + `<tr class="total"><th colspan="3">Total de la compra</th><th class="num">${dinero(ServicioCompras.total())}</th><th></th></tr></table>` : '<p class="vacio">Agregá los productos que compraste.</p>';
  pintarResumen();
}
const datosProducto = p => `<span class="resultado-datos"><small>Stock ${formatear(p.stock, p.unidad)}</small><small>${Number(p.costo) > 0 ? 'Costo ' + dinero(p.costo) : 'Sin costo'}</small></span>`;
const resultadosActuales = () => (busquedaProducto() || categoria !== null) ? ServicioCompras.buscarProductos(productos, { busqueda: $('ci_buscar').value, categoriaId: categoria, limite }) : { lista: [], total: 0 };
const busquedaProducto = () => $('ci_buscar').value.trim();
// Lista de productos para elegir: sin escribir ni elegir categoría solo se sugieren los comprados últimamente; nunca se muestra todo el catálogo
function pintarSelector() {
  if (elegido) return;
  $('ci_filtros').innerHTML = ServicioCompras.categorias(productos).map(c => `<button class="chip ${categoria === c.id ? 'activo' : ''}" data-accion="ci_cat" data-id="${c.id}">${escapar(c.texto)}</button>`).join('');
  if (!busquedaProducto() && categoria === null) {
    const rec = ServicioCompras.recientes(compras, productos);
    $('ci_resultados').innerHTML = rec.length ? `<small class="pista">Comprados últimamente</small><div class="sugeridos">${rec.map(p => `<button class="chip" data-accion="ci_elegir" data-id="${p.id}">${escapar(p.nombre)}</button>`).join('')}</div>`
      : '<p class="vacio">Escribí para buscar un producto o elegí una categoría.</p>';
    return;
  }
  const { lista, total } = resultadosActuales();
  if (activo >= lista.length) activo = 0;
  $('ci_resultados').innerHTML = lista.length ? lista.map((p, n) => `<button class="resultado ${n === activo ? 'activo' : ''}" data-accion="ci_elegir" data-id="${p.id}"><span><b>${escapar(p.nombre)}</b>${ServicioCompras.enCompra(p.id) ? ' <small>(ya está en la compra)</small>' : ''}<br><small>${escapar(p.codigo)} · ${escapar(p.categorias?.nombre || 'Sin categoría')}</small></span>${datosProducto(p)}</button>`).join('')
      + (total > lista.length ? `<div><button class="chico secundario" data-accion="ci_mas">Ver ${Math.min(LIMITE, total - lista.length)} más</button> <small class="pista">Hay ${total - lista.length} más: escribí más letras para acotar</small></div>` : '')
    : '<p class="vacio">No se encontró ningún producto. Si es nuevo, crealo primero en la pestaña Productos.</p>';
}
// Alterna entre buscar un producto y tener uno elegido (con la cantidad y el costo habilitados)
function mostrarSeleccion() {
  const hay = !!elegido;
  $('ci_buscador').style.display = hay ? 'none' : ''; $('ci_elegido').style.display = hay ? '' : 'none';
  $('ci_cantidad').disabled = $('ci_costo').disabled = !hay;
  $('ci_cantidad').placeholder = hay ? (elegido.unidad === 'kg' ? 'Cantidad (kg)' : 'Cantidad (unidades)') : 'Cantidad';
  $('ci_costo').placeholder = hay && Number(elegido.costo) > 0 ? `Costo unitario (actual ${dinero(elegido.costo)})` : 'Costo unitario';
  if (hay) $('ci_elegido').innerHTML = `<span>Producto elegido: <b>${escapar(elegido.nombre)}</b> <small>${escapar(elegido.codigo)} · ${elegido.unidad === 'kg' ? 'por kg' : 'por unidad'} · Stock ${formatear(elegido.stock, elegido.unidad)} · ${Number(elegido.costo) > 0 ? 'Costo actual ' + dinero(elegido.costo) : 'Sin costo cargado'}</small></span><button class="chico secundario" data-accion="ci_cambiar">Cambiar</button>`;
  else pintarSelector();
}
function elegir(p) { if (!p) return; elegido = p; mostrarSeleccion(); $('ci_cantidad').focus(); }
function reiniciarSelector() { elegido = null; categoria = null; limite = LIMITE; activo = 0; limpiar('ci_buscar', 'ci_cantidad', 'ci_costo'); mostrarSeleccion(); }
export function iniciar() {
  $('ci_buscar').addEventListener('input', () => { limite = LIMITE; activo = 0; pintarSelector(); });
  $('ci_buscar').addEventListener('keydown', e => {   // flechas para moverse, Enter para elegir, Escape para borrar la búsqueda
    const { lista } = resultadosActuales();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (lista.length) { activo = (activo + (e.key === 'ArrowDown' ? 1 : -1) + lista.length) % lista.length; pintarSelector(); } }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(lista[activo] || lista[0]); }
    else if (e.key === 'Escape') { limpiar('ci_buscar'); categoria = null; pintarSelector(); }
  });
  $('ci_cantidad').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('ci_costo').focus(); } });
  $('ci_costo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('s_comp').querySelector('[data-accion="agregar"]').click(); } });
  $('bus_comp').addEventListener('input', () => { busqueda = $('bus_comp').value; pintar(); });
  CAMPOS_PAGO.forEach(id => $(id).addEventListener('input', pintarResumen));
  delegar($('s_comp'), async (accion, d, boton) => {
    if (accion === 'vista') { vista = d.vista; pintar(); return; }
    if (accion === 'ci_cat') { categoria = categoria === +d.id ? null : +d.id; limite = LIMITE; activo = 0; pintarSelector(); return; }
    if (accion === 'ci_elegir') { elegir(productos.find(x => x.id === +d.id)); return; }
    if (accion === 'ci_cambiar') { elegido = null; mostrarSeleccion(); $('ci_buscar').focus(); return; }
    if (accion === 'ci_mas') { limite += LIMITE; pintarSelector(); return; }
    if (accion === 'agregar') {
      ServicioCompras.agregar(elegido, $('ci_cantidad').value, $('ci_costo').value);
      reiniciarSelector(); pintarItems(); $('ci_buscar').focus(); return;   // queda listo para buscar el siguiente producto
    }
    if (accion === 'quitar') { ServicioCompras.quitar(+d.i); pintarItems(); return; }
    if (accion === 'registrar') {
      await ServicioCompras.confirmar({ proveedorId: $('cp_proveedor').value, nota: $('cp_nota').value, pagos: { efectivo: $('cpg_efectivo').value, transferencia: $('cpg_transferencia').value, tarjeta: $('cpg_tarjeta').value } });
      limpiar('cp_proveedor', 'cp_nota', ...CAMPOS_PAGO); mostrarMensaje('Compra registrada: el stock y el costo se actualizaron');
    }
    if (accion === 'pagar') {
      const c = compras.find(x => x.id === +d.id);
      return editarEnLinea(boton.closest('td'), { alCancelar: pintar, campos: [{ tipo: 'number', paso: '0.01', placeholder: 'Monto', valor: ServicioCompras.saldo(c) }, { tipo: 'select', valor: 'efectivo', opciones: MEDIOS }],
        alGuardar: async (monto, medio) => { await ServicioCompras.pagar(c, monto, medio); mostrarMensaje('Pago registrado'); await dibujar(); } });
    }
    await dibujar();
  });
}
export async function dibujar() {
  const [pv, pr, cs] = await Promise.all([ServicioProveedores.listar(), ServicioProductos.listar(), ServicioCompras.listar()]); productos = pr.filter(p => p.activo); compras = cs;
  const prov = $('cp_proveedor').value;
  $('cp_proveedor').innerHTML = '<option value="">Elegí el proveedor</option>' + pv.filter(p => p.activo).map(p => `<option value="${p.id}">${escapar(p.nombre)}</option>`).join(''); $('cp_proveedor').value = prov;
  if (elegido) elegido = productos.find(x => x.id === elegido.id) || null;   // se refresca con el stock y el costo actuales
  mostrarSeleccion(); pintarItems(); pintar();
}
function pintar() {
  $('sel_comp').innerHTML = selector(ServicioCompras.opciones(compras), vista);
  const lista = ServicioCompras.filtrar(compras, { vista, busqueda });
  $('tcomp').innerHTML = lista.length ? '<table><tr><th>Código</th><th>Fecha</th><th>Proveedor</th><th>Detalle</th><th class="num">Total</th><th class="num">Pagado</th><th class="num">Saldo</th><th></th></tr>' + lista.map(c => {
    const saldo = ServicioCompras.saldo(c), detalle = c.compra_items.map(i => `${escapar(i.productos?.nombre || '')} ${formatear(i.cantidad, i.productos?.unidad)}`).join(', ');
    return `<tr><td class="codigo">${escapar(c.codigo)}</td><td>${fecha(c.created_at)}</td><td><b>${escapar(c.proveedores?.nombre || '')}</b>${c.nota ? `<br><small>${escapar(c.nota)}</small>` : ''}</td><td><small>${detalle}</small></td>
    <td class="num">${dinero(c.total)}</td><td class="num">${dinero(ServicioCompras.pagado(c))}</td><td class="num">${saldo > 0.005 ? `<span class="baja">${dinero(saldo)}</span>` : etiqueta('pagada', 'activo')}</td>
    <td class="acciones">${saldo > 0.005 ? `<button class="chico" data-accion="pagar" data-id="${c.id}">Pagar</button>` : ''}</td></tr>`; }).join('') + '</table>' : '<p class="vacio">No hay compras en esta vista.</p>';
}
