import React, { useState, useEffect, useMemo, useRef } from 'react';
import { translations, CAMERA_MAPPING } from './utils/i18n';
import { parseDirectory, parseTimestampFromName } from './utils/parser';
import { FolderInput, Play, Pause, Rewind, FastForward, Maximize2, Grid, ChevronLeft, AlertCircle, MapPin, Video, Info } from 'lucide-react';

// --- COMPONENTS ---

// 1. INITIAL STATE
const Intro = ({ onFiles, lang, setLang, t }) => {
  const handleInput = (e) => onFiles(e.target.files);
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-zinc-950">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">{t.title}</h1>
          <p className="text-zinc-400">{t.subtitle}</p>
        </div>

        <div className="border-2 border-dashed border-zinc-700 rounded-xl p-10 bg-zinc-900/50 hover:bg-zinc-900 transition-colors group">
          <label className="cursor-pointer flex flex-col items-center">
            <FolderInput className="w-16 h-16 text-red-600 mb-4 group-hover:scale-110 transition-transform" />
            <span className="text-lg font-medium text-zinc-200 mb-2">{t.selectFolder}</span>
            <span className="text-sm text-zinc-500">{t.dragDrop}</span>
            <input
              type="file"
              webkitdirectory=""
              directory=""
              className="hidden"
              onChange={handleInput}
            />
          </label>
        </div>

        <div className="flex justify-center gap-4">
          <button onClick={()=>setLang('it')} className={`px-3 py-1 rounded ${lang==='it'?'bg-zinc-800 text-white':'text-zinc-500'}`}>Italiano</button>
          <button onClick={()=>setLang('en')} className={`px-3 py-1 rounded ${lang==='en'?'bg-zinc-800 text-white':'text-zinc-500'}`}>English</button>
        </div>
      </div>
    </div>
  );
};

