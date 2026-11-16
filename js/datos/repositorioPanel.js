import { bd, extraer } from './clienteSupabase.js';
// Las funciones del panel agrupan las ventas dentro de la base de datos (solo las puede usar el administrador)
export const RepositorioPanel = {
  resumen: async (desde, hasta) => (extraer(await bd.rpc('panel_resumen', { p_desde: desde, p_hasta: hasta })) || [])[0] || null,
  serie: async (desde, hasta, paso, zona) => extraer(await bd.rpc('panel_serie', { p_desde: desde, p_hasta: hasta, p_paso: paso, p_zona: zona })) || [],
  productos: async (desde, hasta) => extraer(await bd.rpc('panel_productos', { p_desde: desde, p_hasta: hasta })) || [],
  medios: async (desde, hasta) => extraer(await bd.rpc('panel_medios', { p_desde: desde, p_hasta: hasta })) || [],
  calendario: async (desde, hasta, zona) => extraer(await bd.rpc('panel_calendario', { p_desde: desde, p_hasta: hasta, p_zona: zona })) || [],
};
