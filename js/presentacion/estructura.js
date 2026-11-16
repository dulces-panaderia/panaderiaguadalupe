import { ServicioAutenticacion } from '../negocio/servicioAutenticacion.js';
import { $, escapar, protegido, etiqueta } from './utilidades.js';
const vistas = {};
export const registrar = (nombre, vista) => { vistas[nombre] = vista; };
export function mostrar(n) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('activo', b.dataset.t === n));
  document.querySelectorAll('section').forEach(s => s.classList.toggle('activo', s.id === 's_' + n));
  protegido(() => vistas[n]?.dibujar())();
}
async function ingresar() {
  const boton = $('btnIngresar'); boton.disabled = true; $('loginErr').textContent = '';
  try { await ServicioAutenticacion.ingresar($('usuario').value, $('clave').value); }
  catch (e) { $('loginErr').textContent = e.message; }
  finally { boton.disabled = false; }
}
export function iniciar() {
  $('btnIngresar').onclick = ingresar;
  ['usuario', 'clave'].forEach(i => $(i).addEventListener('keydown', e => { if (e.key === 'Enter') ingresar(); }));
  $('btnSalir').onclick = () => ServicioAutenticacion.salir();
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => mostrar(b.dataset.t));
  ServicioAutenticacion.alCambiarSesion(u => {
    $('login').style.display = u ? 'none' : 'flex'; $('app').style.display = u ? 'block' : 'none';
    if (!u) { $('clave').value = ''; return; }
    $('quien').innerHTML = `${escapar(u.nombre)} ${etiqueta(u.rol)}`;
    document.querySelectorAll('nav button').forEach(b => b.style.display = u.pestanas.includes(b.dataset.t) ? '' : 'none');
    mostrar(u.pestanas[0]);
  });
}
