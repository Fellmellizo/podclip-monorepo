import express from 'express';
import cors from 'cors';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const app = express();
const port = 3001;

// Configure paths so fluent-ffmpeg can find the binaries. Si por alguna
// razón ffmpeg-static no logró descargar el binario (por ejemplo, sin
// acceso a internet), utilizamos la versión instalada en el sistema.
const ffmpegBinary = fs.existsSync(ffmpegPath) ? ffmpegPath : '/usr/bin/ffmpeg';
const ffprobeBinary = '/usr/bin/ffprobe';
ffmpeg.setFfmpegPath(ffmpegBinary);
ffmpeg.setFfprobePath(ffprobeBinary);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp3')) res.set('Content-Type', 'audio/mpeg');
    if (filePath.endsWith('.mp4')) res.set('Content-Type', 'video/mp4');
  }
}));

// ---------------------------
// Configuración de Multer
// ---------------------------
// Guardamos todos los archivos cargados en la carpeta "uploads" con un
// nombre basado en la fecha para evitar colisiones.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage }).fields([
  { name: 'audio', maxCount: 1 },
  { name: 'image', maxCount: 100 },
  { name: 'video', maxCount: 1 }
]);

// ---------------------------------------
// Objeto en memoria para rastrear los trabajos
// ---------------------------------------
// Cada solicitud genera un ID único y se almacena en este
// objeto con información sobre el avance. En un entorno real
// se recomendaría usar una base de datos o un sistema de colas
// persitente.
const jobs = {};

// ---------------------------
// Procesamiento de podcasts (audio + imágenes)
// ---------------------------
// Divide un archivo de audio en varios clips. Si el usuario proporciona
// imágenes, cada clip se combina con una imagen para generar un video.
// Si no se proporcionan imágenes se exporta audio puro en formato MP3.
app.post('/process-podcast', upload, (req, res) => {
  // Duración en segundos de cada clip. Si el usuario no especifica nada
  // usamos 60s por defecto.
  const clipDuration = parseInt(req.body.clip_duration) || 60;
  // Archivos enviados por el usuario
  const audioFile = req.files?.audio?.[0];
  const imageFiles = req.files?.image || [];

  if (!audioFile) {
    return res.status(400).json({ error: 'Archivo de audio no recibido' });
  }

  // Rutas de entrada y salida
  const inputPath = audioFile.path;
  const outputDir = path.join(__dirname, 'public', 'clips');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Creamos un identificador único para este proceso y lo registramos
  const jobId = uuidv4();
  jobs[jobId] = {
    status: 'processing',
    progress: 0,
    total_clips: 0,
    clips_generated: 0,
    download_urls: []
  };

  // Obtenemos la duración total del audio con ffprobe
  ffmpeg.ffprobe(inputPath, (err, metadata) => {
    if (err) {
      jobs[jobId].status = 'failed';
      jobs[jobId].error_message = err.message;
      return res.status(500).json({ error: err.message });
    }

    const duration = metadata.format.duration;
    const numClips = Math.floor(duration / clipDuration);
    jobs[jobId].total_clips = numClips;
    let completed = 0;

    // Recorremos y generamos cada clip de manera asíncrona
    for (let i = 0; i < numClips; i++) {
      const start = i * clipDuration;
      const imagePath = imageFiles[i % imageFiles.length]?.path || null;
      const outputName = `${jobId}_clip${i + 1}.${imagePath ? 'mp4' : 'mp3'}`;
      const outputPath = path.join(outputDir, outputName);

      let command;

      if (imagePath) {
        // Generación de video a partir de una imagen estática y el audio
        command = ffmpeg()
          .input(imagePath)
          .loop(clipDuration)
          .inputOptions('-framerate 1')
          .videoFilters('scale=1080:1080,format=yuv420p')
          .input(inputPath)
          .setStartTime(start)
          .duration(clipDuration)
          .outputOptions([
            '-c:v libx264',
            '-preset veryfast',
            '-crf 23',
            '-c:a aac',
            '-b:a 128k',
            '-shortest',
            '-movflags +faststart'
          ]);
      } else {
        // Si no hay imágenes solo recortamos el audio
        command = ffmpeg(inputPath)
          .setStartTime(start)
          .duration(clipDuration);
      }

      command
        .output(outputPath)
        // Cuando termina la generación de un clip actualizamos el estado
        .on('end', () => {
          completed++;
          jobs[jobId].clips_generated = completed;
          jobs[jobId].progress = Math.round((completed / numClips) * 100);
          jobs[jobId].download_urls.push(`/public/clips/${outputName}`);
          if (completed === numClips) {
            jobs[jobId].status = 'completed';
          }
        })
        // En caso de error marcamos el trabajo como fallido
        .on('error', (err) => {
          console.error('FFmpeg error:', err.message);
          jobs[jobId].status = 'failed';
          jobs[jobId].error_message = err.message;
        })
        .run();
    }

    res.json({ job_id: jobId });
  });
});

