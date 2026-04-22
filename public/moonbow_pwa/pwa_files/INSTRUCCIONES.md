# PWA Moonbow — Instrucciones de instalación

## Estructura de archivos a agregar

```
tu-proyecto/
├── public/
│   ├── manifest.json          ← copiar manifest.json
│   ├── sw.js                  ← copiar sw.js
│   └── icons/                 ← crear esta carpeta
│       ├── icon-192x192.png
│       ├── icon-192x192-maskable.png
│       ├── icon-512x512.png
│       ├── icon-512x512-maskable.png
│       ├── apple-touch-icon.png
│       ├── favicon-32x32.png
│       └── favicon-16x16.png
│
├── app/
│   └── layout.tsx             ← reemplazar con layout.tsx (App Router)
│
│   — O —
│
├── pages/
│   └── _document.tsx          ← reemplazar con _document.tsx (Pages Router)
```

## ¿Cómo saber qué Router tienes?

- Si en tu proyecto existe una carpeta `/app` → **App Router** → usa `layout.tsx`
- Si existe una carpeta `/pages` → **Pages Router** → usa `_document.tsx`

## Pasos

1. Pega `manifest.json` y `sw.js` en `/public/`
2. Crea la carpeta `/public/icons/` y pega los 7 íconos
3. Reemplaza tu `layout.tsx` o `_document.tsx` según corresponda
   - Si ya tienes un layout existente, solo copia las partes del `<head>` y el script del service worker
4. Haz deploy en Vercel

## Verificar que funciona

1. Abre https://tarjeta-fidelidad.vercel.app/fidelizacion en Chrome móvil
2. Menú (⋮) → "Añadir a pantalla de inicio"
3. En iPhone: Safari → botón compartir → "Agregar a pantalla de inicio"

## HTTPS obligatorio

El service worker solo funciona en HTTPS. Vercel lo maneja automáticamente ✅
