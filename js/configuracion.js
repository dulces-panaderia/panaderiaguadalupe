// Credenciales públicas de Supabase (la clave "anon" es pública por diseño; la seguridad la dan las políticas RLS).
export const URL_SUPABASE = 'https://bubrgpycbiwgcomcxbfq.supabase.co';
export const CLAVE_PUBLICA = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1YnJncHljYml3Z2NvbWN4YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5Nzk0NjIsImV4cCI6MjEwOTU1NTQ2Mn0.hRJRa1mfIVe5fMSTg3cUwfpCRbMQnZLZADEzCU_BhvY';

// Nombre EXACTO con el que publicaste la función en Supabase > Edge Functions (se ve en su dirección: .../functions/v1/<nombre>)
export const NOMBRE_FUNCION = 'empleado';

// Los nombres de usuario se convierten internamente en un correo con este formato: base+usuario@dominio
// (así Supabase Auth funciona sin pedirle un email real a cada empleado). Usá un correo tuyo real.
export const CORREO_BASE = 'dulcesupirospanaderia@gmail.com';
