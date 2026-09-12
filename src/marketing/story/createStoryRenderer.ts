import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { assetBase, storyFrame } from "./storyModel";
import type { Chapter, Manifest, Triple } from "./storyModel";

export async function createStoryRenderer(onFailure: () => void, signal?: AbortSignal) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 10);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6060, 2.5));
  const key = new THREE.DirectionalLight(0xfff6e9, 3.5); key.position.set(1, 2, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 2); rim.position.set(-2, 1, 1); scene.add(rim);
  let model: THREE.Group | undefined;
  let alternate: THREE.Texture | undefined;
  let sheetMaterial: THREE.MeshStandardMaterial | undefined;
  let disposed = false;
  const lost = (event: Event) => { event.preventDefault(); onFailure(); };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  const dispose = () => {
    if (disposed) return; disposed = true;
    renderer.domElement.removeEventListener("webglcontextlost", lost);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    model?.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
      }
    });
    if (alternate) textures.add(alternate);
    if (sheetMaterial) materials.add(sheetMaterial);
    textures.forEach(t => { t.dispose(); if (typeof ImageBitmap !== "undefined" && t.image instanceof ImageBitmap) t.image.close(); });
    materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  };
  try {
    // Sequential ownership makes failed/partial loads fully disposable.
    const response = await fetch(`${assetBase}scene-manifest.json`, { signal });
    if (!response.ok) throw new Error("Story manifest unavailable");
    const manifest = await response.json() as Manifest;
    const modelResponse = await fetch(`${assetBase}portfolio.glb`, { signal });
    if (!modelResponse.ok) throw new Error("Story model unavailable");
    const gltf = await new GLTFLoader().parseAsync(await modelResponse.arrayBuffer(), assetBase);
    model = gltf.scene; scene.add(model);
    signal?.throwIfAborted();
    const nodes = new Map(manifest.nodeNames.map(n => {
      const object = model!.getObjectByName(n);
      if (!object) throw new Error(`Missing story node: ${n}`);
      return [n, object] as const;
    }));
    const sheet = nodes.get("FlashSheet") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const original = sheet.material;
    sheetMaterial = original.clone(); sheet.material = sheetMaterial;
    alternate = await new THREE.TextureLoader().loadAsync(`${assetBase}sheet-extracted.jpg`);
    signal?.throwIfAborted();
    alternate.flipY = false; alternate.colorSpace = THREE.SRGBColorSpace;
    if (original.map) {
      alternate.wrapS = original.map.wrapS; alternate.wrapT = original.map.wrapT;
      alternate.minFilter = original.map.minFilter; alternate.magFilter = original.map.magFilter;
    }
    const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), euler = new THREE.Euler();
    const target = new THREE.Vector3(), pos = new THREE.Vector3(), end = new THREE.Vector3();
    const vector = (a: Triple, b: Triple, mix: number, out: THREE.Vector3) => out.fromArray(a).lerp(end.fromArray(b), mix);
    let oldHost: HTMLElement | undefined;
    return {
      draw(host: HTMLElement, chapter: Chapter, progress: number) {
        if (disposed || document.hidden) return;
        if (oldHost !== host) {
          oldHost?.parentElement?.removeAttribute("data-rendered");
          host.append(renderer.domElement); oldHost = host;
        }
        const { from, to, mix, extracted } = storyFrame(chapter, progress);
        for (const [name, object] of nodes) {
          const a = manifest.poses[from][name], b = manifest.poses[to][name];
          vector(a.position, b.position, mix, object.position);
          vector(a.scale, b.scale, mix, object.scale);
          q1.setFromEuler(euler.set(...a.rotationDegrees.map(THREE.MathUtils.degToRad) as Triple));
          q2.setFromEuler(euler.set(...b.rotationDegrees.map(THREE.MathUtils.degToRad) as Triple));
          object.quaternion.slerpQuaternions(q1, q2, mix);
          // Only scale the highest changing visibility node, never its children too.
          const parentA = object.parent && manifest.poses[from][object.parent.name];
          const parentB = object.parent && manifest.poses[to][object.parent.name];
          const parentChanges = parentA && parentB && parentA.visible !== parentB.visible;
          if (a.visible !== b.visible && !parentChanges) object.scale.multiplyScalar(a.visible ? 1 - mix : mix);
          object.visible = (a.visible || b.visible) && object.scale.lengthSq() > .000001;
        }
        sheetMaterial!.map = extracted ? alternate! : original.map;
        const a = manifest.cameras[from].desktop, b = manifest.cameras[to].desktop;
        vector(a.position, b.position, mix, pos); camera.position.copy(pos);
        vector(a.target, b.target, mix, target); camera.lookAt(target);
        const width = host.clientWidth, height = host.clientHeight;
        if (!width || !height) return;
        const aspect = width / height;
        // Preserve the artist's reference frame even in a tall desktop scene slot.
        const span = THREE.MathUtils.lerp(a.verticalSpan, b.verticalSpan, mix) * Math.max(1, (4 / 3) / aspect) * 1.08;
        camera.top = span / 2; camera.bottom = -span / 2;
        camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
        camera.updateProjectionMatrix();
        const size = renderer.getSize(new THREE.Vector2());
        if (size.x !== width || size.y !== height) renderer.setSize(width, height, false);
        renderer.render(scene, camera);
        host.parentElement?.setAttribute("data-rendered", "true");
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
