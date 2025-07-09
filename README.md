# PodClip Monorepo

## Estructura

- `frontend/` → React + Vite
- `backend/` → Express.js

## Cómo ejecutar

1. Abre dos terminales.
2. En la primera:
   ```bash
   cd backend
   npm install
   sudo apt-get update && sudo apt-get install -y ffmpeg
   node server.js
   ```
3. En la segunda:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
