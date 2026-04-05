import fs from 'fs';
import pnIco from 'png-to-ico';
import Jimp from 'jimp';

async function convert() {
  try {
    console.log('Loading png...');
    // Use Jimp to "clean" the PNG and ensuring it's a standard format
    const image = await Jimp.read('assets/logo.png');
    // Resize to 256x256 (standard for ico)
    image.resize(256, 256);
    const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
    
    console.log('Converting buffer to ico...');
    const icoBuffer = await pnIco(buffer);
    fs.writeFileSync('assets/logo.ico', icoBuffer);
    console.log('Successfully created assets/logo.ico');
  } catch (err) {
    console.error('Error creating icon:', err);
    process.exit(1);
  }
}

convert();
