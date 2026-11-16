/*!
 * 로또 6/45 분석소 — 화면 렌더링
 * 데이터: data/draws.json (동행복권 공식 회차 정보)
 */
(function () {
  'use strict';

  var C = window.LottoCore;
  var state = {
    data: null,
    draws: [],
    byRound: {},
    latestRound: null,
    round: null,
    range: 100,
    fixed: [],
    excluded: [],
    pick: [],
    games: [],
    tab: 'latest'
  };

  /* ---------- 유틸 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function ball(n, size) {
    return '<span class="' + C.ballClass(n) + (size ? ' ball--' + size : '') + '">' + n + '</span>';
  }
  function ballsRow(nums, size) {
    return nums.map(function (n) { return ball(n, size); }).join('');
  }
  function pct(a, b) { return b ? (a / b) * 100 : 0; }

  /* ---------- 데이터 로드 ---------- */
  function loadFallback() {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'data/draws.js';
      s.onload = function () {
        if (window.LOTTO_DATA) resolve(window.LOTTO_DATA);
        else reject(new Error('데이터를 읽을 수 없습니다.'));
      };
      s.onerror = function () { reject(new Error('데이터를 불러오지 못했습니다. 로컬 서버로 열어 주세요.')); };
      document.head.appendChild(s);
    });
  }

  function loadData() {
    if (window.fetch && location.protocol !== 'file:') {
      return fetch('data/draws.json', { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .catch(function () { return loadFallback(); });
    }
    return loadFallback();
  }

  /* ---------- 탭 ---------- */
  function setTab(name, push) {
    if (!document.getElementById('panel-' + name)) return;
    state.tab = name;
    $all('.panel').forEach(function (p) { p.hidden = p.id !== 'panel-' + name; });
    $all('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.classList.toggle('is-active', on);
      if (t.getAttribute('role') === 'tab') t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $all('.site-nav a[data-tab]').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-tab') === name);
    });
    if (push && history.replaceState) history.replaceState(null, '', '#' + name);
    if (push) {
      var head = document.querySelector('.site-header');
      var bar = document.querySelector('.tabbar');
      if (bar) {
        var y = bar.getBoundingClientRect().top + window.scrollY - (head ? head.offsetHeight : 0);
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    }
    if (name === 'stats') renderStats();
  }

  function initTabs() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (!t) return;
      if (t.tagName === 'A' && !t.closest('.tabbar') && !t.closest('.site-nav')) {
        // 카드형 링크는 기본 동작(해시 이동)을 막고 탭 전환
        e.preventDefault();
      }
      setTab(t.getAttribute('data-tab'), true);
    });
    var hash = (location.hash || '').replace('#', '');
    if (['latest', 'stats', 'generator', 'calculator'].indexOf(hash) >= 0) setTab(hash, false);
  }

  /* ---------- 최신 회차 ---------- */
  function renderHero() {
    var d = state.byRound[state.latestRound];
    if (!d) return;
    var net1 = C.calcTax(d.a[0]).net;
    $('#heroRound').textContent = d.r;
    $('#heroDate').textContent = d.d.replace(/-/g, '.');
    $('#heroRound2').textContent = d.r;
    $('#heroDate2').textContent = d.d.replace(/-/g, '.');
    $('#heroWinners').textContent = C.formatNumber(d.w[0]);
    var hb = $('#heroBalls');
    if (hb) {
      hb.innerHTML = ballsRow(d.n) + '<span class="hero-bonus-divider">+</span>' + ball(d.b, 'sm');
    }
    $('#heroPrize1').textContent = C.formatKoreanAmount(d.a[0]);
    $('#heroPrize1Net').textContent = C.formatKoreanAmount(net1);
    $('#heroPrize2').textContent = C.formatKoreanAmount(d.a[1]);
    $('#heroPrize3').textContent = C.formatKoreanAmount(d.a[2]);
  }

  function rankNote(i) {
    return ['6개 일치', '5개 + 보너스', '5개 일치', '4개 일치', '3개 일치'][i];
  }

  function renderDraw(round, fromLookup) {
    var d = state.byRound[round];
    if (!d) {
      if (fromLookup) alert('해당 회차 정보가 없습니다. 1회부터 ' + state.latestRound + '회까지 조회할 수 있습니다.');
      return;
    }
    state.round = round;
    var input = $('#roundInput');
    if (input) input.value = d.r;

    $('#drawRoundLabel').textContent = '제 ' + d.r + '회';
    var dt = d.d.split('-');
    $('#drawDateLabel').textContent = dt[0] + '년 ' + Number(dt[1]) + '월 ' + Number(dt[2]) + '일 추첨';
    $('#drawBalls').innerHTML = ballsRow(d.n) + '<span class="plus">+</span>' + ball(d.b, 'sm');

    $('#statSales').textContent = C.formatKoreanAmount(d.s);
    $('#statWinners').textContent = d.w[0] > 0 ? C.formatNumber(d.w[0]) + '명' : '당첨자 없음';
    $('#statPrize1').textContent = C.formatKoreanAmount(d.a[0]);
    var net1 = C.calcTax(d.a[0]);
    $('#statNet1').innerHTML = C.formatKoreanAmount(net1.net) +
      '<small>' + (d.a[0] > 300000000 ? '3억 초과 33% 구간 적용' : (d.a[0] > 2000000 ? '22% 구간 적용' : '비과세')) + '</small>';

    var tb = $('#rankTableBody');
    tb.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      var prize = d.a[i] || 0;
      var winners = d.w[i] || 0;
      var tr = el('tr');
      if (i === 0) tr.className = 'is-top';
      var badgeCls = i < 3 ? 'rank-badge r' + (i + 1) : 'rank-badge';
      tr.innerHTML =
        '<td><span class="' + badgeCls + '">' + (i + 1) + '등</span></td>' +
        '<td class="num">' + (winners > 0 ? C.formatNumber(winners) + '명' : '0명') + '</td>' +
        '<td class="num">' + (prize > 0 ? C.formatWon(prize) : '-') + '</td>' +
        '<td class="num">' + (prize > 0 ? C.formatWon(C.calcTax(prize).net) : '-') + '</td>' +
        '<td>' + rankNote(i) + '</td>';
      tb.appendChild(tr);
    }

    $('#btnPrevRound').disabled = d.r <= 1;
    $('#btnNextRound').disabled = d.r >= state.latestRound;
  }

  function renderRecent() {
    var tb = $('#recentTableBody');
    if (!tb) return;
    var rows = state.draws.slice(-10).reverse();
    tb.innerHTML = '';
    rows.forEach(function (d) {
      var tr = el('tr');
      var nums = d.n.join(', ') + ' + ' + d.b;
      tr.innerHTML =
        '<td class="num">' + d.r + '회</td>' +
        '<td class="num">' + d.d + '</td>' +
        '<td style="text-align:left; white-space:nowrap;">' + nums + '</td>' +
        '<td class="num">' + (d.w[0] > 0 ? C.formatNumber(d.w[0]) + '명' : '-') + '</td>' +
        '<td class="num">' + (d.a[0] > 0 ? C.formatKoreanAmount(d.a[0]) : '-') + '</td>';
      tb.appendChild(tr);
    });
    var base = $('#recentBase');
    if (base && rows.length) base.textContent = rows[0].d.replace(/-/g, '.');
  }

  function initLookup() {
    $('#lookupForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = parseInt($('#roundInput').value, 10);
      if (!v) return;
      renderDraw(Math.max(1, Math.min(state.latestRound, v)), true);
    });
    $('#btnPrevRound').addEventListener('click', function () {
      if (state.round > 1) renderDraw(state.round - 1, false);
    });
    $('#btnNextRound').addEventListener('click', function () {
      if (state.round < state.latestRound) renderDraw(state.round + 1, false);
    });
    $('#btnLatestRound').addEventListener('click', function () { renderDraw(state.latestRound, false); });
  }

  /* ---------- 통계 ---------- */
  function rowsHtml(label, count, total, warm) {
    var p = pct(count, total);
    return '<div class="ratio-row"><span class="label">' + label + '</span>' +
      '<span class="bar"><i class="' + (warm ? 'warm' : '') + '" style="width:' + p.toFixed(1) + '%"></i></span>' +
      '<span class="val"><b>' + C.formatNumber(count) + '</b> · ' + p.toFixed(1) + '%</span></div>';
  }

  function renderStats() {
    if (!state.draws.length) return;
    var range = state.range;
    var a = C.analyze(state.draws, range === 'all' ? 'all' : range);
    var label = range === 'all' ? '전체 ' + a.size + '회' : '최근 ' + a.size + '회';
    $('#statsRangeLabel').textContent = label + ' (제 ' + a.fromRound + '~' + a.toRound + '회)';

    $all('#rangeSeg button').forEach(function (b) {
      b.classList.toggle('is-active', String(b.getAttribute('data-range')) === String(range));
    });

    $('#statsSummary').innerHTML =
      '<span class="chip">분석 회차 <b>' + a.size + '회</b></span>' +
      '<span class="chip">총 번호 <b>' + C.formatNumber(a.size * 6) + '개</b></span>' +
      '<span class="chip">번호당 평균 출현 <b>' + a.avgCount.toFixed(1) + '회</b></span>' +
      '<span class="chip">최다 출현 <b>' + a.hot[0].n + '번 ' + a.hot[0].count + '회</b></span>' +
      '<span class="chip">' + label + ' 판매액 <b>' + C.formatKoreanAmount(a.totalSales) + '</b></span>';

    /* 히트맵 */
    var max = a.maxCount || 1, min = a.minCount;
    var hm = $('#heatmap');
    hm.innerHTML = '';
    a.numbers.forEach(function (o) {
      var t = max === min ? 0.5 : (o.count - min) / (max - min);
      var alpha = 0.07 + t * 0.86;
      var dark = t > 0.55;
      var cell = el('div', 'hm');
      cell.style.background = 'rgba(47,91,255,' + alpha.toFixed(3) + ')';
      cell.style.color = dark ? '#fff' : '#1b2b57';
      cell.innerHTML = '<b>' + o.n + '</b><span>' + o.count + '회</span>';
      cell.title = o.n + '번 · ' + o.count + '회 출현';
      hm.appendChild(cell);
    });

    /* 빈도 막대 */
    var fl = $('#freqList');
    fl.innerHTML = '';
    a.numbers.forEach(function (o) {
      var tone = C.ballTone(o.n);
      var w = max ? (o.count / max) * 100 : 0;
      var row = el('div', 'freq-row');
      row.innerHTML = '<span class="n b' + tone + '">' + o.n + '</span>' +
        '<span class="bar"><i style="width:' + w.toFixed(1) + '%"></i></span>' +
        '<span class="c"><b>' + o.count + '</b>회</span>';
      fl.appendChild(row);
    });

    /* 핫/콜드 */
    function ballChips(list) {
      return list.map(function (o) {
        return '<span style="display:inline-flex;flex-direction:column;align-items:center;gap:3px;">' +
          ball(o.n) + '<span style="font-size:11px;color:var(--muted);font-weight:600;">' + o.count + '회</span></span>';
      }).join('');
    }
    $('#hotNumbers').innerHTML = ballChips(a.hot);
    $('#coldNumbers').innerHTML = ballChips(a.cold);

    /* 미출현 TOP10 */
    var gt = $('#gapTableBody');
    gt.innerHTML = '';
    a.gapTop.forEach(function (o, i) {
      var tr = el('tr');
      tr.innerHTML = '<td class="num">' + (i + 1) + '</td>' +
        '<td>' + ball(o.n, 'xs') + '</td>' +
        '<td class="num">' + (o.gap >= a.size ? '구간 내 없음' : o.gap + '회') + '</td>' +
        '<td class="num">' + (o.lastRound ? '제 ' + o.lastRound + '회' : '-') + '</td>';
      gt.appendChild(tr);
    });

    /* 홀짝 */
    var oe = '';
    for (var odd = 6; odd >= 0; odd--) oe += rowsHtml(odd + ' : ' + (6 - odd), a.oddCount[odd], a.size);
    $('#oddEvenDist').innerHTML = oe;

    /* 고저 */
    var lh = '';
    for (var low = 6; low >= 0; low--) lh += rowsHtml(low + ' : ' + (6 - low), a.lowCount[low], a.size);
    $('#lowHighDist').innerHTML = lh;

    /* 번호대 */
    var bandLabels = ['1~10', '11~20', '21~30', '31~40', '41~45'];
    var bandMax = Math.max.apply(null, a.bandTotal) || 1;
    var bandHtml = '';
    for (var i = 0; i < 5; i++) {
      var p = (a.bandTotal[i] / bandMax) * 100;
      bandHtml += '<div class="ratio-row"><span class="label">' + bandLabels[i] + '</span>' +
        '<span class="bar"><i style="width:' + p.toFixed(1) + '%"></i></span>' +
        '<span class="val"><b>' + a.bandTotal[i] + '</b>회</span></div>';
    }
    $('#bandDist').innerHTML = bandHtml;
    $('#bandDist').insertAdjacentHTML('beforeend',
      '<p style="margin:8px 0 0;font-size:11.5px;color:var(--muted);">회차당 평균 ' +
      (a.bandTotal[0] / a.size).toFixed(2) + ' / ' + (a.bandTotal[1] / a.size).toFixed(2) + ' / ' +
      (a.bandTotal[2] / a.size).toFixed(2) + ' / ' + (a.bandTotal[3] / a.size).toFixed(2) + ' / ' +
      (a.bandTotal[4] / a.size).toFixed(2) + '개</p>');

    /* 합계 분포 */
    $('#sumAvg').textContent = a.sum.avg.toFixed(1);
    $('#sumMin').textContent = a.sum.min;
    $('#sumMax').textContent = a.sum.max;
    var histMax = Math.max.apply(null, a.sum.hist.map(function (h) { return h.count; })) || 1;
    $('#sumHist').innerHTML = a.sum.hist.filter(function (h) { return h.count > 0; }).map(function (h) {
      return '<div class="ratio-row"><span class="label">' + h.from + '~' + h.to + '</span>' +
        '<span class="bar"><i class="warm" style="width:' + ((h.count / histMax) * 100).toFixed(1) + '%"></i></span>' +
        '<span class="val"><b>' + h.count + '</b>회</span></div>';
    }).join('');

    /* 연속번호 */
    var cons = '';
    for (var k = 0; k <= 5; k++) {
      if (!a.consecDist[k]) continue;
      cons += rowsHtml(k + '쌍' + (k === 0 ? ' (없음)' : ''), a.consecDist[k], a.size);
    }
    $('#consecDist').innerHTML = cons +
      '<p style="margin:2px 0 0;font-size:11.5px;color:var(--muted);">연속번호 포함 회차 ' +
      C.formatNumber(a.consecDraws) + '회 · ' + pct(a.consecDraws, a.size).toFixed(1) + '%</p>';

    /* 동반 출현 */
    $('#pairList').innerHTML = a.topPairs.map(function (p) {
      return '<span class="chip">' + p.a + ' · ' + p.b + ' <b>' + p.count + '회</b></span>';
    }).join('');
  }

  function initStats() {
    $all('#rangeSeg button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.range = b.getAttribute('data-range') === 'all' ? 'all' : Number(b.getAttribute('data-range'));
        renderStats();
      });
    });
  }

  /* ---------- 생성기 ---------- */
  function buildNumberGrids() {
    ['fixedGrid', 'excludeGrid', 'pickGrid'].forEach(function (id) {
      var g = document.getElementById(id);
      if (!g) return;
      g.innerHTML = '';
      for (var n = 1; n <= 45; n++) {
        var b = el('button', 'num-btn', String(n));
        b.type = 'button';
        b.setAttribute('data-num', n);
        b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', n + '번');
        g.appendChild(b);
      }
    });
  }

  function paintFixed() {
    $all('#fixedGrid .num-btn').forEach(function (b) {
      var n = Number(b.getAttribute('data-num'));
      var on = state.fixed.indexOf(n) >= 0;
      b.classList.toggle('is-fixed', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#fixedCount').textContent = state.fixed.length;
  }
  function paintExcluded() {
    $all('#excludeGrid .num-btn').forEach(function (b) {
      var n = Number(b.getAttribute('data-num'));
      var on = state.excluded.indexOf(n) >= 0;
      b.classList.toggle('is-excluded', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#excludeCount').textContent = state.excluded.length;
  }

  function initGenerator() {
    buildNumberGrids();

    $('#fixedGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.num-btn');
      if (!b) return;
      var n = Number(b.getAttribute('data-num'));
      var i = state.fixed.indexOf(n);
      if (i >= 0) {
        state.fixed.splice(i, 1);
      } else {
        if (state.fixed.length >= 5) {
          alert('고정수는 최대 5개까지 선택할 수 있습니다.');
          return;
        }
        var j = state.excluded.indexOf(n);
        if (j >= 0) state.excluded.splice(j, 1);
        state.fixed.push(n);
        state.fixed.sort(function (x, y) { return x - y; });
      }
      paintFixed();
      paintExcluded();
    });

    $('#excludeGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.num-btn');
      if (!b) return;
      var n = Number(b.getAttribute('data-num'));
      var i = state.excluded.indexOf(n);
      if (i >= 0) {
        state.excluded.splice(i, 1);
      } else {
        var j = state.fixed.indexOf(n);
        if (j >= 0) state.fixed.splice(j, 1);
        state.excluded.push(n);
        state.excluded.sort(function (x, y) { return x - y; });
      }
      paintExcluded();
      paintFixed();
    });

    $('#btnGenerate').addEventListener('click', function () {
      var res = C.generateGames({
        fixed: state.fixed,
        excluded: state.excluded,
        oddEven: $('#oddEvenSelect').value,
        noConsecutive: $('#noConsecutive').checked,
        count: 5
      });
      var list = $('#gameList');
      if (res.error) {
        list.innerHTML = '<div class="empty"><strong>번호를 만들 수 없습니다.</strong>' + res.error + '</div>';
        return;
      }
      state.games = res.games;
      list.innerHTML = '';
      res.games.forEach(function (g, i) {
        var row = el('div', 'game');
        row.innerHTML = '<span class="game-no">' + (i + 1) + '게임</span>' +
          '<div class="balls-row">' + ballsRow(g, 'sm') + '</div>' +
          '<button type="button" class="btn btn--sm" data-sim="' + g.join(',') + '">역대 조회</button>';
        list.appendChild(row);
      });
      if (res.partial) {
        list.insertAdjacentHTML('beforeend', '<div class="notice notice--warn"><span>⚠</span><p style="margin:0;">조건이 까다로워 ' + res.games.length + '게임만 생성했습니다. 제외수를 줄이거나 홀짝 비율을 ‘무관’으로 바꿔 보세요.</p></div>');
      }
    });

    $('#btnResetGen').addEventListener('click', function () {
      state.fixed = [];
      state.excluded = [];
      paintFixed();
      paintExcluded();
      $('#oddEvenSelect').value = '3:3';
      $('#noConsecutive').checked = true;
      $('#gameList').innerHTML = '<div class="empty"><strong>아직 생성한 번호가 없습니다.</strong>왼쪽 조건을 정하고 ‘5게임 생성’을 눌러 주세요.</div>';
      state.games = [];
    });

    $('#gameList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sim]');
      if (!b) return;
      var nums = b.getAttribute('data-sim').split(',').map(Number);
      renderSim(nums);
      var box = $('#simResult');
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    /* 직접 선택 */
    $('#pickGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.num-btn');
      if (!b) return;
      var n = Number(b.getAttribute('data-num'));
      var i = state.pick.indexOf(n);
      if (i >= 0) {
        state.pick.splice(i, 1);
      } else {
        if (state.pick.length >= 6) return;
        state.pick.push(n);
        state.pick.sort(function (x, y) { return x - y; });
      }
      paintPick();
    });

    $('#btnClearPick').addEventListener('click', function () {
      state.pick = [];
      paintPick();
      $('#simResult').innerHTML = '';
    });

    $('#btnSimPick').addEventListener('click', function () {
      if (state.pick.length !== 6) return;
      renderSim(state.pick.slice());
    });
  }

  function paintPick() {
    $all('#pickGrid .num-btn').forEach(function (b) {
      var n = Number(b.getAttribute('data-num'));
      var on = state.pick.indexOf(n) >= 0;
      b.classList.toggle('is-selected', on);
      b.classList.add('t' + C.ballTone(n));
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#pickCount').textContent = state.pick.length;
    $('#btnSimPick').disabled = state.pick.length !== 6;
  }

  function renderSim(nums) {
    var res = C.simulate(nums, state.draws);
    var box = $('#simResult');
    var counts = res.counts;
    var html = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<span style="font-size:13px;font-weight:800;color:var(--muted);">조회 조합</span>' +
      '<div class="balls-row">' + ballsRow(nums, 'sm') + '</div></div>';

    html += '<div class="sim-summary">';
    for (var r = 1; r <= 5; r++) {
      html += '<div class="sim-cell' + (counts[r] > 0 ? ' has' : '') + '"><b>' + counts[r] + '</b><span>' + r + '등</span></div>';
    }
    html += '</div>';

    if (res.total === 0) {
      html += '<div class="empty"><strong>1~5등 해당 없음</strong>' +
        '제 ' + state.draws[0].r + '~' + state.latestRound + '회 전체에서 이 조합은 3개 이상 일치한 적이 없습니다.</div>';
    } else {
      html += '<p style="margin:0 0 10px;font-size:13px;color:var(--ink-2);">역대 <b>' + state.draws.length + '회</b> 중 ' +
        '<b>' + res.total + '회</b>에서 3개 이상 일치했습니다. 등수 합계(참고용 당첨금 단순 합산): ' +
        '<b>' + C.formatKoreanAmount(res.cash) + '</b></p>';
      html += '<div class="hit-list">';
      res.hits.forEach(function (h) {
        html += '<div class="hit"><span class="r">제 ' + h.r + '회</span>' +
          '<span class="d">' + h.date + '</span>' +
          '<span class="rank">' + h.rank + '등</span>' +
          '<span>' + h.match + '개 일치' + (h.bonus ? ' + 보너스' : '') + '</span>' +
          '<span class="prize">' + (h.prize ? C.formatKoreanAmount(h.prize) : '-') + '</span></div>';
      });
      html += '</div>';
      html += '<p style="margin:10px 0 0;font-size:11.5px;color:var(--muted);">‘당첨금 단순 합산’은 과거 회차의 1인당 당첨금을 그대로 더한 값이며, 실제로 같은 조합을 매 회차 구매했다면 받았을 금액과는 다릅니다(구매 금액·동시 당첨자 수 변동).</p>';
    }
    box.innerHTML = html;
  }

  /* ---------- 세금 계산기 ---------- */
  function formatInputDigits(str) {
    var digits = String(str).replace(/[^0-9]/g, '').slice(0, 15);
    if (!digits) return '';
    return Number(digits).toLocaleString('en-US');
  }

  function renderCalc() {
    var raw = $('#amountInput').value.replace(/[^0-9]/g, '');
    var amount = raw ? Number(raw) : 0;
    var res = C.calcTax(amount, { deductCost: $('#costToggle').checked });

    $('#calcNet').textContent = C.formatKoreanAmount(res.net);
    $('#calcGross').textContent = C.formatWon(res.gross);
    $('#calcTotalTax').textContent = C.formatWon(res.totalTax);
    $('#calcRate').textContent = res.effectiveRate.toFixed(1) + '%';
    $('#calcIncomeTax').textContent = C.formatWon(res.incomeTax);
    $('#calcLocalTax').textContent = C.formatWon(res.localTax);
    $('#calcTotalTax2').textContent = C.formatWon(res.totalTax);
    $('#calcBracket').textContent =
      res.bracket === 'over300m' ? '3억원 초과 (22% + 초과분 33%)' :
      res.bracket === 'under300m' ? '200만원 초과 ~ 3억원 (22%)' : '비과세 (200만원 이하)';

    var body = $('#calcBracketBody');
    body.innerHTML = '';
    var totalIncome = 0, totalLocal = 0, totalBase = 0;
    res.rows.forEach(function (row) {
      totalIncome += row.income;
      totalLocal += row.local;
      totalBase += row.base;
      var tr = el('tr');
      tr.innerHTML = '<td>' + row.name + '</td>' +
        '<td class="num">' + C.formatWon(row.base) + '</td>' +
        '<td class="num">' + (row.rate * 100).toFixed(1) + '%</td>' +
        '<td class="num">' + C.formatWon(row.income + row.local) + '</td>';
      body.appendChild(tr);
    });
    var tr2 = el('tr', 'is-top');
    tr2.innerHTML = '<td>합계</td><td class="num">' + C.formatWon(totalBase) + '</td>' +
      '<td class="num">-</td><td class="num">' + C.formatWon(totalIncome + totalLocal) + '</td>';
    body.appendChild(tr2);
    if (res.cost > 0) {
      tr2.insertAdjacentHTML('afterend',
        '<tr><td colspan="4" style="text-align:left;font-size:11.5px;color:var(--muted);">게임 구입금액 ' +
        C.formatWon(res.cost) + '을 필요경비로 차감한 과세표준 ' + C.formatWon(res.base) + ' 기준입니다.</td></tr>');
    }
  }

  function initCalculator() {
    var input = $('#amountInput');
    input.addEventListener('input', function () {
      var caretEnd = this.selectionStart === this.value.length;
      this.value = formatInputDigits(this.value);
      if (caretEnd) this.setSelectionRange(this.value.length, this.value.length);
      renderCalc();
    });
    $('#quickRow').addEventListener('click', function (e) {
      var b = e.target.closest('[data-amount]');
      if (!b) return;
      input.value = formatInputDigits(b.getAttribute('data-amount'));
      renderCalc();
    });
    $('#costToggle').addEventListener('change', renderCalc);
  }

  /* ---------- 시작 ---------- */
  function boot() {
    initTabs();
    loadData().then(function (payload) {
      if (!payload || !payload.draws || !payload.draws.length) throw new Error('데이터가 비어 있습니다.');
      state.data = payload;
      state.draws = payload.draws.slice().sort(function (a, b) { return a.r - b.r; });
      state.draws.forEach(function (d) { state.byRound[d.r] = d; });
      state.latestRound = state.draws[state.draws.length - 1].r;
      state.round = state.latestRound;

      renderHero();
      renderDraw(state.latestRound, false);
      renderRecent();
      initLookup();
      initStats();
      initGenerator();
      initCalculator();
      renderCalc();
      paintFixed();
      paintExcluded();
      paintPick();
      if (state.tab === 'stats') renderStats();
    }).catch(function (err) {
      var msg = '<div class="empty"><strong>데이터를 불러오지 못했습니다.</strong>' +
        (err && err.message ? err.message : '잠시 후 다시 시도해 주세요.') +
        '<br><span style="font-size:12px;">사이트를 GitHub Pages·Cloudflare Pages 등 웹 서버에 올리면 정상적으로 표시됩니다.</span></div>';
      var card = $('#drawCard');
      if (card) card.innerHTML = msg;
      var hero = $('.hero-card');
      if (hero) hero.insertAdjacentHTML('beforeend', '<div class="notice notice--warn" style="margin-top:12px;"><span>⚠</span><p style="margin:0;">회차 데이터를 불러오지 못했습니다. 페이지를 새로고침 해 주세요.</p></div>');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
