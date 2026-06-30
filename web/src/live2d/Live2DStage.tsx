import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { AVATARS, type AvatarDef } from './avatars';
import { recolorTexture, loadImage } from './recolor';

/**
 * A self-contained Live2D (Cubism 4) avatar canvas. Renders the chosen avatar
 * (Aria/Noah) and animates it from the LIVE conversation:
 *   - lip-sync: the model's mouth param is driven by `amplitudeRef` (Nicole's
 *     voice amplitude), smoothed so the mouth swells, never jitters.
 *   - blink: only while speaking (held open + occasional blink); still when quiet.
 *   - idle vs talking: frozen + expressionless when quiet; soft gesture + physics
 *     while speaking.
 *   - WARDROBE: the model's hair/outfit textures are recolored IN-BROWSER at load
 *     to the user-chosen colors (see recolor.ts), so the avatar is customizable.
 *
 * Everything is dynamically imported and fully guarded — if Cubism Core is missing
 * or the model fails to load, this renders an empty canvas and never throws.
 */
export interface Live2DStageProps {
  /** Live voice amplitude (0..~0.5), read every frame for lip-sync. */
  amplitudeRef: React.MutableRefObject<number>;
  /** True while Nicole is speaking (drives idle ↔ gesture). */
  speakingRef: React.MutableRefObject<boolean>;
  /** Which avatar to render. */
  avatarId?: 'aria' | 'noah' | 'natori';
  /** Per-element wardrobe colors: { hair, top, collar, sleeves, skirt, tights }. */
  colors?: Record<string, string>;
  className?: string;
}

/** Monotonic ms (local copy so this module is self-contained). */
function perfNow2(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
}

/** Dir of a model3.json path (for resolving its texture files). */
function modelDir(modelPath: string): string {
  return modelPath.slice(0, modelPath.lastIndexOf('/') + 1);
}

/**
 * Apply the chosen per-element colors to an ALREADY-LOADED model's textures,
 * in place (no reload). Used both at first load and when the user changes a
 * color in settings. Swaps the recolored canvases onto live2dModel.textures and
 * drops the renderer's cached GL textures so they re-bind next frame.
 */
async function applyWardrobe(
  PIXI: any,
  live2dModel: any,
  avatar: AvatarDef,
  colors: Record<string, string>,
  isDisposed: () => boolean,
): Promise<void> {
  const anyColor = avatar.elements.some((e) => colors[e.id]);
  // No recolor profile (e.g. the natori prospect) → nothing to recolor.
  if (!anyColor || !live2dModel || !avatar.profile) return;
  const profile = avatar.profile;
  const dir = modelDir(avatar.model);
  const texList: any[] = live2dModel.textures;
  await Promise.all(
    avatar.textures.map(async (t, idx) => {
      const els = t.elements.filter((e) => colors[e]);
      if (els.length === 0) return;
      const srcImg = await loadImage(dir + t.original);
      if (isDisposed()) return;
      const canvas = recolorTexture(srcImg, profile, t.elements, colors);
      const tex = PIXI.Texture.from(canvas);
      if (texList && texList[idx]) {
        const old = texList[idx];
        texList[idx] = tex;
        try { old.destroy?.(true); } catch { /* ignore */ }
      }
    }),
  );
  try {
    const rend: any = live2dModel.internalModel?.renderer;
    if (rend?._textures) rend._textures.length = 0;
  } catch { /* ignore */ }
}

