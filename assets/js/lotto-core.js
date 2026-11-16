/*!
 * 로또 6/45 분석소 — 핵심 계산 로직 (DOM 비의존, 단위 테스트 가능)
 * 데이터: 동행복권 공식 회차 정보
 */
(function (global) {
  'use strict';

  var RANK_LABEL = { 1: '1등', 2: '2등', 3: '3등', 4: '4등', 5: '5등' };

  /* ---------- 공 색상 (동행복권 공식 기준) ---------- */
  function ballClass(n) {
    n = Number(n);
    if (n <= 10) return 'ball b1';
    if (n <= 20) return 'ball b2';
    if (n <= 30) return 'ball b3';
    if (n <= 40) return 'ball b4';
    return 'ball b5';
  }
  function ballTone(n) {
    n = Number(n);
    if (n <= 10) return 1;
    if (n <= 20) return 2;
    if (n <= 30) return 3;
    if (n <= 40) return 4;
    return 5;
  }

  /* ---------- 숫자 서식 ---------- */
  function formatNumber(v) {
    var n = Math.round(Number(v) || 0);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function formatWon(v) {
    return formatNumber(v) + '원';
  }
  /** 3103164459 → "31억 316만 4,459원" (조 단위까지 표기) */
  function formatKoreanAmount(v) {
    var n = Math.max(0, Math.round(Number(v) || 0));
    if (n === 0) return '0원';
    var jo = Math.floor(n / 1000000000000);
    var eok = Math.floor((n % 1000000000000) / 100000000);
    var man = Math.floor((n % 100000000) / 10000);
    var won = n % 10000;
    var out = '';
    if (jo) out += formatNumber(jo) + '조 ';
    if (eok) out += formatNumber(eok) + '억 ';
    if (man) out += formatNumber(man) + '만 ';
    if (won) out += formatNumber(won) + '원';
    else if (out) out = out.trim() + '원';
    return out.trim();
  }
  function formatPercent(v, digits) {
    return (Number(v) || 0).toFixed(digits == null ? 1 : digits) + '%';
  }

  /* ---------- 세금: 기타소득(복권 당첨금) ---------- */
  /**
   * 2026년 현행 소득세법 기준 복권 당첨금 원천징수 계산.
   *  - 200만원 이하: 비과세
   *  - 200만원 초과 ~ 3억원 이하: 전체 금액의 22% (소득세 20% + 지방소득세 2%)
   *  - 3억원 초과: 3억원까지 22%, 3억원 초과분 33% (소득세 30% + 지방소득세 3%)
   * opts.deductCost === true 이면 게임 구입금액 1,000원을 필요경비로 차감.
   */
  function calcTax(amount, opts) {
    var gross = Math.max(0, Math.floor(Number(amount) || 0));
    var deductCost = !!(opts && opts.deductCost);
    var cost = deductCost ? Math.min(1000, gross) : 0;
    var base = gross - cost;
    var FREE = 2000000;
    var CAP = 300000000;

    var rows = [];
    var income = 0;
    var local = 0;

    if (base <= 0) {
      rows.push({ name: '과세 대상 없음', base: 0, rate: 0, income: 0, local: 0 });
    } else if (base <= FREE) {
      rows.push({ name: '200만원 이하 (비과세)', base: base, rate: 0, income: 0, local: 0 });
    } else {
      var lowPart = Math.min(base, CAP);
      var i1 = Math.floor(lowPart * 20 / 100);
      var l1 = Math.floor(lowPart * 2 / 100);
      rows.push({
        name: '200만원 초과 ~ 3억원 구간 (22%)',
        base: lowPart, rate: 0.22, income: i1, local: l1
      });
      income += i1;
      local += l1;

      if (base > CAP) {
        var highPart = base - CAP;
        var i2 = Math.floor(highPart * 30 / 100);
        var l2 = Math.floor(highPart * 3 / 100);
        rows.push({
          name: '3억원 초과분 (33%)',
          base: highPart, rate: 0.33, income: i2, local: l2
        });
        income += i2;
        local += l2;
      }
    }

    var total = income + local;
    var net = gross - total;
    return {
      gross: gross,
      cost: cost,
      base: base,
      taxable: base > FREE,
      bracket: base > CAP ? 'over300m' : (base > FREE ? 'under300m' : 'free'),
      rows: rows,
      incomeTax: income,
      localTax: local,
      totalTax: total,
      net: net,
      effectiveRate: gross > 0 ? (total / gross) * 100 : 0
    };
  }

  /* ---------- 통계 분석 ---------- */
  function sumList(a) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return s;
  }

  /**
   * @param {Array} draws  전체 회차 (오름차순)
   * @param {number|'all'} rangeSize  최근 N회 (전체면 0 또는 'all')
   */
  function analyze(draws, rangeSize) {
    var all = draws || [];
    var size = (!rangeSize || rangeSize === 'all' || Number(rangeSize) >= all.length) ? all.length : Number(rangeSize);
    var arr = all.slice(all.length - size);

    var freq = new Array(46).fill(0);
    var bonusFreq = new Array(46).fill(0);
    var gap = new Array(46).fill(arr.length);          // 연속 미출현 회차
    var lastSeenRound = new Array(46).fill(null);
    var oddCount = new Array(7).fill(0);               // 홀수 개수 0~6
    var lowCount = new Array(7).fill(0);               // 1~22 개수 0~6
    var bandTotal = [0, 0, 0, 0, 0];
    var bandDraws = [0, 0, 0, 0, 0];                   // 구간별 1개 이상 포함 회차
    var sumValues = [];
    var consecDist = new Array(6).fill(0);             // 연속쌍 개수 0~5
    var consecDraws = 0;
    var pairCount = {};                                // 동반 출현 빈도
    var endDigit = new Array(10).fill(0);

    for (var i = 0; i < arr.length; i++) {
      var d = arr[i];
      var nums = d.n;
      var odd = 0, low = 0;
      var inBand = [false, false, false, false, false];
      for (var j = 0; j < nums.length; j++) {
        var n = nums[j];
        freq[n]++;
        if (n % 2 === 1) odd++;
        if (n <= 22) low++;
        var bi = n <= 10 ? 0 : n <= 20 ? 1 : n <= 30 ? 2 : n <= 40 ? 3 : 4;
        bandTotal[bi]++;
        inBand[bi] = true;
        endDigit[n % 10]++;
        for (var k = j + 1; k < nums.length; k++) {
          var key = n + '-' + nums[k];
          pairCount[key] = (pairCount[key] || 0) + 1;
        }
      }
      var b = Number(d.b);
      if (b >= 1 && b <= 45) bonusFreq[b]++;
      oddCount[odd]++;
      lowCount[low]++;
      sumValues.push(sumList(nums));
      for (var q = 0; q < 5; q++) if (inBand[q]) bandDraws[q]++;

      var c = 0;
      for (var m = 0; m < nums.length - 1; m++) if (nums[m + 1] - nums[m] === 1) c++;
      consecDist[c]++;
      if (c > 0) consecDraws++;
    }

    /* 연속 미출현: 최근 회차부터 거슬러 올라가며 마지막 출현 위치를 기록 */
    var seenGap = new Array(46).fill(false);
    for (var gi = arr.length - 1; gi >= 0; gi--) {
      var gd = arr[gi];
      var back = arr.length - 1 - gi;
      for (var gj = 0; gj < gd.n.length; gj++) {
        var gn = gd.n[gj];
        if (!seenGap[gn]) { seenGap[gn] = true; gap[gn] = back; lastSeenRound[gn] = gd.r; }
      }
      var gb = Number(gd.b);
      if (!seenGap[gb]) { seenGap[gb] = true; gap[gb] = back; lastSeenRound[gb] = gd.r; }
    }

    var numbered = [];
    for (var x = 1; x <= 45; x++) numbered.push({ n: x, count: freq[x], bonus: bonusFreq[x], gap: gap[x], lastRound: lastSeenRound[x] });
    var byHot = numbered.slice().sort(function (a, b2) { return b2.count - a.count || a.n - b2.n; });
    var byCold = numbered.slice().sort(function (a, b2) { return a.count - b2.count || a.n - b2.n; });
    var byGap = numbered.slice().sort(function (a, b2) { return b2.gap - a.gap || a.n - b2.n; });

    var maxCount = 0, minCount = Infinity;
    numbered.forEach(function (o) { if (o.count > maxCount) maxCount = o.count; if (o.count < minCount) minCount = o.count; });

    var topPairs = Object.keys(pairCount).map(function (k) {
      var p = k.split('-');
      return { a: Number(p[0]), b: Number(p[1]), count: pairCount[k] };
    }).sort(function (a, b2) { return b2.count - a.count || a.a - b2.a; }).slice(0, 8);

    var sumHist = [];
    var binStart = 20;
    for (var s0 = binStart; s0 <= 260; s0 += 20) {
      sumHist.push({ from: s0, to: s0 + 19, count: 0 });
    }
    sumValues.forEach(function (v) {
      var idx = Math.min(sumHist.length - 1, Math.max(0, Math.floor((v - binStart) / 20)));
      sumHist[idx].count++;
    });

    var avgFreq = arr.length ? (arr.length * 6) / 45 : 0;

    return {
      size: arr.length,
      fromRound: arr.length ? arr[0].r : null,
      toRound: arr.length ? arr[arr.length - 1].r : null,
      freq: freq,
      bonusFreq: bonusFreq,
      gap: gap,
      numbers: numbered,
      hot: byHot.slice(0, 6),
      cold: byCold.slice(0, 6),
      gapTop: byGap.slice(0, 10),
      maxCount: maxCount,
      minCount: minCount === Infinity ? 0 : minCount,
      avgCount: avgFreq,
      oddCount: oddCount,
      lowCount: lowCount,
      bandTotal: bandTotal,
      bandDraws: bandDraws,
      sum: {
        avg: sumValues.length ? sumList(sumValues) / sumValues.length : 0,
        min: sumValues.length ? Math.min.apply(null, sumValues) : 0,
        max: sumValues.length ? Math.max.apply(null, sumValues) : 0,
        hist: sumHist
      },
      consecDist: consecDist,
      consecDraws: consecDraws,
      topPairs: topPairs,
      endDigit: endDigit,
      totalSales: arr.reduce(function (acc, d2) { return acc + (d2.s || 0); }, 0),
      avgSales: arr.length ? arr.reduce(function (acc, d2) { return acc + (d2.s || 0); }, 0) / arr.length : 0
    };
  }

  /* ---------- 당첨 등수 판정 / 시뮬레이션 ---------- */
  function rankOf(matchCount, bonusMatch) {
    if (matchCount === 6) return 1;
    if (matchCount === 5 && bonusMatch) return 2;
    if (matchCount === 5) return 3;
    if (matchCount === 4) return 4;
    if (matchCount === 3) return 5;
    return 0;
  }

  function matchDraw(nums, draw) {
    var set = {};
    for (var i = 0; i < nums.length; i++) set[nums[i]] = true;
    var match = 0;
    for (var j = 0; j < draw.n.length; j++) if (set[draw.n[j]]) match++;
    var bonusMatch = !!set[draw.b];
    return { match: match, bonus: bonusMatch, rank: rankOf(match, bonusMatch) };
  }

  /** 한 게임을 역대 전체 회차와 대조 */
  function simulate(nums, draws) {
    var hits = [];
    var counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    var cash = 0; // 역대 당첨금 기준 단순 합산(참고용)
    for (var i = 0; i < draws.length; i++) {
      var d = draws[i];
      var m = matchDraw(nums, d);
      if (m.rank >= 1) {
        hits.push({
          r: d.r, date: d.d, rank: m.rank, match: m.match, bonus: m.bonus,
          winners: d.w ? d.w[m.rank - 1] : 0,
          prize: d.a ? d.a[m.rank - 1] : 0
        });
        counts[m.rank]++;
        if (d.a && d.a[m.rank - 1]) cash += d.a[m.rank - 1];
      }
    }
    hits.sort(function (a, b) { return b.r - a.r; });
    return { hits: hits, counts: counts, total: hits.length, cash: cash };
  }

  /* ---------- 번호 생성 ---------- */
  function defaultRng() { return Math.random(); }

  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function parseRatio(spec) {
    if (!spec || spec === 'any') return null;
    var p = String(spec).split(':');
    if (p.length !== 2) return null;
    var a = Number(p[0]), b = Number(p[1]);
    if (isNaN(a) || isNaN(b) || a + b !== 6) return null;
    return { odd: a, even: b };
  }

  function hasConsecutive(nums) {
    for (var i = 0; i < nums.length - 1; i++) if (nums[i + 1] - nums[i] === 1) return true;
    return false;
  }

  /**
   * opts: { fixed:[], excluded:[], oddEven:'any'|'3:3', noConsecutive:bool, count:5 }
   * rng: 테스트용 난수 함수
   * @returns {{games:Array<Array<number>>, error:string|null}}
   */
  function generateGames(opts, rng) {
    rng = rng || defaultRng;
    opts = opts || {};
    var count = Math.max(1, Math.min(10, Number(opts.count) || 5));
    var fixed = (opts.fixed || []).map(Number).filter(function (n) { return n >= 1 && n <= 45; });
    var excluded = {};
    (opts.excluded || []).forEach(function (n) { excluded[Number(n)] = true; });

    var fixedSet = {};
    fixed.forEach(function (n) { fixedSet[n] = true; });
    var conflict = fixed.filter(function (n) { return excluded[n]; });
    if (conflict.length) return { games: [], error: '고정수와 제외수가 겹칩니다: ' + conflict.join(', ') };
    if (fixed.length > 5) return { games: [], error: '고정수는 최대 5개까지 선택할 수 있습니다.' };

    var pool = [];
    for (var n = 1; n <= 45; n++) if (!excluded[n] && !fixedSet[n]) pool.push(n);
    var need = 6 - fixed.length;
    if (pool.length < need) return { games: [], error: '제외수가 너무 많습니다. 번호를 6개 이상 남겨 주세요.' };

    var ratio = parseRatio(opts.oddEven);
    var games = [];
    var seen = {};
    var attempts = 0;
    var maxAttempts = 4000;

    while (games.length < count && attempts < maxAttempts) {
      attempts++;
      var pick = shuffle(pool, rng).slice(0, need);
      var cand = fixed.concat(pick).sort(function (a, b) { return a - b; });
      var key = cand.join(',');
      if (seen[key]) continue;

      if (ratio) {
        var odd = 0;
        cand.forEach(function (v) { if (v % 2 === 1) odd++; });
        if (odd !== ratio.odd) continue;
      }
      if (opts.noConsecutive && hasConsecutive(cand)) continue;

      seen[key] = true;
      games.push(cand);
    }

    if (!games.length) {
      return { games: [], error: '조건을 만족하는 조합을 찾지 못했습니다. 홀짝 비율이나 제외수를 조정해 주세요.' };
    }
    return { games: games, error: null, partial: games.length < count };
  }

  var api = {
    RANK_LABEL: RANK_LABEL,
    ballClass: ballClass,
    ballTone: ballTone,
    formatNumber: formatNumber,
    formatWon: formatWon,
    formatKoreanAmount: formatKoreanAmount,
    formatPercent: formatPercent,
    calcTax: calcTax,
    analyze: analyze,
    rankOf: rankOf,
    matchDraw: matchDraw,
    simulate: simulate,
    generateGames: generateGames,
    hasConsecutive: hasConsecutive
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.LottoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
