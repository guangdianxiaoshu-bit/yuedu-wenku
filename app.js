/* 中学文学性阅读文库：目录筛选 + 详情阅读 + 勾选一键打印 */
(function () {
  'use strict';
  var M = window.YDW.meta;
  var DIS = M.disclaimer;
  var ALL = window.YDW.articles.map(function (a) {
    a._id = (a.lib === '七年级' ? '七' : a.lib.charAt(0)) + '-' + String(a.no).padStart(3, '0');
    a._short = a.lib === '七年级' ? '七' : '八';
    return a;
  });

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  var TAG_ORDER = ['写景', '抒情', '叙事', '怀旧', '思乡', '亲情', '成长', '家国',
                   '科幻', '人与自然', '市井', '乡土', '教育', '读书'];
  /* 行内：转义后还原 **加粗** */
  function inline(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  /* 正文：段落按空行分隔，段内换行转 <br> */
  function bodyHtml(text) {
    var out = [];
    var paras = String(text).split(/\n{2,}/);
    for (var i = 0; i < paras.length; i++) {
      var seg = paras[i].trim();
      if (!seg) continue;
      var inner = seg.split('\n').map(function (l) { return inline(l.trim() ? l : ' '); }).join('<br>');
      out.push('<p>' + inner + '</p>');
    }
    return out.join('\n');
  }
  function chipLabel(a) {
    if (a.title.indexOf('节选') >= 0 || (a.tailNote && a.tailNote.indexOf('节选') >= 0)) return '节选';
    if (a.adapted) return '有删改';
    return '';
  }
  function diffCls(a) { return a.diff === '简单' ? 'easy' : (a.diff === '困难' ? 'hard' : 'mid'); }

  /* ---------------- 状态 ---------------- */
  var state = { lib: '全部', genre: '全部', tag: '全部', diff: '全部', q: '' };
  var selected = {};          // id -> true
  var lastScroll = 0;

  function filtered() {
    return ALL.filter(function (a) {
      if (state.lib !== '全部' && a.lib !== state.lib) return false;
      if (state.genre !== '全部' && a.genre !== state.genre) return false;
      if (state.tag !== '全部' && (a.tags || []).indexOf(state.tag) < 0) return false;
      if (state.diff !== '全部' && a.diff !== state.diff) return false;
      if (state.q) {
        var hay = (a.title + ' ' + a.author + ' ' + (a.note || '')).toLowerCase();
        if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
  }

  /* ---------------- 免责声明（每个页面都带） ---------------- */
  function fillDisclaimers() {
    $$('.disclaimer').forEach(function (el) {
      if (!el.textContent.trim()) el.textContent = DIS;
    });
  }

  /* ---------------- 目录页 ---------------- */
  function chip(opts) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'chip' + (opts.on ? ' on' : '');
    el.dataset.k = opts.k;
    el.dataset.v = opts.v;
    el.innerHTML = esc(opts.label) + (opts.n ? '<span class="n">' + opts.n + '</span>' : '');
    el.addEventListener('click', function () {
      state[opts.k] = opts.v;   /* k ∈ lib/genre/tag/diff */
      renderHome();
    });
    return el;
  }

  function renderChips() {
    var libs = [['全部'], ['七年级'], ['八九年级']];
    var genres = [['全部'], ['散文'], ['小说'], ['微型小说'], ['记叙文']];
    var diffs = [['全部'], ['简单'], ['中级'], ['困难']];
    var libEl = $('#libChips'), gEl = $('#genreChips'), dEl = $('#diffChips'), tEl = $('#tagChips');
    libEl.innerHTML = ''; gEl.innerHTML = ''; dEl.innerHTML = ''; tEl.innerHTML = '';
    function cnt(libSel, genreSel, diffSel) {
      return ALL.filter(function (a) {
        if (libSel !== '全部' && a.lib !== libSel) return false;
        if (genreSel !== '全部' && a.genre !== genreSel) return false;
        if (diffSel !== '全部' && a.diff !== diffSel) return false;
        return true;
      }).length;
    }
    libs.forEach(function (g) {
      libEl.appendChild(chip({ k: 'lib', v: g[0], label: g[0] === '全部' ? '全部年级' : g[0],
        on: state.lib === g[0], n: g[0] === '全部' ? '' : cnt(g[0], '全部', '全部') }));
    });
    genres.forEach(function (g) {
      gEl.appendChild(chip({ k: 'genre', v: g[0], label: g[0] === '全部' ? '全部文体' : g[0],
        on: state.genre === g[0], n: g[0] === '全部' ? '' : cnt('全部', g[0], '全部') }));
    });
    diffs.forEach(function (g) {
      dEl.appendChild(chip({ k: 'diff', v: g[0], label: g[0] === '全部' ? '全部难度' : g[0],
        on: state.diff === g[0], n: g[0] === '全部' ? '' : cnt('全部', '全部', g[0]) }));
    });
    tEl.appendChild(chip({ k: 'tag', v: '全部', label: '全部主题',
      on: state.tag === '全部', n: ALL.length }));
    TAG_ORDER.forEach(function (t) {
      var n = ALL.filter(function (a) { return (a.tags || []).indexOf(t) >= 0; }).length;
      if (n > 0) {
        tEl.appendChild(chip({ k: 'tag', v: t, label: t, on: state.tag === t, n: n }));
      }
    });
  }

  function tagHtml(a) {
    return (a.tags || []).map(function (t) {
      return '<span class="tag theme">' + esc(t) + '</span>';
    }).join('');
  }

  function liHtml(a) {
    var note = (a.noteOrigin && a.note) ? a.note : '';
    var ch = chipLabel(a);
    return '' +
      '<input type="checkbox" class="ck" ' + (selected[a._id] ? 'checked' : '') + '>' +
      '<div class="main" data-id="' + a._id + '">' +
      '  <div class="t">' + esc(a.title) + '</div>' +
      '  <div class="tags">' +
      tagHtml(a) +
      '    <span class="tag genre">' + esc(a.genre) + '</span>' +
      (a.genreNote ? '<span class="tag none">' + esc(a.genreNote) + '</span>' : '') +
      (ch ? '<span class="tag adapted">' + ch + '</span>' : '') +
      '    <span class="tag ' + diffCls(a) + '">' + esc(a.diff) + '</span>' +
      '  </div>' +
      '  <div class="sub">' + esc(a.lib) + ' · 篇 ' + String(a.no).padStart(3, '0') +
      (a.author !== '佚名' ? ' ｜ 作者：' + esc(a.author) : '') +
      (note ? ' ｜ ' + esc(note) : '') + '</div>' +
      '</div>';
  }

  function renderList() {
    var list = filtered();
    $('#countLine').textContent = '共 ' + list.length + ' 篇';
    $('#empty').hidden = list.length > 0;
    var ul = $('#list');
    ul.innerHTML = '';
    list.forEach(function (a) {
      var li = document.createElement('li');
      li.className = 'li';
      li.innerHTML = liHtml(a);
      var ck = li.querySelector('.ck');
      ck.addEventListener('click', function (e) {
        e.stopPropagation();
        if (ck.checked) selected[a._id] = true; else delete selected[a._id];
        updateSelBar();
      });
      li.addEventListener('click', function (e) {
        var main = e.target.closest('.main');
        if (main) openDetail(main.dataset.id);
      });
      ul.appendChild(li);
    });
  }

  function updateSelBar() {
    var n = Object.keys(selected).length;
    $('#selInfo').textContent = '已选 ' + n + ' 篇';
    $('#btnPrintSel').disabled = n === 0;
    $('#ckAll').checked = false;
    var list = filtered();
    var allOn = list.length > 0 && list.every(function (a) { return selected[a._id]; });
    $('#ckAll').checked = allOn;
  }

  function renderHome() {
    $('#homeView').hidden = false;
    $('#detailView').hidden = true;
    renderChips();
    renderList();
    updateSelBar();
    fillDisclaimers();
    if (location.hash.indexOf('#/read/') !== 0) window.scrollTo(0, lastScroll);
  }

  /* ---------------- 详情页 ---------------- */
  function openDetail(id) {
    var a = ALL.filter(function (x) { return x._id === id; })[0];
    if (!a) { location.hash = '#/'; return; }
    lastScroll = window.scrollY;
    $('#homeView').hidden = true;
    $('#detailView').hidden = false;
    var h = $('#detailBody');
    var note = (a.noteOrigin && a.note) ? a.note : '';
    h.innerHTML =
      '<header class="rd-head">' +
      '  <div class="rd-title">' + esc(a.title) + '</div>' +
      '  <div class="tags rd-tags">' + tagHtml(a) + '</div>' +
      '  <div class="rd-author">' + (a.author === '佚名' ? '佚名' : esc(a.author)) + '</div>' +
      '  <div class="rd-meta">' +
      '    <span>' + esc(a.lib) + ' · 篇 ' + String(a.no).padStart(3, '0') + '</span><span class="sep">｜</span>' +
      '    <span>' + esc(a.genre) + (a.genreNote ? ' · ' + esc(a.genreNote) : '') + '</span>' +
      '    <span class="sep">｜</span><span>难度 ' + esc(a.diff) + '</span>' +
      (chLabelShort(a) ? '<span class="sep">｜</span><span>' + esc(chLabelShort(a)) + '</span>' : '') +
      '  </div>' +
      '  <div class="rd-meta">' +
      (note ? '<span>选文：' + esc(note) + '</span><br>' : '') +
      '    <span>试卷来源：' + esc(a.source) + '</span>' +
      '  </div>' +
      '</header>' +
      '<div class="rd-body">' + bodyHtml(a.body) + '</div>' +
      (a.tailNote ? '<p class="tailnote">（' + esc(a.tailNote) + '）</p>' : '');
    if (location.hash !== '#/read/' + id) { history.replaceState(null, '', '#/read/' + id); }
    window.scrollTo(0, 0);
    fillDisclaimers();
  }
  function chLabelShort(a) {
    var c = chipLabel(a);
    if (c) return c;
    return '';
  }

  /* ---------------- 字号 ---------------- */
  var fs = 17;
  function applyFs() {
    var b = document.querySelector('.rd-body');
    if (b) b.style.fontSize = fs + 'px';
  }
  function bumpFs(d) {
    fs = Math.min(24, Math.max(14, fs + d));
    applyFs();
  }

  /* ---------------- 打印 ---------------- */
  function sheetHtml(a) {
    var note = (a.noteOrigin && a.note) ? a.note : '';
    return '' +
      '<section class="p-sheet">' +
      '  <div class="p-kicker">' + esc(a.lib) + ' · 阅读篇 ' + String(a.no).padStart(3, '0') +
      ' ｜ ' + (a.tags || []).join(' · ') +
      ' ｜ ' + esc(a.genre) + (a.genreNote ? ' · ' + esc(a.genreNote) : '') +
      ' ｜ 难度 ' + esc(a.diff) + '</div>' +
      '  <h1>' + esc(a.title) + '</h1>' +
      '  <p class="p-author">' + esc(a.author) + '</p>' +
      '  <p class="p-src">' + esc(a.source) + (note ? ' ｜ ' + esc(note) : '') + '</p>' +
      '  ' + bodyHtml(a.body) +
      (a.tailNote ? '<p class="p-tailnote">（' + esc(a.tailNote) + '）</p>' : '') +
      '  <div class="p-disclaimer">' + esc(DIS) + '</div>' +
      '</section>';
  }
  function doPrint(ids) {
    var root = $('#printRoot');
    root.innerHTML = ids.map(function (id) {
      var a = ALL.filter(function (x) { return x._id === id; })[0];
      return a ? sheetHtml(a) : '';
    }).join('');
    setTimeout(function () { window.print(); }, 60);
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    $('#search').addEventListener('input', function () {
      state.q = this.value.trim();
      renderHome();
    });
    $('#ckAll').addEventListener('change', function () {
      var on = this.checked;
      filtered().forEach(function (a) {
        if (on) selected[a._id] = true; else delete selected[a._id];
      });
      renderList();
      updateSelBar();
    });
    $('#btnClearSel').addEventListener('click', function () {
      selected = {};
      renderList();
      updateSelBar();
    });
    $('#btnPrintSel').addEventListener('click', function () {
      var ids = filtered().map(function (a) { return a._id; })
        .filter(function (id) { return selected[id]; });
      doPrint(ids);
    });
    $('#btnPrintOne').addEventListener('click', function () {
      var id = (location.hash.match(/#\/read\/(.+)/) || [])[1];
      if (id) {
        try { id = decodeURIComponent(id); } catch (e) { /* keep */ }
        doPrint([id]);
      }
    });
    function back() {
      selected = selected; /* 保留选择 */
      location.hash = '#/';
      renderHome();
    }
    $('#btnBack').addEventListener('click', back);
    $('#btnBack2').addEventListener('click', back);
    $('#fsPlus').addEventListener('click', function () { bumpFs(1); });
    $('#fsMinus').addEventListener('click', function () { bumpFs(-1); });
    $('#fsReset').addEventListener('click', function () { fs = 17; applyFs(); });
  }

  /* ---------------- 路由 ---------------- */
  function route() {
    var m = location.hash.match(/#\/read\/(.+)/);
    if (m) {
      openDetail(decodeURIComponent(m[1]));
    } else {
      renderHome();
    }
  }
  window.addEventListener('hashchange', route);

  bind();
  route();
})();
