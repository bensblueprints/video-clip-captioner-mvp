'use strict';
/**
 * .captionly project files — plain JSON next to (or wherever the user saves):
 * { version, video_path, style_id, style_overrides, emoji_enabled, cues }
 * BOM-free atomic writes so JSON.parse always round-trips.
 */
const fs = require('fs');
const path = require('path');

const VERSION = 1;

function saveProject(filePath, project) {
  const data = {
    version: VERSION,
    video_path: project.video_path || '',
    style_id: project.style_id || 'karaoke',
    style_overrides: project.style_overrides || {},
    emoji_enabled: !!project.emoji_enabled,
    cues: Array.isArray(project.cues) ? project.cues : []
  };
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
  return data;
}

function loadProject(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !Array.isArray(data.cues)) {
    throw new Error('Not a valid .captionly project file');
  }
  return data;
}

module.exports = { saveProject, loadProject, VERSION };
