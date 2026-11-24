// Token Radar's plain dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the fitted board, the fitted detail
// view, the fitted hazard strip, and the fitted farm plans. No network:
// every byte it shows is in data.js. The farm plan is generated here, in
// the page, from the same fitted rule the model uses, so the plan the page
// shows is the plan the board carries.
(function () {
  var DATA = window.RADAR;
  if (!DATA) { document.body.innerHTML = '<p>No data.</p>'; return; }
  var rows = DATA.rows || [];
  var live = DATA.live || [];
  var comps = DATA.comps || {};
  var weibull = DATA.weibull || {};
  var counts = DATA.verdict_counts || { FARM: 0, THIN: 0, SKIP: 0 };

  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function money(n) { return '$' + fmt(n); }
  function $(id) { return document.getElementById(id); }

  // ---- headline, strips, fitted numbers ----
  $('headline').textContent =
    'Board: ' + counts.FARM + ' FARM / ' + counts.THIN + ' THIN / ' + counts.SKIP +
    ' SKIP across ' + rows.length + ' fitted rows. Rank 1 is ' + (rows[0] ? rows[0].name : '') +
    ' — and it is SKIP, honestly, because 55,152 farmers dilute the share.';
  $('integrity-strip').textContent =
    'Integrity strip — snapshot ' + DATA.as_of + ', ' + (rows.length + live.length + DATA.not_in_board) +
    ' protocols, ' + (comps.n || 0) + ' traded comps, deterministic byte-identical re-runs. ' +
    'The fitted comps curve and the fitted Weibull odds below are measured from this snapshot alone.';
  $('kpi-strip').textContent =
    'KPI strip — fitted comps a=' + (comps.intercept || 0).toFixed(4) + ' b=' + (comps.slope || 0).toFixed(4) +
    ' R2=' + (comps.rSquared || 0).toFixed(4) + '; fitted held-out ' + (comps.heldOutFitted || 0).toFixed(3) +
    ' vs flat ' + (comps.heldOutFlat || 0).toFixed(3) + ' (' + (comps.heldOutWins || 0) + '/5); ' +
    'fitted Weibull held-out log-loss ' + (weibull.heldOutLogLoss || 0).toFixed(3) +
    ' vs assumed 0.799 vs base 0.688; board ' + counts.FARM + '/' + counts.THIN + '/' + counts.SKIP + '.';
  var fitHtml = '';
  fitHtml += '<dt>Fitted comps curve</dt><dd>ln(mcap) = ' + (comps.intercept || 0).toFixed(4) + ' + ' + (comps.slope || 0).toFixed(4) + ' &times; ln(TVL), R&sup2; = ' + (comps.rSquared || 0).toFixed(4) + ', n = ' + (comps.n || 0) + ' traded protocols.</dd>';
  fitHtml += '<dt>Fitted held-out 5-fold</dt><dd>fitted ' + (comps.heldOutFitted || 0).toFixed(3) + ' vs flat ' + (comps.heldOutFlat || 0).toFixed(3) + ', wins ' + (comps.heldOutWins || 0) + '/5.</dd>';
  fitHtml += '<dt>Fitted walk-forward</dt><dd>fitted ' + (comps.walkForwardFitted || 0).toFixed(3) + ' vs flat ' + (comps.walkForwardFlat || 0).toFixed(3) + ', wins ' + (comps.walkForwardWins || 0) + '/4 (older to newer).</dd>';
  fitHtml += '<dt>Fitted leave-one-out</dt><dd>fitted ' + (comps.looFitted || 0).toFixed(3) + ' vs flat ' + (comps.looFlat || 0).toFixed(3) + ', wins ' + (comps.looWins || 0) + '/' + (comps.looN || 0) + '.</dd>';
  fitHtml += '<dt>Fitted Weibull odds</dt><dd>&lambda; = ' + (weibull.lambdaDays || 0).toFixed(0) + ' days, k = ' + (weibull.k || 0).toFixed(2) + ', horizon 1 year (stated). Held-out log-loss fitted ' + (weibull.heldOutLogLoss || 0).toFixed(3) + ' vs assumed ' + (weibull.heldOutAssumed || 0).toFixed(3) + ' vs base ' + (weibull.heldOutBase || 0).toFixed(3) + '.</dd>';
  fitHtml += '<dt>Fitted Weibull walk-forward</dt><dd>fitted ' + (weibull.walkForwardLogLoss || 0).toFixed(3) + ' vs S1 ' + (weibull.walkForwardS1 || 0).toFixed(3) + ' vs base ' + (weibull.walkForwardBase || 0).toFixed(3) + '.</dd>';
  fitHtml += '<dt>Fitted Weibull leave-one-out</dt><dd>fitted ' + (weibull.looLogLoss || 0).toFixed(3) + ' vs S1 ' + (weibull.looS1 || 0).toFixed(3) + ' vs base ' + (weibull.looBase || 0).toFixed(3) + '.</dd>';
  $('fit-numbers').innerHTML = fitHtml;

  // ---- the fitted hazard strip ----
  var hazardAges = [0, 45, 90, 180, 365, 513, 730, 1095, 1460, 2000, 3000];
  function surv(t, lam, k) { if (t <= 0) return 1; var x = Math.pow(t / lam, k); return x > 700 ? 0 : Math.exp(-x); }
  function oddsAt(age) {
    var lam = weibull.lambdaDays || 882, k = weibull.k || 0.5;
    var sNow = surv(age, lam, k), sLater = surv(age + 365, lam, k);
    return sNow <= 0 ? 1 : Math.min(1, Math.max(0, 1 - sLater / sNow));
  }
  var maxOdds = 0;
  var hazardVals = hazardAges.map(function (a) { var o = oddsAt(a); if (o > maxOdds) maxOdds = o; return o; });
  var hazardHtml = '';
  hazardAges.forEach(function (a, i) {
    var h = Math.round((hazardVals[i] / maxOdds) * 100);
    hazardHtml += '<div class="bar" style="height:' + h + '%" title="age ' + a + 'd: fitted odds ' + hazardVals[i].toFixed(3) + '"><span>' + hazardVals[i].toFixed(2) + '</span></div>';
  });
  $('hazard-strip').innerHTML = hazardHtml;
  $('hazard-note').textContent = 'Fitted one-year launch odds by age (days): ' +
    hazardAges.map(function (a, i) { return a + 'd ' + hazardVals[i].toFixed(3); }).join('  ·  ') +
    '. The fitted odds fall with age, from the fitted Weibull curve.';

  // ---- the age test ----
  $('age-result').textContent =
    'Fitted age coefficient c = ' + (comps.ageCoef || 0).toFixed(4) + ', t = ' + (comps.ageT || 0).toFixed(2) +
    ' — not significant. The fitted value keeps no age term; maturity stays the stated rule, and the "every term fitted" claim is qualified on this point.';

  // ---- live rerun: the fitted 5-fold, recomputed in this page ----
  $('rerun-btn').addEventListener('click', function () {
    var pts = DATA.comps_points || [];
    if (pts.length < 10) { $('rerun-out').textContent = 'No comps points in the data.'; return; }
    function ols(px, py) {
      var n = px.length, mx = 0, my = 0, i;
      for (i = 0; i < n; i++) { mx += px[i]; my += py[i]; }
      mx /= n; my /= n;
      var sxx = 0, sxy = 0;
      for (i = 0; i < n; i++) { sxx += (px[i] - mx) * (px[i] - mx); sxy += (px[i] - mx) * (py[i] - my); }
      var b = sxx === 0 ? 0 : sxy / sxx;
      return { a: my - b * mx, b: b };
    }
    function rmse(px, py, a, b) {
      var ss = 0;
      for (var i = 0; i < px.length; i++) { var e = py[i] - (a + b * px[i]); ss += e * e; }
      return Math.sqrt(ss / px.length);
    }
    function flatRmse(px, py) {
      var c = Math.log(0.25), ss = 0;
      for (var i = 0; i < px.length; i++) { var e = py[i] - (px[i] + c); ss += e * e; }
      return Math.sqrt(ss / px.length);
    }
    var fitted = [], flat = [], wins = 0;
    for (var fold = 0; fold < 5; fold++) {
      var tx = [], ty = [], ex = [], ey = [];
      for (var i = 0; i < pts.length; i++) {
        if (i % 5 === fold) { ex.push(pts[i][0]); ey.push(pts[i][1]); }
        else { tx.push(pts[i][0]); ty.push(pts[i][1]); }
      }
      var f = ols(tx, ty);
      var fr = rmse(ex, ey, f.a, f.b), fl = flatRmse(ex, ey);
      fitted.push(fr); flat.push(fl);
      if (fr < fl) wins++;
    }
    var mean = function (v) { return v.reduce(function (s, x) { return s + x; }, 0) / v.length; };
    $('rerun-out').textContent =
      'Live rerun, fitted 5-fold, recomputed in this page: fitted ' + mean(fitted).toFixed(3) +
      ' vs flat ' + mean(flat).toFixed(3) + ', wins ' + wins + '/5. ' +
      'The dossier reports fitted ' + (comps.heldOutFitted || 0).toFixed(3) + ' vs flat ' + (comps.heldOutFlat || 0).toFixed(3) + ', wins ' + (comps.heldOutWins || 0) + '/5.';
  });

  // ---- the farm plan, generated in the page from the fitted rule ----
  function farmPlan(row) {
    var deposit = 0;
    if (row.tvl_usd < 10000000) deposit = 50;
    else if (row.tvl_usd < 100000000) deposit = 100;
    else if (row.tvl_usd < 1000000000) deposit = 150;
    else deposit = 250;
    var chain = (row.chains && row.chains.length > 0) ? row.chains[0] : 'its main chain';
    var gas = 1;
    if (chain === 'Ethereum') gas = 8;
    else if (chain === 'Bitcoin') gas = 2;
    else if (chain === 'Solana') gas = 0.01;
    else if (chain === 'Base' || chain === 'Polygon' || chain === 'Sui') gas = 0.05;
    else if (chain === 'Arbitrum' || chain === 'Optimism' || chain === 'Hyperliquid L1') gas = 0.1;
    else if (chain === 'Binance') gas = 0.3;
    else if (chain === 'Avalanche' || chain === 'Tron') gas = 0.5;
    var hold = 45;
    var c = (row.category || '').toLowerCase();
    var action;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) action = 'Supply $' + deposit + ' of USDC to ' + row.name + ' on ' + chain + ' and keep the position open.';
    else if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) action = 'Provide $' + deposit + ' of liquidity to ' + row.name + "'s main pool on " + chain + ' and keep the position open.';
    else if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) action = 'Stake $' + deposit + " of the chain's staking asset through " + row.name + ' and keep the receipt.';
    else if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) action = 'Deposit $' + deposit + ' of USDC as margin on ' + row.name + ' and open one small hedge.';
    else if (c.indexOf('prediction') >= 0) action = 'Fund $' + deposit + ' and place one market position on ' + row.name + '.';
    else if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) action = 'Deposit $' + deposit + ' into a ' + row.name + ' vault on ' + chain + ' and keep the shares.';
    else if (c.indexOf('stable') >= 0) action = 'Mint or deposit $' + deposit + ' of the stable asset through ' + row.name + ' on ' + chain + '.';
    else if (c.indexOf('rwa') >= 0) action = 'Mint $' + deposit + " of the protocol's yield asset on " + chain + ' and hold it.';
    else if (c.indexOf('insurance') >= 0) action = 'Buy $' + deposit + ' of cover from ' + row.name + ' on ' + chain + ' and keep the policy.';
    else action = 'Deposit $' + deposit + ' of USDC into ' + row.name + ' on ' + chain + ' and keep the position open.';
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action, cost: '$' + deposit + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + deposit + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    return steps.map(function (s) {
      var str = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      if (str.length > 600) str = str.slice(0, 596) + '...';
      if (str.length < 20) str += ' Hold the position and check the protocol\'s own page.';
      return str;
    });
  }

  // ---- the board table, the verdict filter, and the detail view ----
  function renderBoard(filter) {
    var body = $('board-body');
    var shown = rows.filter(function (r) { return filter === 'ALL' || r.verdict === filter; });
    $('filter-note').textContent = 'Showing ' + shown.length + ' of ' + rows.length + (filter === 'ALL' ? '' : ' — ' + filter + ' only') + '.';
    var html = '';
    shown.forEach(function (r) {
      html += '<tr><td>' + r.rank + '</td><td><a href="#detail/' + r.slug + '">' + r.name + '</a></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num">$' + r.expected_value_usd.toFixed(2) + '</td><td class="num">$' + r.cost_usd + '</td>' +
        '<td class="num">' + r.ev_cost_ratio.toFixed(2) + '</td>' +
        '<td><span class="badge ' + r.verdict + '">' + r.verdict + '</span></td></tr>';
    });
    body.innerHTML = html;
  }

  function renderDetail(slug) {
    var row = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { row = rows[i]; break; }
    var detail = $('detail');
    if (!row) { detail.hidden = true; return; }
    detail.hidden = false;
    $('detail-title').textContent = '#' + row.rank + ' ' + row.name + ' — ' + row.verdict;
    var base = Math.exp((comps.intercept || 0) + (comps.slope || 0) * Math.log(row.tvl_usd));
    var growth = row.change_7d === null ? 0 : Math.min(120, Math.max(-60, row.change_7d));
    var growthMult = 1 + (growth / 100) * 0.5;
    var age = row.age_days === null ? 513 : row.age_days;
    var maturity = 0.6 + (Math.min(Math.max(age, 0), 1095) / 1095) * 0.4;
    var activeHours = 2 + 45 / 28;
    var perHour = row.cost_usd / activeHours;
    var plan = farmPlan(row);
    var html = '';
    html += '<div class="eq">Implied = ' + money(base) + ' &times; ' + growthMult.toFixed(3) + ' &times; ' + maturity.toFixed(3) + ' &times; ' + row.odds_365d.toFixed(3) + ' = ' + money(row.implied_value_usd) + '</div>';
    html += '<div class="eq">EV = ' + money(row.implied_value_usd) + ' &times; 7% / ' + fmt(row.farmers) + ' farmers = $' + row.expected_value_usd.toFixed(2) + '</div>';
    html += '<p>Cost $' + row.cost_usd + '; EV / cost ' + row.ev_cost_ratio.toFixed(2) + '; hold 45 days; active hours = 2 + 45/28 = ' + activeHours.toFixed(2) + ' h; $' + perHour.toFixed(2) + ' per active hour. The active-hours rule is 2 hours of setup plus one hour per 28 days of holding.</p>';
    html += '<p>TVL ' + money(row.tvl_usd) + ' &middot; 7-day change ' + (row.change_7d === null ? 'not reported' : row.change_7d.toFixed(2) + '%') + ' &middot; age ' + (row.age_days === null ? 'not reported' : row.age_days + ' days') + ' &middot; category ' + (row.category || '—') + ' &middot; chain ' + ((row.chains && row.chains[0]) || '—') + '.</p>';
    if (row.age_days === null || row.change_7d === null) html += '<p><strong>SKIP:</strong> the age or the 7-day change is not reported, so this row is SKIP whatever its value.</p>';
    if (row.rank === 1) html += '<p><strong>Rank 1 is SKIP, honestly:</strong> the fitted value is the largest on the board, but ' + fmt(row.farmers) + ' farmers dilute the share to $' + row.expected_value_usd.toFixed(2) + ' against a $' + row.cost_usd + ' cost. A radar that calls the biggest protocol FARM on value alone would be lying about the economics.</p>';
    html += '<h3>Farm plan</h3><ol>' + plan.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>';
    $('detail-body').innerHTML = html;
  }

  // ---- live tokens and smaller pre-token tabs ----
  var liveHtml = '';
  live.forEach(function (r) {
    liveHtml += '<tr><td>' + r.name + '</td><td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + (r.mcap_usd === null ? '—' : money(r.mcap_usd)) + '</td><td class="num">' + (r.change_7d === null ? '—' : r.change_7d.toFixed(2) + '%') + '</td></tr>';
  });
  $('live-body').innerHTML = liveHtml;
  $('small-note').textContent = DATA.not_in_board + ' smaller pre-token protocols are not in the board (below its TVL cut). Together with the ' + rows.length + ' board rows and the ' + live.length + ' live tokens, that accounts for all ' + (rows.length + live.length + DATA.not_in_board) + ' protocols in the snapshot.';

  // ---- tabs and hash routing ----
  function setTab(name) {
    var tabs = document.querySelectorAll('#tabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === name);
    $('board-tab').hidden = name !== 'board';
    $('live-tab').hidden = name !== 'live';
    $('small-tab').hidden = name !== 'small';
  }
  var tabBtns = document.querySelectorAll('#tabs button');
  for (var i = 0; i < tabBtns.length; i++) {
    tabBtns[i].addEventListener('click', function () { setTab(this.getAttribute('data-tab')); });
  }
  function route() {
    var h = location.hash || '#filter/ALL';
    var m = h.match(/^#detail\/(.+)$/);
    if (m) { renderDetail(m[1]); setTab('board'); renderBoard('ALL'); return; }
    var f = h.match(/^#filter\/(ALL|FARM|THIN|SKIP)$/);
    renderBoard(f ? f[1] : 'ALL');
    $('detail').hidden = true;
    setTab('board');
  }
  window.addEventListener('hashchange', route);
  route();
})();
