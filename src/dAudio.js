/*!
 * dAudio.js v1.0.0
 * (c) 2019 DIDAVA Media
 * Released under the MIT License.
 * https://www.didava.ir
 * https://github.com/DIDAVA/dAudio
 */

const AudioContext = window.AudioContext || window.webkitAudioContext;

function dAudio(){
  const nfo = {
    src: null,
    state: null,
    autoplay: false,
    startedAt: 0,
    pausedAt: 0,
    buffer: null,
    type: null,
    size: 0,
    repeat: false,
    normalizer: 1,
    threshold: 0,
    ratio: 1,
    knee: 40,
    remaster: true
  };

  // STATES
  const stateList = ['state','load','offline','online','ready','play','pause','stop','end'];
  stateList.forEach( state => this[`on${state}`] = null );
  const setState = (state, code = 0, message = null) => {
    nfo.state = state;
    if (typeof this.onstate === 'function') this.onstate({state, code, message});
    if (typeof this[`on${state}`] === 'function') this[`on${state}`]();
    if (state === 'ready' && nfo.autoplay) { setState('autoplay'); play(); }
    if (state === 'end' && nfo.repeat) { setState('repeat'); play(); }
  };

  // CONTEXT
  const ctx = new AudioContext();
  const normalizer = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  compressor.attack.value = 1;
  compressor.release.value = 0.5;

  const master = ctx.createGain();
  normalizer.connect(compressor).connect(master).connect(ctx.destination);

  const decode = arrBuf => {
    setState('decode');
    ctx.decodeAudioData(
      arrBuf,
      buffer => {
        nfo.buffer = buffer;
        remaster();
      },
      error => { console.log('dAudio Error:', error.message) }
    );
  };

  // SMART REMASTER
  const remasterSwitch = value => {
    normalizer.gain.value = value ? nfo.normalizer : 1;
    compressor.threshold.value = value ? nfo.threshold : 0;
    compressor.ratio.value = value ? nfo.ratio : 1;
    compressor.knee.value = value ? nfo.knee : 40;
    nfo.remaster = value;
  };
  remasterSwitch(nfo.remaster);

  const remaster = () => {
    setState('remaster');
    let sum = 0, peak = 0, avg = 0, channels = nfo.buffer.numberOfChannels;
    for (let channel = 0; channel < channels; channel++) {
      nfo.buffer.getChannelData(channel).forEach( v => {
        sum += v > 0 ? v : -v;
        if (v > peak) { peak = v }
        else if (-v > peak) { peak = -v }
      });
    }
    avg = sum / (nfo.buffer.length / channels);
    nfo.normalizer = parseFloat((2 - peak).toFixed(2));
    nfo.threshold = Math.floor( minmax(-50 * (1 - avg), -100, 0) );
    nfo.ratio = Math.ceil( minmax(20 - (avg * 20), 1, 20) );
    nfo.knee = Math.floor( minmax(40 - (avg * 20), 0, 40) );
    remasterSwitch(true);
    stop(true);
    setState('ready');
  };

  // UTILITIES
  const isAudio = () => { return nfo.type.match(/^audio\/[a-z0-9]+$/) };
  const hasSize = () => { return nfo.size > 0 }

  const minmax = (value, min, max) => {
    if (value > max) { value = max }
    else if (value < min) { value = min }
    return value;
  };

  // SOURCE AND PLAYER FUNCTIONS
  let source = null;

  const currentTime = () => {
    if (nfo.pausedAt) return nfo.pausedAt;
    if (nfo.startedAt) return ctx.currentTime - nfo.startedAt;
    return 0;
  };

  const resetSource = () => {
    source.stop();
    source.disconnect(normalizer);
    source = null;
  };

  const stop = (silent = false) => {
    if (!silent) setState('stop');
    if (source) resetSource();
    nfo.startedAt = 0;
    nfo.pausedAt = 0;
  };

  const pause = (silent = false) => {
    if (source) {
      if (!silent) setState('pause');
      resetSource();
      nfo.pausedAt = ctx.currentTime - nfo.startedAt;
    }
  };

  const play = (silent = false) => {
    if (!source && nfo.buffer) {
      if (!silent) setState('play');
      source = ctx.createBufferSource();
      source.connect(normalizer);
      source.buffer = nfo.buffer;
      source.start(0, nfo.pausedAt);
      nfo.startedAt = ctx.currentTime - nfo.pausedAt;
      nfo.pausedAt = 0;
      source.onended = () => {
        if (currentTime() >= nfo.buffer.duration) {
          stop();
          setState('end');
        }
      };
    }
  };

  const seek = offset => {
    setState('seek');
    if (source) {
      pause(true);
      nfo.pausedAt = offset;
      play(true);
    }
    else nfo.pausedAt = offset;
  };

  const playPause = () => {
    if (source) pause();
    else play();
  };

  // LOADER
  const load = src => {
    setState('load');
    if (src instanceof File) {
      setState('offline');
      nfo.src = src.name;
      nfo.type = src.type;
      nfo.size = src.size;
      if (isAudio() && hasSize()) src.arrayBuffer().then( arrBuf => decode(arrBuf) );
      else setState('error', 1, 'Invalid Audio File');
    }
    else if (typeof src === 'string') {
      setState('online');
      const xhr = new XMLHttpRequest();
      xhr.responseType = 'arraybuffer';
      xhr.onreadystatechange = () => {
        if (xhr.status >= 400) xhr.abort();
        else if (xhr.readyState === xhr.HEADERS_RECEIVED) {
          nfo.type = xhr.getResponseHeader('content-type');
          nfo.size = parseInt(xhr.getResponseHeader('content-length'));
          if (!isAudio() || !hasSize()) xhr.abort();
        }
      };
      xhr.onload = () => {
        nfo.src = src;
        decode(xhr.response);
      }
      xhr.onabort = () => setState('error', 2, 'Loading Aborted');
      xhr.open('GET', src, true);
      xhr.send();
    }
  }

  // PROPERTIES
  Object.defineProperties(dAudio.prototype, {
    state: {
      enumerable: true,
      get(){ return nfo.state }
    },
    src: {
      enumerable: true,
      get(){ return nfo.src },
      set(value){ load(value) }
    },
    type: {
      enumerable: true,
      get(){ return nfo.type }
    },
    size: {
      enumerable: true,
      get(){ return nfo.size }
    },
    duration: {
      enumerable: true,
      get(){ return nfo.buffer ? nfo.buffer.duration : 0 }
    },
    currentTime: {
      enumerable: true,
      get(){ return currentTime() },
      set(value){
        if (typeof value === 'number') seek( minmax(value, 0, this.duration) );
      }
    },
    isPlaying: {
      enumerable: true,
      get(){ return !!source }
    },
    repeat: {
      enumerable: true,
      get(){ return nfo.repeat },
      set(value){ if (typeof value === 'boolean') nfo.repeat = value }
    },
    autoplay: {
      enumerable: true,
      get(){ return nfo.autoplay },
      set(value){ if (typeof value === 'boolean') nfo.autoplay = value }
    },
    remaster: {
      enumerable: true,
      get(){ return nfo.remaster },
      set(value){ if (typeof value === 'boolean') remasterSwitch(value) }
    },
    volume: {
      enumerable: true,
      get(){ return master.gain.value },
      set(value){ if (typeof value === 'number') master.gain.value = minmax(value, 0, 1) }
    }
  });

  // METHODS
  dAudio.prototype.play = function(){ play() }
  dAudio.prototype.pause = function(){ pause() }
  dAudio.prototype.stop = function(){ stop() }
  dAudio.prototype.playPause = function(){ playPause() }
}