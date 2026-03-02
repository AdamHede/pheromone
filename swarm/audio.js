// ============================================================
// SWARM — audio.js
// Web Audio API procedural sound: ambient bed, swarm texture,
// discovery chimes, highway chords, delivery ticks
// ============================================================

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.initialized = false;

    // Sub-systems
    this.ambientOscs = [];
    this.ambientGain = null;
    this.ambientFilter = null;
    this.swarmNoiseSource = null;
    this.swarmGain = null;
    this.swarmPanner = null;
    this.swarmFilter = null;

    // State tracking
    this.lastHighwayIntensity = 0;
    this.highwayChordActive = false;
    this.highwayOscs = [];
    this.highwayGain = null;
  }

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.25;
      this.masterGain.connect(this.ctx.destination);

      this._initAmbient();
      this._initSwarmTexture();
      this._initHighwayChord();
      this.initialized = true;
    } catch (e) {
      console.warn('Audio initialization failed:', e);
    }
  }

  _initAmbient() {
    // 3 detuned sine oscillators for warm ambient bed
    this.ambientFilter = this.ctx.createBiquadFilter();
    this.ambientFilter.type = 'lowpass';
    this.ambientFilter.frequency.value = 150;
    this.ambientFilter.Q.value = 1;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0;
    this.ambientFilter.connect(this.ambientGain);
    this.ambientGain.connect(this.masterGain);

    const freqs = [55, 55.5, 82.5]; // Detuned A1 + E2
    for (const freq of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(this.ambientFilter);
      osc.start();
      this.ambientOscs.push(osc);
    }

    // Slow LFO on detune
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.1;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 3; // +/- 3 cents detune
    lfo.connect(lfoGain);
    for (const osc of this.ambientOscs) {
      lfoGain.connect(osc.detune);
    }
    lfo.start();
  }

  _initSwarmTexture() {
    // White noise -> bandpass -> gain -> panner
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.swarmNoiseSource = this.ctx.createBufferSource();
    this.swarmNoiseSource.buffer = noiseBuffer;
    this.swarmNoiseSource.loop = true;

    this.swarmFilter = this.ctx.createBiquadFilter();
    this.swarmFilter.type = 'bandpass';
    this.swarmFilter.frequency.value = 300;
    this.swarmFilter.Q.value = 2;

    this.swarmGain = this.ctx.createGain();
    this.swarmGain.gain.value = 0;

    this.swarmPanner = this.ctx.createStereoPanner();
    this.swarmPanner.pan.value = 0;

    this.swarmNoiseSource.connect(this.swarmFilter);
    this.swarmFilter.connect(this.swarmGain);
    this.swarmGain.connect(this.swarmPanner);
    this.swarmPanner.connect(this.masterGain);
    this.swarmNoiseSource.start();
  }

  _initHighwayChord() {
    // Pre-create chord oscillators (silent until activated)
    this.highwayGain = this.ctx.createGain();
    this.highwayGain.gain.value = 0;

    const highwayFilter = this.ctx.createBiquadFilter();
    highwayFilter.type = 'lowpass';
    highwayFilter.frequency.value = 600;
    highwayFilter.Q.value = 0.5;

    this.highwayGain.connect(highwayFilter);
    highwayFilter.connect(this.masterGain);

    // A major chord: A2, C#3, E3, A3
    const chordFreqs = [110, 138.59, 164.81, 220];
    for (const freq of chordFreqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(this.highwayGain);
      osc.start();
      this.highwayOscs.push(osc);
    }
  }

  // Called each frame from main loop
  update(totalPheromone, recruitmentIntensity, activeBeeCount, swarmCenterX, canvasWidth, maxBees) {
    if (!this.initialized) return;

    const now = this.ctx.currentTime;

    // Normalize pheromone intensity (rough estimate of max)
    const normalizedIntensity = clamp(totalPheromone / 5000, 0, 1);
    const normalizedRecruitment = clamp(recruitmentIntensity / 2000, 0, 1);

    // Ambient bed: volume and filter cutoff scale with pheromone
    const ambientVol = normalizedIntensity * 0.35;
    this.ambientGain.gain.linearRampToValueAtTime(ambientVol, now + 0.1);
    const filterCutoff = 150 + normalizedIntensity * 650; // 150-800 Hz
    this.ambientFilter.frequency.linearRampToValueAtTime(filterCutoff, now + 0.1);

    // Swarm texture: gain proportional to active bees
    const beeRatio = maxBees > 0 ? activeBeeCount / maxBees : 0;
    const swarmVol = beeRatio * 0.08;
    this.swarmGain.gain.linearRampToValueAtTime(swarmVol, now + 0.1);

    // Swarm panner follows center of mass
    if (canvasWidth > 0) {
      const pan = clamp((swarmCenterX / canvasWidth) * 2 - 1, -1, 1);
      this.swarmPanner.pan.linearRampToValueAtTime(pan * 0.5, now + 0.1);
    }

    // Highway chord: fade in/out based on recruitment intensity
    const highwayVol = smoothstep(0.1, 0.5, normalizedRecruitment) * 0.12;
    this.highwayGain.gain.linearRampToValueAtTime(highwayVol, now + 0.3);
  }

  // Play when a bee discovers food
  playDiscoveryChime(distance, maxDistance) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;

    // Pitch: closer = higher (440-880 Hz), further = lower (220-440 Hz)
    const distRatio = clamp(distance / (maxDistance || 800), 0, 1);
    const freq = lerp(660, 330, distRatio);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.12, now + 0.01);  // fast attack
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.15); // decay
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8); // release

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.85);
  }

  // Play when a flower is fully depleted
  playFlowerDepleted() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 500;
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.4);

    const gain = this.ctx.createGain();
    gain.gain.value = 0.04;
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  // Play on food delivery to hive — short noise tick
  playDeliveryTick() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;

    // Short noise burst through highpass
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.02);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // decaying noise
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.06;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
  }

  // Gradually fade everything out (end of sim)
  fadeOut(duration) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    duration = duration || 3;
    this.masterGain.gain.linearRampToValueAtTime(0, now + duration);
  }

  // Reset for new round
  reset() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setValueAtTime(0.25, now);
    this.ambientGain.gain.setValueAtTime(0, now);
    this.swarmGain.gain.setValueAtTime(0, now);
    this.highwayGain.gain.setValueAtTime(0, now);
  }

  // Cleanup
  destroy() {
    if (this.ctx) {
      this.ctx.close();
      this.initialized = false;
    }
  }
}
