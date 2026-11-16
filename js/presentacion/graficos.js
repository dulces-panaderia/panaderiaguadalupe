import { cargarLibreria, LIBRERIAS } from './librerias.js';
import { dinero } from './utilidades.js';
import { porcentaje } from '../negocio/formato.js';
const PALETA = ['#3a2218', '#b8466a', '#e29bb0', '#8a5a44', '#d9a46c', '#b9aea6', '#6b8f71', '#7aa0c4'];
const graficos = {};
const compacto = v => '$' + new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
const recortar = (t, n = 24) => t.length > n ? t.slice(0, n - 1) + '…' : t;
function crear(id, config, hayDatos) {
  const lienzo = document.getElementById(id), caja = lienzo.parentElement;
  graficos[id]?.destroy(); delete graficos[id];
  if (!hayDatos) { caja.dataset.vacio = '1'; return; }
  delete caja.dataset.vacio;
  graficos[id] = new window.Chart(lienzo, config);
}
export async function dibujarGraficos(ctx) {
  await cargarLibreria(LIBRERIAS.grafico);
  const C = window.Chart; C.defaults.font.family = "'DM Sans', system-ui, sans-serif"; C.defaults.color = '#85766d';
  const base = { responsive: true, maintainAspectRatio: false, animation: { duration: 350 } };
  const ejeDinero = { beginAtZero: true, ticks: { callback: compacto }, grid: { color: '#f1ebe6' } }, sinGrilla = { grid: { display: false } };
  const sinLeyenda = { legend: { display: false } };

  crear('g_evolucion', { type: 'bar', data: { labels: ctx.serie.map(s => s.etiqueta), datasets: [{ label: 'Ventas', data: ctx.serie.map(s => s.importe), backgroundColor: '#b8466a', borderRadius: 4, maxBarThickness: 38 }] },
    options: { ...base, plugins: { ...sinLeyenda, tooltip: { callbacks: { label: i => dinero(i.raw), afterLabel: i => `${ctx.serie[i.dataIndex].cantidad} ventas` } } }, scales: { y: ejeDinero, x: sinGrilla } } },
    ctx.serie.some(s => s.importe > 0));

  const top = ctx.productos.slice(0, 8);
  crear('g_productos', { type: 'bar', data: { labels: top.map(p => recortar(p.nombre)), datasets: [{ label: 'Importe', data: top.map(p => p.importe), backgroundColor: '#3a2218', borderRadius: 4, maxBarThickness: 22 }] },
    options: { ...base, indexAxis: 'y', plugins: { ...sinLeyenda, tooltip: { callbacks: { label: i => `${dinero(i.raw)} (${porcentaje(top[i.dataIndex].participacion, 1)})` } } }, scales: { x: ejeDinero, y: sinGrilla } } }, top.length > 0);

  crear('g_categorias', { type: 'doughnut', data: { labels: ctx.categorias.map(c => c.nombre), datasets: [{ data: ctx.categorias.map(c => c.importe), backgroundColor: ctx.categorias.map((_, i) => PALETA[i % PALETA.length]), borderWidth: 2, borderColor: '#fff' }] },
    options: { ...base, cutout: '58%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { callbacks: { label: i => `${i.label}: ${dinero(i.raw)} (${porcentaje(ctx.categorias[i.dataIndex].participacion, 1)})` } } } } }, ctx.categorias.length > 0);

  const gan = ctx.porGanancia.slice(0, 8);
  crear('g_ganancia', { type: 'bar', data: { labels: gan.map(p => recortar(p.nombre)), datasets: [{ label: 'Ganancia', data: gan.map(p => p.ganancia), backgroundColor: gan.map(p => p.costo === 0 ? '#b9aea6' : p.ganancia < 0 ? '#a63d3d' : '#6b8f71'), borderRadius: 4, maxBarThickness: 22 }] },
    options: { ...base, indexAxis: 'y', plugins: { ...sinLeyenda, tooltip: { callbacks: { label: i => `${dinero(i.raw)} (margen ${porcentaje(gan[i.dataIndex].margen, 0)})`, afterLabel: i => gan[i.dataIndex].costo === 0 ? 'Sin costo cargado: la ganancia no es real' : '' } } }, scales: { x: ejeDinero, y: sinGrilla } } }, gan.length > 0);

  crear('g_medios', { type: 'doughnut', data: { labels: ctx.medios.map(m => m.nombre), datasets: [{ data: ctx.medios.map(m => m.importe), backgroundColor: ctx.medios.map((_, i) => PALETA[i % PALETA.length]), borderWidth: 2, borderColor: '#fff' }] },
    options: { ...base, cutout: '58%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { callbacks: { label: i => `${i.label}: ${dinero(i.raw)} (${porcentaje(ctx.medios[i.dataIndex].participacion, 1)})` } } } } }, ctx.medios.length > 0);

  const prom = ctx.porDia.map(d => d.promedio), conVentas = ctx.porDia.filter(d => d.ocurrencias > 0 && d.importe > 0);
  const mejor = conVentas.length >= 3 ? ctx.porDia.indexOf([...conVentas].sort((a, b) => b.promedio - a.promedio)[0]) : -1;
  const peor = conVentas.length >= 3 ? ctx.porDia.indexOf([...conVentas].sort((a, b) => a.promedio - b.promedio)[0]) : -1;
  crear('g_dias', { type: 'bar', data: { labels: ctx.porDia.map(d => d.nombre.slice(0, 3)), datasets: [{ label: 'Promedio por día', data: prom, backgroundColor: prom.map((_, i) => i === mejor ? '#b8466a' : i === peor ? '#b9aea6' : '#3a2218'), borderRadius: 4, maxBarThickness: 38 }] },
    options: { ...base, plugins: { ...sinLeyenda, tooltip: { callbacks: { label: i => `Promedio: ${dinero(i.raw)}`, afterLabel: i => `${ctx.porDia[i.dataIndex].cantidad} ventas en total` } } }, scales: { y: ejeDinero, x: sinGrilla } } }, prom.some(v => v > 0));

  const horas = ctx.porHora.filter(h => h.cantidad > 0), desde = horas.length ? Math.max(0, horas[0].hora - 1) : 0, hasta = horas.length ? Math.min(23, horas[horas.length - 1].hora + 1) : 0;
  const rango = ctx.porHora.slice(desde, hasta + 1);
  crear('g_horas', { type: 'bar', data: { labels: rango.map(h => `${h.hora} h`), datasets: [{ label: 'Importe', data: rango.map(h => h.importe), backgroundColor: '#d9a46c', borderRadius: 4, maxBarThickness: 30 }] },
    options: { ...base, plugins: { ...sinLeyenda, tooltip: { callbacks: { label: i => dinero(i.raw), afterLabel: i => `${rango[i.dataIndex].cantidad} ventas` } } }, scales: { y: ejeDinero, x: sinGrilla } } }, horas.length > 0);
}
// Imágenes de los gráficos para incluirlas en el PDF
export const imagenes = () => Object.fromEntries(Object.entries(graficos).map(([id, g]) => [id, { url: g.toBase64Image('image/png', 1), ancho: g.width, alto: g.height }]));
