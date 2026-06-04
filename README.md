# Pointly

Planning & pointage d'équipe pour PME.

## Stack
- React + Vite (frontend)
- Supabase (base de données, auth, realtime)
- Vercel (hébergement)

## Setup

### 1. Base de données Supabase
1. Va sur supabase.com → ton projet
2. SQL Editor → colle le contenu de `supabase_schema.sql` → Run

### 2. Variables d'environnement
Crée un fichier `.env` à la racine :
```
VITE_SUPABASE_URL=https://ton-projet.supabase.co
VITE_SUPABASE_ANON_KEY=ta-clé-anon
```

### 3. Développement local
```bash
npm install
npm run dev
```

### 4. Déploiement Vercel
1. Push le code sur GitHub
2. Vercel → New Project → Import depuis GitHub
3. Ajouter les variables d'environnement dans Vercel :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## Structure
```
src/
  hooks/useAuth.jsx     — authentification + profils
  lib/supabase.js       — client Supabase
  pages/
    Login.jsx
    Register.jsx
    admin/              — dashboard patron
    employee/           — app employé
  index.css             — design system complet
```