// ---------------------------
// Procesamiento de video directamente
// ---------------------------
// Cuando el usuario sube únicamente un video, esta ruta divide el archivo
// en clips de la duración solicitada sin necesidad de imágenes o audio
// adicionales.
app.post('/process-video', upload, (req, res) => {
  const clipDuration = parseInt(req.body.clip_duration) || 60;
  const videoFile = req.files?.video?.[0];

  if (!videoFile) {
    return res.status(400).json({ error: 'Archivo de video no recibido' });
  }

  // Rutas de trabajo para el video subido
  const inputPath = videoFile.path;
  const outputDir = path.join(__dirname, 'public', 'clips');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Registramos el trabajo con un ID único
  const jobId = uuidv4();
  jobs[jobId] = {
    status: 'processing',
    progress: 0,
    total_clips: 0,
    clips_generated: 0,
    download_urls: []
  };

  // Con ffprobe obtenemos la duración total del video
  ffmpeg.ffprobe(inputPath, (err, metadata) => {
    if (err) {
      jobs[jobId].status = 'failed';
      jobs[jobId].error_message = err.message;
      return res.status(500).json({ error: err.message });
    }

    const duration = metadata.format.duration;
    const numClips = Math.floor(duration / clipDuration);
    jobs[jobId].total_clips = numClips;
    let completed = 0;

    // Generamos cada clip individual
    for (let i = 0; i < numClips; i++) {
      const start = i * clipDuration;
      const outputName = `${jobId}_clip${i + 1}.mp4`;
      const outputPath = path.join(outputDir, outputName);

      ffmpeg(inputPath)
        .setStartTime(start)
        .duration(clipDuration)
        .outputOptions([
          '-c:v libx264',
          '-preset veryfast',
          '-crf 23',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart'
        ])
        .output(outputPath)
        // Actualizamos los datos del trabajo al finalizar cada clip
        .on('end', () => {
          completed++;
          jobs[jobId].clips_generated = completed;
          jobs[jobId].progress = Math.round((completed / numClips) * 100);
          jobs[jobId].download_urls.push(`/public/clips/${outputName}`);
          if (completed === numClips) {
            jobs[jobId].status = 'completed';
          }
        })
        // Manejo de errores de FFmpeg
        .on('error', (err) => {
          console.error('FFmpeg error:', err.message);
          jobs[jobId].status = 'failed';
          jobs[jobId].error_message = err.message;
        })
        .run();
    }

    res.json({ job_id: jobId });
  });
});

app.get('/job/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (job) {
    res.json(job);
  } else {
    res.status(404).json({ error: 'Trabajo no encontrado' });
  }
});
app.get('/', (req, res) => {
  res.send('🚀 Backend de PodClip está funcionando correctamente');
});

app.listen(port, () => {
  console.log(`✅ Backend corriendo en http://localhost:${port}`);
});

