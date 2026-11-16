import { bd, extraer } from './clienteSupabase.js';
export const RepositorioCategorias = {
  listar: async () => extraer(await bd.from('categorias').select('*').order('nombre')),
  crear: async o => extraer(await bd.from('categorias').insert(o)),
  actualizar: async (id, campos) => extraer(await bd.from('categorias').update(campos).eq('id', id)),
};
