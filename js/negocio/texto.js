// Para buscar sin importar mayúsculas ni tildes
export const normalizarTexto = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// true si la búsqueda está vacía o aparece en alguno de los campos
export const coincide = (busqueda, ...campos) => {
  const q = normalizarTexto(String(busqueda || '').trim());
  return !q || normalizarTexto(campos.join(' ')).includes(q);
};
// Convierte lo que se escribe en un campo ("1500", "1500,50") en número; NaN si no es válido o está vacío
export const aNumero = t => { const s = String(t ?? '').trim().replace(',', '.'); return s === '' ? NaN : Number(s); };
