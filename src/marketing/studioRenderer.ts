import {
  AgXToneMapping,
  AnimationMixer,
  HemisphereLight,
  Light,
  Material,
  Mesh,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  heroViewForWidth,
  isSustainedLowFrameRate,
  posterMatchedFieldOfView,
} from "./heroPolicy";

export type StudioController = {
  setPlaying: (playing: boolean) => void;
  dispose: () => void;
};
type Options = { signal: AbortSignal; onError: () => void };

function disposeModel(root: Object3D) {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    (Array.isArray(object.material)
      ? object.material
      : [object.material]
    ).forEach((material) => materials.add(material));
  });
  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value instanceof Texture) textures.add(value);
    });
    material.dispose();
  });
  textures.forEach((texture) => {
    const bitmap = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && bitmap instanceof ImageBitmap)
      bitmap.close();
    texture.dispose();
  });
}

export async function createStudioRenderer(
  host: HTMLDivElement,
  options: Options,
): Promise<StudioController> {
  const { signal, onError } = options;
  signal.throwIfAborted();
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
    failIfMajorPerformanceCaveat: true,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 2 ** 0.5;
  renderer.setClearColor("#121212");
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.dataset.playback = "loading";
  host.appendChild(renderer.domElement);
  const scene = new Scene();
  let root: Object3D | undefined;
  let mixer: AnimationMixer | undefined;
  let environmentTarget: ReturnType<PMREMGenerator["fromScene"]> | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let disposed = false;
  let gpuReleased = false;
  let playing = true;
  let ready = false;
  let lastFrame = 0;
  let benchmarkStart = 0;
  let measuredFrames = 0;
  let warmupStart = 0;
  const camera = new PerspectiveCamera();
  const cameraPosition = new Vector3();
  const cameraRotation = new Quaternion();
  const initialHeroPosition = new Vector3();
  const initialHeroRotation = new Quaternion();
  const animatedPosition = new Vector3();
  const animatedRotation = new Quaternion();
  let animatedCamera: Object3D | undefined;
  const poses = new Map<
    string,
    { position: Vector3; rotation: Quaternion; fov: number; aspect: number }
  >();

  function releaseGPU() {
    if (gpuReleased) return;
    gpuReleased = true;
    mixer?.stopAllAction();
    if (root) {
      mixer?.uncacheRoot(root);
      disposeModel(root);
    }
    environmentTarget?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    renderer.setAnimationLoop(null);
    resizeObserver?.disconnect();
    signal.removeEventListener("abort", dispose);
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    renderer.domElement.remove();
    releaseGPU();
  }
  function fail() {
    if (!disposed) {
      dispose();
      onError();
    }
  }
  function contextLost(event: Event) {
    event.preventDefault();
    fail();
  }
  signal.addEventListener("abort", dispose, { once: true });
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  renderer.debug.onShaderError = () => {
    // Unwind Three's render/compile stack before the surrounding catch disposes
    // its programs. Synchronous disposal inside that stack can orphan work.
    throw new Error("Studio shader compilation failed");
  };

  function renderPose(delta: number) {
    mixer?.update(delta);
    scene.updateMatrixWorld(true);
    camera.position.copy(cameraPosition);
    camera.quaternion.copy(cameraRotation);
    // Apply the supplied 12-second clip's relative drift to each authored view.
    // Animating only Hero_Desktop would leave the wide/mobile hero motionless.
    if (animatedCamera) {
      animatedCamera.getWorldPosition(animatedPosition);
      animatedCamera.getWorldQuaternion(animatedRotation);
      camera.position.add(animatedPosition.sub(initialHeroPosition));
      camera.quaternion.premultiply(
        animatedRotation.multiply(initialHeroRotation.clone().invert()),
      );
    }
    renderer.render(scene, camera);
  }
  function frame(time: number) {
    if (disposed || !playing || !ready) return;
    if (lastFrame && time - lastFrame < 1000 / 30 - 1) return;
    const delta = lastFrame ? Math.min((time - lastFrame) / 1000, 0.1) : 0;
    lastFrame = time;
    try {
      renderPose(delta);
    } catch {
      fail();
      return;
    }
    if (!warmupStart) warmupStart = time;
    if (time - warmupStart < 2500) return;
    if (!benchmarkStart) benchmarkStart = time;
    measuredFrames++;
    if (time - benchmarkStart >= 3000) {
      if (isSustainedLowFrameRate(measuredFrames, time - benchmarkStart)) {
        fail();
        return;
      }
      benchmarkStart = time;
      measuredFrames = 0;
    }
  }
  function setPlaying(value: boolean) {
    playing = value;
    lastFrame = benchmarkStart = measuredFrames = warmupStart = 0;
    if (disposed || !ready) return;
    renderer.domElement.dataset.playback = value ? "playing" : "paused";
    renderer.setAnimationLoop(value ? frame : null);
    if (!value) {
      try {
        renderPose(0);
      } catch {
        fail();
      }
    }
  }
  function resize() {
    if (disposed) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    const view = heroViewForWidth(window.innerWidth);
    const pose = poses.get(view.camera);
    if (!pose) throw new Error("Missing authored hero camera");
    cameraPosition.copy(pose.position);
    cameraRotation.copy(pose.rotation);
    camera.fov = posterMatchedFieldOfView(
      pose.fov,
      pose.aspect,
      view.posterAspect,
      width / height,
    );
    camera.aspect = width / height;
    camera.near = 0.1;
    camera.far = 100;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    if (ready) {
      try {
        renderPose(0);
      } catch {
        fail();
      }
    }
  }

  try {
    const response = await fetch("/studio/satx-ink-studio.glb", { signal });
    if (!response.ok) throw new Error("Studio model unavailable");
    const data = await response.arrayBuffer();
    signal.throwIfAborted();
    const gltf = await new GLTFLoader().parseAsync(data, "/studio/");
    if (disposed || signal.aborted) {
      disposeModel(gltf.scene);
      throw new Error("Studio load cancelled");
    }
    root = gltf.scene;
    scene.add(root);
    scene.updateMatrixWorld(true);
    for (const source of gltf.cameras) {
      if (!(source instanceof PerspectiveCamera)) continue;
      poses.set(source.name, {
        position: source.getWorldPosition(new Vector3()),
        rotation: source.getWorldQuaternion(new Quaternion()),
        fov: source.fov,
        aspect: source.aspect,
      });
    }
    animatedCamera = root.getObjectByName("Hero_Desktop");
    if (!animatedCamera) throw new Error("Missing animated camera");
    animatedCamera.getWorldPosition(initialHeroPosition);
    animatedCamera.getWorldQuaternion(initialHeroRotation);
    const clip = gltf.animations.find(
      (animation) => animation.name === "Hero_Ambient_Drift_12s",
    );
    if (!clip) throw new Error("Missing studio animation");
    mixer = new AnimationMixer(root);
    mixer.clipAction(clip).play();
    root.traverse((object) => {
      // Appearance normalization for Blender's 683 lm/W export conversion.
      if (object instanceof Light) object.intensity /= 683;
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
      // One shadow map keeps lighting grounded without eight shadow passes.
      if (object instanceof SpotLight && object.name.includes("key")) {
        object.castShadow = true;
        object.shadow.mapSize.set(1024, 1024);
        object.shadow.bias = -0.0003;
        object.shadow.normalBias = 0.02;
      }
    });
    scene.add(new HemisphereLight("#dae2f1", "#342620", 0.2));
    const environment = new RoomEnvironment();
    const pmrem = new PMREMGenerator(renderer);
    try {
      environmentTarget = pmrem.fromScene(environment, 0.04);
    } finally {
      environment.dispose();
      pmrem.dispose();
    }
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = 0.15;
    resize();
    // The small material set compiles once. Avoid compileAsync's uncancellable
    // program polling, which can survive cancellation or a lost GPU context.
    renderer.compile(scene, camera);
    signal.throwIfAborted();
    if (disposed) throw new Error("Studio unavailable");
    renderPose(0);
    ready = true;
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    setPlaying(playing);
    return { setPlaying, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
