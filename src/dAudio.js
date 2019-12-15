/*!
 * dAudio.js v1.0.0
 * (c) 2019 DIDAVA Media
 * Released under the MIT License.
 * https://www.didava.ir
 * https://github.com/DIDAVA/dAudio
 */

const AudioContext = window.AudioContext || window.webkitAudioContext;

function dAudio(){

  let currentSrc = null,
      currentState = null,
      autoplay = false,
      startedAt = 0,
      pausedAt = 0,
      currentBuffer = null,
      fileType = null,
      fileSize = 0,
      repeat = false,
      normalizerGain = 1,
      compThreshold = 0,
      compRatio = 1,
      compKnee = 40,
      remasterOn = true;

  // STATES
  const stateList = ['state','load','offline','online','ready','play','pause','stop','end'];
  stateList.forEach( state => this[`on${state}`] = null );
  const setState = (state, code = 0, message = null) => {
    currentState = state;
    if (typeof this.onstate === 'function') this.onstate({state, code, message});
    if (typeof this[`on${state}`] === 'function') this[`on${state}`]();
    if (state === 'ready' && autoplay) { setState('autoplay'); play(); }
    if (state === 'end' && repeat) { setState('repeat'); play(); }
  };

  // CONTEXT
  const ctx = new AudioContext();
  const normalizer = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  compressor.attack.value = 1;
  compressor.release.value = 0.25;

  const master = ctx.createGain();
  normalizer.connect(compressor).connect(master).connect(ctx.destination);

  const decode = arrBuf => {
    setState('decode');
    ctx.decodeAudioData(
      arrBuf,
      buffer => {
        currentBuffer = buffer;
        remaster();
      },
      error => { console.log('dAudio Error:', error.message) }
    );
  };

  // SMART REMASTER
  const remasterSwitch = value => {
    normalizer.gain.value = value ? normalizerGain : 1;
    compressor.threshold.value = value ? compThreshold : 0;
    compressor.ratio.value = value ? compRatio : 1;
    compressor.knee.value = value ? compKnee : 40;
    remasterOn = value;
    console.log({
      n: normalizerGain,
      t: compThreshold,
      r: compRatio,
      k: compKnee
    });
  };
  remasterSwitch(remasterOn);

  const remaster = () => {
    setState('remaster');
    let sum = 0, peak = 0, avg = 0, channels = currentBuffer.numberOfChannels;
    for (let channel = 0; channel < channels; channel++) {
      currentBuffer.getChannelData(channel).forEach( v => {
        sum += v > 0 ? v : -v;
        if (v > peak) { peak = v }
        else if (-v > peak) { peak = -v }
      });
    }
    avg = sum / (currentBuffer.length / channels);
    normalizerGain = parseFloat((2 - peak).toFixed(2));
    compThreshold = Math.floor( minmax(-50 * (1 - avg), -100, 0) );
    compRatio = Math.ceil( minmax(20 - (avg * 20), 1, 20) );
    compKnee = Math.floor( minmax(40 - (avg * 20), 0, 40) );
    remasterSwitch(true);
    stop(true);
    setState('ready');
  };

  // UTILITIES
  const isAudio = () => { return fileType.match(/^audio\/[a-z0-9]+$/) };
  const hasSize = () => { return fileSize > 0 }

  const minmax = (value, min, max) => {
    if (value > max) { value = max }
    else if (value < min) { value = min }
    return value;
  };

  // SOURCE AND PLAYER FUNCTIONS
  let source = null;

  const currentTime = () => {
    if (pausedAt) return pausedAt;
    if (startedAt) return ctx.currentTime - startedAt;
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
    startedAt = 0;
    pausedAt = 0;
  };

  const pause = (silent = false) => {
    if (source) {
      if (!silent) setState('pause');
      resetSource();
      pausedAt = ctx.currentTime - startedAt;
    }
  };

  const play = (silent = false) => {
    if (!source && currentBuffer) {
      if (!silent) setState('play');
      source = ctx.createBufferSource();
      source.connect(normalizer);
      source.buffer = currentBuffer;
      source.start(0, pausedAt);
      startedAt = ctx.currentTime - pausedAt;
      pausedAt = 0;
      source.onended = () => {
        if (currentTime() >= currentBuffer.duration) {
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
      pausedAt = offset;
      play(true);
    }
    else pausedAt = offset;
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
      currentSrc = src.name;
      fileType = src.type;
      fileSize = src.size;
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
          fileType = xhr.getResponseHeader('content-type');
          fileSize = parseInt(xhr.getResponseHeader('content-length'));
          if (!isAudio() || !hasSize()) xhr.abort();
        }
      };
      xhr.onload = () => {
        currentSrc = src;
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
      get(){ return currentState }
    },
    src: {
      enumerable: true,
      get(){ return currentSrc },
      set(value){ load(value) }
    },
    type: {
      enumerable: true,
      get(){ return fileType }
    },
    size: {
      enumerable: true,
      get(){ return fileSize }
    },
    duration: {
      enumerable: true,
      get(){ return currentBuffer ? currentBuffer.duration : 0 }
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
      get(){ return repeat },
      set(value){ if (typeof value === 'boolean') repeat = value }
    },
    autoplay: {
      enumerable: true,
      get(){ return autoplay },
      set(value){ if (typeof value === 'boolean') autoplay = value }
    },
    remaster: {
      enumerable: true,
      get(){ return remasterOn },
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