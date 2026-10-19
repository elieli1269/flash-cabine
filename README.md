# Flash Cabine

Photomaton webcam : aperçu en direct, filtres, compte à rebours, téléchargement des clichés, ruban de prises récentes et basculement de caméra.

## Application bureau (Windows)

1. Ouvrez [Actions](../../actions) → workflow **Exécutable Windows**.
2. Cliquez **Run workflow** (onglet Actions, bouton à droite).
3. À la fin du job, téléchargez l’artefact **FlashCabine-Windows** :
   - `FlashCabine-1.0.0.exe` — portable, sans installation
   - `FlashCabine-Setup-1.0.0.exe` — installateur

Une étiquette `v1.0.0` publie aussi les fichiers sur la [page Releases](../../releases).

## Développement local

```bash
npm install
npm start
```

Nécessite Node 22+ et une webcam.
