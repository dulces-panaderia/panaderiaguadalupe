import { bd, extraer, invocarFuncion } from './clienteSupabase.js';
export const RepositorioEmpleados = {
  listar: async () => extraer(await bd.from('perfiles').select('*').order('nombre')),
  actualizar: async (id, campos) => extraer(await bd.from('perfiles').update(campos).eq('id', id)),
  crear: cuerpo => invocarFuncion({ accion: 'crear', ...cuerpo }),
  cambiarClave: (id, password) => invocarFuncion({ accion: 'clave', id, password }),
};
