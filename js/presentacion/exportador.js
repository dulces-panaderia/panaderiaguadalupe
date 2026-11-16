import { cargarLibreria, LIBRERIAS } from './librerias.js';
import { dinero, formatear, porcentaje, fechaCorta } from '../negocio/formato.js';
import { nombreMedio } from '../negocio/pagos.js';
export const celda = (v, tipo) => v == null ? '' : tipo === 'dinero' ? dinero(v) : tipo === 'porcentaje' ? porcentaje(v, 1) : tipo === 'numero' ? Number(v).toLocaleString('es-AR', { maximumFractionDigits: 3 }) : String(v);
const archivo = (inf, ext) => `Reporte_ventas_${inf.periodo.replace(/[^0-9]+/g, '-').replace(/^-|-$/g, '')}.${ext}`;
// [clave de explicaciones, título, gráfico]
export const GRUPOS = [['resumen', 'Interpretación general', null], ['evolucion', 'Evolución de las ventas', 'g_evolucion'], ['productos', 'Productos más vendidos', 'g_productos'], ['ganancia', 'Ganancia por producto', 'g_ganancia'], ['medios', 'Medios de pago', 'g_medios'],
  ['categorias', 'Ventas por categoría', 'g_categorias'], ['dias', 'Ventas por día de la semana', 'g_dias'], ['horas', 'Ventas por hora', 'g_horas']];
async function imagenComoDatos(ruta) {
  const r = await fetch(ruta); if (!r.ok) throw new Error('sin imagen'); const b = await r.blob();
  return new Promise((ok, mal) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = mal; l.readAsDataURL(b); });
}

export async function exportarPDF(inf, imgs = {}) {
  await cargarLibreria(LIBRERIAS.pdf); await cargarLibreria(LIBRERIAS.tabla);
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), M = 15, ANCHO = 180;
  let y = 16;
  const asegurar = alto => { if (y + alto > 280) { doc.addPage(); y = 16; } };
  const parrafo = (texto, { tam = 10, estilo = 'normal', color = [43, 31, 25], sangria = 0, paso = 5 } = {}) => {
    doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...color);
    const lineas = doc.splitTextToSize(texto, ANCHO - sangria); asegurar(lineas.length * paso); doc.text(lineas, M + sangria, y + 3); y += lineas.length * paso;
  };
  const titulo = texto => { asegurar(14); y += 3; parrafo(texto, { tam: 13, estilo: 'bold', color: [58, 34, 24], paso: 7 }); };
  const tabla = (columnas, filas) => { doc.autoTable({ startY: y, head: [columnas.map(c => c.texto)], body: filas, theme: 'striped', margin: { left: M, right: M },
    styles: { fontSize: columnas.length > 7 ? 7 : 8.5, cellPadding: 2, textColor: [43, 31, 25] }, headStyles: { fillColor: [58, 34, 24], textColor: 255 }, alternateRowStyles: { fillColor: [250, 246, 243] },
    columnStyles: Object.fromEntries(columnas.map((c, i) => [i, { halign: c.tipo === 'texto' ? 'left' : 'right' }])) }); y = doc.lastAutoTable.finalY + 6; };

  try { doc.addImage(await imagenComoDatos('img/logo.png'), 'PNG', M, y - 4, 20, 20); } catch { /* sin logo */ }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(58, 34, 24); doc.text('Panadería Guadalupe', M + 24, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(133, 118, 109); doc.text(inf.titulo, M + 24, y + 11);
  doc.setFontSize(9); doc.text(`${inf.subtitulo}   |   Generado el ${fechaCorta(new Date())}`, M + 24, y + 16);
  y += 26;

  titulo('Indicadores');
  tabla([{ texto: 'Indicador', tipo: 'texto' }, { texto: 'Período actual', tipo: 'numero' }, { texto: 'Período anterior', tipo: 'numero' }, { texto: 'Variación', tipo: 'numero' }],
    inf.kpis.map(k => [k.etiqueta, celda(k.valor, k.tipo), celda(k.anterior, k.tipo), k.variacion == null ? '-' : (k.variacion > 0 ? '+' : '') + porcentaje(k.variacion, 1)]));

  for (const [clave, texto, grafico] of GRUPOS) {
    const img = grafico && imgs[grafico]; let w = 170, h = 0;
    if (img) { h = w * img.alto / img.ancho; if (h > 80) { h = 80; w = h * img.ancho / img.alto; } }
    asegurar(h + 30);   // el título nunca queda solo al final de una página
    titulo(texto);
    if (img) { doc.addImage(img.url, 'PNG', M, y, w, h); y += h + 4; }
    const lista = inf.explicaciones[clave] || [];
    if (!lista.length) parrafo('Sin observaciones.', { tam: 9.5, color: [133, 118, 109] });
    lista.forEach(m => parrafo('- ' + m.texto, { tam: 9.5, sangria: 3, color: m.nivel === 'alerta' ? [166, 61, 61] : m.nivel === 'bien' ? [42, 109, 70] : [43, 31, 25] }));
  }
  inf.tablas.forEach(t => { titulo('Detalle: ' + t.nombre); tabla(t.columnas, t.filas.map(f => f.map((v, i) => celda(v, t.columnas[i].tipo)))); });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(133, 118, 109); doc.text(`Panadería Guadalupe   |   Página ${i} de ${n}`, 105, 290, { align: 'center' }); }
  doc.save(archivo(inf, 'pdf'));
}

