/* 中学文学性阅读文库：目录筛选 + 全文阅读 + 收藏/随机 + 勾选打印 */
(function () {
  'use strict';
  var M = window.YDW.meta;
  var DIS = M.disclaimer;
  var ALL = window.YDW.articles.map(function (a) {
    a._id = (a.lib === '七年级' ? '七' : a.lib.charAt(0)) + '-' + String(a.no).padStart(3, '0');
    return a;
  });
  var TAG_ORDER = ['写景', '抒情', '写人', '叙事', '怀旧', '思乡',
                   '亲情', '成长', '家国', '科幻', '人与自然', '市井', '乡土', '教育', '读书'];

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function inline(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  function bodyHtml(text) {
    var out = [];
    String(text).split(/\n{2,}/).forEach(function (seg) {
      var s = seg.trim();
      if (!s) return;
      out.push('<p>' + s.split('\n').map(function (l) {
        return inline(l.trim() ? l : ' ');
      }).join('<br>') + '</p>');
    });
    return out.join('\n');
  }
  function chipLabel(a) {
    if (a.title.indexOf('节选') >= 0 || (a.tailNote && a.tailNote.indexOf('节选') >= 0)) return '节选';
    if (a.adapted) return '有删改';
    return '';
  }
  function diffCls(a) { return a.diff === '简单' ? 'easy' : (a.diff === '困难' ? 'hard' : 'mid'); }
  function tagHtml(a) {
    return (a.tags || []).map(function (t) {
      return '<span class="tag theme">' + esc(t) + '</span>';
    }).join('');
  }
  function lenTxt(a) { return '约 ' + a.wc + ' 字 · 约 ' + a.mins + ' 分钟'; }

  /* ---------------- 本地存储 ---------------- */
  function load(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }
  var favs = load('ywd_fav_v1', []);            // id 数组
  var reports = load('ywd_reports_v1', []);     // [{id,title,note,ts}]
  var reads = load('ywd_read_v1', []);          // 已读 id 数组

  function isFav(id) { return favs.indexOf(id) >= 0; }
  function isRead(id) { return reads.indexOf(id) >= 0; }
  function markRead(id) {
    if (isRead(id)) return;
    reads.push(id);
    save('ywd_read_v1', reads);
    updateUtilBar();
  }
  function toggleFav(id) {
    var i = favs.indexOf(id);
    if (i >= 0) favs.splice(i, 1); else favs.push(id);
    save('ywd_fav_v1', favs);
    var a = byId(id);
    refreshStarState(id, a ? isFav(id) : false);
    updateUtilBar();
    if (state.fav) renderList();
    if (state.fav) updateSelBar();
  }
  function byId(id) {
    for (var i = 0; i < ALL.length; i++) if (ALL[i]._id === id) return ALL[i];
    return null;
  }

  /* ---------------- 状态 ---------------- */
  var state = { genre: '全部', tag: '全部', diff: '全部', q: '', author: '', fav: false, unread: false };
  var selected = {};
  var curId = null;
  var lastScroll = 0;
  var readTimer = null;

  function filtered() {
    return ALL.filter(function (a) {
      if (state.unread && isRead(a._id)) return false;
      if (state.fav && !isFav(a._id)) return false;
      if (state.genre !== '全部' && a.genre !== state.genre) return false;
      if (state.tag !== '全部' && (a.tags || []).indexOf(state.tag) < 0) return false;
      if (state.diff !== '全部' && a.diff !== state.diff) return false;
      if (state.author && a.author !== state.author) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        var hay = (a.title + ' ' + a.author + ' ' + (a.note || '') + ' ' +
                   a.body.slice(0, 3000)).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  /* ---------------- 免责 / 版本 ---------------- */
  function fillDisclaimers() {
    $$('.disclaimer').forEach(function (el) {
      if (!el.textContent.trim()) el.textContent = DIS;
    });
  }
  function initVersionTip() {
    var k = 'ywd_ver_v1';
    var old = null;
    try { old = localStorage.getItem(k); } catch (e) { return; }
    if (old && old !== M.version) {
      $('#verTip').hidden = false;
    }
    try { localStorage.setItem(k, M.version); } catch (e) { /* ignore */ }
  }

  /* ---------------- chips & 作者 ---------------- */
  function chip(opts) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'chip' + (opts.on ? ' on' : '');
    el.dataset.k = opts.k;
    el.dataset.v = opts.v;
    el.innerHTML = esc(opts.label) + (opts.n ? '<span class="n">' + opts.n + '</span>' : '');
    el.addEventListener('click', function () {
      state[opts.k] = opts.v;
      renderHome();
    });
    return el;
  }
  function cnt(genreSel, diffSel) {
    return ALL.filter(function (a) {
      if (genreSel !== '全部' && a.genre !== genreSel) return false;
      if (diffSel !== '全部' && a.diff !== diffSel) return false;
      return true;
    }).length;
  }
  function renderChips() {
    var gEl = $('#genreChips'), dEl = $('#diffChips'), tEl = $('#tagChips');
    gEl.innerHTML = ''; dEl.innerHTML = ''; tEl.innerHTML = '';
    [['全部'], ['散文'], ['小说'], ['微型小说'], ['记叙文']].forEach(function (g) {
      gEl.appendChild(chip({ k: 'genre', v: g[0], label: g[0] === '全部' ? '全部文体' : g[0],
        on: state.genre === g[0], n: g[0] === '全部' ? '' : cnt(g[0], '全部') }));
    });
    [['全部'], ['简单'], ['中级'], ['困难']].forEach(function (g) {
      dEl.appendChild(chip({ k: 'diff', v: g[0], label: g[0] === '全部' ? '全部难度' : g[0],
        on: state.diff === g[0], n: g[0] === '全部' ? '' : cnt('全部', g[0]) }));
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
  function renderAuthorSel() {
    var names = [];
    ALL.forEach(function (a) {
      if (a.author && a.author !== '佚名' && names.indexOf(a.author) < 0) names.push(a.author);
    });
    names.sort(function (x, y) { return x.localeCompare(y, 'zh'); });
    var sel = $('#authorSel');
    sel.innerHTML = '<option value="">全部作者</option>' +
      names.map(function (n) {
        return '<option value="' + esc(n) + '"' + (state.author === n ? ' selected' : '') + '>' +
          esc(n) + '</option>';
      }).join('');
  }

  /* ---------------- 列表 ---------------- */
  function liHtml(a) {
    var note = (a.noteOrigin && a.note) ? a.note : '';
    var ch = chipLabel(a);
    var read = isRead(a._id);
    return '' +
      '<input type="checkbox" class="ck" ' + (selected[a._id] ? 'checked' : '') + '>' +
      '<div class="main' + (read ? ' read' : '') + '" data-id="' + a._id + '">' +
      '  <div class="t">' + (read ? '<span class="rdone">✓ 已读</span>' : '<span class="dot" title="未读"></span>') + esc(a.title) + '</div>' +
      '  <div class="tags">' + tagHtml(a) +
      '    <span class="tag genre">' + esc(a.genre) + '</span>' +
      (a.genreNote ? '<span class="tag none">' + esc(a.genreNote) + '</span>' : '') +
      (ch ? '<span class="tag adapted">' + ch + '</span>' : '') +
      '    <span class="tag ' + diffCls(a) + '">' + esc(a.diff) + '</span>' +
      '  </div>' +
      '  <div class="sub">' + lenTxt(a) + ' ｜ ' +
      (a.author !== '佚名' ? '作者：' + esc(a.author) : '佚名') +
      (note ? ' ｜ ' + esc(note) : '') + '</div>' +
      '</div>' +
      '<button class="star" data-id="' + a._id + '" title="收藏">' + (isFav(a._id) ? '★' : '☆') + '</button>';
  }
  function renderList() {
    var list = filtered();
    $('#countLine').textContent = '共 ' + list.length + ' 篇' + (state.fav ? '（我的收藏）' : '');
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
      var star = li.querySelector('.star');
      star.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleFav(a._id);
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
    var list = filtered();
    $('#ckAll').checked = list.length > 0 && list.every(function (a) { return selected[a._id]; });
  }
  function unreadCount() {
    var n = 0;
    ALL.forEach(function (a) { if (!isRead(a._id)) n++; });
    return n;
  }
  function updateUtilBar() {
    var u = unreadCount();
    var done = ALL.length - u;
    var f = $('#btnFav');
    f.textContent = (state.fav ? '★' : '☆') + ' 我的收藏';
    f.classList.toggle('on', state.fav);
    var ub = $('#btnUnread');
    ub.textContent = '◎ 未读 ' + u;
    ub.classList.toggle('on', state.unread);
    $('#readHint').textContent = done === ALL.length ?
      '🎉 已读完 ' + ALL.length + ' 篇，太棒了！' : '已读 ' + done + ' / ' + ALL.length + ' 篇';
    if (reports.length) {
      var b = $('#btnReports');
      b.hidden = false;
      b.textContent = '📮 反馈 ' + reports.length;
    }
  }
  function renderHome() {
    $('#homeView').hidden = false;
    $('#detailView').hidden = true;
    curId = null;
    renderChips();
    renderAuthorSel();
    renderList();
    updateSelBar();
    updateUtilBar();
    fillDisclaimers();
    if (location.hash.indexOf('#/read/') !== 0) window.scrollTo(0, lastScroll);
  }

  /* ---------------- 详情 ---------------- */
  function openDetail(id) {
    var a = byId(id);
    if (!a) { location.hash = '#/'; return; }
    curId = id;
    lastScroll = window.scrollY;
    $('#homeView').hidden = true;
    $('#detailView').hidden = false;
    var note = (a.noteOrigin && a.note) ? a.note : '';
    $('#detailBody').innerHTML =
      '<header class="rd-head">' +
      '  <div class="rd-title">' + esc(a.title) + '</div>' +
      '  <div class="tags rd-tags">' + tagHtml(a) + '</div>' +
      '  <div class="rd-author">' + (a.author === '佚名' ? '佚名' : esc(a.author)) + '</div>' +
      '  <div class="rd-meta">' +
      '    <span>' + esc(a.genre) + (a.genreNote ? ' · ' + esc(a.genreNote) : '') + '</span>' +
      '    <span class="sep">｜</span><span>难度 ' + esc(a.diff) + '</span>' +
      (chLabelShort(a) ? '<span class="sep">｜</span><span>' + esc(chLabelShort(a)) + '</span>' : '') +
      '    <span class="sep">｜</span><span>' + esc(lenTxt(a)) + '</span>' +
      '  </div>' +
      '  <div class="rd-meta">' +
      (note ? '<span>选文：' + esc(note) + '</span><br>' : '') +
      '    <span>试卷来源：' + esc(a.source) + '</span>' +
      '  </div>' +
      '</header>' +
      '<div class="rd-body">' + bodyHtml(a.body) + '</div>' +
      (a.tailNote ? '<p class="tailnote">（' + esc(a.tailNote) + '）</p>' : '');
    refreshStarState(id, isFav(id));
    updateNav(a);
    /* 停留读一会儿才记已读，防止误点翻篇 */
    clearTimeout(readTimer);
    var id0 = id;
    readTimer = setTimeout(function () {
      if (curId === id0 && !$('#detailView').hidden && !isRead(id0)) markRead(id0);
    }, 10000);
    if (location.hash !== '#/read/' + id) history.replaceState(null, '', '#/read/' + id);
    window.scrollTo(0, 0);
    fillDisclaimers();
  }
  function chLabelShort(a) {
    return chipLabel(a);
  }
  function refreshStarState(id, on) {
    var one = $('#btnFavOne');
    one.textContent = on ? '★' : '☆';
    one.classList.toggle('on', on);
  }
  function updateNav(a) {
    var list = filtered();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i]._id === a._id) idx = i;
    var prev = idx > 0 ? list[idx - 1] : null;
    var next = (idx >= 0 && idx < list.length - 1) ? list[idx + 1] : null;
    var bp = $('#btnPrev'), bn = $('#btnNext');
    bp.hidden = !prev;
    bn.hidden = !next;
    bp.title = prev ? ('上一篇：' + prev.title) : '';
    bn.title = next ? ('下一篇：' + next.title) : '';
    bp.onclick = null; bn.onclick = null;
    if (prev) bp.onclick = function () { openDetail(prev._id); };
    if (next) bn.onclick = function () { openDetail(next._id); };
  }

  /* ---------------- 字号 ---------------- */
  var fs = 17;
  function applyFs() {
    var b = document.querySelector('#detailBody .rd-body');
    if (b) b.style.fontSize = fs + 'px';
  }
  function bumpFs(d) {
    fs = Math.min(24, Math.max(14, fs + d));
    applyFs();
  }

  /* ---------------- 弹窗 ---------------- */
  function showModal(html) {
    $('#modalBox').innerHTML = html;
    $('#ovl').hidden = false;
  }
  function closeModal() {
    $('#ovl').hidden = true;
    $('#modalBox').innerHTML = '';
  }

  /* ---------------- 随机一篇 ---------------- */
  function openRandom() {
    var list = filtered();
    if (!list.length) return;
    var a = list[Math.floor(Math.random() * list.length)];
    openDetail(a._id);
  }

  /* ---------------- 打印 ---------------- */
  var POPT = load('ywd_print_v1', { fs: 'md', src: true, page: 'each' });
  var pendingPrint = [];

  /* 移动端限制：打印仅电脑可用 */
  function isTouchDevice() {
    var ua = navigator.userAgent;
    var mobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    var ipadLike = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    return mobile || ipadLike;
  }
  function guardPrint() {
    if (!isTouchDevice()) return true;
    showModal(
      '<h3>🖨 请在电脑上打印</h3>' +
      '<div class="m-empty" style="text-align:left;line-height:1.8">' +
      '打印功能仅在电脑上可用。<br>请用电脑浏览器打开本页，选好篇目后再打印，也可以“另存为 PDF”保存文章。</div>' +
      '<div class="m-actions"><button class="btn" onclick="window.__ywdClose && window.__ywdClose()">知道了</button></div>');
    return false;
  }
  function sheetHtml(a) {
    var note = (a.noteOrigin && a.note) ? a.note : '';
    return '' +
      '<section class="p-sheet">' +
      '  <div class="p-kicker">' + (a.tags || []).join(' · ') +
      ' ｜ ' + esc(a.genre) + (a.genreNote ? ' · ' + esc(a.genreNote) : '') +
      ' ｜ 难度 ' + esc(a.diff) + ' ｜ ' + esc(lenTxt(a)) + '</div>' +
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
    root.className = 'pfs-' + POPT.fs + (POPT.src ? '' : ' nosrc') +
                     (POPT.page === 'cont' ? ' p-cont' : '');
    root.innerHTML = ids.map(function (id) {
      var a = byId(id);
      return a ? sheetHtml(a) : '';
    }).join('');
    setTimeout(function () { window.print(); }, 60);
  }
  function askPrint(ids) {
    if (!ids.length) return;
    pendingPrint = ids;
    showModal(
      '<h3>🖨 打印设置</h3>' +
      '<div class="m-field"><b>正文字号</b>' +
      '  <label><input type="radio" name="pfs" value="sm"' + (POPT.fs === 'sm' ? ' checked' : '') + '> 小号（省纸）</label>' +
      '  <label><input type="radio" name="pfs" value="md"' + (POPT.fs === 'md' ? ' checked' : '') + '> 中号</label>' +
      '  <label><input type="radio" name="pfs" value="lg"' + (POPT.fs === 'lg' ? ' checked' : '') + '> 大号（易读）</label>' +
      '</div>' +
      '<div class="m-field"><b>排版</b>' +
      '  <label><input type="radio" name="ppage" value="each"' + (POPT.page === 'each' ? ' checked' : '') + '> 每篇另起一页</label>' +
      '  <label><input type="radio" name="ppage" value="cont"' + (POPT.page === 'cont' ? ' checked' : '') + '> 连续排版（省纸）</label>' +
      '</div>' +
      '<div class="m-field"><label><input type="checkbox" id="psrc"' + (POPT.src ? ' checked' : '') + '> 打印作者与出处</label></div>' +
      '<div class="m-actions">' +
      '  <button class="btn ghost" onclick="window.__ywdClose && window.__ywdClose()">取消</button>' +
      '  <button class="btn" id="mPrintGo">打印 ' + ids.length + ' 篇</button>' +
      '</div>');
    $('#mPrintGo').addEventListener('click', function () {
      var fs = document.querySelector('input[name=pfs]:checked').value;
      var page = document.querySelector('input[name=ppage]:checked').value;
      POPT = { fs: fs, src: $('#psrc').checked, page: page };
      save('ywd_print_v1', POPT);
      closeModal();
      doPrint(pendingPrint);
    });
  }

  /* ---------------- 错误反馈 ---------------- */
  function openReport() {
    var a = curId ? byId(curId) : null;
    if (!a) return;
    showModal(
      '<h3>发现问题？告诉老师</h3>' +
      '<div class="rep-item" style="border:none;padding:0 0 6px"><div class="t">' + esc(a.title) + '</div>' +
      '<div class="n">错字、标点、排版等问题都可以写在这里，反馈会保存在你的设备上。</div></div>' +
      '<textarea id="repNote" class="m-ta" placeholder="例如：第 3 段第 2 行有个错别字……"></textarea>' +
      '<div class="m-actions">' +
      '  <button class="btn ghost" onclick="window.__ywdClose && window.__ywdClose()">取消</button>' +
      '  <button class="btn" id="repGo">保存反馈</button>' +
      '</div>');
    $('#repGo').addEventListener('click', function () {
      var note = $('#repNote').value.trim();
      if (!note) { closeModal(); return; }
      reports.push({ id: a._id, title: a.title, note: note, ts: Date.now() });
      save('ywd_reports_v1', reports);
      closeModal();
      alert('已保存，谢谢反馈！可以到主页点"📮 我的反馈"查看或复制给老师。');
      updateUtilBar();
    });
  }
  function showReports() {
    if (!reports.length) {
      showModal('<h3>📮 我的反馈</h3><div class="m-empty">还没有保存过反馈。</div>' +
        '<div class="m-actions"><button class="btn ghost" onclick="window.__ywdClose && window.__ywdClose()">关闭</button></div>');
      return;
    }
    var html = '<h3>📮 我的反馈（' + reports.length + ' 条）</h3>';
    html += reports.map(function (r, i) {
      var d = new Date(r.ts);
      var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0') + ' ' +
               String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      return '<div class="rep-item"><div class="t">' + (i + 1) + '. ' + esc(r.title) + '</div>' +
        '<div class="n">' + ds + '</div><div>' + esc(r.note) + '</div></div>';
    }).join('');
    html += '<div class="m-actions">' +
      '<button class="btn ghost" id="repClear">清空</button>' +
      '<button class="btn ghost" onclick="window.__ywdClose && window.__ywdClose()">关闭</button>' +
      '<button class="btn" id="repCopy">复制全部</button></div>';
    showModal(html);
    $('#repCopy').addEventListener('click', function () {
      var txt = reports.map(function (r, i) {
        return (i + 1) + '. 《' + r.title + '》 ' + r.note;
      }).join('\n');
      copyText('【阅读文库反馈】\n' + txt);
    });
    $('#repClear').addEventListener('click', function () {
      if (!window.confirm('确定清空全部反馈吗？')) return;
      reports = [];
      save('ywd_reports_v1', reports);
      closeModal();
      updateUtilBar();
    });
  }
  function copyText(txt) {
    function done() { alert('已复制，可粘贴发给老师。'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); });
    } else fallbackCopy(txt);
  }
  function fallbackCopy(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) alert('已复制，可粘贴发给老师。');
    else window.prompt('请手动复制：', txt);
  }

  /* ---------------- 关注引导 ---------------- */
  var FOLLOW = '光点小塾';
  function legacyCopyPlain(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }
  function followTip() {
    showModal(
      '<h3>关注“' + FOLLOW + '”公众号</h3>' +
      '<div class="follow-name">' + FOLLOW + '</div>' +
      '<div class="m-empty" style="text-align:left;line-height:1.9">' +
      '公众号名称已复制。请家长打开微信：<br>' +
      '1. 点右上角的放大镜 🔍；<br>' +
      '2. 在搜索框粘贴“' + FOLLOW + '”并搜索；<br>' +
      '3. 进入公众号主页，点“关注”。<br>' +
      '<span style="color:#8a7b7a;font-size:13px">关注后可以收到更多阅读与写作内容推荐。</span></div>' +
      '<div class="m-actions"><button class="btn" onclick="window.__ywdClose && window.__ywdClose()">知道了</button></div>');
  }
  function doFollow() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(FOLLOW).then(followTip, function () {
        legacyCopyPlain(FOLLOW);
        followTip();
      });
    } else {
      legacyCopyPlain(FOLLOW);
      followTip();
    }
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    $('#search').addEventListener('input', function () {
      state.q = this.value.trim();
      renderHome();
    });
    $('#authorSel').addEventListener('change', function () {
      state.author = this.value;
      renderHome();
    });
    $('#btnFav').addEventListener('click', function () {
      state.fav = !state.fav;
      renderHome();
    });
    $('#btnFollowHome').addEventListener('click', doFollow);
    $('#btnFollow').addEventListener('click', doFollow);
    $('#btnUnread').addEventListener('click', function () {
      state.unread = !state.unread;
      renderHome();
    });
    $('#btnResetRead').addEventListener('click', function () {
      if (!window.confirm('确定把全部文章重新标记为未读吗？已读进度会被清空。')) return;
      reads = [];
      save('ywd_read_v1', reads);
      renderHome();
      updateUtilBar();
    });
    $('#btnRandom').addEventListener('click', openRandom);
    $('#btnReports').addEventListener('click', showReports);
    $('#verOk').addEventListener('click', function () {
      $('#verTip').hidden = true;
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
      if (!guardPrint()) return;
      var ids = filtered().map(function (a) { return a._id; })
        .filter(function (id) { return selected[id]; });
      askPrint(ids);
    });
    $('#btnPrintOne').addEventListener('click', function () {
      if (!guardPrint()) return;
      if (curId) askPrint([curId]);
    });
    $('#btnFavOne').addEventListener('click', function () {
      if (curId) toggleFav(curId);
    });
    $('#btnReportOpen').addEventListener('click', openReport);
    function back() {
      location.hash = '#/';
      renderHome();
    }
    $('#btnBack').addEventListener('click', back);
    $('#btnBack2').addEventListener('click', back);
    $('#fsPlus').addEventListener('click', function () { bumpFs(1); });
    $('#fsMinus').addEventListener('click', function () { bumpFs(-1); });
    $('#fsReset').addEventListener('click', function () { fs = 17; applyFs(); });
    $('#ovl').addEventListener('click', function (e) {
      if (e.target.id === 'ovl') closeModal();
    });
    window.__ywdClose = closeModal;
  }

  /* ---------------- 路由 ---------------- */
  function route() {
    var m = location.hash.match(/#\/read\/(.+)/);
    if (m) openDetail(decodeURIComponent(m[1]));
    else renderHome();
  }
  window.addEventListener('hashchange', route);

  bind();
  initVersionTip();
  route();
})();
