"""Generate scripts/chrisfx_stats.pine from the strategy's shared detection block.

Pine libraries need publishing to be importable, so the detection code is
duplicated instead. It is COPIED mechanically from chrisfx_strategy.pine and
guarded by tests/chris_pine_shared.test.js, so the two cannot drift.
"""
import io

STRAT = r'c:\c_projects\tradingview-mcp-jackson\scripts\chrisfx_strategy.pine'
STATS = r'c:\c_projects\tradingview-mcp-jackson\scripts\chrisfx_stats.pine'

START = '// >>> SHARED DETECTION START'
END = '// <<< SHARED DETECTION END'

s = io.open(STRAT, encoding='utf-8').read()

# insert the sentinels on first run
if START not in s:
    anchor = '// \u2500\u2500\u2500 Helpers \u2500'
    i = s.index(anchor)
    tail_anchor = 'gradeRisk(int g) => g == 0 ? 500.0 : g == 1 ? 300.0 : g == 2 ? 200.0 : 100.0\n'
    j = s.index(tail_anchor) + len(tail_anchor)
    s = s[:i] + START + '\n' + s[i:j] + END + '\n' + s[j:]
    io.open(STRAT, 'w', encoding='utf-8', newline='\n').write(s)
    print('sentinels inserted into the strategy')

block = s[s.index(START):s.index(END) + len(END)] + '\n'

HEAD = '''//@version=6
// ChrisFX Stats - per-setup outcome measurement.
//
// The strategy backtest shares one account across overlapping trades, so
// positions interfere: risk stacks, the broker rejects orders once margin is
// used up, and an opposite-direction setup is skipped entirely because Pine
// nets positions. Run 01 measured 239 of 740 setups for that reason.
//
// This indicator answers the research question instead of simulating an
// account. Every detected setup is tracked independently to its own outcome -
// no shared capital, no margin, no blocking - and both exit models are scored
// on the SAME setups in a single pass. That is what makes the grades and the
// exit models comparable.
//
// Outcome per setup: wait for price to reach the entry, then record whether the
// target or the stop came first. When one bar contains both, the stop is
// recorded (the pessimistic reading) and the ambiguity is counted separately.

indicator("ChrisFX Stats", overlay = true, max_boxes_count = 100, max_labels_count = 100, max_bars_back = 1000)

// --- Detection inputs (mirror rules.json -> chris) ----------------------------
gDet          = "Detection"
liqLookback   = input.int(60,   "Liquidity lookback (bars)",      minval = 5, maxval = 100, group = gDet)
legLookback   = input.int(10,   "Leg window for characteristic 2", minval = 2, maxval = 50,  group = gDet)
fvgSearch     = input.int(5,    "FVG search after grab (bars)",   minval = 1, maxval = 20,  group = gDet)
fvgRequired   = input.bool(true,"Require an FVG over the zone",   group = gDet)
atrLen        = input.int(14,   "ATR length",                     minval = 2, group = gDet)
atrMult       = input.float(1.3,"Impulse: body >= ATR x",         minval = 0, step = 0.1, group = gDet)
bodyRatioMin  = input.float(0.6,"Impulse: body / range >=",       minval = 0, maxval = 1, step = 0.05, group = gDet)
instantMax    = input.int(3,    "Reversal is instant within (bars)", minval = 1, group = gDet)
freshMax      = input.int(12,   "A vs B: level age <= (bars)",    minval = 1, group = gDet)
zoneMaxAge    = input.int(120,  "Zone stays valid for (bars)",    minval = 5, group = gDet)
pendMaxBars   = input.int(500,  "Give up on an untouched entry after (bars)", minval = 1, maxval = 2000, group = gDet)

// grades are all measured; these exist only so detectSetup can be shared verbatim
tradeApp = true
tradeAp  = true
tradeA   = true
tradeB   = true

gMeas         = "Measurement"
rrFixed       = input.float(3.0, "Fixed RR target",  minval = 0.5, step = 0.5, group = gMeas)
rrMin         = input.float(2.0, "Min RR for the liquidity target (else skip)", minval = 0.5, step = 0.5, group = gMeas)
stopModel     = input.string("Beyond zone", "Stop placement",
                 options = ["Beyond zone", "Beyond invalidation"], group = gMeas)
maxHold       = input.int(500,  "Give up on an open setup after (bars)", minval = 10, maxval = 2000, group = gMeas)

gConf         = "Daily confluence"
confTol       = input.float(0.25, "Tolerance, as a share of the zone height", minval = 0, maxval = 2, step = 0.05, group = gConf)
confLb        = input.int(30,   "Daily lookback for fractals / FVGs", minval = 5, maxval = 60, group = gConf)
minConf       = input.int(0,    "Only take setups with at least N factors", minval = 0, maxval = 4, group = gConf)

gPart         = "Partial exit model"
partialAtR    = input.float(1.0,  "Bank a partial at (R)", minval = 0.25, step = 0.25, group = gPart)
partialPct    = input.float(0.5,  "Fraction banked",       minval = 0.1, maxval = 0.9, step = 0.1, group = gPart)
runnerR       = input.float(10.0, "Runner target (R)",     minval = 1.0, step = 1.0, group = gPart)
beAfterPart   = input.bool(true,  "Move the stop to breakeven after the partial", group = gPart)
entryMode     = input.string("Zone edge", "Entry",
                 options = ["Zone edge", "POC (footprint)"], group = gMeas)
fpTicks       = input.int(100,  "Footprint: ticks per row", minval = 1, group = gMeas)
fpVA          = input.int(70,   "Footprint: value area %",  minval = 1, maxval = 100, group = gMeas)

gBias         = "Daily bias (video: HOLISTIC APPROACH NQ)"
useBias       = input.bool(false, "Only trade with the daily bias", group = gBias)
useDiscount   = input.bool(false, "Only trade the discount half of the developing day", group = gBias)
biasMode      = input.string("composite", "Bias rule",
                 options = ["composite", "prevday", "fractal", "swing"], group = gBias)
biasLookback  = input.int(20,   "Daily fractals to scan", minval = 3, maxval = 60, group = gBias)
biasSwingLb   = input.int(10,   "Swing lookback (swing mode)", minval = 2, maxval = 60, group = gBias)
discountPct   = input.float(0.5, "Discount threshold of the daily range", minval = 0.1, maxval = 0.9, step = 0.05, group = gBias)

EVAL_OFFSET = fvgSearch + 1

'''

