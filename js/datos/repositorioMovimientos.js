import { bd, extraer } from './clienteSupabase.js';
export const RepositorioMovimientos = {
  listar: async (limite = 400) => extraer(await bd.from('movimientos_stock').select('*,productos(nombre,codigo,unidad)').order('created_at', { ascending: false }).limit(limite)),
};
