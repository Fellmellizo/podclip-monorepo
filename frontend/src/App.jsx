import React, { useState, useEffect } from 'react';
import { Upload, Play, Settings, Loader2, Music, Image as ImageIcon } from 'lucide-react';
// Solo utilizamos el servidor local durante el desarrollo
const baseURL = 'http://localhost:3001';

const PodClipApp = () => {
  const [audioFile, setAudioFile] = useState(null);
  const [imageFiles, setImageFiles] = useState([]);
  const [settings, setSettings] = useState({
    clipDuration: 60,
    showName: '',
    episodeTitle: '',
    socialPlatform: 'instagram',
    autoCaptions: true
  });
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (jobId && isProcessing) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`${baseURL}/job/${jobId}`);

          const status = await response.json();
          setJobStatus(status);

          if (status.status === 'completed' || status.status === 'failed') {
            setIsProcessing(false);
            clearInterval(interval);
          }
        } catch (error) {
          console.error('Error checking job status:', error);
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [jobId, isProcessing]);

  const handleAudioUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
    } else {
      alert('Por favor selecciona un archivo de audio válido');
    }
  };

  const handleImageUpload = (event) => {
    const files = Array.from(event.target.files || event.dataTransfer.files);
    const validImages = files.filter(file => file.type.startsWith('image/'));
    setImageFiles(prev => [...prev, ...validImages]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleImageUpload(e);
  };

  const handleProcess = async () => {
    if (!audioFile) return alert('Por favor selecciona un archivo de audio');
    if (!settings.showName || !settings.episodeTitle) {
      return alert('Por favor completa el nombre del show y título del episodio');
    }

    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      imageFiles.forEach(img => formData.append('image', img));
      formData.append('clip_duration', settings.clipDuration);
      formData.append('show_name', settings.showName);
      formData.append('episode_title', settings.episodeTitle);
      formData.append('social_platform', settings.socialPlatform);
      formData.append('auto_captions', settings.autoCaptions);

      const response = await fetch(`${baseURL}/process-podcast`, {

        method: 'POST',
        body: formData
      });

      const result = await response.json();
      setJobId(result.job_id);
      setJobStatus({ status: 'queued', progress: 0 });
    } catch (error) {
      console.error('Error al procesar el podcast:', error);
      setIsProcessing(false);
      alert('Error al procesar el podcast');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'processing': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white p-4">
      <div className="w-full max-w-5xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold mb-2">🎙️ PodClip</h1>
          <p className="text-lg opacity-90">Convierte tu podcast en clips virales para redes sociales</p>
        </div>

        {/* Audio Upload */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 text-gray-800">
          <h2 className="text-2xl font-semibold mb-4 flex items-center">
            <Music className="mr-2" size={24} /> Subir Archivo de Audio
          </h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500">
            <input
              type="file"
              accept="audio/*"
              onChange={handleAudioUpload}
              className="hidden"
              id="audio-upload"
            />
            <label htmlFor="audio-upload" className="cursor-pointer block">
              {audioFile ? (
                <div className="flex items-center justify-center text-green-600 font-medium">
                  <Play className="mr-2" size={20} /> {audioFile.name}
                </div>
              ) : (
                <>
                  <Upload className="mx-auto mb-2" size={40} />
                  <p>Haz clic o arrastra tu archivo de audio aquí</p>
                  <p className="text-sm text-gray-400 mt-1">Formatos soportados: MP3, WAV, M4A, OGG</p>
                </>
              )}
            </label>
          </div>
        </div>

        {/* Imagenes con Drag & Drop */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 text-gray-800">
          <h2 className="text-2xl font-semibold mb-4 flex items-center">
            <ImageIcon className="mr-2" size={24} /> Subir Imágenes para los Clips
          </h2>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            }`}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
              id="image-upload"
            />
            <label htmlFor="image-upload" className="cursor-pointer block text-gray-600">
              <Upload className="mx-auto mb-2" size={40} />
              <p>Haz clic o arrastra tus imágenes aquí</p>
              <p className="text-sm text-gray-400 mt-1">Se usarán en orden para los clips</p>
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
            {imageFiles.map((img, i) => (
              <div
                key={i}
                className="relative rounded-xl overflow-hidden border border-gray-200 shadow-md group"
              >
                <img
                  src={URL.createObjectURL(img)}
                  alt={`Imagen ${i + 1}`}
                  className="w-full h-40 object-cover"
                />
                <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-2 py-0.5 rounded">
                  #{i + 1}
                </div>
                <button
                  onClick={() => setImageFiles(prev => prev.filter((_, idx) => idx !== i))}
                  title="Eliminar"
                  className="absolute top-2 right-2 bg-red-100 hover:bg-red-600 text-red-700 hover:text-white rounded-full w-8 h-8 flex items-center justify-center shadow-md transition-transform duration-200 transform hover:scale-110"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Configuración y Botón */}
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 text-gray-800">
          <h2 className="text-2xl font-semibold mb-4 flex items-center">
            <Settings className="mr-2" size={24} /> Configuración
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <input type="text" placeholder="Nombre del Show" value={settings.showName}
              onChange={(e) => setSettings({ ...settings, showName: e.target.value })}
              className="border rounded-lg px-3 py-2" />
            <input type="text" placeholder="Título del Episodio" value={settings.episodeTitle}
              onChange={(e) => setSettings({ ...settings, episodeTitle: e.target.value })}
              className="border rounded-lg px-3 py-2" />
            <select value={settings.clipDuration}
              onChange={(e) => setSettings({ ...settings, clipDuration: parseInt(e.target.value) })}
              className="border rounded-lg px-3 py-2">
              <option value={30}>30 segundos</option>
              <option value={60}>60 segundos</option>
              <option value={90}>90 segundos</option>
              <option value={120}>2 minutos</option>
            </select>
            <select value={settings.socialPlatform}
              onChange={(e) => setSettings({ ...settings, socialPlatform: e.target.value })}
              className="border rounded-lg px-3 py-2">
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube Shorts</option>
            </select>
            <label className="col-span-2 flex items-center">
              <input type="checkbox" checked={settings.autoCaptions}
                onChange={(e) => setSettings({ ...settings, autoCaptions: e.target.checked })}
                className="mr-2" />
              Generar subtítulos automáticamente
            </label>
          </div>
          <div className="text-center mt-6">
            <button
              onClick={handleProcess}
              disabled={isProcessing || !audioFile}
              className={`px-8 py-3 rounded-lg font-semibold text-white ${
                isProcessing || !audioFile ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isProcessing ? (
                <div className="flex items-center">
                  <Loader2 className="animate-spin mr-2" size={20} />
                  Procesando...
                </div>
              ) : (
                '🚀 Generar Clips'
              )}
            </button>
          </div>
        </div>

        {/* Estado */}
        {jobStatus && (
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 text-gray-800">
            <h2 className="text-2xl font-semibold mb-4">Estado del Proceso</h2>
            <div className={`font-semibold ${getStatusColor(jobStatus.status)}`}>
              {jobStatus.status}
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full mb-4">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${jobStatus.progress}%` }} />
            </div>
            {jobStatus.status === 'completed' && jobStatus.download_urls && (
  <div className="flex flex-col space-y-2">
    {jobStatus.download_urls.map((url, i) => (
      <a
        key={i}
        href={`http://localhost:3001${url}`}
        className="text-green-700 underline text-sm"
        download={`clip${i + 1}.mp4`}
      >
        Descargar Clip {i + 1}
      </a>
    ))}
  </div>
)}

            {jobStatus.status === 'failed' && (
              <div className="text-red-600 mt-4">
                ❌ Error: {jobStatus.error_message || 'Error desconocido'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PodClipApp;
