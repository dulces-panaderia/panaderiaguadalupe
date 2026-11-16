import { bd, extraer } from './clienteSupabase.js';
export const RepositorioProductos = {
  listar: async () => extraer(await bd.from('productos').select('*,categorias(nombre)').order('nombre')),
  crear: async o => extraer(await bd.from('productos').insert(o)),
  actualizar: async (id, campos) => extraer(await bd.from('productos').update(campos).eq('id', id)),
  masVendidos: async n => extraer(await bd.rpc('mas_vendidos', { p_limite: n })),
  // El stock solo se modifica con esta función: deja el movimiento en el historial
  ajustarStock: async (id, delta, tipo, motivo) => extraer(await bd.rpc('ajustar_stock', { p_producto: id, p_delta: delta, p_tipo: tipo, p_motivo: motivo })),
};
