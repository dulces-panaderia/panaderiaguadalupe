import { RepositorioCaja } from '../datos/repositorioCaja.js';
import { armarResumenCaja, unirMovimientos } from './analisisCaja.js';
import { aNumero } from './texto.js';
const MEDIOS_EGRESO = ['efectivo', 'transferencia', 'tarjeta'];
export const ServicioCaja = {
  abierta: () => RepositorioCaja.abierta(),
  // Sugiere abrir con el efectivo con que se cerró la última vez
  async montoSugerido() { const c = await RepositorioCaja.ultimaCerrada(); return c ? Number(c.efectivo_contado) : 0; },
  async abrir(monto) {
    const n = aNumero(monto);
    if (!(n >= 0)) throw new Error('Ingresá el efectivo inicial de la caja (puede ser 0)');
    return RepositorioCaja.abrir(n);
  },
  async cerrar(contado, observaciones) {
    const n = aNumero(contado);
    if (!(n >= 0)) throw new Error('Contá el efectivo de la caja e ingresá el total');
    return RepositorioCaja.porId(await RepositorioCaja.cerrar(n, observaciones));
  },
  async resumen(id) { return armarResumenCaja(await RepositorioCaja.resumen(id)); },
  async movimientos(id, esAdmin) { const [p, e] = await Promise.all([RepositorioCaja.pagos(id), esAdmin ? RepositorioCaja.egresos(id) : []]); return unirMovimientos(p, e); },
  historial: () => RepositorioCaja.historial(),
  async egreso({ tipo, concepto, medio, monto }) {
    const n = aNumero(monto);
    if (!['gasto', 'retiro'].includes(tipo)) throw new Error('Elegí si es un gasto o un retiro');
    if (!String(concepto || '').trim()) throw new Error('Escribí el concepto del egreso');
    if (!MEDIOS_EGRESO.includes(medio)) throw new Error('Elegí el medio de pago');
    if (!(n > 0)) throw new Error('Ingresá un monto mayor a cero');
    return RepositorioCaja.registrarEgreso(tipo, String(concepto).trim(), medio, n);
  },
};
