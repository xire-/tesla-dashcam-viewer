import { REASON_MAPPING } from './i18n';

const CAMERAS = ['front', 'back', 'left_pillar', 'left_repeater', 'right_pillar', 'right_repeater'];

export function parseTimestampFromName(name) {
  const m = name.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/);
  if (!m) return null;
  const iso = m[1].replace('_', 'T').replace(/-/g, ':').replace(/(\d{4}):(\d{2}):(\d{2})T/, '$1-$2-$3T');
  return new Date(iso);
}

function getCameraFromFilename(filename) {
  const m = filename.match(/-(front|back|left_pillar|left_repeater|right_pillar|right_repeater)\.mp4$/);
  return m ? m[1] : null;
}

export async function parseDirectory(files) {
  const groups = {};

  // 1. Group files by folder
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    if (!path.includes('SavedClips') && !path.includes('SentryClips')) continue;

    const m = path.match(/(SavedClips|SentryClips)\/([^\/]+)\//);
    if (!m) continue;

    const clipFolder = m[2];
    if (!groups[clipFolder]) groups[clipFolder] = [];
    groups[clipFolder].push(file);
  }

  const parsedClips = [];

  // 2. Validate and build structures
  for (const [folderName, folderFiles] of Object.entries(groups)) {
    const thumb = folderFiles.find(f => /thumb\.png$/i.test(f.name));
    const eventFile = folderFiles.find(f => /event\.json$/i.test(f.name));

    if (!thumb || !eventFile) continue;

    // Parse Metadata
    let meta = {};
    try {
      const text = await readFileText(eventFile);
      meta = JSON.parse(text);
    } catch (e) {
      console.error(`Error parsing event.json for ${folderName}`, e);
      continue;
    }

    // Determine Type and Display Text for Reason
    let displayReason = meta.reason;
    let clipType = 'saved'; // default

    // Check path for fallback type detection
    const isSentryPath = folderFiles[0].webkitRelativePath.includes('SentryClips');
    if (isSentryPath) clipType = 'sentry';

    // Override based on specific reason mapping
    if (meta.reason && REASON_MAPPING[meta.reason]) {
      clipType = REASON_MAPPING[meta.reason].type;
      displayReason = REASON_MAPPING[meta.reason].key; // This is the translation key
    } else if (meta.reason) {
       // Log unknown reasons to console as requested
       console.warn("Unknown reason encountered:", meta.reason);
    }

    // Process Video Parts
    const mp4s = folderFiles.filter(f => /\.mp4$/i.test(f.name));
    const partsMap = new Map();

    mp4s.forEach(f => {
      const tDate = parseTimestampFromName(f.name);
      if (!tDate) return;
      const tStr = tDate.getTime();
      if (!partsMap.has(tStr)) partsMap.set(tStr, []);
      partsMap.get(tStr).push(f);
    });

    const parts = [];
    let isClipValid = true;
    const sortedTimestamps = Array.from(partsMap.keys()).sort((a, b) => a - b);

    for (const ts of sortedTimestamps) {
      const filesForPart = partsMap.get(ts);
      const cameraDict = {};
      const foundCams = new Set();

      filesForPart.forEach(f => {
        const cam = getCameraFromFilename(f.name);
        if (cam) {
          foundCams.add(cam);
          cameraDict[cam] = { file: f, name: cam, start: new Date(ts) };
        }
      });

      const missingCams = CAMERAS.filter(c => !foundCams.has(c));
      if (missingCams.length > 0) {
        console.error(`[Skipped] Clip ${folderName} part missing cameras: ${missingCams.join(', ')}`);
        isClipValid = false;
        break;
      }

      parts.push({ timestamp: new Date(ts), cameras: cameraDict });
    }

    if (isClipValid && parts.length > 0) {
      const clipDate = parseTimestampFromName(folderName) || parts[parts.length-1].timestamp;

      // Initial estimated duration (will be refined in player)
      const estimatedDuration = ((parts[parts.length-1].timestamp - parts[0].timestamp) / 1000) + 60;

      parsedClips.push({
        id: folderName,
        name: folderName,
        timestamp: clipDate,
        thumbUrl: URL.createObjectURL(thumb),
        meta: { ...meta, displayReason }, // Store the translation key or raw string
        parts: parts,
        totalDuration: estimatedDuration,
        type: clipType
      });
    }
  }

  return parsedClips.sort((a, b) => b.timestamp - a.timestamp);
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}