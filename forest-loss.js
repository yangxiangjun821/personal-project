/* Forest pollution over the landed rainforest photo. One value (0–1) runs the photographed valley
   through the usual sequence of deforestation in Borneo and the air pollution it causes: logging roads
   and selective felling, clear-cutting, burning, a toxic haze that blankets the region, then oil palm
   and a smoking palm oil mill. It is drawn in WebGL on top of the real photo, in the photo's own
   perspective, and keeps the photo's cloud shadows, haze and grain. The renderer is shared with the
   other habitats (habitat-loss.js, loaded first). */
(() => {
    'use strict';

    const VERTEX = `attribute vec2 a; varying vec2 vPos;
void main() { vPos = vec2(a.x * .5 + .5, .5 - a.y * .5); gl_Position = vec4(a, 0., 1.); }`;

    const FRAGMENT = `precision highp float;
uniform sampler2D uPhoto, uBlur;
uniform vec2 uLayer;     // layer size, CSS px
uniform vec4 uFit;       // photo left, top, width, height within the layer, CSS px
uniform float uP, uTime, uAspect, uPx;   // progress, seconds, photo width / height, photo height in canvas px
varying vec2 vPos;

const float HORIZON = .492;   // the camera's horizon, as a fraction of the photo's height

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
// Logging roads on the valley floor, x as a function of distance z (ground units).
float road1(float z) { return -.75 + .55 * sin(z * .21 + .4) + .22 * sin(z * .57); }
float road2(float z) { return road1(z) + (z - 7.) * .34 + .3 * sin(z * .4); }

void main() {
    vec2 uv = (vPos * uLayer - uFit.xy) / uFit.zw;
    vec3 photo = texture2D(uPhoto, uv).rgb, blur = texture2D(uBlur, uv).rgb;
    float lum = dot(photo, vec3(.299, .587, .114)), blum = dot(blur, vec3(.299, .587, .114));
    // Vegetation, not sky or cloud: greener than blue, and not bright. Below the ridge it is all forest.
    float veg = smoothstep(.012, .06, photo.g - photo.b) * smoothstep(.0, .03, blur.g - blur.b) * (1. - smoothstep(.6, .78, lum));
    veg = mix(veg, 1., smoothstep(.55, .6, uv.y));

    // The canopy below the horizon read as ground seen in perspective. Across, it shrinks with
    // distance like a flat plane; in depth it is foreshortened only about two to one, as the rolling,
    // three-dimensional canopy looks from a low tower. The distant ridge and hills use the image itself.
    float depth = 1. / max(uv.y - HORIZON, .004);
    vec2 g = vec2((uv.x - .5) * uAspect * depth, 2. * log(depth));
    vec2 q = uv * vec2(uAspect, 1.) * 10.;
    float far = 1. - smoothstep(.535, .575, uv.y);
    vec2 s = mix(g, q, far);
    float perPx = depth / uPx;           // ground units per canvas pixel

    // Roads push into the forest first. They follow true distance so they recede properly.
    float reach1 = mix(1.8, 80., smoothstep(.03, .28, uP));
    float reach2 = mix(7., 60., smoothstep(.16, .36, uP));
    float d1 = abs(g.x - road1(depth)) + 1e3 * step(reach1, depth);
    float d2 = abs(g.x - road2(depth)) + 1e3 * (step(reach2, depth) + step(depth, 7.));
    float dRoad = min(d1, d2);
    float width = .028;
    float road = (1. - smoothstep(width - perPx, width + perPx, dRoad)) * min(1., width / perPx) * (1. - far);
    float verge = (1. - smoothstep(width, width * 2.2 + perPx, dRoad)) * (1. - road) * (1. - far);
    float vegSoft = smoothstep(0., .03, blur.g - blur.b) * (1. - smoothstep(.6, .78, blum));

    // When each patch is cleared: near the roads first, then outwards; the hills last.
    float shade = clamp(blum / .27, .55, 1.3);   // the photo's cloud shadows
    float grain = lum - blum;                    // and its fine texture

    // The ragged edge follows the photo's own tree crowns: the brightest, tallest survive longest.
    float t = mix(.12 + .5 * smoothstep(0., 5., dRoad) + .5 * (fbm(g * vec2(.3, .45)) - .48),
                  .62 + .5 * (fbm(q * .8) - .48), far) + .05 * (noise(s * 9.) - .5) + grain * .35;
    float cp = smoothstep(.32, .92, uP) * 1.06;
    float cleared = smoothstep(t, t + .006, cp) * veg;
    float age = cp - t;

    // Selective logging: the biggest trees come out near the roads, leaving dark gaps.
    float gapping = smoothstep(.08, .3, uP) * (1. - smoothstep(0., 4., dRoad)) * (1. - far);
    float gap = smoothstep(1. - .26 * gapping, 1.04 - .26 * gapping, noise(g * vec2(6., 5.) + 4.)) * veg;

    // Bare laterite soil, felled timber, skid trails and a little scrub.
    vec3 soil = mix(vec3(.5, .37, .26), vec3(.63, .52, .4), fbm(s * 1.1));
    soil *= .82 + .36 * fbm(s * 6. + 2.);
    soil = mix(soil, vec3(.34, .35, .22), smoothstep(.55, .8, fbm(s * 2.2 + 9.)) * .6);
    soil = mix(soil, vec3(.27, .23, .19), smoothstep(.58, .8, noise(vec2(s.x * 30., s.y * 18.))) * .45);
    soil = soil * shade + grain * .4;

    // Burning: freshly cleared land is set alight before it is planted.
    float burning = smoothstep(.45, .55, uP) * (1. - smoothstep(.85, .95, uP));
    float burn = smoothstep(0., .04, age) * burning * mix(.45, 1., smoothstep(.35, .6, fbm(s * .9 + 5.)));
    vec3 ash = mix(vec3(.1, .09, .085), vec3(.42, .4, .38), smoothstep(.5, .8, fbm(s * 2.3 + 3.)));
    soil = mix(soil, ash * shade + grain * .3, burn * .9);

    // Oil palm in offset rows on the oldest clearings.
    // Rows follow the contours, the way plantations are terraced across rolling land.
    float plant = smoothstep(.1, .25, age) * smoothstep(.8, .92, uP);
    float cell = .14;
    vec2 c = (g + vec2(0., (fbm(g * vec2(.25, .5)) - .5) * 1.4)) / cell; c.x += .5 * mod(floor(c.y), 2.);
    float id = hash(floor(c));
    vec2 f = fract(c) - .5 + (vec2(id, fract(id * 7.3)) - .5) * .12;
    float r = (.26 + .16 * smoothstep(.3, .6, age)) * (.82 + .3 * fract(id * 13.1));
    float crown = 1. - smoothstep(r * .7, r, length(f) / (.75 + .25 * cos(atan(f.y, f.x) * 9. + id * 6.)));
    float block = step(.08, fract(c.y / 16.)) * step(.025, fract(c.x / 40.));   // harvesting tracks
    crown *= block;
    vec3 cover = mix(soil, vec3(.33, .31, .2) * shade, .6);
    vec3 palm = mix(vec3(.08, .14, .06), vec3(.22, .3, .12), clamp(.5 - (f.y + f.x * .4) / r * .6, 0., 1.)) * min(shade, 1.1);
    float shadow = (1. - smoothstep(r * .5, r * 1.05, length(f - vec2(.08, .1)))) * (1. - crown) * block;
    vec3 rows = mix(cover * (1. - .45 * shadow), palm, crown);
    vec3 rowsFar = mix(cover, palm, .55);
    rows = mix(rows, rowsFar, max(smoothstep(.1, .4, 2. * perPx / cell), far));
    soil = mix(soil, rows + grain * .2, plant);

    // Cleared land far away sits in the same blue haze as the photo's distant forest.
    soil = mix(soil, vec3(.6, .67, .72), .5 * (1. - smoothstep(.5, .72, uv.y)));

    vec3 col = photo;
    col = mix(col, col * .42 + vec3(.06, .04, .02), gap * (1. - cleared) * .85);
    col = mix(col, soil, cleared);
    vec3 dirt = vec3(.6, .42, .29) * shade * (.9 + .2 * noise(vec2(g.x * 40., g.y * 12.))) + grain * .25;
    dirt = mix(dirt, vec3(.6, .67, .72), .5 * (1. - smoothstep(.5, .72, uv.y)));
    col = mix(col, col * .55, verge * vegSoft * (1. - cleared) * .7);   // shade along the cut edge
    col = mix(col, dirt, road * vegSoft);

    // Smoke from the fires, drifting with the wind.
    for (int i = 0; i < 5; i++) {
        vec3 src = i == 0 ? vec3(-1.1, 6., 0.) : i == 1 ? vec3(.9, 9., .05) : i == 2 ? vec3(2.6, 14., .1) :
                   i == 3 ? vec3(-3.2, 18., .03) : vec3(5., 26., .08);
        float strength = smoothstep(.47 + src.z, .55 + src.z, uP) * (1. - smoothstep(.82, .93, uP));
        if (strength <= 0.) continue;
        float sy = HORIZON + 1. / src.y, sx = .5 + src.x / (uAspect * src.y);
        float w0 = .45 / src.y, rise = sy - uv.y;
        float xw = (uv.x - sx) * uAspect - rise * rise * 1.6;
        float wide = w0 * (1. + rise * 5.);
        float body = exp(-xw * xw / (wide * wide)) * smoothstep(-.01, .02, rise) * (1. - smoothstep(.12, .45, rise));
        if (body < .01) continue;
        float puff = smoothstep(.3, .72, fbm(vec2(xw, uv.y + uTime * .025) * (2.6 / w0)));
        vec3 smoke = mix(vec3(.45, .42, .4), vec3(.82, .8, .76), smoothstep(-.02, .2, rise) * .7 + .3 * puff);
        col = mix(col, smoke, clamp(body * puff * strength * 1.5, 0., .92));
    }

    // A palm oil mill on the far plantation, its chimney smoking once the palms are planted.
    float mill = smoothstep(.86, .95, uP);
    if (mill > 0.) {
        vec2 at = vec2(-3.4, 24.);
        float sy = HORIZON + 1. / at.y, sx = .5 + at.x / (uAspect * at.y);
        vec2 p = vec2((uv.x - sx) * uAspect, sy - uv.y) * at.y;   // ground units from the mill's foot, y up
        float w = at.y / uPx;
        float shed = 1. - smoothstep(-w, w, max(abs(p.x - .25) - .45, abs(p.y - .12) - .12));
        float stack = 1. - smoothstep(-w, w, max(abs(p.x + .05) - max(.025, w), abs(p.y - .45) - .45));
        col = mix(col, mix(vec3(.62, .62, .6), vec3(.6, .67, .72), .4), shed * mill);
        col = mix(col, vec3(.35, .33, .32), stack * mill);
        // The plume rises a little and is carried off downwind, spreading as it goes.
        float rise = sy - .9 / at.y - uv.y;                                   // above the stack top
        float dx = (uv.x - sx) * uAspect + .05 / at.y;                        // downwind of the stack
        float hc = .015 * sqrt(max(dx, 0.) / .02) * smoothstep(-.002, .01, dx);
        float th = .003 + max(dx, 0.) * .18;
        float body = exp(-pow((rise - hc) / th, 2.)) * smoothstep(-.004, .002, dx) * (1. - smoothstep(.04, .24, dx));
        body *= smoothstep(.25, .65, fbm(vec2(dx * 30. - uTime * .15, (rise - hc) / th)));
        col = mix(col, mix(vec3(.42, .4, .38), vec3(.66, .64, .6), smoothstep(.0, .2, dx)), clamp(body * mill * 1.3, 0., .85));
    }

    // The smoke builds into a haze that blankets the whole region, turns the sun into a dull orange
    // disc and hides the hills; it only partly lifts once the fires die down.
    float hz = smoothstep(.42, .62, uP) * (1. - .2 * smoothstep(.86, 1., uP));
    float smog = smoothstep(.56, .74, uP) * (1. - .7 * smoothstep(.84, .98, uP));
    float away = max(mix(.35, 1., 1. - smoothstep(.5, 1., uv.y)), 1. - veg);
    col = mix(col, vec3(.8, .74, .62) * (.85 + .15 * blum), hz * .45 * away);
    vec3 pall = mix(vec3(.66, .56, .42), vec3(.78, .68, .52), 1. - smoothstep(.0, .6, uv.y)) * (.92 + .08 * fbm(uv * vec2(uAspect, 1.) * 3. + uTime * .01));
    col = mix(col, pall, smog * mix(.55, .88, away));
    vec2 sun = vec2(.68, .2);
    float ds = length((uv - sun) * vec2(uAspect, 1.));
    float disc = 1. - smoothstep(.034, .038, ds);
    col = mix(col, vec3(.98, .58, .24), smoothstep(.45, .9, smog) * (disc * .85 + exp(-ds * 9.) * .25));
    col = mix(col, col * vec3(.92, .88, .82), smog * .3);   // dim, sickly light
    gl_FragColor = vec4(col, 1.);
}`;

    // Drawn by the shared photo-effect renderer in habitat-loss.js; smoke and haze drift while the
    // fires burn, and the mill keeps smoking afterwards.
    if (!window.habitatLoss) return;
    window.habitatLoss.register('forest', FRAGMENT, p => p > .46);
})();
