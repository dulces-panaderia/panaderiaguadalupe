import { normalizarTexto } from '../negocio/texto.js';
import { dinero, formatear } from '../negocio/formato.js';
export { normalizarTexto, dinero, formatear };
export const $ = id => document.getElementById(id);
export const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function mostrarMensaje(t, ok = true) {
  const m = $('mensaje'); m.textContent = t; m.className = ok ? 'exito' : 'error'; m.style.display = 'block';
  setTimeout(() => m.style.display = 'none', 4000);
}
// Ejecuta una acción y muestra el error de negocio/datos como mensaje
export const protegido = fn => async (...a) => { try { return await fn(...a); } catch (e) { mostrarMensaje(e.message, false); } };
// Delegación de eventos: cualquier [data-accion] dentro del contenedor dispara fn(acción, dataset, botón).
// El botón queda deshabilitado mientras se ejecuta: así un doble clic no duplica registros.
export const delegar = (el, fn) => el.addEventListener('click', async e => {
  const b = e.target.closest('[data-accion]'); if (!b || b.disabled) return;
  b.disabled = true;
  try { await protegido(fn)(b.dataset.accion, b.dataset, b); } finally { if (!b.hasAttribute('data-bloqueado')) b.disabled = false; }
});
// Etiqueta de color (estado, rol, etc.). La clase "e-<valor>" define el color en el CSS
export const etiqueta = (texto, clase = texto) => `<span class="etiqueta e-${escapar(clase)}">${escapar(texto)}</span>`;
// Deja vacíos los campos de un formulario (los desplegables vuelven a su primera opción)
export function limpiar(...ids) {
  ids.forEach(id => { const e = $(id); if (!e) return; if (e.tagName === 'SELECT') e.selectedIndex = 0; else e.value = ''; });
}
// Botones para cambiar de vista en una tabla. opciones: [{ id, texto, cuenta?, aparte? }]
export const selector = (opciones, activa, accion = 'vista') => opciones.map(o =>
  `<button class="chip ${o.id === activa ? 'activo' : ''} ${o.aparte ? 'aparte' : ''}" data-accion="${accion}" data-vista="${escapar(o.id)}">${escapar(o.texto)}${o.cuenta !== undefined ? ` <span class="cuenta">${o.cuenta}</span>` : ''}</button>`).join('');

// ----- Edición en línea (en lugar de ventanas emergentes del navegador) -----
// Convierte el contenedor en:  [campo(s)] [Guardar] [Cancelar]. Cada campo: { tipo: 'text'|'number'|'password'|'select', valor, paso, placeholder, opciones }
export function editarEnLinea(contenedor, { campos, valor = '', tipo = 'text', paso, placeholder = '', alGuardar, alCancelar }) {
  const lista = campos || [{ tipo, valor, paso, placeholder }];
  const control = c => c.tipo === 'select'
    ? `<select>${c.opciones.map(o => `<option value="${escapar(o.id)}" ${String(o.id) === String(c.valor) ? 'selected' : ''}>${escapar(o.texto)}</option>`).join('')}</select>`
    : `<input type="${c.tipo || 'text'}" ${c.paso ? `step="${c.paso}"` : ''} placeholder="${escapar(c.placeholder || '')}" value="${escapar(c.valor ?? '')}" autocomplete="off">`;
  contenedor.innerHTML = `<span class="enlinea">${lista.map(control).join('')}<button class="chico" data-en="guardar">Guardar</button><button class="chico secundario" data-en="cancelar">Cancelar</button></span>`;
  const controles = [...contenedor.querySelectorAll('input, select')], boton = contenedor.querySelector('[data-en="guardar"]'), guardar = protegido(() => alGuardar(...controles.map(c => c.value)));
  const ejecutar = async () => { if (boton.disabled) return; boton.disabled = true; try { await guardar(); } finally { boton.disabled = false; } };
  boton.onclick = ejecutar;
  contenedor.querySelector('[data-en="cancelar"]').onclick = () => alCancelar();
  controles.filter(c => c.tagName === 'INPUT').forEach(c => c.addEventListener('keydown', e => { if (e.key === 'Enter') ejecutar(); if (e.key === 'Escape') alCancelar(); }));
  const primero = controles.find(c => c.tagName === 'INPUT') || controles[0]; primero.focus(); primero.select?.();
}
// Convierte el contenedor en:  ¿Pregunta?  [Confirmar] [Volver]
export function confirmarEnLinea(contenedor, texto, { textoBoton = 'Confirmar', alConfirmar, alCancelar }) {
  contenedor.innerHTML = `<span class="enlinea"><small>${escapar(texto)}</small><button class="chico peligro" data-en="si">${escapar(textoBoton)}</button><button class="chico secundario" data-en="no">Volver</button></span>`;
  const si = contenedor.querySelector('[data-en="si"]'), ok = protegido(() => alConfirmar());
  si.onclick = async () => { if (si.disabled) return; si.disabled = true; try { await ok(); } finally { si.disabled = false; } };
  contenedor.querySelector('[data-en="no"]').onclick = () => alCancelar();
}
