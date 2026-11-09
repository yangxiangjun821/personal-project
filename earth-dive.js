/* Earth dive: a scroll-driven, cinematic camera flight from the whole Earth in space down to a real
   place on the ground, rendered with native WebGL (no libraries, no build step).

   - The camera is a true perspective camera in an Earth-centred frame (1 unit = Earth's radius), so
     the planet keeps real curvature at every altitude. Its position is computed in double precision
     on the CPU and handed to the GPU relative to the target, which keeps ground detail stable to
     centimetres even a few hundred metres above the surface.
   - The globe is ray-traced (exact sphere), with single-scattering atmosphere (Rayleigh + Mie, real
     scattering coefficients), day/night lighting, a volumetric cloud deck that the camera flies
     through, cloud shadows and sun glint on water.
   - Ground colour streams from real satellite imagery (Sentinel-2 cloudless, EOX) as a clipmap of
     six levels down to ~10 m per pixel; real elevation (AWS Terrain Tiles) becomes a 3D terrain mesh
     for the final approach.
   - Scroll position drives everything through one progress value with ScrollTrigger-style scrub
     smoothing, so scrolling up plays the whole flight backwards.
   - A post pass adds motion blur radiating from the direction of travel, edge defocus at speed,
     vignette and grain, and dissolves through mist into the destination scene underneath.

   Usage: const dive = createEarthDive({ earthView, ...options });
          dive.enter(site, { scene, content, onExit });   dive.exit();   dive.destroy();
   See README.md ("Cinematic habitat dive") for every option. */
