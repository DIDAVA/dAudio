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
    isPlaying: false,
    autoplay: false,
    startedAt: 0,
    pausedAt: 0,
    buffer: null,
    type: null,
    size: 0,
    repeat: false
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
  normalizer.connect(ctx.destination);

  const currentTime = () => {
    if (nfo.pausedAt) return nfo.pausedAt;
    if (nfo.startedAt) return ctx.currentTime - nfo.startedAt;
    return 0;
  };

  // SOURCE AND FUNCTIONS
  let source = null;

  const resetSource = () => {
    source.stop();
    source.disconnect(normalizer);
    source = null;
    nfo.isPlaying = false;
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
    if (!source) {
      if (!silent) setState('play');
      source = ctx.createBufferSource();
      source.connect(normalizer);
      source.buffer = nfo.buffer;
      source.start(0, nfo.pausedAt);
      nfo.startedAt = ctx.currentTime - nfo.pausedAt;
      nfo.pausedAt = 0;
      nfo.isPlaying = true;
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

  const decode = arrBuf => {
    setState('decode');
    ctx.decodeAudioData(
      arrBuf,
      buffer => {
        nfo.buffer = buffer;
        stop(true);
        setState('ready');
      },
      error => { console.log('dAudio Error:', error.message) }
    );
  };

  const isAudio = () => { return nfo.type.match(/^audio\/[a-z0-9]+$/) };
  const hasSize = () => { return nfo.size > 0 }

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
        if (typeof value === 'number' && value >= 0 && value <= this.duration) seek(value);
      }
    },
    isPlaying: {
      enumerable: true,
      get(){ return nfo.isPlaying }
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
    }
  });

  dAudio.prototype.play = function(){ play() }
  dAudio.prototype.pause = function(){ pause() }
  dAudio.prototype.stop = function(){ stop() }
  dAudio.prototype.playPause = function(){ playPause() }
}