TAIL = '''
// --- Daily bias --------------------------------------------------------------
// From the video: yesterday's daily candle grabs the liquidity of a prior low
// and closes its BODY back inside the range -> bullish for today, expecting the
// prior high to be taken. Mirrored for bearish. No bias means no trade, and a
// trade against the bias is never taken.
//
// [SOURCE] the shape. [CALIBRATION] which prior low counts: the video points at
// a weekly order block, we use the nearest still-untouched daily fractal, which
// is the same "last liquidity" idea the breaker rule already uses.
dailyBias(int lb, int swingLb, string mode) =>
    int b = 0
    // ta.* must run on every bar, so both are evaluated before any branch
    float sLo = ta.lowest(low, swingLb)[2]
    float sHi = ta.highest(high, swingLb)[2]

    // The everyday rule: classify yesterday against the PREVIOUS DAY's range.
    // "carried" implements the inside bar, where the author keeps yesterday's
    // read rather than going flat.
    var int carried = 0
    bool sweptHigh   = high[1] > high[2]
    bool sweptLow    = low[1]  < low[2]
    bool closedAbove = close[1] > high[2]
    bool closedBelow = close[1] < low[2]
    int  pd   = 0
    bool cont = false
    if not sweptHigh and not sweptLow
        pd := carried
    else if closedAbove
        pd   := 1
        cont := true
    else if closedBelow
        pd   := -1
        cont := true
    else if sweptHigh and sweptLow
        pd := (high[1] - high[2]) >= (low[2] - low[1]) ? -1 : 1
    else if sweptHigh
        pd := -1
    else
        pd := 1
    carried := pd

    if mode == "swing"
        // looser: the extreme of the prior N days rather than an untouched
        // fractal. Fires far more often; same call on the author's own example.
        if low[1] < sLo and close[1] > sLo
            b := 1
        else if high[1] > sHi and close[1] < sHi
            b := -1
    float rl = 1e20
    for f = 2 to lb
        bool isFrac = low[f] < low[f + 1] and low[f] < low[f - 1]
        if isFrac and b == 0 and (mode == "fractal" or mode == "composite")
            if low[1] < low[f] and close[1] > low[f] and rl >= low[f]
                b := 1
        rl := math.min(rl, low[f])
    float rh = -1e20
    for f = 2 to lb
        bool isFrac = high[f] > high[f + 1] and high[f] > high[f - 1]
        if isFrac and b == 0 and (mode == "fractal" or mode == "composite")
            if high[1] > high[f] and close[1] < high[f] and rh <= high[f]
                b := -1
        rh := math.max(rh, high[f])

    // composite: the everyday rule decides, except that a continuation call is
    // overridden by the deeper resting liquidity when the fractal read fires.
    // That is the hierarchy the two videos imply — see docs/CHRISFX.md 5.2.
    int outBias = b
    if mode == "prevday"
        outBias := pd
    else if mode == "composite"
        outBias := (cont and b != 0) ? b : pd
    outBias

bias = request.security(syminfo.tickerid, "D", dailyBias(biasLookback, biasSwingLb, biasMode), lookahead = barmerge.lookahead_off)
// the developing daily candle, which is what premium/discount is measured from
dHi  = request.security(syminfo.tickerid, "D", high, lookahead = barmerge.lookahead_off)
dLo  = request.security(syminfo.tickerid, "D", low,  lookahead = barmerge.lookahead_off)

// --- Daily confluence --------------------------------------------------------
// The thesis under test: a breaker sitting where several daily-timeframe levels
// already agree should perform better than one sitting on its own. Rather than
// assume it and filter, the score is recorded per setup and the results are
// broken down by it, so the gradient is visible.
dFractals(int lb) =>
    float fl = na
    float fh = na
    float rl = 1e20
    float rh = -1e20
    for f = 1 to lb
        if na(fl) and low[f] < low[f + 1] and low[f] < low[f - 1] and rl >= low[f]
            fl := low[f]
        if na(fh) and high[f] > high[f + 1] and high[f] > high[f - 1] and rh <= high[f]
            fh := high[f]
        rl := math.min(rl, low[f])
        rh := math.max(rh, high[f])
    [fl, fh]

dFvg(int lb) =>
    float gt = na
    float gb = na
    for k = 1 to lb
        if na(gt)
            if low[k] > high[k + 2]
                gt := low[k]
                gb := high[k + 2]
            else if high[k] < low[k + 2]
                gt := low[k + 2]
                gb := high[k]
    [gt, gb]

[dFl, dFh] = request.security(syminfo.tickerid, "D", dFractals(confLb), lookahead = barmerge.lookahead_off)
[dGt, dGb] = request.security(syminfo.tickerid, "D", dFvg(confLb),      lookahead = barmerge.lookahead_off)
pdh = request.security(syminfo.tickerid, "D", high[1], lookahead = barmerge.lookahead_off)
pdl = request.security(syminfo.tickerid, "D", low[1],  lookahead = barmerge.lookahead_off)
pwh = request.security(syminfo.tickerid, "W", high[1], lookahead = barmerge.lookahead_off)
pwl = request.security(syminfo.tickerid, "W", low[1],  lookahead = barmerge.lookahead_off)

confScore(float zHi, float zLo) =>
    float pad = (zHi - zLo) * confTol
    float lo  = zLo - pad
    float hi  = zHi + pad
    int n = 0
    if (not na(pdh) and pdh >= lo and pdh <= hi) or (not na(pdl) and pdl >= lo and pdl <= hi)
        n += 1
    if (not na(pwh) and pwh >= lo and pwh <= hi) or (not na(pwl) and pwl >= lo and pwl <= hi)
        n += 1
    if (not na(dFl) and dFl >= lo and dFl <= hi) or (not na(dFh) and dFh >= lo and dFh <= hi)
        n += 1
    if not na(dGt) and not na(dGb) and math.min(hi, dGt) - math.max(lo, dGb) > 0
        n += 1
    n

// --- Footprint entry ---------------------------------------------------------
// request.footprint() is the author's actual execution step: the real POC of the
// breaker candle, not a lower-timeframe reconstruction. It needs Premium or
// Ultimate and returns na on plans below that, and on bars with no footprint
// data - hence the fallback to the zone edge, counted separately.
fp = request.footprint(fpTicks, fpVA)
var array<float> pocHi = array.new_float()
var array<float> pocLo = array.new_float()
pocH = na(fp) ? na : volume_row.up_price(footprint.poc(fp))
pocL = na(fp) ? na : volume_row.down_price(footprint.poc(fp))
array.push(pocHi, nz(pocH, na))
array.push(pocLo, nz(pocL, na))

// --- Shadow simulator --------------------------------------------------------
// One record per setup, resolved independently. Two parallel tracks share the
// entry and the stop and differ only in the target, so the exit models are
// scored on identical fills.
var array<int>   sGrade = array.new_int()
var array<int>   sDir   = array.new_int()
var array<float> sEntry = array.new_float()
var array<float> sStop  = array.new_float()
var array<float> sTgtF  = array.new_float()   // fixed RR target
var array<float> sTgtL  = array.new_float()   // liquidity target, na when skipped
var array<int>   sBar   = array.new_int()
var array<bool>  sOpen  = array.new_bool()
var array<int>   sSess  = array.new_int()
var array<float> sMfe   = array.new_float()   // best excursion so far, in R
var array<bool>  sResF  = array.new_bool()    // fixed-RR track already scored
var array<bool>  sResL  = array.new_bool()    // liquidity track already scored
var array<bool>  sResP  = array.new_bool()    // partial track already scored
var array<bool>  sPart  = array.new_bool()    // partial already banked
var array<int>   sConf  = array.new_int()     // daily confluence score, 0-4

// tallies: [grade] and [grade] x [model]
var array<int> nSetup = array.new_int(4, 0)
var array<int> nFill  = array.new_int(4, 0)
var array<int> winF   = array.new_int(4, 0)
var array<int> lossF  = array.new_int(4, 0)
var array<int> winL   = array.new_int(4, 0)
var array<int> lossL  = array.new_int(4, 0)
var array<int> skipL  = array.new_int(4, 0)
var array<int> winP   = array.new_int(4, 0)
var array<int> lossP  = array.new_int(4, 0)
var array<float> sumRP = array.new_float(4, 0.0)
var array<int>   nSetupC = array.new_int(5, 0)
var array<int>   nFillC  = array.new_int(5, 0)
var array<int>   winC    = array.new_int(5, 0)
var array<int>   lossC   = array.new_int(5, 0)
var array<float> sumRC   = array.new_float(5, 0.0)
var int nSkipConf = 0

var int nRunner  = 0   // partial banked AND the runner target reached
var int nScratch = 0   // partial banked, rest closed at breakeven
var int nFullLoss = 0  // stopped before the partial
var array<float> sumRF = array.new_float(4, 0.0)
var array<float> sumRL = array.new_float(4, 0.0)
var int nAmbig   = 0
var int nNoEntry = 0
var int nOpenEnd = 0
var int nPocUsed  = 0
var int nPocMiss  = 0
var int nSkipBias = 0
var int nSkipPrem = 0

// How far each setup actually ran before its stop would have been hit. This is
// what says whether a fixed 3R target is leaving the tail on the table.
var array<int>   mfeBucket = array.new_int(7, 0)   // >=1,2,3,5,10,15,20 R
var array<float> mfeSum    = array.new_float(1, 0.0)
var int nResolved = 0
var int nSubBar   = 0   // resolved with 1-minute sub-bars
var int nBarOnly  = 0   // fell back to bar-level, stop takes priority

// 1-minute sub-bars of the current chart bar, so the order of stop vs target is
// read rather than assumed. The intrabar budget runs out on older history, and
// those bars fall back to the pessimistic bar-level rule - counted separately.
subH = request.security_lower_tf(syminfo.tickerid, "1", high)
subL = request.security_lower_tf(syminfo.tickerid, "1", low)

// Sessions in exchange time. The claim under test is that a method with no
// time filter leaks its edge in the illiquid overnight hours.
var array<int>   nSetupS = array.new_int(3, 0)
var array<int>   nFillS  = array.new_int(3, 0)
var array<int>   winFS   = array.new_int(3, 0)
var array<int>   lossFS  = array.new_int(3, 0)
var array<float> sumRFS  = array.new_float(3, 0.0)
sessionOf(int t) =>
    int h = hour(t, "America/New_York")
    h >= 3 and h < 8 ? 1 : (h >= 8 and h < 17 ? 2 : 0)
sessionName(int i) => i == 0 ? "Asia/overnight" : i == 1 ? "London" : "New York"

bump(array<int> a, int i) => array.set(a, i, array.get(a, i) + 1)
addf(array<float> a, int i, float v) => array.set(a, i, array.get(a, i) + v)

// --- Resolve the live records ------------------------------------------------
// A record lives until its STOP is hit (or maxHold), even after a target has
// been scored, so the excursion is measured to its true extent. Each exit model
// scores once, on first touch.
bumpMfe(float r) =>
    array.set(mfeSum, 0, array.get(mfeSum, 0) + r)
    if r >= 1.0
        array.set(mfeBucket, 0, array.get(mfeBucket, 0) + 1)
    if r >= 2.0
        array.set(mfeBucket, 1, array.get(mfeBucket, 1) + 1)
    if r >= 3.0
        array.set(mfeBucket, 2, array.get(mfeBucket, 2) + 1)
    if r >= 5.0
        array.set(mfeBucket, 3, array.get(mfeBucket, 3) + 1)
    if r >= 10.0
        array.set(mfeBucket, 4, array.get(mfeBucket, 4) + 1)
    if r >= 15.0
        array.set(mfeBucket, 5, array.get(mfeBucket, 5) + 1)
    if r >= 20.0
        array.set(mfeBucket, 6, array.get(mfeBucket, 6) + 1)

if array.size(sGrade) > 0
    int nSub = array.size(subH)
    for i = array.size(sGrade) - 1 to 0
        int   g  = array.get(sGrade, i)
        int   d  = array.get(sDir, i)
        float en = array.get(sEntry, i)
        float st = array.get(sStop, i)
        float tf = array.get(sTgtF, i)
        float tl = array.get(sTgtL, i)
        int   sv = array.get(sSess, i)
        float rk = math.abs(en - st)
        int   ag = bar_index - array.get(sBar, i)
        bool  op = array.get(sOpen, i)
        bool  rf = array.get(sResF, i)
        bool  rl = array.get(sResL, i)
        bool  rp = array.get(sResP, i)
        bool  pk = array.get(sPart, i)
        int   cf = array.get(sConf, i)
        float mf = array.get(sMfe, i)
        bool  stopped = false
        bool  done = false

        if nSub > 0
            // walk the minute bars in order: the first of stop / target wins
            for j = 0 to nSub - 1
                if not stopped
                    float hh = array.get(subH, j)
                    float ll = array.get(subL, j)
                    if not op
                        if d > 0 ? ll <= en : hh >= en
                            op := true
                            bump(nFill, g)
                            bump(nFillS, sv)
                            bump(nFillC, cf)
                    if op
                        float exc = (d > 0 ? hh - en : en - ll) / rk
                        mf := math.max(mf, exc)
                        bool hs = d > 0 ? ll <= st : hh >= st
                        bool hf = d > 0 ? hh >= tf : ll <= tf
                        bool hl = na(tl) ? false : (d > 0 ? hh >= tl : ll <= tl)
                        if hf and not rf and not hs
                            bump(winF, g)
                            addf(sumRF, g, rrFixed)
                            bump(winFS, sv)
                            addf(sumRFS, sv, rrFixed)
                            bump(winC, cf)
                            addf(sumRC, cf, rrFixed)
                            rf := true
                        if hl and not rl and not hs
                            bump(winL, g)
                            addf(sumRL, g, math.abs(tl - en) / rk)
                            rl := true
                        // partial track: bank part at partialAtR, then the
                        // stop moves to breakeven and the rest runs
                        if not rp
                            float pT = d > 0 ? en + partialAtR * rk : en - partialAtR * rk
                            float rT = d > 0 ? en + runnerR * rk : en - runnerR * rk
                            if not pk
                                if hs
                                    bump(lossP, g)
                                    addf(sumRP, g, -1.0)
                                    nFullLoss += 1
                                    rp := true
                                else if (d > 0 ? hh >= pT : ll <= pT)
                                    pk := true
                            if pk and not rp
                                float be = beAfterPart ? en : st
                                if (d > 0 ? hh >= rT : ll <= rT)
                                    bump(winP, g)
                                    addf(sumRP, g, partialPct * partialAtR + (1 - partialPct) * runnerR)
                                    nRunner += 1
                                    rp := true
                                else if (d > 0 ? ll <= be : hh >= be)
                                    float tot2 = partialPct * partialAtR + (1 - partialPct) * (beAfterPart ? 0.0 : -1.0)
                                    if tot2 > 0
                                        bump(winP, g)
                                    else
                                        bump(lossP, g)
                                    addf(sumRP, g, tot2)
                                    nScratch += 1
                                    rp := true
                        if hs
                            if not rf
                                bump(lossF, g)
                                addf(sumRF, g, -1.0)
                                bump(lossFS, sv)
                                addf(sumRFS, sv, -1.0)
                                bump(lossC, cf)
                                addf(sumRC, cf, -1.0)
                                rf := true
                            if not rl and not na(tl)
                                bump(lossL, g)
                                addf(sumRL, g, -1.0)
                                rl := true
                            stopped := true
            if stopped
                nSubBar += 1
        else
            // no intrabar data: the pessimistic reading, stop takes priority
            if not op
                if d > 0 ? low <= en : high >= en
                    op := true
                    bump(nFill, g)
                    bump(nFillS, sv)
                    bump(nFillC, cf)
            if op
                float exc = (d > 0 ? high - en : en - low) / rk
                mf := math.max(mf, exc)
                bool hs = d > 0 ? low <= st : high >= st
                bool hf = d > 0 ? high >= tf : low <= tf
                bool hl = na(tl) ? false : (d > 0 ? high >= tl : low <= tl)
                if hs and (hf or hl)
                    nAmbig += 1
                if hs or hf
                    if not rf
                        if hs
                            bump(lossF, g)
                            addf(sumRF, g, -1.0)
                            bump(lossFS, sv)
                            addf(sumRFS, sv, -1.0)
                            bump(lossC, cf)
                            addf(sumRC, cf, -1.0)
                        else
                            bump(winF, g)
                            addf(sumRF, g, rrFixed)
                            bump(winFS, sv)
                            addf(sumRFS, sv, rrFixed)
                            bump(winC, cf)
                            addf(sumRC, cf, rrFixed)
                        rf := true
                if not na(tl) and (hs or hl)
                    if not rl
                        if hs
                            bump(lossL, g)
                            addf(sumRL, g, -1.0)
                        else
                            bump(winL, g)
                            addf(sumRL, g, math.abs(tl - en) / rk)
                        rl := true
                if not rp
                    float pT = d > 0 ? en + partialAtR * rk : en - partialAtR * rk
                    float rT = d > 0 ? en + runnerR * rk : en - runnerR * rk
                    if not pk
                        if hs
                            bump(lossP, g)
                            addf(sumRP, g, -1.0)
                            nFullLoss += 1
                            rp := true
                        else if (d > 0 ? high >= pT : low <= pT)
                            pk := true
                    if pk and not rp
                        float be = beAfterPart ? en : st
                        if (d > 0 ? high >= rT : low <= rT)
                            bump(winP, g)
                            addf(sumRP, g, partialPct * partialAtR + (1 - partialPct) * runnerR)
                            nRunner += 1
                            rp := true
                        else if (d > 0 ? low <= be : high >= be)
                            float tot2 = partialPct * partialAtR + (1 - partialPct) * (beAfterPart ? 0.0 : -1.0)
                            if tot2 > 0
                                bump(winP, g)
                            else
                                bump(lossP, g)
                            addf(sumRP, g, tot2)
                            nScratch += 1
                            rp := true
                if hs
                    stopped := true
                    nBarOnly += 1

        if not op and ag > pendMaxBars
            nNoEntry += 1
            done := true
        if stopped
            done := true
        else if op and ag > maxHold
            nOpenEnd += 1
            done := true

        if done and op
            nResolved += 1
            bumpMfe(mf)

        array.set(sOpen, i, op)
        array.set(sResF, i, rf)
        array.set(sResL, i, rl)
        array.set(sResP, i, rp)
        array.set(sPart, i, pk)
        array.set(sMfe,  i, mf)

        if done
            array.remove(sGrade, i)
            array.remove(sDir,   i)
            array.remove(sEntry, i)
            array.remove(sStop,  i)
            array.remove(sTgtF,  i)
            array.remove(sTgtL,  i)
            array.remove(sBar,   i)
            array.remove(sOpen,  i)
            array.remove(sSess,  i)
            array.remove(sMfe,   i)
            array.remove(sResF,  i)
            array.remove(sResL,  i)
            array.remove(sResP,  i)
            array.remove(sPart,  i)
            array.remove(sConf,  i)

// --- Detect and record -------------------------------------------------------
[gL, lvlL, zhL, zlL, invL, bL] = detectSetup(EVAL_OFFSET, true)
[gS, lvlS, zhS, zlS, invS, bS] = detectSetup(EVAL_OFFSET, false)

if barstate.isconfirmed
    int   g      = -1
    bool  isLong = false
    float zHi    = na
    float zLo    = na
    float inval  = na
    int   bOff   = -1
    if gL >= 0 and close > zhL
        g      := gL
        isLong := true
        zHi    := zhL
        zLo    := zlL
        inval  := invL
        bOff   := bL
    else if gS >= 0 and close < zlS
        g      := gS
        isLong := false
        zHi    := zhS
        zLo    := zlS
        inval  := invS
        bOff   := bS

    // the video's two context filters, applied before anything is recorded
    if g >= 0 and useBias
        if (isLong and bias != 1) or (not isLong and bias != -1)
            g := -1
            nSkipBias += 1
    if g >= 0 and useDiscount and not na(dHi) and not na(dLo) and dHi > dLo
        float mid = (zHi + zLo) / 2
        float pos = (mid - dLo) / (dHi - dLo)
        // longs want the discount half, shorts the premium half
        if (isLong and pos > discountPct) or (not isLong and pos < 1 - discountPct)
            g := -1
            nSkipPrem += 1

    int conf = g >= 0 ? confScore(zHi, zLo) : 0
    if g >= 0 and conf < minConf
        g := -1
        nSkipConf += 1

    if g >= 0
        bump(nSetup, g)
        bump(nSetupC, conf)
        int sess = sessionOf(time)
        bump(nSetupS, sess)
        float entry = isLong ? zHi : zLo
        // the author enters from the highest POC on longs and the lowest on
        // shorts; fall back to the zone edge when the footprint has no data
        if entryMode == "POC (footprint)" and bOff > 0
            // the POC of the BREAKER candle, which is bOff bars back - not the
            // grab candle. Reading the wrong bar made 615 of 740 setups miss.
            int   pi = array.size(pocHi) - 1 - bOff
            float ph = pi >= 0 ? array.get(pocHi, pi) : na
            float pl = pi >= 0 ? array.get(pocLo, pi) : na
            float cand = isLong ? ph : pl
            // footprint rows sit on a global price grid, so the edge row can
            // stick out past the candle. Clamp into the zone instead of
            // discarding an otherwise valid POC.
            if not na(cand)
                entry := math.min(math.max(cand, zLo), zHi)
                nPocUsed += 1
            else
                nPocMiss += 1
        float stop = stopModel == "Beyond zone" ? (isLong ? zLo : zHi) : inval
        float risk = isLong ? entry - stop : stop - entry
        if risk > 0
            float tgtF = isLong ? entry + risk * rrFixed : entry - risk * rrFixed
            float tgtL = na
            float liq  = nearestOpposing(isLong, entry)
            if not na(liq)
                float rr = (isLong ? liq - entry : entry - liq) / risk
                if rr >= rrMin
                    tgtL := liq
                else
                    bump(skipL, g)
            else
                bump(skipL, g)

            array.push(sGrade, g)
            array.push(sDir,   isLong ? 1 : -1)
            array.push(sEntry, entry)
            array.push(sStop,  stop)
            array.push(sTgtF,  tgtF)
            array.push(sTgtL,  tgtL)
            array.push(sBar,   bar_index)
            array.push(sOpen,  false)
            array.push(sSess,  sess)
            array.push(sMfe,   0.0)
            array.push(sResF,  false)
            array.push(sResL,  false)
            array.push(sResP,  false)
            array.push(sPart,  false)
            array.push(sConf,  conf)

// --- Results -----------------------------------------------------------------
pct(int w, int l) => (w + l) > 0 ? str.tostring(100.0 * w / (w + l), "#.0") + "%" : "-"
expc(float sum, int w, int l) => (w + l) > 0 ? str.tostring(sum / (w + l), "#.00") : "-"

var table res  = table.new(position.bottom_right, 10, 7, border_width = 1)
var table sess = table.new(position.middle_right, 5, 5, border_width = 1)
var table mfe  = table.new(position.bottom_left, 9, 3, border_width = 1)
var table conf = table.new(position.top_left, 6, 6, border_width = 1)
cell(int c, int r, string txt, color bg) =>
    table.cell(res, c, r, txt, text_color = color.white, bgcolor = bg, text_size = size.small)

if barstate.islastconfirmedhistory or barstate.islast
    color hdr = color.new(color.gray, 10)
    cell(0, 0, "grade",   hdr)
    cell(1, 0, "setups",  hdr)
    cell(2, 0, "filled",  hdr)
    cell(3, 0, "3R win%", hdr)
    cell(4, 0, "3R exp",  hdr)
    cell(5, 0, "liq win%",hdr)
    cell(6, 0, "liq exp", hdr)
    cell(7, 0, "liq skip",hdr)
    cell(8, 0, "part win%", hdr)
    cell(9, 0, "part exp",  hdr)
    for g = 0 to 3
        color bg = color.new(color.gray, 40 + g * 10)
        cell(0, g + 1, gradeName(g),                       bg)
        cell(1, g + 1, str.tostring(array.get(nSetup, g)), bg)
        cell(2, g + 1, str.tostring(array.get(nFill,  g)), bg)
        cell(3, g + 1, pct(array.get(winF, g), array.get(lossF, g)), bg)
        cell(4, g + 1, expc(array.get(sumRF, g), array.get(winF, g), array.get(lossF, g)), bg)
        cell(5, g + 1, pct(array.get(winL, g), array.get(lossL, g)), bg)
        cell(6, g + 1, expc(array.get(sumRL, g), array.get(winL, g), array.get(lossL, g)), bg)
        cell(7, g + 1, str.tostring(array.get(skipL, g)), bg)
        cell(8, g + 1, pct(array.get(winP, g), array.get(lossP, g)), bg)
        cell(9, g + 1, expc(array.get(sumRP, g), array.get(winP, g), array.get(lossP, g)), bg)
    int tw = 0
    int tl = 0
    int twl = 0
    int tll = 0
    float trf = 0.0
    float trl = 0.0
    int ts = 0
    int tf2 = 0
    for g = 0 to 3
        tw  += array.get(winF, g)
        tl  += array.get(lossF, g)
        twl += array.get(winL, g)
        tll += array.get(lossL, g)
        trf += array.get(sumRF, g)
        trl += array.get(sumRL, g)
        ts  += array.get(nSetup, g)
        tf2 += array.get(nFill, g)
    color tot = color.new(color.blue, 30)
    cell(0, 5, "ALL", tot)
    cell(1, 5, str.tostring(ts),  tot)
    cell(2, 5, str.tostring(tf2), tot)
    cell(3, 5, pct(tw, tl),       tot)
    cell(4, 5, expc(trf, tw, tl), tot)
    cell(5, 5, pct(twl, tll),     tot)
    cell(6, 5, expc(trl, twl, tll), tot)
    int twp = 0
    int tlp = 0
    float trp = 0.0
    for g = 0 to 3
        twp += array.get(winP, g)
        tlp += array.get(lossP, g)
        trp += array.get(sumRP, g)
    cell(7, 5, "", tot)
    cell(8, 5, pct(twp, tlp), tot)
    cell(9, 5, expc(trp, twp, tlp), tot)
    color nte = color.new(color.orange, 40)
    cell(0, 6, "no entry / ambig / POC used / skip bias / skip prem", nte)
    cell(1, 6, str.tostring(nNoEntry), nte)
    cell(2, 6, str.tostring(nAmbig),   nte)
    cell(3, 6, str.tostring(nPocUsed), nte)
    cell(4, 6, str.tostring(nSkipBias) + " / " + str.tostring(nSkipPrem), nte)
    // session breakdown - the same fills, sliced by when the setup appeared
    color shdr = color.new(color.gray, 10)
    table.cell(sess, 0, 0, "session",  text_color = color.white, bgcolor = shdr, text_size = size.small)
    table.cell(sess, 1, 0, "setups",   text_color = color.white, bgcolor = shdr, text_size = size.small)
    table.cell(sess, 2, 0, "filled",   text_color = color.white, bgcolor = shdr, text_size = size.small)
    table.cell(sess, 3, 0, "3R win%",  text_color = color.white, bgcolor = shdr, text_size = size.small)
    table.cell(sess, 4, 0, "3R exp",   text_color = color.white, bgcolor = shdr, text_size = size.small)
    for k = 0 to 2
        color sbg = k == 0 ? color.new(color.maroon, 40) : color.new(color.teal, 40)
        table.cell(sess, 0, k + 1, sessionName(k), text_color = color.white, bgcolor = sbg, text_size = size.small)
        table.cell(sess, 1, k + 1, str.tostring(array.get(nSetupS, k)), text_color = color.white, bgcolor = sbg, text_size = size.small)
        table.cell(sess, 2, k + 1, str.tostring(array.get(nFillS, k)),  text_color = color.white, bgcolor = sbg, text_size = size.small)
        table.cell(sess, 3, k + 1, pct(array.get(winFS, k), array.get(lossFS, k)), text_color = color.white, bgcolor = sbg, text_size = size.small)
        table.cell(sess, 4, k + 1, expc(array.get(sumRFS, k), array.get(winFS, k), array.get(lossFS, k)), text_color = color.white, bgcolor = sbg, text_size = size.small)
    // how far the setups actually ran, before the stop would have closed them
    color mh = color.new(color.gray, 10)
    color mv = color.new(color.purple, 40)
    float mTot = math.max(1, nResolved)
    table.cell(mfe, 0, 0, "excursion reached", text_color = color.white, bgcolor = mh, text_size = size.small)
    table.cell(mfe, 0, 1, "share of setups",   text_color = color.white, bgcolor = mv, text_size = size.small)
    for k = 0 to 6
        string lab = k == 0 ? ">= 1R" : k == 1 ? ">= 2R" : k == 2 ? ">= 3R" : k == 3 ? ">= 5R" : k == 4 ? ">= 10R" : k == 5 ? ">= 15R" : ">= 20R"
        table.cell(mfe, k + 1, 0, lab, text_color = color.white, bgcolor = mh, text_size = size.small)
        table.cell(mfe, k + 1, 1, str.tostring(100.0 * array.get(mfeBucket, k) / mTot, "#.0") + "%", text_color = color.white, bgcolor = mv, text_size = size.small)
    table.cell(mfe, 8, 0, "avg MFE", text_color = color.white, bgcolor = mh, text_size = size.small)
    table.cell(mfe, 8, 1, str.tostring(array.get(mfeSum, 0) / mTot, "#.00") + "R", text_color = color.white, bgcolor = mv, text_size = size.small)
    table.cell(mfe, 0, 2, "resolved " + str.tostring(nResolved) + " | 1m-resolved " + str.tostring(nSubBar) + " | bar-only " + str.tostring(nBarOnly),
         text_color = color.white, bgcolor = color.new(color.gray, 40), text_size = size.small)
    cell(5, 6, "still open", nte)
    cell(6, 6, str.tostring(nOpenEnd), nte)
    cell(7, 6, "", nte)
    // does expectancy actually rise with the number of daily factors?
    color ch = color.new(color.gray, 10)
    table.cell(conf, 0, 0, "daily factors", text_color = color.white, bgcolor = ch, text_size = size.small)
    table.cell(conf, 1, 0, "setups",  text_color = color.white, bgcolor = ch, text_size = size.small)
    table.cell(conf, 2, 0, "filled",  text_color = color.white, bgcolor = ch, text_size = size.small)
    table.cell(conf, 3, 0, "win%",    text_color = color.white, bgcolor = ch, text_size = size.small)
    table.cell(conf, 4, 0, "exp",     text_color = color.white, bgcolor = ch, text_size = size.small)
    table.cell(conf, 5, 0, "skipped", text_color = color.white, bgcolor = ch, text_size = size.small)
    for k = 0 to 4
        color cbg = color.new(color.navy, 60 - k * 10)
        table.cell(conf, 0, k + 1, str.tostring(k), text_color = color.white, bgcolor = cbg, text_size = size.small)
        table.cell(conf, 1, k + 1, str.tostring(array.get(nSetupC, k)), text_color = color.white, bgcolor = cbg, text_size = size.small)
        table.cell(conf, 2, k + 1, str.tostring(array.get(nFillC, k)),  text_color = color.white, bgcolor = cbg, text_size = size.small)
        table.cell(conf, 3, k + 1, pct(array.get(winC, k), array.get(lossC, k)), text_color = color.white, bgcolor = cbg, text_size = size.small)
        table.cell(conf, 4, k + 1, expc(array.get(sumRC, k), array.get(winC, k), array.get(lossC, k)), text_color = color.white, bgcolor = cbg, text_size = size.small)
        table.cell(conf, 5, k + 1, k == 0 ? str.tostring(nSkipConf) : "", text_color = color.white, bgcolor = cbg, text_size = size.small)
    cell(8, 6, "runner/scratch/loss", nte)
    cell(9, 6, str.tostring(nRunner) + "/" + str.tostring(nScratch) + "/" + str.tostring(nFullLoss), nte)
'''

io.open(STATS, 'w', encoding='utf-8', newline='\n').write(HEAD + block + TAIL)
print('stats indicator written, lines:', (HEAD + block + TAIL).count(chr(10)))