(() => {
    'use strict';

    const EARTH_RADIUS = 6371000;
    const toR = metres => metres / EARTH_RADIUS;
    const D2R = Math.PI / 180;

    // ---- Double-precision vector helpers -----------------------------------------------------
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const length = a => Math.hypot(a[0], a[1], a[2]);
    const normalize = a => scale(a, 1 / length(a));
    // Same convention as earth.js: longitude = atan(x, z), latitude = asin(y).
    const fromLatLng = (lat, lng) => [Math.cos(lat * D2R) * Math.sin(lng * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lng * D2R)];
    const toLatLng = v => { const n = normalize(v); return [Math.asin(Math.max(-1, Math.min(1, n[1]))) / D2R, Math.atan2(n[0], n[2]) / D2R]; };
    function slerp(a, b, t) {
        const d = Math.max(-1, Math.min(1, dot(a, b))), w = Math.acos(d);
        if (w < 1e-9) return normalize(add(scale(a, 1 - t), scale(b, t)));
        const s = Math.sin(w);
        return add(scale(a, Math.sin((1 - t) * w) / s), scale(b, Math.sin(t * w) / s));
    }
    // Local north and east at a unit vector.
    function tangentFrame(g) {
        let n = sub([0, 1, 0], scale(g, g[1]));
        if (length(n) < 1e-6) n = sub([0, 0, -1], scale(g, -g[2]));
        n = normalize(n);
        return { n, e: cross(n, g) };
    }
    function rotateAround(v, axis, angle) {
        const c = Math.cos(angle), s = Math.sin(angle), k = dot(axis, v);
        return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, k * (1 - c)));
    }
    const clamp01 = t => Math.max(0, Math.min(1, t));
    const smoother = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
    const mix = (a, b, t) => a + (b - a) * t;
    const merc = (lat, lng) => {
        const r = Math.max(-85.05, Math.min(85.05, lat)) * D2R;
        return [(lng + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2];
    };

    // Monotone cubic Hermite through [x, y] keys (Fritsch–Carlson) with flat ends: smooth (C1) and
    // never overshoots, so altitude, pitch and field of view ease in and out without wobbling.
    function spline(keys) {
        const n = keys.length, x = keys.map(k => k[0]), y = keys.map(k => k[1]);
        const d = [], m = new Array(n).fill(0);
        for (let i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
        for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
        for (let i = 0; i < n - 1; i++) {
            if (!d[i]) { m[i] = m[i + 1] = 0; continue; }
            const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
            if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
        }
        return t => {
            if (t <= x[0]) return y[0];
            if (t >= x[n - 1]) return y[n - 1];
            let i = 0;
            while (i < n - 2 && t > x[i + 1]) i++;
            const h = x[i + 1] - x[i], u = (t - x[i]) / h, u2 = u * u, u3 = u2 * u;
            return (2 * u3 - 3 * u2 + 1) * y[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * y[i + 1] + (u3 - u2) * h * m[i + 1];
        };
    }

    // ---- GLSL --------------------------------------------------------------------------------
    const QUAD_VS = `attribute vec2 a; varying vec2 vUv; void main(){ vUv=a*.5+.5; gl_Position=vec4(a,1.,1.); }`;

    // Shared by the globe pass and the terrain pass so both shade the ground identically.
    const COMMON = `
#define PI 3.14159265359
const float SUN_I = 20.;
const vec3 BR = vec3(36.97, 86.38, 210.9);   // Rayleigh scattering of air, per Earth radius
const float BM = 25.5;                        // Mie scattering of haze, per Earth radius
const float HR = 1.2557e-3, HM = 1.8835e-4;   // scale heights: 8 km and 1.2 km
const float RA = 1.0157;                      // top of the atmosphere, 100 km
const float SIGMA = 26000.;                   // cloud extinction per Earth radius (~4 per km)
uniform vec3 uT, uE, uN, uCamRel, uSun;
uniform float uCamC, uCamAlt, uTime, uExposure, uPix;
uniform vec4 uCloud, uBank;
uniform sampler2D uBase, uL0, uL1, uL2, uL3, uL4, uL5, uNoise;
uniform vec4 uLv1, uLv2;
uniform vec3 uLv3, uLv4, uLv5;

float h3(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
// 3D value noise from a 256x256 random texture whose green channel is the red channel shifted
// by (37, 17): two slices per fetch, interpolated by the texture unit. Far cheaper to run and to
// compile than hashing (Direct3D unrolls every loop, so shader size matters).
float noise(vec3 x){
    vec3 p=floor(x), f=fract(x); f=f*f*(3.-2.*f);
    vec2 uv=(p.xy+vec2(37.,17.)*p.z)+f.xy;
    vec2 rg=texture2D(uNoise,(uv+.5)/256.).xy;
    return mix(rg.x,rg.y,f.z);
}
const mat3 ROT=mat3(.00,.80,.60,-.80,.36,-.48,-.60,-.48,.64);
// Octaves fade out by level of detail; unresolved octaves contribute their mean, so the field's
// average brightness never changes as detail streams in.
float fbmN(vec3 p, float oct){
    float v=0., a=.5;
    for(int i=0;i<7;i++){
        float k=clamp(oct-float(i),0.,1.);
        if(k<=0.){ v+=a; break; }
        v+=a*mix(.5,noise(p),k);
        p=ROT*p*2.02+vec3(1.7,9.2,3.1); a*=.5;
    }
    return v;
}

// Optical depth towards the sun with Schuler's Chapman-function approximation (no inner loop).
float chap(float X, float h, float mu){
    float c=sqrt(1.5707963*(X+h));
    if(mu>=0.) return exp(-h)*c/((c-1.)*mu+1.);
    float x0=sqrt(max(0.,1.-mu*mu))*(X+h);
    if(x0<X) return 1e9;   // the planet is in the way
    float c0=sqrt(1.5707963*x0);
    return 2.*c0*exp(X-x0)-exp(-h)*c/((c-1.)*(-mu)+1.);
}
vec3 sunTrans(vec3 P){
    float r=length(P), mu=dot(P,uSun)/r, h=max(r-1.,0.);
    float dR=HR*chap(1./HR,h/HR,mu), dM=HM*chap(1./HM,h/HM,mu);
    return exp(-(BR*dR+BM*1.11*dM));
}
float hg(float mu,float g){ float g2=g*g; return .0795775*(1.-g2)/pow(1.+g2-2.*g*mu,1.5); }

// Single scattering along the ray, sampled more densely near the camera when it is inside the air.
vec3 atmo(vec3 ro, vec3 rd, float tEnd, out vec3 trans){
    trans=vec3(1.);
    float b=dot(ro,rd), c=dot(ro,ro)-RA*RA, disc=b*b-c;
    if(disc<0.) return vec3(0.);
    float s=sqrt(disc), t0=max(0.,-b-s), t1=min(tEnd,-b+s);
    if(t1<=t0) return vec3(0.);
    float mu=dot(rd,uSun);
    float pR=.0596831*(1.+mu*mu), pM=hg(mu,.76);
    float k=uCamAlt<.012?2.:1.;
    vec3 sum=vec3(0.), Tv=vec3(1.); float prev=0.;
    for(int i=0;i<ATMO_STEPS;i++){
        float u1=pow((float(i)+1.)/float(ATMO_STEPS),k);
        float um=pow((float(i)+.5)/float(ATMO_STEPS),k);
        float ds=(t1-t0)*(u1-prev); prev=u1;
        vec3 P=ro+rd*(t0+(t1-t0)*um);
        float h=max(length(P)-1.,0.);
        float dR=exp(-h/HR)*ds, dM=exp(-h/HM)*ds;
        vec3 ext=BR*dR+BM*1.11*dM;
        vec3 sc=(BR*dR*pR+BM*dM*pM)/max(ext,vec3(1e-7));
        sum+=Tv*sunTrans(P)*(1.-exp(-ext))*sc;
        Tv*=exp(-ext);
    }
    trans=Tv;
    return sum*SUN_I;
}

// ---- Real satellite imagery: a world level plus five levels centred on the target ----
vec2 mercOf(vec3 n){
    float lat=asin(clamp(n.y,-.9999,.9999)), lng=atan(n.x,n.z);
    return vec2(lng/(2.*PI)+.5, .5-log(tan(PI*.25+lat*.5))/(2.*PI));
}
float feather(vec2 uv){ vec2 d=min(uv,1.-uv); return smoothstep(0.,.05,min(d.x,d.y)); }
vec3 baseAlbedo(vec3 n){
    float lng=atan(n.x,n.z), u=fract(lng/(2.*PI)+.5);
    #ifdef GL_OES_standard_derivatives
    float u2=fract(lng/(2.*PI))-.5; if(fwidth(u)>fwidth(u2)+.001) u=u2;
    #endif
    return texture2D(uBase,vec2(u,asin(clamp(n.y,-1.,1.))/PI+.5)).rgb;
}
vec3 cineAlbedo(vec3 n, vec3 rel){
    vec3 c=baseAlbedo(n);
    vec2 m=mercOf(n), uv0=m;
    #ifdef GL_OES_standard_derivatives
    vec2 w=vec2(fract(m.x+.5)-.5,m.y); if(fwidth(uv0.x)>fwidth(w.x)+.001) uv0.x=w.x;
    #endif
    vec4 s=texture2D(uL0,uv0); c=mix(c,s.rgb,s.a*step(0.,m.y)*step(m.y,1.));
    vec2 uv=(m*uLv1.z-uLv1.xy)/uLv1.w; s=texture2D(uL1,uv); c=mix(c,s.rgb,s.a*feather(uv));
    uv=(m*uLv2.z-uLv2.xy)/uLv2.w; s=texture2D(uL2,uv); c=mix(c,s.rgb,s.a*feather(uv));
    // The finest levels use local east/north offsets from the target: exact to centimetres.
    vec2 en=vec2(dot(rel,uE),-dot(rel,uN));
    uv=uLv3.xy+en*uLv3.z; s=texture2D(uL3,uv); c=mix(c,s.rgb,s.a*feather(uv));
    uv=uLv4.xy+en*uLv4.z; s=texture2D(uL4,uv); c=mix(c,s.rgb,s.a*feather(uv));
    uv=uLv5.xy+en*uLv5.z; s=texture2D(uL5,uv); c=mix(c,s.rgb,s.a*feather(uv));
    return c;
}

// ---- Clouds: a weather pattern from space resolving into cumulus fields up close ----
float cloudDensity(vec3 P, vec3 rel, float h01, float oct){
    float weather=fbmN(P*2.3+vec3(3.1,1.7,8.3),4.);
    float mid=fbmN(P*29.+vec3(7.2,2.9,5.1),3.);
    vec3 db=(P-uBank.xyz)/uBank.w;
    float cov=uCloud.z+(weather-.5)*1.2+(mid-.5)*.8+uCloud.w*exp(-dot(db,db));
    if(cov<.05) return 0.;
    float cum=fbmN(rel*1100.+vec3(11.3,4.1,7.7),min(oct,4.));
    float det=fbmN(rel*6500.+vec3(31.3,22.1,13.7),oct-2.6);
    float top=.45+.55*cum;
    float profile=smoothstep(0.,.12,h01)*(1.-smoothstep(top*.45,top,h01));
    float w=mix(.4,.17,clamp(oct*.5,0.,1.));   // soft from afar, still soft-edged up close
    float body=smoothstep(1.-cov-w,1.-cov+w,cum)*profile;
    return clamp((body-(1.-det)*.3)/.7,0.,1.);
}
float lodFor(float t){ return clamp(log2(1./(t*uPix*1100.+1e-9))-2.,0.,7.); }
vec4 thinClouds(vec3 ro, vec3 rd, float tMin, float tMax){
    float rm=(uCloud.x+uCloud.y)*.5, cm=uCamC-rm*(2.+rm);
    float b=dot(ro,rd), d=b*b-cm;
    float t;
    if(cm>0.){ if(d<=0.||b>=0.) return vec4(0.); t=cm/(-b+sqrt(d)); }
    else t=-b+sqrt(d);
    if(t>tMax||t<tMin) return vec4(0.);
    vec3 rel=uCamRel+rd*t, P=uT+rel, n=normalize(P);
    float slant=1./max(abs(dot(n,rd)),.08);
    float oct=min(lodFor(t*min(slant,8.)),6.);
    float dens=cloudDensity(P,rel,.32,oct);
    if(dens<.002) return vec4(0.);
    vec3 so=uSun*(uCloud.y-uCloud.x)*.8;
    float self=exp(-cloudDensity(P+so,rel+so,.55,oct-1.)*1.6);
    float a=1.-exp(-dens*SIGMA*(uCloud.y-uCloud.x)*slant*.3);
    float sun=dot(n,uSun);
    float below=step(cm,0.);   // seen from underneath: the shaded base
    vec3 L=SUN_I*sunTrans(P)*((.95-.8*below)*max(sun,0.)*(.45+.55*self)+.05)+vec3(.55,.68,1.)*(.09+.07*below)*SUN_I*smoothstep(-.12,.3,sun);
    return vec4(L*a,a);
}
vec4 clouds(vec3 ro, vec3 rd, float tMax, float jit){ return thinClouds(ro,rd,0.,tMax); }
// Inside the deck: a whiteout from the cloud density at the camera, broken into wisps along the
// view so it streams past while flying through.
vec4 cloudVeil(vec3 rd){
    float thick=uCloud.y-uCloud.x;
    float h01=(uCamAlt-uCloud.x)/thick;
    if(h01<-.15||h01>1.15) return vec4(0.);
    vec3 P=uT+uCamRel;
    float d=cloudDensity(P,uCamRel,clamp(h01,0.,1.),3.);
    float edge=smoothstep(-.15,.1,h01)*(1.-smoothstep(.9,1.15,h01));
    float wisp=fbmN(rd*5.+uCamRel*900.,3.);
    float v=clamp(d*1.6*(.55+.9*wisp)*edge,0.,1.);
    vec3 L=SUN_I*sunTrans(P)*(.55+.25*wisp)+vec3(.55,.68,1.)*.12*SUN_I;
    return vec4(L,v);
}
vec3 groundLight(vec3 P, vec3 rel, vec3 nrm, vec3 alb, vec3 rd){
    vec3 a=pow(alb,vec3(2.2));
    float mu=dot(nrm,uSun);
    vec3 sunT=sunTrans(P);
    float up=dot(normalize(P),uSun);
    float hm=(uCloud.x+uCloud.y)*.5;
    vec3 o=uSun*(hm/max(up,.15));
    float shadow=exp(-cloudDensity(P+o,rel+o,.32,2.)*SIGMA*(uCloud.y-uCloud.x)*.12);
    vec3 sky=vec3(.35,.55,1.)*.16*clamp(up*1.5+.2,0.,1.);
    vec3 L=a*(SUN_I*sunT*max(mu,0.)*shadow+SUN_I*sky);
    float water=smoothstep(.015,.06,alb.b-alb.r)*(1.-smoothstep(.1,.22,dot(alb,vec3(.3,.59,.11))));
    vec3 h=normalize(uSun-rd);
    L+=water*SUN_I*sunT*shadow*pow(max(dot(nrm,h),0.),180.)*.6*step(0.,mu);
    return L;
}
vec3 tonemap(vec3 L){ return pow(1.-exp(-L*uExposure),vec3(1./2.2)); }
`;

    // The globe pass: one ray per pixel through space, atmosphere, clouds and onto the sphere. While
    // uStyle < 1 it blends from the home page's own globe look (earth.js) so the handover is invisible.
    const SCENE_FS = `
uniform vec2 uRes, uShift, uSkyShift;
uniform vec3 uR, uU, uF;
uniform float uS, uSkyS, uStyle, uStarPx;
varying vec2 vUv;
// ---- earth.js sky, reproduced exactly for the handover ----
float h3s(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
vec3 h33(vec3 p){ return vec3(h3s(p),h3s(p+19.19),h3s(p+47.73)); }
float noiseS(vec3 x){
    vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
    return mix(mix(mix(h3s(i),h3s(i+vec3(1,0,0)),f.x),mix(h3s(i+vec3(0,1,0)),h3s(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h3s(i+vec3(0,0,1)),h3s(i+vec3(1,0,1)),f.x),mix(h3s(i+vec3(0,1,1)),h3s(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm4(vec3 p){ float v=0.,a=.5; for(int i=0;i<4;i++){ v+=a*noiseS(p); p=p*2.07+vec3(1.7,9.2,3.1); a*=.5; } return v; }
vec3 starLayer(vec3 d,float sc,float px,float density){
    vec3 p=d*sc, id=floor(p), r=h33(id);
    if(r.x>density) return vec3(0.);
    vec3 at=.25+.5*h33(id+7.3);
    float dist=length(p-id-at);
    float mag=pow(r.y,14.)*4.+.1;
    float w=px*sc*(.42+.38*sqrt(mag));
    float twinkle=1.+.22*sin(uTime*(.8+2.6*r.z)+r.y*60.)*smoothstep(.3,1.5,mag);
    vec3 tint=r.z<.12?vec3(1.,.66,.48):mix(vec3(.66,.77,1.),vec3(1.,.93,.8),r.z);
    return tint*mag*twinkle*exp(-dist*dist/(w*w));
}
vec3 space(vec3 d, vec2 s){
    float drift=uTime*.006;
    d=vec3(d.x*cos(drift)-d.z*sin(drift),d.y,d.x*sin(drift)+d.z*cos(drift));
    float px=uStarPx;
    vec3 galaxyPole=normalize(vec3(.174,-.82,-.546));
    vec3 galaxyCore=normalize(vec3(-.653,-.501,.567));
    float b=dot(d,galaxyPole), band=exp(-b*b*26.);
    vec3 color=vec3(.006,.010,.024);
    if(band>.01){
        float cl=fbm4(d*5.+2.);
        float dust=smoothstep(.42,.72,fbm4(d*13.+5.))*exp(-b*b*70.);
        float core=exp(-b*b*55.)*pow(max(dot(d,galaxyCore),0.),4.);
        float glow=(band*.8+core*.9)*(.3+cl)*(1.-.75*dust);
        color+=mix(vec3(.34,.40,.56),vec3(.86,.76,.62),clamp(core*1.5,0.,1.))*glow*.22;
    }
    float neb=fbm4(d*2.6+11.);
    color+=vec3(.36,.10,.36)*pow(smoothstep(.52,.85,neb),2.)*.07;
    color+=vec3(.04,.22,.30)*pow(smoothstep(.55,.9,fbm4(d*3.1-7.)),2.)*.06;
    float crowd=.5+.5*band;
    color+=starLayer(d,60.,px,.05)*1.6;
    color+=starLayer(d,140.,px,.022*crowd);
    color+=starLayer(d,300.,px,.008*crowd)*.7;
    color+=starLayer(d,520.,px,.035*band)*.55;
    color+=vec3(.06,.05,.04)*exp(-length((s-vec2(-.05,1.05))*vec2(1.6,1.))*3.2);
    return color;
}
void main(){
    vec2 q=(vUv-.5)*vec2(uRes.x/uRes.y,1.);
    vec3 rd=normalize(uR*(q.x-uShift.x)*uS+uU*(q.y-uShift.y)*uS+uF);
    vec3 sd=normalize(uR*(q.x-uSkyShift.x)*uSkyS+uU*(q.y-uSkyShift.y)*uSkyS+uF);
    vec3 ro=uT+uCamRel;
    float b=dot(ro,rd), disc=b*b-uCamC;
    bool hit=disc>0.&&b<0.;
    float tG=hit?uCamC/(-b+sqrt(disc)):1e3;
    vec3 rel=uCamRel+rd*tG, P=uT+rel, n=normalize(P);
    vec3 sky=vec3(0.);
    if(uStyle<1.||uCamAlt>.0015) sky=space(sd,vUv);   // stars are lost in the daylight sky lower down
    float jit=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))+fract(uTime*7.)*.618);   // interleaved gradient noise

    vec3 look=vec3(0.);
    if(uStyle<1.){
        vec3 cr=cross(ro,rd); float r2=dot(cr,cr);
        if(hit){
            vec3 ns=vec3(dot(n,uR),dot(n,uU),-dot(n,uF));
            vec3 c=baseAlbedo(n)*(.24+.88*max(dot(ns,normalize(vec3(-.65,.5,1.))),0.));
            c=mix(c,vec3(.24,.55,.72),pow(1.-clamp(ns.z,0.,1.),3.5)*.48);
            vec3 bg=r2>.99?sky:vec3(0.);
            look=mix(bg+vec3(.048,.122,.17),c,smoothstep(0.,.008,1.-r2));
        } else look=sky+vec3(.15,.38,.53)*exp(-(sqrt(r2)-1.)*46.)*.32;
    }
    vec3 cine=vec3(0.);
    if(uStyle>0.){
        vec3 tr;
        if(hit){
            vec3 Lg=groundLight(P,rel,n,cineAlbedo(n,rel),rd);
            vec4 cl=clouds(ro,rd,tG,jit);
            vec3 ins=atmo(ro,rd,tG,tr);
            vec4 veil=cloudVeil(rd);
            cine=tonemap(mix(ins+tr*(cl.rgb+(1.-cl.a)*Lg),veil.rgb,veil.a));
        } else {
            vec4 cl=clouds(ro,rd,1e3,jit);
            vec3 ins=atmo(ro,rd,1e3,tr);
            float mu=dot(rd,uSun);
            vec3 L=ins+tr*cl.rgb+tr*(1.-cl.a)*SUN_I*60.*smoothstep(.99997,.99999,mu);
            vec4 veil=cloudVeil(rd);
            cine=tonemap(mix(L,veil.rgb,veil.a));
            float skyLum=dot(ins,vec3(.3,.6,.1))*uExposure;
            cine+=sky*tr*(1.-cl.a)*(1.-smoothstep(0.,.22,skyLum));
            cine+=vec3(1.,.88,.7)*pow(max(mu,0.),900.)*.5*(1.-cl.a);
        }
        cine+=vec3(1.,.9,.75)*pow(max(dot(rd,uSun),0.),60.)*.08;   // soft glare around the sun
    }
    gl_FragColor=vec4(mix(look,cine,uStyle),1.);
}`;

    // The terrain mesh for the final approach: real elevation, shaded exactly like the globe pass.
    const MESH_VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute float aEdge;
uniform vec3 uCamRel, uR, uU, uF;
uniform float uS, uAspect, uNear, uFar;
varying vec3 vRel, vNor; varying float vEdge;
void main(){
    vec3 d=aPos-uCamRel;
    float z=dot(d,uF);
    gl_Position=vec4(dot(d,uR)/uS*2./uAspect, dot(d,uU)/uS*2., (z*(uFar+uNear)-2.*uFar*uNear)/(uFar-uNear), z);
    vRel=aPos; vNor=aNor; vEdge=aEdge;
}`;
    const MESH_FS = `
uniform float uMeshMix, uOpaque;
varying vec3 vRel, vNor; varying float vEdge;
void main(){
    vec3 P=uT+vRel, n=normalize(P);
    vec3 dv=vRel-uCamRel; float dist=length(dv); vec3 rd=dv/dist;
    vec3 ro=uT+uCamRel;
    float jit=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))+fract(uTime*7.)*.618);   // interleaved gradient noise
    vec3 Lg=groundLight(P,vRel,normalize(vNor),cineAlbedo(n,vRel),rd);
    float a=uMeshMix*(1.-smoothstep(.86,1.,vEdge));
    if(uOpaque>.5){ if(a<.5) discard; a=1.; }
    vec4 cl=vec4(0.);
    if(uCamAlt>uCloud.x) cl=clouds(ro,rd,dist,jit);   // under the deck nothing is in front of the ground
    vec3 tr; vec3 ins=atmo(ro,rd,dist,tr);
    vec4 veil=cloudVeil(rd);
    gl_FragColor=vec4(tonemap(mix(ins+tr*(cl.rgb+(1.-cl.a)*Lg),veil.rgb,veil.a)),a);
}`;

    // Post: motion blur from the focus of expansion, defocus towards the edges at speed, vignette,
    // grain, and the mist that the destination scene appears through (canvas alpha reveals it).
    const POST_FS = `precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uRes, uFoe;
