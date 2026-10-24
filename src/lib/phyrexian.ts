// Original glyphs in a Phyrexian-like style (inspired by, not copied from,
// Magic: The Gathering's script): a vertical spine with rings, hooks, bowls and
// dotted bars branching off it. Each glyph is SVG path data in a 100 x 160 box,
// meant to be stroked.

const W = 100;
const H = 160;
const C = W / 2; // spine x

const ring = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

// Building blocks; y positions are along the spine.
const part = {
  spine: (from = 22, to = 150) => `M${C} ${from}L${C} ${to}`,
  crown: () => ring(C, 12, 10),
  knot: (y: number) => ring(C, y, 9),
  hookR: (y: number) => `M${C} ${y}C${C} ${y - 14} ${C + 32} ${y - 14} ${C + 32} ${y + 14}`,
  hookL: (y: number) => `M${C} ${y}C${C} ${y - 14} ${C - 32} ${y - 14} ${C - 32} ${y + 14}`,
  bowlR: (y: number) => `M${C} ${y}C${C + 42} ${y} ${C + 42} ${y + 40} ${C} ${y + 40}`,
  bowlL: (y: number) => `M${C} ${y}C${C - 42} ${y} ${C - 42} ${y + 40} ${C} ${y + 40}`,
  bar: (y: number) => `M${C - 26} ${y}L${C + 26} ${y}${ring(C - 33, y, 5)}${ring(C + 33, y, 5)}`,
  tailR: () => `M${C} ${150}C${C} ${162} ${C + 26} ${162} ${C + 30} ${146}`,
  tailL: () => `M${C} ${150}C${C} ${162} ${C - 26} ${162} ${C - 30} ${146}`,
  arch: (y: number) => `M${C - 30} ${y + 22}C${C - 30} ${y - 8} ${C + 30} ${y - 8} ${C + 30} ${y + 22}`,
  spurR: (y: number) => `M${C} ${y}L${C + 28} ${y + 26}${ring(C + 32, y + 30, 5)}`,
  spurL: (y: number) => `M${C} ${y}L${C - 28} ${y + 26}${ring(C - 32, y + 30, 5)}`,
};

const { spine, crown, knot, hookR, hookL, bowlR, bowlL, bar, tailR, tailL, arch, spurR, spurL } = part;

export const GLYPH_BOX = { width: W, height: H };

export const PHYREXIAN_GLYPHS: string[] = [
  [crown(), spine(), bar(60), tailR()],
  [crown(), spine(), hookR(48), hookL(100)],
  [crown(), spine(22, 76), knot(85), spine(94, 150), bowlR(105)],
  [crown(), spine(), bowlL(40), tailL()],
  [crown(), spine(), arch(70), bar(120)],
  [crown(), spine(), spurR(40), spurL(90)],
  [crown(), spine(22, 66), knot(75), spine(84, 150), hookR(110), tailL()],
  [crown(), spine(), bowlR(36), bowlL(92)],
  [crown(), spine(), bar(50), bar(100)],
  [crown(), spine(), hookL(56), spurR(96), tailR()],
  [crown(), spine(), arch(36), hookR(110)],
  [crown(), spine(22, 106), knot(115), spine(124, 150), bowlL(50)],
  [crown(), spine(), spurL(44), bar(110)],
  [crown(), spine(), bowlR(60), tailL()],
  [crown(), spine(), hookR(44), hookL(80), hookR(116)],
  [crown(), spine(22, 56), knot(65), spine(74, 150), arch(96), tailR()],
  [crown(), spine(), bar(84), spurR(110)],
  [crown(), spine(), bowlL(30), spurR(100)],
  [crown(), spine(), arch(50), arch(100)],
  [crown(), spine(), hookL(40), bowlR(88), tailL()],
].map((parts) => parts.join(""));
