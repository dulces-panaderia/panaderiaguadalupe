import { RepositorioCompras } from '../datos/repositorioCompras.js';
import { aNumero, coincide, normalizarTexto } from './texto.js';
import { dinero } from './formato.js';
let items = [];   // [{ producto, cantidad, costo }]
const r2 = n => Math.round(n * 100) / 100;
const MEDIOS_COMPRA = ['efectivo', 'transferencia', 'tarjeta'];
const categoriaDe = p => p.categoria_id ?? 0;   // 0 = sin categoría
export const ServicioCompras = {
  // ---- Selector de productos de la compra: nunca devuelve todo el catálogo, solo una página de resultados ----
  categorias(productos) {
    const m = new Map(); productos.forEach(p => m.set(categoriaDe(p), p.categorias?.nombre || 'Sin categoría'));
    return [...m].map(([id, texto]) => ({ id, texto })).sort((a, b) => a.texto.localeCompare(b.texto));
  },
  // Busca por nombre, código o categoría; escribir varias palabras acota (en cualquier orden). Primero los que empiezan con lo escrito
  buscarProductos(productos, { busqueda = '', categoriaId = null, limite = 8 } = {}) {
    const palabras = normalizarTexto(busqueda).split(/\s+/).filter(Boolean);
    const lista = productos.filter(p => (categoriaId === null || categoriaDe(p) === categoriaId)
      && palabras.every(w => normalizarTexto(`${p.nombre} ${p.codigo} ${p.categorias?.nombre || ''}`).includes(w)));
    const rango = p => { const n = normalizarTexto(p.nombre); return !palabras.length ? 2 : n.startsWith(palabras[0]) ? 0 : n.split(/\s+/).some(w => w.startsWith(palabras[0])) ? 1 : 2; };
    lista.sort((a, b) => rango(a) - rango(b) || a.nombre.localeCompare(b.nombre));
    return { lista: lista.slice(0, limite), total: lista.length };
  },
  // Los productos comprados más recientemente (sin repetir), para volver a comprarlos con un clic
  recientes(compras, productos, n = 6) {
    const vistos = new Set(), res = [];
    for (const c of compras) for (const i of c.compra_items || []) {
      if (vistos.has(i.producto_id)) continue; vistos.add(i.producto_id);
      const p = productos.find(x => x.id === i.producto_id); if (p) res.push(p);
      if (res.length >= n) return res;
    }
    return res;
  },
  enCompra: id => items.some(i => i.producto.id === id),
  agregar(producto, cantidad, costo) {
    const q = aNumero(cantidad), c = aNumero(costo);
    if (!producto) throw new Error('Elegí un producto');
    if (!(q > 0)) throw new Error('Ingresá una cantidad mayor a cero');
    if (!(c >= 0)) throw new Error('Ingresá el costo unitario');
    items.push({ producto, cantidad: q, costo: c });
  },
  quitar: i => items.splice(i, 1),
  items: () => items.map(i => ({ ...i, subtotal: r2(i.cantidad * i.costo) })),
  total() { return r2(this.items().reduce((s, i) => s + i.subtotal, 0)); },
  // campos de pago: { efectivo, transferencia, tarjeta }. Lo que no se paga ahora queda como deuda con el proveedor
  async confirmar({ proveedorId, pagos, nota }) {
    if (!proveedorId) throw new Error('Elegí el proveedor');
    if (!items.length) throw new Error('Agregá al menos un producto');
    const lista = MEDIOS_COMPRA.map(m => ({ medio: m, monto: pagos[m] == null || String(pagos[m]).trim() === '' ? 0 : aNumero(pagos[m]) }));
    if (lista.some(p => !Number.isFinite(p.monto) || p.monto < 0)) throw new Error('Revisá los montos de pago');
    const pagado = r2(lista.reduce((s, p) => s + p.monto, 0)), total = this.total();
    if (pagado > total + 0.005) throw new Error(`Los pagos (${dinero(pagado)}) superan el total de la compra (${dinero(total)})`);
    const id = await RepositorioCompras.registrar(Number(proveedorId), items.map(i => ({ producto_id: i.producto.id, cantidad: i.cantidad, costo_unitario: i.costo })), lista.filter(p => p.monto > 0), nota);
    items = [];
    return id;
  },
  listar: () => RepositorioCompras.listar(),
  pagado: c => r2((c.egresos || []).reduce((s, e) => s + Number(e.monto), 0)),
  saldo(c) { return r2(Number(c.total) - this.pagado(c)); },
  deudaPorProveedor(lista) { const m = new Map(); lista.forEach(c => m.set(c.proveedor_id, r2((m.get(c.proveedor_id) || 0) + this.saldo(c)))); return m; },
  pagar(c, monto, medio) {
    const n = aNumero(monto);
    if (!(n > 0)) throw new Error('Ingresá un monto mayor a cero');
    if (n > this.saldo(c) + 0.005) throw new Error(`El monto supera lo que se debe (${dinero(this.saldo(c))})`);
    if (!MEDIOS_COMPRA.includes(medio)) throw new Error('Elegí el medio de pago');
    return RepositorioCompras.pagar(c.id, n, medio);
  },
  opciones: lista => [{ id: 'todas', texto: 'Todas', cuenta: lista.length }, { id: 'pendientes', texto: 'Con saldo pendiente', cuenta: lista.filter(c => ServicioCompras.saldo(c) > 0.005).length }],
  filtrar: (lista, { vista, busqueda }) => lista.filter(c => (vista === 'pendientes' ? ServicioCompras.saldo(c) > 0.005 : true) && coincide(busqueda, c.codigo, c.proveedores?.nombre, c.nota)),
};
