import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { URL_SUPABASE, CLAVE_PUBLICA, NOMBRE_FUNCION } from '../configuracion.js';
export const bd = createClient(URL_SUPABASE, CLAVE_PUBLICA);
// Convierte la respuesta de Supabase en datos, o lanza un Error con el mensaje
export function extraer({ data, error }) { if (error) throw new Error(error.message); return data; }
// Llama a la función de Supabase indicada en NOMBRE_FUNCION (crear cuentas, cambiar contraseñas, iniciar sesión por usuario)
export async function invocarFuncion(cuerpo) {
  const { data, error } = await bd.functions.invoke(NOMBRE_FUNCION, { body: cuerpo });
  if (error) {
    let mensaje = error.message;
    try { mensaje = (await error.context.json()).error || mensaje; } catch { /* sin detalle */ }
    throw new Error(mensaje);
  }
  return data;
}
