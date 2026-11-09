/* A ray / sphere intersection renders a true spherical surface without a library.
   Coordinates: x east, y north, z towards the viewer. Angles are radians. */
(() => {
    'use strict';
    const canvas = document.getElementById('earth-canvas');
    if (!canvas) return;
    const message = document.getElementById('earth-message');
    const controls = [...document.querySelectorAll('.earth-controls button')];
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    let ready = false, frame = 0, inView = true, lastDraw = 0, lastFrame = 0, dirty = true;
    // Resting places for the globe centre, as fractions of the viewport: beside the heading,
    // centred while exploring, shifted aside while an animal profile panel is open, and sunk into
    // the bottom-right quarter as a backdrop behind the animal list (bottom-left behind About).
    const SPOTS={ side:[.63,.47], center:[.5,.5], focus:[.34,.5], corner:[.8,.82], cornerLeft:[.2,.82] };
    const MOBILE_SPOTS={ side:[.5,.61], center:[.5,.5], focus:[.5,.3], corner:[.78,.86], cornerLeft:[.22,.86] };
    let spot={ from:SPOTS.side, to:'side', p:1 }, glide=0, focused=false;
    // While a profile panel is open, the globe centres in the free space beside it (left of the
    // panel on wide screens, above it on narrow ones). offsetLeft/Top ignore the panel's slide-in transform.
    function focusSpot(w) {
        const panel=document.querySelector('.animal-panel'), h=canvas.clientHeight;
        if (!panel || !w || !h) return (w<=760?MOBILE_SPOTS:SPOTS).focus;
        return w<=760 ? [.5, Math.max(.18, panel.offsetTop/2/h)] : [Math.max(.2, panel.offsetLeft/2/w), .5];
    }
    const spotOf=(name,w)=>name==='focus'?focusSpot(w):(w<=760?MOBILE_SPOTS:SPOTS)[name];
    function spotNow(w) {
        const to=spotOf(spot.to,w), e=(1-Math.cos(Math.PI*spot.p))/2;
        return [spot.from[0]+(to[0]-spot.from[0])*e, spot.from[1]+(to[1]-spot.from[1])*e];
    }
    function layout() {
        const w=canvas.clientWidth, h=canvas.clientHeight, [x,y]=spotNow(w);
        return { x:w*x, y:h*y, radius:Math.min(w,h)*.45 };
    }
    // force: glide again towards the same spot after it has moved (the profile panel resized).
    function moveTo(name,force=false) {
        if (spot.to===name && !force) return;
        spot={ from:spotNow(canvas.clientWidth), to:name, p:0 };
        cancelAnimationFrame(glide);
        const start=performance.now(), duration=1600;
        const step=now=>{
            spot.p=Math.min(1,(now-start)/duration);
            invalidate();
            glide=spot.p<1?requestAnimationFrame(step):0;
        };
        glide=requestAnimationFrame(step);
    }
    // The heading fades via the body class while the globe slides.
    function setExploring(on) {
        document.body.classList.toggle('is-exploring', on);
        if (!on) focused=false;
        moveTo(on?(focused?'focus':'center'):'side');
    }
    // Ignored while the globe is a locked backdrop, so it stays in its corner behind the animal list.
    const explore=()=>{ if (!locked && !document.body.classList.contains('is-exploring')) setExploring(true); };
    // The panel's text arrives after it opens, and on narrow screens a taller panel leaves less
    // free space above it, so the globe glides again whenever the panel changes size.
    let panelWatch=null;
    function watchPanel() {
        const panel=document.querySelector('.animal-panel');
        if (panelWatch || !panel || !window.ResizeObserver) return;
        panelWatch=new ResizeObserver(()=>{ if (spot.to==='focus') moveTo('focus',true); });
        panelWatch.observe(panel);
    }
    function setFocus(on) {
        if (on) watchPanel();
        focused=on;
        if (on) document.body.classList.add('is-exploring');
        moveTo(on?'focus':(document.body.classList.contains('is-exploring')?'center':'side'));
    }
    // Orientation is a 3x3 row-major rotation matrix (screen normal -> texture space), rebuilt from
    // longitude (spin about the Earth's own axis) and tilt (clamped at the poles), so north stays up and the globe never rolls.
    const rotY = a => [Math.cos(a),0,Math.sin(a), 0,1,0, -Math.sin(a),0,Math.cos(a)];
    const rotX = a => [1,0,0, 0,Math.cos(a),Math.sin(a), 0,-Math.sin(a),Math.cos(a)];
    const mul = (a,b) => { const r=[]; for(let i=0;i<3;i++) for(let j=0;j<3;j++) r.push(a[i*3]*b[j]+a[i*3+1]*b[3+j]+a[i*3+2]*b[6+j]); return r; };
    const HOME = { lon: 100*Math.PI/180, lat: 18*Math.PI/180 };
    const state = { lon: HOME.lon, lat: HOME.lat, zoom: 1, m: null };
    let zoomTarget = 1;   // wheel and pinch steer this; the drawn zoom glides towards it
    let zoomEase = 110;   // ms time constant of that glide (slower for programmatic zoom-outs)
    const orient = () => { state.m = mul(rotY(state.lon), rotX(state.lat)); };
    orient();
    const fail = text => {
        ready = false;
        message.textContent = text;
        message.hidden = false;
        controls.forEach(button => button.disabled = true);
    };
    controls.forEach(button => button.disabled = true);
    if (!gl) { fail('Interactive Earth needs WebGL. Enable hardware acceleration and reload.'); return; }
    const vertex = `attribute vec2 position; varying vec2 uv;
        void main(){ uv=position; gl_Position=vec4(position,0.,1.); }`;
    // Derivatives let the shader hide the mipmap seam where longitude wraps at the date line.
    const derivatives = gl.getExtension('OES_standard_derivatives');
    const fragment = (derivatives ? '#extension GL_OES_standard_derivatives : enable\n' : '') + `precision highp float;
        varying vec2 uv;
        uniform vec2 size;
        uniform vec3 view;
        uniform mat3 orient;
        uniform vec3 geometry;
        uniform float time;
        uniform sampler2D surface;
        const float PI=3.14159265359;
        // The sky lives on a celestial sphere in the same frame as the globe, so turning the
        // Earth also swings the stars, Milky Way and nebulae around it like an orbiting camera.
        float h3(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        vec3 h33(vec3 p){ return vec3(h3(p),h3(p+19.19),h3(p+47.73)); }
        float noise(vec3 x){
            vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
            return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);
        }
        float fbm(vec3 p){ float v=0.,a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.07+vec3(1.7,9.2,3.1); a*=.5; } return v; }
        vec3 starLayer(vec3 d,float scale,float px,float density){
            vec3 p=d*scale, id=floor(p), r=h33(id);
            if(r.x>density) return vec3(0.);
            vec3 at=.25+.5*h33(id+7.3);
            float dist=length(p-id-at);
            float mag=pow(r.y,14.)*4.+.1;                   // many faint stars, a few bright ones
            float w=px*scale*(.42+.38*sqrt(mag));
            float twinkle=1.+.22*sin(time*(.8+2.6*r.z)+r.y*60.)*smoothstep(.3,1.5,mag);
            vec3 tint=r.z<.12?vec3(1.,.66,.48):mix(vec3(.66,.77,1.),vec3(1.,.93,.8),r.z);
            return tint*mag*twinkle*exp(-dist*dist/(w*w));
        }
        vec3 space(vec2 pixel){
            vec2 q=(pixel-size*.5)/size.y;
            vec3 d=orient*normalize(vec3(q*1.15,-1.));
            float drift=time*.006;                          // the sky slowly wheels overhead
            d=vec3(d.x*cos(drift)-d.z*sin(drift),d.y,d.x*sin(drift)+d.z*cos(drift));
            float px=1.15/size.y;
            // Placed so the band sweeps diagonally behind the starting view, core to the lower left.
            vec3 galaxyPole=normalize(vec3(.174,-.82,-.546));
            vec3 galaxyCore=normalize(vec3(-.653,-.501,.567));
            float b=dot(d,galaxyPole);
            float band=exp(-b*b*26.);
            vec3 color=vec3(.006,.010,.024);
            // Milky Way: a soft glowing band, brighter and warmer towards the core, cut by dust lanes.
            if(band>.01){
                float clouds=fbm(d*5.+2.);
                float dust=smoothstep(.42,.72,fbm(d*13.+5.))*exp(-b*b*70.);
                float core=exp(-b*b*55.)*pow(max(dot(d,galaxyCore),0.),4.);
                float glow=(band*.8+core*.9)*(.3+clouds)*(1.-.75*dust);
                color+=mix(vec3(.34,.40,.56),vec3(.86,.76,.62),clamp(core*1.5,0.,1.))*glow*.22;
            }
            // Faint emission nebulae.
            float neb=fbm(d*2.6+11.);
            color+=vec3(.36,.10,.36)*pow(smoothstep(.52,.85,neb),2.)*.07;
            color+=vec3(.04,.22,.30)*pow(smoothstep(.55,.9,fbm(d*3.1-7.)),2.)*.06;
            float crowd=.5+.5*band;
            color+=starLayer(d,60.,px,.05)*1.6;
            color+=starLayer(d,140.,px,.022*crowd);
            color+=starLayer(d,300.,px,.008*crowd)*.7;
            color+=starLayer(d,520.,px,.035*band)*.55;     // unresolved star dust inside the band     // unresolved star dust inside the band
            // Glare from the Sun just off-screen to the upper left, matching the globe's lighting.
            vec2 s=pixel/size;
            color+=vec3(.06,.05,.04)*exp(-length((s-vec2(-.05,1.05))*vec2(1.6,1.))*3.2);
            return color;
        }
        void main(){
            vec2 pixel=(uv*.5+.5)*size;
            vec2 p=(pixel-geometry.xy)/(geometry.z*view.z);
            float r2=dot(p,p);
            if(r2>1.){
                float glow=exp(-(sqrt(r2)-1.)*46.)*.32;
                gl_FragColor=vec4(space(pixel)+vec3(.15,.38,.53)*glow,1.); return;
            }
            vec3 bg=r2>.99?space(pixel):vec3(0.);
            vec3 n=vec3(p,sqrt(1.-r2));
            vec3 world=orient*n;
            float longitude=atan(world.x,world.z);
            float u=fract(longitude/(2.*PI)+.5);
            #ifdef GL_OES_standard_derivatives
            // Near the wrap, read from a copy of u that wraps on the far side instead (no seam line).
            float u2=fract(longitude/(2.*PI))-.5;
            if(fwidth(u)>fwidth(u2)+.001) u=u2;
            #endif
            vec2 tex=vec2(u,asin(clamp(world.y,-1.,1.))/PI+.5);
            vec3 land=texture2D(surface,tex).rgb;
            vec3 light=normalize(vec3(-.65,.5,1.));
            float diffuse=max(dot(n,light),0.);
            vec3 color=land*(.24+.88*diffuse);
            float rim=pow(1.-n.z,3.5);
            color=mix(color,vec3(.24,.55,.72),rim*.48);
            float edge=smoothstep(0.,.008,1.-r2);
            gl_FragColor=vec4(mix(bg+vec3(.048,.122,.17),color,edge),1.);
        }`;
    function shader(type, source) {
        const result = gl.createShader(type);
        gl.shaderSource(result, source); gl.compileShader(result);
        if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
        return result;
    }
    let program;
    try {
        program = gl.createProgram();
        gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Earth shader link failed');
    } catch (error) { console.error(error); fail('Earth could not start. Please try another browser.'); return; }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const sizeUniform = gl.getUniformLocation(program, 'size');
    const viewUniform = gl.getUniformLocation(program, 'view');
    const geometryUniform = gl.getUniformLocation(program, 'geometry');
    const orientUniform = gl.getUniformLocation(program, 'orient');
    const timeUniform = gl.getUniformLocation(program, 'time');
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Mipmaps and anisotropic filtering keep coastlines crisp when zoomed out or near the limb.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const anisotropic = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    if (anisotropic) gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    function render(now = 0) {
        frame = 0;
        if (!ready || document.hidden || !inView || suspended) return;
        const dt=Math.min(64,now-lastFrame); lastFrame=now;
        if (Math.abs(zoomTarget-state.zoom)>.0005) {
            state.zoom+=(zoomTarget-state.zoom)*(1-Math.exp(-dt/zoomEase));
            dirty=true;
        } else if (state.zoom!==zoomTarget) { state.zoom=zoomTarget; dirty=true; }
        // As a settled backdrop (behind the animal list or about view) the globe is half covered and
        // nobody is steering it, so the twinkling sky redraws at ~15fps and 1x instead of ~30fps and 1.5x.
        const backdrop=locked && !fly;
        if (!dirty && now-lastDraw<(backdrop?66:32)) { frame=requestAnimationFrame(render); return; }
        lastDraw=now;
        const viewChanged=dirty; dirty=false;
        const dpr = Math.min(devicePixelRatio || 1, backdrop ? 1 : 1.5);   // the sky shader is costly; 1.5x stays sharp
        const width = Math.max(1, Math.round(canvas.clientWidth*dpr));
        const height = Math.max(1, Math.round(canvas.clientHeight*dpr));
        if (canvas.width !== width || canvas.height !== height) { canvas.width=width; canvas.height=height; }
        gl.viewport(0,0,width,height);
        gl.uniform2f(sizeUniform,width,height);
        gl.uniform3f(viewUniform,0,0,state.zoom);
        const m=state.m; gl.uniformMatrix3fv(orientUniform,false,[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]]);
        const geometry=layout();
        gl.uniform3f(geometryUniform,geometry.x*dpr,(canvas.clientHeight-geometry.y)*dpr,geometry.radius*dpr);
        gl.uniform1f(timeUniform,now*.001);
        gl.drawArrays(gl.TRIANGLES,0,6);
        if (viewChanged) canvas.dispatchEvent(new CustomEvent('earthviewchange', { detail: { ...state } }));
        frame=requestAnimationFrame(render);
    }
    function invalidate() { dirty=true; if (!frame) frame=requestAnimationFrame(render); }
    function zoom(factor) { stopFly(); zoomEase=110; zoomTarget=Math.max(.85,Math.min(6,zoomTarget*factor)); invalidate(); }
    // Glide the zoom alone, leaving rotation to the user (e.g. easing out while they drag).
    function zoomTo(value,ease=110) { zoomEase=ease; zoomTarget=Math.max(.85,Math.min(6,value)); invalidate(); }
    function rotate(dx,dy) {
        state.lon=(state.lon-dx)%(Math.PI*2);
        state.lat=Math.max(-Math.PI/2,Math.min(Math.PI/2,state.lat+dy));
        orient(); invalidate();
    }
    // Inertia: after a flick the globe keeps turning and eases to a stop.
    const spin={vx:0,vy:0,frame:0,last:0,moved:0};
    function stopSpin() { cancelAnimationFrame(spin.frame); spin.frame=0; }
    function coast(now) {
        const dt=Math.min(48,now-spin.last); spin.last=now;
        const decay=Math.pow(.985,dt/16);
        spin.vx*=decay; spin.vy*=decay;
        if (Math.hypot(spin.vx,spin.vy)<.000005) { spin.frame=0; return; }
        rotate(spin.vx*dt,spin.vy*dt);
        spin.frame=requestAnimationFrame(coast);
    }
    function reset() { stopSpin(); stopFly(); setExploring(false); Object.assign(state,HOME,{zoom:1}); zoomTarget=1; orient(); invalidate(); }
    // Drift back to the starting view along the shortest path. The zoom settles first so the
    // whole globe is in sight while it slowly turns home.
    let fly=0;
    function stopFly() { cancelAnimationFrame(fly); fly=0; }
    // keepExploring: turn home but leave the globe centred and the heading hidden.
    function flyHome(keepExploring=false) {
        stopSpin(); stopFly();
        if (!keepExploring) { setExploring(false); canvas.dispatchEvent(new CustomEvent('earthhome')); }
        const from={lon:state.lon,lat:state.lat,zoom:state.zoom};
        const turn=((HOME.lon-from.lon)%(Math.PI*2)+Math.PI*3)%(Math.PI*2)-Math.PI;
        const angle=Math.max(Math.abs(turn),Math.abs(HOME.lat-from.lat))*180/Math.PI;
        const zoomTime=Math.abs(Math.log(from.zoom))>.05?1400:0;
        const turnTime=Math.max(2500,angle*45);          // about 22° per second
        const turnStart=zoomTime*.6, duration=turnStart+turnTime;
        const ease=t=>(1-Math.cos(Math.PI*Math.max(0,Math.min(1,t))))/2;
        const start=performance.now();
        const step=now=>{
            const elapsed=now-start, t=Math.min(1,elapsed/duration);
            const z=zoomTime?ease(elapsed/zoomTime):1, e=ease((elapsed-turnStart)/turnTime);
            state.lon=from.lon+turn*e;
            state.lat=from.lat+(HOME.lat-from.lat)*e;
            state.zoom=zoomTarget=from.zoom*Math.pow(1/from.zoom,z);
            orient(); invalidate();
            fly=t<1?requestAnimationFrame(step):0;
        };
        fly=requestAnimationFrame(step);
    }
    // Turn a point to face the camera while changing zoom. Diving in accelerates and climbing out
    // decelerates, like an aircraft descending to land; the zoom may exceed the user's wheel limits.
    function flyTo(lat,lng,{zoom:toZoom=state.zoom,duration=3000}={}) {
        stopSpin(); stopFly();
        const from={lon:state.lon,lat:state.lat,zoom:state.zoom};
        const toLon=lng*Math.PI/180, toLat=lat*Math.PI/180;
        const turn=((toLon-from.lon)%(Math.PI*2)+Math.PI*3)%(Math.PI*2)-Math.PI;
        const ease=t=>(1-Math.cos(Math.PI*Math.max(0,Math.min(1,t))))/2;
        const diving=toZoom>from.zoom, start=performance.now();
        const step=now=>{
            const t=Math.min(1,(now-start)/duration), e=ease(t/.6);   // the turn finishes early
            const z=diving?Math.pow(t,2.4):1-Math.pow(1-t,2.4);
            state.lon=from.lon+turn*e;
            state.lat=from.lat+(toLat-from.lat)*e;
            state.zoom=zoomTarget=from.zoom*Math.pow(toZoom/from.zoom,z);
            orient(); invalidate();
            fly=t<1?requestAnimationFrame(step):0;
        };
        fly=requestAnimationFrame(step);
    }
    // Place the camera directly (radians), for callers that animate it frame by frame.
    function setView(lon,lat,zoom) {
        stopSpin(); stopFly();
        state.lon=lon; state.lat=lat; state.zoom=zoomTarget=zoom;
        orient(); invalidate();
    }
    // The latitude and longitude (degrees) currently facing the camera.
    function viewCenter() {
        const m=state.m;
        return { lat:Math.asin(Math.max(-1,Math.min(1,m[5])))*180/Math.PI, lng:Math.atan2(m[2],m[8])*180/Math.PI };
    }
    // While a full-screen habitat scene covers the globe, stop drawing it.
    // Backdrop: the globe sinks into the corner and ignores drag, zoom and keys; the stars keep moving.
    let locked=false;
    function setBackdrop(on,where='corner') {
        locked=on;
        canvas.classList.toggle('is-locked', on);
        canvas.tabIndex=on?-1:0;
        if (on) {
            stopSpin(); pointers.clear(); canvas.classList.remove('is-dragging');
            focused=false; moveTo(where);
        }
    }
    let suspended=false;
    function setSuspended(on) { suspended=on; if (!on) invalidate(); }
    const image = new Image();
    image.onload = () => {
        try {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
            gl.generateMipmap(gl.TEXTURE_2D);
            ready=true; message.hidden=true; controls.forEach(button=>button.disabled=false); invalidate();
        } catch (error) { console.error(error); fail('Earth texture could not load. Open this site through Live Server.'); }
    };
    image.onerror = () => fail('Earth texture could not load. Please reload to try again.');
    image.src='images/earth/surface.jpg';
    const pointers=new Map();
    const distance=()=>{ const [a,b]=[...pointers.values()]; return Math.hypot(a.x-b.x,a.y-b.y); };
    canvas.addEventListener('pointerdown',event=>{
        if (!ready || locked || (event.pointerType==='mouse' && event.button!==0)) return;
        canvas.focus({preventScroll:true}); canvas.setPointerCapture(event.pointerId);
        stopSpin(); stopFly(); spin.vx=spin.vy=0; spin.moved=performance.now();
        pointers.set(event.pointerId,{x:event.clientX,y:event.clientY}); canvas.classList.add('is-dragging');
    });
    canvas.addEventListener('pointermove',event=>{
        const old=pointers.get(event.pointerId); if (!old) return;
        const before=pointers.size===2 ? distance() : 0;
        pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
        explore();
        if (pointers.size===2) { if (before>0) zoom(distance()/before); }
        else if (pointers.size===1) {
            const radius=layout().radius*state.zoom;
            const dx=(event.clientX-old.x)/radius, dy=(event.clientY-old.y)/radius;
            rotate(dx,dy);
            const now=performance.now(), dt=Math.max(1,now-spin.moved); spin.moved=now;
            spin.vx=spin.vx*.6+dx/dt*.4; spin.vy=spin.vy*.6+dy/dt*.4;
        }
    });
    function release(event) {
        if (!pointers.delete(event.pointerId)) return;
        if (pointers.size) return;
        canvas.classList.remove('is-dragging');
        // A pause before letting go means the user wanted it to stay put.
        const now=performance.now();
        if (event.type==='pointerup' && now-spin.moved<80) { spin.last=now; spin.frame=requestAnimationFrame(coast); }
    }
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>canvas.addEventListener(type,release));
    canvas.addEventListener('wheel',event=>{
        if (!ready) return;
        event.preventDefault();
        if (locked) return;
        explore();
        const unit=event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1;
        zoom(Math.exp(-Math.max(-200,Math.min(200,event.deltaY*unit))*.0015));
    },{passive:false});
    canvas.addEventListener('keydown',event=>{
        if (!ready || locked) return;
        const actions={ArrowLeft:()=>rotate(-.08,0),ArrowRight:()=>rotate(.08,0),ArrowUp:()=>rotate(0,-.08),ArrowDown:()=>rotate(0,.08),'+':()=>zoom(1.15),'=':()=>zoom(1.15),'-':()=>zoom(1/1.15),Home:()=>document.getElementById('earth-reset').click()};
        if (actions[event.key]) { event.preventDefault(); explore(); actions[event.key](); }
    });
    // Reset view returns to the opening page, exactly like the logo: the menu folds, the heading
    // comes back, any open profile closes and the globe eases home.
    document.getElementById('earth-reset').onclick=()=>{
        const logo=document.querySelector('#site-header.has-toggle .logo');
        if (logo) logo.click(); else flyHome();
    };
    new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView)invalidate();}).observe(canvas);
    new ResizeObserver(invalidate).observe(canvas);
    document.addEventListener('visibilitychange',invalidate);
    canvas.addEventListener('webglcontextlost',event=>{ event.preventDefault(); fail('The graphics connection was interrupted. Reload to restore Earth.'); });
    // Marker integration: returns viewport-local CSS pixels and front-face visibility.
    // Listen to earthviewchange to update markers after rotation, resize or zoom.
    window.earthView={
        // The globe exactly as drawn this moment (CSS px), so another renderer can take over seamlessly.
        frame:()=>{ const g=layout(); return { x:g.x, y:g.y, radius:g.radius*state.zoom, width:canvas.clientWidth, height:canvas.clientHeight, m:state.m.slice() }; },
        getState:()=>({...state}), reset, flyHome, flyTo, setView, viewCenter, setSuspended, explore, setFocus, setBackdrop, zoomTo,
        project(latitude,longitude) {
            const lat=latitude*Math.PI/180, lon=longitude*Math.PI/180, m=state.m;
            const p=[Math.cos(lat)*Math.sin(lon), Math.sin(lat), Math.cos(lat)*Math.cos(lon)];
            const x=m[0]*p[0]+m[3]*p[1]+m[6]*p[2], y=m[1]*p[0]+m[4]*p[1]+m[7]*p[2], sz=m[2]*p[0]+m[5]*p[1]+m[8]*p[2];
            const radius=layout().radius*state.zoom;
            // depth: 1 facing the viewer, 0 on the limb; (nx, ny) is the outward screen direction.
            return {x:layout().x+x*radius,y:layout().y-y*radius,visible:sz>.06,depth:Math.max(0,sz),nx:x,ny:-y};
        }
    };
})();
