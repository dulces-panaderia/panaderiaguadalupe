import { RepositorioMovimientos } from '../datos/repositorioMovimientos.js';
import { coincide } from './texto.js';
export const TIPOS_MOVIMIENTO = { inicial: 'Stock inicial', compra: 'Compra', venta: 'Venta', anulacion: 'Venta cancelada', ajuste: 'Ajuste', merma: 'Merma' };
export const ServicioMovimientos = {
  listar: () => RepositorioMovimientos.listar(),
  opciones: lista => [{ id: 'todos', texto: 'Todos', cuenta: lista.length }, ...['venta', 'compra', 'ajuste', 'merma', 'anulacion'].map(t => ({ id: t, texto: t === 'anulacion' ? 'Cancelaciones' : TIPOS_MOVIMIENTO[t] + 's', cuenta: lista.filter(m => m.tipo === t).length }))],
  filtrar: (lista, { vista, busqueda }) => lista.filter(m => (vista === 'todos' || m.tipo === vista) && coincide(busqueda, m.codigo, m.productos?.nombre, m.productos?.codigo, m.motivo)),
};
