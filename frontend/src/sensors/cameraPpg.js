// Real heart-rate measurement from a phone camera via PPG (photoplethysmography).
// Put a fingertip over the BACK camera (with flash on) — blood volume pulses change
// the red-channel absorption each wave. We detrend the signal and find the dominant
// period via autocorrelation (30–150 bpm). This is a real measurement, not a simulation.

export class CameraPpg {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.samples = [];       // {t, g} green-channel intensity of ROI
    this.running = false;
    this.bpm = null;
    this.quality = 0;        // 0..1 — contact/stability confidence
    this.waveform = [];      // detrended values for the canvas scroll
    this.onUpdate = null;    // (state) => void
    this._raf = null;
    this._lastCalc = 0;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 320 }, height: { ideal: 240 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
    // enable torch if available (Chrome on Android)
    try {
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() || {};
      if (caps.torch) await track.applyConstraints({ advanced: [{ torch: true }] });
    } catch { /* torch optional */ }
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    const s = this.video.srcObject;
    if (s) s.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }

  _loop = () => {
    if (!this.running) return;
    const { video, ctx, canvas } = this;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const w = canvas.width, h = canvas.height;
      const roi = ctx.getImageData(w * 0.35, h * 0.35, w * 0.3, h * 0.3).data;
      let g = 0;
      for (let i = 0; i < roi.length; i += 4) g += roi[i + 1];
      g /= roi.length / 4;
      const now = performance.now();
      this.samples.push({ t: now, g });
      while (this.samples.length && this.samples[0].t < now - 15000) this.samples.shift();
      this._calc(now);
    }
    this._raf = requestAnimationFrame(this._loop);
  };

  _calc(now) {
    if (now - this._lastCalc < 800) { this._emit(); return; }
    this._lastCalc = now;
    const s = this.samples;
    if (s.length < 150) { this._emit(); return; }
    const g0 = s.map((p) => p.g);
    const mean = g0.reduce((a, b) => a + b, 0) / g0.length;
    const variance = g0.reduce((a, b) => a + (b - mean) ** 2, 0) / g0.length;
    // finger detected if the signal has pulsatile variance (not a static frame)
    this.quality = variance > 2 ? Math.min(1, variance / 60) : 0;
    if (this.quality < 0.15) { this.bpm = null; this.waveform = []; this._emit(); return; }

    // detrend: subtract moving average (~0.8 s window)
    const W = 24;
    const dt = g0.map((_, i) => {
      const a = Math.max(0, i - W), b = Math.min(g0.length, i + W);
      let m = 0;
      for (let j = a; j < b; j++) m += g0[j];
      m /= (b - a);
      return g0[i] - m;
    });
    this.waveform = dt.slice(-160);

    // autocorrelation HR estimate over lags for 30–150 bpm
    const n = dt.length;
    const meanDt = dt.reduce((a, b) => a + b, 0) / n;
    const centered = dt.map((v) => v - meanDt);
    const varDt = centered.reduce((a, b) => a + b * b, 0) || 1;
    let bestLag = -1, bestCorr = 0;
    const minLag = Math.floor((60 / 150) * 30), maxLag = Math.floor((60 / 30) * 30); // ~30 fps sampling
    for (let lag = minLag; lag <= Math.min(maxLag, n - 10); lag++) {
      let cov = 0;
      for (let i = 0; i + lag < n; i++) cov += centered[i] * centered[i + lag];
      const corr = cov / varDt / (1 - lag / n);
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
    }
    if (bestLag > 0 && bestCorr > 0.45) {
      const lagSeconds = bestLag / 30;   // approx frame rate ~30 fps
      this.bpm = Math.round(60 / lagSeconds);
    }
    this._emit();
  }

  _emit() {
    if (this.onUpdate) this.onUpdate({ bpm: this.bpm, quality: this.quality, waveform: this.waveform });
  }
}
