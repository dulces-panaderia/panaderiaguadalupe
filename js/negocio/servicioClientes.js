import { RepositorioClientes } from '../datos/repositorioClientes.js';
import { porEstado } from './filtros.js';
import { aNumero, coincide } from './texto.js';
import { dinero } from './formato.js';
const r2 = n => Math.round(n * 100) / 100;
const deuda = (saldos, c) => saldos.get(c.id) || 0;
export const ServicioClientes = {
  listar: () => RepositorioClientes.listar(),
  crear(o) {
    if (!o.nombre?.trim()) throw new Error('Ingresá el nombre del cliente');
    return RepositorioClientes.crear({ nombre: o.nombre.trim(), telefono: o.telefono || null, direccion: o.direccion || null });
  },
  // Los clientes no se eliminan (conservan su historial): se desactivan
  alternar: c => RepositorioClientes.actualizar(c.id, { activo: !c.activo }),
  // Deuda de cada cliente: Map(id -> saldo). Un saldo positivo es lo que el cliente debe
  async saldos() { return new Map((await RepositorioClientes.saldos()).map(s => [s.cliente_id, Number(s.saldo)])); },
  // Historial de la cuenta: cada fila con el saldo acumulado
  async cuenta(id) { let acum = 0; return (await RepositorioClientes.cuenta(id)).map(f => { acum = r2(acum + Number(f.monto)); return { ...f, monto: Number(f.monto), saldo: acum }; }); },
  cobrar(cliente, monto, medio, saldoActual, nota) {
    const n = aNumero(monto);
    if (!(n > 0)) throw new Error('Ingresá un monto mayor a cero');
    if (n > saldoActual + 0.005) throw new Error(`El monto supera la deuda del cliente (${dinero(saldoActual)})`);
    if (!['efectivo', 'transferencia', 'tarjeta'].includes(medio)) throw new Error('Elegí el medio de pago');
    return RepositorioClientes.cobrar(cliente.id, n, medio, nota);
  },
  opciones(lista, saldos) {
    const act = lista.filter(c => c.activo);
    return [{ id: 'todos', texto: 'Todos', cuenta: act.length }, { id: 'deuda', texto: 'Con deuda', cuenta: act.filter(c => deuda(saldos, c) > 0.005).length },
      { id: 'inactivos', texto: 'Desactivados', cuenta: lista.length - act.length, aparte: true }];
  },
  filtrar(lista, { vista, busqueda, saldos }) {
    const campos = c => [c.nombre, c.codigo, c.telefono, c.direccion];
    if (vista === 'deuda') return lista.filter(c => c.activo && deuda(saldos, c) > 0.005 && coincide(busqueda, ...campos(c)));
    return porEstado(lista, vista, busqueda, campos);
  },
};
