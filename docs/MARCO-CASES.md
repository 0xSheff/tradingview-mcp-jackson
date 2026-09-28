# Marco — case log and working notes

Raw material behind `docs/MARCO.md`. That file is the distilled rulebook; this one
keeps the cases that produced or tested a rule, so the reasoning travels with the
repo. Read `docs/MARCO.md` first — the tags and section numbers below refer to it.

## Conventions

- **Case ids.** `D#` = Inter Equity Discord post, `IG#` = Instagram post, `U#` = the
  user's own markup reviewed in a session, `E#` = a YouTube video by Elijah (Ghost
  Capitals, @Ghostcapitals — an IE coach with his own branch in the Inter Equity
  Discord; user, 2026-09-14), `N#` = the trader's Notion course notes of the ICT / SMC
  school (N1–N4, distilled in `docs/ICT-NOTES.md`; a neighbouring method, tagged `[ICT, N#]`,
  never `[SOURCE]`). Author is named when it is not Marco
  (e.g. Elijah, IE moderator) — a moderator's chart is evidence about the method, not
  the author's word; it stays `[SOURCE, D#]` only if Marco's own rule is quoted.
- **Per case:** date/time (ET and Athens), instrument, what the pictures show, what
  our engine read on the same bars (`marco scan`), outcome if known, verdict, and any
  rule candidate. Screenshots are not stored (gitignored) — record the numbers.
- **Statuses.** *Principle* = agreed way of reading, no code needed. *Approved* =
  the user asked for it, not built yet. *Candidate* = proposed by the analyst, not
  confirmed. *Retracted* = an observation withdrawn after review, kept so it is not
  re-raised.
- Every number chosen by us stays `[CALIBRATION]`; never present it as the author's.

## Principles (agreed 2026-09-10)

1. **Nested read, not per-timeframe reads.** W/D = bias, invalidation, big targets in
   weeks — a constraint for everything below. H4 = the *grid*: the nearest untaken
   liquidity each side (with tap counts) plus alive LB zones; scenarios are events at
   the grid edges (run + reclaim / run without reclaim / respect), phrased in H4
   levels. H1 = scenarios *inside* the grid only: the confirmation structure at an
   edge, the local frame between the edges, partials at 1h levels. An H1 scenario
   never leaves the H4 grid; price leaving the grid is an H4 event — the grid is
   redrawn and the H1 scenarios re-derived.
2. **We wait for a run, not a touch.** At a level three things can happen: respect
   (tap count grows, the level becomes a likelier target), run + reclaim (the trap —
   the story flips to the other side, the LB left behind supplies stop and retest),
   run without reclaim (continuation — the level is consumed, the next one is nearest).
   The LB is what a run leaves, not what we wait for. H4 levels are for alerts, not
   orders. `[SOURCE, V1, V3, V6]` There is a fourth, transient state the brief must
   name (user, 2026-09-12; built the same day): **PENDING** — the edge was run but the
   reclaim is not confirmed yet. The level is gone from the map and the LB is not born,
   so a naive grid jumps to the next rung and reads no-man's land in the one moment
   V6 calls the reaction structure. The engine now exposes the unresolved sweep
   (`map.pending`), the grid keeps the edge at the run level with the excursion
   extreme as the kill, "what we wait for" answers *pending* with the bars left
   (`confirm_bars`), A becomes the reclaim itself (entry on the tap of the LB it will
   leave, stop beyond the extreme), B "the run deepens", C the breakdown. A run that
   was reclaimed within the last bars is the *yes* case — direction ready, not
   no-man's land — and the brief already printed it that way in the first live run
   (MNQ, 2026-09-11: "run 1 bar ago … reclaim → bull LB").
3. **Magnets vs pullback origins.** A magnet is where stops cluster: a build-up
   (x2+), a trend line, an HTF candle extreme, the range extreme. A *counter-bias LB*
   is not a magnet — its zone "holds no liquidity" (V1); it is where the false
   reaction is expected and its extreme is what continuation must run. A *swept
   level* is nothing: it explains why the run happened and its run's extreme became
   the LB, but it is neither target nor level. Do not quote an LB zone bottom as
   liquidity.
4. **Box edges** (§2.4): box = sweep extreme ↔ swept level, extended right to the
   first touch; invalidation = price traverses the full height (= trades beyond the
   extreme). Candle bodies and wicks are never mentioned in any IE material seen so
   far. Keep `zoneTopMode = "swept level"`; keep watching.
5. **Count taps, not highs and lows.** The ladder is sorted by distance, the weight is
   by taps: an x1 extreme and an x5 shelf are different things. A shelf of near-equal
   HTF lows is "lows respecting lows" `[SOURCE, V6]` even when no single bar is a
   strict swing — the engine misses those (see *Engine gaps*); the eye must not.
6. **The trap is the run of the origin, not of the pattern low** (agreed 2026-09-19,
   from V8). After a high is run (buyers induced), the level whose run traps them is
   the low *that move came from* — "where did this reaction occur from? Look to the
   left-hand side" — not the leg's structural swing low: requiring the latter is
   "pattern trading". Every internal run induces one side and is "nothing for us
   yet"; the first touch of the origin is not the trap either (the market may "go
   long again … induce buyers once more"), its *run* is. Without an inducement
   sequence inside the pullback the pattern read stands ("we haven't had a trap
   anywhere else"). Against a live story the stricter E1 test stays: a counter-side
   LB that leaves the leg's origin intact is inducement (MNQ 29 317.25).
   `[SOURCE, V8; E1]`
7. **After the trap the other side is off the cards; what is left from the left is a
   future target** (agreed 2026-09-27, from V9). Marco's sequence, bullish side: a high is
   run (buyers induced) → the low that move came from is run → "buyers are trapped … no
   more sells … sells need to be off your cards 100%". A deeper low "from the left" that
   stays intact is neither a requirement for the long nor a reason to keep selling — "this
   long can occur and we can leave this low for the future": it is a *future target*.
   Three states, not one: (1) until the origin is run, the move toward it is the read;
   (2) once it is run — longs only, and with the left low intact as a *continuation* on
   the way back up ("I won't look to catch the bottom"; "not my favorite" trades — waiting
   for the left low, sizing down and sitting out are all his options); (3) if price comes
   back down after the bounce — no short and no chase: "you stay out of this short … and
   you wait for the low to be taken from the left-hand side. Now buys should be on the
   cards". Mirror for "no more buys". The point is frequency, not direction: "we do not
   need to participate in every single move. Quality over quantity … it's not wrong to be
   involved in it, it's lower probable". A reading principle for the analyst and the
   trader, **not a mechanical state**: a lock derived from the engine's trap events showed
   no edge on history and would have sided with the trader's losing longs of W39 (case
   V9). `[SOURCE, V9]`

## Approved changes

All four below were **built on 2026-09-11** (`src/core/marco_grid.js`, wired into
`marco daily`; tests in `tests/marco_grid.test.js`; rules restated in
`docs/MARCO.md` §3.1 and §6). Two things were learned in the build and are
recorded under *Rule candidates* → pocket flag.

