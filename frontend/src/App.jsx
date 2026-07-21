import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Upload, 
  Play, 
  Clock, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  Video, 
  RotateCcw,
  Tag,
  Loader2,
  ListVideo
} from 'lucide-react';

// Format seconds into a friendly timestamp string (MM:SS or HH:MM:SS)
const formatTime = (secs) => {
  if (isNaN(secs) || secs === null) return "0:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  
  const mStr = h > 0 ? String(m).padStart(2, '0') : String(m);
  const sStr = String(s).padStart(2, '0');
  
  if (h > 0) {
    return `${h}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
};

function App() {
  // Main states
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle', 'uploading', 'processing', 'completed', 'failed'
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [activeChapter, setActiveChapter] = useState(null);
  
  // UI states
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState('');
  
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Drag-and-drop event handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && (droppedFile.type.startsWith('video/') || droppedFile.name.endsWith('.mp4') || droppedFile.name.endsWith('.mov'))) {
      selectFile(droppedFile);
    } else {
      setError('Please drop a valid video file (.mp4 or .mov)');
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      selectFile(selectedFile);
    }
  };

  const selectFile = (selectedFile) => {
    setFile(selectedFile);
    setVideoUrl(URL.createObjectURL(selectedFile));
    setJobId('');
    setStatus('idle');
    setProgress(0);
    setResult(null);
    setActiveChapter(null);
    setError('');
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Upload video and trigger processing pipeline
  const handleUpload = async (e) => {
    if (e) e.preventDefault();
    if (!file) return;

    setStatus('uploading');
    setProgress(0);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/process-video', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || progressEvent.loaded)
          );
          // Scale upload progress to represent the first 15% of the total pipeline
          setProgress(Math.round(percentCompleted * 0.15));
        }
      });

      const data = response.data;
      setJobId(data.job_id);
      setStatus('processing');
      setProgress(25);
    } catch (err) {
      console.error('Upload failed:', err);
      setError(err.response?.data?.detail || 'Failed to upload the video file.');
      setStatus('failed');
    }
  };

  // Poll background job status from the server
  useEffect(() => {
    let intervalId;
    if (jobId && status === 'processing') {
      intervalId = setInterval(async () => {
        try {
          const response = await axios.get(`/api/jobs/${jobId}`);
          const data = response.data;

          setProgress(data.progress_percentage);
          
          if (data.status === 'completed') {
            setStatus('completed');
            setResult(data.result);
            clearInterval(intervalId);
          } else if (data.status === 'failed') {
            setStatus('failed');
            setError('Chapter generation pipeline failed. Please try again.');
            clearInterval(intervalId);
          }
        } catch (err) {
          console.error('Error polling status:', err);
          setError('Lost connection to backend server.');
          setStatus('failed');
          clearInterval(intervalId);
        }
      }, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId, status]);

  // Track video current playing time to update active chapter indicator
  const handleTimeUpdate = () => {
    if (!videoRef.current || !result || !result.chapters) return;
    const currentTime = videoRef.current.currentTime;
    const currentChapter = result.chapters.find(
      (ch) => currentTime >= ch.start_time && currentTime <= ch.end_time
    );
    if (currentChapter && (!activeChapter || activeChapter.start_time !== currentChapter.start_time)) {
      setActiveChapter(currentChapter);
    }
  };

  // Navigation: play video at specified seconds
  const playChapter = (chapter) => {
    if (videoRef.current) {
      videoRef.current.currentTime = chapter.start_time;
      videoRef.current.play();
      setActiveChapter(chapter);
    }
  };

  const resetAll = () => {
    setFile(null);
    setVideoUrl('');
    setJobId('');
    setStatus('idle');
    setProgress(0);
    setResult(null);
    setActiveChapter(null);
    setError('');
  };

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen p-8 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-indigo-500 to-violet-600 p-2 rounded-xl shadow-md">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-2 leading-none">
              ClipForge AI v1.0
            </h1>
            <p className="text-[11px] text-slate-400 mt-1">Smart Auto-Chapter Generator for Long-Form Videos</p>
          </div>
        </div>
        
        {file && (
          <button 
            onClick={resetAll}
            className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Upload New Video
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-[1600px] w-full mx-auto flex flex-col">
        {!file ? (
          /* Drag & Drop Upload Zone */
          <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full py-12">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-extrabold tracking-tight text-white mb-3">
                Segment your videos with <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">AI Precision</span>
              </h2>
              <p className="text-slate-400 text-base">
                Upload your video, and let local speech-to-text models combined with Gemini or Groq auto-generate interactive, timestamps-linked chapters.
              </p>
            </div>

            {/* Styled Drag & Drop Area with click interaction */}
            <div 
              onClick={triggerFileInput}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full text-center transition-all flex flex-col items-center justify-center cursor-pointer min-h-[300px] ${
                isDragOver 
                  ? 'border-2 border-dashed border-indigo-500 bg-indigo-500/10 p-8 rounded-2xl shadow-[0_0_30px_rgba(99,102,241,0.15)]' 
                  : 'border-2 border-dashed border-slate-700 bg-slate-900/60 p-8 rounded-2xl hover:border-indigo-500'
              }`}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".mp4,.mov" 
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700 mb-4 transition-transform hover:scale-105">
                <Upload className="h-8 w-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1.5">Drag and drop your video file</h3>
              <p className="text-slate-400 text-xs mb-3">Supports MP4, MOV up to 200MB</p>
              
              <div className="text-slate-500 text-xs px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-900">
                Click to browse files manually
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-xs w-full">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : (
          /* Dashboard columns: Player (7 cols) | Chapters (5 cols) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 w-full">
            
            {/* Left Area (7 columns) - Media Player & Action controls */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Media Player Container */}
              <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-2xl relative group">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  className="w-full h-auto aspect-video object-contain"
                />
                {status === 'processing' && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <Loader2 className="h-10 w-10 text-indigo-400 animate-spin mb-4" />
                    <h4 className="font-bold text-white text-lg">AI Chapter Generation In Progress</h4>
                    <p className="text-slate-400 text-xs max-w-sm mt-1 leading-relaxed">
                      We are currently transcribing your video audio locally and generating optimized chapters. Please keep this tab open.
                    </p>
                  </div>
                )}
              </div>

              {/* File Info and Status Progress Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* File Details / Trigger Actions */}
                <div className="bg-slate-900/60 border border-slate-900 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400">Target File</span>
                    <div className="flex items-center gap-2.5 mt-1.5 mb-4">
                      <div className="bg-slate-800 p-2 rounded-lg text-slate-300 border border-slate-700/80">
                        <Video className="h-4 w-4" />
                      </div>
                      <div className="overflow-hidden">
                        <h4 className="font-bold text-white text-xs truncate leading-tight">{file.name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                      </div>
                    </div>
                  </div>

                  {status === 'idle' && (
                    <button
                      onClick={handleUpload}
                      className="w-full flex items-center justify-center gap-2 font-bold px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-xl shadow-md transition-all transform hover:-translate-y-0.5 text-xs"
                    >
                      <Sparkles className="h-4 w-4" />
                      Generate AI Chapters
                    </button>
                  )}
                  
                  {status !== 'idle' && (
                    <div className="text-[11px] text-slate-500 italic">
                      Job ID: <span className="font-mono bg-slate-950 px-1 py-0.5 rounded border border-slate-900">{jobId.substring(0, 8)}...</span>
                    </div>
                  )}
                </div>

                {/* Progress Tracking Card */}
                {status !== 'idle' && (
                  <div className="bg-slate-900/60 border border-slate-900 rounded-2xl p-5 shadow-sm">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400">Pipeline Status</span>
                    
                    <div className="flex items-center justify-between mt-1.5 mb-2">
                      <span className="text-xs font-semibold flex items-center gap-2 text-white">
                        {status === 'uploading' && (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                            Uploading video...
                          </>
                        )}
                        {status === 'processing' && (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
                            Processing...
                          </>
                        )}
                        {status === 'completed' && (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Completed</span>
                          </>
                        )}
                        {status === 'failed' && (
                          <>
                            <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                            <span className="text-rose-400">Failed</span>
                          </>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono font-bold bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                        {progress}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-3 border border-slate-750">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                          status === 'failed' 
                            ? 'bg-rose-500' 
                            : status === 'completed' 
                              ? 'bg-emerald-500' 
                              : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Active Chapter Details display */}
              <div className="bg-slate-900/30 border border-slate-900/60 rounded-2xl p-4 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Currently Playing</span>
                {activeChapter ? (
                  <div>
                    <h4 className="font-bold text-white text-sm leading-tight mb-1">{activeChapter.title}</h4>
                    <p className="text-xs text-slate-400">{activeChapter.summary}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No chapter active. Start playing the video or select a chapter to begin.</p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Error:</span> {error}
                  </div>
                </div>
              )}
            </div>

            {/* Right Area (5 columns) - Chapters Sidebar */}
            <div className="lg:col-span-5 flex flex-col gap-3 h-full max-h-[600px]">
              <div className="flex items-center justify-between px-1 mb-1">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <ListVideo className="h-4 w-4 text-indigo-400" />
                  Video Chapters
                </h3>
                {result && (
                  <span className="text-slate-400 text-xs font-semibold px-2 py-0.5 bg-slate-900 border border-slate-800 rounded-full">
                    {result.chapters?.length || 0} chapters
                  </span>
                )}
              </div>

              {/* Scrollable list of chapters */}
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 custom-scrollbar">
                {status === 'completed' && result?.chapters && result.chapters.length > 0 ? (
                  result.chapters.map((chapter, index) => {
                    const isActive = activeChapter && activeChapter.start_time === chapter.start_time;
                    return (
                      <div
                        key={index}
                        onClick={() => playChapter(chapter)}
                        className={`p-4 rounded-xl border cursor-pointer text-left transition-all relative ${
                          isActive
                            ? 'bg-indigo-600/15 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.08)]'
                            : 'bg-slate-900/40 border-slate-900 hover:bg-slate-800/50 hover:border-slate-800'
                        }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-xl" />
                        )}
                        
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-indigo-400 font-mono flex items-center gap-1.5">
                            <Clock className="h-3 w-3" />
                            {formatTime(chapter.start_time)} – {formatTime(chapter.end_time)}
                          </span>
                          <span className="text-[10px] text-slate-500 bg-slate-950 border border-slate-850 px-1.5 py-0.5 rounded">
                            Ch {index + 1}
                          </span>
                        </div>

                        <h4 className={`font-bold text-xs mb-1.5 leading-snug ${isActive ? 'text-indigo-300' : 'text-slate-100'}`}>
                          {chapter.title}
                        </h4>

                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
                          {chapter.summary}
                        </p>

                        {/* Tags badges */}
                        <div className="flex flex-wrap gap-1.5">
                          {chapter.tags?.map((kw, i) => (
                            <span 
                              key={i} 
                              className="text-[9px] font-medium bg-slate-950 text-slate-400 border border-slate-900 px-2 py-0.5 rounded-full flex items-center gap-1"
                            >
                              <Tag className="h-2.5 w-2.5 text-indigo-400/75" />
                              {kw}
                            </span>
                          ))}
                        </div>

                      </div>
                    );
                  })
                ) : status === 'completed' ? (
                  <div className="flex flex-col items-center justify-center p-8 bg-slate-900/40 border border-slate-900 rounded-xl text-center text-slate-500">
                    <Clock className="h-8 w-8 mb-2" />
                    <p className="text-xs">No chapters were generated for this video.</p>
                  </div>
                ) : status === 'processing' || status === 'uploading' ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-900/40 border border-slate-900 rounded-xl text-center text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mb-3" />
                    <p className="text-xs font-semibold text-slate-350">Awaiting processing...</p>
                    <p className="text-[11px] mt-1">Chapters will populate here in real-time as they are ready.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 bg-slate-900/30 border border-slate-900 rounded-xl text-center text-slate-500 border-dashed">
                    <ListVideo className="h-8 w-8 text-slate-700 mb-3" />
                    <p className="text-xs font-bold text-slate-400">Timeline not available</p>
                    <p className="text-[11px] max-w-[200px] mt-1 leading-relaxed">Submit your video to extract and navigate interactive chapters.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-4 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} ClipForge AI. All rights reserved. Powered by local Whisper and Gemini/Groq LLMs.
      </footer>
    </div>
  );
}

export default App;
