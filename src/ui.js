/**
 * visual-eyes-her — UI controls
 * Wires mode selection, audio file/mic, and intensity/pulse sliders.
 * Audio initialization is handled by the caller (main.js); this module
 * owns the DOM state and exposes the controls.
 */

export function initUI(onModeChange) {
  const modeBtns = document.querySelectorAll('[data-mode]');
  const fileGroup = document.getElementById('file-group');
  const micGroup = document.getElementById('mic-group');
  const fileInput = document.getElementById('audio-file');
  const micToggle = document.getElementById('mic-toggle');
  const intensity = document.getElementById('intensity');
  const pulseSpeed = document.getElementById('pulse-speed');
  const modeBadge = document.getElementById('mode-badge');
  const status = document.getElementById('status');

  let currentMode = 'off';

  function setMode(mode) {
    currentMode = mode;
    modeBtns.forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    fileGroup.style.display = mode === 'file' ? '' : 'none';
    micGroup.style.display = mode === 'mic' ? '' : 'none';
    modeBadge.textContent =
      mode === 'off' ? 'SELF-GENERATING' : mode === 'mic' ? 'MICROPHONE' : 'AUDIO FILE';
    modeBadge.style.color =
      mode === 'off' ? '#d8b4fe' : mode === 'mic' ? '#a5f3fc' : '#fcd34d';
    if (onModeChange) onModeChange(mode);
  }

  modeBtns.forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });

  return {
    get mode() {
      return currentMode;
    },
    set mode(v) {
      setMode(v);
    },
    get intensity() {
      return parseFloat(intensity.value);
    },
    get pulseSpeed() {
      return parseFloat(pulseSpeed.value);
    },
    get fileInput() {
      return fileInput;
    },
    get micToggle() {
      return micToggle;
    },
    get status() {
      return status;
    },
    setStatus(text) {
      status.textContent = text;
    },
  };
}
