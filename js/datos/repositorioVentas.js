import { bd, extraer } from './clienteSupabase.js';
export const RepositorioVentas = {
  registrar: async p => extraer(await bd.rpc('registrar_venta', p)),
  listar: async (limite = 200) => extraer(await bd.from('ventas').select('*,clientes(nombre),pagos(medio,monto,tipo)').order('created_at', { ascending: false }).limit(limite)),
  cancelar: async id => extraer(await bd.rpc('cancelar_venta', { p_id: id })),
  comprobante: async id => extraer(await bd.rpc('comprobante_venta', { p_id: id })),
};
