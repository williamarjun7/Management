import { Jimp } from 'jimp';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const LEGACY_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const FOREGROUND_SIZES = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

// Splash screen sizes (centered logo on white)
const SPLASH_SIZES = {
  'mipmap-mdpi': 200,
  'mipmap-hdpi': 300,
  'mipmap-xhdpi': 400,
  'mipmap-xxhdpi': 600,
  'mipmap-xxxhdpi': 800,
};

function square(img) {
  const min = Math.min(img.bitmap.width, img.bitmap.height);
  return img.crop({
    x: (img.bitmap.width - min) / 2,
    y: (img.bitmap.height - min) / 2,
    w: min, h: min,
  });
}

async function main() {
  const logo = await Jimp.read(resolve(root, 'src/assets/logo.png'));
  const squareLogo = square(logo.clone());

  for (const [dir, size] of Object.entries(LEGACY_SIZES)) {
    const outDir = resolve(root, 'android', 'app', 'src', 'main', 'res', dir);
    const icon = squareLogo.clone().resize({ w: size, h: size });
    await icon.write(resolve(outDir, 'ic_launcher.png'));
    await icon.write(resolve(outDir, 'ic_launcher_round.png'));
    console.log(`Legacy ${size}x${size} -> ${dir}`);
  }

  for (const [dir, size] of Object.entries(FOREGROUND_SIZES)) {
    const outDir = resolve(root, 'android', 'app', 'src', 'main', 'res', dir);
    const fg = squareLogo.clone().resize({ w: size, h: size });
    await fg.write(resolve(outDir, 'ic_launcher_foreground.png'));
    console.log(`Foreground ${size}x${size} -> ${dir}`);
  }

  // Base splash for drawable/ (no density qualifier)
  const baseCanvas = new Jimp({ width: 400, height: 400, color: '#FFFFFF' });
  const baseLogoSize = 200;
  const baseLogoResized = squareLogo.clone().resize({ w: baseLogoSize, h: baseLogoSize });
  baseCanvas.composite(baseLogoResized, 100, 100);
  await baseCanvas.write(resolve(root, 'android', 'app', 'src', 'main', 'res', 'drawable', 'splash.png'));
  console.log('Splash 400x400 -> drawable');

  // Generate splash screens (centered logo on white background)
  for (const [dir, size] of Object.entries(SPLASH_SIZES)) {
    const outDir = resolve(root, 'android', 'app', 'src', 'main', 'res', dir);
    const canvas = new Jimp({ width: size, height: size, color: '#FFFFFF' });
    const logoSize = Math.round(size * 0.5);
    const logoResized = squareLogo.clone().resize({ w: logoSize, h: logoSize });
    canvas.composite(logoResized, (size - logoSize) / 2, (size - logoSize) / 2);
    await canvas.write(resolve(outDir, 'splash.png'));
    console.log(`Splash ${size}x${size} -> ${dir}`);
  }

  writeFileSync(
    resolve(root, 'android', 'app', 'src', 'main', 'res', 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
`
  );

  console.log('All icons and splash screens generated from logo.png');
}

main().catch(console.error);
