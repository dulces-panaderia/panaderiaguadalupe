import { bd, extraer } from './clienteSupabase.js';
export const RepositorioClientes = {
  listar: async () => extraer(await bd.from('clientes').select('*').order('nombre')),
  crear: async o => extraer(await bd.from('clientes').insert(o)),
  actualizar: async (id, campos) => extraer(await bd.from('clientes').update(campos).eq('id', id)),
  saldos: async () => extraer(await bd.rpc('saldos_clientes')) || [],
  cuenta: async id => extraer(await bd.rpc('cuenta_cliente', { p_cliente: id })) || [],
  cobrar: async (id, monto, medio, nota) => extraer(await bd.rpc('registrar_cobro', { p_cliente: id, p_monto: monto, p_medio: medio, p_nota: nota || null })),
};
