# Taf' 💸 – version iPhone (web app)

Taf' est une **web app installable**, aussi appelée PWA. On l'ajoute à l'écran d'accueil de l'iPhone depuis Safari et elle s'ouvre ensuite en plein écran, avec son icône, comme une vraie app.
Elle fonctionne **hors connexion** et toutes les données restent **sur l'iPhone**.
Pas besoin de Mac, d'App Store ni de compte développeur Apple.

## 1. Mettre les fichiers en ligne (une seule fois, ~10 min)
Il faut juste héberger ce dossier sur une adresse **https**. Le site ne sert que le code de l'appli : aucune donnée n'y est envoyée.

### Option A – GitHub Pages (gratuit, recommandé)
1. Créer un compte sur https://github.com (gratuit).
2. Cliquer sur **New repository**, lui donner le nom `taf`, le laisser **Public**, puis **Create**.
3. Cliquer sur **uploading an existing file** et glisser **tout le contenu** de ce dossier : `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `jspdf.umd.min.js` et le dossier `icons`. Valider avec **Commit changes**.
4. Aller dans **Settings › Pages**. Dans *Branch*, choisir `main` puis `/ (root)`, et cliquer sur **Save**.
5. Après 1 à 2 minutes, l'appli est en ligne à l'adresse `https://TON-PSEUDO.github.io/taf/`.

### Option B – Netlify (glisser-déposer)
Sur https://app.netlify.com/drop, glisser le dossier `TafWeb`. Il faut créer un compte gratuit pour que le site reste en ligne.

## 2. Installer sur l'iPhone de ton fils
1. Ouvrir l'adresse dans **Safari**.
2. Toucher le bouton **Partager** (le carré avec une flèche).
3. Choisir **« Sur l'écran d'accueil »** puis **Ajouter**. Vérifier que **« Ouvrir en tant qu'app web »** est activé.
4. Lancer **Taf'** depuis l'écran d'accueil.

## ⚠️ À savoir
- Les données sont liées à l'icône installée. **Si on supprime l'icône Taf' de l'écran d'accueil, les données sont effacées.**
- C'est pour ça qu'il y a **Export › Sauvegarde** : elle crée un fichier `.json` à ranger dans *Fichiers* ou *iCloud Drive*. **Restaurer** recharge ce fichier, par exemple sur un nouveau téléphone.
- Les exports PDF et CSV passent par le menu de partage d'iOS : WhatsApp, Mail, Fichiers…

## Mettre à jour l'appli
Remplacer les fichiers sur GitHub et changer `VERSION` dans `sw.js` (par ex. `taf-v1.0.1`). L'iPhone récupère la nouvelle version au lancement suivant, avec une connexion internet. Les données sont conservées.

## Contenu
| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page |
| `styles.css` | Design (mode sombre automatique) |
| `app.js` | Toute la logique : employeurs, chrono, calendrier, paie, export |
| `sw.js` | Fonctionnement hors connexion |
| `manifest.webmanifest` + `icons/` | Installation sur l'écran d'accueil |
| `jspdf.umd.min.js` | Bibliothèque de génération PDF (licence MIT, voir `jspdf.LICENSE.txt`) |
