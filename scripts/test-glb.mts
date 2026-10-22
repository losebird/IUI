/**
 * R5-3 test fixture: a tiny hand-built GLB (no textures) — node "Body" (box), child node "Lid"
 * (flat box on top) and one animation clip "Spin" that turns the lid. Used by the unit tests
 * (GLTFLoader.parse in node) and the browser E2E (served through a Playwright route).
 */
function box(sx: number, sy: number, sz: number): { pos: number[]; nrm: number[]; idx: number[] } {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = []
  const faces: Array<[number[], number[], number[]]> = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ]
  for (const [n, u, v] of faces) {
    const base = pos.length / 3
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const p = [0, 1, 2].map((k) => (n[k]! + a * u[k]! + b * v[k]!) * [sx, sy, sz][k]! / 2)
      pos.push(...p); nrm.push(...n)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return { pos, nrm, idx }
}

export function buildTestGlb(): Uint8Array {
  const parts: Buffer[] = []
  const views: Array<{ buffer: 0; byteOffset: number; byteLength: number; target?: number }> = []
  const accessors: unknown[] = []
  let offset = 0
  function push(data: Float32Array | Uint16Array, type: string, comp: number, target?: number, minmax?: { min: number[]; max: number[] }): number {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    const padded = Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)])
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(target ? { target } : {}) })
    parts.push(padded)
    offset += padded.length
    const n = type === 'SCALAR' ? 1 : type === 'VEC3' ? 3 : 4
    accessors.push({ bufferView: views.length - 1, componentType: comp, count: data.length / n, type, ...(minmax ?? {}) })
    return accessors.length - 1
  }
  const meshes: unknown[] = []
  for (const [sx, sy, sz] of [[2, 1, 1.2], [1.6, 0.25, 1]] as const) {
    const b = box(sx, sy, sz)
    const P = push(new Float32Array(b.pos), 'VEC3', 5126, 34962, { min: [-sx / 2, -sy / 2, -sz / 2], max: [sx / 2, sy / 2, sz / 2] })
    const N = push(new Float32Array(b.nrm), 'VEC3', 5126, 34962)
    const I = push(new Uint16Array(b.idx), 'SCALAR', 5123, 34963)
    meshes.push({ primitives: [{ attributes: { POSITION: P, NORMAL: N }, indices: I, material: meshes.length }] })
  }
  const times = push(new Float32Array([0, 1, 2]), 'SCALAR', 5126, undefined, { min: [0], max: [2] })
  // 0° → 180° → 360° about Y (quaternions x, y, z, w).
  const rots = push(new Float32Array([0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, -1]), 'VEC4', 5126)
  const json = {
    asset: { version: '2.0', generator: 'iui test-glb' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'Body', mesh: 0, children: [1] },
      { name: 'Lid', mesh: 1, translation: [0, 0.65, 0] },
    ],
    meshes,
    materials: [
      { name: 'BodyMat', pbrMetallicRoughness: { baseColorFactor: [0.09, 0.37, 0.65, 1], metallicFactor: 0.1, roughnessFactor: 0.4 } },
      { name: 'LidMat', pbrMetallicRoughness: { baseColorFactor: [0.95, 0.55, 0.2, 1], metallicFactor: 0.1, roughnessFactor: 0.5 } },
    ],
    animations: [{ name: 'Spin', samplers: [{ input: times, output: rots, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }] }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  }
  const bin = Buffer.concat(parts)
  let js = Buffer.from(JSON.stringify(json), 'utf8')
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)])
  const total = 12 + 8 + js.length + 8 + bin.length
  const out = Buffer.alloc(total)
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8)
  out.writeUInt32LE(js.length, 12); out.writeUInt32LE(0x4e4f534a, 16); js.copy(out, 20)
  const o2 = 20 + js.length
  out.writeUInt32LE(bin.length, o2); out.writeUInt32LE(0x004e4942, o2 + 4); bin.copy(out, o2 + 8)
  return new Uint8Array(out)
}
