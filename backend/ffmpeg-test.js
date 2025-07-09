import ffmpegStaticPath from 'ffmpeg-static';
import { execFile } from 'child_process';
import fs from 'fs';

const ffmpegPath = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : ffmpegStaticPath;

execFile(ffmpegPath, ['-version'], (err, stdout, stderr) => {
  if (err) {
    console.error('❌ Error al ejecutar ffmpeg-static:', err);
    return;
  }
  console.log('✅ ffmpeg-static encontrado y funcionando:\n');
  console.log(stdout);
});
