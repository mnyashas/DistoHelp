// Real heart rate from a phone camera via PPG (photoplethysmography).
// Cover the BACK camera (flash ON) with a fingertip; blood volume pulses
// modulate green-channel intensity. Signal is resampled to a fixed 100 Hz,
// detrended, and beats are found by peak detection with a 300 ms refractory.
// Confidence is exposed as `state` so the UI can guide the user.

export class CameraPpg {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.samples = [];     // {t, g} green-channel intensity of ROI
    this.running = false;
    this.bpm = null;
    this.quality = 0;      // 0..1 — contact/stability confidence
    this.state = 'idle';   // 'no-finger' | 'settling' | 'estimating' | 'locked'
    this.waveform = [];    // detrended values for the canvas scroll
    this.onUpdate = null;
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
      // centre region only — edge pixels are usually noise
      const roi = ctx.getImageData(Math.floor(w * 0.4), Math.floor(h * 0.4), Math.floor(w * 0.2), Math.floor(h * 0.2)).data;
      let g = 0;
      for (let i = 0; i < roi.length; i += 4) g += roi[i + 1];
      g /= roi.length / 4;
      const now = performance.now();
      this.samples.push({ t: now, g });
      while (this.samples.length && this.samples[0].t < now - 12000) this.samples.shift();
      this._calc(now);
    }
    this._raf = requestAnimationFrame(this._loop);
  };

  _resample(samples, rateHz) {
    if (samples.length < 2) return [];
    const t0 = samples[0].t, t1 = samples[samples.length - 1].t;
    const dur = (t1 - t0) / 1000;
    const N = Math.max(1, Math.floor(dur * rateHz));
    const out = new Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const t = t0 + (i * 1000) / rateHz;
      while (j < samples.length - 2 && samples[j + 1].t < t) j++;
      const a = samples[j], b = samples[Math.min(j + 1, samples.length - 1)];
      const span = b.t - a.t;
      const w = span > 0 ? (t - a.t) / span : 0;
      out[i] = a.g + w * (b.g - a.g);
    }
    return out;
  }

  _detrend(x, windowSamples) {
    const n = x.length, out = new Array(n);
    const half = Math.floor(windowSamples / 2);
    let sum = 0;
    for (let i = 0; i < Math.min(windowSamples, n); i++) sum += x[i];
    for (let i = 0; i < n; i++) {
      if (i + half < n) sum += x[i + half];
      if (i - half - 1 >= 0) sum -= x[i - half - 1];
      const count = Math.min(i + half, n - 1) - Math.max(i - half, 0) + 1;
      out[i] = x[i] - sum / count;
    }
    return out;
  }

  _calc(now) {
    if (now - this._lastCalc < 700) { this._emit(); return; }
    this._lastCalc = now;
    const s = this.samples;
    if (s.length < 60) { this.state = 'settling'; this._emit(); return; }

    const g0 = s.map((p) => p.g);
    const mean = g0.reduce((a, b) => a + b, 0) / g0.length;
    const variance = g0.reduce((a, b) => a + (b - mean) ** 2, 0) / g0.length;
    this.quality = Math.max(0, Math.min(1, variance / 40));

    if (this.quality < 0.08) {
      this.state = 'no-finger';
      this.bpm = null;
      this.waveform = [];
      this._emit();
      return;
    }

    const rate = 100;
    const uniform = this._resample(s, rate);
    const det = this._detrend(uniform, Math.floor(rate * 0.75));   // ~750 ms window
    this.waveform = det.slice(-160);

    // peak detection with 300 ms refractory
    const absMax = Math.max(...det.map(Math.abs), 1);
    const thresh = absMax * 0.45;
    const refract = Math.floor(rate * 0.3);
    const peaks = [];
    let last = -refract;
    for (let i = 1; i < det.length - 1; i++) {
      if (det[i] > thresh && det[i] >= det[i - 1] && det[i] >= det[i + 1] && (i - last) > refract) {
        peaks.push(i);
        last = i;
      }
    }
    if (peaks.length >= 4) {
      const intervals = [];
      for (let k = 1; k < peaks.length; k++) intervals.push((peaks[k] - peaks[k - 1]) / rate);
      intervals.sort((a, b) => a - b);
      const median = intervals[Math.floor(intervals.length / 2)];
      const candidate = Math.round(60 / median);
      if (candidate >= 30 && candidate <= 200) {
        this.bpm = candidate;
        this.state = 'locked';
        this._emit();
        return;
      }
    }
    // fallback: autocorrelation over plausible lags (60–150 bpm)
    const meanDt = det.reduce((a, b) => a + b, 0) / det.length;
    const c = det.map((v) => v - meanDt);
    const varC = c.reduce((a, b) => a + b * b, 0) || 1;
    let bestLag = -1, bestCorr = 0;
    const minLag = Math.floor(rate * 60 / 150), maxLag = Math.floor(rate * 60 / 50);
    for (let lag = minLag; lag <= Math.min(maxLag, c.length - 10); lag++) {
      let cov = 0;
      for (let i = 0; i + lag < c.length; i++) cov += c[i] * c[i + lag];
      const corr = cov / varC / (1 - lag / c.length);
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
    }
    if (bestLag > 0 && bestCorr > 0.4) {
      const candidate = Math.round(60 / (bestLag / rate));
      if (candidate >= 30 && candidate <= 200) {
        this.bpm = candidate;
        this.state = 'locked';
        this._emit();
        return;
      }
    }
    this.bpm = null;
    this.state = 'estimating';
    this._emit();
  }

  _emit() {
    if (this.onUpdate) this.onUpdate({
      bpm: this.bpm,
      quality: this.quality,
      state: this.state,
      waveform: this.waveform,
    });
  }
}