export function Live2DStage({ amplitudeRef, speakingRef, avatarId = 'aria', colors = {}, className }: Live2DStageProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const avatar: AvatarDef = AVATARS[avatarId];
  const MOUTH_PARAM = avatar.mouthParam;
  // Blink params differ across Cubism exports; default to the old PARAM_* naming.
  const EYE_L = avatar.eyeParams?.left ?? 'PARAM_EYE_L_OPEN';
  const EYE_R = avatar.eyeParams?.right ?? 'PARAM_EYE_R_OPEN';
  const model = avatar.model;
  // Color signature drives an in-place re-recolor effect (no reload).
  const colorSig = JSON.stringify(colors);
  // Live handles so the color-change effect can re-recolor the loaded model.
  const pixiRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  // ── LOAD effect: builds the app + loads the model. Re-runs only when the
  //    AVATAR (model) changes — NOT on color change (that's handled below). ──
  useEffect(() => {
    let disposed = false;
    // Hold references so cleanup can tear everything down even if we unmount
    // mid-load.
    let app: any = null;
    let live2dModel: any = null;
    let rafBound: ((t: number) => void) | null = null;

    async function boot() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Cubism Core must be present (loaded via the <script> in index.html).
      if (!(window as any).Live2DCubismCore) {
        // Give the deferred script a moment, then bail quietly if still absent.
        await new Promise((r) => setTimeout(r, 400));
        if (!(window as any).Live2DCubismCore) return;
      }

      let PIXI: any;
      let Live2DModel: any;
      try {
        PIXI = await import('pixi.js');
        // pixi-live2d-display needs PIXI on window for its plugin registration.
        (window as any).PIXI = PIXI;
        const mod = await import('pixi-live2d-display/cubism4');
        Live2DModel = mod.Live2DModel;
        // Wire PIXI's ticker so motions/physics/auto-blink update.
        Live2DModel.registerTicker(PIXI.Ticker);
        // GLOBALLY silence the library's sound system so the model's bundled demo
        // .wav clips can never play — Nicole is the only voice. (This is the real
        // mute: pixi-live2d-display routes motion audio through SoundManager.)
        try {
          if (mod.SoundManager) {
            mod.SoundManager.volume = 0;
            if (typeof mod.SoundManager.destroy === 'function') {
              // no-op; volume 0 is enough and keeps the manager intact
            }
          }
        } catch { /* ignore */ }
      } catch {
        return; // deps unavailable — render nothing, never break the page
      }
      if (disposed) return;

      try {
        app = new PIXI.Application({
          view: canvas,
          autoStart: true,
          backgroundAlpha: 0, // transparent — she sits over the page
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          // NOTE: no resizeTo — we size the renderer explicitly in fit() from the
          // parent box (driven by ResizeObserver + rAF), which avoids the 0×0
          // initial-mount race that left her invisible until a window resize.
        });

        // DISABLE PIXI'S POINTER HIT-TESTING. We never need interaction (the
        // canvas is click-through). pixi-live2d-display 0.4 attaches an old-API
        // model that PIXI 7's EventSystem chokes on during hit-testing
        // ("currentTarget.isInteractive is not a function" spamming on every
        // pointermove). Making the whole stage non-interactive (eventMode 'none'
        // + no interactive children) means the EventSystem's hit-test walk never
        // descends into the Live2D model, so the error never fires. We do NOT
        // null the renderer's events DOM element (that breaks PIXI internals).
        try {
          app.stage.eventMode = 'none';
          app.stage.interactiveChildren = false;
        } catch { /* ignore — never fatal */ }

        live2dModel = await Live2DModel.from(model, {
          motionPreload: 'NONE',
          // No auto-idle motion group: when Nicole isn't speaking, Izumi stands
          // quietly (expressionless), not cycling gestures.
          idleMotionGroup: 'None',
          // CRITICAL: pixi-live2d-display 0.4 calls renderer.plugins.interaction
          // which PIXI 7 removed (→ "manager.on is not a function", crashing the
          // render loop so nothing draws). We don't need pointer interaction (the
          // overlay is click-through), so disable it entirely.
          autoInteract: false,
        });
        if (disposed) { live2dModel.destroy?.(); return; }
        // Belt-and-suspenders: ensure no pointer interaction is attempted.
        try { live2dModel.interactive = false; live2dModel.interactiveChildren = false; } catch { /* ignore */ }

        // Expose handles so the color-change effect can re-recolor in place.
        pixiRef.current = PIXI;
        modelRef.current = live2dModel;

        // ── WARDROBE: recolor each element to the chosen color (initial) ──
        try { await applyWardrobe(PIXI, live2dModel, avatar, colorsRef.current, () => disposed); } catch { /* best-effort */ }
        if (disposed) { live2dModel.destroy?.(); return; }

        // Stop any auto-idle motion the runtime may have started — she rests
        // quietly until Nicole speaks. (Sound is globally muted via SoundManager
        // volume=0 above, so even gesture motions are silent.)
        try { live2dModel.internalModel.motionManager?.stopAllMotions?.(); } catch { /* ignore */ }

        app.stage.addChild(live2dModel);

        // Frame the FULL BODY: scale so the whole model fits inside the canvas
        // (whichever axis is tighter), centred. No upper-body crop.
        const fit = () => {
          if (!app?.renderer || !live2dModel) return;
          const parent = canvas.parentElement;
          // Explicitly size the renderer to the PARENT box. PIXI's resizeTo only
          // tracks window resizes, so on initial mount the renderer can stay 0×0
          // until a window resize — that's why she was invisible until inspect.
          // Measuring + resizing here (driven by ResizeObserver + rAF) fixes it.
          const w = parent?.clientWidth || (app.renderer.width / app.renderer.resolution);
          const h = parent?.clientHeight || (app.renderer.height / app.renderer.resolution);
          if (w === 0 || h === 0) return; // not laid out yet — retried below
          if (app.renderer.width / app.renderer.resolution !== w ||
              app.renderer.height / app.renderer.resolution !== h) {
            try { app.renderer.resize(w, h); } catch { /* ignore */ }
          }
          const mh = live2dModel.internalModel.height || 1;
          const mw = live2dModel.internalModel.width || 1;
          // Fit her ENTIRE rigged form within the box (whichever axis is tighter),
          // with a little headroom. Positioned a bit LOWER in the box.
          const scale = Math.min(w / mw, h / mh) * 0.95;
          live2dModel.scale.set(scale);
          live2dModel.anchor.set(0.5, 0.5);
          live2dModel.position.set(w / 2, h * 0.6); // lower than centre
        };
        fit();
        // The box may not be measured on the first synchronous pass (or while
        // briefly hidden), so retry on the next frames + on resize.
        requestAnimationFrame(fit);
        setTimeout(fit, 60);
        const ro = new ResizeObserver(fit);
        if (canvas.parentElement) ro.observe(canvas.parentElement);

        const coreModel = live2dModel.internalModel.coreModel;
        // Neutral, expressionless resting face.
        try { live2dModel.expression?.('Normal'); } catch { /* optional */ }

        // ── Aliveness gating: she is FROZEN when Nicole is not speaking and only
        // animates (breath, hair physics, blink, lip-sync, gestures) while she
        // speaks. We take over the update loop: disable the library's auto-update
        // + auto-blink, then update manually only when speaking.
        live2dModel.autoUpdate = false;
        try {
          // Disable auto-blink so she doesn't blink while resting.
          if (live2dModel.internalModel) live2dModel.internalModel.eyeBlink = undefined;
        } catch { /* ignore */ }

        let mouth = 0;          // smoothed mouth-open value
        let blinkPhase = -1;    // <0 = eyes open; >=0 = mid-blink progress (speaking only)
        let nextBlinkAt = 0;

        // Resolve the part indices to force-hide each frame (e.g. Noah's extra
        // crossed-arm set, which otherwise renders as "four hands").
        const hidePartIdx: number[] = [];
        if (avatar.hideParts?.length) {
          try {
            const pc = coreModel.getPartCount?.() ?? 0;
            for (let i = 0; i < pc; i++) {
              const id: string = coreModel.getPartId?.(i) ?? '';
              if (avatar.hideParts.some((h) => id.includes(h))) hidePartIdx.push(i);
            }
          } catch { /* ignore */ }
        }
        const applyHidden = () => {
          for (const idx of hidePartIdx) {
            try { coreModel.setPartOpacityByIndex(idx, 0); } catch { /* ignore */ }
          }
        };

        rafBound = (_t: number) => {
          if (!live2dModel) return;
          const speaking = speakingRef.current;
          const dt = app.ticker.deltaMS;

          if (speaking) {
            // Advance the rig (breath, hair sway, physics, motion) only now.
            try { live2dModel.update(dt); } catch { /* ignore */ }
            // Lip-sync from Nicole's live amplitude. Snap OPEN fast on a syllable
            // onset (attack 0.6) but CLOSE a bit slower (0.3) so the mouth tracks
            // her voice crisply without flickering shut between sounds.
            const target = Math.min(1, Math.max(0, amplitudeRef.current * 9));
            mouth += (target - mouth) * (target > mouth ? 0.6 : 0.3);
            try { coreModel.setParameterValueById(MOUTH_PARAM, mouth); } catch { /* ignore */ }
            // Blink occasionally WHILE speaking.
            const now = perfNow2();
            if (blinkPhase < 0 && now > nextBlinkAt) blinkPhase = 0;
            if (blinkPhase >= 0) {
              blinkPhase += dt / 120; // ~120ms close+open
              const open = blinkPhase < 1 ? Math.abs(1 - 2 * blinkPhase) : 1; // V-shape
              try {
                coreModel.setParameterValueById(EYE_L, open);
                coreModel.setParameterValueById(EYE_R, open);
              } catch { /* ignore */ }
              if (blinkPhase >= 1) { blinkPhase = -1; nextBlinkAt = now + 2500 + Math.floor(open * 2000); }
            }
          } else {
            // RESTING: hold a still, neutral, eyes-open pose. No update() call, so
            // breath/hair/physics are frozen — she simply stands there.
            mouth += (0 - mouth) * 0.4;
            try {
              coreModel.setParameterValueById(MOUTH_PARAM, mouth);
              coreModel.setParameterValueById(EYE_L, 1);
              coreModel.setParameterValueById(EYE_R, 1);
            } catch { /* ignore */ }
            // Push the held parameters to the rig without advancing time-based
            // motion/physics: a zero-delta update applies our param writes only.
            try { live2dModel.update(0); } catch { /* ignore */ }
          }
          // AFTER update() recomputes opacities, force the hidden parts back to 0
          // so they never reappear (this is what kills the "four hands").
          applyHidden();
        };
        app.ticker.add(rafBound);

        // A single soft gesture each time Nicole STARTS speaking (silent). When
        // she's quiet, no motion plays — she just stands there.
        const gestureTimer = setInterval(() => {
          if (disposed || !live2dModel) return;
          const speaking = speakingRef.current;
          if (speaking && !(live2dModel as any).__gesturing) {
            (live2dModel as any).__gesturing = true;
            // priority 3 = FORCE; sound is already neutralized above.
            try { live2dModel.motion('Tap', undefined, 3); } catch { /* ignore */ }
          } else if (!speaking) {
            (live2dModel as any).__gesturing = false;
          }
        }, 500);

        // Stash for cleanup.
        (live2dModel as any).__ro = ro;
        (live2dModel as any).__idleTimer = gestureTimer;
      } catch {
        // Model failed to load — leave the canvas empty, app cleaned up below.
        try { app?.destroy?.(true); } catch { /* ignore */ }
        app = null;
      }
    }

    void boot();

    return () => {
      disposed = true;
      pixiRef.current = null;
      modelRef.current = null;
      try {
        if (live2dModel) {
          clearInterval((live2dModel as any).__idleTimer);
          (live2dModel as any).__ro?.disconnect?.();
          if (rafBound && app?.ticker) app.ticker.remove(rafBound);
        }
        app?.destroy?.(true, { children: true, texture: true, baseTexture: true });
      } catch { /* best-effort teardown */ }
      app = null;
      live2dModel = null;
    };
    // Reload ONLY when the avatar (model) changes — colors are applied in place
    // by the separate effect below, so we don't tear down on a color tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, amplitudeRef, speakingRef]);

  // ── COLOR effect: re-recolor the already-loaded model IN PLACE when the user
  //    changes a wardrobe color. No reload — instant preview update. ──
  useEffect(() => {
    let cancelled = false;
    const PIXI = pixiRef.current;
    const m = modelRef.current;
    if (!PIXI || !m) return; // model not loaded yet; the LOAD effect colors it
    void applyWardrobe(PIXI, m, avatar, colors, () => cancelled);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorSig]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

export default Live2DStage;
