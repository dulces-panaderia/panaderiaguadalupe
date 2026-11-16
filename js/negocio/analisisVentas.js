// Cálculos puros sobre las ventas: períodos, series, contexto para el sistema experto e informe exportable.
import { fechaCorta } from './formato.js';
import { nombreMedio } from './pagos.js';
const DIA = 864e5;
const inicioDia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mas = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const suma = a => a.reduce((s, x) => s + x, 0);
export const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const PERIODOS = [{ id: 'hoy', texto: 'Hoy' }, { id: 'ayer', texto: 'Ayer' }, { id: '7d', texto: '7 días' }, { id: '30d', texto: '30 días' }, { id: '90d', texto: '90 días' },
  { id: 'mes', texto: 'Este mes' }, { id: 'mesant', texto: 'Mes anterior' }, { id: 'anio', texto: 'Este año' }, { id: 'personalizado', texto: 'Personalizado', aparte: true }];
export const PASOS = [{ id: 'auto', texto: 'Automático' }, { id: 'day', texto: 'Por día' }, { id: 'week', texto: 'Por semana' }, { id: 'month', texto: 'Por mes' }];

// "hasta" es exclusivo (el inicio del día siguiente al último día incluido)
export function calcularPeriodo(id, personalizado = {}, paso = 'auto', ahora = new Date()) {
  const hoy = inicioDia(ahora), manana = mas(hoy, 1); let desde, hasta;
  switch (id) {
    case 'hoy': desde = hoy; hasta = manana; break;
    case 'ayer': desde = mas(hoy, -1); hasta = hoy; break;
    case '7d': desde = mas(hoy, -6); hasta = manana; break;
    case '30d': desde = mas(hoy, -29); hasta = manana; break;
    case '90d': desde = mas(hoy, -89); hasta = manana; break;
    case 'mes': desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1); hasta = manana; break;
    case 'mesant': desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 1); break;
    case 'anio': desde = new Date(hoy.getFullYear(), 0, 1); hasta = manana; break;
    case 'personalizado': {
      const f = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
      const d = f(personalizado.desde), h = f(personalizado.hasta);
      if (!d || !h) throw new Error('Elegí las fechas "Desde" y "Hasta"');
      if (h < d) throw new Error('La fecha "Hasta" no puede ser anterior a "Desde"');
      desde = d; hasta = mas(h, 1); break;
    }
    default: throw new Error('Período inválido');
  }
  const dias = Math.round((hasta - desde) / DIA);
  if (dias > 732) throw new Error('El período máximo es de 2 años');
  const elegido = ['day', 'week', 'month'].includes(paso) ? paso : (dias <= 31 ? 'day' : dias <= 180 ? 'week' : 'month');
  const ultimo = mas(hasta, -1);
  return { id, desde, hasta, dias, paso: elegido, anteriorDesde: mas(desde, -dias), anteriorHasta: desde,
    etiqueta: dias === 1 ? fechaCorta(desde) : `${fechaCorta(desde)} al ${fechaCorta(ultimo)}`,
    etiquetaAnterior: dias === 1 ? fechaCorta(mas(desde, -1)) : `${fechaCorta(mas(desde, -dias))} al ${fechaCorta(mas(desde, -1))}` };
}
const etiquetaPeriodo = (paso, d) => paso === 'month' ? d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
  : `${paso === 'week' ? 'Sem. ' : ''}${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
// Completa con ceros los períodos sin ventas, para que el gráfico sea continuo
export function rellenarSerie(p, filas) {
  const mapa = new Map(filas.map(f => [String(f.periodo).slice(0, 10), f])), res = [];
  let cur = p.desde;
  if (p.paso === 'week') cur = mas(cur, -((cur.getDay() + 6) % 7));          // lunes de esa semana
  if (p.paso === 'month') cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const avanzar = d => p.paso === 'day' ? mas(d, 1) : p.paso === 'week' ? mas(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, 1);
  while (cur < p.hasta) {
    const f = mapa.get(isoLocal(cur));
    res.push({ clave: isoLocal(cur), etiqueta: etiquetaPeriodo(p.paso, cur), cantidad: f ? Number(f.cantidad) : 0, importe: f ? Number(f.importe) : 0 });
    cur = avanzar(cur);
  }
  return res;
}
const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export function construirContexto({ periodo, resumen, resumenAnterior, serie, productos, calendario, catalogo, medios = [], deudaClientes = 0 }) {
  const norm = r => { const x = r || {}, cantidad = Number(x.cantidad || 0), importe = Number(x.importe || 0), costo = Number(x.costo || 0), gastos = Number(x.gastos || 0), ganancia = importe - costo;
    return { cantidad, importe, delivery: Number(x.cantidad_delivery || 0), importeDelivery: Number(x.importe_delivery || 0), canceladas: Number(x.canceladas || 0), ticket: cantidad ? importe / cantidad : 0,
      costo, gastos, ganancia, margen: importe ? ganancia / importe : 0, resultado: ganancia - gastos }; };
  const actual = norm(resumen), anterior = norm(resumenAnterior), total = productos.reduce((s, p) => s + Number(p.importe), 0);   // base de los porcentajes por producto y categoría: el envío no pertenece a ninguno
  const prods = productos.map(p => { const importe = Number(p.importe), costo = Number(p.costo || 0);
    return { id: p.producto_id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, unidad: p.unidad, cantidad: Number(p.cantidad), importe, costo, ganancia: importe - costo,
      margen: importe ? (importe - costo) / importe : 0, participacion: total ? importe / total : 0 }; }).sort((a, b) => b.importe - a.importe);
  const porCat = new Map(); prods.forEach(p => porCat.set(p.categoria, (porCat.get(p.categoria) || 0) + p.importe));
  const categorias = [...porCat].map(([nombre, importe]) => ({ nombre, importe, participacion: total ? importe / total : 0 })).sort((a, b) => b.importe - a.importe);
  const ocurrencias = Array(7).fill(0); for (let d = periodo.desde; d < periodo.hasta; d = mas(d, 1)) ocurrencias[d.getDay()]++;
  const porDia = [1, 2, 3, 4, 5, 6, 0].map(dow => { const f = calendario.filter(c => Number(c.dow) === dow), importe = suma(f.map(x => Number(x.importe)));
    return { dia: dow, nombre: NOMBRES_DIA[dow], cantidad: suma(f.map(x => Number(x.cantidad))), importe, ocurrencias: ocurrencias[dow], promedio: ocurrencias[dow] ? importe / ocurrencias[dow] : 0 }; });
  const porHora = Array.from({ length: 24 }, (_, h) => { const f = calendario.filter(c => Number(c.hora) === h);
    return { hora: h, cantidad: suma(f.map(x => Number(x.cantidad))), importe: suma(f.map(x => Number(x.importe))), participacion: 0 }; });
  const totalCant = suma(porHora.map(h => h.cantidad)); porHora.forEach(h => { h.participacion = totalCant ? h.cantidad / totalCant : 0; });
  const totalMedios = suma(medios.map(m => Number(m.importe)));
  const mediosPago = medios.map(m => ({ medio: m.medio, nombre: nombreMedio(m.medio), importe: Number(m.importe), participacion: totalMedios ? Number(m.importe) / totalMedios : 0 })).sort((a, b) => b.importe - a.importe);
  // La ganancia solo es confiable si la mayor parte de lo vendido tiene costo cargado
  const sinCosto = prods.filter(p => p.costo === 0 && p.importe > 0), importeSinCosto = suma(sinCosto.map(p => p.importe));
  return { periodo, actual, anterior, serie: rellenarSerie(periodo, serie), productos: prods, porGanancia: [...prods].sort((a, b) => b.ganancia - a.ganancia), categorias, porDia, porHora,
    medios: mediosPago, sinCosto, costoConfiable: total > 0 && importeSinCosto / total < 0.3, deudaClientes: Number(deudaClientes), catalogo, suficiente: actual.cantidad >= 5 };
}
const variacion = (a, b) => b > 0 ? (a - b) / b : null;
// Datos listos para PDF y Excel (los dos usan la misma estructura)
export function construirInforme(ctx, explicaciones) {
  const a = ctx.actual, b = ctx.anterior;
  const kpis = [
    { etiqueta: 'Ventas ($)', tipo: 'dinero', valor: a.importe, anterior: b.importe, variacion: variacion(a.importe, b.importe) },
    { etiqueta: 'Cantidad de ventas', tipo: 'numero', valor: a.cantidad, anterior: b.cantidad, variacion: variacion(a.cantidad, b.cantidad) },
    { etiqueta: 'Ticket promedio', tipo: 'dinero', valor: a.ticket, anterior: b.ticket, variacion: variacion(a.ticket, b.ticket) },
    { etiqueta: 'Ganancia bruta', tipo: 'dinero', valor: a.ganancia, anterior: b.ganancia, variacion: b.ganancia > 0 ? variacion(a.ganancia, b.ganancia) : null },
    { etiqueta: 'Margen', tipo: 'porcentaje', valor: a.margen, anterior: b.margen, variacion: null },
    { etiqueta: 'Gastos', tipo: 'dinero', valor: a.gastos, anterior: b.gastos, variacion: null },
    { etiqueta: 'Resultado (ganancia - gastos)', tipo: 'dinero', valor: a.resultado, anterior: b.resultado, variacion: null },
    { etiqueta: 'Ventas por delivery', tipo: 'porcentaje', valor: a.cantidad ? a.delivery / a.cantidad : 0, anterior: b.cantidad ? b.delivery / b.cantidad : 0, variacion: null },
    { etiqueta: 'Ventas canceladas', tipo: 'numero', valor: a.canceladas, anterior: b.canceladas, variacion: null },
    { etiqueta: 'Deuda de clientes (hoy)', tipo: 'dinero', valor: ctx.deudaClientes, anterior: null, variacion: null }];
  const tablas = [
    { id: 'serie', nombre: 'Ventas por período', columnas: [{ texto: 'Período', tipo: 'texto' }, { texto: 'Ventas', tipo: 'numero' }, { texto: 'Importe', tipo: 'dinero' }],
      filas: ctx.serie.map(s => [s.etiqueta, s.cantidad, s.importe]) },
    { id: 'productos', nombre: 'Productos', columnas: [{ texto: 'Código', tipo: 'texto' }, { texto: 'Producto', tipo: 'texto' }, { texto: 'Categoría', tipo: 'texto' }, { texto: 'Cantidad', tipo: 'numero' }, { texto: 'Unidad', tipo: 'texto' },
        { texto: 'Importe', tipo: 'dinero' }, { texto: 'Costo', tipo: 'dinero' }, { texto: 'Ganancia', tipo: 'dinero' }, { texto: 'Margen', tipo: 'porcentaje' }, { texto: '% del total', tipo: 'porcentaje' }],
      filas: ctx.productos.map(p => [p.codigo, p.nombre, p.categoria, p.cantidad, p.unidad === 'kg' ? 'kg' : 'u', p.importe, ...(p.costo > 0 ? [p.costo, p.ganancia, p.margen] : [null, null, null]), p.participacion]) },   // sin costo cargado no se muestra una ganancia falsa
    { id: 'categorias', nombre: 'Categorías', columnas: [{ texto: 'Categoría', tipo: 'texto' }, { texto: 'Importe', tipo: 'dinero' }, { texto: '% del total', tipo: 'porcentaje' }],
      filas: ctx.categorias.map(c => [c.nombre, c.importe, c.participacion]) },
    { id: 'medios', nombre: 'Medios de pago', columnas: [{ texto: 'Medio', tipo: 'texto' }, { texto: 'Importe', tipo: 'dinero' }, { texto: '% del total', tipo: 'porcentaje' }],
      filas: ctx.medios.map(m => [m.nombre, m.importe, m.participacion]) },
    { id: 'dias', nombre: 'Por día de semana', columnas: [{ texto: 'Día', tipo: 'texto' }, { texto: 'Ventas', tipo: 'numero' }, { texto: 'Importe', tipo: 'dinero' }, { texto: 'Promedio por día', tipo: 'dinero' }, { texto: 'Días en el período', tipo: 'numero' }],
      filas: ctx.porDia.map(d => [d.nombre, d.cantidad, d.importe, d.promedio, d.ocurrencias]) },
    { id: 'horas', nombre: 'Por hora', columnas: [{ texto: 'Franja', tipo: 'texto' }, { texto: 'Ventas', tipo: 'numero' }, { texto: 'Importe', tipo: 'dinero' }, { texto: '% de las ventas', tipo: 'porcentaje' }],
      filas: ctx.porHora.filter(h => h.cantidad > 0).map(h => [`${String(h.hora).padStart(2, '0')}:00 a ${String(h.hora).padStart(2, '0')}:59`, h.cantidad, h.importe, h.participacion]) }];
  return { titulo: 'Reporte de ventas y ganancias', subtitulo: `Período: ${ctx.periodo.etiqueta}`, periodo: ctx.periodo.etiqueta, kpis, explicaciones, tablas };
}
