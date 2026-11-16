// Librerías externas (versiones fijas). Se descargan solo cuando se necesitan: gráficos al abrir el Panel, PDF/Excel al exportar.
export const LIBRERIAS = {
  grafico: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.js',
  pdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  tabla: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  excel: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
};
const cargadas = new Map();
export function cargarLibreria(url) {
  if (!cargadas.has(url)) cargadas.set(url, new Promise((ok, mal) => {
    const s = document.createElement('script'); s.src = url; s.onload = ok;
    s.onerror = () => { cargadas.delete(url); mal(new Error('No se pudo cargar una librería externa. Revisá tu conexión a internet.')); };
    document.head.appendChild(s);
  }));
  return cargadas.get(url);
}