const FORMATO_EXCEL = { dinero: '"$"#,##0.00', numero: '#,##0.###', porcentaje: '0.0%' };
export async function exportarExcel(inf) {
  await cargarLibreria(LIBRERIAS.excel);
  const X = window.XLSX, libro = X.utils.book_new();
  const formato = (hoja, fila, col, tipo) => { const c = hoja[X.utils.encode_cell({ r: fila, c: col })]; if (c && typeof c.v === 'number' && FORMATO_EXCEL[tipo]) c.z = FORMATO_EXCEL[tipo]; };
  // Hoja de resumen: indicadores + interpretación del sistema experto
  const filas = [['Panadería Guadalupe'], [inf.titulo], [inf.subtitulo], ['Generado el', fechaCorta(new Date())], [], ['Indicador', 'Período actual', 'Período anterior', 'Variación']];
  const inicio = filas.length; inf.kpis.forEach(k => filas.push([k.etiqueta, k.valor, k.anterior, k.variacion]));
  filas.push([]); filas.push(['Interpretación del sistema experto']);
  GRUPOS.forEach(([clave, texto]) => { const l = inf.explicaciones[clave] || []; if (!l.length) return; filas.push([]); filas.push([texto]); l.forEach(m => filas.push([`${m.texto} (${m.regla})`])); });
  const hoja = X.utils.aoa_to_sheet(filas); hoja['!cols'] = [{ wch: 34 }, { wch: 20 }, { wch: 20 }, { wch: 14 }];
  inf.kpis.forEach((k, i) => { formato(hoja, inicio + i, 1, k.tipo); formato(hoja, inicio + i, 2, k.tipo); formato(hoja, inicio + i, 3, 'porcentaje'); });
  X.utils.book_append_sheet(libro, hoja, 'Resumen');
  // Una hoja por tabla, con números reales (se pueden ordenar, filtrar y sumar)
  inf.tablas.forEach(t => {
    const h = X.utils.aoa_to_sheet([t.columnas.map(c => c.texto), ...t.filas]);
    h['!cols'] = t.columnas.map(c => ({ wch: c.tipo === 'texto' ? 26 : 16 }));
    t.filas.forEach((_, f) => t.columnas.forEach((c, i) => formato(h, f + 1, i, c.tipo)));
    X.utils.book_append_sheet(libro, h, t.nombre.slice(0, 31));
  });
  X.writeFile(libro, archivo(inf, 'xlsx'));
}

