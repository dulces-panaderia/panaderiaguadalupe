import { RepositorioVentas } from '../datos/repositorioVentas.js';
import { coincide, aNumero } from './texto.js';
import { validarPagos } from './pagos.js';
let carrito = []; // [{producto, cantidad}]
let enCurso = false;   // evita registrar dos veces la misma venta
let contraEntrega = false;   // el delivery cobra el total en efectivo al entregar; la venta cuenta cuando lo marca cobrado
let envioTexto = '';   // costo de envío tal como se escribe (opcional; solo aplica a un delivery)
const r2 = n => Math.round(n * 100) / 100;
const envioNumero = t => { const n = aNumero(t); return Number.isFinite(n) && n > 0 ? r2(n) : 0; };   // mientras se escribe, lo incompleto cuenta como 0
export const ServicioVentas = {
  // kg admite 3 decimales (gramos); unidad solo enteros
  normalizar(p, texto) {
    let q = parseFloat(String(texto).replace(',', '.'));
    q = p.unidad === 'kg' ? Math.round(q * 1000) / 1000 : Math.round(q);
    if (!(q > 0)) throw new Error('Cantidad inválida');
    return q;
  },
  agregar(p, texto) {
    const q = this.normalizar(p, texto), it = carrito.find(c => c.producto.id === p.id), ya = it ? it.cantidad : 0;
    if (ya + q > p.stock) throw new Error('Stock insuficiente');
    if (it) it.cantidad = Math.round((ya + q) * 1000) / 1000; else carrito.push({ producto: p, cantidad: q });
  },
  quitar: i => carrito.splice(i, 1),
  items: () => carrito.map(c => ({ ...c, subtotal: r2(c.cantidad * c.producto.precio) })),
  subtotal() { return r2(this.items().reduce((s, c) => s + c.subtotal, 0)); },
  configurarEnvio(texto) { envioTexto = texto || ''; },
  configurarContraEntrega(si) { contraEntrega = !!si; },
  contraEntrega: () => contraEntrega,
  envio: () => envioNumero(envioTexto),
  total() { return r2(this.subtotal() + this.envio()); },   // lo que paga el cliente: productos + envío
  // pagos: [{ medio, monto }]. Pueden ser mixtos; la parte "deuda" solo se acepta con un cliente registrado
  async confirmar({ clienteId, tipo, direccion, pagos }) {
    if (enCurso) throw new Error('La venta ya se está registrando');
    if (!carrito.length) throw new Error('El carrito está vacío');
    if (tipo === 'delivery' && !direccion) throw new Error('Ingresá la dirección de entrega');
    const textoEnvio = String(envioTexto || '').trim();
    if (tipo === 'delivery' && textoEnvio && !(aNumero(textoEnvio) >= 0)) throw new Error('El costo de envío no es válido');
    const costoEnvio = tipo === 'delivery' ? envioNumero(textoEnvio) : 0;
    const contra = tipo === 'delivery' && contraEntrega;   // contra entrega: no se registran pagos ahora, el delivery cobra al entregar
    const cobros = contra ? [] : validarPagos(r2(this.subtotal() + costoEnvio), pagos, !!clienteId);
    enCurso = true;
    try {
      const id = await RepositorioVentas.registrar({ p_cliente: clienteId, p_tipo: tipo, p_direccion: direccion || null,
        p_items: carrito.map(c => ({ producto_id: c.producto.id, cantidad: c.cantidad })), p_pagos: cobros, p_costo_envio: costoEnvio, p_contra_entrega: contra });
      carrito = []; envioTexto = ''; contraEntrega = false;
      return id;
    } finally { enCurso = false; }
  },
  comprobante: id => RepositorioVentas.comprobante(id),
  historial: () => RepositorioVentas.listar(),
  cancelar: id => RepositorioVentas.cancelar(id),
  nombreEstado: e => e === 'en_camino' ? 'en camino' : e,
  porCobrar: v => !!v.contra_entrega && !v.cobrada_en && v.estado !== 'cancelada',   // contra entrega que el delivery todavía no cobró
  // Las ventas canceladas se ven en una vista aparte
  opciones: ventas => [{ id: 'todas', texto: 'Todas' }, { id: 'pendiente', texto: 'Pendientes' }, { id: 'en_camino', texto: 'En camino' }, { id: 'completada', texto: 'Completadas' }, { id: 'entregada', texto: 'Entregadas' },
    { id: 'por_cobrar', texto: 'Por cobrar', cuenta: ventas.filter(v => v.contra_entrega && !v.cobrada_en && v.estado !== 'cancelada').length },
    { id: 'cancelada', texto: 'Canceladas', cuenta: ventas.filter(v => v.estado === 'cancelada').length, aparte: true }],
  filtrar: (ventas, { vista, busqueda }) => ventas.filter(v => (vista === 'todas' ? v.estado !== 'cancelada' : vista === 'por_cobrar' ? ServicioVentas.porCobrar(v) : v.estado === vista)
    && coincide(busqueda, v.codigo, v.clientes?.nombre, v.direccion)),
};
