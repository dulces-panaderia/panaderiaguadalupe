// Sistema experto del panel: una base de reglas "si pasa X, entonces se interpreta Y".
// Cada conclusión indica la regla que la generó (por ejemplo EVO-02), así se puede explicar de dónde sale.
import { dinero, formatear, porcentaje as pct } from './formato.js';
import { nombreMedio } from './pagos.js';
const suma = a => a.reduce((s, x) => s + x, 0);
const lista = (a, n = 3) => a.slice(0, n).join(', ') + (a.length > n ? ' y otros' : '');
const REGLAS = [
  // ---- Resumen general ----
  { id: 'RES-01', grafico: 'resumen', evaluar: c => c.actual.cantidad === 0 ? [{ nivel: 'info', texto: 'No hay ventas registradas en este período.' }]
      : !c.suficiente ? [{ nivel: 'info', texto: `Hay pocas ventas en este período (${c.actual.cantidad}). Las conclusiones pueden no ser representativas: probá con un período más largo.` }] : [] },
  { id: 'RES-02', grafico: 'resumen', evaluar: c => {
      if (!c.actual.cantidad) return [];
      const a = c.actual.importe, b = c.anterior.importe;
      if (!(b > 0)) return [{ nivel: 'info', texto: 'No hay ventas en el período anterior para comparar.' }];
      const d = (a - b) / b;
      if (Math.abs(d) < 0.03) return [{ nivel: 'info', texto: `Las ventas se mantuvieron estables: ${dinero(a)} contra ${dinero(b)} del período anterior.` }];
      return d > 0 ? [{ nivel: 'bien', texto: `Las ventas crecieron un ${pct(d)} frente al período anterior (${dinero(a)} contra ${dinero(b)}).` }]
        : [{ nivel: d < -0.1 ? 'alerta' : 'info', texto: `Las ventas bajaron un ${pct(-d)} frente al período anterior (${dinero(a)} contra ${dinero(b)}).` }]; } },
  { id: 'RES-03', grafico: 'resumen', evaluar: c => {
      if (!c.suficiente || !(c.anterior.ticket > 0)) return [];
      const d = (c.actual.ticket - c.anterior.ticket) / c.anterior.ticket;
      return Math.abs(d) < 0.1 ? [] : [{ nivel: d > 0 ? 'bien' : 'info', texto: `El ticket promedio ${d > 0 ? 'subió' : 'bajó'} un ${pct(Math.abs(d))} (${dinero(c.actual.ticket)}): ${d > 0 ? 'cada cliente compra más por visita.' : 'los clientes compran menos por visita; podrían funcionar combos o promociones por cantidad.'}` }]; } },
  { id: 'RES-04', grafico: 'resumen', evaluar: c => c.suficiente && c.actual.delivery > 0
      ? [{ nivel: 'info', texto: `El ${pct(c.actual.delivery / c.actual.cantidad)} de las ventas fue por delivery (${c.actual.delivery} ventas, ${dinero(c.actual.importeDelivery)}).` }] : [] },
  { id: 'RES-05', grafico: 'resumen', evaluar: c => {
      const t = c.actual.cantidad + c.actual.canceladas, tasa = t ? c.actual.canceladas / t : 0;
      return t >= 10 && c.actual.canceladas >= 2 && tasa > 0.05 ? [{ nivel: 'alerta', texto: `Se canceló el ${pct(tasa)} de las ventas (${c.actual.canceladas}). Conviene revisar los motivos para evitar pérdidas.` }] : []; } },
  { id: 'GAS-01', grafico: 'resumen', evaluar: c => c.actual.gastos > 0
      ? [{ nivel: c.actual.resultado < 0 ? 'alerta' : 'info', texto: `Los gastos del período fueron ${dinero(c.actual.gastos)}; el resultado (ganancia bruta menos gastos) fue ${dinero(c.actual.resultado)}.` }] : [] },
  { id: 'MAR-01', grafico: 'resumen', evaluar: c => {
      if (!c.suficiente || !(c.actual.importe > 0) || !c.costoConfiable) return [];
      let texto = `La ganancia bruta fue ${dinero(c.actual.ganancia)}, un margen del ${pct(c.actual.margen, 1)} sobre las ventas.`;
      if (c.anterior.importe > 0 && c.anterior.costo > 0) { const dm = c.actual.margen - c.anterior.margen;
        if (Math.abs(dm) >= 0.03) texto += ` El margen ${dm > 0 ? 'subió' : 'bajó'} ${(Math.abs(dm) * 100).toFixed(1).replace('.', ',')} puntos frente al período anterior.`; }
      return [{ nivel: c.actual.margen < 0.1 ? 'alerta' : 'info', texto }]; } },
  // ---- Evolución ----
  { id: 'EVO-01', grafico: 'evolucion', evaluar: c => {
      const top = [...c.serie].sort((a, b) => b.importe - a.importe)[0];
      return c.suficiente && c.serie.length >= 3 && top.importe > 0 && c.actual.importe > 0
        ? [{ nivel: 'info', texto: `El tramo con más ventas fue ${top.etiqueta}, con ${dinero(top.importe)} (${pct(top.importe / c.actual.importe)} del total del período).` }] : []; } },
  { id: 'EVO-02', grafico: 'evolucion', evaluar: c => {
      const ys = c.serie.map(s => s.importe), n = ys.length;
      if (!c.suficiente || n < 6) return [];
      const mx = (n - 1) / 2, my = suma(ys) / n; let num = 0, den = 0; ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
      const cambio = my > 0 ? (num / den) * (n - 1) / my : 0;
      if (cambio > 0.15) return [{ nivel: 'bien', texto: 'La tendencia dentro del período es ascendente: las ventas vienen creciendo.' }];
      if (cambio < -0.15) return [{ nivel: 'alerta', texto: 'La tendencia dentro del período es descendente: las ventas vienen cayendo. Conviene revisar precios, promociones o faltantes de stock.' }];
      return [{ nivel: 'info', texto: 'La tendencia dentro del período es estable: no hay una suba ni una baja marcada.' }]; } },
  { id: 'EVO-03', grafico: 'evolucion', evaluar: c => {
      const ceros = c.serie.filter(s => s.cantidad === 0).length;
      return c.periodo.paso === 'day' && c.serie.length >= 7 && ceros > 0 ? [{ nivel: 'info', texto: `Hubo ${ceros} día${ceros > 1 ? 's' : ''} sin ventas dentro del período.` }] : []; } },
  // ---- Productos ----
  { id: 'PRO-01', grafico: 'productos', evaluar: c => c.suficiente && c.productos.length
      ? [{ nivel: 'info', texto: `${c.productos[0].nombre} fue el producto que más ingresos generó: ${dinero(c.productos[0].importe)} (${pct(c.productos[0].participacion)} del total).` }] : [] },
  { id: 'PRO-02', grafico: 'productos', evaluar: c => {
      const top3 = suma(c.productos.slice(0, 3).map(p => p.participacion));
      return c.suficiente && c.productos.length >= 4 && top3 > 0.7 ? [{ nivel: 'alerta', texto: `Los 3 productos más vendidos concentran el ${pct(top3)} de los ingresos: conviene asegurar su stock y no depender de tan pocos productos.` }] : []; } },
  { id: 'PRO-03', grafico: 'productos', evaluar: c => {
      if (!c.suficiente || c.periodo.dias < 3) return [];
      return c.productos.map(p => { const f = c.catalogo.find(x => x.id === p.id); if (!f || !f.activo) return null;
        const ritmo = p.cantidad / c.periodo.dias, dias = ritmo > 0 ? Number(f.stock) / ritmo : Infinity; return dias < 3 ? { p, f, dias } : null; })
        .filter(Boolean).slice(0, 3).map(({ p, f, dias }) => ({ nivel: 'alerta', texto: `${p.nombre}: con el stock actual (${formatear(f.stock, f.unidad)}) alcanza para unos ${(Math.round(dias * 10) / 10).toLocaleString('es-AR')} días al ritmo de este período. Conviene reponer.` })); } },
  { id: 'PRO-04', grafico: 'productos', evaluar: c => c.catalogo.filter(p => p.activo && Number(p.stock) <= Number(p.stock_minimo)).slice(0, 3)
      .map(p => ({ nivel: 'alerta', texto: `Reponer ${p.nombre}: quedan ${formatear(p.stock, p.unidad)} (mínimo ${formatear(p.stock_minimo, p.unidad)}).` })) },
  { id: 'PRO-05', grafico: 'productos', evaluar: c => {
      if (c.periodo.dias < 14) return [];
      const vendidos = new Set(c.productos.map(p => p.id)), sin = c.catalogo.filter(p => p.activo && Number(p.stock) > 0 && !vendidos.has(p.id));
      return sin.length ? [{ nivel: 'info', texto: `${sin.length} producto${sin.length > 1 ? 's' : ''} activo${sin.length > 1 ? 's' : ''} no se vendió en este período (${lista(sin.map(p => p.nombre))}): evaluá una promoción o revisá su precio.` }] : []; } },
  // ---- Ganancia por producto ----
  { id: 'MAR-02', grafico: 'ganancia', evaluar: c => {
      if (!c.suficiente || !c.sinCosto.length) return [];
      const n = c.sinCosto.length, pl = n > 1 ? 's' : '';
      return [{ nivel: 'alerta', texto: `${n} producto${pl} vendido${pl} no tiene${pl ? 'n' : ''} costo cargado (${lista(c.sinCosto.map(p => p.nombre))}): ${c.costoConfiable ? 'esa parte de la ganancia puede estar sobreestimada' : 'la ganancia no es confiable'}. Cargá el costo en Productos o registrá una compra.` }]; } },
  { id: 'MAR-03', grafico: 'ganancia', evaluar: c => {
      const t = c.porGanancia[0];
      return c.suficiente && c.costoConfiable && t && t.costo > 0 && t.ganancia > 0 && c.actual.ganancia > 0
        ? [{ nivel: 'info', texto: `${t.nombre} es el producto que más ganancia dejó: ${dinero(t.ganancia)} (${pct(t.ganancia / c.actual.ganancia)} de la ganancia total).` }] : []; } },
  { id: 'MAR-04', grafico: 'ganancia', evaluar: c => {
      const p = c.productos.filter(x => x.costo > 0 && x.ganancia < 0);
      return p.length ? [{ nivel: 'alerta', texto: `Se vendió por debajo del costo: ${lista(p.map(x => x.nombre))}. Revisá el precio de venta.` }] : []; } },
  { id: 'MAR-05', grafico: 'ganancia', evaluar: c => c.productos.slice(0, 5).filter(p => p.costo > 0 && p.margen >= 0 && p.margen < 0.15).slice(0, 3)
      .map(p => ({ nivel: 'info', texto: `${p.nombre} deja solo ${pct(p.margen)} de margen: conviene revisar su precio o negociar su costo.` })) },
  // ---- Medios de pago ----
  { id: 'PAG-01', grafico: 'medios', evaluar: c => c.suficiente && c.medios.length ? [{ nivel: 'info', texto: `${c.medios[0].nombre} es el medio más usado: ${pct(c.medios[0].participacion)} de lo vendido.` }] : [] },
  { id: 'PAG-02', grafico: 'medios', evaluar: c => {
      const d = c.medios.find(m => m.medio === 'deuda');
      return c.suficiente && d && d.participacion > 0.1 ? [{ nivel: 'alerta', texto: `El ${pct(d.participacion)} de las ventas del período (${dinero(d.importe)}) quedó a deuda. Conviene cobrar pronto para no afectar la caja.` }] : []; } },
  { id: 'PAG-03', grafico: 'medios', evaluar: c => c.deudaClientes > 0
      ? [{ nivel: c.actual.importe > 0 && c.deudaClientes > c.actual.importe * 0.5 ? 'alerta' : 'info', texto: `Hoy los clientes deben en total ${dinero(c.deudaClientes)}.` }] : [] },
  // ---- Categorías ----
  { id: 'CAT-01', grafico: 'categorias', evaluar: c => c.suficiente && c.categorias.length >= 2
      ? [{ nivel: 'info', texto: `La categoría con más ingresos es ${c.categorias[0].nombre} (${pct(c.categorias[0].participacion)} del total).` }] : [] },
  { id: 'CAT-02', grafico: 'categorias', evaluar: c => {
      const bajas = c.categorias.filter(x => x.participacion < 0.05);
      return c.suficiente && c.categorias.length >= 3 && bajas.length ? [{ nivel: 'info', texto: `${lista(bajas.map(x => x.nombre))} aporta${bajas.length > 1 ? 'n' : ''} menos del 5% de los ingresos: podría convenir darle${bajas.length > 1 ? 's' : ''} más visibilidad o revisar si vale la pena mantener${bajas.length > 1 ? 'las' : 'la'}.` }] : []; } },
  // ---- Día de la semana ----
  { id: 'DIA-01', grafico: 'dias', evaluar: c => {
      const d = c.porDia.filter(x => x.ocurrencias > 0 && x.importe > 0);
      if (!c.suficiente || c.periodo.dias < 14 || d.length < 3) return [];
      const o = [...d].sort((a, b) => b.promedio - a.promedio), mejor = o[0], peor = o[o.length - 1];
      return [{ nivel: 'info', texto: `El día más fuerte es el ${mejor.nombre.toLowerCase()} (promedio ${dinero(mejor.promedio)}) y el más flojo es el ${peor.nombre.toLowerCase()} (${dinero(peor.promedio)}).` }]; } },
  { id: 'DIA-02', grafico: 'dias', evaluar: c => {
      const d = c.porDia.filter(x => x.ocurrencias > 0);
      if (!c.suficiente || c.periodo.dias < 14 || d.length < 3) return [];
      const o = [...d].sort((a, b) => b.promedio - a.promedio), mejor = o[0], peor = o[o.length - 1];
      return mejor.promedio > 0 && peor.promedio < mejor.promedio * 0.5 ? [{ nivel: 'alerta', texto: `El ${peor.nombre.toLowerCase()} vende menos de la mitad que el ${mejor.nombre.toLowerCase()}: podría convenir una promoción ese día y ajustar los pedidos de mercadería.` }] : []; } },
  // ---- Horarios ----
  { id: 'HOR-01', grafico: 'horas', evaluar: c => {
      const pico = [...c.porHora].sort((a, b) => b.cantidad - a.cantidad)[0];
      return c.suficiente && pico.cantidad > 0 ? [{ nivel: 'info', texto: `La franja más activa es de ${pico.hora} a ${pico.hora + 1} hs: concentra el ${pct(pico.participacion)} de las ventas. Conviene tener ahí el stock completo y personal disponible.` }] : []; } },
  { id: 'HOR-02', grafico: 'horas', evaluar: c => {
      const con = c.porHora.filter(h => h.cantidad > 0);
      if (!c.suficiente || con.length < 4) return [];
      const min = con[0].hora, max = con[con.length - 1].hora, corridas = []; let cur = [];
      for (let h = min; h <= max; h++) { if (c.porHora[h].participacion < 0.03) cur.push(h); else { if (cur.length >= 2) corridas.push(cur); cur = []; } }
      if (cur.length >= 2) corridas.push(cur);
      if (!corridas.length) return [];
      const m = corridas.sort((a, b) => b.length - a.length)[0];
      return [{ nivel: 'info', texto: `Entre las ${m[0]} y las ${m[m.length - 1] + 1} hs casi no hay ventas (menos del 3% por hora): es un buen momento para reponer mercadería o preparar pedidos.` }]; } },
];
export const REGLAS_DISPONIBLES = REGLAS.map(r => r.id);
export function explicar(ctx) {
  const salida = { resumen: [], evolucion: [], productos: [], ganancia: [], medios: [], categorias: [], dias: [], horas: [] };
  for (const r of REGLAS) for (const m of r.evaluar(ctx)) salida[r.grafico].push({ ...m, regla: r.id });
  return salida;
}
