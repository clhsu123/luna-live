# Luna character animation assets

Generated with the built-in imagegen tool, November 17, 2026. No external Anam or
LiveAvatar session is needed to display them. Each PNG is 1536x1024, 4 columns by
2 rows. Per-frame viewport: 384x512. manifest.json records file hashes and sizes.

References: unchanged ../after-hours.png for 01–10, ../office.png for 11–20.
Each output uses the corresponding character in row-major order; preserve that
character's face, hairstyle, clothing and semi-realistic comic illustration style.

Prompt set: create a production animation sprite sheet of the referenced adult
character, age 25+. Exactly eight equal cells, fixed camera, consistent scale and
blurred background; head through hips with room for hair, shoulders and hands.
No labels, borders, text or gutters. Row-major poses: neutral eyes open; eyes fully
closed for blink; neutral eyes open; subtle left head turn; chin-down nod; subtle
right head turn with smile; small friendly hand wave; return neutral. Actual changes
to the facial/head/hand pose, not whole-picture transforms. Maintain identity and
outfit in every frame. The later regenerated 09, 10, 15 and 20 explicitly request
20 pixels of hair margin within each cell.

These are generated pose frames, not continuous video, skeletal animation or
speech visemes. Runtime timing is in shared/portrait-motion.mjs. Original reference
portraits remain the fallback and picker thumbnails. Tight hairline margins and
small frame-to-frame composition changes are visible in some generated sheets;
visual motion-quality acceptance is required before release.
