import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Bee scene: loaded on demand from index.html once the first text is visible.
export function startBee({ sections, prefersReducedMotion, BEE_GLB, WING_TEX }) {
    /* =====================================================================
       5b. MODEL VISIBILITY
       ===================================================================== */
    function showBee(modelSuccess = false) {
      if (modelSuccess) document.getElementById('bee')?.classList.add('ready');
    }

    /* =====================================================================
       5c. THREE.JS SCENE SETUP
       ===================================================================== */
    const canvas = document.getElementById('bee');
    let renderer, scene, camera, flight, beeRoot, holder;
    let flapGroups = [];
    let isModelReady = false;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;

      scene = new THREE.Scene();

      // Studio environment
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();

      camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.set(0, 0, 10);

      // Lights
      const hemiLight = new THREE.HemisphereLight(0xf2eeff, 0x7a62c9, 1.3);
      scene.add(hemiLight);

      const dirLight1 = new THREE.DirectionalLight(0xfff1d6, 2.6);
      dirLight1.position.set(3, 5, 6);
      scene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0xc8b8ff, 2.2);
      dirLight2.position.set(-5, 2, -4);
      scene.add(dirLight2);

      // Hierarchy: scene > flight > beeRoot > holder + wing groups
      flight = new THREE.Group();
      scene.add(flight);

      beeRoot = new THREE.Group();
      flight.add(beeRoot);

      holder = new THREE.Group();
      beeRoot.add(holder);

    } catch (err) {
      console.warn("WebGL initialization failed:", err);
      showBee(false);
    }

    /* =====================================================================
       5f. KEYFRAMES & SCROLL-DRIVEN PATH
       ===================================================================== */
    const KEYFRAMES_DESKTOP = [
      { x: -0.03, y: -0.12, s: 1.00, yaw: 150, pitch: 6,  roll: -4 }, // hero
      { x: -0.30, y: -0.04, s: 1.00, yaw: 125, pitch: 10, roll:  6 }, // 01
      { x:  0.22, y: -0.30, s: 1.00, yaw:  40, pitch: -6, roll: -8 }, // 02
      { x: -0.22, y:  0.02, s: 0.96, yaw: 160, pitch:  8, roll:  4 }, // 03
      { x: -0.30, y: -0.42, s: 0.85, yaw:  60, pitch:  4, roll: -3 }, // 04
      { x: -0.30, y: -0.30, s: 0.90, yaw: 140, pitch:  6, roll:  4 }, // 05
      { x:  0.02, y: -0.08, s: 0.92, yaw: 105, pitch:  4, roll:  0 }  // footer
    ];

    const KEYFRAMES_MOBILE = [
      { x:  0.05, y: -0.02, s: 0.75, yaw: 150, pitch:  6, roll: -4 },
      { x:  0.10, y:  0.12, s: 0.80, yaw: 125, pitch: 10, roll:  6 },
      { x:  0.15, y: -0.20, s: 0.75, yaw:  40, pitch: -6, roll: -8 },
      { x:  0.25, y:  0.20, s: 0.72, yaw: 160, pitch:  8, roll:  4 },
      { x:  0.28, y:  0.30, s: 0.60, yaw:  60, pitch:  4, roll: -3 },
      { x: -0.25, y:  0.25, s: 0.60, yaw: 140, pitch:  6, roll:  4 },
      { x:  0.00, y:  0.10, s: 0.70, yaw: 105, pitch:  4, roll:  0 }
    ];

    function ease(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function lerpAngle(a, b, t) {
      const d = ((b - a + 540) % 360) - 180;
      return a + d * t;
    }

    function lerp(a, b, w) {
      return a + (b - a) * w;
    }

    function clamp(v, min, max) {
      return Math.min(max, Math.max(min, v));
    }

    function getScrollProgress(K) {
      const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      const n = sections.length;
      if (n <= 1) return 0;

      for (let i = 0; i < n - 1; i++) {
        const topI = sections[i].offsetTop;
        const topNext = sections[i + 1].offsetTop;
        if (scrollY >= topI && scrollY < topNext) {
          const denom = topNext - topI;
          const frac = denom > 0 ? (scrollY - topI) / denom : 0;
          const p = i + frac;
          return clamp(isFinite(p) ? p : 0, 0, K.length - 1);
        }
      }
      return K.length - 1;
    }

    function targetAt(p, K) {
      const i = Math.min(K.length - 2, Math.floor(p));
      const f = p - i;
      const t = ease(clamp(f, 0, 1));
      const dive = Math.sin(t * Math.PI) * -0.22;
      const k0 = K[i];
      const k1 = K[i + 1];

      return {
        x: lerp(k0.x, k1.x, t),
        y: lerp(k0.y, k1.y, t) + dive,
        s: lerp(k0.s, k1.s, t) * (1 + Math.sin(t * Math.PI) * 0.12),
        yaw: lerpAngle(k0.yaw, k1.yaw, t),
        pitch: lerp(k0.pitch, k1.pitch, t),
        roll: lerp(k0.roll, k1.roll, t),
        moving: Math.sin(t * Math.PI)
      };
    }

    /* =====================================================================
       5d & 5e. MODEL LOAD & PROCEDURAL WINGS
       ===================================================================== */
    function buildWings(wingTexture, anchor) {
      function createWingGeometry(span) {
        const geom = new THREE.PlaneGeometry(span, span * 9 / 16);
        geom.translate(span / 2 - span * 0.03, 0, 0); // hinge at root
        geom.rotateX(-Math.PI / 2);                  // flat
        geom.rotateY(-Math.PI / 2);                  // span points along +Z
        return geom;
      }

      const wingsDef = [
        { span: 0.72, sweep: -0.42, phase: 0, lift: 0.02 },     // forewing
        { span: 0.52, sweep: -0.95, phase: -0.5, lift: -0.01 }  // hindwing
      ];

      const ghostLayers = [
        { phaseOffset: 0, opacity: 0.95 },
        { phaseOffset: 0.55, opacity: 0.28 },
        { phaseOffset: -0.55, opacity: 0.28 }
      ];

      function buildWingSide(isLeft) {
        const sideGroup = new THREE.Group();
        // Right side at +anchor.z, Left side mirrored at -anchor.z
        sideGroup.position.set(anchor.x, anchor.y, isLeft ? -anchor.z : anchor.z);
        if (isLeft) {
          sideGroup.scale.z = -1; // mirror
        }

        wingsDef.forEach(wing => {
          const sweepGroup = new THREE.Group();
          sweepGroup.rotation.y = wing.sweep;
          sweepGroup.position.y = wing.lift;

          ghostLayers.forEach(ghost => {
            const flapGroup = new THREE.Group();
            const mat = new THREE.MeshBasicMaterial({
              map: wingTexture,
              transparent: true,
              opacity: ghost.opacity,
              side: THREE.DoubleSide,
              depthWrite: false,
              color: 0xffffff,
              blending: THREE.NormalBlending
            });
            const mesh = new THREE.Mesh(createWingGeometry(wing.span), mat);
            mesh.frustumCulled = false;
            flapGroup.add(mesh);
            sweepGroup.add(flapGroup);

            flapGroups.push({
              group: flapGroup,
              phase: wing.phase + ghost.phaseOffset
            });
          });

          sideGroup.add(sweepGroup);
        });

        return sideGroup;
      }

      const rightSide = buildWingSide(false);
      const leftSide = buildWingSide(true);
      beeRoot.add(rightSide);
      beeRoot.add(leftSide);
    }

    function processWingTexture(callback) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const cvs = document.createElement('canvas');
          cvs.width = 1024;
          cvs.height = 576;
          const ctx = cvs.getContext('2d');
          ctx.drawImage(img, 0, 0, 1024, 576);
          const imgData = ctx.getImageData(0, 0, 1024, 576);
          const d = imgData.data;

          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            const l = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
            const alpha = clamp((l - 0.035) * 4.2, 0, 1) * 255;
            d[i] = Math.min(255, r * 1.5 + 30);
            d[i + 1] = Math.min(255, g * 1.5 + 30);
            d[i + 2] = Math.min(255, b * 1.5 + 40);
            d[i + 3] = alpha;
          }
          ctx.putImageData(imgData, 0, 0);

          const tex = new THREE.CanvasTexture(cvs);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          callback(tex);
        } catch (e) {
          console.warn("Could not process wing texture pixels:", e);
          const fallbackTex = new THREE.TextureLoader().load(WING_TEX);
          fallbackTex.colorSpace = THREE.SRGBColorSpace;
          callback(fallbackTex);
        }
      };
      img.onerror = () => {
        console.warn("Failed to load WING_TEX");
      };
      img.src = WING_TEX;
    }

    const wingsReady = new Promise(resolve => processWingTexture(resolve));

    if (renderer) {
      const gltfLoader = new GLTFLoader();
      gltfLoader.setMeshoptDecoder(MeshoptDecoder);
      gltfLoader.load(
        BEE_GLB,
        (gltf) => {
          const model = gltf.scene;

          model.traverse((child) => {
            if (child.isMesh) {
              child.frustumCulled = false;
              if (child.material) {
                child.material.envMapIntensity = 0.7;
              }
            }
          });

          holder.add(model);
          model.rotation.set(0, Math.PI / 2, 0); // turns head from +Z to +X

          const box0 = new THREE.Box3().setFromObject(holder);
          const size0 = new THREE.Vector3();
          box0.getSize(size0);
          const maxDim = Math.max(size0.x, size0.y, size0.z);
          if (maxDim > 0) {
            model.scale.setScalar(1 / maxDim);
          }

          const box1 = new THREE.Box3().setFromObject(holder);
          const center1 = new THREE.Vector3();
          box1.getCenter(center1);
          model.position.sub(center1);

          const finalBox = new THREE.Box3().setFromObject(holder);
          const anchor = {
            x: finalBox.min.x + (finalBox.max.x - finalBox.min.x) * 0.66,
            y: finalBox.max.y * 0.86,
            z: (finalBox.max.z - finalBox.min.z) * 0.05
          };

          wingsReady.then((wingTex) => {
            buildWings(wingTex, anchor);
            isModelReady = true;
            showBee(true);
          });
        },
        undefined,
        (err) => {
          console.warn("Error loading BEE_GLB:", err);
          showBee(false);
        }
      );
    }

    /* =====================================================================
       5g. ANIMATION LOOP & MOUSE TRACKING
       ===================================================================== */
    const clock = new THREE.Clock();
    let wingPhase = 0;

    const mouse = {
      targetX: 0,
      targetY: 0,
      sx: 0,
      sy: 0
    };

    window.addEventListener('pointermove', (e) => {
      mouse.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
    }, { passive: true });

    // Initial state matching hero desktop
    const cur = {
      x: -0.03,
      y: -0.12,
      s: 1.00,
      yaw: 150,
      pitch: 6,
      roll: -4
    };

    function onWindowResize() {
      if (!renderer || !camera) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
    window.addEventListener('resize', onWindowResize);

    function tick() {
      requestAnimationFrame(tick);

      if (!renderer || !isModelReady) return;

      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();

      const K = (window.innerWidth < 760) ? KEYFRAMES_MOBILE : KEYFRAMES_DESKTOP;
      const p = getScrollProgress(K);
      const target = targetAt(p, K);

      // Smooth follow
      const kFollow = prefersReducedMotion ? 1 : (1 - Math.exp(-dt * 3.2));
      const kYaw = prefersReducedMotion ? 1 : (1 - Math.exp(-dt * 2.6));

      const prevX = cur.x;
      const prevY = cur.y;

      cur.x += (target.x - cur.x) * kFollow;
      cur.y += (target.y - cur.y) * kFollow;
      cur.s += (target.s - cur.s) * kFollow;
      cur.pitch += (target.pitch - cur.pitch) * kFollow;
      cur.roll += (target.roll - cur.roll) * kFollow;
      cur.yaw = lerpAngle(cur.yaw, target.yaw, kYaw);

      const vx = (!prefersReducedMotion && dt > 0) ? (cur.x - prevX) / dt : 0;
      const vy = (!prefersReducedMotion && dt > 0) ? (cur.y - prevY) / dt : 0;

      // Mouse smoothing
      if (!prefersReducedMotion) {
        const km = 1 - Math.exp(-dt * 2.0);
        mouse.sx += (mouse.targetX - mouse.sx) * km;
        mouse.sy += (mouse.targetY - mouse.sy) * km;
      } else {
        mouse.sx = 0;
        mouse.sy = 0;
      }

      const fovRad = (camera.fov * Math.PI) / 180;
      const halfH = Math.tan(fovRad / 2) * camera.position.z;
      const aspect = window.innerWidth / window.innerHeight;
      const halfW = halfH * aspect;
      const hover = prefersReducedMotion ? 0 : (Math.sin(t * 2.1) * 0.045 + Math.sin(t * 3.7) * 0.015);

      flight.position.set(
        cur.x * halfW + (prefersReducedMotion ? 0 : Math.sin(t * 1.3) * 0.04) + mouse.sx * 0.12,
        cur.y * halfH + hover * halfH * 0.5 + mouse.sy * 0.08,
        prefersReducedMotion ? 0 : (Math.sin(t * 0.9) * 0.15)
      );

      flight.scale.setScalar(halfH * 2 * 0.30 * cur.s);
      flight.rotation.set(0, -((cur.yaw + mouse.sx * 12) * Math.PI / 180), 0);

      const pitch = cur.pitch - clamp(vy * 22, -28, 28) + (prefersReducedMotion ? 0 : Math.sin(t * 2.1 + 1) * 3) + mouse.sy * 6;
      const roll = cur.roll + clamp(vx * 18, -30, 30) + (prefersReducedMotion ? 0 : Math.sin(t * 1.7) * 4);
      beeRoot.rotation.set(roll * Math.PI / 180, 0, pitch * Math.PI / 180, 'YZX');

      // Wing beat
      const moving = prefersReducedMotion ? 0 : target.moving;
      wingPhase += dt * 2 * Math.PI * (17 + moving * 5);
      for (let i = 0; i < flapGroups.length; i++) {
        const fg = flapGroups[i];
        const a = Math.sin(wingPhase + fg.phase);
        fg.group.rotation.x = -0.25 + a * 0.95;
        fg.group.rotation.y = a * 0.18;
      }

      renderer.render(scene, camera);
    }

    if (renderer) {
      tick();
    }
}
