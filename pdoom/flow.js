/* pDoom: six months in forty-five seconds.
   One 1080x1920 canvas. renderAt(t) draws the frame for time t (seconds) from scratch, so the
   same code plays live in the browser and renders the video frame by frame. */
(function () {
  "use strict";

  var W = 1080, H = 1920, DURATION = 45;
  var T_INTRO = 0.9;        // everything fades in over the first 0.6 s; the line starts here
  var T_ARRIVE = 39.0;      // the line reaches today; the rest is the landing
  var ACCEL = 2.5, DECEL = 4.0;   // seconds spent speeding up at the start and settling at the end
  var NIGHT = "#080a16", INK = "#ecebf2", DIM = "#a9a8ba";
  var RULE = "rgba(236,235,242,0.13)", RULE_STRONG = "rgba(236,235,242,0.32)";
  var PIXEL = '"Pixelify Sans Variable", system-ui, sans-serif';
  var NEWS = '"Newsreader Variable", Georgia, serif';
  var DOOM_ACCENTS = {1: [90,130,165], 2: [100,150,175], 3: [205,175,70], 4: [215,145,50], 5: [230,120,40],
                      6: [240,90,35], 7: [230,55,28], 8: [250,100,28], 9: [255,185,25], 10: [255,50,15]};
  var DAWN_ACCENTS = {1: [165,155,115], 2: [185,170,85], 3: [215,190,65], 4: [235,200,50], 5: [130,195,80],
                      6: [80,200,145], 7: [65,185,205], 8: [245,165,50], 9: [255,205,40], 10: [255,225,60]};
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
                "September", "October", "November", "December"];
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  var L = { x: 60, cardTop: 236, card: 465, gap: 30, dateY: 790, pctY: 893, blurbY: 950,
            plotLeft: 150, plotRight: 1020, chartTop: 1060, chartBottom: 1630, footY: 1752 };

  function rgb(a, alpha) { return alpha == null ? "rgb(" + a.join(",") + ")" : "rgba(" + a.join(",") + "," + alpha + ")"; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  // Travel 0..1 over T seconds with a trapezoid speed profile: a gentle ramp up over `a` seconds,
  // an even cruise (cards flip at a steady pace), and a long settle over `d` seconds. Replaces an
  // ease-in-out cubic that sat almost still for ~2.5 s and then lurched.
  function travel(tau, T, a, d) {
    if (tau <= 0) return 0;
    if (tau >= T) return 1;
    var v = 1 / (T - (a + d) / 2);
    if (tau < a) return 0.5 * v / a * tau * tau;
    if (tau < T - d) return v * a / 2 + v * (tau - a);
    var r = T - tau;
    return 1 - 0.5 * v / d * r * r;
  }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function parseDay(s) { var p = s.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function longDate(s) { var d = parseDay(s); return WEEKDAYS[d.getUTCDay()] + ", " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear(); }
  function pct(v) { return Number(v).toFixed(1) + "%"; }

  function createFlow(canvas, data, opts) {
    opts = opts || {};
    var ctx = canvas.getContext("2d");
    canvas.width = W; canvas.height = H;
    var days = data.days, N = days.length;
    var lo = data.range[0], hi = data.range[1];
    var plotW = L.plotRight - L.plotLeft, plotH = L.chartBottom - L.chartTop;
    var xs = days.map(function (_, i) { return L.plotLeft + (N > 1 ? i / (N - 1) : 1) * plotW; });
    var ys = days.map(function (d) { return L.chartBottom - (d.doom - lo) / (hi - lo) * plotH; });
    var methodIdx = -1;
    days.forEach(function (d, i) { if (methodIdx < 0 && data.methodChange && d.d >= data.methodChange) methodIdx = i; });
    if (methodIdx === 0) methodIdx = -1;

    // ---- images: one per day per side, plus today's full-size cards ----------------------
    var imgs = {};
    function load(url) {
      if (!url) return null;
      if (!imgs[url]) {
        var im = new Image();
        im.decoding = "async";
        im.src = url;
        imgs[url] = im;
      }
      return imgs[url];
    }
    function ready(im) { return im && im.complete && im.naturalWidth > 0; }
    // opts.thumbUrl(name): small per-day image for the flipbook; opts.cardUrl(name): full-size card
    function dayImg(i, side) { return load(opts.thumbUrl(days[i][side])); }
    var todayDoom = load(opts.cardUrl(data.today.doomCard)), todayDawn = load(opts.cardUrl(data.today.dawnCard));
    // newest-ready image at or before day i, so a slow download never flashes an empty slot
    function bestImg(i, side) {
      for (var k = i; k >= 0 && k > i - 30; k--) { var im = dayImg(k, side); if (ready(im)) return im; }
      return null;
    }
    // listeners, not onload=, so several waiters on the same image all hear about it
    function settled(im) {
      if (!im || im.complete) return Promise.resolve();
      return new Promise(function (res) {
        im.addEventListener("load", res, { once: true });
        im.addEventListener("error", res, { once: true });
      });
    }
    function preload(count) {
      var list = [todayDoom, todayDawn];
      for (var i = 0; i < Math.min(count, N); i++) { list.push(dayImg(i, "doomImg"), dayImg(i, "dawnImg")); }
      return Promise.all(list.map(settled));
    }
    function preloadAll() { for (var i = 0; i < N; i++) { dayImg(i, "doomImg"); dayImg(i, "dawnImg"); } return preload(N); }

    // ---- drawing helpers ------------------------------------------------------------------
    function text(str, x, y, font, color, align, alpha) {
      var base = ctx.globalAlpha;   // respect any fade already in effect (the chart's intro fade)
      ctx.save();
      ctx.globalAlpha = base * (alpha == null ? 1 : alpha);
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText(str, x, y);
      ctx.restore();
    }
    function wrap(str, maxW, font) {
      ctx.font = font;
      var words = String(str).split(/\s+/), lines = [], line = "";
      words.forEach(function (w) {
        var t = line ? line + " " + w : w;
        if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else { line = t; }
      });
      if (line) lines.push(line);
      return lines;
    }
    function drawCard(im, x, y, size, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#0e1124";
      ctx.fillRect(x, y, size, size);
      if (im) {
        ctx.imageSmoothingEnabled = im.naturalWidth > size;   // crisp pixels when upscaling a thumbnail
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(im, x, y, size, size);
      }
      ctx.restore();
    }
    function pointAt(h) {
      var i = Math.floor(h), f = h - i;
      if (i >= N - 1) return [xs[N - 1], ys[N - 1], N - 1];
      return [xs[i] + (xs[i + 1] - xs[i]) * f, ys[i] + (ys[i + 1] - ys[i]) * f, i];
    }

    function drawChart(h, alpha, t) {
      ctx.save();
      ctx.globalAlpha = alpha;
      // grid and y labels
      for (var v = lo; v <= hi + 0.001; v += 10) {
        var y = L.chartBottom - (v - lo) / (hi - lo) * plotH;
        ctx.strokeStyle = v === lo ? RULE_STRONG : RULE; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(L.plotLeft, y); ctx.lineTo(L.plotRight, y); ctx.stroke();
        text(v + "%", L.plotLeft - 18, y + 11, "500 32px " + NEWS, DIM, "right");
      }
      // month labels at the first day of each month
      days.forEach(function (d, i) {
        if (d.d.slice(8) === "01") {
          var m = MONTHS[+d.d.slice(5, 7) - 1].slice(0, 3);
          ctx.strokeStyle = RULE_STRONG; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(xs[i], L.chartBottom); ctx.lineTo(xs[i], L.chartBottom + 14); ctx.stroke();
          text(m, xs[i], L.chartBottom + 54, "500 32px " + PIXEL, DIM, "center");
        }
      });
      // where the scoring method changed (readings run higher after it)
      if (methodIdx > 0) {
        var shown = clamp01((h - methodIdx + 1.5) / 6);
        if (shown > 0) {
          var mx = xs[methodIdx] - (xs[methodIdx] - xs[methodIdx - 1]) / 2;
          ctx.save();
          ctx.globalAlpha = alpha * shown;
          ctx.setLineDash([8, 10]); ctx.strokeStyle = RULE_STRONG; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(mx, L.chartTop - 6); ctx.lineTo(mx, L.chartBottom); ctx.stroke();
          ctx.restore();
          // low in the plot, where the line never goes, so it can't collide with the headlines above
          text("New scoring method", mx - 14, L.chartBottom - 22, "italic 400 30px " + NEWS, DIM, "right", alpha * shown);
        }
      }
      if (h < 0) { ctx.restore(); return; }
      var head = pointAt(h), last = head[2];
      // soft fill under the line, in today's-so-far doom color
      var tier = days[last].dt;
      // one fixed fill color: following the tier made the whole area flicker whenever doom crossed 40%
      var grad = ctx.createLinearGradient(0, L.chartTop, 0, L.chartBottom);
      grad.addColorStop(0, rgb(DOOM_ACCENTS[5], 0.2));
      grad.addColorStop(1, rgb(DOOM_ACCENTS[5], 0.0));
      ctx.beginPath(); ctx.moveTo(xs[0], L.chartBottom); ctx.lineTo(xs[0], ys[0]);
      for (var i = 1; i <= last; i++) ctx.lineTo(xs[i], ys[i]);
      ctx.lineTo(head[0], head[1]); ctx.lineTo(head[0], L.chartBottom); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      // the line, each day's segment in that day's doom tier color
      ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (var j = 0; j < last; j++) {
        ctx.strokeStyle = rgb(DOOM_ACCENTS[days[j + 1].dt] || DOOM_ACCENTS[5]);
        ctx.beginPath(); ctx.moveTo(xs[j], ys[j]); ctx.lineTo(xs[j + 1], ys[j + 1]); ctx.stroke();
      }
      if (last < N - 1) {
        ctx.strokeStyle = rgb(DOOM_ACCENTS[days[last + 1].dt] || DOOM_ACCENTS[5]);
        ctx.beginPath(); ctx.moveTo(xs[last], ys[last]); ctx.lineTo(head[0], head[1]); ctx.stroke();
      }
      // the head: a "now" rule and a glowing dot; it breathes once the line has landed
      var accent = DOOM_ACCENTS[tier] || DOOM_ACCENTS[5];
      ctx.globalAlpha = alpha * clamp01((t - T_INTRO) / 0.4);   // the head fades in rather than popping
      ctx.strokeStyle = RULE_STRONG; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.moveTo(head[0], head[1] + 16); ctx.lineTo(head[0], L.chartBottom); ctx.stroke();
      ctx.setLineDash([]);
      var r = 12 + (t > T_ARRIVE ? 4 * Math.sin((t - T_ARRIVE) * 4) : 0);
      ctx.shadowColor = rgb(accent, 0.9); ctx.shadowBlur = 34;
      ctx.fillStyle = rgb(accent); ctx.beginPath(); ctx.arc(head[0], head[1], r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(head[0], head[1], r * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // days travelled at time t; the score hangs every note off this, so sound and picture agree
    function hAt(t) { return (N - 1) * travel(t - T_INTRO, T_ARRIVE - T_INTRO, ACCEL, DECEL); }

    // ---- one frame --------------------------------------------------------------------------
    function renderAt(t) {
      t = Math.max(0, Math.min(DURATION, t));
      // the live page fades in; the video opens fully drawn so its first frame works as a cover
      var intro = opts.fadeIn === false ? 1 : easeOut(clamp01(t / 0.6));
      var arrived = t >= T_ARRIVE;
      var h = hAt(t);
      var ci = Math.min(N - 1, Math.floor(h + 1e-6));
      var day = days[ci];

      ctx.save();
      ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H);

      // header
      text("pDoom", L.x, 132, "700 84px " + PIXEL, INK, "left", intro);
      text("Six months of doom and dawn in forty-five seconds", L.x, 192, "italic 400 36px " + NEWS, DIM, "left", intro);

      // cards: a flipbook of every day, landing on today's full-size cards
      var size = L.card, x2 = L.x + size + L.gap;
      var doomIm = arrived ? (ready(todayDoom) ? todayDoom : bestImg(N - 1, "doomImg")) : bestImg(ci, "doomImg");
      var dawnIm = arrived ? (ready(todayDawn) ? todayDawn : bestImg(N - 1, "dawnImg")) : bestImg(ci, "dawnImg");
      var land = arrived ? easeOut(clamp01((t - T_ARRIVE) / 0.6)) : 0;
      var bump = arrived ? Math.sin(Math.PI * clamp01((t - T_ARRIVE) / 0.6)) * 10 : 0;
      drawCard(doomIm, L.x - bump, L.cardTop - bump, size + 2 * bump, intro);
      drawCard(dawnIm, x2 - bump, L.cardTop - bump, size + 2 * bump, intro);
      if (arrived) {   // a single flash as it lands
        var flash = Math.max(0, 0.6 - (t - T_ARRIVE) * 1.5);
        if (flash > 0) {
          ctx.fillStyle = "rgba(255,255,255," + flash + ")";
          ctx.fillRect(L.x - bump, L.cardTop - bump, size + 2 * bump, size + 2 * bump);
          ctx.fillRect(x2 - bump, L.cardTop - bump, size + 2 * bump, size + 2 * bump);
        }
      }

      // date and the two numbers
      var dateStr = arrived ? "Today, " + longDate(data.today.date) : longDate(day.d);
      text(dateStr, L.x, L.dateY, "600 46px " + NEWS, INK, "left", intro);
      var doomV = arrived ? data.today.doom : day.doom, dawnV = arrived ? data.today.dawn : day.dawn;
      var dt = arrived ? data.today.dt : day.dt, wt = arrived ? data.today.wt : day.wt;
      ctx.save(); ctx.globalAlpha = intro;
      ctx.font = "600 96px " + NEWS; ctx.fillStyle = rgb(DOOM_ACCENTS[dt] || DOOM_ACCENTS[5]); ctx.textAlign = "left";
      ctx.fillText(pct(doomV), L.x, L.pctY);
      var dw = ctx.measureText(pct(doomV)).width;
      ctx.fillStyle = rgb(DAWN_ACCENTS[wt] || DAWN_ACCENTS[5]);
      ctx.fillText(pct(dawnV), x2, L.pctY);
      var ww = ctx.measureText(pct(dawnV)).width;
      ctx.font = "500 40px " + PIXEL; ctx.fillStyle = INK;
      ctx.fillText("doom", L.x + dw + 16, L.pctY);
      ctx.fillText("dawn", x2 + ww + 16, L.pctY);
      ctx.restore();

      // today's headlines, once landed
      if (arrived) {
        var a = clamp01((t - T_ARRIVE - 0.4) / 0.8);
        var f = "600 28px " + NEWS;   // Pixelify's C reads as an O in caps, so headlines use the serif
        wrap(data.today.doomBlurb, size, f).slice(0, 3).forEach(function (line, k) {
          text(line, L.x, L.blurbY + k * 34, f, rgb(DOOM_ACCENTS[dt] || DOOM_ACCENTS[5]), "left", a);
        });
        wrap(data.today.dawnBlurb, size, f).slice(0, 3).forEach(function (line, k) {
          text(line, x2, L.blurbY + k * 34, f, rgb(DAWN_ACCENTS[wt] || DAWN_ACCENTS[5]), "left", a);
        });
      }

      drawChart(t < T_INTRO ? -1 : h, intro, t);

      // footer
      text("nomadjackalope.io/pdoom", L.x, L.footY, "600 44px " + PIXEL, INK, "left", intro);
      text("pDoom is free on iPhone. A new reading every morning.", L.x, L.footY + 56, "400 34px " + NEWS, DIM, "left", intro);
      ctx.restore();
    }

    return { renderAt: renderAt, duration: DURATION, preload: preload, preloadAll: preloadAll, width: W, height: H,
             hAt: hAt, days: days, timeline: { intro: T_INTRO, arrive: T_ARRIVE, duration: DURATION } };
  }

  window.createFlow = createFlow;
})();