// ===================== Comprobante de venta (PDF tipo ticket de 80 mm y Excel) =====================
const nombreArchivoCmp = (c, ext) => `Comprobante_${String(c.codigo).replace(/[^\w-]+/g, '_')}.${ext}`;
const deudaDe = c => (c.pagos || []).filter(p => p.medio === 'deuda').reduce((s, p) => s + Number(p.monto), 0);

export async function exportarComprobantePDF(c) {
  await cargarLibreria(LIBRERIAS.pdf); await cargarLibreria(LIBRERIAS.tabla);
  let logo = null; try { logo = await imagenComoDatos('img/logo.png'); } catch { /* sin logo */ }
  const ANCHO = 80, M = 5, W = ANCHO - 2 * M, deuda = deudaDe(c);
  // El ticket no tiene alto fijo: se dibuja una vez para medir y otra con el alto exacto
  const armar = alto => {
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: [ANCHO, alto] });
    let y = 6;
    const texto = (t, { tam = 9, estilo = 'normal', alinear = 'center' } = {}) => {
      doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(0);
      doc.splitTextToSize(String(t), W).forEach(l => { doc.text(l, alinear === 'center' ? ANCHO / 2 : M, y + 3, { align: alinear }); y += tam * 0.5; });
    };
    const par = (a, b, { estilo = 'normal', tam = 8.5 } = {}) => {
      doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(0);
      const lineas = doc.splitTextToSize(String(b), W - 24);
      doc.text(String(a), M, y + 3); lineas.forEach((l, i) => doc.text(l, ANCHO - M, y + 3 + i * 4, { align: 'right' })); y += Math.max(1, lineas.length) * 4;
    };
    const raya = () => { doc.setLineDashPattern([0.8, 0.8], 0); doc.setDrawColor(0); doc.line(M, y + 1, ANCHO - M, y + 1); doc.setLineDashPattern([], 0); y += 3; };
    const recuadro = (t, tam = 7.5) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(tam); doc.setTextColor(0);
      const ls = doc.splitTextToSize(t, W - 4), h = ls.length * 3.6 + 2; doc.setLineWidth(0.2); doc.rect(M, y, W, h);
      ls.forEach((l, i) => doc.text(l, ANCHO / 2, y + 3.6 + i * 3.6, { align: 'center' })); y += h + 3;
    };
    if (logo) { doc.addImage(logo, 'PNG', ANCHO / 2 - 7, y, 14, 14); y += 16; }
    texto('Panadería Guadalupe', { tam: 12, estilo: 'bold' }); y += 1;
    recuadro('COMPROBANTE NO FISCAL - No válido como factura', 7);
    if (c.estado === 'cancelada') recuadro('VENTA CANCELADA', 9);
    par('Comprobante', c.codigo); par('Fecha', new Date(c.fecha).toLocaleString('es-AR'));
    if (c.vendedor) par('Atendió', c.vendedor);
    if (c.cliente) par('Cliente', c.cliente.nombre);
    if (c.tipo_entrega === 'delivery') { par('Entrega', 'Delivery'); if (c.direccion) par('Dirección', c.direccion); if (c.repartidor) par('Repartidor', c.repartidor); }
    y += 1;
    doc.autoTable({ startY: y, head: [['Detalle', 'Cant.', 'Importe']], theme: 'plain', margin: { left: M, right: M, top: 0, bottom: 0 }, tableWidth: W,
      body: c.items.map(i => [`${i.nombre}\n${dinero(i.precio)} / ${i.unidad === 'kg' ? 'kg' : 'u'}`, formatear(i.cantidad, i.unidad), dinero(i.subtotal)]),
      styles: { fontSize: 7.5, cellPadding: { top: 1, bottom: 1, left: 0.5, right: 0.5 }, textColor: 0 }, headStyles: { fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 36 }, 1: { halign: 'right', cellWidth: 14 }, 2: { halign: 'right', cellWidth: 20 } } });
    y = doc.lastAutoTable.finalY + 1;
    if (Number(c.costo_envio) > 0) par('Costo de envío', dinero(c.costo_envio));
    raya(); par('TOTAL', dinero(c.total), { estilo: 'bold', tam: 10 }); raya();
    if ((c.pagos || []).length) { texto('Forma de pago', { tam: 8.5, estilo: 'bold', alinear: 'left' }); c.pagos.forEach(p => par(nombreMedio(p.medio), dinero(p.monto))); }
    if (deuda > 0) { y += 2; recuadro(`Queda a cuenta: ${dinero(deuda)}${c.cliente ? `\nSaldo total del cliente: ${dinero(c.saldo_cliente)}` : ''}`, 7.5); }
    if (c.contra_entrega && !c.cobrada_en) { y += 2; recuadro(`Pago contra entrega: ${dinero(c.total)} en efectivo, se cobra al delivery`, 7.5); }
    y += 3; texto('¡Gracias por su compra!', { tam: 8.5 });
    return { doc, y };
  };
  const medida = armar(1000);
  armar(medida.y + 6).doc.save(nombreArchivoCmp(c, 'pdf'));
}

