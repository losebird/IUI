/**
 * three.js scene renderer — the HEAVY half. This module imports three and is
 * bundled ONLY into the lazy asset bundle `lib/assets/three.js`, loaded on
 * demand by the scene3d-lazy loader when a spec contains a `scene3d` node;
 * the main client bundle stays small.
 *
 * Security: the model only supplies white-listed primitive shapes, numeric
 * transforms, and colors. No textures, no external URLs, no scripts, no
 * custom shaders — everything is geometry + material colors constructed
 * locally. The renderer mounts into a caller-owned container and returns a
 * disposer that tears down the WebGL context.
 * @module @losebird/iui/client/scene3d-core
 */
import type { GenuiScene3D } from './spec.ts'

let threePromise: Promise<typeof import('three')> | null = null

function loadThree(): Promise<typeof import('three')> {
  threePromise ??= import('three')
  return threePromise
}

/** Shape constructors we accept, mapped to a size-normalized factory. */
type ShapeKind = 'box' | 'sphere' | 'cone' | 'cylinder' | 'torus'

function geometryFor(
  THREE: typeof import('three'),
  shape: ShapeKind,
  size: number | [number, number, number] | undefined,
): import('three').BufferGeometry {
  const s = size ?? 1
  switch (shape) {
    case 'box': {
      const [w, h, d] = Array.isArray(s) ? s : [s, s, s]
      return new THREE.BoxGeometry(w, h, d)
    }
    case 'sphere': {
      const r = Array.isArray(s) ? s[0] : s
      return new THREE.SphereGeometry(r, 32, 24)
    }
    case 'cone': {
      const r = Array.isArray(s) ? s[0] : s
      return new THREE.ConeGeometry(r, Array.isArray(s) ? s[1] : r * 2, 32)
    }
    case 'cylinder': {
      const r = Array.isArray(s) ? s[0] : s
      return new THREE.CylinderGeometry(r, r, Array.isArray(s) ? s[1] : r * 2, 32)
    }
    case 'torus': {
      const r = Array.isArray(s) ? s[0] : s
      return new THREE.TorusGeometry(r, Array.isArray(s) ? s[1] : r * 0.4, 16, 48)
    }
  }
}

/** Approximate bounding sphere of the declared meshes (no three.js needed). */
export function fitSceneBounds(scene: GenuiScene3D): { center: [number, number, number]; radius: number; minY: number } {
  const boxes: Array<{ p: [number, number, number]; r: number; halfY: number }> = []
  for (const mesh of scene.meshes) {
    const s = mesh.size ?? 1
    const dims = Array.isArray(s) ? s : [s, s, s]
    let r: number
    let halfY: number
    switch (mesh.shape) {
      case 'box': r = Math.hypot(dims[0] ?? 1, dims[1] ?? 1, dims[2] ?? 1) / 2; halfY = (dims[1] ?? 1) / 2; break
      case 'sphere': r = dims[0] ?? 1; halfY = r; break
      case 'cone':
      case 'cylinder': { const rr = dims[0] ?? 1; const hh = Array.isArray(s) ? (dims[1] ?? rr * 2) : rr * 2; r = Math.hypot(rr, hh / 2); halfY = hh / 2; break }
      case 'torus': { const rr = dims[0] ?? 1; r = rr + (Array.isArray(s) ? (dims[1] ?? rr * 0.4) : rr * 0.4); halfY = r; break }
      default: r = 1; halfY = 1
    }
    const sc = mesh.scale ?? 1
    const k = typeof sc === 'number' ? sc : Math.max(sc[0] ?? 1, sc[1] ?? 1, sc[2] ?? 1)
    const p = mesh.position ?? [0, 0, 0]
    boxes.push({ p: [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0], r: Math.abs(r * k) || 1, halfY: Math.abs(halfY * k) || 1 })
  }
  if (boxes.length === 0) return { center: [0, 0, 0], radius: 1, minY: 0 }
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const b of boxes) {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i]!, b.p[i]! - b.r)
      hi[i] = Math.max(hi[i]!, b.p[i]! + b.r)
    }
  }
  const center: [number, number, number] = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2]
  let radius = 0
  for (const b of boxes) radius = Math.max(radius, Math.hypot(b.p[0] - center[0], b.p[1] - center[1], b.p[2] - center[2]) + b.r)
  const minY = Math.min(...boxes.map((b) => b.p[1] - b.halfY))
  return { center, radius: Math.max(0.25, radius), minY }
}

/**
 * Mount a GenUI 3D scene into `container`.
 * @param container - the DOM node to host the WebGL canvas.
 * @param scene - the declarative scene spec.
 * @returns a disposer that removes the renderer and its context.
 */
