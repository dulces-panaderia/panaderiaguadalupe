import { bd, extraer } from './clienteSupabase.js';
export const RepositorioEntregas = {
  listar: async () => extraer(await bd.rpc('entregas')) ?? [],
  tomar: async id => extraer(await bd.rpc('tomar_entrega', { p_id: id })),
  marcar: async (id, cobrada = false) => extraer(await bd.rpc('marcar_entregada', { p_id: id, p_cobrada: cobrada })),
  cobrar: async id => extraer(await bd.rpc('marcar_cobrada', { p_id: id })),
  asignar: async (id, repartidorId) => extraer(await bd.rpc('asignar_repartidor', { p_id: id, p_repartidor: repartidorId })),
  historial: async (repartidorId, desde, hasta) => extraer(await bd.rpc('historial_repartos', { p_repartidor: repartidorId, p_desde: desde, p_hasta: hasta })) ?? [],
};
