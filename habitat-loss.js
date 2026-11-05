/* Pollution over the landed photographs. One value (0–1) runs each real photo through a kind of
   pollution that people cause in that habitat. The damage is drawn in WebGL on top of the photo, in
   the photo's own perspective, and keeps its light, haze and grain:
     ocean       Ningaloo lagoon:      a dredger, its plume of mud, smothered coral, a dead reef
     freshwater  Okavango floodplain:  litter, farm runoff, an algal bloom, dead water
     island      Fernandina shore:     plastic washing up, an oil spill, oiled shore
     grassland   Serengeti plains:     road traffic and dust, plastic bags, burning rubbish, farm chemicals
   The forest effect (forest-loss.js: logging, burning and the haze it makes) registers here too.
   These are illustrative simulations, not records of what has happened at these places. */
(() => {
    'use strict';

    const VERTEX = `attribute vec2 a; varying vec2 vPos;
void main() { vPos = vec2(a.x * .5 + .5, .5 - a.y * .5); gl_Position = vec4(a, 0., 1.); }`;

    // Shared by the effects below: the photo, two soft copies of it (local light; wider surroundings),
    // noise, and a ground plane seen in perspective from the photo's horizon.
    const HEAD = `precision highp float;
uniform sampler2D uPhoto, uBlur, uWide;
uniform vec2 uLayer;     // layer size, CSS px
uniform vec4 uFit;       // photo left, top, width, height within the layer, CSS px
uniform float uP, uTime, uAspect, uPx;   // progress, seconds, photo width / height, photo height in canvas px
varying vec2 vPos;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
    float s = 0., a = .5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= .5; }
    return s;
}
float luma(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
// Signed distances: a box (centre, half size) and a line segment.
float box(vec2 p, vec2 c, vec2 h) { vec2 d = abs(p - c) - h; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
float segment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
float cover(float d, float w) { return 1. - smoothstep(-w, w, d); }
// Flat ground (or sea) below a horizon at height h of the photo: x across, y the distance.
vec2 ground(vec2 uv, float h) { float d = 1. / max(uv.y - h, .002); return vec2((uv.x - .5) * uAspect * d, d); }
// An upright object standing on that ground at (x across, z distance): p in ground units from its
// foot, y up. Divide sizes by z to get photo heights.
vec2 standing(vec2 uv, float h, vec2 at) { return vec2((uv.x - .5) * uAspect - at.x / at.y, h + 1. / at.y - uv.y) * at.y; }
// A smoke plume rising from a point on that ground (x across, z distance), leaning with the wind.
float plume(vec2 uv, float h, vec2 at, float size, out float rise) {
    float sy = h + 1. / at.y, sx = .5 + at.x / (uAspect * at.y);
    float w0 = size / at.y; rise = sy - uv.y;
    float xw = (uv.x - sx) * uAspect - rise * rise * 1.4;
    float wide = w0 * (1. + rise * 5.);
    float body = exp(-xw * xw / (wide * wide)) * smoothstep(-.01, .02, rise) * (1. - smoothstep(.1, .4, rise));
    return body * smoothstep(.3, .72, fbm(vec2(xw, uv.y + uTime * .025) * (2.6 / w0)));
}
// Litter lying on the ground or floating: bottles, fragments, rope and crumpled bags, one piece at most
// per grid cell. amount: the chance a cell holds a piece; scale: cells per ground unit; bags: the share
// of bags. Returns the piece's coverage, its colour and the shadow it casts beside it.
float litter(vec2 g, float px, float amount, float scale, float bags, out vec3 tint, out float shadow) {
    tint = vec3(0.); shadow = 0.;
    vec2 cell = g * vec2(scale, scale * .8);
    vec2 id = floor(cell), f = fract(cell) - .5;
    float r1 = hash(id), r2 = hash(id + 7.1), r3 = hash(id + 3.7), r4 = hash(id + 11.3);
    if (r4 >= amount) return 0.;
    vec2 q0 = f - (vec2(r2, r3) - .5) * .5;
    float a = r1 * 6.283;
    mat2 turn = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 q = turn * q0;
    bool bag = fract(r1 * 7.7 + r2 * 3.1) < bags, rope = !bag && r3 < .14;
    vec2 size = rope ? vec2(.34, .012) : bag ? vec2(.15, .11) * (.7 + .6 * r2) : mix(vec2(.05, .025), vec2(.17, .055), r2 * r2);
    float cellPx = px * scale;
    float d = length(max(abs(q) - size, 0.)) - .01;
    if (bag) {   // a crumpled, lobed outline
        float ang = atan(q.y, q.x);
        d = (length(q / size) - .8 - .22 * sin(ang * 3. + r3 * 6.) - .12 * sin(ang * 5. + r2 * 4.)) * size.y;
    }
    float item = (1. - smoothstep(-cellPx, cellPx, d)) * min(1., size.y * 2.5 / cellPx);
    float ds = length(max(abs(turn * (q0 - vec2(.012, -.03))) - size * .9, 0.)) - .02;
    shadow = (1. - smoothstep(-cellPx * 2., cellPx * 2., ds)) * (1. - item);
    vec3 c = r1 < .3 ? vec3(.9, .92, .9) : r1 < .45 ? vec3(.2, .42, .75) : r1 < .56 ? vec3(.78, .25, .18) :
             r1 < .66 ? vec3(.88, .74, .26) : r1 < .8 ? vec3(.36, .55, .38) : vec3(.74, .74, .68);
    if (rope) c = vec3(.2, .48, .5);
    if (bag) c = r2 < .5 ? vec3(.94, .94, .92) : r2 < .7 ? vec3(.3, .45, .8) : r2 < .85 ? vec3(.12, .12, .13) : vec3(.86, .3, .26);
    c = mix(c, vec3(luma(c)), .25);                                         // faded by the sun
    float t = q.y / size.y;                                                 // across the piece, -1 to 1
    if (bag) c *= .72 + .4 * noise(q * 60. + r1 * 9.);                      // creases
    else {
        c *= .55 + .5 * (1. - t * t);                                       // rounded, lit from above
        c += vec3(.35) * exp(-pow((t + .45) * 4., 2.)) * (rope ? .2 : 1.);  // a glint along it
    }
    tint = c;
    return item;
}
`;
    const TAIL = `
void main() {
    vec2 uv = (vPos * uLayer - uFit.xy) / uFit.zw;
    vec3 photo = texture2D(uPhoto, uv).rgb, blur = texture2D(uBlur, uv).rgb;
    gl_FragColor = vec4(clamp(effect(uv, photo, blur), 0., 1.), 1.);
}`;

    // ---- Ocean: Ningaloo lagoon. Dredging ------------------------------------------------------
    const OCEAN = HEAD + `
const float H = .262;                   // the sea horizon, as a fraction of the photo's height
const vec2 DREDGER = vec2(2.3, 9.);    // where the dredger works: across, distance (ground units)

// The dredger, side on with its bow to the left: p in ground units from the waterline, y up.
vec4 dredger(vec2 p, float w) {
    float bow = dot(p - vec2(-.62, 0.), normalize(vec2(-.14, -.18)));
    float hull = max(box(p, vec2(0., .07), vec2(.8, .07)), bow);
    vec3 col = mix(vec3(.42, .13, .08), vec3(.17, .18, .19), smoothstep(.08, .09, p.y));
    col = mix(col, vec3(.85, .84, .8), cover(abs(p.y - .135) - .006, w) * .7);   // deck rail
    float a = cover(hull, w);
    float house = min(box(p, vec2(.5, .2), vec2(.18, .07)), box(p, vec2(.47, .3), vec2(.12, .035)));
    float glass = box(p, vec2(.47, .3), vec2(.105, .011));
    float funnel = box(p, vec2(.65, .33), vec2(.035, .065));
    float frame = min(min(segment(p, vec2(-.46, .14), vec2(-.46, .44)), segment(p, vec2(-.2, .14), vec2(-.2, .44))),
                      segment(p, vec2(-.5, .44), vec2(-.16, .44))) - .012;
    float arm = segment(p, vec2(-.33, .44), vec2(-1.08, -.02)) - .02;   // the suction arm down into the sea bed
    col = mix(col, vec3(.86, .85, .8) * (.9 + .1 * step(.2, p.y)), cover(house, w)); a = max(a, cover(house, w));
    col = mix(col, vec3(.1, .12, .14), cover(glass, w));
    col = mix(col, mix(vec3(.82, .6, .16), vec3(.08), step(.37, p.y)), cover(funnel, w)); a = max(a, cover(funnel, w));
    col = mix(col, vec3(.8, .55, .12), cover(frame, w)); a = max(a, cover(frame, w));
    col = mix(col, vec3(.22, .22, .22), cover(arm, w) * step(-.005, p.y)); a = max(a, cover(arm, w) * step(-.005, p.y));
    return vec4(col, a);
}

vec3 effect(vec2 uv, vec3 photo, vec3 blur) {
    float lum = luma(photo), blum = luma(blur);
    float below = smoothstep(H + .002, H + .008, uv.y);
    // Water is bluer than red by a wide margin (sand, scrub and the white surf are not).
    float water = smoothstep(.11, .19, photo.b - photo.r) * below;
    float deep = 1. - smoothstep(-.13, -.07, photo.g - photo.b);   // the darker lagoon over coral
    float lagoon = smoothstep(.292, .33, uv.y);                       // inside the reef crest
    vec2 g = ground(uv, H);
    float far = 1. - smoothstep(H, .5, uv.y);
    float px = g.y / uPx;
    // Coral: patchy structures across the lagoon, and the photo's own dark coral heads.
    float patch = fbm(vec2(g.x * 1.2, g.y * 1.6) + 3.);
    float heads = smoothstep(-.005, .035, blum - lum);
    float coral = water * lagoon * mix(.35, 1., deep) * clamp(smoothstep(.36, .6, patch) * .9 + heads * .6, 0., 1.);

    float arrive = smoothstep(.02, .12, uP);    // the dredger steams in
    float spread = smoothstep(.1, .56, uP);     // its plume spreads with the current
    float smother = smoothstep(.5, .78, uP);    // silt settles on the coral
    float dead = smoothstep(.78, 1., uP);       // algae over the dead reef

    vec3 col = photo;
    // The plume: mud stirred up at the dredger, carried along the coast and towards the beach.
    float t = uTime * .015;
    vec2 at = DREDGER + vec2((1. - arrive) * 6., 0.);
    vec2 rel = g - at;
    vec2 warp = vec2(fbm(g * .22 + vec2(t, 0.)), fbm(g * .22 + vec2(5.2, -t))) - .5;
    // A tongue of mud trails from the dredger with the current, along the coast and in to the beach,
    // widening as it goes; then the whole lagoon clouds over.
    vec2 w = rel + warp * mix(.8, 4., spread);
    vec2 dir = normalize(vec2(-.55, -.6)), side = vec2(-dir.y, dir.x);
    float along = dot(w, dir), across = dot(w, side);
    float L = mix(1.2, 14., spread);
    float W = .25 + max(along, 0.) * .3;
    float tongue = smoothstep(-.5, .1, along) * (1. - smoothstep(L * .55, L, along)) * exp(-across * across / (W * W));
    float sheet = smoothstep(.34, .62, uP);
    float core = exp(-length(rel * vec2(.7, 1.)) / .45);
    float swirl = fbm(vec2(w.x * .5, w.y * 1.1) * 1.4 - vec2(t * 3., 0.));
    float dens = max(tongue, sheet * (.45 + .4 * smoothstep(.4, .6, swirl))) * (.5 + .8 * swirl) + core;
    float silt = smoothstep(.22, .55, dens) * smoothstep(.06, .14, uP) * water;
    silt *= 1. - .3 * smother * (1. - dead * .4);   // the heaviest mud settles out of the water…
    // …onto the coral, which turns grey-brown and dies, then furs over with algae.
    float order = noise(g * vec2(.6, .9) + 9.) * .6 + patch * .4;
    float killed = smoothstep(order - .08, order + .08, smother * 1.2 - .05) * coral;
    vec3 silted = vec3(.5, .46, .37) * (.85 + .3 * noise(g * 7.));
    silted = mix(silted, photo + vec3(.18, .14, .06), far * .5);
    col = mix(col, silted, killed * .8);
    vec3 weed = mix(vec3(.27, .29, .17), vec3(.38, .35, .2), noise(g * 6. + 2.));
    col = mix(col, mix(weed, photo, far * .4), killed * dead * .85);
    // Turbid water: milky, khaki mud that keeps the ripples of the surface.
    vec3 mud = mix(vec3(.52, .44, .3), vec3(.7, .6, .42), swirl) * clamp(lum / max(blum, .05), .8, 1.2) * (.8 + .35 * blum);
    mud = mix(mud, mud * vec3(.85, 1., .82), dead * .6);                 // greener as algae take over
    mud = mix(mud, blur * .5 + vec3(.3, .3, .24), far * .55);
    col = mix(col, mud, silt * .85);
    // Silt lines the water's edge on the beach.
    float wetSand = (1. - water) * below * smoothstep(.02, .1, texture2D(uWide, uv).b - texture2D(uWide, uv).r) * smoothstep(.45, .7, lum);
    col = mix(col, col * vec3(.82, .76, .66), wetSand * spread * .5);
    col = mix(col, vec3(luma(col)) * vec3(.98, 1., .94) + .02, water * dead * .25);

    // The dredger itself, with its reflection and the churned water round it.
    vec2 sp = standing(uv, H, at);
    float pw = at.y / uPx;
    vec4 ship = dredger(sp, pw);
    vec4 mirror = dredger(vec2(sp.x + .015 * sin(sp.y * 160.), -sp.y), pw);
    col = mix(col, mix(col * .6, mirror.rgb, .25), mirror.a * step(sp.y, 0.) * .45 * water * arrive);
    float wash = exp(-pow(length((sp - vec2(-.9, 0.)) * vec2(.6, 6.)), 2.)) * arrive;
    col = mix(col, vec3(.86, .84, .76), wash * .35 * water);
    col = mix(col, mix(ship.rgb, blur, .15), ship.a * arrive);
    return col;
}` + TAIL;

    // ---- Freshwater: Okavango floodplain. Litter, runoff and an algal bloom --------------------
    const FRESHWATER = HEAD + `
const float H = .322;
vec3 effect(vec2 uv, vec3 photo, vec3 blur) {
    float lum = luma(photo), blum = luma(blur);
    float below = smoothstep(H + .001, H + .006, uv.y);
    vec3 wide = texture2D(uWide, uv).rgb;
    float water = smoothstep(.07, .15, photo.b - photo.r) * below;
    // How deep inside the water a point lies, and how near the water a point on land lies.
    float inner = smoothstep(.02, .2, wide.b - wide.r) * .55 + smoothstep(.05, .2, blur.b - blur.r) * .45;
    float wetWide = smoothstep(.0, .12, wide.b - wide.r) * below;
    vec2 g = ground(uv, H);
    float px = g.y / uPx;
    float far = 1. - smoothstep(H, .55, uv.y);

    float trash = smoothstep(.06, .3, uP), runoff = smoothstep(.28, .55, uP);
    float bloom = smoothstep(.5, .76, uP), dead = smoothstep(.76, 1., uP);
    vec3 col = photo;

    // Algae spread from upstream (the right and the distance) and from the shallow edges inwards.
    float order = .5 * fbm(g * vec2(.45, .7) + 2.) + .35 * (1. - inner) + .25 * (1. - smoothstep(-8., 8., g.x));
    float scum = smoothstep(order - .04, order + .04, runoff * 1.2 + bloom * .4) * water;
    // Wind lines the scum up in streaks across the water.
    float streak = fbm(vec2(g.x * .7, g.y * 1.7) + fbm(g * .5) * 1.8);
    float fine = noise(g * vec2(9., 14.));
    float grain = clamp(lum / max(blum, .05), .8, 1.25);   // keep the ripples and reeds of the photo
    vec3 green = mix(vec3(.24, .38, .14), vec3(.38, .52, .2), streak) * (.75 + .5 * blum) * grain;
    vec3 thick = mix(vec3(.26, .44, .18), vec3(.46, .58, .26), smoothstep(.3, .8, streak)) * (.85 + .25 * fine) * grain;
    thick = mix(thick, vec3(.18, .4, .32) * grain, smoothstep(.5, .8, noise(g * 1.3 + 5.)) * .5);   // blue-green cyanobacteria
    vec3 rot = mix(vec3(.22, .2, .1), vec3(.4, .35, .18), streak) * (.8 + .4 * fine);        // the dying bloom
    vec3 algae = mix(mix(photo, green, .55), thick, bloom);
    algae = mix(algae, rot, dead * .85);
    algae = mix(algae, mix(photo, blur, .4) * vec3(.9, 1.05, .8) + vec3(.06, .08, .02), far * .5);
    col = mix(col, algae, scum);
    // Foam where the scum piles up against the reeds.
    float foam = smoothstep(.62, .75, streak + (1. - inner) * .3) * scum * max(bloom, dead) * (1. - far * .7);
    col = mix(col, vec3(.86, .86, .76) * (.85 + .2 * fine), foam * .55);

    // Reeds by the water yellow and die back.
    float reeds = below * (1. - water) * wetWide;
    col = mix(col, vec3(lum) * vec3(1.15, 1., .72), reeds * dead * .55);
    col = mix(col, col * vec3(.92, .9, .8), below * dead * .25);

    // Litter caught along the edges of the channels and floating in them.
    float edge = water * (1. - inner) + (1. - water) * wetWide;
    float amount = trash * .8 * (.1 + .9 * clamp(edge * 1.6, 0., 1.)) * step(H + .012, uv.y) * (1. - far * .85);
    vec3 tint; float shadow;
    float item = litter(g, px, amount, 16., .45, tint, shadow);
    col *= 1. - .35 * shadow * (1. - far) * (1. - water);
    tint = mix(tint, vec3(.92, .92, .88), .45);                          // floating plastic catches the light
    tint = mix(tint, mix(tint, vec3(.3, .4, .15), .5), scum * bloom);   // slimed over
    tint = mix(tint, blur, far * .45);
    col = mix(col, tint, item);

    // Dead fish float belly-up in the dead water.
    vec2 fc = g * vec2(18., 14.);
    vec2 fid = floor(fc), ff = fract(fc) - .5;
    float h1 = hash(fid + 21.), h2 = hash(fid + 33.);
    if (h1 < dead * .6 * water * (1. - far * .6)) {
        float a = h2 * 6.283;
        vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * (ff - (vec2(h1 * 2., h2) - .5) * .4);
        float cpx = px * 18.;
        float e = clamp(cpx / .05, .05, 1.);
        float fish = (1. - smoothstep(1. - e, 1. + e, length(q / vec2(.2, .065)))) * min(1., .1 / cpx);
        vec3 silver = mix(vec3(.66, .68, .64), vec3(.95, .95, .9), smoothstep(-.03, .03, q.y));
        col = mix(col, mix(silver, blur, far * .5), fish);
    }
    return col;
}` + TAIL;

    // ---- Island: the lava shore at Punta Espinosa, Fernandina ------------------------------------
    const ISLAND = HEAD + `
const float H = .283;
vec3 effect(vec2 uv, vec3 photo, vec3 blur) {
    float lum = luma(photo), blum = luma(blur);
    float below = smoothstep(H + .001, H + .006, uv.y);
    vec3 wide = texture2D(uWide, uv).rgb;
    // Sea and tide pools: pale and bluish; the lava is dark and grey.
    float water = smoothstep(.025, .08, photo.b - photo.r) * smoothstep(.27, .35, lum) * below;
    float wet = smoothstep(.015, .07, wide.b - wide.r) * smoothstep(.22, .32, luma(wide)) * below;
    float rock = below * (1. - water) * (1. - smoothstep(.05, .12, photo.r - photo.b));   // not the sea lions
    vec2 g = ground(uv, H);
    float px = g.y / uPx;
    float far = 1. - smoothstep(H, .5, uv.y);
    float shore = smoothstep(.1, .55, wet) * (1. - water);   // lava near the water: the tide line

    float plastic = smoothstep(.1, .38, uP), oil = smoothstep(.38, .64, uP), coat = smoothstep(.62, .9, uP);
    vec3 col = photo;

    // Oil spreads in from the open sea to the pools: a dark slick with a rainbow sheen and orange mousse.
    float order = (uv.y - H) / (1. - H) * .85 + .25 * fbm(g * vec2(.8, 1.2));
    float oiled = smoothstep(order - .05, order + .05, oil * 1.15) * water;
    float film = fbm(g * vec2(2.2, 3.4) + 3.);
    vec3 sheen = .5 + .5 * cos(6.283 * (film * 2.6 + vec3(0., .33, .67)));
    vec3 slick = vec3(.03, .028, .025) + blur * .12 + sheen * .2 * smoothstep(.25, .65, blum) * (.4 + .6 * noise(g * 3.));
    slick = mix(slick, vec3(.42, .22, .09) * (.7 + .5 * noise(g * 7.)), smoothstep(.6, .75, film) * .7);
    slick = mix(slick, mix(slick, blur, .5), far * .55);
    col = mix(col, slick, oiled * .9);
    // Oil smothers the rock along the tide line: glossy black, with highlights.
    float coated = coat * clamp(shore * 1.4 + water * .2, 0., 1.) * rock * smoothstep(.35, .55, noise(g * 2.5) * .5 + shore);
    float gloss = smoothstep(.55, .85, noise(g * vec2(26., 18.))) * (1. - far * .6);
    vec3 tar = vec3(.02, .018, .016) + gloss * (.32 + sheen * .2);
    col = mix(col, tar, coated * .92);

    // Plastic: bottles, fragments and lost rope, thickest along the tide line and floating in the pools.
    vec2 cell = g * vec2(2.4, 2.);
    vec2 id = floor(cell), f = fract(cell) - .5;
    float r1 = hash(id), r2 = hash(id + 7.1), r3 = hash(id + 3.7), r4 = hash(id + 11.3);
    float here = plastic * (.12 + .88 * clamp(shore * 1.3 + water * .5, 0., 1.)) * step(H + .006, uv.y);
    if (r4 < here * .75) {
        vec2 q0 = f - (vec2(r2, r3) - .5) * .5;
        float a = r1 * 6.283;
        mat2 turn = mat2(cos(a), -sin(a), sin(a), cos(a));
        vec2 q = turn * q0;
        bool rope = r3 < .18;
        vec2 size = rope ? vec2(.34, .012) : mix(vec2(.05, .025), vec2(.17, .055), r2 * r2);   // rope, fragments, bottles
        float cellPx = px * 2.4;
        float d = length(max(abs(q) - size, 0.)) - .01;
        float item = (1. - smoothstep(-cellPx, cellPx, d)) * min(1., size.y * 2.5 / cellPx);
        // Its shadow falls just below it on the rock.
        float ds = length(max(abs(turn * (q0 - vec2(.012, -.03))) - size, 0.)) - .02;
        float shadow = (1. - smoothstep(-cellPx * 2., cellPx * 2., ds)) * (1. - item) * (1. - water) * (1. - far);
        col *= 1. - .45 * shadow;
        vec3 tint = r1 < .3 ? vec3(.9, .92, .9) : r1 < .45 ? vec3(.2, .42, .75) : r1 < .56 ? vec3(.78, .25, .18) :
                    r1 < .66 ? vec3(.88, .74, .26) : r1 < .8 ? vec3(.36, .55, .38) : vec3(.74, .74, .68);
        if (rope) tint = vec3(.2, .48, .5);
        tint = mix(tint, vec3(luma(tint)), .3);                                  // faded by the sun and the sea
        float t = q.y / size.y;                                                  // across the piece, -1 to 1
        tint *= .55 + .5 * (1. - t * t);                                         // rounded, lit from above
        tint += vec3(.35) * exp(-pow((t + .45) * 4., 2.)) * (rope ? .2 : 1.);   // a glint along it
        if (r1 < .3 && !rope) tint = mix(tint, photo * 1.4 + .08, .45);          // clear bottles
        tint = mix(tint, vec3(.12, .08, .05), (oiled + coated) * .6);            // stained where the oil reached it
        tint = mix(tint, blur, far * .4);
        col = mix(col, tint, item);
    }
    return col;
}` + TAIL;

    // ---- Grassland: the Serengeti plains. Road traffic, plastic, burning rubbish, farm chemicals ----
    const GRASSLAND = HEAD + `
const float H = .383;
const vec2 DUMP = vec2(-.7, 4.6);    // a rubbish dump beside the road: across, distance
float roadX(float z) { return -1.6 + .38 * z + .25 * sin(z * .22); }

// A safari truck or lorry on the road, seen from behind or in front: p from its foot, y up.
vec4 vehicle(vec2 p, float w, float kind) {
    vec3 paint = kind < .4 ? vec3(.86, .85, .8) : kind < .75 ? vec3(.36, .4, .26) : vec3(.62, .22, .12);
    float body = box(p, vec2(0., .055), vec2(.065, .04));
    float cab = box(p, vec2(0., .108), vec2(.056, .02));
    float glass = box(p, vec2(0., .108), vec2(.046, .012));
    float wheels = min(box(p, vec2(-.05, .012), vec2(.014, .014)), box(p, vec2(.05, .012), vec2(.014, .014)));
    vec3 col = paint * (.85 + .3 * smoothstep(.02, .1, p.y));
    float a = cover(min(body, cab), w);
    col = mix(col, vec3(.1, .12, .13), cover(glass, w));
    col = mix(col, vec3(.06), cover(wheels, w)); a = max(a, cover(wheels, w));
    return vec4(col, a);
}

vec3 effect(vec2 uv, vec3 photo, vec3 blur) {
    float lum = luma(photo), blum = luma(blur);
    float below = smoothstep(H + .002, H + .012, uv.y);
    vec2 g = ground(uv, H);
    float px = g.y / uPx;
    float far = 1. - smoothstep(H, .6, uv.y);
    float tree = smoothstep(.02, .09, blum - lum) * below;   // crowns and their shade, darker than the grass
    vec3 light = vec3(clamp(luma(texture2D(uWide, uv).rgb) / .5, .7, 1.2));
    float grain = clamp(lum / max(blum, .05), .85, 1.15);   // the photo's own texture
    vec3 haze = vec3(.8, .74, .62);

    float road = smoothstep(.04, .26, uP), plastic = smoothstep(.28, .54, uP);
    float dump = smoothstep(.44, .58, uP), fire = smoothstep(.52, .62, uP) * (1. - .55 * smoothstep(.8, .95, uP));
    float chem = smoothstep(.76, 1., uP);
    vec3 col = photo;
    vec3 soil = vec3(.62, .43, .3) * (.8 + .4 * fbm(g * 5.)) * light;
    soil = mix(soil, haze, far * .55);

    // Farm chemicals: fields at the far side of the plain, and the spray drifting off them yellows the
    // grass and strips the acacias.
    float a = .28;
    vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * g;
    q += vec2(fbm(g * .35), fbm(g * .35 + 4.)) * .6 - .3;
    vec2 plotSize = vec2(1.1, .75);
    vec2 pid = floor(q / plotSize), pf = fract(q / plotSize);
    float pr = hash(pid), pr2 = hash(pid + 5.3);
    float reach = pr * .45 + (1. - smoothstep(8., 30., g.y)) * .55 + smoothstep(-8., 8., -g.x) * .2;
    float plot = step(reach, chem * .75) * below * step(9., g.y);
    float margin = .035 + px * 1.5 / plotSize.x;
    float inside = step(margin, pf.x) * step(pf.x, 1. - margin) * step(margin, pf.y) * step(pf.y, 1. - margin);
    float rows = sin((pr2 < .5 ? q.x : q.y) * 160.) * (1. - smoothstep(.002, .006, px)) * .4 + (noise(q * 40.) - .5) * .5;
    vec3 crop = pr2 < .4 ? vec3(.5, .34, .24) * (.92 + .1 * rows) : mix(vec3(.3, .38, .14), vec3(.5, .45, .2), .5 + .5 * rows);
    crop = mix(crop * light, haze, far * .55);
    col = mix(col, crop, plot * inside);
    float drift = smoothstep(.4, .6, fbm(g * vec2(.18, .3) + vec2(uTime * .01, 0.)) + chem * .08) * chem * below;
    vec3 straw = vec3(lum) * vec3(1.22, 1.02, .66) * 1.08;
    col = mix(col, straw * grain, drift * (1. - plot * inside) * .85);
    col = mix(col, vec3(luma(col)) * vec3(.95, .9, .82), drift * tree * .7);     // leafless, grey acacias
    // Spray mist hangs low over the fields.
    float mist = smoothstep(.35, .75, fbm(vec2(uv.x * 7. - uTime * .02, uv.y * 40.))) * (1. - smoothstep(.0, .12, uv.y - H)) * smoothstep(-.005, .01, uv.y - H);
    col = mix(col, vec3(.9, .9, .8), mist * chem * .45);

    // The road is built from near to far; dust from the traffic settles along it.
    float rx = roadX(g.y);
    float built = step(g.y, mix(1., 60., road));
    float rw = .09;
    float dRoad = abs(g.x - rx);
    float roadMask = (1. - smoothstep(rw - px, rw + px, dRoad)) * min(1., rw / px) * built * below;
    vec3 murram = vec3(.68, .47, .33) * light * (.92 + .12 * noise(vec2(g.x * 40., g.y * 6.)));
    murram = mix(murram, haze, far * .5);
    float verge = (1. - smoothstep(rw, rw * 2.4 + px, dRoad)) * built * below;
    float dusted = exp(-dRoad * 1.6) * built * below;
    col = mix(col, soil, verge * .6 * road);
    col = mix(col, col * .8 + vec3(.74, .6, .44) * .26, dusted * road * .8);
    col = mix(col, murram, roadMask);

    // The rubbish dump: a scar of dark soil heaped with waste, burnt black where it is set alight.
    vec2 dr = (g - DUMP) * vec2(1., .38);
    float dd = length(dr) + (fbm(g * 2.5) - .5) * .35;
    float dumpMask = (1. - smoothstep(.55 * dump - .12, .55 * dump, dd)) * step(.01, dump) * below;
    // Mounds of mixed waste: their colours blend to a pale, speckled grey at this distance.
    vec2 bit = floor(g * vec2(60., 45.));
    float b1 = hash(bit), b2 = hash(bit + 3.1);
    vec3 waste = b1 < .35 ? vec3(.86, .85, .8) : b1 < .5 ? vec3(.3, .45, .75) : b1 < .62 ? vec3(.8, .3, .2) :
                 b1 < .72 ? vec3(.85, .72, .3) : b1 < .82 ? vec3(.15, .15, .15) : vec3(.55, .5, .42);
    float detail = 1. - smoothstep(.01, .03, px);   // individual pieces only where they are big enough to see
    vec3 dirt = mix(vec3(.55, .49, .41), waste, detail * .22 + .08) * (.82 + .25 * b2);
    float mound = fbm(g * vec2(4., 2.5) + 3.);
    dirt *= (.72 + .5 * mound) * light;              // heaps catch the low sun, hollows in shadow
    vec3 tint; float shadow;
    float charred = (1. - smoothstep(.0, .3, dd)) * fire;
    dirt = mix(dirt, vec3(.05, .045, .04) + .12 * fbm(g * 20.), charred * .85);
    float embers = smoothstep(.62, .8, noise(g * 30. + vec2(0., uTime * .8))) * charred * (1. - smoothstep(.85, .95, uP));
    dirt = mix(dirt, vec3(1., .5, .15), embers * .8);
    col = mix(col, mix(dirt, haze, far * .4), dumpMask);
    // A track of trodden waste between the road and the dump.
    float track = (1. - smoothstep(.04, .06 + px, abs(g.y - DUMP.y))) * step(DUMP.x, g.x) * step(g.x, rx) * dump * below;
    col = mix(col, soil * .9, track * .7);

    // Plastic bags blown off the road and the dump, caught on grass and in the acacias.
    float near = exp(-dRoad * .9) * built + exp(-length(dr) * .7) * dump * 1.5;
    float amount = plastic * (.06 + .7 * clamp(near, 0., 1.) + .4 * tree) * below * (1. - dumpMask);
    float item = litter(g, px, amount, 13., .8, tint, shadow);
    col *= 1. - .3 * shadow * (1. - far);
    col = mix(col, mix(tint * light, haze, far * .4), item);

    // Traffic: lorries and safari trucks on the road, each trailing a cloud of dust.
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float dir = i == 1 ? -1. : 1.;                       // towards the camera, or away
        float z = 3. + mod(fi * 9.3 + dir * uTime * .3, 26.);
        if (z > mix(1., 60., road) || road < .2) continue;
        vec2 at = vec2(roadX(z) + (i == 1 ? .035 : -.035), z);
        vec2 p = standing(uv, H, at) * 2.6;   // seen from a balloon, a truck is a few pixels across
        vec4 v = vehicle(p, z * 2.6 / uPx, fract(fi * .37 + .2));
        float sh = cover(length(p * vec2(1., 6.) - vec2(0., -.02)) - .08, z * 2.6 / uPx * 4.) * (1. - v.a);
        col *= 1. - .35 * sh;
        // Dust billows up behind it (further down the road when it drives towards the camera).
        float dust = 0.;
        for (int k = 0; k < 4; k++) {
            float fk = float(k);
            float zk = z + dir * (.08 + fk * .2);
            vec2 pk = standing(uv, H, vec2(roadX(zk), zk));
            float r = .03 + fk * .035;
            pk.y -= r * .8;
            dust += exp(-dot(pk, pk) / (r * r)) * (1. - fk * .18);
        }
        dust *= .55 + .6 * noise(uv * vec2(uAspect, 1.) * 90. + uTime * .3);
        col = mix(col, vec3(.8, .68, .52) * (.9 + .2 * blum), clamp(dust * .75, 0., .85) * (1. - v.a));
        col = mix(col, v.rgb * light, v.a);
    }

    // Black smoke from the burning plastic, leaning off with the wind.
    for (int i = 0; i < 3; i++) {
        vec3 src = i == 0 ? vec3(DUMP.x - .1, DUMP.y, 0.) : i == 1 ? vec3(DUMP.x + .25, DUMP.y + .4, .05) : vec3(DUMP.x - .3, DUMP.y + .2, .1);
        float strength = smoothstep(src.z, src.z + .25, fire) * fire;
        if (strength <= 0.) continue;
        float rise;
        // Thick and black low down, spreading into a grey pall higher up.
        float sy = H + 1. / src.y, sx = .5 + src.x / (uAspect * src.y);
        float w0 = .14 / src.y; rise = sy - uv.y;
        float xw = (uv.x - sx) * uAspect - rise * rise * 2.2;
        float wide = w0 * (1. + rise * 9.);
        float body = exp(-xw * xw / (wide * wide)) * smoothstep(-.005, .01, rise) * (1. - smoothstep(.12, .42, rise));
        body *= smoothstep(.2, .65, fbm(vec2(xw / wide * 1.3, rise * 9. + uTime * .12)));
        vec3 smoke = mix(vec3(.09, .085, .08), vec3(.5, .48, .46), smoothstep(.0, .3, rise));
        col = mix(col, smoke, clamp(body * strength * 1.3, 0., .88));
    }
    col = mix(col, col * .9 + vec3(.5, .46, .4) * .1, fire * .5);   // a pall over the plain
    return col;
}` + TAIL;

    const effects = {};
    const register = (kind, fragment, animated = () => false) => { effects[kind] = { fragment, animated }; };
    register('ocean', OCEAN, p => p > .02);              // the plume drifts with the current
    register('freshwater', FRESHWATER);
    register('island', ISLAND);
    register('grassland', GRASSLAND, p => p > .2);       // traffic on the road, smoke from the dump

    // Draws one registered effect over `image` inside `layer`. Returns null where WebGL is unavailable.
    function create(kind, layer, image) {
        const effect = effects[kind];
        if (!effect) return null;
        const canvas = document.createElement('canvas');
        canvas.className = 'habitat-view__loss';
        const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
        if (!gl) return null;

        const compile = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
            return shader;
        };
        const program = gl.createProgram();
        try {
            gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
            gl.attachShader(program, compile(gl.FRAGMENT_SHADER, effect.fragment));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        } catch (error) {
            console.error(error);
            return null;
        }
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'a');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        const u = Object.fromEntries(['uPhoto', 'uBlur', 'uWide', 'uLayer', 'uFit', 'uP', 'uTime', 'uAspect', 'uPx']
            .map(name => [name, gl.getUniformLocation(program, name)]));

        const texture = (unit, source) => {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
        };
        // Small, soft copies of the photo give its large-scale light without detail, and what
        // surrounds each point (how near the water is, for example).
        const soft = (width, radius) => {
            const small = document.createElement('canvas');
            small.width = width;
            small.height = Math.round(width * image.naturalHeight / image.naturalWidth);
            const context = small.getContext('2d');
            context.filter = `blur(${radius}px)`;
            context.drawImage(image, 0, 0, small.width, small.height);
            return small;
        };
        texture(0, image);
        texture(1, soft(240, 2));
        texture(2, soft(96, 3));
        gl.uniform1i(u.uPhoto, 0);
        gl.uniform1i(u.uBlur, 1);
        if (u.uWide) gl.uniform1i(u.uWide, 2);
        gl.uniform1f(u.uAspect, image.naturalWidth / image.naturalHeight);
        layer.appendChild(canvas);

        let progress = 0, frame = 0, fit = null, density = 1;
        function draw(now) {
            if (!fit || progress <= 0) return;
            gl.uniform1f(u.uP, progress);
            gl.uniform1f(u.uTime, now / 1000);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        function loop(now) {
            draw(now);
            frame = effect.animated(progress) ? requestAnimationFrame(loop) : 0;
        }
        return {
            // Where the photo sits in its layer (CSS px), and how far the layer is enlarged on screen.
            fit(left, top, width, height, layerW, layerH, scale) {
                fit = [left, top, width, height];
                density = Math.min((devicePixelRatio || 1) * scale, 2600 / layerW, 2600 / layerH);
                canvas.width = Math.round(layerW * density);
                canvas.height = Math.round(layerH * density);
                gl.viewport(0, 0, canvas.width, canvas.height);
                gl.uniform2f(u.uLayer, layerW, layerH);
                gl.uniform4f(u.uFit, left, top, width, height);
                gl.uniform1f(u.uPx, height * density);
                draw(performance.now());
            },
            set(value) {
                progress = value;
                canvas.classList.toggle('is-on', progress > 0);
                draw(performance.now());
                if (effect.animated(progress) && !frame) frame = requestAnimationFrame(loop);
            },
            stop() { cancelAnimationFrame(frame); frame = 0; }
        };
    }

    window.habitatLoss = { register, create, has: kind => !!effects[kind] };
})();
