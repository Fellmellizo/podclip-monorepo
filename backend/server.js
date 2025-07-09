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

ffmpeg.setFfmpegPath(ffmpegPath);

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

// Multer setup
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
  { name: 'image', maxCount: 100 }
]);

// Job tracking
const jobs = {};

app.post('/process-podcast', upload, (req, res) => {
  const clipDuration = parseInt(req.body.clip_duration) || 60;
  const audioFile = req.files?.audio?.[0];
  const imageFiles = req.files?.image || [];

  if (!audioFile) {
    return res.status(400).json({ error: 'Archivo de audio no recibido' });
  }

  const inputPath = audioFile.path;
  const outputDir = path.join(__dirname, 'public', 'clips');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const jobId = uuidv4();
  jobs[jobId] = {
    status: 'processing',
    progress: 0,
    total_clips: 0,
    clips_generated: 0,
    download_urls: []
  };

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

    for (let i = 0; i < numClips; i++) {
      const start = i * clipDuration;
      const imagePath = imageFiles[i % imageFiles.length]?.path || null;
      const outputName = `${jobId}_clip${i + 1}.${imagePath ? 'mp4' : 'mp3'}`;
      const outputPath = path.join(outputDir, outputName);

      let command;

      if (imagePath) {
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
        command = ffmpeg(inputPath)
          .setStartTime(start)
          .duration(clipDuration);
      }

      command
        .output(outputPath)
        .on('end', () => {
          completed++;
          jobs[jobId].clips_generated = completed;
          jobs[jobId].progress = Math.round((completed / numClips) * 100);
          jobs[jobId].download_urls.push(`/public/clips/${outputName}`);
          if (completed === numClips) {
            jobs[jobId].status = 'completed';
          }
        })
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

