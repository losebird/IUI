export const pathPartsOf = (p: string) => { const i = p.lastIndexOf('/'); return { dir: i < 0 ? '' : p.slice(0, i + 1), base: i < 0 ? p : p.slice(i + 1) } }
