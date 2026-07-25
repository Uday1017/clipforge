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
  ListVideo,
  Edit2, 
  Check, 
  Download, 
  FileText, 
  BookOpen, 
  Lightbulb, 
  Trash2, 
  Plus, 
  ChevronDown, 
  HelpCircle, 
  Save, 
  X
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
  const [activeTab, setActiveTab] = useState('chapters'); // 'chapters', 'transcript', 'summary'
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Editing Chapter States
  const [editingChapterIndex, setEditingChapterIndex] = useState(null);
  const [editChapterTitle, setEditChapterTitle] = useState('');
  const [editChapterSummary, setEditChapterSummary] = useState('');
  const [editChapterStart, setEditChapterStart] = useState('');
  const [editChapterEnd, setEditChapterEnd] = useState('');
  const [editChapterTags, setEditChapterTags] = useState('');

  // Editing Transcript States
  const [editingSegmentIndex, setEditingSegmentIndex] = useState(null);
  const [editSegmentText, setEditSegmentText] = useState('');

  // Interactive Summary Q&A Filter State
  const [selectedTag, setSelectedTag] = useState(null);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Editing chapter handlers
  const startEditChapter = (index, chapter) => {
    setEditingChapterIndex(index);
    setEditChapterTitle(chapter.title);
    setEditChapterSummary(chapter.summary);
    setEditChapterStart(chapter.start_time);
    setEditChapterEnd(chapter.end_time);
    setEditChapterTags(chapter.tags ? chapter.tags.join(', ') : '');
  };

  const saveChapterEdit = (index) => {
    if (!result) return;
    const updated = {
      title: editChapterTitle,
      summary: editChapterSummary,
      start_time: parseFloat(editChapterStart) || 0,
      end_time: parseFloat(editChapterEnd) || 0,
      tags: editChapterTags.split(',').map(t => t.trim()).filter(Boolean)
    };
    const newChapters = [...result.chapters];
    newChapters[index] = updated;
    newChapters.sort((a, b) => a.start_time - b.start_time);
    setResult({ ...result, chapters: newChapters });
    setEditingChapterIndex(null);
  };

  const deleteChapter = (index) => {
    if (!result) return;
    const newChapters = result.chapters.filter((_, i) => i !== index);
    setResult({ ...result, chapters: newChapters });
  };

  const addChapter = () => {
    if (!result) return;
    const newChapter = {
      title: 'New Chapter',
      summary: 'Summary of the new section.',
      start_time: 0,
      end_time: result.total_duration || 60,
      tags: ['custom']
    };
    const newChapters = [...result.chapters, newChapter];
    setResult({ ...result, chapters: newChapters });
    startEditChapter(newChapters.length - 1, newChapter);
  };

  // Editing transcript segment handlers
  const startEditSegment = (index, segment) => {
    setEditingSegmentIndex(index);
    setEditSegmentText(segment.text);
  };

  const saveSegmentEdit = (index) => {
    if (!result || !result.transcript) return;
    const newTranscript = [...result.transcript];
    newTranscript[index] = { ...newTranscript[index], text: editSegmentText };
    setResult({ ...result, transcript: newTranscript });
    setEditingSegmentIndex(null);
  };

  // Export functions
  const formatSrtTime = (seconds) => {
    const date = new Date(null);
    date.setSeconds(seconds);
    const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
    const timeStr = date.toISOString().substr(11, 8);
    return `${timeStr},${ms}`;
  };

  const formatVttTime = (seconds) => {
    const date = new Date(null);
    date.setSeconds(seconds);
    const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
    const timeStr = date.toISOString().substr(11, 8);
    return `${timeStr}.${ms}`;
  };

  const formatYoutubeTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const mStr = String(m).padStart(2, '0');
    const sStr = String(s).padStart(2, '0');
    if (h > 0) {
      return `${h}:${mStr}:${sStr}`;
    }
    return `${m}:${sStr}`;
  };

  const downloadFile = (content, filename, contentType) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToSrt = () => {
    if (!result || !result.transcript) return;
    let content = '';
    result.transcript.forEach((seg, index) => {
      content += `${index + 1}\n`;
      content += `${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n`;
      content += `${seg.text}\n\n`;
    });
    downloadFile(content, `${result.video_id}_subtitles.srt`, 'text/srt');
    setShowExportMenu(false);
  };

  const exportToVtt = () => {
    if (!result || !result.transcript) return;
    let content = 'WEBVTT\n\n';
    result.transcript.forEach((seg, index) => {
      content += `${index + 1}\n`;
      content += `${formatVttTime(seg.start)} --> ${formatVttTime(seg.end)}\n`;
      content += `${seg.text}\n\n`;
    });
    downloadFile(content, `${result.video_id}_subtitles.vtt`, 'text/vtt');
    setShowExportMenu(false);
  };

  const exportToYoutube = () => {
    if (!result || !result.chapters) return;
    let content = '';
    result.chapters.forEach((ch) => {
      content += `${formatYoutubeTime(ch.start_time)} ${ch.title}\n`;
    });
    downloadFile(content, `${result.video_id}_youtube_chapters.txt`, 'text/plain');
    setShowExportMenu(false);
  };

  const escapeXml = (str) => {
    return str.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  };

  const exportToXml = () => {
    if (!result) return;
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<video_metadata>\n`;
    xml += `  <video_id>${result.video_id}</video_id>\n`;
    xml += `  <total_duration>${result.total_duration}</total_duration>\n`;
    xml += `  <summary>${escapeXml(result.video_summary || '')}</summary>\n`;
    xml += `  <chapters>\n`;
    result.chapters.forEach((ch) => {
      xml += `    <chapter>\n`;
      xml += `      <title>${escapeXml(ch.title)}</title>\n`;
      xml += `      <start_time>${ch.start_time}</start_time>\n`;
      xml += `      <end_time>${ch.end_time}</end_time>\n`;
      xml += `      <summary>${escapeXml(ch.summary)}</summary>\n`;
      xml += `    </chapter>\n`;
    });
    xml += `  </chapters>\n`;
    if (result.transcript) {
      xml += `  <transcript>\n`;
      result.transcript.forEach((seg) => {
        xml += `    <segment start="${seg.start}" end="${seg.end}">${escapeXml(seg.text)}</segment>\n`;
      });
      xml += `  </transcript>\n`;
    }
    xml += `</video_metadata>\n`;
    downloadFile(xml, `${result.video_id}_metadata.xml`, 'application/xml');
    setShowExportMenu(false);
  };

  const highlightText = (text, highlight) => {
    if (!highlight.trim()) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase()
            ? <mark key={i} style={{background: 'yellow', color: 'black', padding: '1px', borderRadius: '2px'}}>{part}</mark>
            : part
        )}
      </span>
    );
  };

  const generatePdfReport = () => {
    if (!result) return;
    const printWindow = window.open('', '_blank');
    const chaptersHtml = result.chapters.map((ch, idx) => `
      <table width="100%" cellpadding="5" style="border: 1px solid #e2e8f0; margin: 10px 0; background: #ffffff;">
        <tr>
          <td style="font: bold 12px Arial; color: #4f46e5;">Chapter ${idx + 1}: ${ch.title}</td>
          <td align="right" style="font: bold 12px Arial; color: #4f46e5;">${formatTime(ch.start_time)} - ${formatTime(ch.end_time)}</td>
        </tr>
        <tr>
          <td colspan="2" style="font: 12px Arial; color: #4a5568;">${ch.summary}</td>
        </tr>
        <tr>
          <td colspan="2" style="font: 10px Arial; color: #718096;">Tags: ${ch.tags ? ch.tags.join(', ') : 'none'}</td>
        </tr>
      </table>
    `).join('');

    const transcriptHtml = result.transcript ? result.transcript.map(seg => `
      <p style="margin: 6px 0;">
        <span style="color: #4f46e5; font: bold 12px Arial;">[${formatTime(seg.start)}]</span> &nbsp; ${seg.text}
      </p>
    `).join('') : '<p>No transcript available.</p>';

    printWindow.document.write(`
      <html>
        <head>
          <title>ClipForge Report - ${result.video_id}</title>
          <style>
            body { font: 14px Arial, Helvetica; color: #1a202c; padding: 40px; }
            h1 { color: #4f46e5; }
            h2 { color: #2d3748; border: 1px solid #4f46e5; padding: 6px; }
            .summary { background: #f7fafc; padding: 15px; border: 1px solid #4f46e5; }
          </style>
        </head>
        <body>
          <h1>ClipForge AI Video Report</h1>
          <div style="color: #718096; font: 12px Arial; margin: 10px 0 20px 0;">Video ID: ${result.video_id} | Total Duration: ${formatTime(result.total_duration)}</div>
          
          <h2>AI Summary</h2>
          <div class="summary">${result.video_summary || 'No summary available.'}</div>
          
          <h2>Video Chapters</h2>
          <div>${chaptersHtml}</div>
          
          <h2>Transcript</h2>
          <div>${transcriptHtml}</div>
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

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
    setActiveTab('chapters');
    setEditingChapterIndex(null);
    setEditingSegmentIndex(null);
    setSelectedTag(null);
    setActiveQuestionId(null);
    setShowExportMenu(false);
    setSearchTerm('');
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

            {/* Right Area (5 columns) - Tabs Sidebar */}
            <div className="lg:col-span-5 flex flex-col gap-3 h-full max-h-[700px]">
              
              {/* Tab Navigation header */}
              <div className="flex border-b border-slate-900 bg-slate-900/40 p-1 rounded-xl shrink-0">
                <button
                  onClick={() => setActiveTab('chapters')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'chapters'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <ListVideo className="h-3.5 w-3.5" />
                  Chapters
                </button>
                <button
                  onClick={() => setActiveTab('transcript')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'transcript'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Transcript
                </button>
                <button
                  onClick={() => setActiveTab('summary')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'summary'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  AI Summary
                </button>
              </div>

              {/* Tab Content Panels */}
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 custom-scrollbar">
                
                {status !== 'completed' ? (
                  // General Awaiting / Processing UI for all tabs
                  status === 'processing' || status === 'uploading' ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-900/40 border border-slate-900 rounded-xl text-center text-slate-500">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mb-3" />
                      <p className="text-xs font-semibold text-slate-350">Awaiting processing...</p>
                      <p className="text-[11px] mt-1">AI content will populate here in real-time as it is ready.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 bg-slate-900/30 border border-slate-900 rounded-xl text-center text-slate-500 border-dashed animate-pulse">
                      <ListVideo className="h-8 w-8 text-slate-750 mb-3" />
                      <p className="text-xs font-bold text-slate-450">Timeline not available</p>
                      <p className="text-[11px] max-w-[200px] mt-1 leading-relaxed">Submit your video to extract and navigate interactive chapters.</p>
                    </div>
                  )
                ) : (
                  // Active completed states
                  <>
                    {/* 1. CHAPTERS TAB */}
                    {activeTab === 'chapters' && (
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-xs text-slate-400">{result?.chapters?.length || 0} Chapters</span>
                          <button
                            onClick={addChapter}
                            className="text-[10px] font-bold bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded flex items-center gap-1 transition-all"
                          >
                            <Plus className="h-3 w-3" /> Add Chapter
                          </button>
                        </div>

                        {result?.chapters && result.chapters.length > 0 ? (
                          result.chapters.map((chapter, index) => {
                            const isActive = activeChapter && activeChapter.start_time === chapter.start_time;
                            const isEditing = editingChapterIndex === index;

                            if (isEditing) {
                              return (
                                <div key={index} className="p-4 rounded-xl border border-indigo-500 bg-slate-900 flex flex-col gap-3 text-left">
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chapter Title</label>
                                    <input
                                      type="text"
                                      value={editChapterTitle}
                                      onChange={(e) => setEditChapterTitle(e.target.value)}
                                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                    />
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Time (sec)</label>
                                      <input
                                        type="number"
                                        step="any"
                                        value={editChapterStart}
                                        onChange={(e) => setEditChapterStart(e.target.value)}
                                        className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">End Time (sec)</label>
                                      <input
                                        type="number"
                                        step="any"
                                        value={editChapterEnd}
                                        onChange={(e) => setEditChapterEnd(e.target.value)}
                                        className="w-full mt-1 bg-slate-955 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Summary</label>
                                    <textarea
                                      value={editChapterSummary}
                                      onChange={(e) => setEditChapterSummary(e.target.value)}
                                      rows="2"
                                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tags (comma-separated)</label>
                                    <input
                                      type="text"
                                      value={editChapterTags}
                                      onChange={(e) => setEditChapterTags(e.target.value)}
                                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                                    />
                                  </div>

                                  <div className="flex justify-end gap-2 mt-1">
                                    <button
                                      onClick={() => setEditingChapterIndex(null)}
                                      className="text-xs px-2.5 py-1.5 border border-slate-800 bg-slate-950 rounded hover:bg-slate-805 text-slate-300"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => saveChapterEdit(index)}
                                      className="text-xs px-2.5 py-1.5 bg-indigo-600 rounded hover:bg-indigo-750 text-white flex items-center gap-1"
                                    >
                                      <Save className="h-3 w-3" /> Save
                                    </button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={index}
                                onClick={() => playChapter(chapter)}
                                className={`p-4 rounded-xl border cursor-pointer text-left transition-all relative group ${
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
                                  
                                  {/* Edit/Delete Actions */}
                                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startEditChapter(index, chapter);
                                      }}
                                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                                      title="Edit Chapter"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteChapter(index);
                                      }}
                                      className="p-1 hover:bg-rose-950/40 rounded text-slate-400 hover:text-rose-450"
                                      title="Delete Chapter"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                    <span className="text-[10px] text-slate-500 bg-slate-950 border border-slate-850 px-1.5 py-0.5 rounded ml-1">
                                      Ch {index + 1}
                                    </span>
                                  </div>
                                  
                                  {!isActive && (
                                    <span className="text-[10px] text-slate-505 bg-slate-950 border border-slate-850 px-1.5 py-0.5 rounded group-hover:hidden">
                                      Ch {index + 1}
                                    </span>
                                  )}
                                </div>

                                <h4 className={`font-bold text-xs mb-1.5 leading-snug ${isActive ? 'text-indigo-300' : 'text-slate-100'}`}>
                                  {chapter.title}
                                </h4>

                                <p className="text-xs text-slate-450 line-clamp-2 leading-relaxed mb-3">
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
                        ) : (
                          <div className="flex flex-col items-center justify-center p-8 bg-slate-900/40 border border-slate-900 rounded-xl text-center text-slate-500">
                            <Clock className="h-8 w-8 mb-2" />
                            <p className="text-xs">No chapters available. Click "Add Chapter" to create one.</p>
                          </div>
                        )}
                      </div>
                    )}                    {/* 2. TRANSCRIPT TAB */}
                    {activeTab === 'transcript' && (
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center px-1 relative shrink-0">
                          <span className="text-xs text-slate-400">
                            {result?.transcript?.length || 0} segments
                          </span>
                          
                          {/* Export Dropdown Menu */}
                          <div className="relative">
                            <button
                              onClick={() => setShowExportMenu(!showExportMenu)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-indigo-300 flex items-center gap-1.5 transition-colors"
                            >
                              <Download className="h-3 w-3 text-indigo-450" />
                              Export
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            {showExportMenu && (
                              <div className="absolute right-0 mt-1.5 w-44 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col py-1">
                                <button
                                  onClick={exportToYoutube}
                                  className="w-full px-3 py-2 text-left text-xs text-slate-350 hover:bg-indigo-600 hover:text-white transition-colors"
                                >
                                  YouTube Chapters (.txt)
                                </button>
                                <button
                                  onClick={exportToSrt}
                                  className="w-full px-3 py-2 text-left text-xs text-slate-355 hover:bg-indigo-600 hover:text-white transition-colors"
                                >
                                  SRT Subtitles (.srt)
                                </button>
                                <button
                                  onClick={exportToVtt}
                                  className="w-full px-3 py-2 text-left text-xs text-slate-355 hover:bg-indigo-600 hover:text-white transition-colors"
                                >
                                  WebVTT Subtitles (.vtt)
                                </button>
                                <button
                                  onClick={exportToXml}
                                  className="w-full px-3 py-2 text-left text-xs text-slate-355 hover:bg-indigo-600 hover:text-white transition-colors"
                                >
                                  Video CMS Metadata (.xml)
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Search Input (No hyphens in style) */}
                        <div style={{ padding: '0 4px' }}>
                          <input
                            type="text"
                            placeholder="Search transcript..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                              width: '100%',
                              background: '#020617',
                              border: '1px solid #1e293b',
                              borderRadius: '6px',
                              padding: '6px 10px',
                              fontSize: '12px',
                              color: 'white',
                              outline: 'none',
                              marginBottom: '6px'
                            }}
                          />
                        </div>

                        {/* Transcript Segments List */}
                        <div className="flex flex-col gap-2">
                          {result?.transcript && result.transcript.length > 0 ? (
                            (() => {
                              const filtered = searchTerm
                                ? result.transcript.map((s, i) => ({ ...s, originalIndex: i })).filter(seg => seg.text.toLowerCase().includes(searchTerm.toLowerCase()))
                                : result.transcript.map((s, i) => ({ ...s, originalIndex: i }));
                              
                              if (filtered.length === 0) {
                                return (
                                  <div className="p-8 text-center text-xs text-slate-500">
                                    No matching segments found.
                                  </div>
                                );
                              }

                              return filtered.map((seg) => {
                                const index = seg.originalIndex;
                                const isEditing = editingSegmentIndex === index;
                                
                                if (isEditing) {
                                  return (
                                    <div key={index} className="p-3 rounded-lg bg-slate-900 border border-indigo-500 flex flex-col gap-2">
                                      <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-mono font-bold text-indigo-400">
                                          Segment {formatTime(seg.start)} – {formatTime(seg.end)}
                                        </span>
                                      </div>
                                      <textarea
                                        value={editSegmentText}
                                        onChange={(e) => setEditSegmentText(e.target.value)}
                                        rows="2"
                                        className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                                      />
                                      <div className="flex justify-end gap-1.5">
                                        <button
                                          onClick={() => setEditingSegmentIndex(null)}
                                          className="text-[10px] px-2 py-1 border border-slate-800 bg-slate-950 rounded hover:bg-slate-850 text-slate-400"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => saveSegmentEdit(index)}
                                          className="text-[10px] px-2 py-1 bg-indigo-600 rounded hover:bg-indigo-700 text-white"
                                        >
                                          Save
                                        </button>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={index}
                                    className="group flex gap-2.5 items-start p-2 rounded-lg hover:bg-slate-900/60 transition-colors text-left"
                                  >
                                    {/* Seek timestamp trigger */}
                                    <button
                                      onClick={() => playChapter({ start_time: seg.start })}
                                      className="text-[10px] font-mono font-bold text-indigo-400 hover:text-indigo-300 bg-slate-950 border border-slate-900 px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                                    >
                                      {formatTime(seg.start)}
                                    </button>
                                    
                                    {/* Interactive content text click to seek too */}
                                    <p 
                                      onClick={() => playChapter({ start_time: seg.start })}
                                      className="text-xs text-slate-355 hover:text-white cursor-pointer leading-relaxed flex-1 font-sans"
                                    >
                                      {highlightText(seg.text, searchTerm)}
                                    </p>

                                    {/* Edit button */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startEditSegment(index, seg);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-500 hover:text-white rounded hover:bg-slate-800"
                                      title="Edit Transcript Text"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                );
                              });
                            })()
                          ) : (
                            <div className="p-8 text-center text-xs text-slate-500">
                              Transcript segments are not available.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 3. AI SUMMARY TAB */}
                    {activeTab === 'summary' && (
                      <div className="flex flex-col gap-4 text-left">
                        {/* High-Level Narrative Summary */}
                        <div className="bg-gradient-to-tr from-indigo-950/40 to-slate-900/60 border border-slate-900 p-5 rounded-2xl relative overflow-hidden shadow-sm">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl" />
                          <div className="flex justify-between items-center mb-2.5">
                            <h4 className="font-bold text-xs text-indigo-300 uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                              AI Video Digest
                            </h4>
                            <button
                              onClick={generatePdfReport}
                              style={{
                                background: 'rgba(99, 102, 241, 0.2)',
                                color: '#a5b4fc',
                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              PDF Report
                            </button>
                          </div>
                          <p className="text-xs text-slate-250 leading-relaxed font-sans">
                            {result?.video_summary || "This video has been successfully transcribed and chapters were automatically extracted based on key conceptual shifts and structural changes."}
                          </p>
                        </div>

                        {/* Interactive Insights Q&A Panel */}
                        <div className="flex flex-col gap-2">
                          <h4 className="font-bold text-xs text-slate-350 uppercase tracking-wider mb-1 flex items-center gap-1.5 px-1">
                            <HelpCircle className="h-3.5 w-3.5 text-indigo-450" />
                            Interactive Insights Q&A
                          </h4>

                          {/* Question 1: Introduction */}
                          <div className="border border-slate-900/60 rounded-xl overflow-hidden bg-slate-900/20">
                            <button
                              onClick={() => setActiveQuestionId(activeQuestionId === 'intro' ? null : 'intro')}
                              className="w-full p-3.5 text-left text-xs font-bold text-slate-200 hover:bg-slate-900/30 flex justify-between items-center"
                            >
                              <span>What is discussed in the opening introduction?</span>
                              <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${activeQuestionId === 'intro' ? 'rotate-180' : ''}`} />
                            </button>
                            {activeQuestionId === 'intro' && (
                              <div className="px-3.5 pb-3.5 pt-0.5 border-t border-slate-900/40 text-xs text-slate-400 flex flex-col gap-2 bg-slate-950/20">
                                <p>
                                  {result?.chapters && result.chapters[0] 
                                    ? `The video opens with "${result.chapters[0].title}". Summary: ${result.chapters[0].summary}`
                                    : "No introduction chapter was marked."
                                  }
                                </p>
                                {result?.chapters && result.chapters[0] && (
                                  <button
                                    onClick={() => playChapter(result.chapters[0])}
                                    className="self-start text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 mt-1"
                                  >
                                    <Play className="h-2.5 w-2.5" /> Jump to opening (0:00)
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Question 2: Key Insights */}
                          <div className="border border-slate-900/60 rounded-xl overflow-hidden bg-slate-900/20">
                            <button
                              onClick={() => setActiveQuestionId(activeQuestionId === 'insights' ? null : 'insights')}
                              className="w-full p-3.5 text-left text-xs font-bold text-slate-200 hover:bg-slate-900/30 flex justify-between items-center"
                            >
                              <span>What are the main key takeaways?</span>
                              <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${activeQuestionId === 'insights' ? 'rotate-180' : ''}`} />
                            </button>
                            {activeQuestionId === 'insights' && (
                              <div className="px-3.5 pb-3.5 pt-0.5 border-t border-slate-900/40 text-xs text-slate-400 flex flex-col gap-2 bg-slate-950/20">
                                <ul className="list-disc pl-4 space-y-1.5 text-slate-350">
                                  {result?.chapters?.map((ch, idx) => (
                                    <li key={idx}>
                                      <span className="font-bold text-indigo-455 cursor-pointer hover:underline" onClick={() => playChapter(ch)}>
                                        {ch.title}
                                      </span>: {ch.summary}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          {/* Question 3: Conclusion */}
                          <div className="border border-slate-900/60 rounded-xl overflow-hidden bg-slate-900/20">
                            <button
                              onClick={() => setActiveQuestionId(activeQuestionId === 'outro' ? null : 'outro')}
                              className="w-full p-3.5 text-left text-xs font-bold text-slate-205 hover:bg-slate-900/30 flex justify-between items-center"
                            >
                              <span>What is the final conclusion?</span>
                              <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${activeQuestionId === 'outro' ? 'rotate-180' : ''}`} />
                            </button>
                            {activeQuestionId === 'outro' && (
                              <div className="px-3.5 pb-3.5 pt-0.5 border-t border-slate-900/40 text-xs text-slate-400 flex flex-col gap-2 bg-slate-950/20">
                                <p>
                                  {result?.chapters && result.chapters.length > 0
                                    ? `The video concludes with "${result.chapters[result.chapters.length - 1].title}". Summary: ${result.chapters[result.chapters.length - 1].summary}`
                                    : "No concluding chapters are available."
                                  }
                                </p>
                                {result?.chapters && result.chapters.length > 0 && (
                                  <button
                                    onClick={() => playChapter(result.chapters[result.chapters.length - 1])}
                                    className="self-start text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 mt-1"
                                  >
                                    <Play className="h-2.5 w-2.5" /> Jump to conclusion ({formatTime(result.chapters[result.chapters.length - 1].start_time)})
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Interactive Tag Explorer */}
                        <div className="flex flex-col gap-2 bg-slate-900/10 border border-slate-900/60 p-4 rounded-xl">
                          <h4 className="font-bold text-xs text-slate-350 uppercase tracking-wider flex items-center gap-1.5">
                            <Tag className="h-3 w-3 text-indigo-450" />
                            Interactive Topic Cloud
                          </h4>
                          <p className="text-[10px] text-slate-500">
                            Click any keyword below to dynamically list matching chapters and jump to their segments.
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {Array.from(new Set(result?.chapters?.flatMap(c => c.tags || []) || [])).map((tag, idx) => {
                              const isSelected = selectedTag === tag;
                              return (
                                <button
                                  key={idx}
                                  onClick={() => setSelectedTag(isSelected ? null : tag)}
                                  className={`text-[10px] font-medium border px-2 py-0.5 rounded-full transition-all flex items-center gap-1 ${
                                    isSelected
                                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                      : 'bg-slate-950 border-slate-900 text-slate-400 hover:border-slate-800 hover:text-slate-200'
                                  }`}
                                >
                                  {tag}
                                </button>
                              );
                            })}
                          </div>

                          {selectedTag && (
                            <div className="mt-3 flex flex-col gap-2 pt-3 border-t border-slate-900 animate-fadeIn">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Chapters matching "{selectedTag}":</span>
                              {result?.chapters?.filter(c => c.tags?.includes(selectedTag)).map((chapter, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => {
                                    playChapter(chapter);
                                    setActiveTab('chapters');
                                  }}
                                  className="p-2.5 rounded-lg bg-slate-955 border border-slate-900 hover:border-indigo-600/40 text-left cursor-pointer transition-colors"
                                >
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] text-indigo-400 font-mono font-semibold">{formatTime(chapter.start_time)}</span>
                                  </div>
                                  <h5 className="text-[11px] font-bold text-white truncate">{chapter.title}</h5>
                                  <p className="text-[10px] text-slate-400 line-clamp-1">{chapter.summary}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    )}
                  </>
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
