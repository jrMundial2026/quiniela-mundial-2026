# Quiniela del Mundial

Panel para tabla pública y administración.

Ver en linea -> https://jrmundial2026.github.io/quiniela-mundial-2026/#/tabla

## Pronósticos

En esta versión los pronósticos se capturan como resultado simple:

- Gana local
- Empate
- Gana visita

Los puntos se asignan con 1 punto por acertar el resultado.

## Supabase

1. Crea un proyecto en Supabase.
2. Copia la `Project URL` y la `Publishable key`.
3. Crea un archivo `.env` en la raíz del proyecto:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxxx
```

4. Ejecuta el SQL de `supabase/schema.sql` en el editor de Supabase.
5. Crea un usuario en `Authentication` para el acceso a `/admin`.

## Desarrollo local

```bash
npm install
npm run dev
```
