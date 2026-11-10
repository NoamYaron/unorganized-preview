(function () {
  var root = document.querySelector("[data-radio]");
  if (!root) return;

  var music = root.querySelector(".radio-music");
  var voice = root.querySelector(".radio-voice");
  var playBtn = root.querySelector(".radio-play");
  var skipBtn = root.querySelector(".radio-skip");
  var vol = root.querySelector(".radio-vol");
  var cover = root.querySelector(".radio-cover");
  var live = root.querySelector("#radio-live");
  var meta = root.querySelector(".radio-meta");
  var buy = root.querySelector(".radio-buy");
  var caption = root.querySelector(".radio-caption");
  var bags = new Map();
  var breakCount = 0;
  var heard = 0;
  var talkId = 0; // bumped on skip so an interrupted break never resumes
  var TALK_GAP = 30; // seconds of music before Rocco talks again
  var queue = [];
  var pos = 0;
  var data = null;
  var talking = false;
  var started = false;
  var wantPlay = false;

  function $(sel) { return root.querySelector(sel); }

  function fill(tpl, ctx) {
    return tpl.replace(/\{(\w+)\}/g, function (_, k) { return ctx[k] == null ? "" : String(ctx[k]); }).replace(/\.\./g, ".");
  }

  function pick(list) {
    if (!list || !list.length) return null;
    // Shuffle bag: every line plays once before any line plays twice.
    var bag = bags.get(list);
    if (!bag || !bag.length) {
      var last = bag && bag.last;
      bag = list.slice();
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
      }
      if (bag.length > 1 && bag[bag.length - 1] === last) bag.unshift(bag.pop());
      bags.set(list, bag);
    }
    bag.last = bag.pop();
    return bag.last;
  }

  function hourBank() {
    var h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    if (h < 21) return "evening";
    return "night";
  }

  function hasHebrew(s) {
    return /[\u0590-\u05FF]/.test(s || "");
  }

  function ctxFor(track) {
    return {
      artist: track.artist,
      title: track.title,
      release: track.release,
      cat: track.cat,
      year: track.year,
      slug: track.artistSlug || ""
    };
  }

  function clipFor(text) {
    if (!data.clips || !text) return null;
    return data.clips[text] || null;
  }

  function audioUrl(file) {
    if (!file) return "";
    if (/^https?:\/\//i.test(file) || file.charAt(0) === "/") return file;
    if (file.indexOf("radio/") === 0) return file;
    var base = data.audioBase || "radio/audio/";
    if (base.slice(-1) !== "/") base += "/";
    return base + file;
  }

  function setLive(text) {
    live.textContent = text;
  }

  function setCaption(text) {
    caption.textContent = text || "";
  }

  function showTrack(track) {
    var line = track.title + " — " + track.artist;
    setLive(line);
    meta.textContent = track.cat + " · " + track.release + " · " + track.year;
    cover.src = track.cover;
    cover.alt = "Cover of " + track.release + " by " + track.artist;
    if (track.bandcamp) {
      buy.href = track.bandcamp;
      buy.hidden = false;
    } else {
      buy.hidden = true;
      buy.removeAttribute("href");
    }
  }

  function shuffle() {
    var i, t, arr = data.tracks.slice();
    for (i = arr.length - 1; i > 0; i--) {
      t = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[t]; arr[t] = tmp;
    }
    queue = arr;
    pos = 0;
  }

  function current() { return queue[pos]; }

  function advance() {
    var prev = current();
    pos += 1;
    if (pos >= queue.length) shuffle();
    if (prev && queue.length > 1 && current().cat === prev.cat && queue.length > 2) advance();
  }

  function breakLines(prev, next) {
    var n = data.narrator;
    var bits = [];
    var c = ctxFor(next);
    var roll = Math.random();
    if (prev && Math.random() < 0.55) {
      var outros = prev.bandcamp ? n.outrosGeneric : (n.outrosStreaming || n.outrosGeneric);
      var o = pick(outros);
      if (o) bits.push(fill(o, ctxFor(prev)));
    }
    if (roll < 0.22) {
      var b = pick(n.banter);
      if (b) bits.push({ banter: b });
    } else if (roll < 0.4) {
      var id = pick(n.idents); if (id) bits.push(id);
    } else if (roll < 0.55) {
      var lore = pick(n.lore); if (lore) bits.push(lore);
    } else if (roll < 0.66) {
      var d = pick(n.demos); if (d) bits.push(d);
    } else if (roll < 0.78) {
      var bc = pick(n.bandcamp); if (bc) bits.push(bc);
    } else {
      var t = pick((n.time && n.time[hourBank()]) || []); if (t) bits.push(t);
    }
    breakCount += 1;
    if (breakCount % 6 === 0) {
      var r = pick(n.rocco); if (r) bits.unshift(r);
    }
    var intro = trackIntro(next); if (intro) bits.push(intro);
    if (Math.random() < 0.3) {
      var ap = (n.artistsBySlug && next.artistSlug && n.artistsBySlug[next.artistSlug]) || n.artistsGeneric || [];
      var a = pick(ap); if (a) bits.push(fill(a, c));
    }
    return bits;
  }

  function trackIntro(next) {
    var n = data.narrator;
    if (hasHebrew(next.title) || hasHebrew(next.release)) {
      var h = pick(n.hebrewNext); return h && fill(h, ctxFor(next));
    }
    var pool = n.introsByCat && n.introsByCat[next.cat];
    if (!pool || Math.random() < 0.5) pool = n.introsGeneric;
    var t = pick(pool); return t && fill(t, ctxFor(next));
  }

  // First Play of a session: Rocco introduces himself, then the first track.
  function introLines() {
    var hi = pick(data.narrator.intro);
    var t = trackIntro(current());
    return [hi, t].filter(Boolean);
  }

  function flattenCaption(bits) {
    return bits.map(function (b) {
      if (b && b.banter) return "ROCCO: " + b.banter.mic + "  CRATE: " + b.banter.crate;
      return b;
    }).join(" ");
  }

  function playClip(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve();
      function done() {
        voice.removeEventListener("ended", done);
        voice.removeEventListener("error", done);
        resolve();
      }
      voice.addEventListener("ended", done);
      voice.addEventListener("error", done);
      voice.src = src;
      var p = voice.play();
      if (p && p.catch) p.catch(done);
    });
  }

  function playBits(bits) {
    var id = ++talkId;
    var stale = function () { return id !== talkId ? new Promise(function () {}) : null; };
    talking = true;
    setCaption(flattenCaption(bits));
    var seq = [];
    bits.forEach(function (b) {
      if (b && b.banter) {
        seq.push({ text: b.banter.mic, audio: clipFor(b.banter.mic) });
        seq.push({ text: b.banter.crate, audio: clipFor(b.banter.crate) });
      } else {
        seq.push({ text: b, audio: clipFor(b) });
      }
    });
    return seq.reduce(function (p, item) {
      return p.then(function () { return stale() || playClip(item.audio ? audioUrl(item.audio) : ""); });
    }, Promise.resolve()).then(function () {
      if (stale()) return stale();
      talking = false;
    });
  }

  function playTrack() {
    var track = current();
    if (!track) return;
    showTrack(track);
    music.src = audioUrl(track.audio);
    music.play().catch(function () {});
    root.classList.add("is-live");
    playBtn.textContent = "Pause";
    playBtn.setAttribute("aria-label", "Pause");
  }

  function pauseAll() {
    music.pause();
    voice.pause();
    root.classList.remove("is-live");
    playBtn.textContent = "Play";
    playBtn.setAttribute("aria-label", "Play");
  }

  function onPlayPause() {
    if (!started) {
      started = true;
      wantPlay = true;
      showTrack(current());
      root.classList.add("is-live");
      playBtn.textContent = "Pause";
      playBtn.setAttribute("aria-label", "Pause");
      playBits(introLines()).then(function () {
        if (wantPlay) playTrack();
      });
      return;
    }
    if (talking) {
      if (voice.paused) {
        wantPlay = true;
        voice.play().catch(function () {});
        root.classList.add("is-live");
        playBtn.textContent = "Pause";
        playBtn.setAttribute("aria-label", "Pause");
      } else {
        wantPlay = false;
        pauseAll();
      }
      return;
    }
    if (music.paused) {
      wantPlay = true;
      music.play().catch(function () {});
      root.classList.add("is-live");
      playBtn.textContent = "Pause";
      playBtn.setAttribute("aria-label", "Pause");
    } else {
      wantPlay = false;
      pauseAll();
    }
  }

  function onSkip() {
    started = true;
    wantPlay = true;
    talkId += 1;
    voice.pause();
    talking = false;
    setCaption("");
    advance();
    playTrack();
  }

  function onEnded() {
    var prev = current();
    advance();
    var next = current();
    heard += isFinite(music.duration) ? music.duration : 0;
    var bits = [];
    if (heard >= TALK_GAP) { heard = 0; bits = breakLines(prev, next); }
    showTrack(next);
    playBits(bits).then(function () {
      if (wantPlay) playTrack();
    });
  }

  // Dancing ASCII raccoon. Every frame is 4 lines x 11 columns, so the stage never jumps.
  // 0 = idle, 1-2 = idle sway, 3+ = beat moves.
  var POSES = [
    "  /\\___/\\  \n ( =o.o= ) \n  /|   |\\  \n   /   \\   ",
    " /\\___/\\   \n( =o.o= )  \n /|   |\\   \n   /   \\   ",
    "   /\\___/\\ \n  ( =o.o= )\n   /|   |\\ \n   /   \\   ",
    " /\\___/\\   \n( =o.o= )  \n\\\\|   |\\   \n  /   |    ",
    "   /\\___/\\ \n  ( =o.o= )\n   /|   |//\n    |   \\  ",
    "\\ /\\___/\\ /\n ( =^.^= ) \n   |   |   \n   /   \\   ",
    "           \n  /\\___/\\  \n_( =>.<= )_\n  _/   \\_  ",
    "  /\\___/\\  \n (       ) \n  /|   |\\  \n   /   \\   "
  ];
  var SLEEP = "  /\\___/\\ z\n ( =-.-= )Z\n  (     )  \n  (_____)  ";
  var an = null, buf, raf = 0, pose = 0, avg = 0, last = 0, shown = "";
  var viz = document.createElement("pre");
  viz.className = "radio-viz";
  viz.setAttribute("aria-hidden", "true");
  function show(art) {
    if (art !== shown) viz.textContent = shown = art; // touch the DOM only on a real change
  }
  show(SLEEP);
  root.insertBefore(viz, root.querySelector(".radio-controls"));
  function vizStart() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || an === false) return show(POSES[0]);
    if (!an) {
      try {
        // Cross-origin audio without CORS would go silent through Web Audio, so only tap same-origin.
        if (new URL(music.currentSrc, location.href).origin !== location.origin) throw 0;
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        an = ctx.createAnalyser();
        an.fftSize = 256;
        buf = new Uint8Array(an.fftSize);
        ctx.createMediaElementSource(music).connect(an);
        an.connect(ctx.destination);
      } catch (e) { an = false; return show(POSES[0]); }
    }
    if (an.context.state !== "running") an.context.resume();
    cancelAnimationFrame(raf);
    last = performance.now(); // hold the current pose for a full beat after (re)starting
    (function draw(t) {
      an.getByteTimeDomainData(buf);
      var sum = 0, i;
      for (i = 0; i < buf.length; i++) sum += (buf[i] - 128) * (buf[i] - 128);
      var rms = Math.sqrt(sum / buf.length);
      // Calm: at most one pose change per ~950ms; a beat picks a dance move, otherwise sway every 1.5s.
      if (t - last >= 950) {
        var next = rms > avg * 1.3 + 2 ? 3 + (pose + 1 + Math.floor(Math.random() * 4)) % 5
          : t - last >= 1500 ? (pose === 1 ? 2 : 1) : pose;
        if (next !== pose) { pose = next; last = t; }
      }
      avg = avg * 0.95 + rms * 0.05;
      show(POSES[pose]);
      raf = requestAnimationFrame(draw);
    })(performance.now());
  }
  function vizStop() { cancelAnimationFrame(raf); show(SLEEP); }
  music.addEventListener("playing", vizStart);
  music.addEventListener("pause", vizStop);
  music.addEventListener("ended", vizStop);

  playBtn.addEventListener("click", onPlayPause);
  skipBtn.addEventListener("click", onSkip);
  vol.addEventListener("input", function () {
    var v = Number(vol.value);
    music.volume = v;
    voice.volume = v;
  });
  music.addEventListener("ended", onEnded);

  fetch("radio/playlist.json")
    .then(function (r) { return r.json(); })
    .then(function (pl) {
      return fetch("radio/narrator.json").then(function (r) { return r.json(); }).then(function (n) {
        data = pl;
        data.narrator = n;
        data.clips = n.clips || pl.clips || {};
        shuffle();
        if (current()) {
          showTrack(current());
          setLive("Press play to go on air.");
          meta.textContent = "Up first: " + meta.textContent;
          playBtn.disabled = false;
          skipBtn.disabled = false;
        }
      });
    })
    .catch(function () {
      setLive("Radio is offline for a moment.");
    });
})();