export async function mountScene(container: HTMLElement, scene: GenuiScene3D): Promise<() => void> {
  const THREE = await loadThree()
  const width = container.clientWidth || 420
  const height = 240

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  // D7: soft shadows (guarded — older builds / test doubles may lack shadowMap).
  if (renderer.shadowMap !== undefined) {
    renderer.shadowMap.enabled = true
    if (THREE.PCFSoftShadowMap !== undefined) renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }
  container.appendChild(renderer.domElement)

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
  camera.position.set(3, 2.4, 4)
  camera.lookAt(0, 0, 0)

  const threeScene = new THREE.Scene()
  if (scene.background !== undefined) {
    try { threeScene.background = new THREE.Color(scene.background) } catch { /* keep transparent */ }
  }

  // D7 three-point lighting: key (casts the shadow) + cool fill + rim, low ambient base.
  const ambient = new THREE.AmbientLight(0xffffff, scene.ambient ?? 0.45)
  threeScene.add(ambient)
  const key = new THREE.DirectionalLight(0xffffff, 1.8)
  key.position.set(4, 6, 3)
  ;(key as { castShadow?: boolean }).castShadow = true
  threeScene.add(key)
  const fill = new THREE.DirectionalLight(0xdbe8ff, 0.6)
  fill.position.set(-5, 2.5, 2)
  threeScene.add(fill)
  const rim = new THREE.DirectionalLight(0xffffff, 0.9)
  rim.position.set(-2, 4, -5)
  threeScene.add(rim)

  const fit = fitSceneBounds(scene)

  for (const mesh of scene.meshes) {
    const geo = geometryFor(THREE, mesh.shape, mesh.size)
    const color = new THREE.Color(mesh.color ?? '#6ea8ff')
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 })
    const obj = new THREE.Mesh(geo, mat)
    const p = mesh.position ?? [0, 0, 0]
    obj.position.set(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0)
    const r = mesh.rotation ?? [0, 0, 0]
    obj.rotation.set(r[0] ?? 0, r[1] ?? 0, r[2] ?? 0)
    const sc = mesh.scale ?? 1
    if (typeof sc === 'number') obj.scale.setScalar(sc)
    else obj.scale.set(sc[0] ?? 1, sc[1] ?? 1, sc[2] ?? 1)
    ;(obj as { castShadow?: boolean }).castShadow = true
    threeScene.add(obj)
  }

  // Ground: a shadow catcher under the lowest mesh, plus a faint grid for scale.
  const groundY = fit.minY
  if (typeof THREE.ShadowMaterial === 'function' && typeof THREE.PlaneGeometry === 'function') {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(fit.radius * 8, fit.radius * 8), new THREE.ShadowMaterial({ opacity: 0.22 }))
    ground.rotation.set(-Math.PI / 2, 0, 0)
    ground.position.set(fit.center[0], groundY, fit.center[2])
    ;(ground as { receiveShadow?: boolean }).receiveShadow = true
    threeScene.add(ground)
  }
  const grid = new THREE.GridHelper(Math.max(8, Math.ceil(fit.radius * 4)), 16, 0x9aa3b2, 0xd5d9e0)
  ;(grid as { position?: { set: (x: number, y: number, z: number) => void } }).position?.set(fit.center[0], groundY, fit.center[2])
  threeScene.add(grid)

  // Orbit: simple drag-to-rotate, wheel to zoom (no external controls dep).
  // EVENT-DRIVEN rendering: one render after init, one per orbit change —
  // a static scene never runs a requestAnimationFrame loop, so an idle
  // scene costs zero GPU/battery. Pointer capture keeps all drag events on
  // the canvas (no window listeners, nothing to leak on unmount).
  let isDragging = false
  let prevX = 0
  let prevY = 0
  let theta = 0.8
  let phi = 0.6
  // D7 auto-fit: the scene's bounding sphere fills ~70% of the smaller frame side.
  const fitRadius = (aspect: number): number => {
    const v = (50 * Math.PI) / 360
    const h = Math.atan(Math.tan(v) * aspect)
    return Math.max(1.2, fit.radius / Math.sin(0.7 * Math.min(v, h)))
  }
  let radius = fitRadius(width / height)
  const minR = radius * 0.4
  const maxR = radius * 3
  const [cx, cy, cz] = fit.center
  const orbit = (): void => {
    camera.position.set(
      cx + radius * Math.sin(phi) * Math.cos(theta),
      cy + radius * Math.cos(phi),
      cz + radius * Math.sin(phi) * Math.sin(theta),
    )
    camera.lookAt(cx, cy, cz)
    renderer.render(threeScene, camera)
  }

  const onPointerDown = (e: PointerEvent): void => {
    isDragging = true
    prevX = e.clientX
    prevY = e.clientY
    try { canvas.setPointerCapture(e.pointerId) } catch { /* jsdom / capture unsupported */ }
  }
  const onPointerMove = (e: PointerEvent): void => {
    if (!isDragging) return
    // Drag follows the cursor (standard orbit feel): dragging right/left
    // sweeps the azimuth with the pointer, dragging up/down tilts the polar
    // angle with the pointer (phi grows from +Y down toward the equator).
    theta += (e.clientX - prevX) * 0.01
    phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi - (e.clientY - prevY) * 0.01))
    prevX = e.clientX
    prevY = e.clientY
    orbit()
  }
  const onPointerEnd = (e: PointerEvent): void => {
    if (!isDragging) return
    isDragging = false
    try { canvas.releasePointerCapture(e.pointerId) } catch { /* jsdom */ }
  }
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    radius = Math.max(minR, Math.min(maxR, radius * (1 + e.deltaY * 0.001)))
    orbit()
  }
  const canvas = renderer.domElement
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerEnd)
  canvas.addEventListener('pointercancel', onPointerEnd)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  // Container-size sync: the panel is resizable and the window reflows, so a
  // fixed mount-time width drifts. Event-driven like the orbit — a resize
  // renders exactly once, an idle scene still costs nothing.
  let lastWidth = width
  const observer = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
      const w = container.clientWidth || 420
      if (w === lastWidth) return
      lastWidth = w
      renderer.setSize(w, height)
      camera.aspect = w / height
      camera.updateProjectionMatrix()
      renderer.render(threeScene, camera)
    })
    : null
  observer?.observe(container)

  orbit() // initial render; afterwards only interactions re-render.

  return () => {
    observer?.disconnect()
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerEnd)
    canvas.removeEventListener('pointercancel', onPointerEnd)
    canvas.removeEventListener('wheel', onWheel)
    renderer.dispose()
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement)
    }
  }
}
