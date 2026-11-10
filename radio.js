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
  var recent = [];
  var queue = [];
  var pos = 0;
  var data = null;
  var talking = false;
  var started = false;
  var wantPlay = false;

  function $(sel) { return root.querySelector(sel); }

  function fill(tpl, ctx) {
    return tpl.replace(/\{(\w+)\}/g, function (_, k) { return ctx[k] == null ? "" : String(ctx[k]); });
  }

  function pick(list) {
    if (!list || !list.length) return null;
    var choices = list.filter(function (x) { return recent.indexOf(x) === -1; });
    if (!choices.length) choices = list;
    var item = choices[Math.floor(Math.random() * choices.length)];
    recent.push(item);
    if (recent.length > 30) recent.shift();
    return item;
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
    if (hasHebrew(next.title) || hasHebrew(next.release)) {
      var h = pick(n.hebrewNext); if (h) bits.push(fill(h, c));
    } else {
      var pool = (n.introsByCat && n.introsByCat[next.cat] || []).concat(n.introsGeneric || []);
      var intro = pick(pool); if (intro) bits.push(fill(intro, c));
    }
    if (Math.random() < 0.3) {
      var ap = (n.artistsBySlug && next.artistSlug && n.artistsBySlug[next.artistSlug]) || n.artistsGeneric || [];
      var a = pick(ap); if (a) bits.push(fill(a, c));
    }
    return bits;
  }

  function flattenCaption(bits) {
    return bits.map(function (b) {
      if (b && b.banter) return "MIC: " + b.banter.mic + "  CRATE: " + b.banter.crate;
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
      return p.then(function () { return playClip(item.audio ? audioUrl(item.audio) : ""); });
    }, Promise.resolve()).then(function () {
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
      playTrack();
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
    var bits = breakLines(prev, next);
    showTrack(next);
    playBits(bits).then(function () {
      if (wantPlay) playTrack();
    });
  }

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
