/*!
 * dAudio.js v1.0.0
 * (c) 2019 DIDAVA Media
 * Released under the MIT License.
 * https://www.didava.ir
 * https://github.com/DIDAVA/dAudio
 */

function dAudio(setup = {}){
  let source = null,
      currentState = null,
      startedAt = 0,
      pausedAt = 0,
      currentBuffer = null,
      fileType = null,
      fileSize = 0,
      nodes = [],
      normalizerGain = 1,
      compThreshold = 0,
      compRatio = 1,
      compKnee = 40,
      remasterOn = typeof setup.remaster === 'boolean' ? setup.remaster : true,
      currentSrc = typeof setup.src === 'string' ? setup.src : '',
      autoplay = typeof setup.autoplay === 'boolean' ? setup.autoplay : false,
      repeat = typeof setup.repeat === 'boolean' ? setup.repeat : false;

  // STATE MANAGEMENT
  const stateList = ['state','init','load','offline','online','decode','remaster','ready','play','pause','stop','end','autoplay','repeat','error'];
  stateList.forEach(state => {
    const stateName = `on${state}`;
    if (typeof setup[stateName] === 'function') this[stateName] = setup[stateName];
  });
  
  const setState = (state, code = 0, message = 'OK') => {
    currentState = state;
    const response = {name: state, code, message};
    if (typeof this.onstate === 'function') this.onstate(response);
    if (typeof this[`on${state}`] === 'function') this[`on${state}`](response);
    if (state === 'ready' && autoplay) { setState('autoplay'); play(); }
    if (state === 'end' && repeat) { setState('repeat'); play(); }
  };
  setState('init');

  // CHECK COMPATIBILITY
  let compatibility = [
    typeof AudioContext === 'function',
    typeof AudioBufferSourceNode === 'function',
    typeof AudioDestinationNode === 'function',
    typeof GainNode === 'function',
    typeof DynamicsCompressorNode === 'function'
  ];
  if (compatibility.includes(false)) setState('error', 1, 'Incompatible Browser');

  // UTILITIES
  const todb = value => { return 20 * (0.43429 * Math.log(value)) };
  const fromdb = value => { return Math.exp(value / 8.6858) };
  const isAudio = () => { return fileType.match(/^audio\/[a-z0-9]+$/) };
  const hasSize = () => { return fileSize > 0 }
  const minmax = (value, min, max) => {
    if (value > max) { value = max }
    else if (value < min) { value = min }
    return value;
  };

  // CONTEXT //
  const ctx = new AudioContext();

  // REMASTER MODULE
  const normalizer = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  compressor.attack.value = 1;
  compressor.release.value = 0.25;
  compressor.threshold.value = 0;
  compressor.ratio.value = 1;
  compressor.knee.value = 40;
  nodes.push(normalizer, compressor);

  // EQ MODULE
  Object.defineProperty(this, 'eq', {
    enumerable: true,
    writable: false,
    configurable: false,
    value: {}
  });
  const octaves = [31,63,125,250,500,1000,2000,4000,8000,12000,16000,20000];
  octaves.forEach( (freq, index) => {
    const band = ctx.createBiquadFilter();
    if (index == 0) band.type = 'lowshelf';
    else if (index == octaves.length - 1) band.type = 'highshelf';
    else band.type = 'peaking';
    band.frequency.value = freq;
    Object.defineProperty(this.eq, freq.toString().replace(/000$/, 'k') + 'Hz', {
      enumerable: true,
      get(){ return band.gain.value },
      set(value){ if (typeof value === 'number') band.gain.value = minmax(value, -12, 3) } // 0.25 ~ 1.41
    });
    nodes.push(band);
  });

  // MASTER OUTPUT MODULE
  const master = ctx.createGain();
  nodes.push(master, ctx.destination);

  // CONNECTOR
  nodes.forEach( (node, index) => { if (index != 0) nodes[index -1].connect(node) } );

  const decode = arrBuf => {
    setState('decode');
    ctx.decodeAudioData(
      arrBuf,
      buffer => {
        currentBuffer = buffer;
        remaster();
      },
      error => setState('error', 2, 'Unsupported Audio Codec')
    );
  };

  // SMART REMASTER
  const remasterSwitch = value => {
    normalizer.gain.value = value ? normalizerGain : 1;
    compressor.threshold.value = value ? compThreshold : 0;
    compressor.ratio.value = value ? compRatio : 1;
    compressor.knee.value = value ? compKnee : 40;
    remasterOn = value;
  };

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
    remasterSwitch(remasterOn);
    stop(true);
    setState('ready');
  };

  // SOURCE AND PLAYER FUNCTIONS
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
    const fileError = 'Invalid Audio File'
    if (src instanceof File) {
      setState('offline');
      currentSrc = src.name;
      fileType = src.type;
      fileSize = src.size;
      if (isAudio() && hasSize()) src.arrayBuffer().then( arrBuf => decode(arrBuf) );
      else setState('error', 3, fileError);
    }
    else if (typeof src === 'string') {
      setState('online');
      const xhr = new XMLHttpRequest();
      xhr.responseType = 'arraybuffer';
      xhr.onreadystatechange = () => {
        if (xhr.status >= 400) {
          xhr.abort();
          setState('error', 4, 'Audio File Not Found');
        }
        else if (xhr.readyState === xhr.HEADERS_RECEIVED) {
          fileType = xhr.getResponseHeader('content-type');
          fileSize = parseInt(xhr.getResponseHeader('content-length'));
          if (!isAudio() || !hasSize()) {
            xhr.abort();
            setState('error', 3, fileError);
          }
        }
      };
      xhr.onload = () => {
        currentSrc = src;
        decode(xhr.response);
      }
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
      get(){ return todb(master.gain.value) },
      set(value){ if (typeof value === 'number') master.gain.value = fromdb(minmax(value, -100, 0)) }
    }
  });

  // METHODS
  dAudio.prototype.play = function(){ play() }
  dAudio.prototype.pause = function(){ pause() }
  dAudio.prototype.stop = function(){ stop() }
  dAudio.prototype.playPause = function(){ playPause() }

  if (currentSrc) this.src = currentSrc;
}