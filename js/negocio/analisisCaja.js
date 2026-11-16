const MEDIOS = ['efectivo', 'transferencia', 'tarjeta', 'deuda'];
// Ordena lo que devuelve la base (resumen_caja) en una tabla: filas por concepto, columnas por medio de pago
export function armarResumenCaja(r) {
  const g = (o, m) => Number((o || {})[m] || 0);
  const filas = [
    { clave: 'ventas', texto: 'Ventas', valores: MEDIOS.map(m => g(r.ventas, m)) },
    { clave: 'cobros', texto: 'Cobros de deuda', valores: MEDIOS.map(m => g(r.cobros, m)) },
    { clave: 'devoluciones', texto: 'Devoluciones', valores: MEDIOS.map(m => g(r.devoluciones, m)) },
    { clave: 'egresos', texto: 'Egresos', valores: MEDIOS.map(m => -g(r.egresos, m)) }];
  const neto = MEDIOS.map((_, i) => filas.reduce((s, f) => s + f.valores[i], 0));
  return { medios: MEDIOS, filas, neto, inicial: Number(r.caja.monto_inicial), esperado: Number(r.efectivo_esperado), cantidadVentas: Number(r.cantidad_ventas), caja: r.caja };
}
const TIPOS = { venta: 'Venta', cobro_deuda: 'Cobro de deuda', devolucion: 'Devolución', compra: 'Pago de compra', gasto: 'Gasto', retiro: 'Retiro' };
// Une los cobros y los egresos de una caja en una sola lista ordenada por hora (los egresos restan)
export function unirMovimientos(pagos, egresos) {
  const a = pagos.map(p => ({ fecha: p.created_at, codigo: p.codigo, tipo: TIPOS[p.tipo], detalle: [p.ventas?.codigo, p.clientes?.nombre].filter(Boolean).join(' · '), medio: p.medio, monto: Number(p.monto) }));
  const b = egresos.map(e => ({ fecha: e.created_at, codigo: e.codigo, tipo: TIPOS[e.tipo], detalle: [e.concepto, e.proveedores?.nombre].filter(Boolean).join(' · '), medio: e.medio, monto: -Number(e.monto) }));
  return [...a, ...b].sort((x, y) => new Date(x.fecha) - new Date(y.fecha));
}
