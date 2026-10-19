/* Flash Cabine — vanilla photobooth */
(function () {
  "use strict";

  const FILTERS = [
    { id: "none", label: "Naturel", css: "none", vignette: false, grain: false, swatch: "#f4ead8" },
    { id: "warm", label: "Chaud", css: "sepia(0.25) saturate(1.2) contrast(1.05)", vignette: false, grain: false, swatch: "#f0c27b" },
    { id: "cool", label: "Froid", css: "saturate(0.85) hue-rotate(195deg) brightness(1.05)", vignette: false, grain: false, swatch: "#9ec3d8" },
    { id: "mono", label: "N&B", css: "grayscale(1) contrast(1.1)", vignette: false, grain: false, swatch: "#cfcfcf" },
    { id: "vintage", label: "Vintage", css: "sepia(0.45) contrast(1.05) brightness(0.95)", vignette: true, grain: true, swatch: "#d4a574" },
    { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.35) brightness(0.9)", vignette: true, grain: true, swatch: "#5a5a5a" },
    { id: "pop", label: "Pop", css: "saturate(1.6) contrast(1.15)", vignette: false, grain: false, swatch: "#ff6b9d" },
  ];

  const STORAGE_KEY = "flash-cabine-shots";
  const PREFS_KEY = "flash-cabine-prefs";
  const MAX_SHOTS = 24;

  const $ = (id) => document.getElementById(id);

  const video = $("video");
  const statusPill = $("status-pill");
  const statusLabel = $("status-label");
  const statePanel = $("state-panel");
  const stateIcon = $("state-icon");
  const stateTitle = $("state-title");
  const stateBody = $("state-body");
  const btnOpen = $("btn-open");
  const liveBadge = $("live-badge");
  const vignetteEl = $("vignette");
  const grainEl = $("grain");
  const flashEl = $("flash");
  const countdownUi = $("countdown-ui");
  const countNum = $("count-num");
  const ring = $("ring");
  const btnCancel = $("btn-cancel");
  const btnShutter = $("btn-shutter");
  const btnMirror = $("btn-mirror");
  const btnSound = $("btn-sound");
  const btnSwitch = $("btn-switch");
  const btnClear = $("btn-clear");
  const notice = $("notice");
  const filtersEl = $("filters");
  const stripEl = $("strip");
  const galleryMeta = $("gallery-meta");
  const lightbox = $("lightbox");
  const lightboxImg = $("lightbox-img");
  const btnDownload = $("btn-download");
  const btnDelete = $("btn-delete");
  const btnClose = $("btn-close");

  let stream = null;
  let devices = [];
  let currentDeviceId = null;
  let facingMode = "user";
  let status = "closed"; // closed | requesting | live | denied | error
  let mode = "photo"; // photo | strip
  let delay = 3;
  let filterId = "none";
  let mirror = true;
  let soundOn = true;
  let shooting = false;
  let cancelShoot = false;
  let shots = [];
  let activeShotId = null;
  let audioCtx = null;

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (typeof p.mirror === "boolean") mirror = p.mirror;
      if (typeof p.soundOn === "boolean") soundOn = p.soundOn;
      if (p.mode === "photo" || p.mode === "strip") mode = p.mode;
      if ([0, 3, 5].includes(p.delay)) delay = p.delay;
      if (FILTERS.some((f) => f.id === p.filterId)) filterId = p.filterId;
    } catch {}
  }

  function savePrefs() {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ mirror, soundOn, mode, delay, filterId })
      );
    } catch {}
  }

  function loadShots() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) shots = arr.slice(0, MAX_SHOTS);
    } catch {}
  }

  function saveShots() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shots.slice(0, MAX_SHOTS)));
    } catch {}
  }

  function currentFilter() {
    return FILTERS.find((f) => f.id === filterId) || FILTERS[0];
  }

  function setStatus(next, label) {
    status = next;
    statusPill.classList.toggle("live", next === "live");
    statusPill.classList.toggle("alert", next === "denied" || next === "error");
    statusLabel.textContent = label;
  }

  function showState(icon, title, body, btnText) {
    statePanel.hidden = false;
    stateIcon.textContent = icon;
    stateTitle.textContent = title;
    stateBody.textContent = body;
    btnOpen.textContent = btnText || "Autoriser la caméra";
    btnOpen.hidden = false;
    video.classList.remove("live");
    liveBadge.hidden = true;
    btnShutter.disabled = true;
  }

  function hideState() {
    statePanel.hidden = true;
  }

  function applyFilterPreview() {
    const f = currentFilter();
    video.style.filter = f.css === "none" ? "" : f.css;
    vignetteEl.hidden = !f.vignette;
    grainEl.hidden = !f.grain;
  }

  function applyMirror() {
    video.classList.toggle("mirror", mirror);
    btnMirror.classList.toggle("active", mirror);
    btnMirror.setAttribute("aria-pressed", String(mirror));
  }

  function applySoundBtn() {
    btnSound.classList.toggle("active", soundOn);
    btnSound.setAttribute("aria-pressed", String(soundOn));
  }

  function beep(freq, dur, type) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur);
    } catch {}
  }

  function shutterClick() {
    beep(880, 0.06, "square");
    setTimeout(() => beep(440, 0.08, "square"), 40);
  }

  function tickSound() {
    beep(660, 0.05, "triangle");
  }

  async function listDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      devices = all.filter((d) => d.kind === "videoinput");
      btnSwitch.disabled = devices.length < 2 || status !== "live";
    } catch {
      devices = [];
      btnSwitch.disabled = true;
    }
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
  }

  async function startCamera(opts) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("error", "Non supporté");
      showState("!", "Caméra indisponible", "Ce navigateur ou cet environnement ne permet pas d’accéder à la caméra.", "Réessayer");
      return;
    }

    setStatus("requesting", "Ouverture…");
    showState("◎", "Ouverture de l’objectif", "Autorisez l’accès à la caméra si demandé.", "…");
    btnOpen.hidden = true;

    stopStream();

    const constraints = {
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 960 },
        facingMode: opts && opts.facingMode ? opts.facingMode : facingMode,
      },
    };
    if (opts && opts.deviceId) {
      constraints.video = {
        width: { ideal: 1280 },
        height: { ideal: 960 },
        deviceId: { exact: opts.deviceId },
      };
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      await video.play();

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings ? track.getSettings() : {};
      if (settings.deviceId) currentDeviceId = settings.deviceId;
      if (settings.facingMode) facingMode = settings.facingMode;

      setStatus("live", "En direct");
      hideState();
      video.classList.add("live");
      liveBadge.hidden = false;
      btnShutter.disabled = false;
      notice.textContent = "Prêt — souriez et déclenchez.";
      applyFilterPreview();
      applyMirror();
      await listDevices();
    } catch (err) {
      const name = (err && err.name) || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setStatus("denied", "Refusé");
        showState(
          "🔒",
          "Accès refusé",
          "Autorisez la caméra dans les paramètres du navigateur ou de Windows, puis réessayez.",
          "Réessayer"
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setStatus("error", "Aucune caméra");
        showState("📷", "Aucune caméra", "Branchez une webcam ou activez la caméra intégrée.", "Réessayer");
      } else {
        setStatus("error", "Erreur");
        showState("!", "Impossible d’ouvrir", (err && err.message) || "Erreur inconnue.", "Réessayer");
      }
      notice.textContent = "Le déclencheur s’allume une fois la caméra en direct.";
    }
  }

  function coverRect(sw, sh, dw, dh) {
    const scale = Math.max(dw / sw, dh / sh);
    const w = sw * scale;
    const h = sh * scale;
    return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
  }

  function captureFrame() {
    const f = currentFilter();
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const outW = 720;
    const outH = 960;
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#1c1612";
    ctx.fillRect(0, 0, outW, outH);

    ctx.save();
    if (mirror) {
      ctx.translate(outW, 0);
      ctx.scale(-1, 1);
    }
    if (f.css !== "none") ctx.filter = f.css;
    const r = coverRect(vw, vh, outW, outH);
    ctx.drawImage(video, r.x, r.y, r.w, r.h);
    ctx.restore();

    if (f.vignette) {
      const g = ctx.createRadialGradient(outW / 2, outH / 2, outW * 0.2, outW / 2, outH / 2, outW * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, outW, outH);
    }

    if (f.grain) {
      const id = ctx.getImageData(0, 0, outW, outH);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 28;
        d[i] = Math.min(255, Math.max(0, d[i] + n));
        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
      }
      ctx.putImageData(id, 0, 0);
    }

    return canvas;
  }

  function composeStrip(frames) {
    const gap = 12;
    const pad = 16;
    const sprocket = 18;
    const fw = frames[0].width;
    const fh = frames[0].height;
    const thumbH = Math.round(fh * 0.28);
    const thumbW = Math.round((fw / fh) * thumbH);
    const canvas = document.createElement("canvas");
    canvas.width = thumbW + pad * 2 + sprocket * 2;
    canvas.height = pad * 2 + frames.length * thumbH + (frames.length - 1) * gap;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#f4ead8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // sprockets
    ctx.fillStyle = "#1c1612";
    const holes = 8;
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? 6 : canvas.width - 12;
      for (let i = 0; i < holes; i++) {
        const y = pad + (i / (holes - 1)) * (canvas.height - pad * 2 - 8);
        ctx.beginPath();
        ctx.arc(x + 3, y + 4, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    frames.forEach((c, i) => {
      const y = pad + i * (thumbH + gap);
      ctx.drawImage(c, pad + sprocket, y, thumbW, thumbH);
    });

    return canvas;
  }

  function makeThumb(dataUrl, isStrip) {
    return { dataUrl, isStrip: !!isStrip };
  }

  function downloadUrl(dataUrl, name) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function addShot(dataUrl, isStrip) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    shots.unshift({ id, dataUrl, isStrip: !!isStrip, ts: Date.now() });
    if (shots.length > MAX_SHOTS) shots = shots.slice(0, MAX_SHOTS);
    saveShots();
    renderGallery();
  }

  function renderGallery() {
    stripEl.innerHTML = "";
    if (!shots.length) {
      const p = document.createElement("p");
      p.className = "strip-empty";
      p.textContent = "Aucune prise pour l’instant.";
      stripEl.appendChild(p);
      btnClear.hidden = true;
      galleryMeta.textContent = "Les prises récentes s’alignent ici.";
      return;
    }
    btnClear.hidden = false;
    galleryMeta.textContent =
      shots.length === 1 ? "1 cliché dans le ruban." : shots.length + " clichés dans le ruban.";

    shots.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "thumb" + (s.isStrip ? " strip" : "");
      btn.title = "Voir";
      const img = document.createElement("img");
      img.src = s.dataUrl;
      img.alt = "Cliché";
      btn.appendChild(img);
      btn.addEventListener("click", () => openLightbox(s.id));
      stripEl.appendChild(btn);
    });
  }

  function openLightbox(id) {
    const s = shots.find((x) => x.id === id);
    if (!s) return;
    activeShotId = id;
    lightboxImg.src = s.dataUrl;
    lightboxImg.alt = "Aperçu";
    if (typeof lightbox.showModal === "function") lightbox.showModal();
    else lightbox.setAttribute("open", "");
  }

  function closeLightbox() {
    activeShotId = null;
    if (typeof lightbox.close === "function") lightbox.close();
    else lightbox.removeAttribute("open");
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function runCountdown(seconds) {
    if (seconds <= 0) return true;
    cancelShoot = false;
    countdownUi.hidden = false;
    for (let n = seconds; n >= 1; n--) {
      if (cancelShoot) {
        countdownUi.hidden = true;
        return false;
      }
      countNum.textContent = String(n);
      ring.style.animation = "none";
      void ring.offsetWidth;
      ring.style.animation = "";
      tickSound();
      await sleep(1000);
    }
    countdownUi.hidden = true;
    return !cancelShoot;
  }

  async function doShoot() {
    if (status !== "live" || shooting) return;
    shooting = true;
    btnShutter.disabled = true;
    notice.textContent = mode === "strip" ? "Planche en cours…" : "Capture…";

    const ok = await runCountdown(delay);
    if (!ok) {
      shooting = false;
      btnShutter.disabled = status !== "live";
      notice.textContent = "Annulé.";
      return;
    }

    if (mode === "photo") {
      flashEl.hidden = false;
      shutterClick();
      const canvas = captureFrame();
      setTimeout(() => {
        flashEl.hidden = true;
      }, 420);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      addShot(dataUrl, false);
      notice.textContent = "Cliché ajouté au ruban.";
    } else {
      const frames = [];
      for (let i = 0; i < 4; i++) {
        if (cancelShoot) break;
        flashEl.hidden = false;
        shutterClick();
        frames.push(captureFrame());
        setTimeout(() => {
          flashEl.hidden = true;
        }, 300);
        if (i < 3) {
          const cont = await runCountdown(Math.max(1, delay || 2));
          if (!cont) break;
        }
      }
      if (frames.length === 4) {
        const strip = composeStrip(frames);
        addShot(strip.toDataURL("image/jpeg", 0.92), true);
        notice.textContent = "Planche ×4 ajoutée.";
      } else {
        notice.textContent = "Planche interrompue.";
      }
    }

    shooting = false;
    btnShutter.disabled = status !== "live";
  }

  function renderFilters() {
    filtersEl.innerHTML = "";
    FILTERS.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-btn" + (f.id === filterId ? " active" : "");
      btn.dataset.filter = f.id;
      const sw = document.createElement("span");
      sw.className = "filter-swatch";
      sw.style.background = f.swatch;
      sw.style.filter = f.css === "none" ? "" : f.css;
      btn.appendChild(sw);
      const lab = document.createElement("span");
      lab.textContent = f.label;
      btn.appendChild(lab);
      btn.addEventListener("click", () => {
        filterId = f.id;
        document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        applyFilterPreview();
        savePrefs();
      });
      filtersEl.appendChild(btn);
    });
  }

  function bindModeChips() {
    document.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
      btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
      btn.addEventListener("click", () => {
        mode = btn.dataset.mode;
        document.querySelectorAll("[data-mode]").forEach((b) => {
          const on = b.dataset.mode === mode;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", String(on));
        });
        savePrefs();
      });
    });
  }

  function bindDelayChips() {
    document.querySelectorAll("[data-delay]").forEach((btn) => {
      const d = Number(btn.dataset.delay);
      btn.classList.toggle("active", d === delay);
      btn.setAttribute("aria-pressed", String(d === delay));
      btn.addEventListener("click", () => {
        delay = d;
        document.querySelectorAll("[data-delay]").forEach((b) => {
          const on = Number(b.dataset.delay) === delay;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", String(on));
        });
        savePrefs();
      });
    });
  }

  // Events
  btnOpen.addEventListener("click", () => startCamera());
  btnShutter.addEventListener("click", () => doShoot());
  btnCancel.addEventListener("click", () => {
    cancelShoot = true;
  });
  btnMirror.addEventListener("click", () => {
    mirror = !mirror;
    applyMirror();
    savePrefs();
  });
  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    applySoundBtn();
    savePrefs();
  });
  btnSwitch.addEventListener("click", async () => {
    if (devices.length < 2 || status !== "live") return;
    const idx = devices.findIndex((d) => d.deviceId === currentDeviceId);
    const next = devices[(idx + 1) % devices.length];
    await startCamera({ deviceId: next.deviceId });
  });
  btnClear.addEventListener("click", () => {
    if (!confirm("Vider tout le ruban ?")) return;
    shots = [];
    saveShots();
    renderGallery();
    closeLightbox();
  });
  btnDownload.addEventListener("click", () => {
    const s = shots.find((x) => x.id === activeShotId);
    if (!s) return;
    const name = "flash-cabine-" + (s.isStrip ? "planche-" : "") + s.id + ".jpg";
    downloadUrl(s.dataUrl, name);
  });
  btnDelete.addEventListener("click", () => {
    shots = shots.filter((x) => x.id !== activeShotId);
    saveShots();
    renderGallery();
    closeLightbox();
  });
  btnClose.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (shooting) cancelShoot = true;
      else closeLightbox();
    }
    if (e.key === " " || e.code === "Space") {
      if (status === "live" && !shooting && document.activeElement === document.body) {
        e.preventDefault();
        doShoot();
      }
    }
  });

  // Init
  loadPrefs();
  loadShots();
  renderFilters();
  bindModeChips();
  bindDelayChips();
  applyMirror();
  applySoundBtn();
  renderGallery();
  setStatus("closed", "Objectif fermé");
  showState(
    "◎",
    "Objectif fermé",
    "Ouvrez la cabine pour voir l’aperçu en direct. Rien n’est envoyé : les clichés restent sur cet appareil.",
    "Autoriser la caméra"
  );

  // Auto-try if already granted (optional, silent fail)
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions
      .query({ name: "camera" })
      .then((r) => {
        if (r.state === "granted") startCamera();
      })
      .catch(() => {});
  }
})();
