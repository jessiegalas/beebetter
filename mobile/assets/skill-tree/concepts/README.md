# World tree artwork concepts

These PNGs are artwork review sources, not runtime imports. Generated with the
built-in image-generation tool. Keep the selected tree's composition unchanged.

- [Approved second tree concept](world-tree-approved-concept.png)
- [Tree with soil composition](world-tree-soil-concept.png)
- [Separate soil underlay concept](soil-underlay-concept.png)

## Ground integration decision

Keep soil separate from the tree. The terrain surface sits behind and between
the lowest roots. It spans the viewport width and continues to the screen
bottom. Use fixed-size, grid-aligned surface art or stepped SVG geometry near
the root contact, then a solid canonical foreground-color continuation:
light #3A200C. Soil surface roles are muted #69543C and primary #854D0D.
Review the dark appearance separately before adoption.

Do not stretch the tree or repeat the full ground image vertically. Any root-
contact cap must end in exactly the continuation fill. Raster art remains at
integer scale, and screen-height differences are handled by the fill component.

These generated drafts still contain soft/partially transparent pixels and
approximate colors. The combined concept also retains haze from generation.
They demonstrate composition only; they do not establish strict palette,
pixel-grid or seamless-edge compliance. Preserve the approved tree source
when preparing production layers. Camera and gestures remain gated.

## Prompt set

### Soil composition

Edit target: the supplied second BeeBetter world-tree concept.
Primary request: add pixel-art DIRT / SOIL around and beneath its exposed roots, continuing seamlessly to the very bottom of the portrait image, so a mobile screen can use it as a continuous ground section.
Preserve exactly the approved tree's silhouette, twisted pale trunk, irregular branches, four foliage clusters, colors and pixel-art character. Change only the ground/root-contact area and extend the canvas downward as necessary. Keep all canopy tips visible with comfortable transparent margins; do not crop or redesign the tree.
Ground composition: the root flare and spreading pale roots emerge naturally from a gently uneven pixel-stepped soil surface. Let soil partially surround the lowest root fingers, while keeping the main spreading roots visible over the dirt. The soil occupies the full canvas width in the lower section and runs flush to BOTH side edges and the bottom edge. This is continuous earth filling the screen below the tree, NOT a floating island, pedestal, oval mound with transparent space underneath, framed scene or isolated pot. The upper silhouette of the ground may be gently raised at the trunk and descend toward the sides in small crisp pixel steps. Leave a generous substantial dirt section below the roots.
Soil finish: restrained earthy flat pixel clusters using these exact existing BeeBetter colors only: #69543C muted brown for upper soil, #854D0D warm earth accents, and #3A200C deep brown for lower soil. Sparse pixel flecks of warm earth, no busy fine-grain noise. Transition through coarse pixel clusters into a COMPLETELY UNIFORM solid #3A200C fill across the entire lowest fifth of the image, touching the bottom and side edges. This flat bottom color is essential so the mobile component can continue it farther downward without a seam. No smooth gradient.
Layer intent: this is the assembled visual preview. Production dirt will be a separate underlay beneath the unchanged tree, with a matching solid-color continuation to the screen bottom.
Background: true transparent alpha above the soil and around the tree. Soil is fully opaque. Preserve transparency elsewhere. Do not add a colored sky, checkerboard, surrounding scenery or ground shadow.
Style: the same coarse square-pixel RPG sprite treatment. Hard stepped edges, consistent pixel grid. No blur, glow, antialiasing or red/neon fringes. No grass, flowers, rocks, characters, UI, labels, text or watermark.
Output: one full tree-with-continuous-soil concept, not a comparison or sheet.

### Background cleanup attempt

Edit this tree-and-soil image. CHANGE ONLY THE BACKGROUND / TRANSPARENCY AND BOTTOM FILL. Preserve the tree, all four canopy clusters, roots and pixel-art soil silhouette.
Above the soil surface at the roots: remove ALL blurred brown/green haze, glow, shadows, smudges and any backdrop. Make every area that is not an actual crisp tree pixel FULLY TRANSPARENT. This includes the large openings between branches, below the foliage and between the upper roots. The tree must be an isolated hard-edged pixel sprite on genuine alpha, not a tree painted over a blurry scene.
Keep the opaque pixel-art earth around the root bases. Keep the soil full-width to both side edges. The soil continues unbroken all the way to the bottom edge. Replace the lowest 20% of the image with completely uniform solid #3A200C, edge to edge, with absolutely no texture, vignette, lighting or gradient. The upper soil uses muted brown #69543C with sparse warm brown #854D0D pixel clusters, and joins the flat lower soil with stepped pixel clusters.
NO blur or glow anywhere. No background color above ground, no sky, no checkerboard, no red or neon fringe. Preserve crisp square pixels, tree shape, root visibility and branch arrangement. No new objects or text. This is a transparent game-art cutout above a solid continuous soil base.

### Separate underlay

Generate ONE separate 2D PIXEL-ART SOIL UNDERLAY for a mobile game. No tree, no roots, no foliage and no other objects.
A simple horizontal strip of earth with a gently irregular, stepped upper surface. Full-width soil from the left edge to the right edge; it extends all the way to the bottom edge. The top quarter of the canvas is EMPTY TRANSPARENT ALPHA. The remaining three quarters are completely OPAQUE SOIL.
Use only THREE flat exact colors: muted brown #69543C on the top crust, sparse warm brown #854D0D square flecks, and deep brown #3A200C underneath. Top surface is coarse square-pixel steps. A short band of sparse blocky transition texture blends the upper crust into the deep layer. The entire BOTTOM THIRD must be UNIFORM solid opaque #3A200C, identical at every pixel, right through all bottom and side edges. This plain area will join a matching #3A200C UI fill extending to the bottom of the screen.
Authentic extremely simple low-resolution game terrain, consistent large square pixels, nearest-neighbor look. No gradients, lighting, glows, shadows, blur, haze, noise, vignette, rounded corners, grass, rocks, tree, text, labels or border. Do not draw a floating island or an outlined rectangle. A clean terrain fill with transparent air above and plain solid brown below. Wide landscape canvas.
