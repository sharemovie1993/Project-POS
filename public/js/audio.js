/**
 * Kasirku POS - Feedback Audio Module (Web Audio API)
 */

// Synthesizer Web Audio untuk jaminan 100% suara offline tanpa gagal loading file
function playBeepSound() {
  try {
    // Coba putar file audio dulu
    const audio = document.getElementById('soundBeep');
    audio.currentTime = 0;
    audio.play().catch(() => playSynthBeep());
  } catch (e) {
    playSynthBeep();
  }
}

function playDingSound() {
  try {
    const audio = document.getElementById('soundDing');
    audio.currentTime = 0;
    audio.play().catch(() => playSynthDing());
  } catch (e) {
    playSynthDing();
  }
}

function playSynthBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, audioCtx.currentTime); // 1000Hz beep
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch (e) {
    console.log('Web Audio tidak didukung');
  }
}

function playSynthDing() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Nada 1
    const playNote = (freq, start, duration) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + start);
      osc.stop(audioCtx.currentTime + start + duration);
    };
    // Chord C-major (C5 -> E5)
    playNote(523.25, 0, 0.15); // C5
    playNote(659.25, 0.08, 0.25); // E5
  } catch (e) {
    console.log('Web Audio tidak didukung');
  }
}
