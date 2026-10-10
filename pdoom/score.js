/* pDoom: a score for "six months in forty-five seconds".
   An original minimalist piece in the spirit of early-80s Philip Glass film scores: fast organ
   arpeggios with additive figures, a 3-against-2 counter-line, a pulsing bass and a low choir.
   (Own progression and patterns; nothing is quoted.) Every note hangs off the line's travel, so
   the music ramps up, races and settles exactly with the picture, and the organ gets brighter
   and harsher as the doom reading rises. Pure Web Audio: plays live, and renders offline
   (OfflineAudioContext) for the video, deterministically. */
(function () {
  "use strict";

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  // A minor loop, eight days per chord. arp: five ascending tones; pad: low choir; bass: root.
  var CHORDS = [
    { bass: 45, arp: [57, 60, 64, 69, 71], pad: [45, 48, 52] },   // A minor (add 9)
    { bass: 41, arp: [53, 57, 60, 64, 65], pad: [41, 45, 48] },   // F major 7
    { bass: 38, arp: [50, 53, 57, 62, 64], pad: [38, 41, 45] },   // D minor (add 9)
    { bass: 40, arp: [52, 56, 59, 64, 68], pad: [40, 44, 47] }    // E major
  ];
  var DAYS_PER_CHORD = 8;
  var FIGURE = [0, 1, 2, 3, 4, 3, 2, 1];          // up-and-back; its length grows 3 -> 8 (additive)
  var COUNTER = [0, 2, 1, 3, 2, 4];               // broken thirds, an octave up, two per day
  var FINAL = { bass: [33, 45], organ: [57, 59, 64, 69, 71, 76], choir: [45, 52, 57] };  // A sus2
  var BASS_ENTERS = 16, COUNTER_ENTERS = 32;      // days: the texture builds in layers, Glass-style

  function cutoffFor(doom) { return 700 + Math.max(0, doom - 28) * 110; }   // more doom, harsher organ

  // ---- the score as a list of timed events ---------------------------------------------------
  function buildEvents(flow) {
    var tl = flow.timeline, days = flow.days, n = days.length;
    var ev = [{ v: "pad", t: 0, notes: CHORDS[0].pad, attack: 0.8 }];
    var last = { a: -1, b: -1, z: -1, c: 0 };
    var step = 0.001;
    for (var t = tl.intro; t < tl.arrive; t += step) {
      var h = flow.hAt(t);
      var speed = Math.max(0.05, (flow.hAt(t + 0.02) - h) / 0.02);   // days per second
      var day = Math.min(n - 1, Math.floor(h));
      var doom = days[day].doom;
      var ci = Math.floor(h / DAYS_PER_CHORD), c = CHORDS[ci % CHORDS.length];
      if (ci !== last.c) { last.c = ci; ev.push({ v: "pad", t: t, notes: c.pad, attack: 0.25 }); ev.push({ v: "cut", t: t, doom: doom }); }
      var ka = Math.floor(h * 3);
      if (ka !== last.a) {
        last.a = ka;
        var len = 3 + Math.min(5, Math.floor((h / (n - 1)) * 6));
        ev.push({ v: "a", t: t, m: c.arp[FIGURE[ka % len]], ioi: 1 / (speed * 3) });
      }
      var kb = Math.floor(h * 2 + 0.5);
      if (kb !== last.b && h >= COUNTER_ENTERS) {
        last.b = kb;
        ev.push({ v: "b", t: t, m: c.arp[COUNTER[kb % COUNTER.length]] + 12, ioi: 1 / (speed * 2) });
      }
      var kz = Math.floor(h / 2);
      if (kz !== last.z && h >= BASS_ENTERS) {
        last.z = kz;
        var off = [0, 12, 7, 12][kz % 4];
        ev.push({ v: "z", t: t, m: c.bass + off - 12, ioi: 2 / speed });
      }
    }
    ev.push({ v: "final", t: tl.arrive });
    ev.sort(function (x, y) { return x.t - y.t; });
    // each pad chord lasts until the next one (or the landing)
    var pads = ev.filter(function (e) { return e.v === "pad"; });
    pads.forEach(function (p, i) { p.dur = (i + 1 < pads.length ? pads[i + 1].t : tl.arrive) - p.t + 0.35; });
    return ev;
  }

  // ---- the instrument rack --------------------------------------------------------------------
  function seeded(seed) {   // mulberry32: the same reverb every time
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var r = Math.imul(seed ^ seed >>> 15, 1 | seed);
      r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }

  // t0: context time of the piece's start; from: seconds into the piece playback begins at (live only)
  function makeRack(ctx, dest, t0, from) {
    var master = ctx.createGain();
    if (from > 0) {                                             // joining mid-piece: a short fade in to
      var now = ctx.currentTime, level = 0.55 + 0.35 * Math.min(1, from / 15);   // wherever the build is
      master.gain.setValueAtTime(0.0001, now);
      master.gain.linearRampToValueAtTime(level, now + 0.35);
      if (from < 14) master.gain.linearRampToValueAtTime(0.9, t0 + 15);
    } else {
      master.gain.setValueAtTime(0.55, t0);                     // the build: quieter at the start,
      master.gain.linearRampToValueAtTime(0.9, t0 + 15);        // full by fifteen seconds
    }
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(dest);

    var sr = ctx.sampleRate, len = Math.floor(sr * 2.8), rnd = seeded(20261010);
    var ir = ctx.createBuffer(2, len, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    var verb = ctx.createConvolver(); verb.buffer = ir;
    var verbGain = ctx.createGain(); verbGain.gain.value = 0.32;
    verb.connect(verbGain); verbGain.connect(master);

    function bus(pan, send, filter) {
      var g = ctx.createGain();
      var p = ctx.createStereoPanner(); p.pan.value = pan;
      var head = g;
      if (filter) { filter.connect(g); head = filter; }
      g.connect(p); p.connect(master);
      var s = ctx.createGain(); s.gain.value = send; p.connect(s); s.connect(verb);
      return { input: head, gain: g, filter: filter };
    }
    var organFilter = ctx.createBiquadFilter(); organFilter.type = "lowpass"; organFilter.Q.value = 1.1;
    organFilter.frequency.value = cutoffFor(40);
    var bassFilter = ctx.createBiquadFilter(); bassFilter.type = "lowpass"; bassFilter.frequency.value = 520; bassFilter.Q.value = 0.8;
    var f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = 700; f1.Q.value = 4;    // "ah" formants
    var f2 = ctx.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = 1150; f2.Q.value = 5;
    var choirIn = ctx.createGain();
    choirIn.connect(f1); choirIn.connect(f2);
    var choir = bus(0, 0.6, null);
    f1.connect(choir.input); f2.connect(choir.input);
    choir.input = choirIn;
    return {
      ctx: ctx,
      master: master,
      organ: bus(-0.28, 0.14, organFilter),
      counter: bus(0.34, 0.38, null),
      bass: bus(0, 0.06, bassFilter),
      choir: choir,
      final: bus(0, 0.55, null)
    };
  }

  function voice(ctx, out, type, freq, t, peak, attack, dur, detuneCents) {
    var o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (detuneCents) o.detune.setValueAtTime(detuneCents, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function play(rack, e, at) {
    var ctx = rack.ctx, t = at + e.t;
    if (e.v === "a") {
      var dA = clamp(e.ioi * 1.7, 0.07, 0.42);
      voice(ctx, rack.organ.input, "square", mtof(e.m), t, 0.095, 0.004, dA);
      voice(ctx, rack.organ.input, "sine", mtof(e.m) * 2, t, 0.05, 0.004, dA * 0.8);
    } else if (e.v === "b") {
      voice(ctx, rack.counter.input, "triangle", mtof(e.m), t, 0.07, 0.003, clamp(e.ioi * 2.2, 0.09, 0.6));
    } else if (e.v === "z") {
      var dZ = clamp(e.ioi * 0.55, 0.14, 0.6);
      voice(ctx, rack.bass.input, "sawtooth", mtof(e.m), t, 0.11, 0.008, dZ);
      voice(ctx, rack.bass.input, "sine", mtof(e.m), t, 0.13, 0.008, dZ);
    } else if (e.v === "pad") {
      e.notes.forEach(function (m) {
        [-7, 7].forEach(function (cents) { padVoice(ctx, rack.choir.input, mtof(m), t, e.attack, e.dur, cents); });
      });
    } else if (e.v === "cut") {
      rack.organ.filter.frequency.setTargetAtTime(cutoffFor(e.doom), t, 0.15);
    } else if (e.v === "final") {
      landing(rack, t);
    }
  }

  function padVoice(ctx, out, freq, t, attack, dur, cents) {
    var o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(freq, t); o.detune.setValueAtTime(cents, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + attack);
    g.gain.setValueAtTime(0.06, t + Math.max(attack, dur - 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function landing(rack, t) {
    var ctx = rack.ctx, out = rack.final.input;
    // the thump under the flash
    var o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.35);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.8);
    // a wide A sus2 that rings out over the hold
    FINAL.bass.forEach(function (m) {
      voice(ctx, out, "sawtooth", mtof(m), t, 0.08, 0.02, 5.6);
      voice(ctx, out, "sine", mtof(m), t, 0.12, 0.02, 5.8);
    });
    FINAL.organ.forEach(function (m, i) {
      voice(ctx, out, "square", mtof(m), t + i * 0.012, 0.035, 0.015, 5.2);
      voice(ctx, out, "sine", mtof(m) * 2, t + i * 0.012, 0.025, 0.015, 4.6);
    });
    FINAL.choir.forEach(function (m) {
      [-7, 7].forEach(function (cents) { padVoice(ctx, rack.choir.input, mtof(m), t, 0.6, 5.8, cents); });
    });
  }

  // ---- public: offline render (video) and live playback (page) --------------------------------
  function renderWav(flow, sampleRate) {
    sampleRate = sampleRate || 44100;
    var dur = flow.timeline.duration;
    var ctx = new OfflineAudioContext(2, Math.ceil(dur * sampleRate), sampleRate);
    var rack = makeRack(ctx, ctx.destination, 0);
    buildEvents(flow).forEach(function (e) { play(rack, e, 0); });
    return ctx.startRendering().then(function (buf) { return toWav(buf); });
  }

  function toWav(buf) {
    var chs = [buf.getChannelData(0), buf.getChannelData(1)], n = buf.length;
    // level by loudness, not by peak: bring the main stretch (10-35 s) to about -17 dBFS RMS, then
    // let a soft clipper round off the few peaks (the landing thump) instead of turning it all down
    var a0 = Math.floor(10 * buf.sampleRate), a1 = Math.min(n, Math.floor(35 * buf.sampleRate)), sum = 0;
    for (var c = 0; c < 2; c++) for (var i = a0; i < a1; i++) sum += chs[c][i] * chs[c][i];
    var rms = Math.sqrt(sum / Math.max(1, 2 * (a1 - a0)));
    var gain = 0.141 / Math.max(rms, 1e-6);
    function soft(x) { var y = x * gain; return Math.abs(y) < 0.75 ? y : (y > 0 ? 1 : -1) * (0.75 + 0.17 * Math.tanh((Math.abs(y) - 0.75) / 0.17)); }
    var bytes = new DataView(new ArrayBuffer(44 + n * 4));
    function str(o, s) { for (var k = 0; k < s.length; k++) bytes.setUint8(o + k, s.charCodeAt(k)); }
    str(0, "RIFF"); bytes.setUint32(4, 36 + n * 4, true); str(8, "WAVE"); str(12, "fmt ");
    bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
    bytes.setUint32(24, buf.sampleRate, true); bytes.setUint32(28, buf.sampleRate * 4, true);
    bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true); str(36, "data"); bytes.setUint32(40, n * 4, true);
    var o = 44;
    for (var j = 0; j < n; j++) for (var ch = 0; ch < 2; ch++) {
      var s = clamp(soft(chs[ch][j]), -1, 1);
      bytes.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
    }
    var u8 = new Uint8Array(bytes.buffer), bin = "";
    for (var b = 0; b < u8.length; b += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(b, b + 0x8000));
    return btoa(bin);
  }

  // Live: schedules a little ahead of the clock. from: seconds into the piece to begin at (0 = the
  // top), so sound can join an animation that's already running. Returns { start, stop }, start
  // being the context time of the piece's t = 0, so the page can run the picture off the audio clock.
  function playLive(flow, ctx, from) {
    from = Math.max(0, from || 0);
    var start = from > 0 ? ctx.currentTime - from : ctx.currentTime + 0.15, timer = null;
    var rack = makeRack(ctx, ctx.destination, start, from);
    var events = buildEvents(flow), i = 0;
    if (from > 0) {
      var at = from + 0.03, cut = null;
      for (; i < events.length && events[i].t < at; i++) {     // skip what's already gone by, but
        var e = events[i];
        if (e.v === "cut") cut = e;                             // keep the organ's current brightness
        else if (e.v === "pad" && e.t + e.dur > at + 0.3) {     // and bring in the chord still sounding
          var left = e.t + e.dur - at;
          play(rack, { v: "pad", t: at, notes: e.notes, attack: Math.min(0.5, left * 0.4), dur: left }, start);
        }
      }
      if (cut) rack.organ.filter.frequency.setValueAtTime(cutoffFor(cut.doom), ctx.currentTime);
    }
    function pump() {
      var horizon = ctx.currentTime - start + 0.3;
      while (i < events.length && events[i].t <= horizon) { play(rack, events[i], start); i++; }
      if (i >= events.length) clearInterval(timer);
    }
    pump();
    timer = setInterval(pump, 40);
    function stop() {   // quick fade so notes already scheduled don't ring on under a restart
      clearInterval(timer);
      var now = ctx.currentTime, g = rack.master.gain;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + 0.12);
      setTimeout(function () { try { rack.master.disconnect(); } catch (err) {} }, 300);
    }
    return { start: start, stop: stop };
  }

  window.pdoomScore = { renderWav: renderWav, playLive: playLive };
})();
