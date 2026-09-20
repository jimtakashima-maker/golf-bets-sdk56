# Course library data notes (not uploaded to Firebase)

These are the data-quality caveats and sourcing context originally attached
to each course as a `notes` field. Jim asked to drop descriptions from the
uploaded records (courses-data.json / Firebase) and store only ratings and
yardages, needed for handicap calculations - this file keeps the research
context on file instead of discarding it.

## Glen Oaks Golf Course (Farmington Hills)

Oakland County Parks public course, par 70. Hole-by-hole par/handicap from the official scorecard, confirmed across two independent official PDF extractions. Tee yardages recomputed from per-hole totals (the printed total was inconsistent across extractions); rating/slope as printed. GolfLink lists the Back tee slightly differently (69.4/123) - minor cross-source conflict, not resolved.

## Rackham Golf Course (Huntington Woods)

Donald Ross design (1924), par 71. Hole-by-hole par/handicap agrees exactly across two independent sources. Course rating agrees closely across sources (~70.8 for the Blue tee), but SLOPE RATING CONFLICTS SIGNIFICANTLY between sources (118 here vs up to 129 elsewhere for the same tee) - verify against an official scorecard or GAM printout before relying on it for anything handicap-sensitive. Some sources show women's tees playing to a different total par (72); not reflected here.

## The Orchards Golf Club (Washington Township)

Arthur Hills design, par 72, former LPGA Tour stop (Oldsmobile Classic / Franklin American Mortgage Classic). High confidence - two independent sources agree closely on every number (yardages within ~20 yards of each other, hole-by-hole par/handicap identical). Not to be confused with the similarly-named 'Orchard Golf & Country Club' (singular), a different, unrelated club.

## Fox Hills Golf & Banquet Center - Golden Fox (Plymouth)

Arthur Hills design, par 72 (the Golden Fox course specifically - Fox Hills also has other 18s, not this entry). Hole-by-hole handicap index is single-sourced (GolfPass) - recommend confirming against the physical scorecard before high-stakes use. Black tee rating has a minor cross-source conflict (73.3 vs 73.6).

## Indianwood Golf & Country Club - Old Course (Lake Orion)

Men's tees only, par 70 - the Old Course's women's markers play to a different total par (73) and aren't included here. Hole-by-hole handicap index is single-sourced (GolfPass) - confirm before high-stakes use. Indianwood also has a separate New Course, not this entry.

## Warwick Hills Golf and Country Club (Grand Blanc)

Former PGA Tour Buick Open host (1977-2009), par 72. Hole-by-hole par/handicap agrees exactly across two independent sources. COURSE RATING/SLOPE CONFLICTS MEANINGFULLY BETWEEN SOURCES ON EVERY TEE (up to 0.6 rating points and 5 slope points) - do not trust for handicap-sensitive betting without checking an official scorecard or the GAM database.

## Prestwick Village Golf Club (Highland)

Ron Garl / Kurt Sandness design, par 72. Entire hole-by-hole table is single-sourced (18Birdies) - no second source available to cross-check. GolfLink's Gold-tee rating/slope (73.3/132) conflicts with the figure used here (74.5/137) even on the one data point both report; treat as approximate until verified against the physical scorecard.

## Radrick Farms Golf Course (Ann Arbor, University of Michigan)

Pete Dye design (1965), University of Michigan-owned. LOWEST CONFIDENCE ENTRY IN THIS LIBRARY: no public official scorecard exists (checked the U-M course site and info-guide PDFs - neither has ratings or handicap data). Three mutually-conflicting hole-handicap sequences were found across aggregator sources with no way to adjudicate between them; the sequence used here is the one appearing on two sources (GolfPass, 18Birdies) but is NOT verified against an official card. Par is also disputed - GAM tournament play has used a modified par 70 (holes 1 & 5 as par 4s) vs. the standard par 72 used here. Course rating/slope also varies by source by up to 0.7/10 points. DO NOT rely on this entry for real-money stroke allocation without confirming against the current physical scorecard or calling the pro shop (734-998-7040).