export async function exportarComprobanteExcel(c) {
  await cargarLibreria(LIBRERIAS.excel);
  const X = window.XLSX, libro = X.utils.book_new(), deuda = deudaDe(c), marcas = [];   // marcas: celdas numéricas a formatear [fila, columna, tipo]
  const filas = [['Panadería Guadalupe'], ['COMPROBANTE NO FISCAL - No válido como factura'], c.estado === 'cancelada' ? ['VENTA CANCELADA'] : null, [],
    ['Comprobante', c.codigo], ['Fecha', new Date(c.fecha).toLocaleString('es-AR')], c.vendedor ? ['Atendió', c.vendedor] : null, c.cliente ? ['Cliente', c.cliente.nombre] : null,
    ['Entrega', c.tipo_entrega === 'delivery' ? 'Delivery' : 'Mostrador'], c.tipo_entrega === 'delivery' && c.direccion ? ['Dirección', c.direccion] : null, c.tipo_entrega === 'delivery' && c.repartidor ? ['Repartidor', c.repartidor] : null, []].filter(Boolean);
  filas.push(['Detalle', 'Unidad', 'Cantidad', 'Precio unitario', 'Subtotal']);
  c.items.forEach(i => { marcas.push([filas.length, 2, 'numero'], [filas.length, 3, 'dinero'], [filas.length, 4, 'dinero']); filas.push([i.nombre, i.unidad === 'kg' ? 'kg' : 'u', Number(i.cantidad), Number(i.precio), Number(i.subtotal)]); });
  filas.push([]);
  if (Number(c.costo_envio) > 0) { marcas.push([filas.length, 4, 'dinero']); filas.push(['', '', '', 'Costo de envío', Number(c.costo_envio)]); }
  marcas.push([filas.length, 4, 'dinero']); filas.push(['', '', '', 'TOTAL', Number(c.total)]);
  if ((c.pagos || []).length) filas.push([], ['Forma de pago', 'Monto']);
  (c.pagos || []).forEach(p => { marcas.push([filas.length, 1, 'dinero']); filas.push([nombreMedio(p.medio), Number(p.monto)]); });
  if (c.contra_entrega && !c.cobrada_en) { filas.push([]); marcas.push([filas.length, 1, 'dinero']); filas.push(['Contra entrega: se cobra en efectivo al delivery', Number(c.total)]); }
  if (deuda > 0) { filas.push([]); marcas.push([filas.length, 1, 'dinero']); filas.push(['Queda a cuenta', deuda]);
    if (c.cliente) { marcas.push([filas.length, 1, 'dinero']); filas.push(['Saldo total del cliente', Number(c.saldo_cliente)]); } }
  const hoja = X.utils.aoa_to_sheet(filas); hoja['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];
  marcas.forEach(([f, col, tipo]) => { const celdaX = hoja[X.utils.encode_cell({ r: f, c: col })]; if (celdaX && typeof celdaX.v === 'number') celdaX.z = FORMATO_EXCEL[tipo]; });
  X.utils.book_append_sheet(libro, hoja, 'Comprobante');
  X.writeFile(libro, nombreArchivoCmp(c, 'xlsx'));
}
