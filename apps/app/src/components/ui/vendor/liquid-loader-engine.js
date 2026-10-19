/*!
 * Redrob Liquid Loader 1.0.0
 * McKinley Rice Co., Ltd. - Redrob Group Design System 2026
 *
 * The Redrob symbol melts into a drop, divides into three balls, stretches into the three
 * raked Loader bars, runs three light passes, then flows back into the mark. 8.64 s loop on
 * the Loader's 1.08 s beat. Solid Redrob Blue (#2B52FF). Geometry from the official vector.
 *
 * Framework-agnostic ES module, no dependencies, Canvas 2D. Deterministic: every frame is a
 * pure function of time.
 */
  // Engine. Every in-between frame is a signed distance field (negative
  // inside), drawn wherever it crosses zero with an exact anti-aliased edge; at rest the
  // official mark and the bars are the SVG shapes themselves.
  //
  // The story runs on one parameter s: 0 the mark, 1 the drop, 2 three balls, 3 the bars.
  // Each stage is linear in s, and time is mapped to s through tables measured from the
  // shapes, so the liquid changes at an even rate. The drop is a complete, solid disc, and
  // it rests for a beat (one settling ripple) before it divides, and again before it forms.
  const RAD = Math.PI / 180, K = Math.tan(40 * RAD), C40 = Math.cos(40 * RAD), S40 = Math.sin(40 * RAD);
  const CX = 960, CY = 540, EM = 360, W = 0.19 * EM, PITCH = W + 0.2 * EM;
  const R = 131, RB = [69, 89, 69], RS = [108, 118, 108], SPREAD = 210;
  const RX = 580, RY = 250, RW = 760, RH = 580, SC = 2, BW = RW * SC, BH = RH * SC;
  const COL = (255 << 16) | (82 << 8) | 43;
  const D = 'M54.4 26.33L54.4 17.75L47.57 15.26L32 9.6L25.16 12.09L9.6 17.75L9.6 26.33L13.37 27.7L25.16 31.99L25.16 23.41L32 20.93L35.4 19.69L38.8 18.45L38.8 32L38.8 45.54L32 43.06L32 43.05L32 43.06L25.16 40.57L25.16 32.01L13.39 36.29L9.6 37.67L9.6 46.25L32 54.4L54.4 46.25L54.4 37.67L50.6 36.29L38.8 32L50.63 27.69L54.4 26.32L54.4 26.33Z';
  // Time. The mark holds 0.25 s at each side of the seam; the light passes are unchanged.
  // f0..fa melt, fa..fb the drop rests, fb..f1 divide and stretch; b0..ba back to the drop,
  // ba..bb it rests, bb..b1 the mark forms.
  // The whole loop sits on a grid of 0.27 s steps, a quarter of the Loader's 1.08 s beat: 32
  // steps, 8 beats. The liquid moves in 0.54 s phrases that surge and settle on the beat.
  const T = { f0: 0.27, fm: 0.81, fa: 1.35, fb: 1.62, fc: 2.16, f1: 2.70, b0: 5.94, bc: 6.48, ba: 7.02, bb: 7.29, bm: 7.83, b1: 8.37, end: 8.64 };
  // s at evenly spaced fractions of the measured change in each run (baked).
  const TAB = {"fA":[0,0.0209,0.0456,0.057,0.0889,0.1209,0.147,0.161,0.1731,0.1885,0.2086,0.2223,0.232,0.2416,0.2518,0.2584,0.2647,0.2727,0.2813,0.2888,0.2965,0.3039,0.3112,0.3186,0.3243,0.3311,0.3366,0.342,0.3475,0.354,0.359,0.3648,0.3697,0.3746,0.3801,0.385,0.3898,0.3948,0.3994,0.404,0.4086,0.4138,0.4181,0.4231,0.4275,0.4323,0.4373,0.4424,0.4467,0.4514,0.4563,0.4613,0.4663,0.4715,0.4764,0.482,0.4867,0.4917,0.4966,0.5024,0.5068,0.5115,0.5162,0.5207,0.5254,0.5298,0.5348,0.5394,0.5443,0.5489,0.5536,0.5579,0.5625,0.5668,0.571,0.5753,0.5799,0.5837,0.5885,0.5918,0.5954,0.5991,0.6021,0.6056,0.6096,0.6138,0.6181,0.6232,0.6273,0.6315,0.6357,0.6397,0.6439,0.6478,0.652,0.6573,0.6646,0.671,0.678,0.6834,0.6916,0.6976,0.7044,0.7112,0.7181,0.7249,0.7317,0.7399,0.7473,0.7546,0.7631,0.7729,0.7898,0.8155,0.8439,0.8679,0.8959,0.9233,0.9501,0.9732,1],"f1":[1,1.098,1.1254,1.1399,1.1558,1.1682,1.179,1.1905,1.1992,1.2097,1.2186,1.2301,1.2388,1.2499,1.2624,1.2726,1.2845,1.2941,1.3059,1.3153,1.3251,1.3361,1.3445,1.3541,1.3652,1.3735,1.3824,1.3927,1.4016,1.4106,1.4188,1.4284,1.437,1.4454,1.4545,1.4628,1.4724,1.481,1.4897,1.4978,1.5064,1.5155,1.5233,1.5324,1.54,1.5482,1.5584,1.5654,1.5728,1.5804,1.5888,1.5962,1.6052,1.6128,1.621,1.628,1.6358,1.644,1.6517,1.6586,1.6661,1.6738,1.6812,1.6885,1.6954,1.7022,1.7096,1.7165,1.7238,1.7302,1.7375,1.7432,1.7498,1.7564,1.7632,1.7699,1.7761,1.782,1.7884,1.7944,1.8003,1.8057,1.8117,1.8173,1.8225,1.8277,1.8328,1.8378,1.8424,1.8469,1.8518,1.8567,1.8604,1.864,1.8677,1.8712,1.875,1.8795,1.8843,1.8887,1.8937,1.8982,1.9035,1.9079,1.9128,1.9182,1.9233,1.9284,1.9342,1.9393,1.945,1.9499,1.955,1.961,1.9659,1.9718,1.9775,1.9825,1.9891,1.994,2],"f2":[2,2.0727,2.1093,2.1376,2.162,2.1785,2.1947,2.2092,2.2226,2.2351,2.2456,2.2586,2.2683,2.2789,2.2876,2.2968,2.3073,2.3166,2.3243,2.3322,2.3412,2.3497,2.3568,2.3633,2.3712,2.3804,2.3866,2.3924,2.3998,2.4073,2.4132,2.4192,2.4259,2.4327,2.4392,2.4452,2.4515,2.4566,2.4633,2.468,2.4744,2.4801,2.4856,2.4919,2.4977,2.503,2.5086,2.5132,2.5186,2.5246,2.5291,2.5344,2.54,2.5451,2.5495,2.5551,2.56,2.5649,2.5698,2.5744,2.5797,2.5845,2.5888,2.5944,2.5989,2.6036,2.6086,2.6132,2.6181,2.622,2.6272,2.6316,2.6367,2.6409,2.6448,2.6501,2.6544,2.6587,2.6628,2.6675,2.6719,2.6762,2.6807,2.6851,2.6903,2.6939,2.6992,2.7033,2.7082,2.7123,2.7174,2.7222,2.7276,2.7321,2.7361,2.7417,2.7462,2.7515,2.7569,2.7615,2.7672,2.7719,2.7772,2.7833,2.7893,2.7949,2.8006,2.8062,2.8123,2.82,2.8264,2.8351,2.8414,2.8498,2.8597,2.8701,2.8811,2.8937,2.9073,2.9294,3],"b2":[3,2.9313,2.9079,2.8943,2.8821,2.8707,2.8607,2.8509,2.8424,2.8333,2.8272,2.8196,2.8123,2.8065,2.8,2.7947,2.7891,2.7828,2.7771,2.7716,2.7665,2.7613,2.7565,2.7515,2.7463,2.7413,2.7363,2.7317,2.7268,2.7222,2.7181,2.7134,2.7085,2.7037,2.6991,2.6945,2.6905,2.6852,2.6811,2.6764,2.672,2.6676,2.6632,2.6591,2.6545,2.6503,2.6456,2.6412,2.6365,2.6318,2.6272,2.6222,2.6185,2.6132,2.6087,2.6042,2.5995,2.5943,2.5901,2.5846,2.58,2.575,2.5695,2.5651,2.56,2.5549,2.5496,2.5452,2.5399,2.5354,2.5297,2.5244,2.5189,2.5131,2.5079,2.5029,2.4984,2.4917,2.4854,2.4802,2.4746,2.4689,2.4636,2.4573,2.4515,2.445,2.4383,2.4328,2.4278,2.4204,2.4136,2.4084,2.4005,2.3937,2.3874,2.3802,2.3727,2.3645,2.3569,2.3497,2.3419,2.3331,2.3257,2.3162,2.3081,2.2983,2.2889,2.2783,2.2698,2.2596,2.2476,2.2356,2.2244,2.2104,2.1954,2.1816,2.163,2.142,2.1114,2.0797,2],"b1":[2,1.994,1.9891,1.9825,1.9775,1.9718,1.9659,1.961,1.955,1.9499,1.945,1.9393,1.9342,1.9284,1.9233,1.9182,1.9128,1.9079,1.9035,1.8982,1.8937,1.8887,1.8843,1.8795,1.875,1.8712,1.8677,1.864,1.8604,1.8567,1.8518,1.8469,1.8424,1.8378,1.8328,1.8277,1.8225,1.8173,1.8117,1.8057,1.8003,1.7944,1.7884,1.782,1.7761,1.7699,1.7632,1.7564,1.7497,1.7432,1.7375,1.7302,1.7238,1.7165,1.7096,1.7022,1.6954,1.6885,1.6812,1.6738,1.6661,1.6586,1.6517,1.644,1.6358,1.628,1.621,1.6128,1.6052,1.5962,1.5888,1.5804,1.5728,1.5654,1.5584,1.5482,1.54,1.5324,1.5233,1.5155,1.5064,1.4978,1.4897,1.481,1.4724,1.4628,1.4545,1.4454,1.437,1.4284,1.4188,1.4106,1.4016,1.3927,1.3824,1.3735,1.3652,1.3541,1.3445,1.3361,1.3251,1.3153,1.3059,1.2941,1.2845,1.2726,1.2624,1.2499,1.2388,1.2301,1.2186,1.2097,1.1992,1.1905,1.179,1.1682,1.1558,1.1399,1.1254,1.098,1],"bA":[1,0.9732,0.9501,0.9229,0.8944,0.8692,0.8461,0.814,0.7896,0.7745,0.7648,0.7568,0.7486,0.7404,0.7324,0.7247,0.7179,0.7108,0.7041,0.6965,0.6899,0.682,0.6751,0.6681,0.6609,0.6557,0.6506,0.6457,0.6405,0.6368,0.6327,0.6296,0.6261,0.6224,0.6185,0.6137,0.6096,0.6055,0.6014,0.5968,0.5932,0.5893,0.5855,0.5817,0.5783,0.574,0.5695,0.5652,0.561,0.5565,0.5519,0.5468,0.5423,0.5373,0.5329,0.5278,0.523,0.5179,0.5132,0.5083,0.5037,0.4981,0.4931,0.489,0.4835,0.4779,0.4738,0.4691,0.4639,0.4596,0.4545,0.4493,0.4452,0.4405,0.4355,0.4307,0.4265,0.4221,0.4174,0.4128,0.4077,0.4035,0.3984,0.393,0.3887,0.3843,0.379,0.3739,0.3682,0.3624,0.3572,0.3516,0.3464,0.341,0.3351,0.3297,0.3228,0.3146,0.3079,0.302,0.2968,0.2903,0.2827,0.2744,0.2652,0.2571,0.252,0.2422,0.2318,0.223,0.212,0.1987,0.1813,0.1568,0.1462,0.1206,0.0886,0.0573,0.0456,0.0208,0]};
  // Volume: the outline is eased in or out by these amounts (px) along each run so the blue
  // keeps its volume: no puff as necks form, a steady fall from the mark to the drop (baked).
  const VOL = {"fA":[0,0.46,1.36,2,2.38,3.14,3.51,3.95,4.81,5.5,6.42,7.17,8.1,9.2,10.42,11.38,12.35,13.46,14.21,14.71,14.27,11.34,5.5,-1.18,-6.63,-9.13,-7.83,-6.79,-4.9,-3.39,-2.09,-1.21,0],"f1":[0,0.08,0.16,0.4,0.83,1.61,2.68,3.8,4.73,5.66,6.76,7.82,8.38,9.24,10.27,10.79,11.52,11.88,12.16,12.65,12.56,12.31,12.05,11.51,10.89,9.91,8.83,7.42,5.42,3.72,2.33,1.07,0],"f2":[0,-0.11,-0.1,0.12,0.16,0.34,0.34,0.68,1.04,1.14,1.39,1.5,1.73,1.79,1.89,1.67,1.6,1.38,1.05,0.78,0.34,0.11,0.01,-0.1,-0.2,-0.02,-0.17,-0.12,-0.04,0.1,0.05,0.04,0],"b2":[0,0.04,0.05,0.1,-0.04,-0.12,-0.17,-0.02,-0.2,-0.1,0.01,0.11,0.34,0.78,1.05,1.38,1.6,1.67,1.89,1.79,1.73,1.5,1.39,1.14,1.04,0.68,0.34,0.34,0.16,0.12,-0.1,-0.11,0],"b1":[0,1.07,2.33,3.72,5.42,7.42,8.83,9.91,10.89,11.51,12.05,12.31,12.56,12.65,12.16,11.88,11.52,10.79,10.27,9.24,8.38,7.82,6.76,5.66,4.73,3.8,2.68,1.61,0.83,0.4,0.16,0.08,0],"bA":[0,-1.21,-2.09,-3.3,-4.74,-6.41,-7.05,-7.58,-4.65,-0.13,5.19,10.97,13.64,14.42,13.89,13.21,12.34,11.36,10.38,9.2,8.18,7.19,6.42,5.59,4.82,3.84,3.52,3.16,2.38,2,1.36,0.46,0]};

  const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const lerp = (a, b, f) => a + (b - a) * f;
  const sm = (x) => x * x * (3 - 2 * x);
  const wob = (t, t0, amp) => t <= t0 ? 0 : amp * Math.exp(-(t - t0) * 7) * Math.sin(2 * Math.PI * (t - t0) * 3.6);
  // The one pacing curve: speed eases up from rest, cruises, and eases down to rest.
  const RAMP = 0.25;
  function pace(x) {
    const a = RAMP, tot = 1 - a;
    if (x <= 0) return 0; if (x >= 1) return 1;
    if (x < a) { const z = x / a; return a * (z * z * z - z * z * z * z / 2) / tot; }
    if (x > 1 - a) { const z = (1 - x) / a; return 1 - a * (z * z * z - z * z * z * z / 2) / tot; }
    return (a / 2 + x - a) / tot;
  }
  function lookup(tab, e) {
    const z = Math.min(1, Math.max(0, e)) * (tab.length - 1), i = Math.min(tab.length - 2, z | 0);
    return tab[i] + (tab[i + 1] - tab[i]) * (z - i);
  }

  // ---- The melt, modelled on surface tension. A liquid outline pulls itself toward the
  // shortest outline it can have: sharp corners soften first, narrow gaps pull shut, and the
  // whole shape settles toward a circle. This is approximated by blurring the solid mark at
  // rising strengths and tracing each blur at the level that keeps the blue on schedule
  // (area falls steadily from the mark's to the drop's). Each traced outline is rebuilt as a
  // true distance field, so between stages every part of the edge moves at an even rate.
  const MARK = (D.match(/[\d.]+ [\d.]+/g) || []).map((s) => s.split(' ').map(Number)).map((p) => [750 + (p[0] - 9.6) * 9.375, 330 + (p[1] - 9.6) * 9.375]);
  const GS = 2, GW = Math.ceil(RW / GS) + 1, GH = Math.ceil(RH / GS) + 1, N = GW * GH;
  const SIG = [2.5, 5, 7.5, 10, 13, 16, 20, 24, 29, 34, 40, 47, 55, 64, 74, 86, 100, 116];
  let LV = null;
  function markGrid() {
    const pts = [];
    for (const p of MARK) { const l = pts[pts.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.01) pts.push(p); }
    while (Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 0.01) pts.pop();
    const n = pts.length, g = new Float32Array(N);
    for (let j = 0; j < GH; j++) {
      const y = RY + j * GS;
      for (let i = 0; i < GW; i++) {
        const x = RX + i * GS;
        let dm = 1e12, inside = false;
        for (let k = 0; k < n; k++) {
          const a = pts[k], b = pts[(k + 1) % n];
          const ex = b[0] - a[0], ey = b[1] - a[1], wx = x - a[0], wy = y - a[1];
          const l2 = ex * ex + ey * ey;
          const tt = l2 > 0 ? Math.min(1, Math.max(0, (wx * ex + wy * ey) / l2)) : 0;
          const dx = wx - ex * tt, dy = wy - ey * tt, d2 = dx * dx + dy * dy;
          if (d2 < dm) dm = d2;
          if ((a[1] > y) !== (b[1] > y) && x < ex * (y - a[1]) / ey + a[0]) inside = !inside;
        }
        g[j * GW + i] = (inside ? -1 : 1) * Math.sqrt(dm);
      }
    }
    return g;
  }
  function boxPass(src, dst, r, along) {
    const n = along ? GW : GH, m = along ? GH : GW, w = 2 * r + 1;
    for (let o = 0; o < m; o++) {
      const at = (q) => along ? o * GW + Math.min(GW - 1, Math.max(0, q)) : Math.min(GH - 1, Math.max(0, q)) * GW + o;
      let acc = 0;
      for (let q = -r; q <= r; q++) acc += src[at(q)];
      for (let q = 0; q < n; q++) { dst[at(q)] = acc / w; acc += src[at(q + r + 1)] - src[at(q - r)]; }
    }
  }
  function blurred(src, sig) {
    // Three box passes each way approximate a Gaussian of sigma sig (px).
    const sc = sig / GS, r = Math.max(1, Math.round((Math.sqrt(12 * sc * sc / 3 + 1) - 1) / 2));
    const a = Float32Array.from(src), b = new Float32Array(N);
    for (let k = 0; k < 3; k++) { boxPass(a, b, r, true); boxPass(b, a, r, false); }
    return a;
  }
  function dt1(f, n, d, v, z) {
    let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  }
  function edt(feat) {
    const out = new Float64Array(N), n = Math.max(GW, GH);
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let k = 0; k < N; k++) out[k] = feat[k] ? 0 : 1e12;
    for (let i = 0; i < GW; i++) { for (let j = 0; j < GH; j++) f[j] = out[j * GW + i]; dt1(f, GH, d, v, z); for (let j = 0; j < GH; j++) out[j * GW + i] = d[j]; }
    for (let j = 0; j < GH; j++) { for (let i = 0; i < GW; i++) f[i] = out[j * GW + i]; dt1(f, GW, d, v, z); for (let i = 0; i < GW; i++) out[j * GW + i] = d[i]; }
    return out;
  }
  // g: any field negative inside. Returns the true distance field of its outline, with the
  // outline itself placed to sub-pixel accuracy from the local slope.
  function redistanced(g) {
    const inside = new Uint8Array(N), outside = new Uint8Array(N);
    for (let k = 0; k < N; k++) { inside[k] = g[k] < 0 ? 1 : 0; outside[k] = 1 - inside[k]; }
    const toIn = edt(inside), toOut = edt(outside), out = new Float32Array(N);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const k = j * GW + i;
      let v = inside[k] ? -(Math.sqrt(toOut[k]) - 0.5) * GS : (Math.sqrt(toIn[k]) - 0.5) * GS;
      const il = i > 0 ? k - 1 : k, ir = i < GW - 1 ? k + 1 : k, ju = j > 0 ? k - GW : k, jd = j < GH - 1 ? k + GW : k;
      const gx = (g[ir] - g[il]) / (((ir - il) || 1) * GS), gy = (g[jd] - g[ju]) / ((((jd - ju) / GW) || 1) * GS), gm = Math.hypot(gx, gy);
      if (gm > 1e-4) { const loc = g[k] / gm; if (Math.abs(loc) < 1.5 * GS) v = loc; }
      out[k] = Math.max(-300, Math.min(300, v));
    }
    return out;
  }
  function smoothed(g) {
    const a = Float32Array.from(g), b = new Float32Array(N);
    for (let k = 0; k < 2; k++) { boxPass(a, b, 1, true); boxPass(b, a, 1, false); }
    return a;
  }
  // The blue at each stage falls on a straight line from the mark's area to the drop's.
  const A_END = Math.PI * R * R * 1.02;
  // The blue holds while the gaps fill (liquid flowing in, not drying up), then condenses.
  const AREA = (x) => { const z = Math.min(1, Math.max(0, (x - HOLD_A) / (1 - HOLD_A))); return z * z * (3 - 2 * z) * 0.5 + z * 0.5; };
  const HOLD_A = 0.0;
  function levels() {
    if (LV) return LV;
    const g0 = markGrid(), ind = new Float32Array(N);
    let a0 = 0;
    for (let k = 0; k < N; k++) { ind[k] = Math.min(1, Math.max(0, 0.5 - g0[k] / GS)); a0 += ind[k]; }
    a0 *= GS * GS;
    const out = [g0], tmp = new Float32Array(N);
    SIG.forEach((sg, li) => {
      const b = blurred(ind, sg), target = a0 + (A_END - a0) * AREA((li + 1) / SIG.length);
      // The level whose enclosed area is the target, by bisection.
      let lo = 0, hi = 1;
      for (let it = 0; it < 28; it++) {
        const mid = (lo + hi) / 2;
        let n = 0; for (let k = 0; k < N; k++) if (b[k] > mid) n++;
        if (n * GS * GS > target) lo = mid; else hi = mid;
      }
      const tau = (lo + hi) / 2;
      for (let k = 0; k < N; k++) tmp[k] = tau - b[k];
      // Smooth away the distance transform's grid steps (a light blur keeps the outline where
      // it is but removes the 2 px stair-stepping that would otherwise show along the edge).
      out.push(smoothed(redistanced(tmp)));
    });
    return (LV = out);
  }
  function sampG(g, x, y) {
    const fx = (x - RX) / GS, fy = (y - RY) / GS;
    if (fx < 0 || fy < 0 || fx >= GW - 1 || fy >= GH - 1) return 300;
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * GW + i;
    return (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + GW] * (1 - u) + g[k + GW + 1] * u) * v;
  }
  // q 0..1 runs through the stages: 0 the exact mark, 1 the relaxed drop.
  function meltD(x, y, q) {
    const L = LV || levels(), z = Math.min(1, Math.max(0, q)) * (L.length - 1), i = Math.min(L.length - 2, z | 0), f = z - i;
    const a = sampG(L[i], x, y);
    return f ? a + (sampG(L[i + 1], x, y) - a) * f : a;
  }
  // ---- Primitive fields.
  function circ(x, y, cx, cy, r, a, ca, sa) {
    const dx = x - cx, dy = y - cy, l2 = dx * dx + dy * dy, l = Math.sqrt(l2) + 1e-6;
    if (!a) return l - r;
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    return l - r * (1 + a * (u * u - v * v) / (l2 + 1e-6));
  }
  function barD(x, y, cx, cy, h) {
    const yy = y - cy, u = x - cx + K * yy;
    const qx = (Math.abs(u) - W / 2) * C40, qy = Math.abs(yy) - h / 2;
    const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0);
  }
  function smin(a, b, k) {
    if (k <= 0) return Math.min(a, b);
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  }
  // The crossing front: a 40 degree edge sweeping left to right (mirrored on the way back,
  // so the mark also forms left first).
  function front(x, y, e) {
    const s = ((x - CX) * C40 + (y - CY) * S40) / 300, w0 = 0.25;
    const b = (e - 0.5 * w0 * (s + 1)) / (1 - w0);
    return b <= 0 ? 0 : b >= 1 ? 1 : sm(b);
  }
  const barC = (i) => [CX + (i - 1) * PITCH, CY];
  const barH = (i) => (i === 1 ? EM : EM * 0.6);
  const WELL_R = 112; // the welling liquid's final radius: enough to fill the door and the notch tips
  // The necks thin to nothing exactly at the end of the divide, on the 2.16 s downbeat: the
  // smoothing (60 - 8u) meets the gap between the balls (278u - 226) at u = 1.
  const U_SNAP = 1;

  // ---- The field at story position s. ev: event times for the ripples (null when measuring).
  function volOff(s, back) {
    if (!VOL) return 0;
    if (!back) { if (s <= 1) return lookup(VOL.fA, s); if (s <= 2) return lookup(VOL.f1, s - 1); return lookup(VOL.f2, s - 2); }
    if (s >= 2) return lookup(VOL.b2, 3 - s); if (s >= 1) return lookup(VOL.b1, 2 - s); return lookup(VOL.bA, 1 - s);
  }
  function fieldAt(s, back, t, ev) {
    const base = fieldRaw(s, back, t, ev), dv = volOff(s, back);
    return dv ? (x, y) => base(x, y) + dv : base;
  }
  function fieldRaw(s, back, t, ev) {
    const dropA = ev ? (back ? wob(t, ev.ba, 0.05) : wob(t, ev.fa, 0.05)) : 0;
    if (s <= 1) {
      const u = s, c = sm(seg(u, 0.92, 1));
      if (u >= 1) return (x, y) => circ(x, y, CX, CY, R, dropA, 1, 0);
      // Liquid wells up from the doorway (the gate's light, spreading from the opening) and
      // floods the door and notches, joined to the softening outline by smooth bridges.
      const rw = WELL_R * sm(seg(u, 0.04, 0.62)), kw = 26 * sm(seg(u, 0.04, 0.2)); // the bridge vanishes with the liquid
      return (x, y) => {
        let m = meltD(x, y, back ? front(2 * CX - x, 2 * CY - y, u) : front(x, y, u));
        if (rw > 0) m = smin(m, circ(x, y, CX, CY, rw, 0, 1, 0), kw);
        return c <= 0 ? m : lerp(m, circ(x, y, CX, CY, R, dropA, 1, 0), c);
      };
    }
    const tw = ev && !back ? t : -1, snap = ev ? ev.snap : 1e9;
    const B = [0, 1, 2].map((i) => ({ r: RB[i], ca: 1, sa: 0, a: 0, x: CX + (i - 1) * SPREAD, y: CY }));
    if (s <= 2) {
      const u = s - 1, k = 60 - 8 * u, bIn = sm(seg(u, 0, 0.25));
      for (let i = 0; i < 3; i++) {
        B[i].x = CX + (i - 1) * SPREAD * u; B[i].r = lerp(RS[i], RB[i], u);
        B[i].a = wob(tw, snap, i === 1 ? -0.05 : 0.07);
        if (i === 1) { B[i].ca = 0; B[i].sa = 1; }
      }
      const bd = (x, y) => smin(smin(circ(x, y, B[1].x, B[1].y, B[1].r, B[1].a, B[1].ca, B[1].sa), circ(x, y, B[0].x, B[0].y, B[0].r, B[0].a, 1, 0), k), circ(x, y, B[2].x, B[2].y, B[2].r, B[2].a, 1, 0), k);
      return (x, y) => bIn >= 1 ? bd(x, y) : lerp(circ(x, y, CX, CY, R, dropA, 1, 0), bd(x, y), bIn);
    }
    const u = s - 2, L = [];
    for (let i = 0; i < 3; i++) {
      // Left first, 0.06 of the stage apart, both ways.
      const b = sm(back ? seg(u, 0.12 - 0.06 * i, 1 - 0.06 * i) : seg(u, 0.06 * i, 0.88 + 0.06 * i));
      const c = barC(i), x0 = lerp(B[i].x, c[0], b), y0 = lerp(B[i].y, c[1], b);
      const land = ev && !back ? landing(t, ev.land[i]) : 0;
      L.push({ b, x0, y0, r: B[i].r, a: wob(tw, snap, i === 1 ? -0.05 : 0.07) * (1 - b), ca: i === 1 ? 0 : 1, sa: i === 1 ? 1 : 0, h: barH(i) * (1 + land), inf: 9 * Math.sin(Math.PI * b) });
    }
    return (x, y) => {
      let d = 1e9;
      for (const l of L) { const c = circ(x, y, l.x0, l.y0, l.r, l.a, l.ca, l.sa); const v = l.b <= 0 ? c : lerp(c, barD(x, y, l.x0, l.y0, l.h), l.b) - l.inf; if (v < d) d = v; }
      return d;
    };
  }
  // The landing ripple on each bar, from the moment it arrives, carried into the passes.
  function landing(t, tl) {
    const x = t - tl;
    return x <= 0 || t >= T.b0 ? 0 : 0.06 * Math.exp(-x * 6.5) * Math.sin(2 * Math.PI * x * 3.2);
  }
  // The pulse. Within a phrase the speed rises from a to a peak halfway and settles to b on
  // the beat: from rest (0) where something sets off or arrives, to FLOOR (45% of the peak)
  // where one phrase hands on to the next, so the liquid never stops mid-flow.
  const FLOOR = 0.45;
  function prof(a, b, x) { const base = a * (1 - x) + b * x, sn = Math.sin(Math.PI * x); return base + (1 - base) * sn * sn; }
  function cumTab(a, b) { const n = 240, c = [0]; for (let i = 1; i <= n; i++) c.push(c[i - 1] + (prof(a, b, (i - 1) / n) + prof(a, b, i / n)) / 2 / n); return c; }
  const UP = cumTab(0, FLOOR), DN = cumTab(FLOOR, 0);
  function cumAt(c, x) { const z = Math.min(1, Math.max(0, x)) * (c.length - 1), i = Math.min(c.length - 2, z | 0); return c[i] + (c[i + 1] - c[i]) * (z - i); }
  // Fraction of a run done at t, the run being a chain of phrases [t0, t1, profile].
  function runE(t, ph) {
    let acc = 0, tot = 0;
    for (const p of ph) tot += p[2][p[2].length - 1];
    for (const p of ph) { if (t >= p[1]) { acc += p[2][p[2].length - 1]; continue; } if (t > p[0]) acc += cumAt(p[2], (t - p[0]) / (p[1] - p[0])); break; }
    return acc / tot;
  }
  // Time to story position. Within each run the shape changes at an even measured rate
  // (TAB); the pulse sets how fast the run is travelled.
  function sAt(t) {
    const tb = TAB || { fA: [0, 1], f1: [1, 2], f2: [2, 3], b2: [3, 2], b1: [2, 1], bA: [1, 0] };
    if (t < T.fa) return lookup(tb.fA, runE(t, [[T.f0, T.fm, UP], [T.fm, T.fa, DN]]));
    if (t < T.fb) return 1;
    if (t < T.fc) return lookup(tb.f1, runE(t, [[T.fb, T.fc, UP]]));
    if (t < T.f1) return lookup(tb.f2, runE(t, [[T.fc, T.f1, DN]]));
    if (t < T.bc) return lookup(tb.b2, runE(t, [[T.b0, T.bc, UP]]));
    if (t < T.ba) return lookup(tb.b1, runE(t, [[T.bc, T.ba, DN]]));
    if (t < T.bb) return 1;
    return lookup(tb.bA, runE(t, [[T.bb, T.bm, UP], [T.bm, T.b1, DN]]));
  }
  let EV = null;
  function events() {
    if (EV) return EV;
    const at = (target) => { for (let t = T.fb; t <= T.f1; t += 1 / 480) if (sAt(t) >= target) return t; return T.f1; };
    return (EV = { fa: T.fa, ba: T.ba, snap: at(1 + U_SNAP), land: [0, 1, 2].map((i) => at(2 + 0.88 + 0.06 * i)) });
  }
  function stateAt(t) {
    if (t <= T.f0 || t >= T.b1) return { mode: 'mark' };
    if (t >= T.f1 && t < T.b0) return { mode: 'bars' };
    const back = t >= T.b0, s = sAt(t);
    return { mode: 'field', s, f: fieldAt(s, back, t, events()) };
  }
  function light(t, i, t0) {
    const x = (t - t0 - 0.15 * i) / 1.08, ph = ((x % 1) + 1) % 1, u = (ph - 0.26) / 0.2;
    return Math.abs(u) < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * u) : 0;
  }

  // ---------------------------------------------------------------------------------------
  // Renderer (Canvas 2D). The loader is drawn in a 600 x 600 square of the engine's stage,
  // centered on the mark, scaled to the canvas. The mark and the bars at rest are drawn as
  // exact vector shapes; the liquid in between is painted from the distance field.
  const VX = 660, VY = 240, VS = 600;
  const LOOP = T.end;
  const MARK_TF = [9.375, 750 - 9.6 * 9.375, 330 - 9.6 * 9.375]; // official vector -> stage

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [43, 82, 255];
  }
  function barPoly(i, hs) {
    const c = barC(i), hg = barH(i) * hs, top = c[1] - hg / 2;
    const at = (u, v) => [c[0] - W / 2 + K * hg * (0.5 - v) + u * W, top + v * hg];
    return [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
  }
  // Paint a field into an RGBA buffer of size w x h covering the view square.
  function paintField(buf, w, h, f, rgb, lat) {
    const sc = w / VS, px = 1 / sc, CS = 8, NX = Math.ceil(w / CS), NY = Math.ceil(h / CS), step = CS * px;
    const col = (rgb[2] << 16) | (rgb[1] << 8) | rgb[0];
    buf.fill(0);
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) lat[j * (NX + 1) + i] = f(VX + i * step, VY + j * step);
    for (let j = 0; j < NY; j++) {
      const cy = j * CS, y1 = Math.min(cy + CS, h);
      for (let i = 0; i < NX; i++) {
        const cx = i * CS, x1 = Math.min(cx + CS, w), k = j * (NX + 1) + i;
        const d00 = lat[k], d10 = lat[k + 1], d01 = lat[k + NX + 1], d11 = lat[k + NX + 2];
        const lo = Math.min(d00, d10, d01, d11), hi = Math.max(d00, d10, d01, d11), m = Math.max(3, 1.5 * step);
        if (lo > m) continue;
        if (hi < -m) { for (let y = cy; y < y1; y++) { const o = y * w; for (let x = cx; x < x1; x++) buf[o + x] = (0xFF000000 | col) >>> 0; } continue; }
        const dc = f(VX + (cx + CS / 2) * px, VY + (cy + CS / 2) * px);
        const exact = Math.abs(dc - (d00 + d10 + d01 + d11) / 4) > 0.06;
        for (let y = cy; y < y1; y++) {
          const yy = VY + (y + 0.5) * px, v = (y - cy + 0.5) / CS, a0 = d00 + (d01 - d00) * v, a1 = d10 + (d11 - d10) * v, o = y * w;
          for (let x = cx; x < x1; x++) {
            const d = exact ? f(VX + (x + 0.5) * px, yy) : a0 + (a1 - a0) * ((x - cx + 0.5) / CS);
            const a = 0.5 - d / px;
            if (a > 0) buf[o + x] = ((a >= 1 ? 255 : (a * 255) | 0) << 24 | col) >>> 0;
          }
        }
      }
    }
  }

  /** Warm the one-time precomputation (about 0.3-0.6 s) before the first loader appears. */
  export function preload() { levels(); events(); }

  /** The loop length in seconds (8.64 s: 32 steps of 0.27 s, 8 Loader beats). */
  export const LOOP_SECONDS = LOOP;

  /**
   * Mount the liquid loader on a canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {number} [opts.size=160]  CSS px, square. Brand minimum for the animated symbol: 96.
   * @param {string} [opts.color='#2B52FF']  Redrob Blue. Use '#FFFFFF' on dark or brand grounds.
   * @param {boolean} [opts.autoplay=true]
   * @param {'auto'|'always'|'never'} [opts.reducedMotion='auto']  'auto' follows the OS setting.
   * @param {number} [opts.speed=1]  Playback rate; keep 1 for the brand rhythm.
   */
  export function createLiquidLoader(canvas, opts = {}) {
    const o = Object.assign({ size: 160, color: '#2B52FF', autoplay: true, reducedMotion: 'auto', speed: 1 }, opts);
    const ctx = canvas.getContext('2d');
    const mark = new Path2D(D);
    let rgb = hexToRgb(o.color), img = null, buf = null, lat = null, W0 = 0, raf = 0, last = 0, clock = 0, running = false, ready = false;
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reduced = () => o.reducedMotion === 'always' || (o.reducedMotion === 'auto' && !!(mq && mq.matches));

    function resize(size) {
      if (size) o.size = size;
      const dpr = Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
      const px = Math.max(16, Math.round(o.size * dpr));
      canvas.style.width = canvas.style.height = o.size + 'px';
      canvas.width = canvas.height = px;
      W0 = px; img = ctx.createImageData(px, px); buf = new Uint32Array(img.data.buffer);
      lat = new Float32Array((Math.ceil(px / 8) + 1) * (Math.ceil(px / 8) + 1));
      draw(clock);
    }
    function stageTransform() { const sc = W0 / VS; ctx.setTransform(sc, 0, 0, sc, -VX * sc, -VY * sc); }
    function drawMark() {
      stageTransform();
      ctx.transform(MARK_TF[0], 0, 0, MARK_TF[0], MARK_TF[1], MARK_TF[2]);
      ctx.fillStyle = o.color; ctx.fill(mark);
    }
    function drawBars(alpha, hs) {
      stageTransform(); ctx.fillStyle = o.color;
      for (let i = 0; i < 3; i++) {
        const p = barPoly(i, hs[i]);
        ctx.globalAlpha = alpha[i];
        ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(p[k][0], p[k][1]); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    /** Draw the loader at loop time t (seconds). Pure: the same t always gives the same frame. */
    function draw(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W0, W0);
      if (reduced()) {
        // Reduced motion, as the Loader specifies: no travel; the three bars share one slow
        // 1800 ms fade so the surface still reads as working.
        const a = 0.66 + 0.34 * Math.cos(2 * Math.PI * (t % 1.8) / 1.8);
        drawBars([a, a, a], [1, 1, 1]);
        return;
      }
      if (!ready) { drawMark(); return; }
      const tt = ((t % LOOP) + LOOP) % LOOP, st = stateAt(tt), ev = events();
      if (st.mode === 'mark') { drawMark(); return; }
      if (st.mode === 'bars') {
        const env = (1 - Math.pow(1 - seg(tt, T.f1, 3.10), 2)) * (1 - sm(seg(tt, 5.58, T.b0)));
        const al = [0, 1, 2].map((i) => 1 - 0.70 * env * (1 - light(tt, i, T.f1)));
        drawBars(al, [0, 1, 2].map((i) => 1 + landing(tt, ev.land[i])));
        return;
      }
      paintField(buf, W0, W0, st.f, rgb, lat);
      ctx.putImageData(img, 0, 0);
    }
    function tick(now) {
      if (!running) return;
      if (last) clock += Math.min(0.1, (now - last) / 1000) * o.speed;
      last = now; draw(clock); raf = requestAnimationFrame(tick);
    }
    function start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(tick); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    // Pause while the window is hidden; resume where it left off.
    const onVis = () => { if (document.hidden) { if (running) { stop(); wasRunning = true; } } else if (wasRunning) { wasRunning = false; start(); } };
    let wasRunning = false;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    const onMq = () => draw(clock);
    if (mq && mq.addEventListener) mq.addEventListener('change', onMq);

    resize();
    // The precomputation runs once per app; until it is done the static mark shows.
    const warm = () => { preload(); ready = true; draw(clock); };
    if (LV) warm(); else setTimeout(warm, 0);
    if (o.autoplay) start();

    return {
      start, stop, resize,
      /** Draw a fixed moment (seconds into the loop), e.g. for tests or stills. */
      renderAt(t) { stop(); clock = t; if (!ready) { preload(); ready = true; } draw(t); },
      setColor(c) { o.color = c; rgb = hexToRgb(c); draw(clock); },
      get time() { return clock; },
      destroy() {
        stop();
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
        if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq);
      },
    };
  }

  /** Engine access for tests and tooling. */
  export const engine = { T, stateAt, fieldAt, events, light, landing, levels };