// 2. CLIP LIST
const ClipList = ({ clips, onSelect, onReset, t }) => {
  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-zinc-100">{t.title}</h2>
          <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-xs font-medium">
            {clips.length} {t.clipsFound}
          </span>
        </div>
        <button onClick={onReset} className="text-sm text-zinc-400 hover:text-white transition-colors">
          {t.changeFolder}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-7xl mx-auto">
          {clips.map(c => (
            <div key={c.id}
                 onClick={() => onSelect(c)}
                 className="group bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-600 cursor-pointer transition-all hover:shadow-2xl hover:shadow-red-900/10">
              <div className="relative aspect-video bg-black">
                <img src={c.thumbUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="thumbnail" />
                <div className="absolute bottom-2 right-2 bg-black/70 px-1.5 py-0.5 rounded text-xs font-mono text-white">
                  {c.parts.length} {t.parts}
                </div>
                <div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${c.type === 'sentry' ? 'bg-red-600/90 text-white' : 'bg-blue-600/90 text-white'}`}>
                  {c.type === 'sentry' ? t.sentry : t.saved}
                </div>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm text-zinc-400">{c.timestamp.toLocaleDateString()}</div>
                    <div className="font-mono text-zinc-200">{c.timestamp.toLocaleTimeString()}</div>
                  </div>
                  {c.meta.reason && (
                    <div className="text-xs text-right text-red-400 font-medium max-w-[50%] truncate" title={c.meta.reason}>
                      {c.meta.reason.replace(/_/g, ' ')}
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t border-zinc-800 flex gap-2 text-xs text-zinc-500">
                  <MapPin size={14} />
                  <span className="truncate">{c.meta.city || t.unknown}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// 3. PLAYER & CONTROLLER
const VideoPlayer = ({ clip, t, onBack }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // Master time in seconds
  const [playbackRate, setPlaybackRate] = useState(1);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'single'
  const [selectedCam, setSelectedCam] = useState('front');

  // Calculate total duration roughly
  const duration = useMemo(() => clip.totalDuration, [clip]);

  // Event time calculation
  const eventTime = useMemo(() => {
    if(!clip.meta.timestamp) return null;
    const eventDate = new Date(clip.meta.timestamp);
    const startDate = clip.parts[0].timestamp;
    return (eventDate - startDate) / 1000;
  }, [clip]);

  // Animation Loop for Sync
  const lastTimeRef = useRef(Date.now());
  const reqRef = useRef();

  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      if (isPlaying) {
        setCurrentTime(t => Math.min(t + dt * playbackRate, duration));
      }
      reqRef.current = requestAnimationFrame(animate);
    };
    lastTimeRef.current = Date.now();
    reqRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(reqRef.current);
  }, [isPlaying, playbackRate, duration]);

  const seek = (time) => {
    setCurrentTime(Math.max(0, Math.min(time, duration)));
  };

  const jump = (delta) => seek(currentTime + delta);

  // Layout Config based on user specs
  // Grid: Top (Left P, Front, Right P), Bottom (Right Rep, Back, Left Rep)
  const gridLayout = [
    ['left_pillar', 'front', 'right_pillar'],
    ['right_repeater', 'back', 'left_repeater']
  ];

  // Logic to determine which video file and offset to show for a specific camera
  const getVideoSource = (cameraName) => {
    // Find the part that covers the current time
    // Part i starts at parts[i].timestamp.
    // Relative start time of part i = (parts[i].timestamp - parts[0].timestamp) / 1000
    let bestPart = clip.parts[0];
    let partStartTime = 0;

    for (let i = 0; i < clip.parts.length; i++) {
      const p = clip.parts[i];
      const pStart = (p.timestamp - clip.parts[0].timestamp) / 1000;
      if (pStart <= currentTime) {
        bestPart = p;
        partStartTime = pStart;
      } else {
        break;
      }
    }

    const offset = currentTime - partStartTime;
    const camData = bestPart.cameras[cameraName];

    return {
      file: camData ? camData.file : null,
      offset: offset,
      key: camData ? camData.file.name : 'empty' // Key to force React to replace video element if file changes
    };
  };

  return (
    <div className="h-full flex flex-col bg-black text-white">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-1 text-zinc-400 hover:text-white">
            <ChevronLeft size={20} /> {t.back}
          </button>
          <div className="h-6 w-px bg-zinc-700"></div>
          <div>
            <h2 className="font-semibold text-sm">{clip.name}</h2>
            <div className="text-xs text-zinc-500">{clip.meta.city} • {clip.meta.reason}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {eventTime && (
            <button onClick={() => seek(eventTime)} className="px-3 py-1 bg-red-900/50 text-red-200 text-xs rounded hover:bg-red-900 flex items-center gap-2">
              <AlertCircle size={14} /> {t.gotoEvent}
            </button>
          )}
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {viewMode === 'grid' ? (
          <div className="w-full h-full flex flex-col">
            {gridLayout.map((row, rIdx) => (
              <div key={rIdx} className="flex-1 flex">
                {row.map(cam => (
                  <div key={cam} className="flex-1 relative border border-zinc-900/50 group cursor-pointer" onClick={() => { setSelectedCam(cam); setViewMode('single'); }}>
                    <SyncedVideo
                      source={getVideoSource(cam)}
                      isPlaying={isPlaying}
                      rate={playbackRate}
                    />
                    <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-xs font-medium text-white/80 pointer-events-none">
                      {t['cam_'+cam]}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full h-full flex p-4 gap-4">
            {/* Main Single View */}
            <div className="flex-1 relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800" onClick={() => setViewMode('grid')}>
               <SyncedVideo source={getVideoSource(selectedCam)} isPlaying={isPlaying} rate={playbackRate} />
               <div className="absolute top-4 left-4 text-xl font-bold drop-shadow-md">{t['cam_'+selectedCam]}</div>
               <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/20 transition-opacity cursor-pointer">
                 <Grid size={48} className="text-white drop-shadow-lg" />
               </div>
            </div>

            {/* Side Column List */}
            <div className="w-64 flex flex-col gap-2 overflow-y-auto pr-1">
               {gridLayout.flat().filter(c => c !== selectedCam).map(cam => (
                 <div key={cam} className="relative aspect-video bg-zinc-900 rounded cursor-pointer hover:ring-2 ring-red-500 transition-all" onClick={() => setSelectedCam(cam)}>
                   <SyncedVideo source={getVideoSource(cam)} isPlaying={isPlaying} rate={playbackRate} muted={true} />
                   <div className="absolute bottom-1 right-1 bg-black/70 px-1 text-[10px] rounded">{t['cam_'+cam]}</div>
                 </div>
               ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="h-24 bg-zinc-900 px-6 py-4 flex flex-col justify-center gap-2 border-t border-zinc-800">
        {/* Timeline */}
        <div
          className="relative h-2 bg-zinc-800 rounded-full cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            seek(pct * duration);
          }}
        >
          <div
            className="absolute h-full bg-red-600 rounded-full"
            style={{ width: `${(currentTime/duration)*100}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full scale-0 group-hover:scale-100 transition-transform shadow"></div>
          </div>
          {eventTime && (
            <div
              className="absolute top-0 w-1 h-full bg-yellow-400 z-10"
              style={{ left: `${(eventTime/duration)*100}%` }}
              title="Event Trigger"
            />
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-mono text-zinc-400 w-20">
            {formatTime(currentTime)}
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => jump(-10)} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full"><Rewind size={20} /></button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-3 bg-white text-black rounded-full hover:bg-zinc-200 transition-colors"
            >
              {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            </button>
            <button onClick={() => jump(10)} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full"><FastForward size={20} /></button>
          </div>

          <div className="flex items-center gap-4 w-20 justify-end">
            <select
              value={playbackRate}
              onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
              className="bg-zinc-800 text-zinc-300 text-xs rounded px-2 py-1 border-none focus:ring-0 cursor-pointer"
            >
              {[0.5, 1, 1.5, 2, 4, 8].map(r => <option key={r} value={r}>{r}x</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

// Internal component for handling the raw video element logic
const SyncedVideo = React.memo(({ source, isPlaying, rate, muted = true }) => {
  const vRef = useRef(null);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    if (!vRef.current || !source.file) return;

    // Create URL
    const url = URL.createObjectURL(source.file);
    blobUrlRef.current = url;
    vRef.current.src = url;

    // Initial seek
    // We wrap in a simplified logic: wait for metadata then seek
    const onMeta = () => {
        if(vRef.current) vRef.current.currentTime = source.offset;
    };
    vRef.current.addEventListener('loadedmetadata', onMeta, { once: true });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [source.key]); // Only recreate if the file part changes

  // Sync Loop
  useEffect(() => {
    const v = vRef.current;
    if(!v) return;

    // Strict sync check
    // If difference between video time and desired offset is large, seek
    // Otherwise play/pause
    if(Math.abs(v.currentTime - source.offset) > 0.5) {
      v.currentTime = source.offset;
    }

    v.playbackRate = rate;

    if (isPlaying) {
      v.play().catch(e => {}); // Ignore play errors (often interaction required)
    } else {
      v.pause();
    }
  }, [isPlaying, rate, source.offset]); // Run whenever master time offset updates

  if (!source.file) return <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-700"><Video size={32}/></div>;

  return (
    <video
      ref={vRef}
      className="w-full h-full object-cover bg-black"
      muted={muted}
      playsInline
    />
  );
});

// --- MAIN APP ---

function App() {
  const [lang, setLang] = useState(() => navigator.language.startsWith('it') ? 'it' : 'en');
  const [clips, setClips] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const t = translations[lang];

  const handleFiles = async (files) => {
    setIsLoading(true);
    try {
      // Convert FileList to Array
      const fileArray = Array.from(files);
      const res = await parseDirectory(fileArray);
      setClips(res);
    } catch (e) {
      console.error(e);
      alert(t.errorTitle);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-zinc-950 text-white animate-pulse">{t.loading}</div>;

  if (selectedClip) {
    return <VideoPlayer clip={selectedClip} t={t} onBack={() => setSelectedClip(null)} />;
  }

  if (clips.length > 0) {
    return <ClipList clips={clips} onSelect={setSelectedClip} onReset={() => setClips([])} t={t} />;
  }

  return <Intro onFiles={handleFiles} lang={lang} setLang={setLang} t={t} />;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default App;