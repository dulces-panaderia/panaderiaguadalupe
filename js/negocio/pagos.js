import { aNumero } from './texto.js';
import { dinero } from './formato.js';
export const MEDIOS = [{ id: 'efectivo', texto: 'Efectivo' }, { id: 'transferencia', texto: 'Transferencia' }, { id: 'tarjeta', texto: 'Tarjeta' }, { id: 'deuda', texto: 'A cuenta (deuda)' }];
export const nombreMedio = id => (MEDIOS.find(m => m.id === id) || { texto: id }).texto;
const r2 = n => Math.round(n * 100) / 100;
// campos: { efectivo: '1000', transferencia: '', ... } -> [{ medio, monto }] (un campo vacío vale 0)
export const armarPagos = campos => MEDIOS.map(m => ({ medio: m.id, monto: campos[m.id] == null || String(campos[m.id]).trim() === '' ? 0 : aNumero(campos[m.id]) }));
export function resumenPagos(total, pagos) {
  const pagado = r2(pagos.reduce((s, p) => s + (Number.isFinite(p.monto) ? p.monto : 0), 0));
  return { pagado, falta: r2(Math.max(0, total - pagado)), exceso: r2(Math.max(0, pagado - total)) };
}
// Reglas de cobro: los montos deben sumar el total y la deuda solo se permite a clientes registrados
export function validarPagos(total, pagos, hayCliente) {
  for (const p of pagos) if (!Number.isFinite(p.monto) || p.monto < 0) throw new Error(`El monto de ${nombreMedio(p.medio).toLowerCase()} no es válido`);
  const usados = pagos.filter(p => p.monto > 0);
  if (usados.some(p => p.medio === 'deuda') && !hayCliente) throw new Error('La deuda solo se permite a clientes registrados: elegí un cliente o cobrá el total ahora');
  const r = resumenPagos(total, usados);
  if (r.falta > 0.005) throw new Error(`Falta cobrar ${dinero(r.falta)}`);
  if (r.exceso > 0.005) throw new Error(`Los pagos superan el total en ${dinero(r.exceso)}`);
  return usados;
}
