import { RepositorioEntregas } from '../datos/repositorioEntregas.js';
import { RepositorioEmpleados } from '../datos/repositorioEmpleados.js';
import { nombreMedio } from './pagos.js';
export const PERIODOS_REPARTOS = [{ id: 'hoy', texto: 'Hoy' }, { id: '7d', texto: 'Últimos 7 días' }, { id: '30d', texto: 'Últimos 30 días' }, { id: 'todo', texto: 'Todo' }];
const r2 = n => Math.round(n * 100) / 100;
// Inicio del período elegido, en hora local; null = sin límite
function desdeDe(id) {
  const h = new Date(), dia = n => new Date(h.getFullYear(), h.getMonth(), h.getDate() - n);
  return id === 'hoy' ? dia(0) : id === '7d' ? dia(6) : id === '30d' ? dia(29) : null;
}
export const ServicioEntregas = {
  // Pedidos por entregar (pendientes y en camino). La base de datos decide cuáles puede ver cada rol
  listar: () => RepositorioEntregas.listar(),
  tomar: id => RepositorioEntregas.tomar(id),         // el repartidor sale a repartir
  // Entregada: queda quién y cuándo. En un pedido contra entrega, cobrada = true registra también el cobro en efectivo
  marcar: (id, cobrada = false) => RepositorioEntregas.marcar(id, cobrada),
  cobrar: id => RepositorioEntregas.cobrar(id),     // el delivery cobró el pedido contra entrega: recién ahí suma a las ventas
  porCobrar: e => !!e.contra_entrega && !e.cobrada_en,
  asignar: (id, repartidorId) => RepositorioEntregas.asignar(id, repartidorId || null),
  async repartidores() { return (await RepositorioEmpleados.listar()).filter(e => e.rol === 'repartidor' && e.activo); },
  // Repartos ya entregados. Un repartidor solo recibe los suyos (lo garantiza la base de datos); el admin pide los de un repartidor
  historial(periodoId, repartidorId = null) { const d = desdeDe(periodoId); return RepositorioEntregas.historial(repartidorId, d ? d.toISOString() : null, null); },
  resumen(filas) {
    const con = filas.filter(f => f.en_camino_en && f.entregada_en), ms = con.map(f => new Date(f.entregada_en) - new Date(f.en_camino_en));
    return { cantidad: filas.length, total: r2(filas.reduce((s, f) => s + Number(f.total), 0)), cobradoEfectivo: r2(filas.filter(f => f.contra_entrega && f.cobrada_en).reduce((s, f) => s + Number(f.total), 0)),   // efectivo que el delivery cobró al entregar
      porCobrar: r2(filas.filter(f => f.contra_entrega && !f.cobrada_en).reduce((s, f) => s + Number(f.total), 0)),         // entregado pero todavía sin cobrar
      promedioMs: ms.length ? ms.reduce((s, x) => s + x, 0) / ms.length : null };
  },
  // Cómo se pagó un pedido: lo cobrado (por medio) y lo que quedó a cuenta
  cobro(e) {
    const c = e.cobros || [];
    return { cobrado: c.filter(p => p.medio !== 'deuda').map(p => ({ texto: nombreMedio(p.medio), monto: Number(p.monto) })), aCuenta: r2(c.filter(p => p.medio === 'deuda').reduce((s, p) => s + Number(p.monto), 0)) };
  },
};
