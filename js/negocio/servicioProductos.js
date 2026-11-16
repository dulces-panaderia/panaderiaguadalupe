import { RepositorioProductos } from '../datos/repositorioProductos.js';
import { aNumero, coincide } from './texto.js';
const categoriaDe = p => p.categoria_id ?? 0;   // 0 = sin categoría
const AJUSTES = [
  { id: 'merma', texto: 'Merma (resta)', signo: -1, tipoDb: 'merma' },
  { id: 'sobra', texto: 'Ajuste por conteo: sobra (suma)', signo: 1, tipoDb: 'ajuste' },
  { id: 'falta', texto: 'Ajuste por conteo: falta (resta)', signo: -1, tipoDb: 'ajuste' },
];
export const ServicioProductos = {
  listar: () => RepositorioProductos.listar(),
  // Solo se guardan los datos del catálogo. El stock y el costo NO se cargan acá: entran con una compra
  crear(o) {
    if (!o.nombre?.trim()) throw new Error('Ingresá el nombre del producto');
    if (!(o.precio >= 0)) throw new Error('Ingresá un precio válido');
    const minimo = o.stock_minimo || 0;
    if (!(minimo >= 0)) throw new Error('El stock mínimo no es válido');
    return RepositorioProductos.crear({ nombre: o.nombre.trim(), categoria_id: o.categoria_id ?? null, unidad: o.unidad, precio: o.precio, stock_minimo: minimo });
  },
  cambiarPrecio(id, precio) {
    if (!(precio >= 0)) throw new Error('Precio inválido');
    return RepositorioProductos.actualizar(id, { precio });
  },
  cambiarCategoria: (p, categoriaId) => RepositorioProductos.actualizar(p.id, { categoria_id: categoriaId }),
  tiposAjuste: AJUSTES.map(({ id, texto }) => ({ id, texto })),
  // Corrección de stock (merma o diferencia de conteo): siempre con motivo, y queda registrada en el historial. El ingreso de mercadería es una compra
  ajustarStock(p, { tipo, cantidad, motivo }) {
    const a = AJUSTES.find(x => x.id === tipo), n = aNumero(cantidad);
    if (!a) throw new Error('Elegí el tipo de ajuste');
    if (!(n > 0)) throw new Error('Ingresá una cantidad mayor a cero');
    if (!String(motivo || '').trim()) throw new Error('Escribí el motivo');
    return RepositorioProductos.ajustarStock(p.id, a.signo * n, a.tipoDb, String(motivo).trim());
  },
  alternar: p => RepositorioProductos.actualizar(p.id, { activo: !p.activo }),
  // Margen sobre el precio de venta; null si todavía no hay costo (el costo lo calculan las compras)
  margen: p => Number(p.costo) > 0 && Number(p.precio) > 0 ? (Number(p.precio) - Number(p.costo)) / Number(p.precio) : null,

  // Los 5 más vendidos; si todavía hay pocas ventas, se completa con otros productos activos
  async destacados(productos, n = 5) {
    const activos = productos.filter(p => p.activo); let ids = [];
    try { ids = (await RepositorioProductos.masVendidos(n)).map(f => f.producto_id); } catch { /* migración pendiente: selección simple */ }
    const lista = ids.map(id => activos.find(p => p.id === id)).filter(Boolean);
    for (const p of activos) { if (lista.length >= n) break; if (!lista.includes(p)) lista.push(p); }
    return lista.slice(0, n);
  },
  // Vistas: Todos (los más vendidos) + una por categoría + Desactivados (aparte)
  opciones(productos) {
    const activos = productos.filter(p => p.activo), cats = new Map();
    activos.forEach(p => cats.set(categoriaDe(p), p.categorias?.nombre || 'Sin categoría'));
    return [{ id: 'todos', texto: 'Todos' },
      ...[...cats].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => ({ id: 'cat:' + id, texto: n, cuenta: activos.filter(p => categoriaDe(p) === id).length })),
      { id: 'inactivos', texto: 'Desactivados', cuenta: productos.filter(p => !p.activo).length, aparte: true }];
  },
  filtrar(productos, { vista, busqueda, destacados }) {
    const coin = p => coincide(busqueda, p.nombre, p.codigo, p.categorias?.nombre);
    if (vista === 'inactivos') return productos.filter(p => !p.activo && coin(p));
    const activos = productos.filter(p => p.activo);
    if (vista === 'todos') return String(busqueda || '').trim() ? activos.filter(coin) : destacados;   // buscando: se busca en todos
    return activos.filter(p => categoriaDe(p) === +vista.slice(4) && coin(p));
  },
};
