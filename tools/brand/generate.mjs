// Regenerates every raster brand asset from the vector symbol.
//   node tools/brand/generate.mjs
// Symbol: traced from the owner's approved compact app icon (Remote-AI-Platform.png).
// Palette and type: the Enterprise Brand Identity Figma file (06 / Brand Guidelines):
// Blue #175CD3, Navy #102A43, Charcoal #1F2937, Mist #F5F8FC, Sky #8DBBFF on Dark #101820;
// Inter Semi Bold (600) wordmark. Text is rasterised with the repo's Inter font.
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const web = join(root, "apps/web");
const admin = join(root, "apps/admin");
export const BRAND = {
  blue: "#175CD3",
  navy: "#102A43",
  charcoal: "#1F2937",
  mist: "#F5F8FC",
  sky: "#8DBBFF",
  dark: "#101820",
};

// The symbol's shapes on a 64-unit grid (no background).
const shapes = (blue = BRAND.blue, navy = BRAND.navy, screen = "white") =>
  `<path d="M8 27V20C8 13 13 8 20 8H49C48 15 44 19 37 19H22C15 19 11 22 8 27Z" fill="${blue}"/>` +
  `<path d="M51 10C57 12 60 17 60 24V43C60 50 56 55 50 57L44 47V24C44 20 42 18 39 18C45 17 49 14 51 10Z" fill="${navy}"/>` +
  `<path d="M8 30C8 25 12 22 18 21C16 24 15 27 15 31V43C15 47 18 49 22 49H38L44 57H20C13 57 8 52 8 45Z" fill="${blue}"/>` +
  `<circle cx="30" cy="29" r="6" fill="${navy}"/>` +
  `<path d="M20 40C21 35 25 34 30 34C35 34 39 35 40 40" fill="${navy}"/>` +
  `<rect x="19" y="41" width="23" height="13" rx="2" fill="${blue}"/>` +
  `<circle cx="30.5" cy="47.5" r="2" fill="${screen}"/>`;

const symbol = (bg = "white") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">` +
  (bg ? `<rect width="64" height="64" rx="14" fill="${bg}"/>` : "") +
  shapes() +
  `</svg>`;

// A square icon with the symbol inset (maskable safe zone = inner 80%).
const tile = (size, inset, bg = "white", radius = 0) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
  `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` +
  `<g transform="translate(${inset} ${inset}) scale(${(size - 2 * inset) / 64})">${shapes()}</g></svg>`;

// Monochrome silhouette for Android notification badges (white on transparent).
const badge = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${shapes("white", "white", "black")}</svg>`;

const FONT = "Inter, 'Helvetica Neue', Arial, sans-serif";
const wordmark = (x, y, size, dark = false) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-weight="700" font-size="${size}" letter-spacing="-0.02em" fill="${dark ? "white" : BRAND.navy}">` +
  `Remote <tspan fill="${dark ? BRAND.sky : BRAND.blue}">AI</tspan> Platform</text>`;

const og = (w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<rect width="${w}" height="${h}" fill="${BRAND.mist}"/>` +
  `<rect y="${h - 16}" width="${w}" height="16" fill="${BRAND.blue}"/>` +
  `<g transform="translate(80 150) scale(3.5)"><rect width="64" height="64" rx="14" fill="white"/>${shapes()}</g>` +
  wordmark(340, 265, 72) +
  `<text x="340" y="335" font-family="${FONT}" font-weight="400" font-size="36" fill="${BRAND.charcoal}">Connect. Find work. Get work done.</text>` +
  `<text x="80" y="${h - 70}" font-family="${FONT}" font-weight="600" font-size="30" fill="${BRAND.blue}">Remote jobs · Freelance work · Hiring · Projects</text>` +
  `</svg>`;

const emailLogo = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${300 * scale}" height="${48 * scale}" viewBox="0 0 300 48">` +
  `<g transform="translate(0 4) scale(0.625)">${shapes()}</g>` +
  wordmark(50, 32, 22) +
  `</svg>`;

const out = (p) => (mkdirSync(dirname(p), { recursive: true }), p);
const png = (svg, file, size) =>
  sharp(Buffer.from(svg), { density: 384 })
    .resize(size?.[0], size?.[1])
    .png({ compressionLevel: 9, palette: false })
    .toFile(out(file));

/** ICO with embedded PNG images (supported by every current browser). */
async function ico(file, sizes) {
  const images = await Promise.all(
    sizes.map((s) => sharp(Buffer.from(tile(s, Math.round(s * 0.04), "white", Math.round(s * 0.2)))).png().toBuffer()),
  );
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(images[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  writeFileSync(out(file), Buffer.concat([header, ...images]));
}

const svgSymbol = symbol();
for (const f of [
  join(web, "public/brand-mark.svg"),
  join(web, "public/brand/rap-symbol.svg"),
  join(web, "src/app/icon.svg"),
  join(admin, "public/brand-mark.svg"),
  join(admin, "src/app/icon.svg"),
])
  writeFileSync(out(f), svgSymbol + "\n");
writeFileSync(out(join(web, "public/brand/rap-logo.svg")), emailLogo(1) + "\n");

await ico(join(web, "src/app/favicon.ico"), [16, 32, 48]);
copyFileSync(join(web, "src/app/favicon.ico"), out(join(admin, "src/app/favicon.ico")));
await png(tile(180, 18), join(web, "src/app/apple-icon.png"), [180, 180]);
await png(tile(192, 12, "white", 40), join(web, "public/icons/icon-192.png"), [192, 192]);
await png(tile(512, 32, "white", 108), join(web, "public/icons/icon-512.png"), [512, 512]);
await png(tile(512, 72), join(web, "public/icons/maskable-512.png"), [512, 512]);
await png(badge(96), join(web, "public/icons/badge-96.png"), [96, 96]);
await png(og(1200, 630), join(web, "src/app/opengraph-image.png"), [1200, 630]);
await png(og(1200, 630), join(web, "src/app/twitter-image.png"), [1200, 630]);
await png(emailLogo(2), join(web, "public/brand/email-logo.png"), [600, 96]);
console.log("brand assets written", readFileSync(join(web, "src/app/favicon.ico")).length, "byte favicon");
