export const dinero = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatear = (n, u) => `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${u === 'kg' ? 'kg' : 'u'}`;
export const porcentaje = (x, decimales = 0) => (x * 100).toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) + '%';
export const fechaCorta = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
// Duración legible a partir de milisegundos: "35 min", "1 h 05 min"; vacío si no hay dato
export const duracion = ms => { if (!(ms >= 0)) return ''; const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
