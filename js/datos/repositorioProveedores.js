import { bd, extraer } from './clienteSupabase.js';
export const RepositorioProveedores = {
  listar: async () => extraer(await bd.from('proveedores').select('*').order('nombre')),
  crear: async o => extraer(await bd.from('proveedores').insert(o)),
  actualizar: async (id, campos) => extraer(await bd.from('proveedores').update(campos).eq('id', id)),
};
