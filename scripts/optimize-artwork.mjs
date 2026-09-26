import sharp from "sharp";
import { stat } from "node:fs/promises";

for (const name of ["debate-hero", "evidence-lab"]) {
  const input = `imgs/classroom/${name}.png`;
  const output = `imgs/classroom/${name}.webp`;
  const source = await stat(input);
  const result = await sharp(input).webp({ quality: 90, effort: 5 }).toFile(output);
  console.log(`${name}: ${source.size} → ${result.size} bytes (${result.width}×${result.height}, quality 90)`);
}

for (const size of [192, 512]) {
  await sharp("public/icons/veritas.svg").resize(size, size).png({ compressionLevel: 9 }).toFile(`public/icons/veritas-${size}.png`);
}
