import { bd, extraer } from './clienteSupabase.js';
export const RepositorioCompras = {
  listar: async (limite = 300) => extraer(await bd.from('compras').select('*,proveedores(nombre,codigo),compra_items(producto_id,cantidad,costo_unitario,subtotal,productos(nombre,unidad)),egresos(monto,medio)')
    .order('created_at', { ascending: false }).limit(limite)),
  registrar: async (proveedor, items, pagos, nota) => extraer(await bd.rpc('registrar_compra', { p_proveedor: proveedor, p_items: items, p_pagos: pagos, p_nota: nota || null })),
  pagar: async (compra, monto, medio) => extraer(await bd.rpc('pagar_compra', { p_compra: compra, p_monto: monto, p_medio: medio })),
};
