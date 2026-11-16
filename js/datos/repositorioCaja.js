import { bd, extraer } from './clienteSupabase.js';
export const RepositorioCaja = {
  abierta: async () => extraer(await bd.from('cajas').select('*').eq('estado', 'abierta').maybeSingle()),
  ultimaCerrada: async () => extraer(await bd.from('cajas').select('*').eq('estado', 'cerrada').order('cerrada_en', { ascending: false }).limit(1).maybeSingle()),
  porId: async id => extraer(await bd.from('cajas').select('*').eq('id', id).single()),
  historial: async (limite = 60) => extraer(await bd.from('cajas').select('*').order('abierta_en', { ascending: false }).limit(limite)),
  abrir: async monto => extraer(await bd.rpc('abrir_caja', { p_monto_inicial: monto })),
  cerrar: async (contado, observaciones) => extraer(await bd.rpc('cerrar_caja', { p_contado: contado, p_observaciones: observaciones || null })),
  resumen: async id => extraer(await bd.rpc('resumen_caja', { p_caja: id })),
  pagos: async id => extraer(await bd.from('pagos').select('*,ventas(codigo),clientes(nombre)').eq('caja_id', id).order('created_at')),
  egresos: async id => extraer(await bd.from('egresos').select('*,proveedores(nombre)').eq('caja_id', id).order('created_at')),
  registrarEgreso: async (tipo, concepto, medio, monto) => extraer(await bd.rpc('registrar_egreso', { p_tipo: tipo, p_concepto: concepto, p_medio: medio, p_monto: monto })),
};