uniform float uBlur, uDof, uMist, uReveal, uFlow, uStyle, uTime, uGrain, uHero;
float hh(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
float f2(vec2 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*n2(p); p=p*2.03+17.1; a*=.5; } return v; }
void main(){
    vec2 uv=vUv, asp=vec2(uRes.x/uRes.y,1.);
    vec2 dir=uv-uFoe;
    float r=length((uv-.5)*asp);
    float amt=uBlur+uDof*r*r;
    vec3 col;
    if(amt>.0004){
        float j=hh(gl_FragCoord.xy+fract(uTime)*91.);
        vec3 s=vec3(0.); float ws=0.;
        for(int i=0;i<BLUR_TAPS;i++){
            float f=(float(i)+j)/float(BLUR_TAPS), w=1.-f*.55;
            s+=texture2D(uScene,uv-dir*amt*f).rgb*w; ws+=w;
        }
        col=s/ws;
    } else col=texture2D(uScene,uv).rgb;
    // The home page hero's left-hand shade, kept for the handover and faded with the style.
    float hero=mix(.72,.25,smoothstep(0.,.32,uv.x))*(1.-smoothstep(.32,.6,uv.x));
    col=mix(col,vec3(.008,.02,.055),hero*uHero);
    col*=mix(1.,1.-.32*smoothstep(.5,1.15,r),uStyle);
    // Mist streaming past from the focus of expansion; the scene below shows where it parts.
    vec2 d2=dir*asp; float rr=length(d2)+.02;
    float m=0., mw=0.;
    for(int i=0;i<3;i++){
        float ph=fract(uFlow+float(i)/3.);
        float w=sin(ph*3.14159);
        m+=w*f2(d2/exp2(ph*3.)*3.2+float(i)*7.31); mw+=w;
    }
    m/=mw;
    float mist=uMist*smoothstep(.2,.7,m+uMist*.45);
    float alpha=1.-smoothstep(0.,.2,uReveal*2.3-(rr*.85+(1.-m)*.5));
    vec3 mc=vec3(.86,.89,.9)*(.92+.16*m);
    col+=(hh(gl_FragCoord.xy*1.37+fract(uTime*3.1))-.5)*uGrain;
    float mo=mist*(1.-uReveal*.85);
    vec3 outc=col*alpha*(1.-mo)+mc*mo;
    gl_FragColor=vec4(outc,alpha*(1.-mo)+mo);
}`;

    // ---- Tile streaming ----------------------------------------------------------------------
    function TileQueue(limit) {
        const waiting = [];
        let running = 0, generation = 0;
        function pump() {
            while (running < limit && waiting.length) {
                waiting.sort((a, b) => a.priority - b.priority);
                const job = waiting.shift(), mine = generation;
                running++;
                const image = new Image();
                image.crossOrigin = 'anonymous';
                image.decoding = 'async';
                const done = ok => {
                    running--;
                    if (mine === generation) (ok ? job.onload : job.onerror)(image);
                    image.onload = image.onerror = null;
                    pump();
                };
                image.onload = () => done(true);
                image.onerror = () => done(false);
                image.src = job.url;
            }
        }
        return {
            push(job) { waiting.push(job); pump(); },
            cancel() { waiting.length = 0; generation++; }
        };
    }

    window.createEarthDive = function createEarthDive(options = {}) {
        const opts = Object.assign({
            earthView: window.earthView,
            parent: document.body,
            baseTexture: 'images/earth/surface.jpg',
            imagery: {
                url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
                maxZoom: 14,
                attribution: 'Imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0'
            },
            terrain: {
                url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
                zoom: 11,
                attribution: 'Elevation: Terrain Tiles on AWS Open Data (Mapzen; SRTM, GMTED2010, ETOPO1 and others)'
            },
            autoplay: true,      // the flight plays by itself; false: scrolling drives it instead
            duration: 8,         // seconds for the whole automatic flight, space to ground
            scrollLength: 7,     // viewport heights of scrolling for the whole flight (autoplay: false)
            scrub: .32,          // seconds the camera takes to catch up with its target (smooths both modes)
            meshExtent: 60000,   // metres of real terrain around the target
            exposure: .18,
            labels: ['Space', 'Orbit', 'Descent', 'Arrival']
        }, options);
        const earthView = opts.earthView;
        const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        let tier = mobile ? 'mobile' : 'desktop';
        const TIERS = {
            desktop: { atmo: 10, meshAtmo: 5, cloud: 10, taps: 8, local: 8, world: 8, mesh: 255, dpr: 1.25, scale: [.4, .85], start: .6 },
            mobile: { atmo: 6, meshAtmo: 4, cloud: 6, taps: 6, local: 4, world: 4, mesh: 161, dpr: 1, scale: [.35, .65], start: .5 },
            lite: { atmo: 5, meshAtmo: 3, cloud: 4, taps: 4, local: 4, world: 4, mesh: 97, dpr: 1, scale: [.3, .5], start: .4 }
        };

        // ---- DOM ---------------------------------------------------------------------------
        const root = document.createElement('div');
        root.className = 'earth-dive';
        root.hidden = true;
        root.innerHTML =
            '<div class="earth-dive__scene"></div>' +
            '<canvas class="earth-dive__canvas" aria-hidden="true"></canvas>' +
            '<div class="earth-dive__scroller" tabindex="-1">' +
                '<div class="earth-dive__track"></div>' +
                '<div class="earth-dive__content"></div>' +
            '</div>' +
            '<div class="earth-dive__hud" aria-hidden="true">' +
                '<ol class="earth-dive__rail">' + opts.labels.map(l => `<li><span>${l}</span></li>`).join('') + '</ol>' +
                '<p class="earth-dive__hint"><span>Scroll to fly down</span></p>' +
            '</div>' +
            '<p class="earth-dive__status" role="status"></p>' +
            '<p class="earth-dive__credit"></p>' +
            '<button type="button" class="earth-dive__back">Back to space</button>';
        opts.parent.appendChild(root);
        const sceneSlot = root.querySelector('.earth-dive__scene');
        const canvas = root.querySelector('.earth-dive__canvas');
        const scroller = root.querySelector('.earth-dive__scroller');
        const track = root.querySelector('.earth-dive__track');
        const contentSlot = root.querySelector('.earth-dive__content');
        const hud = root.querySelector('.earth-dive__hud');
        const rail = [...root.querySelectorAll('.earth-dive__rail li')];
        const hint = root.querySelector('.earth-dive__hint');
        const status = root.querySelector('.earth-dive__status');
        const credit = root.querySelector('.earth-dive__credit');
        const backButton = root.querySelector('.earth-dive__back');
        credit.textContent = [opts.imagery.attribution, opts.terrain && opts.terrain.attribution].filter(Boolean).join(' · ');

        // ---- WebGL -------------------------------------------------------------------------
        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'high-performance' });
        const supported = !!gl;
        let programs = null, quad = null, fbo = null, base = null, levels = [], mesh = null, anisotropic = null, derivatives = null;

        function compile(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const log = gl.getShaderInfoLog(shader);
                gl.deleteShader(shader);
                throw new Error(log);
            }
            return shader;
        }
        // Shaders are compiled and linked without asking for the result, then polled with
        // KHR_parallel_shader_compile, so the page never waits on the graphics driver. (Asking for
        // LINK_STATUS straight away blocks the main thread until the driver has finished.)
        function startProgram(vs, fs, attributes) {
            const p = gl.createProgram();
            const v = gl.createShader(gl.VERTEX_SHADER), f = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(v, vs); gl.compileShader(v);
            gl.shaderSource(f, fs); gl.compileShader(f);
            gl.attachShader(p, v); gl.attachShader(p, f);
            attributes.forEach((name, i) => gl.bindAttribLocation(p, i, name));
            gl.linkProgram(p);
            return { p, v, f };
        }
        function finishProgram(x) {
            if (!gl.getProgramParameter(x.p, gl.LINK_STATUS)) {
                const log = gl.getShaderInfoLog(x.f) || gl.getShaderInfoLog(x.v) || gl.getProgramInfoLog(x.p);
                gl.deleteProgram(x.p); gl.deleteShader(x.v); gl.deleteShader(x.f);
                throw new Error(log);
            }
            gl.detachShader(x.p, x.v); gl.detachShader(x.p, x.f);
            gl.deleteShader(x.v); gl.deleteShader(x.f);
            const cache = {};
            return { p: x.p, u: name => (name in cache ? cache[name] : (cache[name] = gl.getUniformLocation(x.p, name))) };
        }
        let building = null;
        function buildPrograms(done) {
            const t = TIERS[tier];
            const head = (derivatives ? '#extension GL_OES_standard_derivatives : enable\n' : '') + 'precision highp float;\n';
            const defs = steps => `#define ATMO_STEPS ${steps}\n#define CLOUD_STEPS ${t.cloud}\n`;
            const parts = {
                scene: startProgram(QUAD_VS, head + defs(t.atmo) + COMMON + SCENE_FS, ['a']),
                mesh: startProgram(MESH_VS, head + defs(t.meshAtmo) + COMMON + MESH_FS, ['aPos', 'aNor', 'aEdge']),
                post: startProgram(QUAD_VS, `#define BLUR_TAPS ${t.taps}\n` + POST_FS, ['a'])
            };
            const mine = building = {};
            const check = () => {
                if (mine !== building || gl.isContextLost()) return;
                if (parallel && !Object.values(parts).every(x => gl.getProgramParameter(x.p, parallel.COMPLETION_STATUS_KHR))) {
                    setTimeout(check, 60);
                    return;
                }
                building = null;
                let next = null;
                try {
                    next = {};
                    for (const key in parts) next[key] = finishProgram(parts[key]);
                } catch (error) {
                    console.error('Earth dive shaders failed:', error);
                    if (done) done(false);
                    return;
                }
                if (programs) Object.values(programs).forEach(x => gl.deleteProgram(x.p));
                programs = next;
                if (done) done(true);
            };
            check();
        }
        function texture(size, wrapS) {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS || gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            if (anisotropic) gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
            gl.generateMipmap(gl.TEXTURE_2D);
            return tex;
        }
        let glReady = false, parallel = null, shaderState = 'none', noiseTex = null;
        function initGL() {
            if (glReady || !supported) return glReady;
            try {
                derivatives = gl.getExtension('OES_standard_derivatives');
                anisotropic = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
                parallel = gl.getExtension('KHR_parallel_shader_compile');
                shaderState = 'building';
                buildPrograms(ok => {
                    shaderState = ok ? 'ready' : 'failed';
                    if (ok && pendingEnter) { const [d, e] = pendingEnter; pendingEnter = null; preparing.classList.remove('is-visible'); start(d, e); }
                    else if (!ok && pendingEnter) { pendingEnter = null; preparing.textContent = 'The flight could not start on this device.'; setTimeout(() => preparing.classList.remove('is-visible'), 2600); }
                });
                // Random texture for the cloud noise (see noise() in the shaders).
                const size = 256, rnd = new Uint8Array(size * size), data = new Uint8Array(size * size * 4);
                for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random() * 256 | 0;
                for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                    const k = (y * size + x) * 4;
                    data[k] = rnd[y * size + x];
                    data[k + 1] = rnd[((y + 17) & 255) * size + ((x + 37) & 255)];
                    data[k + 3] = 255;
                }
                noiseTex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, noiseTex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                quad = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, quad);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
                // Base texture (the home page's own Earth), used for the handover and the poles.
                base = { tex: gl.createTexture(), ready: false };
                gl.bindTexture(gl.TEXTURE_2D, base.tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 40, 60, 255]));
                const image = new Image();
                image.onload = () => {
                    if (!glReady) return;
                    gl.bindTexture(gl.TEXTURE_2D, base.tex);
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    if (anisotropic) gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, 8);
                    gl.generateMipmap(gl.TEXTURE_2D);
                    base.ready = true;
                };
                image.src = opts.baseTexture;
                glReady = true;
            } catch (error) {
                console.error('Earth dive could not start WebGL:', error);
                glReady = false;
            }
            return glReady;
        }

        // ---- Satellite clipmap: a world level and five levels centred on the target ----------
        const queue = TileQueue(mobile ? 6 : 10);
        let siteKey = '', tilesTotal = 0, tilesDone = 0, worldLevel = null;
        function makeLevel(z, n, world) {
            return { z, n, world, size: n * 256, tex: texture(n * 256, world ? gl.REPEAT : gl.CLAMP_TO_EDGE), x0: 0, y0: 0, dirty: false, lastMip: 0 };
        }
        function fillLevel(level, target, priority) {
            const tileUrl = opts.imagery.url, n = level.n, z = level.z, count = 2 ** z;
            const [mx, my] = merc(target.lat, target.lng);
            if (!level.world) {
                level.x0 = Math.round(mx * count - n / 2);
                level.y0 = Math.max(0, Math.min(count - n, Math.round(my * count - n / 2)));
            }
            const jobs = [];
            for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
                const tx = level.x0 + i, ty = level.y0 + j;
                const cx = (tx + .5) / count - mx, cy = (ty + .5) / count - my;
                jobs.push({ i, j, tx: ((tx % count) + count) % count, ty, d: Math.hypot(cx, cy) * count });
            }
            jobs.sort((a, b) => a.d - b.d);
            tilesTotal += jobs.length;
            const key = siteKey;
            jobs.forEach((job, k) => queue.push({
                priority: priority + k * .001,
                url: tileUrl.replace('{z}', z).replace('{y}', job.ty).replace('{x}', job.tx),
                onload(image) {
                    if (!glReady || (!level.world && key !== siteKey)) return;
                    gl.bindTexture(gl.TEXTURE_2D, level.tex);
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, job.i * 256, job.j * 256, gl.RGBA, gl.UNSIGNED_BYTE, image);
                    level.dirty = true;
                    tilesDone++;
                },
                onerror() { tilesDone++; }
            }));
        }

        // ---- Terrain mesh from real elevation ------------------------------------------------
        let terrain = null, terrainBlend = 0, terrainState = 'none';
        function loadTerrain(target) {
            terrain = null; terrainBlend = 0;
            if (!opts.terrain) { terrainState = 'none'; return; }
            terrainState = 'loading';
            const z = opts.terrain.zoom, n = mobile ? 6 : 8, count = 2 ** z;
            const [mx, my] = merc(target.lat, target.lng);
            const x0 = Math.round(mx * count - n / 2), y0 = Math.round(my * count - n / 2);
            const sheet = document.createElement('canvas');
            sheet.width = sheet.height = n * 256;
            const context = sheet.getContext('2d', { willReadFrequently: true });
            let left = n * n;
            const key = siteKey;
            const finish = () => {
                if (--left || key !== siteKey) return;
                inSlices(buildTerrain(), key, ok => { terrainState = ok && mesh ? 'ready' : 'failed'; });
            };
            function* buildTerrain() {
                let pixels;
                try { pixels = context.getImageData(0, 0, sheet.width, sheet.height).data; }
                catch (error) { console.error(error); return false; }
                yield;
                const heights = new Float32Array(sheet.width * sheet.height), w = sheet.width;
                for (let row = 0; row < w; row++) {
                    for (let k = row * w; k < (row + 1) * w; k++)
                        heights[k] = Math.max(0, pixels[k * 4] * 256 + pixels[k * 4 + 1] + pixels[k * 4 + 2] / 256 - 32768);
                    if (row % 64 === 63) yield;
                }
                terrain = { z, n, x0, y0, w, heights };
                yield* buildMesh(target);
                return true;
            }
            for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) queue.push({
                priority: 50 + Math.hypot(i - n / 2 + .5, j - n / 2 + .5) * .01,
                url: opts.terrain.url.replace('{z}', z).replace('{x}', (((x0 + i) % count) + count) % count).replace('{y}', y0 + j),
                onload(image) { context.drawImage(image, i * 256, j * 256); finish(); },
                onerror() { finish(); }
            });
        }
        function heightAt(lat, lng) {
            if (!terrain) return 0;
            const [mx, my] = merc(lat, lng), count = 2 ** terrain.z;
            const x = mx * count * 256 - terrain.x0 * 256 - .5, y = my * count * 256 - terrain.y0 * 256 - .5;
            const w = terrain.w, xi = Math.floor(x), yi = Math.floor(y);
            if (xi < 0 || yi < 0 || xi >= w - 1 || yi >= w - 1) return 0;
            const fx = x - xi, fy = y - yi, h = terrain.heights, k = yi * w + xi;
            return (h[k] * (1 - fx) + h[k + 1] * fx) * (1 - fy) + (h[k + w] * (1 - fx) + h[k + w + 1] * fx) * fy;
        }
        // Runs a generator a few milliseconds at a time between frames.
        function inSlices(steps, key, done) {
            const run = () => {
                if (key !== siteKey) return;
                const start = performance.now();
                let r;
                do { r = steps.next(); } while (!r.done && performance.now() - start < 8);
                if (r.done) done(r.value !== false);
                else setTimeout(run, 0);
            };
            setTimeout(run, 0);
        }
        let follow = null;   // smoothed highest ground, for keeping the camera clear of hills
        function* buildMesh(target) {
            if (!glReady) return false;
            const N = TIERS[tier].mesh, ext = opts.meshExtent, a = 4.5, sa = Math.sinh(a);
            const T = frame0.T, E = frame0.E, Nn = frame0.N;
            const pos = new Float64Array(N * N * 3), edge = new Float32Array(N * N);
            for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                const u = i / (N - 1) * 2 - 1, v = j / (N - 1) * 2 - 1;
                const x = ext * Math.sinh(a * u) / sa, y = ext * Math.sinh(a * v) / sa;
                const W = normalize(add(T, add(scale(E, toR(x)), scale(Nn, toR(y)))));
                const [lat, lng] = toLatLng(W);
                const rf = Math.max(Math.abs(u), Math.abs(v));
                const h = heightAt(lat, lng) * (1 - smoother(.7, .92, rf));
                const P = sub(scale(W, 1 + toR(h)), T);
                pos.set(P, (j * N + i) * 3);
                edge[j * N + i] = rf;
                if (i === N - 1 && j % 16 === 15) yield;
            }
            yield;
            const nor = new Float32Array(N * N * 3), p32 = new Float32Array(pos);
            const at = (i, j) => { i = Math.max(0, Math.min(N - 1, i)); j = Math.max(0, Math.min(N - 1, j)); const k = (j * N + i) * 3; return [pos[k], pos[k + 1], pos[k + 2]]; };
            for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                const n = normalize(cross(sub(at(i + 1, j), at(i - 1, j)), sub(at(i, j + 1), at(i, j - 1))));
                nor.set(n, (j * N + i) * 3);
                if (i === N - 1 && j % 32 === 31) yield;
            }
            const index = new Uint16Array((N - 1) * (N - 1) * 6);
            let k = 0;
            for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
                const q = j * N + i;
                index[k++] = q; index[k++] = q + 1; index[k++] = q + N;
                index[k++] = q + 1; index[k++] = q + N + 1; index[k++] = q + N;
            }
            const buffer = data => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
            yield;
            const ib = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
            const built = { pos: buffer(p32), nor: buffer(nor), edge: buffer(edge), index: ib, count: index.length };
            // Highest ground nearby, blurred, on a coarse grid in local metres.
            const G = 72, cell = ext * 2 / G, raw = new Float32Array(G * G);
            for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
                let m = 0;
                for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
                    const x = -ext + (i + .5 + di * .5) * cell, y = -ext + (j + .5 + dj * .5) * cell;
                    const [lat, lng] = toLatLng(add(T, add(scale(E, toR(x)), scale(Nn, toR(y)))));
                    m = Math.max(m, heightAt(lat, lng));
                }
                raw[j * G + i] = m;
                if (i === G - 1 && j % 12 === 11) yield;
            }
            let grid = raw;
            for (let pass = 0; pass < 3; pass++) {
                const out = new Float32Array(G * G);
                for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
                    let s = 0, c = 0;
                    for (let d = -2; d <= 2; d++) {
                        const ii = Math.max(0, Math.min(G - 1, i + (pass % 2 ? 0 : d))), jj = Math.max(0, Math.min(G - 1, j + (pass % 2 ? d : 0)));
                        s += Math.max(grid[jj * G + ii], grid[j * G + i] * .8); c++;
                    }
                    out[j * G + i] = s / c;
                }
                grid = out;
            }
            freeMesh();
            mesh = built;
            follow = { G, cell, ext, grid };
            terrain.heights = null;   // the mesh and grid are all that is kept
            return true;
        }
        function followHeight(g) {
            if (!follow) return 0;
            const rel = sub(g, frame0.T);
            const x = dot(rel, frame0.E) * EARTH_RADIUS, y = dot(rel, frame0.N) * EARTH_RADIUS;
            const fx = (x + follow.ext) / follow.cell - .5, fy = (y + follow.ext) / follow.cell - .5;
            const G = follow.G, i = Math.floor(fx), j = Math.floor(fy);
            if (i < 0 || j < 0 || i >= G - 1 || j >= G - 1) return 0;
            const u = fx - i, v = fy - j, h = follow.grid;
            return (h[j * G + i] * (1 - u) + h[j * G + i + 1] * u) * (1 - v) + (h[(j + 1) * G + i] * (1 - u) + h[(j + 1) * G + i + 1] * u) * v;
        }
        function freeMesh() {
            if (!mesh) return;
            [mesh.pos, mesh.nor, mesh.edge, mesh.index].forEach(b => gl.deleteBuffer(b));
            mesh = null;
        }

        // ---- Off-screen target for the scene, resized with the dynamic resolution -----------
        function ensureFbo(w, h) {
            if (fbo && fbo.w === w && fbo.h === h) return;
            if (fbo) { gl.deleteTexture(fbo.tex); gl.deleteRenderbuffer(fbo.depth); gl.deleteFramebuffer(fbo.fb); }
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            const depth = gl.createRenderbuffer();
            gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, w, h);   // 24-bit depth for the terrain
            const fb = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depth);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            fbo = { tex, depth, fb, w, h };
        }

        // ---- Flight plan ---------------------------------------------------------------------
        // Built once per entry from the globe as it is on screen and from the destination, then
        // sampled at any progress p (0–1). Everything below is a pure function of p, so scrolling up
        // retraces exactly the same path.
        let site = null, frame0 = null, plan = null;
        function buildPlan() {
            const f = earthView.frame();
            const W = f.width, H = f.height, m = f.m;
            const R0 = [m[0], m[3], m[6]], U0 = [m[1], m[4], m[7]], B0 = [m[2], m[5], m[8]];
            const T = fromLatLng(site.lat, site.lng), tf = tangentFrame(T);
            const psi = (site.heading || 0) * D2R;
            const HT = add(scale(tf.n, Math.cos(psi)), scale(tf.e, Math.sin(psi)));
            const rho0 = f.radius / H;
            const s0 = .07, s1 = .3, s2 = 1;
            const distFor = (rho, s) => 1 / Math.sin(Math.atan(rho * s));
            const A0 = distFor(rho0, s0) - 1, A1 = distFor(Math.min(.62, rho0 * 1.12), s1) - 1, A2 = distFor(.92, s2) - 1;
            const endAlt = toR(site.endAltitude || 2500);
            const A5 = Math.max(toR(3000), endAlt * 1.5), A6 = Math.exp(mix(Math.log(A5), Math.log(endAlt), .7));
            let endPitch = site.endPitch || 70;
            if (site.horizon) {   // match the destination photo's horizon line (fraction of screen height from the top)
                const dip = Math.sqrt(2 * endAlt) / D2R;
                endPitch = Math.max(60, Math.min(89.4, 90 - Math.atan((.5 - site.horizon()) * s2) / D2R - dip));
            }
            const altitude = spline([[0, Math.log(A0)], [.2, Math.log(A1)], [.4, Math.log(A2)], [.55, Math.log(toR(127000))],
                [.68, Math.log(toR(10000))], [.75, Math.log(A5)], [.88, Math.log(A6)], [1, Math.log(endAlt)]]);
            const pitch = spline([[0, 0], [.4, 0], [.55, 12], [.68, 40], [.75, Math.min(60, endPitch * .68)], [.88, endPitch - 6], [1, endPitch]]);
            const fov = spline([[0, s0], [.2, s1], [.4, s2], [.62, 1.06], [.8, 1.04], [1, s2]]);
            const startFrame = tangentFrame(B0);
            const h0 = Math.atan2(dot(U0, startFrame.e), dot(U0, startFrame.n));
            let dh = ((psi - h0) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
            const heading = p => h0 + dh * smoother(.3, .72, p);
            const A = p => Math.exp(altitude(p));
            const back75 = A(.75) * Math.tan(pitch(.75) * D2R);
            // How far behind the target (along the approach) the camera is: first so that the target
            // stays centred while the camera pitches up, then a forward glide over it.
            const back = p => {
                const centred = A(p) * Math.tan(Math.min(pitch(p), 80) * D2R);
                const glide = mix(back75, back75 * .15, smoother(.75, 1, p));
                return mix(centred, glide, smoother(.7, .92, p));
            };
            const shift = [(f.x - W / 2) / H, (H / 2 - f.y) / H];
            const sunStart = normalize(add(add(scale(R0, -.65), scale(U0, .5)), scale(B0, 1)));
            const sunEl = 32 * D2R, sunAz = psi + 145 * D2R;
            const sunEnd = normalize(add(scale(T, Math.sin(sunEl)), scale(add(scale(tf.n, Math.cos(sunAz)), scale(tf.e, Math.sin(sunAz))), Math.cos(sunEl))));
            frame0 = { T, E: tf.e, N: tf.n };
            plan = { T, tf, HT, psi, B0, R0, U0, A, pitch, fov, heading, back, shift, sunStart, sunEnd, endAlt, W, H };
            // A cumulus bank where the camera passes through the deck, so the dive really goes through cloud.
            const mid = (site.cloudBase + site.cloudTop) / 2;
            let lo = .4, hi = 1;
            for (let i = 0; i < 40; i++) { const c = (lo + hi) / 2; if (A(c) > toR(mid)) lo = c; else hi = c; }
            const g = groundPoint(lo);
            plan.bank = scale(g, 1 + toR(mid));
            plan.crossing = lo;
        }
        function groundPoint(p) {
            const travel = smoother(.08, .42, p);
            const d = plan.back(p);
            const Gt = normalize(add(scale(plan.T, Math.cos(d)), scale(plan.HT, -Math.sin(d))));
            return slerp(plan.B0, Gt, travel);
        }
        function camera(p, time) {
            const g = groundPoint(p);
            const tf = tangentFrame(g);
            const h = plan.heading(p);
            const H = add(scale(tf.n, Math.cos(h)), scale(tf.e, Math.sin(h)));
            const intro = reducedMotion ? 0 : introRamp;
            // Gentle handheld float: strongest in space, calmer near the ground.
            const amp = intro * (1 - .6 * smoother(.4, .9, p));
            let th = plan.pitch(p) * D2R + amp * (.0035 * Math.sin(time * .31) + .002 * Math.sin(time * .73 + 1.3));
            const yaw = amp * (.004 * Math.sin(time * .23 + .4) + .0015 * Math.sin(time * .61));
            const Hy = rotateAround(H, g, yaw);
            let F = add(scale(g, -Math.cos(th)), scale(Hy, Math.sin(th)));
            let U = add(scale(g, Math.sin(th)), scale(Hy, Math.cos(th)));
            // Bank into the turn while the heading swings round, like a camera aircraft.
            const e = .004, rate = (plan.heading(Math.min(1, p + e)) - plan.heading(Math.max(0, p - e))) / (2 * e);
            const roll = Math.max(-.12, Math.min(.12, -rate * .025)) + amp * .0025 * Math.sin(time * .41 + 2.1);
            U = rotateAround(U, F, roll);
            const Rr = cross(F, U);
            const hFollow = followHeight(g) * terrainBlend * (1 - smoother(toR(9000), toR(26000), plan.A(p)));
            const alt = plan.A(p) + toR(hFollow);
            const C = scale(g, 1 + alt);
            const shiftK = 1 - smoother(.02, .32, p);
            const sky = smoother(.3, .45, p);
            return {
                C, R: Rr, U, F, alt, g,
                s: plan.fov(p), shift: scale(plan.shift, shiftK),
                // earth.js draws its sky centred on the canvas, so the sky rays have no lens shift.
                skyS: mix(1.15, plan.fov(p), sky), skyShift: [0, 0],
                sun: slerp(plan.sunStart, plan.sunEnd, smoother(.08, .5, p))
            };
        }

        // ---- Scroll scrub --------------------------------------------------------------------
        let active = false, target = 0, progress = 0, introRamp = 0, styleMix = 0, leaving = null, onExit = null, scene = null;
        const scrollRange = () => Math.max(1, track.offsetHeight - scroller.clientHeight);
        function onScroll() {
            if (!opts.autoplay) target = clamp01(scroller.scrollTop / scrollRange());
            // Back at the top after reading the chapter: show the destination whole again, so the next
            // downward scroll repeats the same sequence.
            if (landed && !awaiting && !leaving && !autoScroll) {
                if (scroller.scrollTop > 40) chapterDown = true;
                else if (chapterDown && scroller.scrollTop <= 1) {
                    awaiting = true; chapterDown = false;
                    lockScroll(true);
                    if (scene && scene.afterChapter) scene.afterChapter();
                }
            }
            wake();
        }
        // Automatic flight: progress runs from where it is to `to` over `seconds`, gently eased at
        // both ends (the camera path itself accelerates and slows within the dive).
        let playFrom = 0, playTo = 0, playStart = 0, playDur = 0, landed = false;
        function play(to, seconds) {
            playFrom = target; playTo = to; playStart = performance.now(); playDur = Math.max(.1, seconds) * 1000;
            wake();
        }
        function playStep(now) {
            if (!playDur) return;
            const t = clamp01((now - playStart) / playDur);
            target = playFrom + (playTo - playFrom) * (t * t * (3 - 2 * t) * .3 + t * .7);
            if (t >= 1) playDur = 0;
        }
        // During the flight the page does not scroll; after landing the chapter slides up on its own.
        function lockScroll(on) { scroller.classList.toggle('is-locked', on); }
        function showChapter() {
            const first = contentSlot.querySelector('section, article > *') || contentSlot.firstElementChild;
            if (!first) return;
            lockScroll(false);
            const lift = Math.min(first.offsetHeight + 48, scroller.clientHeight * .7);
            scroller.scrollTo({ top: lift, behavior: reducedMotion ? 'auto' : 'smooth' });
        }
        // After landing the destination is shown whole and the page stays still. The first downward
        // scroll (wheel, swipe or key) lets the scene put its own controls away, then the chapter slides up.
        let awaiting = false, chapterDown = false, swipeFrom = null;
        function requestChapter() {
            if (!active || !landed || !awaiting || leaving) return;
            awaiting = false; chapterDown = false;
            const delay = scene && scene.beforeChapter ? scene.beforeChapter() || 0 : 0;
            setTimeout(() => { if (active && landed && !leaving && !awaiting) showChapter(); }, delay);
        }
        const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', ' ', 'End']);
        root.addEventListener('wheel', event => { if (event.deltaY > 0) requestChapter(); }, { passive: true });
        root.addEventListener('touchstart', event => { swipeFrom = event.touches[0].clientY; }, { passive: true });
        root.addEventListener('touchmove', event => {
            if (swipeFrom !== null && swipeFrom - event.touches[0].clientY > 30) { swipeFrom = null; requestChapter(); }
        }, { passive: true });
        root.addEventListener('keydown', event => {
            // Keys typed into a control (the slider, a button) belong to that control.
            if (DOWN_KEYS.has(event.key) && !event.target.closest('input, button, select, textarea')) requestChapter();
        });

        let autoScroll = 0;
        function stopAutoScroll() { cancelAnimationFrame(autoScroll); autoScroll = 0; }
        function scrollToTop(then) {
            stopAutoScroll();
            const from = scroller.scrollTop, start = performance.now();
            const duration = Math.min(4200, 900 + from / scrollRange() * 3300);
            const step = now => {
                const t = clamp01((now - start) / duration), e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                scroller.scrollTop = from * (1 - e);
                if (t < 1) autoScroll = requestAnimationFrame(step);
                else { autoScroll = 0; then(); }
            };
            autoScroll = requestAnimationFrame(step);
        }
        ['wheel', 'touchstart', 'keydown'].forEach(type => scroller.addEventListener(type, () => { if (autoScroll && !leaving) stopAutoScroll(); }, { passive: true }));

        // ---- Render loop ---------------------------------------------------------------------
        let frame = 0, last = 0, renderScale = 1, cooldown = 0, frameEma = 16, slowFor = 0, prevCam = null, blurNow = 0;
        function wake() { if (active && !frame) frame = requestAnimationFrame(loop); }
        function loop(now) {
            frame = 0;
            if (!active) return;
            const raw = Math.max(0, (now - (last || now)) / 1000);
            const dt = Math.min(.1, Math.max(.001, raw));
            last = now;
            if (document.hidden) { frame = requestAnimationFrame(loop); return; }
            playStep(now);
            // Scrub: the camera eases towards its target (the timeline, or the scroll position).
            const k = 1 - Math.exp(-dt / (reducedMotion ? .08 : opts.scrub));
            progress += (target - progress) * k;
            if (Math.abs(target - progress) < 1e-5) progress = target;
            introRamp = Math.min(1, introRamp + dt / 1.6);
            styleMix = leaving && leaving.fadeStyle ? Math.max(0, styleMix - dt / .7) : Math.min(1, styleMix + dt / 1.6);
            if (terrainState === 'ready') terrainBlend = Math.min(1, terrainBlend + dt / 1.5);
            updateHud();
            const reveal = site.scene ? smoother(.9, .985, progress) : 0;
            if (scene && scene.update) scene.update(smoother(.86, 1, progress), progress);
            const hiddenCanvas = reveal >= .999;
            canvas.style.visibility = hiddenCanvas ? 'hidden' : 'visible';
            // The destination layer is only composited once the arrival begins (it is covered before).
            const sceneOn = progress > .84;
            if (sceneSlot.classList.contains('is-on') !== sceneOn) sceneSlot.classList.toggle('is-on', sceneOn);
            if (!hiddenCanvas) draw(now, dt, reveal);
            if (!hiddenCanvas && raw > 0) adapt(raw);
            if (leaving && leaving.check()) return;
            const settling = Math.abs(target - progress) > 1e-5 || styleMix < 1 || introRamp < 1 || terrainBlend < 1 && terrainState === 'ready';
            // Keep animating for the float and the stars unless the destination scene has taken over.
            if (opts.autoplay && !leaving && !landed && progress >= .995) { landed = true; awaiting = true; chapterDown = false; }
            if (!hiddenCanvas || settling || leaving || playDur) frame = requestAnimationFrame(loop);
        }
        // Resolution follows the measured frame time: one very slow frame drops straight to the
        // lowest scale; otherwise it steps down quickly and climbs back slowly.
        function adapt(raw) {
            const ms = raw * 1000;
            frameEma = frameEma * .8 + Math.min(ms, 400) * .2;
            cooldown -= raw;
            const [lo, hi] = TIERS[tier].scale;
            if (ms > 120 && renderScale > lo) { renderScale = lo; cooldown = .5; }
            if (cooldown > 0) return;
            if (frameEma > 22 && renderScale > lo) { renderScale = Math.max(lo, renderScale - .1); cooldown = .25; }
            else if (frameEma < 13 && renderScale < hi) { renderScale = Math.min(hi, renderScale + .05); cooldown = 1.2; }
            // Still too slow at the lowest resolution: switch to the lighter shaders once.
            slowFor = frameEma > 45 && renderScale <= lo ? slowFor + raw : 0;
            if (slowFor > 1.5 && tier !== 'lite' && !building) {
                tier = 'lite'; slowFor = 0; cooldown = 1;
                buildPrograms(ok => { if (ok) renderScale = TIERS.lite.start; });
            }
        }
        function setLevels(prog) {
            const units = [base.tex, ...levels.map(l => l.tex)];
            ['uBase', 'uL0', 'uL1', 'uL2', 'uL3', 'uL4', 'uL5'].forEach((name, i) => {
                gl.activeTexture(gl.TEXTURE0 + i);
                gl.bindTexture(gl.TEXTURE_2D, units[i]);
                gl.uniform1i(prog.u(name), i);
            });
            const [mx, my] = merc(site.lat, site.lng);
            levels.slice(1, 3).forEach((l, i) => gl.uniform4f(prog.u('uLv' + (i + 1)), l.x0, l.y0, 2 ** l.z, l.n));
            const cosLat = Math.cos(site.lat * D2R);
            levels.slice(3).forEach((l, i) => {
                const count = 2 ** l.z;
                gl.uniform3f(prog.u('uLv' + (i + 3)), (mx * count - l.x0) / l.n, (my * count - l.y0) / l.n, count / (l.n * 2 * Math.PI * cosLat));
            });
        }
        function setCommon(prog, cam, now, pix) {
            const T = plan.T, rel = sub(cam.C, T);
            gl.uniform3fv(prog.u('uT'), T);
            gl.uniform3fv(prog.u('uE'), plan.tf.e);
            gl.uniform3fv(prog.u('uN'), plan.tf.n);
            gl.uniform3fv(prog.u('uCamRel'), rel);
            gl.uniform3fv(prog.u('uSun'), cam.sun);
            gl.uniform1f(prog.u('uCamC'), cam.alt * (2 + cam.alt));
            gl.uniform1f(prog.u('uCamAlt'), cam.alt);
            gl.uniform1f(prog.u('uTime'), now / 1000);
            gl.uniform1f(prog.u('uExposure'), opts.exposure * (1 + .55 * smoother(.62, .95, progress)));
            gl.uniform1f(prog.u('uPix'), pix);
            gl.uniform4f(prog.u('uCloud'), toR(site.cloudBase), toR(site.cloudTop), site.cloudCover, site.cloudBank);
            gl.uniform4f(prog.u('uBank'), plan.bank[0], plan.bank[1], plan.bank[2], toR(3200));
            setLevels(prog);
            gl.activeTexture(gl.TEXTURE7);
            gl.bindTexture(gl.TEXTURE_2D, noiseTex);
            gl.uniform1i(prog.u('uNoise'), 7);
        }
        function draw(now, dt, reveal) {
            const t = TIERS[tier];
            const dpr = Math.min(devicePixelRatio || 1, t.dpr);
            const outW = Math.max(1, Math.round(canvas.clientWidth * dpr)), outH = Math.max(1, Math.round(canvas.clientHeight * dpr));
            if (canvas.width !== outW || canvas.height !== outH) { canvas.width = outW; canvas.height = outH; }
            // Start at full resolution so the first frame matches the home page globe pixel for pixel.
            const sc = styleMix <= 0 ? 1 : renderScale;
            const sw = Math.max(1, Math.round(outW * sc / 8) * 8), sh = Math.max(1, Math.round(outH * sc / 8) * 8);
            ensureFbo(sw, sh);
            const stale = levels.find(l => l.dirty && now - l.lastMip > 400);
            if (stale) { gl.bindTexture(gl.TEXTURE_2D, stale.tex); gl.generateMipmap(gl.TEXTURE_2D); stale.dirty = false; stale.lastMip = now; }

            const cam = camera(progress, now / 1000);
            const pix = cam.s / sh;
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
            gl.viewport(0, 0, sw, sh);
            gl.disable(gl.BLEND);
            gl.disable(gl.DEPTH_TEST);
            gl.depthMask(true);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            // Real terrain for the last part of the descent. Once it is fully in, it is drawn first so
            // the globe pass only runs on the pixels it leaves uncovered (sky and the far distance).
            const meshMix = mesh ? terrainBlend * (1 - smoother(toR(13000), toR(22000), cam.alt)) : 0;
            const meshFirst = meshMix >= .999;
            if (meshFirst) drawMesh(cam, now, pix, sw, sh, meshMix, true);
            if (meshFirst) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); }
            const sp = programs.scene;
            gl.useProgram(sp.p);
            setCommon(sp, cam, now, pix);
            gl.uniform2f(sp.u('uRes'), sw, sh);
            gl.uniform2f(sp.u('uShift'), cam.shift[0], cam.shift[1]);
            gl.uniform2f(sp.u('uSkyShift'), cam.skyShift[0], cam.skyShift[1]);
            gl.uniform3fv(sp.u('uR'), cam.R); gl.uniform3fv(sp.u('uU'), cam.U); gl.uniform3fv(sp.u('uF'), cam.F);
            gl.uniform1f(sp.u('uS'), cam.s); gl.uniform1f(sp.u('uSkyS'), cam.skyS);
            gl.uniform1f(sp.u('uStyle'), styleMix);
            gl.uniform1f(sp.u('uStarPx'), 1.15 / Math.max(outH, 1));
            drawQuad();
            gl.depthMask(true);
            gl.disable(gl.DEPTH_TEST);
            // While the terrain fades in, it is blended over the globe instead.
            if (meshMix > .001 && !meshFirst) drawMesh(cam, now, pix, sw, sh, meshMix, false);

            // Motion blur from the real camera velocity: optical flow ~ speed / height above ground.
            const rel = sub(cam.C, plan.T);
            let foe = [.5, .5], flow = 0;
            if (prevCam) {
                const v = scale(sub(rel, prevCam), 1 / dt);
                const along = dot(v, cam.F), sign = along < 0 ? -1 : 1;
                if (Math.abs(along) > 1e-12) {
                    const qx = dot(v, cam.R) / (along * cam.s), qy = dot(v, cam.U) / (along * cam.s);
                    foe = [Math.max(-.5, Math.min(1.5, .5 + qx * sh / sw + cam.shift[0] * sh / sw)), Math.max(-.5, Math.min(1.5, .5 + qy + cam.shift[1]))];
                }
                flow = length(v) / Math.max(cam.alt, toR(50)) * sign;
            }
            prevCam = rel;
            const wanted = reducedMotion ? 0 : Math.min(.075, Math.abs(flow) * .012) * styleMix;
            blurNow += (wanted - blurNow) * (1 - Math.exp(-dt / .08));

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, outW, outH);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            const pp = programs.post;
            gl.useProgram(pp.p);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
            gl.uniform1i(pp.u('uScene'), 0);
            gl.uniform2f(pp.u('uRes'), outW, outH);
            gl.uniform2f(pp.u('uFoe'), foe[0], foe[1]);
            gl.uniform1f(pp.u('uBlur'), blurNow);
            gl.uniform1f(pp.u('uDof'), reducedMotion ? 0 : blurNow * .9 + .012 * smoother(.45, .7, progress) * (1 - smoother(.8, .95, progress)));
            const mist = site.scene ? smoother(.84, .93, progress) * (1 - smoother(.95, .995, progress)) * .9 : 0;
            gl.uniform1f(pp.u('uMist'), mist);
            gl.uniform1f(pp.u('uReveal'), reveal);
            gl.uniform1f(pp.u('uFlow'), progress * 14 + now / 1000 * .04);
            gl.uniform1f(pp.u('uStyle'), styleMix);
            gl.uniform1f(pp.u('uHero'), (1 - styleMix) * heroShade);
            gl.uniform1f(pp.u('uTime'), now / 1000);
            gl.uniform1f(pp.u('uGrain'), reducedMotion ? 0 : .025 * styleMix);
            drawQuad();
        }
        function drawMesh(cam, now, pix, sw, sh, meshMix, opaque) {
            const mp = programs.mesh;
            gl.useProgram(mp.p);
            setCommon(mp, cam, now, pix);
            gl.uniform3fv(mp.u('uR'), cam.R); gl.uniform3fv(mp.u('uU'), cam.U); gl.uniform3fv(mp.u('uF'), cam.F);
            gl.uniform1f(mp.u('uS'), cam.s);
            gl.uniform1f(mp.u('uAspect'), sw / sh);
            gl.uniform1f(mp.u('uNear'), Math.max(toR(20), cam.alt * .05));
            gl.uniform1f(mp.u('uFar'), toR(opts.meshExtent * 3));
            gl.uniform1f(mp.u('uMeshMix'), meshMix);
            gl.uniform1f(mp.u('uOpaque'), opaque ? 1 : 0);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LESS);
            gl.depthMask(true);
            if (opaque) gl.disable(gl.BLEND);
            else { gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); }
            const attrib = (buffer, loc, size) => { gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
            attrib(mesh.pos, 0, 3); attrib(mesh.nor, 1, 3); attrib(mesh.edge, 2, 1);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
            gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
            gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
            gl.disable(gl.DEPTH_TEST);
            gl.disable(gl.BLEND);
        }
        function drawQuad() {
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        // ---- HUD -----------------------------------------------------------------------------
        const PHASES = [0, .2, .4, .75];
        function updateHud() {
            const phase = PHASES.filter(x => progress >= x - 1e-6).length - 1;
            rail.forEach((li, i) => { li.classList.toggle('is-active', i === phase); li.classList.toggle('is-past', i < phase); });
            root.style.setProperty('--dive-progress', progress.toFixed(4));
            hint.classList.toggle('is-hidden', opts.autoplay || target > .015 || !!leaving);
            const contentIn = scroller.scrollTop > scrollRange() + scroller.clientHeight * .3;   // the chapter covers part of the screen
            hud.classList.toggle('is-hidden', contentIn);
            credit.classList.toggle('is-hidden', contentIn);
            backButton.classList.toggle('is-hidden', contentIn);   // the chapter has its own
            const pending = [];
            if (tilesTotal && tilesDone < tilesTotal) pending.push(`Satellite imagery ${Math.round(tilesDone / tilesTotal * 100)}%`);
            if (terrainState === 'loading') pending.push('Terrain loading');
            if (terrainState === 'failed') pending.push('Terrain unavailable: flat ground');
            status.textContent = pending.join(' · ');
            status.classList.toggle('is-hidden', !pending.length || contentIn);
        }

        // ---- Public API ----------------------------------------------------------------------
        let heroShade = 0, pendingEnter = null;
        // A small notice while the shaders finish compiling (only if someone is very quick).
        const preparing = document.createElement('p');
        preparing.className = 'earth-dive-preparing';
        preparing.setAttribute('role', 'status');
        preparing.textContent = 'Preparing the flight…';
        opts.parent.appendChild(preparing);
        function enter(destination, extra = {}) {
            if (!supported || !initGL()) return false;
            if (shaderState === 'failed') return false;
            if (shaderState !== 'ready') {
                pendingEnter = [destination, extra];
                preparing.textContent = 'Preparing the flight…';
                preparing.classList.add('is-visible');
                return true;
            }
            return start(destination, extra);
        }
        function start(destination, extra) {
            if (active) exit({ immediate: true });
            site = Object.assign({ cloudBase: 1500, cloudTop: 4000, cloudCover: .32, cloudBank: .3, heading: 30 }, destination);
            scene = extra.scene || null;
            onExit = extra.onExit || null;
            sceneSlot.replaceChildren(...(scene && scene.element ? [scene.element] : []));
            contentSlot.replaceChildren(...(extra.content ? [extra.content] : []));
            track.style.height = (opts.autoplay ? 100 : opts.scrollLength * 100) + 'svh';
            heroShade = extra.heroShade ?? 1;
            // Laid out (still transparent) before planning, so the destination can be measured.
            root.hidden = false;
            root.classList.remove('is-leaving', 'is-visible');
            const key = site.lat.toFixed(4) + ',' + site.lng.toFixed(4);
            buildPlan();
            if (key !== siteKey) {
                siteKey = key;
                queue.cancel();
                tilesTotal = tilesDone = 0;
                const t = TIERS[tier];
                // The world level must hold every tile of its zoom: n tiles across means zoom log2(n).
                if (!worldLevel) { worldLevel = makeLevel(Math.log2(t.world), t.world, true); fillLevel(worldLevel, site, 0); }
                levels.slice(1).forEach(l => gl.deleteTexture(l.tex));
                levels = [worldLevel, makeLevel(6, 4, false), makeLevel(8, 4, false), makeLevel(10, t.local, false), makeLevel(12, t.local, false), makeLevel(Math.min(14, opts.imagery.maxZoom), t.local, false)];
                levels.slice(1).forEach((l, i) => fillLevel(l, site, 10 + i * 10));
                freeMesh(); follow = null;
                loadTerrain(site);
            } else if (terrainState === 'ready') terrainBlend = 1;
            active = true; leaving = null;
            target = progress = 0; introRamp = 0; styleMix = 0; prevCam = null; blurNow = 0; last = 0;
            renderScale = TIERS[tier].start;
            frameEma = 16; cooldown = .4;
            scroller.scrollTop = 0;
            landed = false; playDur = 0; awaiting = false; chapterDown = false;
            lockScroll(opts.autoplay);
            if (opts.autoplay) play(1, opts.duration);
            document.body.classList.add('is-diving');
            // Draw the first frame (identical to the globe) before showing the layer, then stop the globe.
            loop(performance.now());
            requestAnimationFrame(() => {
                root.classList.add('is-visible');
                setTimeout(() => { if (active && !leaving) earthView.setSuspended(true); }, 450);
            });
            scroller.focus({ preventScroll: true });
            return true;
        }
        // Back to space: rewind the flight along the scroll, return to the home look, then hand back.
        function exit({ immediate = false } = {}) {
            if (pendingEnter) { pendingEnter = null; preparing.classList.remove('is-visible'); }
            if (!active) return;
            const finish = () => {
                stopAutoScroll();
                playDur = 0; landed = false; awaiting = false; chapterDown = false;
                active = false; leaving = null;
                cancelAnimationFrame(frame); frame = 0;
                root.classList.remove('is-visible', 'is-leaving');
                root.hidden = true;
                document.body.classList.remove('is-diving');
                if (scene && scene.leave) scene.leave();
                const callback = onExit; onExit = null;
                if (callback) callback();
            };
            earthView.setSuspended(false);
            if (immediate) { finish(); return; }
            leaving = {
                fadeStyle: false,
                check() {
                    if (!this.fadeStyle && progress < .002 && !autoScroll && !playDur) this.fadeStyle = true;
                    if (this.fadeStyle && styleMix <= 0) {
                        root.classList.add('is-leaving');
                        setTimeout(finish, 380);
                        leaving = { check: () => true };
                        return true;
                    }
                    return false;
                }
            };
            if (opts.autoplay) {
                // Fly back up on its own: the chapter slides away and the flight plays in reverse.
                landed = false; awaiting = false; chapterDown = false;
                lockScroll(true);
                scroller.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
                play(0, Math.max(1.8, progress * opts.duration * .6));
            } else scrollToTop(() => { target = 0; wake(); });
            wake();
        }
        function destroy() {
            exit({ immediate: true });
            queue.cancel();
            scroller.removeEventListener('scroll', onScroll);
            removeEventListener('resize', onResize);
            document.removeEventListener('keydown', onKey);
            if (glReady) {
                freeMesh();
                levels.forEach(l => gl.deleteTexture(l.tex));
                if (base) gl.deleteTexture(base.tex);
                if (fbo) { gl.deleteTexture(fbo.tex); gl.deleteRenderbuffer(fbo.depth); gl.deleteFramebuffer(fbo.fb); }
                if (quad) gl.deleteBuffer(quad);
                if (noiseTex) gl.deleteTexture(noiseTex);
                if (programs) Object.values(programs).forEach(x => gl.deleteProgram(x.p));
                const lose = gl.getExtension('WEBGL_lose_context');
                if (lose) lose.loseContext();
            }
            root.remove();
            preparing.remove();
        }
        function onResize() {
            if (!active) return;
            const keep = progress;
            buildPlan();   // the terrain mesh is in world space and stays valid
            progress = keep;
            onScroll();
        }
        function onKey(event) {
            if (!active || event.key !== 'Escape') return;
            exit();
        }
        if (supported) {
            const warm = () => (window.requestIdleCallback || (f => setTimeout(f, 1)))(() => initGL(), { timeout: 4000 });
            if (document.readyState === 'complete') setTimeout(warm, 1200);
            else addEventListener('load', () => setTimeout(warm, 1200), { once: true });
        }
        scroller.addEventListener('scroll', onScroll, { passive: true });
        addEventListener('resize', onResize);
        document.addEventListener('keydown', onKey);
        backButton.addEventListener('click', () => exit());
        canvas.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            glReady = false;
            if (active) { status.textContent = 'Graphics were interrupted. Showing the destination directly.'; scroller.scrollTop = scrollRange(); }
        });

        return {
            supported,
            enter,
            exit,
            destroy,
            isActive: () => active,
            progress: () => progress,
            scrollToEnd: () => scroller.scrollTo({ top: scrollRange(), behavior: 'smooth' }),
            element: root
        };
    };
})();
