# Flash Cabine

Photomaton webcam : aperçu en direct, filtres, compte à rebours, téléchargement des clichés, ruban de prises récentes et basculement de caméra.

## Application bureau (Windows)

1. Ouvrez [Actions](../../actions) → workflow **Exécutable Windows**.
2. Cliquez **Run workflow** (bouton à droite).
3. À la fin du job, téléchargez l’artefact **FlashCabine-Windows** :
   - `FlashCabine-1.0.0.exe` — portable, sans installation
   - `FlashCabine-Setup-1.0.0.exe` — installateur

## Application Android (APK)

1. Ouvrez [Actions](../../actions) → workflow **APK Android**.
2. Cliquez **Run workflow**.
3. Téléchargez l’artefact **FlashCabine-Android** :
   - `FlashCabine-1.0.0-debug.apk` — installable directement (debug)

Sur le téléphone : activez « Sources inconnues » / installation d’apps externes, puis ouvrez l’APK. Accordez la permission **Caméra** au premier lancement.

Une étiquette `v1.0.0` publie aussi les fichiers Windows + Android sur la [page Releases](../../releases).

## Développement local

### Windows (Electron)

```bash
npm install
npm start
```

Nécessite Node 22+ et une webcam.

### Android (Capacitor)

```bash
npm install
npx cap add android   # une seule fois
npx cap sync android
npx cap open android  # ouvre Android Studio
```

Dans Android Studio : Run ▶ sur un appareil ou émulateur.

Les permissions caméra sont ajoutées automatiquement par le workflow CI.
