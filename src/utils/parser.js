/**
 * Strict validation and parsing logic
 */

const CAMERAS = ['front', 'back', 'left_pillar', 'left_repeater', 'right_pillar', 'right_repeater'];

export function parseTimestampFromName(name) {
  const m = name.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/);
  if (!m) return null;
  // Convert 2023-01-01_10-00-00 to ISO 2023-01-01T10:00:00
  const iso = m[1].replace('_', 'T').replace(/-/g, ':').replace(/(\d{4}):(\d{2}):(\d{2})T/, '$1-$2-$3T');
  return new Date(iso);
}

function getCameraFromFilename(filename) {
  const m = filename.match(/-(front|back|left_pillar|left_repeater|right_pillar|right_repeater)\.mp4$/);
  return m ? m[1] : null;
}

export async function parseDirectory(files) {
  const groups = {}; // folderName -> File[]

  // 1. Group files by folder
  for (const file of files) {
    // Only care about SavedClips or SentryClips
    const path = file.webkitRelativePath || file.name;
    if (!path.includes('SavedClips') && !path.includes('SentryClips')) continue;

    // Extract parent folder name (the clip name)
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

    // Strict validation: Need thumb and json
    if (!thumb || !eventFile) {
      console.warn(`[Skipped] Clip ${folderName} missing thumb or event.json`);
      continue;
    }

    // Parse Metadata
    let meta = {};
    try {
      const text = await readFileText(eventFile);
      meta = JSON.parse(text);
    } catch (e) {
      console.error(`Error parsing event.json for ${folderName}`, e);
      continue; // Skip if JSON is corrupt
    }

    // Process Video Parts
    const mp4s = folderFiles.filter(f => /\.mp4$/i.test(f.name));
    const partsMap = new Map(); // timestamp_str -> { file, camera }[]

    mp4s.forEach(f => {
      const tDate = parseTimestampFromName(f.name);
      if (!tDate) return;
      const tStr = tDate.getTime(); // Use timestamp as key
      if (!partsMap.has(tStr)) partsMap.set(tStr, []);
      partsMap.get(tStr).push(f);
    });

    const parts = [];
    let isClipValid = true;

    // Sort parts by time
    const sortedTimestamps = Array.from(partsMap.keys()).sort((a, b) => a - b);

    for (const ts of sortedTimestamps) {
      const filesForPart = partsMap.get(ts);

      // Strict validation: Need exactly 6 cameras
      const cameraDict = {};
      const foundCams = new Set();

      filesForPart.forEach(f => {
        const cam = getCameraFromFilename(f.name);
        if (cam) {
          foundCams.add(cam);
          cameraDict[cam] = {
            file: f,
            name: cam,
            start: new Date(ts)
          };
        }
      });

      // Check if all required cameras are present
      const missingCams = CAMERAS.filter(c => !foundCams.has(c));
      if (missingCams.length > 0) {
        console.error(`[Skipped] Clip ${folderName} part ${new Date(ts).toISOString()} missing cameras: ${missingCams.join(', ')}`);
        isClipValid = false;
        break;
      }

      parts.push({
        timestamp: new Date(ts),
        cameras: cameraDict
      });
    }

    if (isClipValid && parts.length > 0) {
      // Create Clip Object
      const clipDate = parseTimestampFromName(folderName) || parts[parts.length-1].timestamp;

      // Estimated duration: (last - first) + 60s (approx for last part)
      // This will be refined during playback if needed, but good enough for UI
      const durationSec = ((parts[parts.length-1].timestamp - parts[0].timestamp) / 1000) + 60;

      parsedClips.push({
        id: folderName,
        name: folderName,
        timestamp: clipDate,
        thumbUrl: URL.createObjectURL(thumb),
        meta: meta,
        parts: parts,
        totalDuration: durationSec,
        type: folderName.includes('Sentry') ? 'sentry' : 'saved'
      });
    }
  }
  console.log(parsedClips);
  // Sort clips by date descending
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