- **Daily brief format v4 — what to expect first, the setups below, checked against the
  journal** (trader, 2026-09-27 evening, after the V9 work: "щодо m15 я б не хотів дуже сильно
  заглиблюватись в аналіз поточного ринку … проаналізуєш біас на тиждень і на день і даси
  бриф у форматі «чого сьогодні чекати», але виконання в моменті лишаємо для мене"; on the
  worked example: "формат підходить, але сетапи також потрібні — можна давати рекомендовані
  сетапи нижче основного брифу, але треба звірятись з уже існуючими, щоб не дублюватись";
  **built the same evening** — `expectBlock`, `notRecommended`, `matchPlanSetup`,
  `normalizePlan`, `renderDailyMarkdown` in `src/core/marco_grid.js`, `--plan` and `--format` on
  `marco daily`; tests in `tests/marco_grid.test.js`). Supersedes the v3 *layout* as the default;
  the v3 grammar of a setup and every rule of v3.1 stay.
  1. **The main brief carries no execution.** Per instrument four lines: *Тиждень* (the story's
     modes on W and D, then both direction layers as a fact and how they sit against the
     bias), *Сьогодні* (the last daily bar against the one before it, the state word and the
     timeframe that gave it, the H4 leg), *Чекаємо* (events, at W / D / 4h levels only: the
     correction day's PDH / PDL or the daily kill, the bias edge — run, close back or the trade
     through the zone — the counter edge, a pending weekly decision, the invalidation),
     *Рівні* (one line, seven at most, high to low, levels within the 4h `eq_tolerance` merged).
     No entry, stop, dollar figure, RR or size above the setups section; no 15m / 5m structure
     anywhere in it.
  2. **A zone is quoted by its extreme**, not by the buffered stop: "4h-трейд під 4273.1", as
     §2.3 kills it.
  3. **The setups come after all instruments**, in the journal's grammar (v3), and are checked
     against the plan whoever runs the brief hands over (`--plan <file>`: the `plan_get_active`
     object; only its structured fields are read — instrument, direction, setup type, key
     levels, targets — the journal's text never enters the brief). A setup is *covered* when
     the plan has the same instrument and side and one of the engine's key levels sits inside
     the span of the plan's key levels, the 4h `eq_tolerance` either way `[CALIBRATION]`. A
     covered setup is one line ("у плані: … — engine бачить те саме"); a plan setup the engine
     no longer names says so.
  4. **Outside the plan, "recommended" has a definition** — the strategy's own numbers: reachable
     today, inside the cap, min RR (the planned one, or the floor a cap-sized stop gives when
     the stop is only known after the run), and no counter-trend setup while the bias-side trap
     is in force (Principle 7). What fails is still named, in one line, with the reason — the
     trader may take it knowingly. First live case, W40 Monday: the three with-bias setups were
     all in the plan; the three counter-trend candidates failed (MNQ: RR 1 at a cap-sized stop;
     MGC and 6E: against the trap in force) — nothing new to add.
  5. `marco daily --format v3` prints the former layout; the JSON carries `results[].expect` and
     `in_plan` on every setup.
  Not built: the journal is not read by the CLI (no way in from there) — the plan file is
  written by the assistant from `plan_get_active` before the run.
- **A zone traded through — no direction, the PENDING family** (analyst's proposal after the
  V9 measurement, the trader 2026-09-27: "ок, згоден, давай зробимо"; **built the same day**,
  engine only; rule in `docs/MARCO.md` §3, the table of the measurement in *Rule candidates*).
  `storyRead`: the branch that read "the trap failed; treat as continuation" is now mode
  `zone_run`, direction 0 — "the … LB a–b was traded through N bars ago — the run deepened, no
  direction from it: a close back above L makes the new LB (extreme E, k of `confirm_bars`
  bars left), a miss is the breakdown", or "wait for the next run and its close back" when
  the sweep the kill opened is already resolved; new fields `lean` and `killed`. Kept on
  purpose: the breakdown read and its direction; `resolveBias` on `lean`, so `pullback` /
  `aligned` come out as before — checked on 4704 cuts of 240 / 60 (1088 of them with a zone
  run on either timeframe): no difference in bias, regime, targets, invalidation or note.
  What changes for the trader: the 1h line of the daily brief ("зону пройдено, напрямку
  немає · LB …: закриття назад над L → новий LB (лишилось k з 3 барів), без нього →
  breakdown" instead of "NOISE · continuation вниз проти біасу"), the mode word in the Bias
  and Now lines, and a bias-less `marco scan`, which prints no triggers out of this state. On
  the V9 bars: gold 1h 14 Sep 19:00 and NQ 2h 11 and 16 Sep read `zone_run`, gold 1h 15 Sep
  (the breakdown of 4282.4) still `down_continuation`. Pine untouched — it has no story
  modes, its Auto bias follows the last clean LB created. Tests 94 / 94 (`npm run
  test:marco`): the old "an invalidated LB reads as a failed trap" rewritten, four added.
- **HTF direction read — targets from the map, heading from acceptance** (trader, 2026-09-26,
  after U4; **not built**). The trader's decisions, in his words where they are rules:
  1. **Significant levels for the direction read live on HTF only — D, W, M**: "any 3-bar
     fractal there is a significant level" (one bar each side, the U4 candidate *HTF extremes*);
     MTF and below keep `pivot_len` 3.
  2. **Acceptance ("закріплення") = the close of the D / W bar beyond the level.** A close
     beyond it toward the target says the market is moving toward the target; failing to
     close beyond it toward the target says a correction, or a move to the nearest opposite
     targets, is possible. "Weekly bias up, but the daily bar could not close above an
     intermediate level — we expect a correction."
  3. **Targets ≠ direction** (U4 correction): merges, build-ups and pockets stay on the map
     and never oblige the direction read.
  4. **ICT add-ons, optional and switchable** (N1–N4): CRT on D and W (M is too large for the
     planning horizon), order flow on HTF and on the H4 toward *our* targets, the FVG edge
     nearest to price (third candle's low after an up-move, high after a down-move) as a level.
     "Not rigid dogmas and no false confidence — improve what exists, do not overcomplicate."
  **Data check before the build (analyst, 2026-09-26; `docs/ICT-NOTES.md` → Data check):**
  on W/D of 6E / MNQ / MES / MGC, acceptance at a 3-bar fractal reached the next fractal before
  a close back 49% vs 36% (W, n=68) and 46% vs 35% (D, n=80) against a position-matched
  baseline; a run without a close beyond gave nothing about the opposite side (27–29% vs
  28–31%); a lost acceptance leaned that way weakly (37–40% vs 30–35%, n=35–42). CRT and the
  previous-candle reversal / continuation models matched their baselines (CRT candle 3: 36%
  vs 35% W, 32% vs 32% D). U4 replay of the rule on 6E: W accepted over 1.1705 in W34, lost it
  at the W35 close (28 Aug) — no W heading since; D: Wed 16 Sep closed under 1.15645
  (accepted down), again Tue 22 Sep under 1.1495; Wed 23 / Thu 24 Sep ran 1.14175 / 1.1404
  without a close under (stalled at the target). The W39 weekend therefore read "W heading off
  since 28 Aug, D heading down since 16 Sep → 1.14175 → 1.1404", the trader's read; the three
  22 Sep longs sat against the D heading.
  **Proposed integration (analyst, pending the trader's OK):**
  - *Map* (existing) keeps every target on both sides; adds HTF 3-bar fractals (D/W/M), the
    previous D/W candle extremes (V7's HTF candle highs) and, switchable, FVG edges — as
    targets / rungs only, never stop anchors (no LB, no stop).
  - *Direction* (new core, the trader's rule, always on): per W and D a state word with its
    evidence (bar, level, closes). **Superseded the same day by the two-bar decision** (below):
    the run bar is provisional, the next close decides — continuation (beyond·beyond,
    back·beyond), failed breakout = heading to the other side (beyond·back), held sweep =
    pause (back·back); the v0.1 states `stalled` / `lost` are replaced. A turn needs an
    acceptance on the other side, a failed breakout, or a qualified Marco trap (§3) — never a
    held sweep alone (no edge in the data).
  - *Leg / order flow* = the U2 MTF leg layer built with the same acceptance machine on D and
    H4 (H4 swings `pivot_len` 3): consecutive acceptances toward the target = the flow (HRLR),
    an acceptance against it beyond the leg's last swing = the MSS / turn.
  - *Entries* unchanged (LB, trap, the U3 LTF build-up), ranked by the heading.
  - *Guards*: states print their evidence, no scores; W and D disagreeing print "mixed" and the
    close that would resolve it; v1 only labels and orders scenarios (with / against the
    heading), blocks nothing; the journal stores the state per plan, gating is decided on the
    journal's numbers later.
  - *Not taken from N1–N4*: CRT and the previous-candle models as direction signals (no edge
    in the data; their levels stay on the map), PO3 / AMD and the opens (the 10 a.m. H4 model
    covers timing), OB / STB / BTS (the LB, V8 origin and 4-candle model cover them).
  - *Could retire*: the divergence rule (§3.1), a stand-in for "is the market heading to the
    target now" — the trader's call. **The Mon–Tue window stays** (trader, 2026-09-26: "we do
    not drop it, we validate it — probability"); first measurement in `docs/ICT-NOTES.md`.
  **Trader's clarification (2026-09-26):** CRT was an example of HTF price reacting at the
  previous bar's high / low — a bar-by-bar read, finer than the 3-bar fractal. Simplified to
  "today's / this week's close against the previous bar's high / low" and read as order flow,
  it is **one factor, never standalone**, of the answer "are we heading to the bias targets
  now, or correcting?" ("today ran yesterday's high and closed under it — tomorrow likely
  down — together with the rest of the system, not in a vacuum"). The main weak spot is named:
  targets and bias exist; the middle part — is the market moving with the bias right now — is
  what the system lacks. In-context numbers: `docs/ICT-NOTES.md` → *Second pass*.
  **Two-bar decision on HTF (trader, 2026-09-26, before the build):** "the run of 1.17050 took
  two weekly bars — one up, one down — and that also counts as acceptance, here under 1.17050.
  We should not limit acceptance to one bar, but three bars is already a lot for HTF. If the
  first bar broke the level and the second did not close back, the level is simply
  invalidated — we give up to two bars for acceptance beyond the level." Formalized (analyst,
  `docs/MARCO-DIRECTION.md` §9.2): the run bar gives a provisional read; **the next bar's close
  decides** — beyond·beyond = level invalidated (continuation), back·beyond = late acceptance
  (continuation), beyond·back = failed breakout = acceptance on the original side (the trap;
  its LB = run extreme ↔ L), back·back = the sweep held (pause). After the decision the level
  is off the direction map; a later close back through an invalidated level is no event (the
  v0.1 "lost" state is dropped). Data (`scripts/research/direction/heading4.mjs`, same events
  both ways, position-matched): beyond·beyond 66% vs 44% (W, n=62) / 54% vs 44% (D, n=69);
  back·beyond 63% vs 38% (51) / 50% vs 38% (42); beyond·back → the opposite fractal before a
  new close beyond L 46% vs 37% (50) / 54% vs 36% (39) — with a touch of the run extreme as the
  stop instead, 51% vs 50% / 54% vs 43%; back·back 45% vs 45% / 46% vs 47% (nothing). One-bar
  reading on the same events: acceptance 52% vs 36% / 46% vs 35%, close back 30% vs 28% /
  33% vs 31%. U4 under the two-bar rule (`u4walk2.mjs`): W ↓ from the W35 close (failed
  breakout of 1.1705); D ↓ from Fri 4 Sep (failed breakout of 1.1671: Thu close 1.16785, Fri
  1.16545), Wed 9 Sep 1.1685 a held sweep (pause), Mon 14 Sep late acceptance under 1.16125,
  1.15645 / 1.1495 invalidated down 17 / 23 Sep, 1.14175 late acceptance 24 Sep, 1.1404 a held
  sweep 25 Sep. The W39 weekend therefore reads "W ↓ since 28 Aug, D ↓ since 4 Sep → 1.14175 →
  1.1404" — W and D agree, the trader's read.
  **Robustness correction (analyst, 2026-09-26):** re-run with the two-bar W heading (always
  defined, 1152 days) and split by heading age, the directional rows of the in-context table
  fell to base (correction day → next day toward the target 53% vs 52%, +3 days 55% vs 53%);
  the first-pass 62% / 63% depended on the heading definition and is withdrawn. What held: after
  a correction day its extreme is run the next day in 62–64%, then closes back toward the
  target in 23% (vs 13–14%) or beyond it in 30–31% (vs 22–24%) — the bar-by-bar read locates
  tomorrow's battleground, not its outcome. Mon–Tue on the two-bar proxy (n = 237): the
  counter-heading extreme on Mon/Tue 41%, the with-heading one 41%.
  **Built 2026-09-26** (the trader: "так, згоден … починаємо"; rules in `docs/MARCO.md` §3.2):
  `src/core/marco_direction.js` — `directionRead` (two-close decisions on D/W 3-bar fractals),
  a **lost** state added in the build (two closes back through the heading's own level switch
  it off — MNQ W ↓ 24.07 under 28 817.25 would otherwise have held through the +2000-point
  August rally with no W fractal to decide on), `composeDirection` (with / correction / mixed /
  weekly only / daily only / none; W dated at the Friday close), `barRead` (the last D bar vs
  the previous, the correction-day battleground), `splitFormingHtf` (D/W closed by the session
  close). Wired: `marco weekly` (Direction-now lines, a line when the heading is against the
  story), `marco daily` (fetches W/D, **Напрямок** block, W/D column, a `напрямок:` label on
  every journal setup incl. the Mon–Tue counter-trend one), `marco scan` (`direction` on D/W,
  forming D/W bars cut). Tests `tests/marco_direction.test.js` (12, real 6E/MNQ bars).
  Live check 2026-09-26 on the chart: 6E "W↓ D↓, against the story's long", MGC "W↓ only,
  against the story's long", MNQ "D↓ only", MES "none". **Not built:** the correction-day
  battleground as its own scenario in `dailyScenarios` (printed in the block only), the H4
  leg (U2) on the same machine (needs an H4 measurement first), the ICT add-ons (previous-bar
  levels, FVG edges), a Pine counterpart. **Calibration question for the trader:** closes are
  literal (no tolerance) — 6E D lost its heading on 8–9 Sep by closes 0.5 / 1 pip over 1.1671.
  **Trader's answers (2026-09-26, after the build):** (1) closes stay literal — "не треба
  окремий допуск"; (2) the lost state as built — yes; (3) Pine into the current script, no
  backup ("TradingView зберігає історію версій") — pushed: "Liq blocks" 12.0 → 14.0 (two saves
  of one source), the TV source verified identical to `scripts/marco_liquidity_blocks.pine`
  before (= repo HEAD) and after (= v12); on 6E W the 1.1404 level now draws as a build-up box;
  (4) the `напрямок:` line in the journal setups — yes.
  **Second build, 2026-09-26 ("реалізуємо що лишилось"):** (a) the **battleground setup** —
  a correction day with the heading on the bias side makes its extreme a sweep-trigger setup
  of its own (`kind: "battleground"`) or a `поле бою:` note on the setup already at that level;
  (b) the **H4 leg** — `directionRead` on H4 swings (pivot 3, two closes), one descriptive
  line with its relation to the heading; measured first (`scripts/research/direction/
  h4measure.mjs`, 3300 H4 bars × 4 contracts, Aug 2024 – Sep 2026): one-close acceptance on
  H4 continues 44% vs 35%, two closes 44% vs 41%; an H4 heading with the D heading ran on
  52–56% of the time over the next 6–12 H4 bars, against it 46–55% (noise), the same for one
  or two closes — two chosen because one close left the 6E leg of 16–23 Sep without any
  heading; (c) **reference levels** — PDH/PDL and PWH/PWL on a `Довідкові:` line (on), the
  nearest unfilled FVG edge on D/H4 (off: `fvgmeasure.mjs` found it behaves like any level at
  the same distance — touched 82% vs 76% D, 88% vs 87% H4; the touching bar closed back beyond
  it 52–53% vs 51%). Tests 86/86 (marco). Live daily 2026-09-26: 6E H4 leg ↓ with the heading,
  MNQ battleground 30998.5 printed without a setup (heading D↓ against the long bias).

- **Intraday brief format v3.1 — meaning first, levels after** (trader, 2026-09-24 ~09:30,
  on the first v3 brief with the hand MTF lines: "перерахування — списком з булітами, не
  текстом"; "дуже важко читати, коли текст перемішаний з цифрами — спочатку суть, далі окремо
  рівні, компактно і якомога менше, тільки ті, що реально потрібні; для LB достатньо однієї
  ціни — рівня екстремуму, блок показує індикатор"; "історія подій видна на графіку —
  описувати поточний стан і чого чекаємо, без зайвого". **The wording below is the working
  draft; the engine build (`renderDailyMarkdown` in `src/core/marco_grid.js`) follows the
  trader's OK on the worked example — the MTF lines in `briefs/daily/2026-09-24.md` and the
  MNQ block shown in chat the same morning.**) Rules, on top of v3:
  1. every prose block (Bias, MTF, Now, the closing lines) = one or two sentences of meaning
     with no prices in them, then a `Рівні:` line;
  2. ≤ 7 levels per instrument outside the setups — the two grid edges, the run extreme
     (= stop anchor), ≤ 3 targets, the HTF zone / next edge, the invalidation; every other
     level lives only in the `Alerts:` line;
  3. one price per LB — its extreme (the stop side); the trigger is already named as the
     grid edge and the "Liq blocks" indicator draws the box;
  4. no event history: the `З останньої перевірки` line goes; `Now` = the state word +
     what we wait for, as `Чекаємо:` bullets (the exact event: TF, level, close time); the
     forming-bar note stays as "бар … відкритий — не рахується" without H / L / now;
  5. any enumeration of 2+ items (instruments, scenarios, conditions, levels) is a bulleted
     list, never a sentence joined with "·";
  6. the setups keep the journal grammar (structured rows), with LB zones shortened to one
     price; the JSON setup objects are unchanged.
  7. bar times name the bar's **open** only — "у барі 17:00", the time TradingView's date
     axis shows — never the range "17:00–21:00"; close times stay only for events that happen
     at a close ("4h-закриття о 21:00", "до 21:00") (trader, 2026-09-24 ~10:00; `briefClock`
     in `src/core/marco_grid.js` is where the label is built).
- **Intraday brief format v3 — journal setups, in Ukrainian** (trader, 2026-09-23 evening:
  "the result in the format of setups, exactly as we add them to the journal, but in
  Ukrainian — much clearer, and I can go through the setups and pick which ones to add";
  built the same day — `dailySetups` + `renderDailyMarkdown` in `src/core/marco_grid.js`,
  tests *dailySetups* / *renderDailyMarkdown* in `tests/marco_grid.test.js`). Supersedes
  the v2/v2.1 *layout* below; the v2 grammar (`entry when`, event-named scenarios, no
  "don't" lists, the two session windows) and the v2.1 refinements (summary table first,
  reachable and inside-the-cap first, tick prices, wall-clock bar times, an `Alerts:`
  line) all carry over. Per instrument: **Bias · Now · Grid**, then **Сетапи** — every
  scenario rendered as one journal setup: a title line with the structured fields
  (`SYM · long/short · setup_type · K <key_levels> · T <targets ≤ 3> · R <planned_r> ·
  size 1`) and a fenced `setup_description` in the journal-weekly-plan grammar (header
  `<W mode>/<regime> · inval <level> Wclose` · `entry when:` · `K1/K2` rows · `BE:` ·
  `deeper run:` · `breakdown:` · `aggressive tap … skip` · `global:`), ranked with the
  ones a trader can act on today first and "головний" on the first of them; then one
  closing line (*все інше = чекаємо*, partials, the TOP/counter edge), the 1h line, the
  gate candle, the alerts. Mapping (journal-weekly-plan rules): the reclaim of a PENDING
  edge, the run of the bias edge / the nearest H4 rung and the next edge beyond the grid
  → `sweep-trigger`; the bias-side LB tap (the refined rung when the 4h anchor is over
  the cap) → `lb-zone-tap`; a tap and a run in ONE zone → one setup with K1 (tap) and K2
  (run + reclaim); an inducement tap → an `aggressive tap … skip` line, never a setup;
  the counter edge → `early-week-counter-trend` on Mon–Tue only, otherwise the TOP line;
  `targets` = the rung's own T1, then the counter rungs, the counter edge and what lies
  beyond it (max 3, the global target never); `BE:` = T1; `planned_r` = K1's RR from
  the tick-rounded stop; every `entry when` carries London 10:00–18:30 · NY 16:30–23:00
  and the gate. `runMarcoDaily` stores the same objects in the JSON as
  `results[].setups` (the `plan_add_setup` fields + the UA `setup_description`), so
  picking a setup for the journal is one call. Language: Ukrainian with the method terms
  in English (trap, run, tap, LB, reclaim = "закриття назад"), per the trader's
  glossary — this closes the v2.1 "EN vs UA" question. **Journal = the same text in
  English** (trader, 2026-09-23 evening): a picked setup goes to `plan_add_setup` /
  `plan_add_addendum` with its structured fields as they are and the `setup_description`
  translated line by line, nothing added or dropped; `planned_size: 1` is the working
  assumption the trader confirms on adding.
  **Closed bars only** (same day): the engine gap below — the forming 4h bar read as a
  reclaim — is fixed by `splitForming`: every timeframe's forming bar is cut before
  `analyzeMarco` / `h4Grid`, travels as `exec_bars.forming` and prints in the Now
  block as "бар … ще відкритий: H / L / зараз — до закриття не рахується"; the bar clock
  is anchored on `exec_bars.last_closed_time` instead of the wall clock.
- **Intraday brief format v2 — `entry when` grammar** (user, 2026-09-22, after four
  losing trades of which two were entered while the 4h was PENDING; worked example
  `briefs/daily/2026-09-22.v2.md`; built the same day — `renderDailyMarkdown`, the
  `journal-weekly-plan` / `journal-midweek-addendum` templates). Supersedes the
  2026-09-10 layout below. The trader's words: "less noise, more concentrated information
  on the scenarios on the table; `entry when` instead of `no-entry` — a negative
  connotation reads harder, during the live market there is no time to untangle it".
  Per instrument, five blocks, one screen:
  1. **Bias** — header `SYM · LONG/SHORT · price · inval <rule level>`; one line W/D
     mode, regime, week targets, global target (≈Nw);
  2. **Now** — one state word **WAITING / PENDING / VALID / DONE**, the event that made
     it (TF, level, time), the trap pointer, and *the exact event that changes the state*
     (which TF must close where, when the bars close). Replaces "since the last check"
     and "what we wait for";
  3. **Grid** — the H4 edges and rungs, current levels only (unchanged), plus *beyond the
     grid*;
  4. **Scenarios** — numbered by priority, **named by the event** (RECLAIM, DEEPER RUN,
     BREAKDOWN, TOP, BUILD-UP RUN, AGGRESSIVE TAP), never lettered. Each one is
     `entry when:` (a positive condition: TF + level + time window, the 1h condition
     folded in) → `entry · stop · $ · RR · T1 · T2 · BE` → `→ next:` (the scenario it
     turns into when the condition fails). A grid break is `state when:`, not a trade.
     **No "don't" lists**: what is allowed is listed exhaustively and one closing line
     says *everything else = wait*;
  5. **Windows** — the sessions an entry is open in, as local time ranges ("London
     10:00–18:30 · NY 16:30–23:00"; the gate 17:00–21:00), never "no entry at 16:45".
     `[CALIBRATION, trader 2026-09-22]` **Europe + US sessions, not NY only**: Marco
     trades NY (V5) but keeps alerts and reads a level hit at another hour with the
     full picture; the trader wants the system exercised, so London and NY are both
     windows and a level hit outside them is an alert to read with the grid, not an
     entry by itself. A London event still leaves the entry to the LB it prints, on
     the same TF conditions — the session is a window, not a signal.
  The journal `setup_description` uses the same grammar: header · `entry when:` ·
  K-lines · `BE:` · `deeper run:` · `breakdown:` · `aggressive tap … skip` · `global:` ·
  `replaces:`. The labels `no-entry:` and `timing:` are retired into `entry when:`.
  Refinements come pointwise in use (trader, 2026-09-22).
  **v2.1 (trader, 2026-09-23, built the same day):** a summary table first (state + the
  main scenario per instrument); the sessions, the gate and the next 4h closes stated once
  at the top; scenarios a trader can act on today first — within `3 × 4h ATR` of the price
  `[CALIBRATION]` and inside the $ cap — with "(main)" on the first of them, the rest
  marked "not today"; an over-cap zone headlines its refined rung; prices on the contract
  tick (`contracts.json`), $ risk from the rounded stop; wall-clock bar times instead of
  "N bars ago"; the 1h reduced to one line (mode, alignment, frame); TOP says
  "partial" when the counter-trend window is closed; an `Alerts:` line per instrument.
  Open: the language of the engine render (EN now, the hand brief is UA).
- **Scenario horizon — levels from 4h/D, stops from 15m/1h** (trader, 2026-09-23 09:40,
  on the first v2.1 brief: "the grid is too narrow — the position horizon is a day or two;
  4351.9 / 4346.2 → 4384.4 is a couple of hours, not a couple of days"; built the same
  day in `dailyScenarios`, test *horizon*). A scenario is a 4h/1h level or zone — the
  H4 edge, the nearest bias-side H4 rung, a 4h/1h trigger; its targets are 4h/D
  liquidity. 15m/5m structure only refines the stop inside that level (the V6
  refinement) and gives partials and alerts; it is never the scenario. An H4 anchor
  over the $ cap does not make a sweep scenario unactionable — the stop comes from the
  1h/15m LB the reclaim leaves. Open for the weekend review: the `BE:` line on a 15m
  level (22.09 MGC 4386.4) moves the stop into the zone the day-two scenario expects to
  be run — BE on the first 4h target-side level instead?
- **Intraday brief format v1** (user, 2026-09-10; built — `renderDailyMarkdown`,
  `marco daily --compact`, `briefs/daily/<date>.md`; **superseded by v2 above on
  2026-09-22** — kept for the history of the sections). Per instrument, in this order:
  1. global reminder — W/D bias, big targets (≈Nw), invalidation, one line;
  2. H4 grid — **current levels only** (user, 2026-09-11, after the first rendered
     brief): the lower edge, the upper edge, and the ladder between them — one line
     per level with its tap count or LB zone, nothing else. Two separate short blocks
     carry the rest: *since the last check* (which edge was run, when, the LB it left,
     where price went) and *beyond the grid* (the next rung past each edge — what the
     grid redraws to, and where continuation goes after the upper edge). "Levels are
     for alerts, not orders";
  3. "what we wait for" — has a bias-side level been run and reclaimed? yes → trigger,
     no → no-man's land;
  4. scenarios A/B/C/D with ready answers — entry zone, stop, first rung, RR, what
     kills it, what we do *not* do (no counter-bias LB entries, nothing mid-range); a
     grid break is written as "grid redraws", not as a trade scenario;
  5. 1h conditions per scenario — what the 1h must print (sweep + reclaim, the 1h LB
     for the tighter stop), the 1h local frame, partials at 1h levels;
  6. timing — NY session only (V5), the 10 a.m. H4 gate.
  Target: `marco daily` renders this; engine trigger rows map into the scenarios.
- **Clip the LTF layer to the H4 grid** (user, 2026-09-10; sharpened from "print the
  HTF range above the LTF setups"; built — `h4Grid` + `clipToGrid`). LTF targets beyond an H4 edge are replaced by the
  edge; an LTF story whose draw lies outside the grid against the bias is labelled
  *noise* (D1's "trap city"), not merely "against"; the LTF local frame is always the
  sub-range between the H4 edges.
- **Contract roll detection** (user, 2026-09-11; built — `detectRoll`, `shiftPrices`,
  `basisBars`, `--shift SYMBOL=offset`; `quote_get` with a foreign symbol now errors
  instead of mislabelling the chart's series). On 2026-09-11 `6E1!` rolled from
  6EU6 to 6EZ6 overnight and TradingView back-adjusted the whole series by +40.5
  pips: every level the engine printed moved, while the W37 brief's targets,
  invalidation and HTF zones — and the journal's locked 6E plan — stayed in
  September prices. The daily run must catch this itself: every brief (weekly and
  daily) records its price basis (front contract, plus the OHLC of its last closed
  bar per timeframe); the next run re-reads those same bars from the chart and, if
  every shared bar differs by one constant, treats it as a roll — shifts the weekly
  layer's levels by the offset, prints a roll note at the top of the instrument
  block (old → new for the user's lines and the journal plan), and stamps the new
  basis. A non-constant difference is a data problem, not a roll — say so and stop.
  Tooling bug found on the way: `quote_get` ignores its `symbol` parameter and
  returns the chart symbol (6EU2026 and 6EZ2026 came back identical) — fix it, and
  do not use it to detect the front contract until then.
- **E1 — left liquidity, deepened runs, the invalid-LB chain** (user, 2026-09-14;
  **built the same day** — engine + Pine v10 + `flagPocket` / `clipToGrid` /
  `dailyScenarios`; tests in `tests/marco.test.js` (three hand fixtures + the MNQ
  Sep-2 real bars) and `tests/marco_grid.test.js`; rules restated in `docs/MARCO.md`
  §2.3, §3, §3.1, §6, §7). The build decisions are recorded under the E1 verdict.
  Side effects seen in the suite: the 6B fixture's Sep-4 4h bear LB 1.3548–1.3549
  reads *invalid* under the intact Aug-31 high 1.3566 x2 (the D1 line), so the
  week opens with no local 4h story and the run of 1.3566 as the trigger — the
  intraweek test was updated to say so; the weekly 6B map no longer prints the
  Mar–Jun cascade of ever-lower LBs (each a "reclaim" of the previous extreme): a
  deepened run that is not reclaimed is a breakdown. Not re-uploaded to
  TradingView yet — the desktop app was not running; `pine check` and save the
  next time it is (back up the TV copy first).

- **V8 — the reaction origin and the trap pointer** (user, 2026-09-19; **built the
  same day** — engine + Pine v11 + tests; rules restated in `docs/MARCO.md` §2.2,
  §3, §3.1, §6, §7; the case is *V8* below). The map keeps a swing that flips on any
  consumed level; the extreme of the swing an inducing move came from is that
  move's origin (`buyers_induced` / `sellers_induced`, `origin_run`). At an LB's
  birth: build-up beyond → invalid (E1); else unrefined, naming the nearest x1 swing
  when born against a live story (E1) or the intact origin when born with it / with
  none (V8), falling back to the swing; nothing → clean. **An unrefined LB now sets
  the story** unless an opposing anchor is alive (then inducement) — the E1
  `UNREFINED_LEFT` expectation flipped from "no flip" to `buy_story`; the MNQ Sep 2
  10:00 read is unchanged. `trap` marks an LB whose run took an intact origin. The
  intact origin per side is the trap pointer (`map.origins`, `trap_pointers`, the
  daily brief's "Trap pointer" line, the indicator's dashed line + label, two
  alerts); not drawn at an alive same-side LB extreme (E1 decision 1). Rejected in
  the build: putting the origin on the map as a level — the first flips read a
  running extreme that is no swing, and a phantom x1 there got run by the next bar
  and turned the V1 inducement fixture into `up_continuation`; also "flip only on
  qualified runs" — it kills V8's own gold example, where the high that induced
  buyers was x1. Pine v11 uploaded to TradingView as "Liq blocks" the same day
  (see the case for the check).

- **HTF direction read — superseded semantics (trader, 2026-09-26 evening / 27; the machine
  as it stands: docs/MARCO.md §3.2, design record docs/MARCO-DIRECTION.md §17).** The two
  builds above are history: the "lost" state is gone (both anchors were consumed levels;
  after a lost the next decision was opposite only 55–60%; the MNQ justification was wrong —
  the June highs 31 272.75 / 31 397.75 stayed intact above the August rally), acceptance no
  longer sets a heading, the "battleground" is a plain sweep-trigger on PDL/PDH (`pd_sweep`).
  Now: a decision's meaning depends on the level's side against the heading and its map role
  — the failed breakout is the trap (turns or confirms), a held sweep on the counter side
  confirms, one on the heading side is a pause (possible correction to the nearest opposite
  liquidity) unless it takes a build-up — the target, and with nothing further in reach the
  heading is *done*; a with-trend acceptance is nothing (the path), one against the heading
  is inducement until it clears the trap's extreme (the kill). `since` = the trap that turned
  the heading, `kill` its extreme, `target` the nearest build-up in reach (2 weekly ATR,
  √bars-per-week scaling). Labels state both layers as a fact ("W ↓ · D ↓ — за W, за D"); the
  bias headline is downgraded in print when both layers are against it. Rev-4 decisions and
  the options kept for the sprint-3 close: docs/MARCO-DIRECTION.md §17.5. FVG edges entered
  the map the same night as markers (§2.1, §17.6): an FVG-backed build-up's LB carries `fvg`
  for the measurement.

- **FVG edge as a marker — the trader's "retail point of interest"** (trader, 2026-09-26/27;
  built 2026-09-27, engine + Pine v13; rule in docs/MARCO.md §2.1, record in
  docs/MARCO-DIRECTION.md §17.6). His words: the IE team never says "FVG", they draw a line at
  the edge nearest to price and count the liquidity that built up short of it; "FVG рівень сам
  по собі не цікавий статистично … лише в комплексі": edge + engineered liquidity → the run
  takes the whole build-up and enters the gap → closes back → continuation. "Я б не
  ускладнював": the 3rd candle's low (bullish gap) / high (bearish) on every timeframe; with a
  build-up to it — marked like an extreme and traded; without — a dashed line. Built as: a lone
  edge is a marker (no level, target, seed or pending; a bar through it fills it); a later
  swing within `eq_tolerance` promotes it into a level at the edge's price, `fvg: true`, taps
  from price only (`fvg_edge_touches` 0). Three literal variants were rejected on the
  regression: edge = x1 level at once (sweeps and LBs tripled, the weekly bias changed on all
  four instruments on all four weekends W36–W39), promotion by `respect_tolerance` (swallowed
  the May-2025 W low 1.1408, the U4 June LB was never born), the edge bringing a tap of its own
  (the V1 inducement low became qualified, MGC flipped short four weekends). With the built
  variant the only change in 16 instrument-weeks is MNQ 18.09 `long/pullback` → `long/aligned`.
  Open: the measurement the hypothesis needs — LBs with an FVG behind the swept cluster against
  those without (`fvg` on blocks, build-ups and `*_lb_created` events) — once cases accumulate.

## Rule candidates

- **Attempts per idea — what V9 points at in the journal** `[CALIBRATION, analyst, 2026-09-27 —
  case V9; SOURCE support V9 "quality over quantity", V7 "one or two small losses before the
  real trade is normal"; the trader's decision, not built]`. The 42 trades of W36–W39 split by
  what is known *before* the entry: the first attempt at an idea (instrument + side) — n 21,
  38% winners, +$4276; a re-entry within 24 h of a losing exit — n 21, 24%, −$962 (attempt 2:
  9 / −$184, attempt 3: 4 / −$469, attempts 4–5: 4 / −$543, attempts 6–7: 4 / +$233 — two ideas
  ran to a seventh attempt, MNQ long 8–10 Sep six losses −$792 then +$536, MGC long 22–24 Sep
  six losses −$1131 then +$122); a re-entry within 30 minutes of the stop — n 4, no
  winner, −$441; days with 5+ trades (3 days) — n 20, 15%, −$2064, against days with 1–2 trades
  (6 days) — n 11, 55%, +$3334. By week: W36 7 trades +$3583, W37 18 −$615, W38 3 +$1696, W39
  14 −$1350. Proposal for the next strategy revision: at most two attempts per idea per day
  (the entry and one re-entry), no re-entry within 30 minutes of a stop, a third attempt only
  after a new event at the level on the grid timeframe (a new run and reclaim); the brief
  prints the attempt number next to a setup that was already tried. Small sample, one month —
  a hypothesis to watch in sprint 3, not a finding.
- **The pocket verdict against V9: "no entry until X is run" → "lower grade, X is a future
  target"** `[CALIBRATION, analyst, 2026-09-27 — case V9; render only; not built]`. `flagPocket`
  and the *invalid* grade print "no entry until the floor is run"; in two of Marco's four
  examples the floor was never run and the move went without it (gold 16 Sep: tap 4253.6,
  floor 4223.505 x1 11.7 below the extreme, +165 to 4399.7; EUR 4h 9 Sep: bear LB
  1.16494–1.16544 *invalid* under 1.166 x2, −295 pips to 1.13592). Measured on the four
  futures (1710 zone taps, 240 / 60 / 30): an LB with a build-up left beyond it reached 2R in
  27% against 31% with nothing left, 3R in 17% against 23% (n 168 / 1148); 1R 39% against 41%.
  A modest penalty — "not my favorite", not "no entry". Proposal: keep the grades and the
  ranking, change the wording of the verdict (continuation entry or reduced size; the floor
  named as the future target), leave the decision to the trader.
- **"The trap failed → continuation" flips the side on a deeper run** `[CALIBRATION, analyst,
  2026-09-27 — case V9; measured and **built the same day** on the trader's "ок, згоден, давай
  зробимо" — see *Approved changes* → "A zone traded through"; the measurement stays here]`.
  `storyRead` turned a killed trap LB
  into `down_continuation`, direction −1. In V9's examples the deeper run was the same story:
  gold 1h 14 Sep (LB 4278.3–4282.6 killed after three bars, low 4253.6, then 4366), NQ 2h
  16 Sep (LB 29 112.25–29 127.75 killed by the FOMC spike to 29 053, 29 916 two days later). The
  H4 kept `buy_story` on gold through both because its LB was the deeper one.
  **Measured** (`tmp/v9_trapfailed.mjs`, `tmp/v9_chain.mjs`; MGC / MES / MNQ / 6E, 240 from
  Dec 2023, 60 from Nov 2025, 30 from Mar 2026, to 25 Sep 2026; the story read on every closed
  bar over a sliding 600-bar window, an episode = the bar the read changes on; outcome = first
  passage from that bar's close, X ATR along the read before X ATR against it; baseline = the
  same test from every bar, 50%):

  | The read | n | 1 ATR | 2 ATR | 3 ATR | 16 bars, along / against |
  | --- | --- | --- | --- | --- | --- |
  | the trap failed → continuation | 1385 | 49% | 50% | 49% | 2.33 / 2.23 ATR |
  | … the killed LB qualified | 838 | 51% | 53% | 51% | 2.41 / 2.14 |
  | … unqualified | 547 | 47% | 46% | 47% | 2.21 / 2.37 |
  | … qualified and `trap` (V9's case) | 244 | 48% | 48% | 49% | 2.14 / 2.15 |
  | breakdown (no reclaim) → continuation | 1182 | 50% | 48% | 49% | 2.17 / 2.25 |
  | buy / sell story, fresh | 3155 | 50% | 51% | 51% | 2.30 / 2.27 |

  The read carries no direction — neither the engine's "continuation" nor V9's "the trap
  stands": a coin either way, on every timeframe, instrument and side, whatever the killed
  LB's grade, life or the reaction it had given. (On the first, shorter sample the qualified
  `trap` row read 38% / 36% / 44% on n 57 — it did not survive the deeper history.) What the
  read *is*: a transient. It turned into a new trap on the same side as the killed LB — the
  run deepened, then the reclaim — in 52% (median 2 bars later), into a breakdown in 37%
  (median 3 bars), into a trap on the other side in 10% (median 13 bars). Chains of traps do
  not decay: zone taps reached 1R / 2R / 3R in 41 / 30 / 22% for the first trap (n 2004),
  39 / 28 / 22% for the second link, 40 / 30 / 24% the third, 39 / 30 / 20% the fourth and on;
  the one row that stands out is the *qualified* LB born after a killed one — a deepened run
  of a qualified level or the run of an old LB extreme — 46 / 35 / 30% (n 323) against
  43 / 30 / 22% for a qualified first trap (n 836); one subgroup out of dozens looked at, on
  correlated timeframes — to watch, not to build on.
  **Proposal, supported by the numbers:** the read becomes what it measures as — "the zone
  was traded through: the run deepened; a close back makes the new LB, no close back within
  `confirm_bars` is the breakdown", **direction 0**, the PENDING family (§3.1) — and the word
  "failed" goes. Engine only (`storyRead`, the renders); the Pine draws zones, not story
  modes. To check in the build: `resolveBias` reads a daily continuation against a weekly trap
  as `pullback` — a neutral daily must not turn that into `weekly_only` by accident.
  The same table says more than was asked: on a first-passage test none of the story reads
  tilts the next 1–3 ATR. The story says where the entry zone and the targets are; it is not
  a directional signal, and should not be printed as one.
- **The V9 lock as a state of the brief — measured, not supported** `[analyst, 2026-09-27 —
  case V9; rejected as a mechanical rule]`. Two prototypes, sticky, latest wins: *literal* (an
  LB whose run took an intact origin, `trap`) and *anchor* (qualified, not invalid, not
  inducement). On seven series × 240 / 60 / 30 (2921 zone taps, target 2R, break-even 33%):
  taps against the lock 30% / 28%, with it 27% / 27%, the trap's own LB 29% / 32%, every tap
  28%. On the trader's 42 trades the trades against the lock were net positive under every
  variant (+$646 … +$2223) and the losing longs of W39 sat *with* it: in a falling leg the
  engine prints one bull trap after another (6E 1h "no sells" on 10, 11, 14, 22, 23, 24 Sep
  while price went 1.1651 → 1.1397). What separates Marco's traps from those is not in the
  map's labels; the direction read (§3.2) is the layer that speaks to it. Kept as Principle 7.

- **LTF build-up after the run = the entry; the close back = the grid state only**
  `[CALIBRATION, user-raised, 2026-09-24 — case U3; SOURCE support V2 §4.2, V6 §4.4, V8 §2.2;
  not built]`. The trader: "closing a bar back over the level after the run gives little
  and often misleads; the best thing Marco gave is the build-up on the small TF after
  the run — respecting lows, a high broken, buyers induced — the order goes under that
  structure, the stop under the LB the run left." He favours two entry variants and will
  find the video where Marco explains the second:
  1. **V6 sweep-trigger (§4.4)** — a resting order under the bias-side level itself when a
     pre-existing bias-side LB supplies the stop; no reclaim wait.
  2. **LTF build-up (§4.2 sniper / 4-candle model + §2.2 V8)** — after the run of the edge,
     wait on 5m/15m for a bias-side structure: a higher low / lows respecting, then a high
     broken (buyers induced); the *origin* of that inducing move is the trap pointer; the
     order rests under that build-up, the stop under the extreme of the LB the original
     run left. Candle 2 of §4.2 *is* that LB, candle 3's low the build-up, candle 4 the
     entry.
  The bar-close reclaim (`confirm_bars`) keeps one job: the H4 grid's state word (PENDING →
  VALID → the LB becomes the edge). It stops being the `entry when` condition in the brief
  and the journal. Pocket rule on the stop: an intact deeper level within the pocket
  tolerance under the LB extreme (U3: 1.14035 x4, 3 pips under 1.14065) means the stop goes
  under *that* level or the entry is its run. Engine side (U3 gap below): the 5m/15m LB must
  be born by a trade back over the swept level inside `story_lookback`, not by a close within
  `confirm_bars`; trap pointers and the intact-below list already give the build-up and its
  origin. Engine + Pine together when built.
- **MTF leg layer (D + 4h)** `[CALIBRATION, user-raised, 2026-09-23 — case U2; not built]`.
  The stack reads the global W story and the *latest event* per timeframe; the
  divergence rule (MARCO.md §3.1) turns "D continuation against a live W trap" into
  `pullback` = "enter with the weekly once the daily's run is in". Nothing reads the
  **leg** itself — how far the pullback runs and where it ends — so every fresh
  with-bias 4h LB inside a counter leg reads as the trap. 6E W38–W39: W buy_story
  (LB 1.1404–1.1408) while D/4h fell from 1.16965 (9 Sep) for two weeks; the with-bias
  4h LBs 1.1495–1.14965 (Fri 18), 1.1473–1.1495 and 1.1468–1.1473 (Tue 22) all died, the
  counter LBs 1.15935–1.15975, 1.1530–1.15355, 1.1518 all held; the trader's three
  longs of 22 Sep sat in that leg. Proposal:
  1. **MTF state from liquidity only** — which side's LBs hold and which die on D/4h
     since the last HTF-side event: **WITH** (with-HTF LBs hold, the leg extends toward
     the HTF target) · **AGAINST** (with-HTF LBs born mid-leg die, counter LBs hold) ·
     **TURNING** (the leg reached the HTF zone and printed a with-HTF LB that held).
     The **turn** = the run of the leg's last counter extreme (the build-up of lower
     highs in a long HTF) with a 1h/4h close beyond.
  2. **Alignment rule.** WITH → the current stack unchanged. AGAINST → with-HTF entries
     only (a) at the HTF zone the pullback is heading to (the D/W LB, the invalidation
     area) or (b) on the retest after the turn; a with-HTF 4h LB born mid-leg is
     inducement of the leg — V1's "LBs against the story are marked, never entered",
     applied one layer down. TURNING → with-HTF entries at the zone, the turn is the
     confirmation.
  3. **MTF-continuation trades against the HTF** (U2's arrows): in a confirmed AGAINST
     leg, the run of a build-up / origin inside the leg + reclaim → entry on the retest
     of the LB it leaves (the V8 trap, mirrored), nearest leg liquidity only, flat before
     the HTF zone. Extends the Mon–Tue counter-trend allowance to any day, but only
     inside a confirmed AGAINST leg. **No [SOURCE]**: Marco does not enter counter-bias
     LBs (V1); V7's intraday/intraweek layering and our Mon–Tue allowance are the
     precedent. Needs strategy rev 4 (weekend 26–27 Sep, with the two-session windows)
     and a setup type (`mtf-continuation`).
  4. **Engine**: a leg read on D/240 (LB births and deaths per side since the last
     HTF-side event, the last counter extreme, the HTF zone ahead) → an `MTF:` line in
     the brief's Bias block and the scenario ranking keyed on it. Piloted by hand in
     `briefs/daily/2026-09-23.manual.md`.
  **Status 2026-09-26:** the leg is **built as the H4 leg of the direction read** (acceptance
  on H4 swings instead of LB births and deaths — one machine for W/D/H4), printed as one
  descriptive line in the Напрямок block; the D heading carries what U2 asked for (the 22 Sep
  longs sat against D ↓ since 17 Sep). Part 2 (ranking) and part 3 (MTF-continuation trades
  against the HTF) are **not built**: on two years of H4 bars a leg against the D heading
  persisted 46–55% (noise) — no ground for a setup type (`h4measure.mjs`, *Approved changes*
  → "HTF direction read" → second build).

- **HTF sell-side read of a range: the draw first, the failed breakout as the trap**
  `[CALIBRATION, user-raised, 2026-09-25 — case U4; SOURCE support §3 step 2 (V3, V4),
  §2.1 extremes (V3), §2.3 LB (V1); not built]`. The trader read W38–W39 6E as short to
  1.1404 x3 after two upside manipulations; the stack read long with its invalidation on
  that same pool. Four parts, each replayed on the U4 bars (scratch copy of the engine,
  flags, `tests/marco*.test.js` 71/71 green with 1–3 on):
  1. **Zone respects outside a thin zone** — a bug against §2.3 as written, see *Engine
     gaps*. Alone it retires the W anchor 1.1404–1.1408 into a W build-up x2 at the W34
     close and removes the 1.1404 invalidation.
  2. **A retired anchor tells no story** — `storyRead` still picks the anchor's
     `bull_lb_created` event after the zone died as a build-up (death `buildup`); treat it
     like `deepened` (superseded). With 1: W stops reading `buy_story`.
  3. **Reachable draw** — fuel counts only build-ups born within 2× `story_lookback`
     (reused). U4: the W "draw up x4" was 1.29435 x2 + 1.3319 x2 from 2021, 12–19 weekly
     ATRs away; reachable fuel is above x0 vs below x2 (1.1404) → draw down. Open: whether
     the weekly brief's `resolveBias` should read the draw at all when the W story is
     no-man's land (today only the story is read).
  4. **Failed breakout = a late trap** — a run whose close back through the level comes
     after `confirm_bars` but before the run extreme is exceeded still prints the LB (§2.3
     has no time limit; `confirm_bars` is ours), flagged `late`. U4 D: 1.1705 run Wed 19
     Aug, five closes above, first close back Wed 26 Aug → bear LB 1.1705–1.17625 and
     `sell_story`, targets 1.1566 → 1.1404 (replayed as `confirm_bars` 6, which is a probe,
     not the proposal — the PENDING state keeps `confirm_bars`). Same gap as U3 on 5m;
     build together. Qualification: 1.1705 was x1 and 46 D bars old (< `min_level_age`
     50) — it qualifies as the **range extreme**: the origin of the move into the
     anchor, the other side of the range by role (§2.1 "extreme highs framing the
     range", §3 step 2 "highs get run → shorts back through the range").
  With 1–4: `short (aligned)` from the W36 close (Fri 4 Sep), target 1.1404, invalidation
  weekly close above 1.17625 — the trader's read. With 1–3 only: `short (daily_only)`,
  but only because the 300-bar D window reads the stale Jan-top bear LB; the live 500-bar
  window read the June LB instead, so 4 is what makes it robust.
  **Status 2026-09-26:** parts 1 and 2 **built** (engine + Pine v12, see *Engine gaps*); part 3
  (reachable draw) and part 4 (late reclaim, together with U3) **not built** — the direction
  read (*Approved changes* → "HTF direction read") now answers "where is the market heading"
  without them, so they wait for the map's own recalibration.

- **HTF extremes: one bar each side on D / W / M, the fractal stays below**
  `[CALIBRATION, user-raised, 2026-09-25 — case U4; SOURCE support V7 "this 4-hour high
  is just another high … I just grab that high", V2 candle 1 = a one-candle level; not
  built]`. The trader: "Marco and his team take extremes quite aggressively, but they
  split them by role and pick only the significant ones." Proposal: `pivot_len` 1 on
  D/W/M, 3 on 4h and below; extremes by role (range extreme, move origin) on top.
  Replayed on U4 (current engine otherwise, W 300 / D 300 bars):
  - **D sees both manipulations.** Wed 19 – Fri 21 Aug: the run of 1.1705 / 1.1733 →
    bear LB 1.1733–1.17625, qualified, clean (no late reclaim needed); Wed 9 Sep: the run
    of 1.1685 → bear LB 1.1685–1.1697 (invalid by E1: 1.17125 x1 intact, zone unqualified).
    D `sell_story`, bias `short (daily_only)` from the W36 close, targets 1.1438 / 1.1404 at
    the W39 weekend, invalidation daily close above 1.17625.
  - **W still misses the range top, for a different reason.** 1.1705 is now a W level, but
    the W34 high 1.17625 stopped 14 pips under the May high 1.17765 (W eq_tol ≈ 33 pips) →
    `high_poke`: "inducement into the pocket", 1.17765 x2 stays the target above. With
    `pivot_len` 3 the same high was swallowed earlier, as a respect of 1.17765 (71 pips,
    W respect_tol ≈ 113). On HTF the ATR-scaled merges (eq 0.25, respect 0.75) decide what
    an extreme is as much as the pivot window does. ~~Candidate for the role layer: a level
    born before the current structure cannot absorb the structure's own extreme — no merge,
    no pocket across the range's origin.~~ **Retracted on the trader's correction
    (2026-09-25):** "the merge is right and must stay — 1.17765 really was respected by the
    W bar of 26 Aug; but a respected level does not tell us the market is going to take it
    now. It can respect a level several times and we never know when it decides to take the
    whole build-up. We need a split: there are targets, and there must be a read of whether
    the market is heading to them right now or the other way. The run of 1.17050 and
    acceptance under it already said the market does not want to go up; it confirmed that
    when it ran the previous week high (W36 → W37, 1.1685 → 1.1697) and closed back under.
    The merge must not oblige the analysis." → **targets ≠ direction**: the map (levels,
    merges, build-ups, pockets) says where liquidity rests; the direction read says which
    side the market is heading to *now*, from what it does at the significant levels
    (run and acceptance beyond = continuation, run and acceptance back = rejection of that
    side).
    Today the engine lets map facts vote on direction: the pocket poke prints "inducement
    into the pocket, not a trap", the trap pointer "their stops over 1.17625 — its run is
    the trap", the draw sums fuel with no regard to heading, the anchor holds until killed.
    Bar closes against the previous bar (the W36 → W37 run) — to be discussed separately.
  - **Noise.** W: LBs 35 → 55 (qualified 5 → 15), build-ups 5 → 18. D: LBs 31 → 59
    (qualified 5 → 13), build-ups 8 → 16; D draw "up x10 vs below x5". `min_touches` /
    `min_level_age` were tuned on pivot 3: more x2 means more qualified anchors, so more
    story flips. Needs a W/D regression on MNQ / MGC / 6E (W36–W39 briefs) and the V6 NQ
    walkthrough (§7.2) before adoption.
  - **Lag.** 3 bars → 1 (W: the W31 low 1.14175 known at the W32 close instead of W34).
  - Monthly is not in the stack today (`marco weekly` reads W, D, 240, 60); adding M is a
    separate step. Pine: the default becomes `timeframe.isdwm ? 1 : 3` — engine and Pine
    together (§7).
  **Status 2026-09-26 — split in the build.** The 3-bar fractal is **built where the trader
  defined it, for the direction read** (`direction.pivot_len` 1, *Approved changes*). On the
  liquidity **map** the regression (`scripts/research/direction/regress_pivot.mjs`, weekly
  layer at the W36–W39 weekends, map fixes 1–2 on) came out worse: MES "short/aligned, target
  7362.75" for four weeks while price ranged 7650–7870 and closed W39 at 7803 (pivot 3: no
  bias); MNQ "no bias" at W36–W37 before the W39 rally (pivot 3: long/pullback); MGC "no bias"
  at W39 (pivot 3: long); V6 (NQ W, 2025): Jun 3 buy_story → up_continuation. So the map keeps
  3 — a knob `htf_pivot_len` (engine, default 3; `cfgForTf`) is there for a recalibration of
  `min_touches` / `min_level_age` under pivot 1, and Pine's `pivotLen` is unchanged.

- **Ladder split** (from U1; **built 2026-09-11** — `storyRead` marks counter-side
  zones `pullback_origin` / `extreme`, the reads print "(LB, pullback origin)" vs
  "(LB, range extreme)"). Print two lists instead of one "targets": (a) liquidity
  targets = intact levels / build-ups + the range extreme (kept even when the extreme
  is an LB — this preserves the V6 check in §7.2); (b) pullback origins = alive
  counter-bias LB zones on the path: partial before the false reaction, extreme = what
  continuation must run. Stop printing an LB zone bottom (= swept level) as a target.
- **Pocket flag on entries** `[CALIBRATION, user-raised, 2026-09-10]` — **built
  2026-09-11** (`flagPocket`, and the grid-level tier in `clipToGrid`). Two tiers on
  existing parameters: within `eq_tolerance` above an intact level → poke, no LB
  (existing §2.3 rule); within `respect_tolerance_atr` (0.75 ATR) → the LB is born but
  flagged `pocket`: its tap is downgraded ("no entry until the floor is run") and the
  sweep trigger at the floor becomes the preferred entry. The brief renders the LB
  tap as the inducement leg of the deeper scenario, not as an entry. U1 numbers: 6E
  4h ATR 18 pips, eq_tol 4.5, respect 13.5; the low 1.1593 sat 5.5 pips above the
  1.15875 shelf — the poke rule missed by one pip and the brief printed the LB tap
  first. **Learned in the build (first live run, 2026-09-11):** (1) the floor must
  be a *level* of liquidity — a deeper same-side LB extreme is the V6 stop
  refinement, not a pocket (MGC's nested 4341.3–4351.2 inside the daily
  4329.3–4365.2; MNQ's 29038 above the Sep-4 LB 28927.25) — the first version
  flagged both and called every refinement inducement; (2) the H4 grid's tolerance
  governs LTF taps: the 6E 15m LB 1.16405–1.16455 was not a pocket by the 15m's own
  ATR but sits 12 pips above the 4h floor 1.16285, so the grid marks it. Not built:
  "the build-up gains a respect tap" — that would touch the map's counts (state, and
  therefore the Pine), so the tap count stays as the map has it.
- **Shelf promotion** (§7.1 open idea, now four examples). A non-pivot bar low that
  later bar lows respect ≥ `min_touches` times within `eq_tolerance` becomes a level.
  See *Engine gaps*.
- **Left-liquidity validity test** `[CALIBRATION, from E1, 2026-09-14]` — **built
  2026-09-14** (see *Approved changes*; decisions under the E1 verdict). Elijah's
  diagram: a run creates a valid LB only when it takes the level *and* the liquidity
  from the left; while the left liquidity stays intact, price "respects this area and
  keeps trading" to it. The engine has this only as the respect-tolerance tier of the
  pocket flag (0.75 ATR), and both E1 misses sit beyond it (92 and 105 pts against
  60–71). Proposal: make the test structural. For a run on one side, the *left
  liquidity* is every intact same-side level or build-up beyond the swept level
  within the current leg — on the exec TF bounded by `story_lookback`, in the daily
  brief bounded by the H4 grid (edge included). Two tiers, both on existing
  parameters: left liquidity with ≥ `min_touches` (or the grid edge itself) intact →
  the LB is **invalid**: no story flip (`Bias = Auto`), no entry, its sweep is the
  trigger; only x1 swings intact → the LB is **valid but unrefined**: the tap or the
  build-up run is the *aggressive* entry, the sweep of the left swing the *refined*
  one (Elijah: "personal preference — me personally I like to wait for this point").
  Replaces the respect tier of `flagPocket` and the `inducement` test of `storyRead`;
  the `eq_tolerance` poke tier stays. Engine + Pine together. Open for the build:
  whether an alive same-side LB *extreme* counts as left liquidity for the story — it
  did in E1's Sep 1 09:00 read, while the 2026-09-11 exception keeps it out of the
  pocket flag (a nested LB inside the HTF anchor zone is a refinement); E1 suggests
  the layering decides: the extreme counts when it is the HTF's *draw*, not its anchor.
- **Deepened runs inherit the trap** `[CALIBRATION, from E1]` — **built 2026-09-14**.
  A fresh LB (younger
  than `confirm_bars`) traded through by a wick within `eq_tolerance` of its extreme,
  with the bar — or the next `confirm_bars` — closing back above the *original* swept
  level, is the same run deepened (§3.1 PENDING B, after the fact), not "an internal
  low run inside the leg": the LB becomes new extreme ↔ original swept level, keeps
  the level's qualification, the story stands. E1: Sep 2 05:00 → 07:00, 13.5 pts =
  0.16 ATR, the 1h fell from `buy_story` to `down_continuation` while the 240 (both
  wicks in one bar) read the trap. Engine + Pine; regression test on the MNQ fixture.
- **The invalid-LB chain in the brief** (rendering only) — **built 2026-09-14**. E1's
  1h → 5m walk is the D
  scenario's mechanics written out: the counter-bias LB is *invalid* — "an area price
  respects to engineer liquidity" — and its false reaction builds the build-up (trend
  line, equal lows) under which the bias-side trigger is expected: "do not buy above
  the build-up". Print, per bias-side scenario, both entry grades — aggressive (the
  build-up run, close-confirmed) and refined (the run of the leg's origin swing) —
  with the stop covering the whole LB extreme either way ("this high can easily get
  taken out and then respect this extreme"). `renderDailyMarkdown` only; no map change.

## Engine gaps observed

**Forming bar read as a reclaim (2026-09-23 17:01, `marco daily`).** 6E: 1.14375 was run to
1.14295 in the closed 13–17 bar (15m close 1.14355, under the level); two minutes into the 17–21 bar
price sat at 1.14385 and the daily printed "Now: VALID (4h) … reclaim → bull LB 1.14295–1.14375 Q
in the 17:00–21:00 bar" — the unclosed bar counted as the close back. States (VALID / PENDING /
breakdown) must come from closed 4h bars only; the forming bar may only be shown as "in progress".
**Built 2026-09-23 evening** — `splitForming` (src/core/marco_grid.js) cuts the forming bar of every
intraday timeframe in `marco daily` and `marco brief`; the brief prints it as "ще відкритий" and
names a run or a close back in progress; `exec_bars` in the daily JSON carries it. Test *splitForming*.

**Flat neighbours / shelves.** A run of near-equal HTF lows (or highs) where no bar is
a strict `pivot_len` swing never registers, so its tap count is lost:

| Instrument, TF | Shelf | What the engine saw | Effect |
| --- | --- | --- | --- |
| 6E 1h, W36 | Sunday-open wick 1.15765 | trigger read 1.15795, 3 pips above | trigger edge wrong (§7.1) |
| 6B 1h, 4 Sep 2026 | 1.3474 equal lows 06:00/09:00 | nothing — tie pivots cancelled | fixed: tie-aware swings, HTF feed (§7.1) |
| 6B 4h, 4–7 Sep 2026 | 1.3505 / 1.3511 / 1.3512 / 1.3506 | nothing on 240 and D; 1h had 1.3506 | 240 bull LB 1.3492–1.3521 instead of 1.3492–1.3505; second target unnamed |
| 6E 4h, 2–4 Sep 2026 | 1.15890 / 80 / 75 / 85 + Sep-4 1.15880 | x1 on 240 (the Sep-4 pivot only), x2 on 60 | the strongest build-up below price under-counted; pocket rule missed by a pip |
| XAUUSD 15m, 30 Jul 2025 20:00–21:30 ET (case V8) | 3283.4 / 3282.9 / 3283.8 / 3285.5 / 3285.0 | nothing — 19:45's 3280.9 sits inside every pivot window | the 31 Jul 21:45 stab 3281.7 read as the LB extreme's sweep only; the LB and the story came anyway |

Rising lows are never strict pivots (each has a lower low within `pivot_len` bars to
the left), and a shelf 30 pips above the last pivot is beyond `respect_tolerance`, so
neither the swing rule nor the respect rule catches it.

**Deepened runs.** A wick through a fresh LB's extreme within `eq_tolerance` kills the
LB and re-opens the sweep against the LB's own young x1 extreme, so a qualified trap is
re-read as "an internal low run inside the leg" — MNQ 1h, 2 Sep 2026 05:00 → 07:00 ET
(E1): 28 940.75 → 28 927.25, 0.16 ATR, `buy_story` → `down_continuation` + `inducement`.
The 240 does not see it because both wicks fall in one bar. **Fixed 2026-09-14** (the
E1 build): the pending reopens against the original level with its qualification and
`bull_lb_deepened` marks it; the MNQ real-bars test pins the Sep-2 read.

---

**5m LB not born when the close back comes after `confirm_bars` (2026-09-24 09:41, `marco scan
CME:6E1! --tf 5`, case U3).** 1.1417 (the 4h bias edge) was traded through 03:15 Athens, extreme
1.14085 03:50, first 5m close back over it 04:10 (4 bars after the extreme, 11 after the first trade
through); the run repeated 04:55 → extreme 1.14065 05:10, the 05:30 bar closed exactly 1.1417 and
the first close strictly above came 05:40 — 6 bars. On 5m the map dropped the level without printing
a block (`blocks` has no bull zone; 1.14065 is listed as a plain intact low x1; all three long
triggers say "no LB beyond the trigger — no stop anchor"), while the trader's rectangle 1.14065–
1.1409 is the LB by §2.4 (sweep extreme ↔ swept level) and the same scan's 5m trap pointer already
reads the structure built on top of it: "buyers induced 6 bars ago (the high 1.14225 run) — their
stops rest under the origin 1.1413: its run is the trap". The 15m closed back on its 3rd bar
(05:30–05:45, 1.14205) and the 1h in the run bar itself (05:00 bar: low 1.14065, close 1.14215), yet
the 09:04 daily printed "1h: NOISE — continuation down" (to check: 1.1417 unqualified on the 1h
map — one touch, one day old). Fix direction: rule candidate *LTF build-up after the run*.

**Zone respects are counted only inside the zone (2026-09-25, case U4).** §2.3 says a later
swing holding within `eq_tolerance` of a live zone's *extreme* is a respect; both
implementations reach `respectZone` only when the pivot is *inside* the zone
(`insideZone` in `buildLiquidityMap`, `insideAliveZone` in the Pine). A thin zone therefore
never collects respects: the 6E W bull LB 1.1404–1.1408 (4 pips, W eq_tol ≈ 35 pips) got
the W31 low 1.14175 — 13.5 pips above the extreme, 9.5 above the zone top — as a separate
x1 level, kept `respects = 0` and stayed the W anchor and the brief's invalidation for 13
weeks, while the D map had 1.1404 as an x3 build-up. Fix: try `respectZone` for any pivot
within `eq_tolerance` beyond the extreme, register a level only when it did not count.
Replayed on U4 with the full marco suite green (71/71). Engine + Pine together.
**Fixed 2026-09-26** — engine (`buildLiquidityMap`, `respectZone` returns whether it counted)
and Pine v12 (`respectZone` returns a code; a retired zone that set the Auto bias releases it);
a zone retired into a build-up tells no story (`storyRead` → superseded). Test: the U4 W anchor
retires at the W34 close into 1.1404 x2 (`tests/marco_direction.test.js`). The Pine compiles on
TradingView's server check (0 errors); pushed to "Liq blocks" the same day (TV version 14.0).

**HTF range extremes that are not strict pivots (case U4).** W `pivot_len` 3 is a 7-week
window: the W25 high 1.1705 (the origin of the June drop, the range top) is not a W swing
because W23 1.1755 is two bars to its left, so the W map had no range top and both upside
runs of Aug–Sep produced no W event. On D, the Thu 3 Sep high 1.1685 was run on the third
bar to its right (Wed 9 Sep, 1.1697, close 1.1672), so it never became a swing and the
run + reclaim printed nothing on D; only the 4h/1h had bear LB 1.1692–1.16965, listed as a
false reaction. Same family as the shelf table above; no fix proposed yet.

## Cases

### D1 — Elijah (IE), Discord, 2026-09-09 22:33 ET / 05:33 Athens Sep 10 — "WELCOME TO TRAP CITY"

Instrument GBPUSD (FOREXCOM) 5m + 4h — our `CME:6B1!`. Text: *quick lesson on how
things can appear enticing on the lower timeframes, but the HTF can say otherwise —
simplify your markups — reduce the noise.*

Pictures: (1) plain 5m Sep 7–9; (2) the same 5m with about seven by-the-book LB boxes,
both sides, three of them run straight through (Sep 8 03:00 bear, Sep 8 09:00 bear,
Sep 9 07:00 bull); (3) 4h with two lines only — the Aug-31 high 1.3566, line *ending*
at the Sep 9 03:00 ET sweep (consumed), and the Sep-8 low 1.3521, line *extended
forward* (intact draw).

Engine on 6B 240 (scanned 2026-09-10 14:45 UTC): build-up high 1.3566 x2 swept 8 bars
earlier (Sep 9 ~03:00 ET) → bear LB 1.3566–1.3568 qualified, tapped at the 07:30 ET
retest; build-up low 1.3521 x2 swept 1 bar earlier (Sep 10 ~08:30 ET, low 1.3492) →
bull LB 1.3492–1.3521. The Sunday W37 brief already carried "short sweep above 1.3566
(confirmed x2)" as the 240 trigger. Elijah's two lines are our two 240 build-ups,
one for one.

Outcome after the post: five hours of chop 1.3551–1.3560, down from 04:00 ET; the
fresh 5m bull LB 1.35416–1.35438 tapped at 05:30 and 06:00 (looked held), broken
06:30, waterfall to 1.34915 at 08:30 = the 4h low run by 30 pips. The LTF long was the
trap the post described.

Verdict: confirms §2.5 no-man's land and §3 step 1 at the HTF; counter-bias LB = false
reaction; LTF stories inside the HTF range are noise. Nothing contradicted. Produced the
*clip the LTF layer* change and the box-edge principle (an earlier "sweep candle body"
reading of box 7 was **retracted**: 1 pip ≈ 20 px on the screenshot, the whole gap
between the two modes).

**Follow-up — why 1.3521 and not the lower 1.3506?** 6B 240, ATR14 24.9 pips, eq_tol
6.2, respect 18.7. Sep 02 06:00 L 1.3475 pivot (range extreme, x3 with Aug-13 1.3474
and the Sep-4 poke 1.3476); Sep 04 10:00 L 1.3505, 14:00 L 1.3511, Sun 18:00 L 1.3512,
Sun 22:00 L 1.3506 (1.5k contracts) — a shelf, none a strict pivot; Sep 08 02:00 L
1.3522 + 06:00 L 1.3521 pivot (20k contracts, the bar rallied 42 pips to 1.3563) — x2
equal lows, the origin of the impulse that ran 1.3566 ("explode … leaving internal
points", V3). Ladder nearest-first: 1.3521 → shelf 1.3505–1.3512 → extreme 1.3474.
Elijah drew the first rung only. 1.3506 is the second rung, not "the extreme". Sep 10
ran 1.3521 and the shelf and stopped 16 pips above 1.3474–76.

### U1 — user's 6E 4h markup, 2026-09-10 22:48 Athens (price 1.1612, weekly LONG aligned, target 1.19235)

User lines 1.1656 (top) and 1.15935 (today's low), then moved the lower line to 1.1588.
6E 4h, ATR14 18.0 pips, eq_tol 4.5, respect 13.5:

- Sep 02 02:00 L 1.15720 pivot — ran the Aug-28/30/Sep-1 x3 lows 1.15795–1.1583 →
  bull LB 1.1572–1.1579;
- Sep 02 10:00 / 14:00 / 18:00 / 22:00 lows 1.15890 / 80 / 75 / 85 — a shelf x4, no
  strict pivot; Sep 04 06:00 L 1.15880 pivot (60k contracts) — fifth tap;
- Sep 06 22:00 L 1.16110, Sep 08 02:00 L 1.16115, 06:00 L 1.16110 → 1.1611 x3;
- Sep 03 10:00 H 1.16445 + Sep 07 H 1.16395 + Sep 08 H 1.16390 → 1.16445 x3, run Sep 09
  06:00 H 1.16565 → bear LB 1.1652–1.16565 = pullback origin in the weekly long;
- Sep 10 06:00 L 1.15930 (58k contracts), close 1.16120 — ran 1.1611 x3, stopped 5.5
  pips above the 1.1588 shelf; the engine printed bull LB 1.1593–1.1611 qualified and
  "trap in", triggers `tap long @1.1611 RR 1.6`, `sweep long @1.1588 RR 3.1`, `tap long
  @1.1579 RR 7.3`.

Verdict: the 4h grid is 1.1588 ↔ 1.1656; 1.15935 is only the latest respect of 1.1588
and the extreme of today's LB. The engine under-counts 1.1588 (x1 on 240, x2 on 60);
the eye's x5 is right. Above: 1.1656 x1 (range top, pullback origin) → 1.1668–1.1672
(bear LB from the Aug-28 spike, pullback origin — **not** a magnet; 1.1668 is the
swept level and means nothing) → 1.1685–1.1690 x2 (the intact build-up, the real
draw) → 1.1720–1.1735 (the August range extreme, final target per §5 even though it
is registered as a bear LB).

Scenarios as written for the brief: **A** LB 1.1593–1.1611 holds — *inducement, not
an entry*: a 1h sweep of 1.1593 that closes back is another respect of 1.15875 and its
buyers are the fuel for the run of the shelf (pocket-flag candidate). **B** run of
1.15875 with a 1h reclaim structure — the main scenario (V6: "as soon as price stabs
it out, anywhere below is a valid buy"; V6: wait for the reaction structure), stop
under the 1h LB left below 1.1588 (the 4h stop under 1.1572–1.1579 is ~$375, over the
$250 cap), targets 1.1643 → 1.1656 → 1.1685–1.1690, BE once 1.1643 is taken (V3),
partial at 1.1656. **Grid break** — a 4h close below 1.1572 without reclaim: the grid
redraws with 1.152 x3 as the lower edge; no H1 scenario until then. **D** price reaches
1.1656: run + reclaim → new bear LB = pullback origin, wait for the next low; run
without reclaim → the path to 1.1685–1.1690 is open, stop to BE. Not done: shorts
from 1.1656 / 1.1672 (counter-bias, and the Mon–Tue window is closed), longs
mid-range without an event.

### E1 — Elijah (Ghost Capitals), YouTube `dSDugD5rhFs`, 2026-09-14 — "Identifying liquidity block & traps masterclass" (14:58)

Elijah is an IE coach (his own branch in the Inter Equity Discord — user, 2026-09-14).
The vocabulary and the rules are Marco's; the video is evidence about the method, not
`[SOURCE]`. Reviewed from the auto-generated transcript plus five user screenshots
(2:51, 4:12, 4:41, 5:22, 5:47); the NQ 1h example reproduced on
`tests/fixtures/mnq_2026-09-04.json` (MNQ, defaults, 60 seeded from 240). Prices below
are ours; his NQ1! differs by ticks.

**What he says (0:45–4:44, diagrams).** *Valid* LB = "an area that currently does not
have liquidity below / above — and it has to align with the current direction of the
market". *Invalid* LB = "an area we can see price respect and engineer liquidity,
because it does not align with the current direction". The diagram adds the test the
definition hides: bullish, the run must take the low **and the low from the left** —
"that traps all the traders in the market, meaning we now have no liquidity at this
low"; bearish is the mirror. Invalid: the high is taken but "we've kept these highs to
the left intact and price moves away — the liquidity from the left has not been taken,
therefore price can easily just respect this area and keep trading up"; bullish
mirror: "price could easily still hunt from this liquidity, respect this area … and now
leave liquidity — now you have the move." "Price won't always mirror these exact
diagrams — the market is situational — identify price action with logic."

**NQ 1h (4:49–5:30).** "Price has traded below this low" (the Aug-24 09:00 low
28 947.75, line extended to Sep 2) → "induced sellers — that gives us our direction:
no shorts, we are long". The bear LB from the Sep 1 11:00 spike (his box 29 178–29 318;
our bar 29 179–29 317.25) "does not align with the current direction — trap; that's to
build liquidity".

**NQ 5m (5:34–7:39, Sep 2 → Sep 3; user screenshots 6:32, 6:38, 6:49, 7:10, 7:15,
7:27, 7:39).** Sep 2 ET: the 03:10 high 29 120 (line) is taken by the 08:15 spike
(29 150); the 09:55 drop to 29 015.25 (blue arc) sweeps the 09:30 low and reclaims —
the 5m bull LB *below*; the 10:45 dip 29 088 (arrow, line) is "the low from the left —
you can see how we've reacted to this low and caused this move up, and we've just been
respecting that low ever since"; the 11:00 spike to 29 215 and the 11:20 dip to 29 118
("we've traded up above this high, then traded down, inducing sellers — we formed a LB
here … mind you, we've just respected this area to the left", the 29 120 line) print
the 5m LB 29 118–29 140 (pink box), and the rising channel 11:00–00:00 (lows 29 140 →
29 145) is the build-up "right above it — we need that build-up to solidify that LB,
and we have just that … we do not want to be buying anywhere above this build-up".
"I want to see that low [29 088] taken as my last point of liquidity as well. But more
often than not you don't need to refine it in this manner — you can honestly just take
the entry as soon as this [build-up] low is taken. Personal preference; me personally I
like to wait for this point." The trade (7:10–7:15): limit long **29 088** (the left
low), stop **29 015.25** (beyond the LB below), target **29 317.25** (the top of the
invalid 1h bear LB — the range extreme's far edge, §3.1 ladder split), RR 3.15 — a §4.4
sweep trigger at the origin, stop under the pre-existing LB, target the HTF liquidity.
Outcome: tagged Sep 3 01:15 (low 29 075 — "notice how it takes out that point as well
… we take out that low, and we take out the liquidity from the left; we have the LB
below, and price runs"), back toward entry 05:30 (29 100), target 09:35 (29 359). Our
1h: Sep 3 01:00 low 29 075 / close 29 188.75; 05:00–07:00 lows 29 127 / 29 105.5 /
29 101.75; 09:00 high 29 375.25.

**15m/5m bearish example (7:39–11:40; instrument and date not on the screenshots).**
Highs run → buyers induced → bearish. A "bull LB" left by a minor low run — "a lot of
you would have seen this as a liquidity block" — is invalid: "we've still reacted from
this low to the left … we're not in a bullish environment"; its reactions "induce
buyers yet again". 5m entry once sellers are trapped at a build-up of highs ("traded
into this area multiple times and sold off, now we finally take it out"): *aggressive*
= "as soon as this high gets taken, based on the candle-closure confirmation", target
the lows from the left; *most optimal* = the internal high that forms after the LB and
"induces sellers — this one will trap them once it gets taken out"; the stop covers the
whole LB high — "this high can easily get taken out and then respect this extreme, and
price can still sell off; I'd rather have a wider stop still covering this LB" (the
wider stop did save the trade).

**AUDUSD 15m/5m (11:45–14:06; user screenshot 14:12 — FOREXCOM 5m, Aug 28 → Sep 2
ET).** The Aug-28 09:00 spike 0.71880 runs the external high 0.71870 (blue arc) →
"induces buyers into the market … we now want to see price towards the lows" → bias
short; that spike is the valid bear LB (the stop side, 0.71875). The Aug-29 13:00 low
0.71545, after the 0.71660 high was taken, leaves a bull LB 0.71545–0.71600 (pink
box) — "mind you, we are not in a bullish environment, therefore this area should be a
trap: an invalid liquidity block, we should see false reactions coming from here" —
tapped Aug 30 21:00 and Aug 31 11:00, two false reactions. The highs 0.71720 (Aug 29
17:00 → Aug 31 16:30) are "liquidity being built here"; 0.71770 (Aug 28 09:30 → Aug 31
16:30) is the internal point left after the external run — "take out all this
liquidity from the left, respect this liquidity block, and trade all the way to the
downside". Trade: limit short **0.71770**, stop **0.71875**, target **0.71378** (the
lows from the left), RR 3.73; tagged Aug 31 18:00 (spike 0.71800), lows respected Sep 1
04:30–12:00 (0.71400 → bounce 0.71610), target Sep 2 00:05 (0.71330). The same
mechanics as the NQ long: the entry is the sweep of the left-liquidity level, the stop
beyond the pre-existing LB from the external run, the target the lows the structure
kept respecting.

**Engine on the same bars (MNQ 1h, defaults; 1h ATR14 80–95, eq 20–24, respect 60–71):**

| Bar (ET) | What happened | Engine 1h read | Elijah's rule | Outcome |
| --- | --- | --- | --- | --- |
| Sep 1 09:00 | waterfall runs the 1h lows 29 116.75 / 29 040 inside the Aug-24 LB zone 28 947.75–29 116.75, close 29 105.5 | `buy_story`; bull LB 29 040–29 095.5 **qualified**; `tap long @29095.5 RR 6.9, confirmed` | invalid — the low from the left (Aug-24 28 947.75, 92 pts below, beyond respect 68.5) is intact | killed 14:00 (29 001.75); 28 947.75 run Sep 2 |
| Sep 1 11:00 | spike 29 317.25, close 29 296 | level `29317.25 x1` (no LB — it swept no registered high) | invalid bear LB, "to build liquidity" | tapped Sep 2 23:00 (29 242.75) and Sep 3 04:00 (29 293) — false reactions; run Sep 3 09:00 |
| Sep 2 05:00 | low 28 940.75 runs the Aug-24 extreme 28 947.75, close 28 973.25 | invalidated-extreme rule → `buy_story` "lows were run and reclaimed 0 bars ago"; bull LB 28 940.75–28 947.75 Q, thin | direction long — "traded below this low, sellers induced" | agrees |
| Sep 2 07:00 | low 28 927.25 (13.5 pts = 0.16 ATR deeper), close 29 083.75 | the 05:00 LB **invalidated**; new bull LB 28 927.25–28 940.75 `inducement` ("an internal low run inside the leg"); story → `down_continuation` | the same trap, deepened — the low **and** the low from the left are taken | 29 543.75 within 28 h; the 240 (one 04:00–08:00 bar) read `buy_story` at once |
| Sep 2 10:00 | high 29 211.75 runs 29 171.25 x2, close 29 120.25 | `sell_story`; bear LB 29 171.25–29 211.75 **qualified** (x2 build-up run); target 28 940.75 | invalid — direction long, and the high from the left (29 317.25, 105 pts above, beyond respect 71) is intact | 20 h of chop 29 075–29 293 under it (the 5m trend line), then 29 317 run → 29 543.75 |
| Sep 3 04:00 | high 29 293, close 29 216.75 | bear LB 29 255–29 293 `pocket` — "24.25 below the x1 level 29 317.25; no entry until it is run" | invalid, same reason | run without reclaim 09:00, continuation — agrees |

W/D from the fixture on these dates: weekly `buy_story` (stale), daily `sell_story` with
28 947.75 as its target → `counter_trend` short. The Sep 2 run consumed the daily's
target, so the layered read returns to the weekly long on exactly the bar Elijah calls
the direction; in the daily brief the Sep 1 09:00 and Sep 2 10:00 1h stories would have
been `noise` against the bias — the H4 grid already carries the *alignment* half of his
rule.

**Verdict.** Nothing contradicts `docs/MARCO.md`: valid = "holds no liquidity" +
aligned (§2.3, §3); invalid = the false reaction / pullback origin (§3, ladder split);
the build-up solidifies the LB (§6 qualification); wait for the run and do not buy above
the build-up (§4.4, Principle 2, pocket flag); the trend line as build-up (§2.1);
direction as a reaction to a run (§3.1); the stop covers the LB extreme (§5); the
"internal point after the LB" entry is §4.2's candle 3. Two things the engine gets
wrong on his own example, both about the *left liquidity*: (1) the respect tier of the
pocket rule is distance-bounded while Elijah's test is structural — both misses
(Sep 1 09:00, Sep 2 10:00) sit 92–105 pts beyond a 60–71-pt tolerance; (2) a deepened
run kills a fresh qualified LB and demotes the story (Sep 2 07:00). Both → *Rule
candidates* (left-liquidity validity test; deepened runs inherit the trap), plus a
rendering candidate (the invalid-LB → build-up → trigger chain, two entry grades). The
Sep 1 09:00 miss is not an argument against the 2026-09-11 "floor must be a level"
exception: the Aug-24 extreme was the *daily's target* — the running leg's draw — not
the anchor of a live story as MGC's daily zone was; the layering, not the pocket flag,
separates a nested refinement from inducement into the draw.

**Build decisions (2026-09-14, all `[CALIBRATION]`).** (1) Alive same-side LB
extremes are not left liquidity — Elijah's 5m long sits above the 29 015 LB and the 1h
LB 28 927, his AUDUSD short under the 0.71880 LB: they are the stop anchors (V6), which
is also the 2026-09-11 "floor must be a level" exception. (2) The structure = intact
same-side levels born since the previous *clean* same-side LB, within `story_lookback`
— an inducement LB does not reset it (so the Sep-3 04:00 bear LB still sees
29 317.25); seeded HTF levels are the grid's business. (3) Grades: `invalid` when a
build-up (≥ `min_touches`) remains or the zone is unqualified — no flip, no entry, its
sweep is the trigger; `unrefined` when only x1 swings remain — no flip, the tap is the
aggressive entry, the sweep of the nearest swing the refined one; `clean` otherwise. A
qualified clean LB is the only story anchor. (4) The `respect_tolerance` tier of the
pocket flag stays as the near-floor rule for the shelves the engine under-counts (U1);
the H4-grid tier becomes structural — a level edge is the floor at any distance, an x1
rung makes the LTF tap unrefined, an LB edge is nothing. (5) Deepened run: a wick within
`eq_tolerance` through a zone younger than `confirm_bars` reopens the pending against
the original level with its taps and age. Known limit: a single-touch level older than
`story_lookback` is outside the structure — Sep 1 09:00's 29 016.75 (Aug 24 20:00, 179
bars) is caught only by the layering (the daily's target 28 947.75). Verified on the
same bars: Sep 2 07:00 `buy_story` at 28 927.25–28 947.75 with "the run deepened past
28 940.75 before the reclaim — the same trap"; Sep 2 11:00 `buy_story` held, the bear LB
29 171.25–29 211.75 `unrefined` and inducement "(the high 29 317.25 from the left is
intact)".

### V8 — Marco, YouTube `E2n7KMQDYIU`, reviewed 2026-09-19 — "Fix This Liquidity Mistake, Everything Will Change" (13:09)

Marco's own video, so `[SOURCE, V8]`; the row is in `docs/MARCO.md`'s source table.
Reviewed from the auto-generated transcript (396 segments, `youtube-transcript-api`,
scratchpad) plus 46 user screenshots in `tmp/Marco liq explanation mistakes/`
(filename prefix = timecode). The gold walkthrough is a *historical* chart — XAUUSD
OANDA at 3250–3460, i.e. Jul–Aug 2025 (the 4h frame at 09:05 shows the live price
4311.25 in the corner) — 1h → 30m → 15m.

**What he says.** The mistake (01:10–02:25, 06:25–07:00): after a high is run ("the
common retail trader would call [it] a BOS … it induces buyers") most traders mark the
last structural low and refuse to trade until it is run — "a pattern-based
perspective … you can actually trade above this low, but there has to be specific
things that need to occur … where is the trap occurring?" The diagram (02:26–06:25):
the pullback runs internal lows ("induces sellers — nothing for us yet", 08:29), a
rapid move up runs an internal high ("inducing buyers"), and the question is "this
low to this high — where did this reaction occur from? Look to the left-hand side"
(04:31–04:39): the move came off an internal low from the left, which is the
liquidity — "all you got to do is grab this low, drag it over" (05:04); its run traps
the induced buyers — "you don't need price below here [the structural low], you
needed price below here [the origin]" (06:19–06:21); "this is called pattern trading.
We are not doing that" (06:54). Caveats: without a trap inside the pullback the
structural low probably gets taken — "because we haven't had a trap anywhere else"
(07:50–08:12); the first reaction at the origin is not the trap — the market may "go
long again … all we have now done is induce buyers once more … as soon as those lows
are cleared, the buyers have been trapped" (05:45–06:17). Vocabulary: "trap" = the run
that catches the induced crowd *and* the LB it leaves ("we've created ourselves an LB
— this is now known as a trap", 11:36); "trading with structure" is the wrong frame
(10:38–10:50): "we've swept a high, which tells me we have taken some sort of
liquidity. Now all we need to do is wait … the price action has told us the story."
Reason for the long (10:05–10:30): "we need to have a reason to go long — a ton of
liquidity left at the highs": the trend line of falling highs, the internal highs, the
HTF external high.

**Gold, as read off the screenshots (Jul–Aug 2025 prices):**

| Frame | Level | What it is |
| --- | --- | --- |
| 1h 07:24 | ≈3250 low from the left, wicked; internal highs ≈3405, external ≈3452 | the leg's origin and the liquidity above |
| 30m 08:40–08:51 | lower low ≈3300 "induced sellers"; high ≈3346 run → "buyers induced" | the inducement pair inside the pullback |
| 30m 09:44 | zone 3290–3297 "from the left" — "we tapped into this" | the reaction origin = the internal low of the leg |
| 30m 10:58 | stab ≈3287 under the zone, below the previous daily low | the trap of the buyers |
| 15m 11:32–11:38 | build-up lows 3287–3290 → first stab ≈3285 = "an LB … a trap" | "we need to see a build-up", then the stab |
| 15m 11:50 | entry ≈3288, stop ≈3282.5 (5.2), target 3311.2 (22.9), RR 4.39 | second stab takes "this level of internal just to be safe"; stop "below the LB to the left"; T1 = the inducing spike high |
| 15m 12:29 | run to 3366–3368 | the HTF high; the 3346 line "a great partial point" |

**Mapping onto the engine.** The 15m entry is §4.2's four-candle model (stab = LB,
higher low, break → long) with §4.4's stop under the pre-existing LB; the targets are
the ladder split (the inducing spike = pullback origin, partial) and §5. The
"induces sellers → induces buyers → trap" sequence is the map's runs: minor run →
counter-side run → the run of the origin. Before this review the engine graded a
trap with an x1 swing intact beyond it `unrefined` and never let it set the story
(E1 build); V8 says the structural low is not required — a discrepancy that was
situational (inside `story_lookback` → unrefined, outside → clean), i.e. an artefact
of the 60-bar window, not of structure.

**Verdict.** Confirms: left liquidity as the reaction origin (E1's principle, now
Marco's words), build-up → stab = the trap (§6), the entry and stop mechanics (§4.2,
§4.4), the target ladder (§5, ladder split), "wait for a run, not a touch" (Principle
2), the HTF deciding whose trap matters (§3.1; "that aligns with that higher time
frame idea", 08:50), aggressive vs refined (11:00 "sometimes you take out another
level of internal"). Refines: (A) an unrefined LB sets the story — the deeper x1 is
the refined entry, not a requirement; (B) "pattern trading" has a second meaning
(§3.1); (C) the inducement sequence gives a forward-looking level — the trap pointer.
Reconciled with E1 by the anchor: a counter-side LB against a live story keeps E1's
structure test (MNQ 29 317.25 stays inducement); a same-side LB, or one with no story
to speak of, is graded by the origin (V8).

**Build (2026-09-19, all `[CALIBRATION]` on existing parameters).** Swing state in the
map, flipping on any consumed level (pokes and LB invalidations included); origin =
the extreme of the swing the inducing move came from, read at the flip
(`buyers_induced` / `sellers_induced`), `origin_run` when traded through; `left` =
build-up → (against a live story) nearest x1 swing → (with / without a story) the
intact origin → nearest x1 swing; `gradeOf` unchanged in shape; `inducement` =
(not clean or unqualified) and an opposing anchor alive; the story anchor = alive,
qualified, not invalid, not inducement; `trap` on the block and its event;
`map.origins` / `trap_pointers` exclude origins at an alive same-side LB extreme (E1
decision 1). Tests: `V8_TRAP` ×3 (pointer, the trap flips the story with 98.0 intact,
no pointer at an LB extreme); `UNREFINED_LEFT` now expects `buy_story`; all other
E1/V1/V6 fixtures and the MNQ/6B real-bar tests unchanged. Rejected: registering the
origin as a level (phantom levels; see *Approved changes*); flips only on qualified
runs (kills the gold example — the 3346 high was x1). Pine v11 mirrors it. Known
limit: with fine-grained flips a decline with bounces that run minor highs resets the
up-swing, so the origin can be a mid-leg low rather than the leg's start — the anchor
split covers the counter-side case, the same-side case names the nearest origin
(conservative in direction, aggressive in level).

**Gold 2025 replay (2026-09-19; `OANDA:XAUUSD` in bar replay at 2025-08-08, 60m/30m/15m
bars pulled from the chart, 30m seeded from 60m; ET times).** Dating from the bars:
Marco's 30m frames are Tue 29 Jul evening (price 3334), the stab under the zone is
Wed 30 Jul before FOMC (price 3308), the 15m entry is Thu 31 Jul evening and the
"fast forward" is Fri 1 Aug (NFP, high 3363.6).

- **27–29 Jul (30m).** 27 Jul 23:30 buyers induced (3340.3 run, origin 3324). 28 Jul
  09:30 the drop ran 3308.1 x2 → 10:00 bull LB 3301.8–3308.1 Q clean `trap` (it took the
  origin 3324) → `buy_story`; 15:30 the rally ran 3317.3 → buyers induced, origin
  3301.8 = the LB's bottom, so no pointer — the box says it. Marco: "induced sellers"
  (the 3301.8 low) → "buyers induced" (the 3345.5 high) → "if price now sells back off
  to trap the buyers …". The engine gave that low the status of a qualified trap and
  printed the long he calls "inducing buyers" (3308 → 3345 the same day); its box
  bottom is exactly the level he says must be run to trap them. 29 Jul 18:00:
  `up_continuation`, alive bull LB 3301.8–3308.1 TRAP, bear LB 3330.1–3334.3 inducement.
- **30 Jul (30m).** 09:30 the LB 3301.8 killed → LB 3298.4–3301.8 Q clean → 11:00
  killed → 12:30 breakdown; 14:30–15:30 the FOMC drop ran 3288.6 x1 (his zone "from
  the left" 3290–3297), 3282.7 x2 and 3274.6 x2 → breakdown 3274.6 (qualified) →
  `down_continuation`; low 3268.1. Marco: "take out another level of internal, and now
  you can maybe see price back down to the lows … we've taken previous daily low" ✓.
- **31 Jul (30m + 15m).** 01:00 the bounce ran 3298.8 → buyers induced, origin 3268.1 →
  the **trap pointer for longs 3268.1** on both frames. 03:45 the run of 3305.2 x2 → bear
  LB 3309.9–3315 → 30m `sell_story`, targets 3293.8 / 3268.1 / 3244.4 (3293.8 hit 10:30,
  3281.7 by 21:45 — the counter read of the day played, then NFP). 15m 10:30 the run
  of 3293.8 x3 → bull LB 3291.4–3293.8 Q clean → deepened → 12:15 LB 3289.7–3291.4 →
  13:00 `buy_story`, tap 3291.4 / stop 3289.2 / T1 3299.1 (RR 3.6) — **stopped at
  19:45** (low 3288.1) before the real trap: Marco's "you're not staying patient … all
  we have now done is induce buyers once more" in numbers. 19:15 the run of 3289.7 x2 →
  bull LB 3288.4–3289.7 Q clean → deepened 3288.1 → 20:30 LB 3286.6–3289.7 Q clean,
  `buy_story`; 21:30 the stab 3286.2 killed it (trade beyond the extreme), 21:45 3281.7,
  22:00 the reclaim bar (O 3283.8, C 3291.2) → LB 3281.7–3286.2 (x1) → `buy_story`: tap
  3286.2, stop 3281.3, targets 3299.1 x3 → 3311.3 → 3315. **Marco's trade on the same
  bars:** the build-up = the 19:15–20:15 lows 3288.4 / 3288.1 / 3286.8 / 3286.6 ("look
  how we had a build up"), the first stab 3286.2 ("we stabbed the low again — created
  ourselves an LB, now known as a trap"), the second stab 3281.7 ("taken out this level
  of internal just to be safe"), entry ≈3288.2 on the reclaim, stop 3283.0 — below the
  *first* LB, above the second stab's wick — target 3311.2, hit 1 Aug 08:30 (RR 4.39).
  The engine's version: entry 3286.2, stop 3281.3 (under the deepest wick, §2.3), T1
  3299.1 (RR 2.6), T2 3311.3 (RR 5.1). Same trade; his stop covers the first LB, ours
  the whole excursion.
- **1 Aug.** 08:30–09:00 the run of 3334.3 x3/x4, 3345.5 (his "buyers induced" line —
  "a great partial point") and 3349 x2; 15:30 3360.2 x3; close 3362.9.

What it says about the rules: (1) the structure matched Marco's narrative at every
stage; (2) on these bars the old rule would have read the 19:15 LB the same way —
3268.1 was already outside the 60-bar structure — so here V8 changed the pointer, not
the flip; the flip changes in the `V8_TRAP` fixture (the structural low inside the
window); (3) two calibration lessons, both built: the trap pointer expires with the
structure (`story_lookback` / `structBars`) — at 10:30 the 71-bar-old 3268.1 still
showed while the LB born then was graded clean; and the 30 Jul 20:00–21:30 shelf
3282.9–3286.8 never registered (flat neighbours — *Engine gaps*), so the 21:45 stab read
as the sweep of the LB extreme only — the LB and the story came anyway; (4) Marco's
stop sits under the *first* stab's LB, not under the deepest wick — not adopted (§2.3
stays), recorded.

### D2 — Elijah (IE), Discord, 2026-09-18 22:42 ET / 05:42 Athens Sep 19 — "EURO … a clean entry in London"

Instrument EURUSD (FOREXCOM) 15m + 5m — our `CME:6E1!`; basis on these bars: **6E is
spot plus 0.0040** (Sep-16 night low 1.14965 vs 1.14560; Sep-17 spike 1.15385 vs 1.14985).
Charts stamped Sep 18 22:34/22:40 UTC-4. The user's question: the W38 brief had 6E
**LONG (pullback)** — could we have caught this?

**His markup (spot → 6E).** 15m: the Sep-16 FOMC drop; the Sep-17 08:00–10:30 rally
running the 1.14880 (1.1528) and 1.14960 (1.1536) highs, blue arc on the spike top
1.14985 (1.15385); a rising "BUILDUP" trend line under the Sep-17 lows 1.14640 →
1.14760; the Sep-16 low 1.14560 (1.14965) extended right; a pink box 1.14760–1.14800
(1.1516–1.1520). 5m: a light-blue bear LB 1.14920–1.14940 (1.1532–1.1534) from the
spike — "DIRECT ENTRY HERE" at the Sep 18 00:00 ET Asia tap; two pink boxes (invalid
bull LBs, 1.1516–1.1520 and 1.1526–1.1528); "CONFIRMATION" = the 04:10 spike to
1.14921 (1.15321) over the 1.14880 highs and its reclaim → short **1.14877**
(1.15277), stop **1.14921** (1.15321), target **1.14561** (1.14961), hit 08:20 ET —
RR 7.2. Text: "this price action clearly shows where the liquidity in the market is"
— the build-up line and the Sep-16 low are the sell-side liquidity.

**Engine on 6E, bar replay at Fri 17:00 ET, 240/60/15/5 (60/15/5 seeded from 240),
weekly bias long, H4 grid 1.1417 (LB) ↔ 1.15975 (LB):**

| Moment (ET) | Elijah | Engine |
| --- | --- | --- |
| Sep 17 10:45, after the spike | external high run → direction short | 15m own story `sell_story` (bear LB 1.1536–1.15385, x1), targets 1.1512 / 1.15075 / **1.1498–1.14965 (LB, range extreme)** = his target; layered: **noise** against the weekly long inside the grid. 60m: `down_continuation` + **trap pointer for longs 1.14965** ("buyers induced by the 1.15235 run — their stops rest under 1.14965; its run is the trap, a reclaim there the long") |
| Sep 18 00:15, "direct entry" tap | tap of the 5m box 1.1532–1.1534 | the 6E spike 1.1532 stays under our box 1.1536–1.15385 (inner edge = swept level) — no tap printed; the 15m/5m bull LBs 1.1514 / 1.1516 graded **invalid, pocket over 1.15135 x2** = his pink boxes |
| Sep 18 04:20, "confirmation" | run of the 1.1528 highs to 1.15321, reclaim → short 1.15277, stop 1.15321 | 5m bear LB **1.15275–1.15305 = his entry**, graded invalid/inducement: the high 1.15315 (the 00:00 spike) from the left is intact — by **1 pip** on 6E (spot ran it by 1 pip); **trap pointer for shorts 1.15315** — "its run is the trap, a reclaim there the short" (= his trade, his stop 6 pips above it). 60m: the bear LBs 1.15225–1.15385 invalid, left = the leg's origin 1.15975; layered: noise |
| Sep 18 08:45, after the low run | target 1.14561 hit 08:20 | 15m + 5m **`buy_story`**: the x3 build-up 1.14965 run 08:15–08:25 and reclaimed → bull LB 1.1495–1.14965 Q clean; tap 1.14965 / stop 1.14945 / T1 1.1527 (15m) — the grid's lower edge moves to 1.1495 |
| Sep 18 15:15–16:00 | — | 1.1527 x2 run → bear LB 1.1527–1.153; the long's T1 hit (+30 pips); 15m `sell_story` = noise |

**Verdict — could we have caught it?** The *short*, as he traded it: **not by our
rules**. It is counter-bias (W38 6E long), on a Thursday (the Mon–Tue counter-trend
frame is closed), inside the H4 grid — the layered read calls every 15m/5m sell story
`noise` and the 1h grades the bear LBs invalid until the leg's origin 1.15975 is run.
The engine nevertheless *read the structure exactly*: at 04:20 the 5m bear LB
1.15275–1.15305 is his entry, the short-side trap pointer 1.15315 is his stop, the
range-extreme bull LB 1.14965 is his target. The *long* the brief waited for is the
other half of the same picture: the 1h trap pointer said from Sep 17 10:00 that the
buyers' stops rest under 1.14965 and its run is the trap; the run came 08:15–08:25
Sep 18 with the reclaim — 15m/5m `buy_story`, entry 1.14965, stop under 1.1495, T1
1.1527 hit at 15:15. His "clean entry in London" is the false move that hands us the
long (V1: "anticipate this false reaction … if there's a bullish opportunity you buy
back up"). Nothing in the journal for Sep 17–18: no daily brief was generated those
days (the last is 2026-09-15).

**Observations, no rule change.** (1) His light-blue LB 1.14920–1.14940 sits *below*
the swept level 1.14960 — a sweep-candle-body box, the second IE markup drawn that way
(Principle 4: "keep watching"; the 00:00 tap exists only under that box). (2) The
origin check is strict (`high > origin`): 6E's 1.15305 missed 1.15315 by a pip while
spot ran it by a pip — the basis decides a V8 trap at 5m granularity; Principle 2 (a
run, not a touch) says "not yet", which is what the engine said. (3) Elijah's 5m
pink boxes and our `invalid` (pocket over the x2 1.15135) coincide — the E1/V8 grade
matches his hand on the bull side too.

### U2 — user's 6E 30m markup, 2026-09-23 09:06 Athens (price 1.14655, weekly LONG, inval 1.1404)

**What the user drew.** Two arrows at bear LBs above price — "potentially very good
entries, even though against the HTF … a liquidity block, a build-up, the build-up gets
run and price goes the other way" — and three losing longs of 22 Sep, "all three against
the MTF trend, as is already visible". Asked for the MTF layer: how to read it, when it
agrees with the HTF.

**Bars (1h feed aggregated, Athens).**
- Leg: D highs 1.16965 (9 Sep) → 1.1683 → 1.1658 → 1.15975 (16) → 1.15385 (17) →
  1.15355 (21) → 1.1518 (22) → 1.1494 (23); D lows 1.16625 → … → 1.14965 (17) →
  1.1468 (22) → 1.1461 (23 05–09).
- Arrow 1 — Wed 16 Sep, 4h 09–13: high 1.15975 runs the 15 Sep 17:00 high 1.15935 and
  closes back → bear LB 1.15935–1.15975 (thin); next day 1.14965 (FOMC).
- Arrow 2 — Mon 21 Sep, 4h 13–17 (the 06–10 ET gate candle): high 1.15355 runs the equal
  highs 1.15300 / 1.15315 of 18 Sep — 1.15315 is the short-side trap pointer case D2 named —
  and closes back → bear LB 1.1530–1.15355; 1.1461 by
  23 Sep 09:00 (−89 pips).
- With-bias 4h LBs inside the leg: 1.1495–1.14965 (Fri 18) killed Tue 22 09–13;
  1.1473–1.1495 killed Tue; 1.1468–1.1473 killed Wed 23 05–09 → PENDING 1.1468.

**Our read at the time.** Weekly and daily briefs called 6E "aligned, weakest", the 4h
LB 1.1495 the trap, and every bear LB above `false` (pullback origin). The 22 Sep brief's
counter-trend short (Tuesday allowance) asked for **the run of 1.15385 x2**; the trap had
already happened on Monday at 1.1530–1.15315, 3 pips lower — requiring the structural
high when the build-up was run is pattern trading (b) by our own V8 rule.

**Verdict.** Two gaps, one layer: (1) no leg state, so mid-leg with-bias LBs read as
traps; (2) the counter-trend trigger took the structural high instead of the build-up
that was actually run. Rule candidate *MTF leg layer* above; (2) is already the V8 rule —
the counter-trend rows must apply the origin / build-up test the same way the with-bias
rows do.

### U3 — user's 6E 5m markup, 2026-09-24 09:38 Athens (price 1.1424, weekly LONG, inval 1.1404, 4h edge 1.1417 PENDING)

**What the user drew.** A rectangle at the low of the 1.1417 run (≈1.14065–1.1409, the
05:05–05:15 wicks) — "the LB that formed when price came back, which for some reason the
indicator does not show on 5m" — and two arrows at the 08:55 / 09:00 lows 1.1413: "the
build-up, buyers induced; now we can enter on the run of this build-up, where the alert
stands". His rule: after the run of a key level we look long → wait for a 5m build-up
(respecting lows, break of highs, induce buyers) → the order under the run of that
structure, the stop under the LB formed at the run. His view of our reclaim test: "a bar
close after the run gives little and often misleads".

**Bars (5m, Athens).**
- 03:15 first trade under 1.1417 (low 1.1416) · 03:50 extreme 1.14085, vol 1 621 · 04:10
  first close back over 1.1417 (1.1419).
- 04:55 back under (1.14125) · 05:10 extreme **1.14065**, close 1.1407 · 05:30 close 1.1417
  exactly · 05:40 close 1.14205 = first close strictly above, 6 bars after the extreme.
- 05:40–06:35 up to 1.1423 · 07:00 back to 1.1414–1.14145 (07:15 low 1.14125) · 08:55 low
  1.1413 · 09:00 low 1.1413 (**x2, the build-up**) · 09:05–09:10 highs 1.1423 / 1.14265 =
  the 06:35 high 1.14225 run (**buyers induced**) · 09:30 high 1.1428 · 09:40 close 1.1422.
- Below: 1.14065 x1 (the LB extreme) · **1.14035 x4** (the W-anchor build-up, inval W
  1.1404) · 1.1408 = the W39 anchor LB 1.1404–1.1408.

**Engine on the same bars (`marco scan --tf 5`, 09:41).** Story `sell_story` — "highs run
and reclaimed 0 bars ago at the bear LB 1.14265–1.1428 [AGAINST the week's long bias — a
false move, use it to enter with the bias]"; trap pointer bull **1.1413**, "buyers induced
6 bars ago (the high 1.14225 run) — their stops rest under the origin 1.1413 that move came
from: its run is the trap, a reclaim there the long"; long triggers 1.14125 x2 / 1.14065 x1 /
1.14035 x2, all "no LB beyond the trigger — no stop anchor". No bull block on 5m (gap above).

**Compare.** The user's structure read and the engine's 5m trap pointer coincide to the
tick: build-up 1.1413, induced at 1.14225, the run of 1.1413 = the trap → long. They
diverge on the LB: the user marks it by §2.4 (extreme ↔ swept level), the 5m map never
printed it because the close back took 6 bars > `confirm_bars` 3 — the calibration, not the
source, produced the miss. The 4h daily's `entry when` ("1h/15m close back over 1.1417 → tap
of the LB") was in fact satisfied at 06:00 (1h) / 05:45 (15m) and still read "1h: NOISE" at
09:04 — a second sign that the close-back proxy and the structure disagree.

**Stop.** The user's stop "under the LB" = under 1.14065 (≈1.1406, $81 from 1.14125). The
W-anchor build-up 1.14035 x4 sits 3 pips under that extreme — inside the pocket (§3.1,
respect tier): the run of 1.1413 can extend to it (V8: "the first reaction at the origin is
not the trap … induce buyers once more"). Stop under 1.14035 → ≈1.1401, 11.5 pips = $144,
RR 5.0 to 1.14705 / 7.1 to 1.14945 / 9.1 to 1.1518. A fill before 10:00 is outside the
London window by the plan's letter (a [CALIBRATION] window, the trader's call).

**Outcome.** _pending — fill in after the session._

**Verdict.** The read is V8 by the book and §4.2's 4-candle model one level up (candle 2 =
the 1.14065 wick, candle 3 = the 1.1413 lows, candle 4 = the entry). Our close-back reclaim
was a proxy for "the run left an LB / a reaction structure"; on 5m the proxy fails where
the structure is plain. Rule candidate *LTF build-up after the run = the entry; the close
back = the grid state only* (above) — two entry variants, both with SOURCE; the trader
will bring the video for the second.

### U4 — user's 6E W/D markup, 2026-09-25 12:03 Athens (price 1.1430, weekly LONG, inval 1.1404)

**What the user drew.** Three orange lines on W and D: the range top 1.1705 (the W25 /
Mon 15 Jun high, extended to the August run), a second top ≈1.1685–1.1690 (Thu 3 Sep high,
extended to the Wed 9 Sep run) and the range bottom 1.1404 (Tue 23 Jun, extended to now).
His read: "the whole week the bias was down with the target 1.1404 — x2 at least there,
plus two manipulations above: a break up with acceptance back below. We called it long.
What is the system missing?"

**Bars (CME 6E1!, sessions).**
- Range bottom: Tue 23 Jun L 1.14040 (ran the May-2025 W low 1.1408) · Thu 23 Jul L 1.14285
  · Tue 28 Jul L **1.14175** → 1.1404 x3 on D, x2 by §2.3 on W.
- Manipulation 1 (range top): Mon 15 Jun H 1.17050 → Wed 19 Aug close 1.1726 (first close
  above) → Fri 21 Aug H **1.17625** (W34 close 1.17335) → closes 1.1715 / 1.17245 → Wed 26
  Aug close 1.1701 (first back below) → Fri 28 Aug 1.1628 (W35 close); never above since.
- Manipulation 2 (lower high): Thu 3 Sep H 1.16850 (W36 high) → Wed 9 Sep H **1.16970**,
  close 1.16720 (run + close back the same day; W37 close 1.1638).
- Leg: W38 close 1.1523 (−115 pips) → W39 low **1.13970** Thu 24 Sep (1.1404 x3 run by 7
  pips, D close 1.14115 back above) → 1.1437 Fri (forming).

**Our read at the time (W39 brief, 20 Sep).** `LONG (aligned)`: W `buy_story` "lows run
and reclaimed 12 bars ago" at the bull LB 1.1404–1.1408 (fresh by `story_fresh_bars` 16),
invalidation weekly close < 1.1404, targets 1.17625 / 1.1964 / 1.2166; D the same LB 60
bars old (stale), "the high 1.1705 consumed 18 bars ago was an internal point: inducement
while the LB holds", trap pointer "sellers' stops over 1.17625 — its run is the trap". The
1h trigger list itself had "long sweep below 1.1404 (confirmed x2)", i.e. the pool the
invalidation sat on. W `draw`: "up x4 vs below x0" — 1.29435 x2 and 1.3319 x2 from 2021.

**Engine replay (offline, the chart's W 300 / D 300 bars, cut at the W36 and W38 closes).**
Why each step read long:

| Step | What the engine did | Rule / parameter |
| --- | --- | --- |
| W anchor | 1.1404–1.1408 alive 13 weeks, `respects = 0` | respect counted only inside the zone (*Engine gaps*) |
| W range top | 1.1705 and 1.1685 never W levels → no W event in Aug–Sep | `pivot_len` 3 on W (*Engine gaps*) |
| D run of 1.1705 | no close back within 3 bars → `high_breakdown`, unqualified (x1, 46 < 50 bars) | `confirm_bars`, `min_level_age` |
| D run of 1.1685 | 1.1685 not a D swing (run on its 3rd right bar) | `pivot_len` |
| Bias | a D sell read (300-bar window: stale Jan-top LB, targets 1.1404) loses to the fresh W `buy_story` | divergence rule (§3.1) |
| Draw | "up x4" from 2021 build-ups 12–19 W ATRs away | fuel has no reach limit |

With the candidate *HTF sell-side read of a range* parts 1–4 on: `short (aligned)` at both
cut-offs, D `sell_story` "highs run and reclaimed" at bear LB 1.1705–1.17625 (born Wed 26
Aug), targets 1.1566 → 1.1404, invalidation weekly close above 1.17625, W draw down
(above x0 vs below x2).

**Outcome.** Played out: 1.1404 x3 ran Thu 24 Sep (1.1397), the D closed back above the
same day. Today's live scan now reads it itself: "the x3 build-up at 1.1404 was the local
target, now taken … the run took the origin of the move that induced the crowd — the trap,
V8". The long setups of 22–23 Sep sat on the path to that target (see U2).

**Verdict.** The user's read is §3 step 2 by the book (V3, V4): a range with both sides
marked (1.1404 x3 ↔ 1.1705), the top run and price back inside → shorts back through the
range to the build-up; the second, lower run (1.1697) is the same trap repeated. Our
miss is not one rule but a chain: a bug that kept a 4-pip LB as the W anchor and put the
invalidation on the draw, a W map blind to the range top, a D that could not see a
failed breakout because the close back came late, and a draw that counted 2021 fuel. U2's
MTF leg layer is the intraday face of the same week; this case is the HTF face. Candidates
logged above; nothing built.

### V9 — Marco, YouTube `LWEuNvtjQNA`, reviewed 2026-09-27 — "Trade Liquidity Properly (MUST WATCH)" (17:32)

Marco's own video, so `[SOURCE, V9]`; the row is in `docs/MARCO.md`'s source table. Reviewed
from the auto-generated transcript (502 segments) and 195 frames taken by the analyst from
the video itself, one every 5 s, 1080p (`tmp/Marco when not to trade/`, filename = timecode;
contact sheets in `_sheets/`) — not the user's screenshots this time. The charts are
TradingView replay, UTC−4, and all four examples are September 2026 on instruments of the
watchlist. The reading is Principle 7; one calibration was built from the measurements the
same day (the `zone_run` read — *Approved changes*).

**What he says.** The subject is "when to actually stay patient, when to not trade when the
conditions are lower probability" (00:16). Diagram 1 (02:05–05:15): a high is run — "buyers
are induced" — and the low that move came from is "engineered liquidity"; "as soon as we take
out this low and this low, sells need to be off your cards 100%" (04:10); the leg that then
runs on to the deep lows is "not really a short you need to be involved in … we do not need to
participate in every single move. Quality over quantity" (04:21–04:34); "when you have early
buyers induced and then trapped, the only thing that should be on your cards is longs … it's
not wrong to be involved in it, it's lower probable" (04:59–05:16). Diagram 2 (05:18–07:22),
the low from the left left behind: "as soon as we stab below it, we have still trapped traders
and we still ran a level of liquidity — this long can occur and we can leave this low for the
future. Are these my favorite trades? Not my favorite … but it's still possible to take"
(06:51–07:10). Mirror (08:11): "as soon as we trade above this one, no more buying". How he
enters when the left level stays: "I will look for continuations on the way back up … I won't
look to catch the bottom" (09:45–10:05); waiting for the left level, sizing down and sitting
out are named as equally fine (09:39, 14:44–14:57). What the left level becomes: "this will be
a future target" (10:43, 14:36). What waiting for it costs: "even if you want to see that low
from the left get taken, you will stack up so many losses that way" (10:25); "you'll catch
yourself always marking the next low from the left-hand side and trying to continue looking
for sells" (15:57).

**The four examples, read off the frames.**

| Video | Chart | Inducement | The trap (his line) | Left from the left | What followed on his chart |
| --- | --- | --- | --- | --- | --- |
| 08:55–10:50 | XAUUSD 30m OANDA, 13–17 Sep | highs ≈4317.5 and ≈4341 run 15–16 Sep — "induced buyers many of times" | low **4253.635** (Mon 14 Sep) stabbed Wed 16 Sep on news, wick ≈4235 | **4223.505** (6 Aug), "price has been respecting it multiple times" — *Future Target* | ≈4380 on 17 Sep |
| 11:00–13:10 | NQ1! 2h CME, B-ADJ, 24 Aug – 18 Sep | high ≈30 040 run Fri 28 Aug (wick ≈30 090) | low **29 242.75** (Mon 24 Aug) stabbed Wed 2 Sep | **29 127.75** (3 Aug), a second line 29 189.50 | rally into the 8 Sep high (pink zone 29 960–30 100), the sell-off he sits out ("most likely no … an advanced technique", 12:00), the left low taken Mon 14 Sep — "now buys should be on the cards" — ≈29 950 on 18 Sep |
| 13:15–15:10 | EURUSD 30m OANDA, 1–10 Sep | lows ≈1.16275 / ≈1.16245 run Wed 9 Sep — *Inducing Sellers* | high **≈1.16495** run the same morning, wick ≈1.1654 | **1.16596**, the top of the area 1.16465–1.16596 "tapped multiple times from the left" — *Future target* | ≈1.1592 on 10 Sep; "you want to look for that buy again. No, don't do that" (13:58) |
| 15:15–16:50 | XAUUSD 1h OANDA, 1–17 Sep | the high from the left ≈4487 run Thu 3 Sep | low **4282.625** (Wed 2 Sep) run Mon 14 Sep — *Lower prob* for sells from there | 4223.505 | the 16 Sep high ≈4367 and spike low ≈4235 circled — *No more selling* |

**Engine on the same bars** (`OANDA:XAUUSD`, `CME_MINI:NQ1!`, `OANDA:EURUSD` pulled from the
chart 2026-09-27; engine defaults; 30 / 60 / 120 seeded from 240; closed bars only; ET;
`tmp/v9_replay.mjs`, `tmp/v9_h4.mjs`). Our NQ1! prints his levels to the tick (29 242.75,
29 127.75), so no basis shift.

| Example | On the timeframe he shows | On the 240 |
| --- | --- | --- |
| Gold 30m, 16 Sep | trap pointer at **4253.635** since 14 Sep 11:30; 14:30 bar L 4257.2 = `low_poke` (floor 4253.6); 15:00 bar L 4235.2 runs 4253.6 x2; 15:30 close → bull LB 4235.2–4253.6 Q clean `trap` → `buy_story` — **agrees**. The 1h tap is flagged "pocket — no entry until 4223.505 is run" | `buy_story`, the same LB — **agrees** |
| Gold 1h, 14 Sep | `buyers_induced` 2 Sep with origin **4282.6**; 14 Sep 05:00 run → bull LB 4278.3–4282.6 Q clean `trap`; killed 08:00 (low 4253.6) → `down_continuation`, "the trap failed", through 15 Sep; 16 Sep `sell_story` at bear LBs 4355.4–4360.5 and 4355.4–4361.6 (Q clean, both killed by 13:00), targets 4253.6 / 4223.5 — **the sells he calls lower probable** | `buy_story` from the 14 Sep 09:00 bar (LB 4253.6–4282.6 Q clean), held to the rally — **agrees** |
| NQ 2h, 2 Sep → 16 Sep | `buyers_induced` 26 Aug with origin **29 242.75**; 28 Aug bear LB 30 053.25–30 107.5 (x3 run) → `sell_story` toward the low — agrees with "back down to this low"; 2 Sep 06:00 bull LB 29 223.25–29 242.75 Q clean → `buy_story` — **agrees**; 8 Sep bear LB 30 000.5–30 060.75 Q clean `trap` → `sell_story` — **the short he sits out** (its tap 30 000.5 never came, high 29 929.75); 11 Sep `down_continuation`; 14 Sep 04:00 bull LB 29 112.25–29 127.75 Q clean → `buy_story` — **agrees**; 16 Sep killed by the FOMC spike (29 053) → `down_continuation` while price went to 29 916 | `down_continuation` at every one of those moments: each bull LB unqualified and inducement under the alive bear anchors (30 082–30 107.5, 30 616–30 639), the 2 Sep LB included although it carries `trap` — **disagrees** |
| EUR 30m, 9 Sep | `sellers_induced` 05:30 (level 1.16276, origin **1.16494**); 08:00 `origin_run` → bear LB 1.16494–1.16544, `trap`, unqualified (x1, nine bars old) and inducement under the bull anchor 1.15848–1.15936 → no flip; 11:00 bull LB 1.16202–1.16208 Q clean `trap` → `buy_story`, targets 1.166 / 1.1675 — **the buy he forbids**; killed 10 Sep 07:30 | `up_continuation`; the bear LB *invalid* — "the high 1.166 x2 from the left is intact: a pullback origin, not a flip" — **disagrees** |

The inducement and its origin were found on every example (four of four, to the tick);
the differences are in what the engine does next — the verdict at a level left beyond the
trap, the read after the trap's zone is killed, and the flip on the next counter-side LB.

**Outcome (to the close of Fri 25 Sep).** Gold: 4223.505 never run, low 4235.165 (the trap),
high 4399.67 on 18 Sep, close 4284.97. EURUSD: 1.16596 never run, high 1.16544 (the trap), low
1.13592 on 24 Sep, close 1.13911. NQ: low 29 053 on 16 Sep, high 31 094.75 on 23 Sep.

**Measured, because four examples chosen by the author prove nothing**
(`tmp/v9_measure.mjs`, `tmp/v9_grades.mjs`; zone-tap entries: entry at the swept level, stop
beyond the extreme + 0.1 ATR, thin zones skipped, the tap bar cannot pay; MGC / MES / MNQ / 6E
on 240 ≈ 10 months, 60 ≈ 4.5 months, 30 ≈ 2 months; no costs, entries overlap — read the
differences, not the levels):

| Zone taps, four futures | n | reached 1R | 2R | 3R |
| --- | --- | --- | --- | --- |
| every LB | 1710 | 41% | 30% | 23% |
| qualified | 405 | 46% | 32% | 25% |
| unqualified | 1305 | 39% | 29% | 22% |
| `trap` (the run took an origin) | 252 | 44% | 31% | 23% |
| grade *invalid* | 523 | 40% | 29% | 22% |
| a build-up left beyond the extreme | 168 | 39% | 27% | 17% |
| nothing left beyond | 1148 | 41% | 31% | 23% |
| break-even | | 50% | 33% | 25% |

The lock itself (seven series, 2921 taps, target 2R): against the lock 30% (literal) / 28%
(anchor), with it 27% / 27% — nothing. Qualification is the only label with a steady effect
(+7 points at 1R); a build-up left beyond the trap costs the far targets (17% against 23% at
3R) — his "not my favorite", in numbers; the *invalid* grade as a whole and the inducement
flag separate nothing.

**Second pass, the same evening — "the trap failed"** (the trader: "давай виміряємо"; deep
history, 1385 episodes; the table is in *Rule candidates*). After a killed trap LB price went
X ATR with the engine's "continuation" first in 49 / 50 / 49% (1 / 2 / 3 ATR) — a coin, and
so is the opposite claim; 52% of those reads became a deeper trap on the same side within a
median of two bars, 37% a breakdown within three. The gold and NQ kills of the examples above
were ordinary members of that 52%.

**The journal against it** (42 trades, 31 Aug – 24 Sep, 13 winners, net +$3314;
`tmp/v9_frequency.mjs`). Inside his own chart window: MNQ six longs on 8–9 Sep, bought into the
sell-off he sits out before the left low was taken, −$792, and the long of 16 Sep after it was
taken, +$1284 (the long of 10 Sep, +$536, came before it as well); MGC short of 16 Sep 02:04
ET, two days into "sells lower probable", −$197; 6E on 9 Sep — a short at 07:26 ET stopped by
the trap's spike (−$117), a short at 09:03 ET after it (+$177). Beyond his window, the
analyst's extension and marked as such: 6E five longs on 22–24 Sep, −$835, under a "no more
buys" nothing had cancelled; MGC seven longs on 22–24 Sep, net −$1009, on the side of his
lock but bought into a decline with 4223.5 intact below — state 3 of Principle 7. What the
journal shows without any lock is in *Rule candidates* → "Attempts per idea".

**Verdict.** Confirms: the trap as the run of the origin (Principle 6), "a run, not a touch"
(Principle 2), counter-story LBs marked and never entered (§3, V1), the H4 as the layer that
carries the story — on gold it held the long through a killed 1h zone. Adds the negative side
(Principle 7) and the phrase *future target*. Contradicts, in the engine: the verdict "no
entry until the floor is run" (pocket flag, *invalid* grade), the side flip on a killed trap,
the H4 anchor rule on NQ (a `trap` LB read as inducement for two weeks while it was the low).
Does **not** give a mechanical filter: measured, the lock separates nothing, and applied to
the journal it would have endorsed the longs of W39. Candidates logged above. Built from the
case, the same day: the side flip on a killed trap is gone (`zone_run`, direction 0 —
`docs/MARCO.md` §3); the pocket verdict and the attempts rule wait for the trader; the Pine
is unchanged.

**Correction to the analyst's first read (2026-09-27, before the replay).** "V9 conflicts
with E1's *invalid* grade on the gold example" was wrong as stated: the engine graded the
16 Sep LB *clean* — 4223.5 was born in August, outside the structure window
(`story_lookback`) — and read `buy_story`. The conflict is real but sits elsewhere: in the
pocket flag on the 1h tap of the same LB, and in the *invalid* grade of the EUR 4h bear LB.
