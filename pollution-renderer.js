/* Photo-registered progressive reveal. Each habitat has a distinct source and spread direction.
   One shared renderer serves both pages; the original photo is exact at zero. */
(() => {
    'use strict';
    const vertex = 'attribute vec2 a; varying vec2 v; void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}';
    const fragment = `precision mediump float;
        varying vec2 v;
        uniform sampler2D original, damaged;
        uniform vec2 layer, source, spread;
        uniform vec4 fit;
        uniform float progress, kind;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
            return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
        void main(){
            vec2 uv=(v*layer-fit.xy)/fit.zw;
            vec3 clean=texture2D(original,uv).rgb;
            vec3 harm=texture2D(damaged,uv).rgb;
            float d=length((uv-source)*spread);
            float variation=noise(uv*19.)*.055+noise(uv*51.)*.025;
            float arrival=d*1.12+variation;
            // Separate activity from its later consequences in photo coordinates.
            if(kind<.5){
                arrival=mix(arrival,max(arrival,.64+max(.61-uv.y,0.)*.5),1.-smoothstep(.53,.69,uv.y));
                arrival=mix(arrival,max(arrival,.35+d*.35),(1.-smoothstep(.24,.43,uv.x))*smoothstep(.55,.69,uv.y));
            } else if(kind<1.5){
                arrival=mix(arrival,max(arrival,.27+max(.66-uv.x,0.)*.85),1.-smoothstep(.56,.72,uv.x));
            } else if(kind<2.5){
                arrival=mix(arrival,max(arrival,.64+max(uv.y-.73,0.)*.45),smoothstep(.64,.83,uv.y));
                arrival=mix(arrival,max(arrival,.36+max(uv.x-.4,0.)*.6),smoothstep(.3,.5,uv.x));
            } else if(kind<3.5){
                arrival=mix(arrival,max(arrival,.34+max(uv.y-.48,0.)*.85),smoothstep(.39,.57,uv.y));
            } else {
                arrival=mix(arrival,max(arrival,.7+max(uv.y-.79,0.)*.45),smoothstep(.69,.88,uv.y)*smoothstep(.38,.57,uv.x));
                arrival=mix(arrival,max(arrival,.32+d*.35),1.-smoothstep(.48,.65,uv.y));
            }
            arrival=clamp(arrival,.04,.9);
            float reveal=smoothstep(arrival-.075,arrival+.075,progress);
            reveal*=smoothstep(0.,.055,progress);
            gl_FragColor=vec4(mix(clean,harm,reveal),1.);
        }`;
    const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
    function load(src) {
        const image = new Image();
        image.src = src;
        return image.decode().then(() => image);
    }
    async function create(kind, layer, original) {
        const scene = window.pollutionScenes[kind];
        if (!scene) throw new Error('Unknown habitat');
        const damage = await load(scene.damage);
        let canvas = document.createElement('canvas');
        canvas.className = 'habitat-view__loss';
        canvas.setAttribute('aria-hidden', 'true');
        let gl = canvas.getContext('webgl', { alpha: false, antialias: false });
        let program, buffer, textures = [], uniforms;
        function freeGL() {
            if (!gl) return;
            textures.forEach(t => gl.deleteTexture(t));
            if (buffer) gl.deleteBuffer(buffer);
            if (program) gl.deleteProgram(program);
        }
        if (gl) {
            try {
                program = gl.createProgram();
                for (const [type, text] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
                    const shader = gl.createShader(type);
                    gl.shaderSource(shader, text); gl.compileShader(shader);
                    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                        const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message);
                    }
                    gl.attachShader(program, shader); gl.deleteShader(shader);
                }
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
                gl.useProgram(program);
                buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
                const a = gl.getAttribLocation(program, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
                uniforms = Object.fromEntries(['original','damaged','layer','source','spread','fit','progress','kind'].map(n=>[n,gl.getUniformLocation(program,n)]));
                [original, damage].forEach((image, unit) => {
                    gl.activeTexture(gl.TEXTURE0 + unit);
                    const texture = gl.createTexture(); textures.push(texture); gl.bindTexture(gl.TEXTURE_2D, texture);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
                });
                gl.uniform1i(uniforms.original,0); gl.uniform1i(uniforms.damaged,1);
                gl.uniform2fv(uniforms.source,scene.source); gl.uniform2fv(uniforms.spread,scene.spread);
                gl.uniform1f(uniforms.kind,['forest','ocean','freshwater','island','grassland'].indexOf(kind));
            } catch (error) {
                freeGL(); gl = null;
                canvas = document.createElement('canvas'); canvas.className = 'habitat-view__loss'; canvas.setAttribute('aria-hidden','true');
            }
        }
        // Canvas fallback still lets every visitor explore the two photographic states.
        const ctx = gl ? null : canvas.getContext('2d');
        if (!gl && !ctx) throw new Error('Image rendering is unavailable');
        layer.appendChild(canvas);
        let bounds = null, progress = 0, stopped = false;
        function draw() {
            if (!bounds || stopped) return;
            canvas.classList.toggle('is-on', progress > 0);
            if (progress === 0) return;
            if (gl) { gl.uniform1f(uniforms.progress, progress); gl.drawArrays(gl.TRIANGLE_STRIP,0,4); }
            else {
                const [left,top,w,h,lw,lh] = bounds;
                ctx.setTransform(canvas.width/lw,0,0,canvas.height/lh,0,0);
                ctx.globalAlpha = 1; ctx.clearRect(0,0,lw,lh); ctx.drawImage(original,left,top,w,h);
                ctx.globalAlpha = progress; ctx.drawImage(damage,left,top,w,h); ctx.globalAlpha = 1;
            }
        }
        return {
            fit(left,top,w,h,lw,lh,scale=1) {
                bounds=[left,top,w,h,lw,lh];
                const density=Math.min((devicePixelRatio||1)*scale,1920/lw,1920/lh);
                canvas.width=Math.max(1,Math.round(lw*density)); canvas.height=Math.max(1,Math.round(lh*density));
                if(gl){gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(uniforms.layer,lw,lh);gl.uniform4f(uniforms.fit,left,top,w,h);}
                draw();
            },
            set(value){stopped=false;progress=clamp(value);draw();},
            stop(){stopped=true;},
            destroy(){stopped=true;freeGL();canvas.remove();}
        };
    }
    // Manual exploration is always available. Animation starts only after an explicit play action.
    function playback(update, change) {
        let value=0, frame=0, previous=0;
        const pause=()=>{cancelAnimationFrame(frame);frame=0;previous=0;change(false);};
        function tick(now){
            if(document.hidden){pause();return;}
            if(previous)value=clamp(value+Math.min(now-previous,80)/18000);
            previous=now;update(value);
            if(value>=1){pause();return;}
            frame=requestAnimationFrame(tick);
        }
        const visibility=()=>{if(document.hidden)pause();};
        document.addEventListener('visibilitychange',visibility);
        return {
            set(next){pause();value=clamp(next);update(value);},
            toggle(){if(frame){pause();return;}if(value>=1)value=0;change(true);frame=requestAnimationFrame(tick);},
            pause,
            destroy(){pause();document.removeEventListener('visibilitychange',visibility);}
        };
    }
    window.habitatLoss = { create, has: kind => !!window.pollutionScenes[kind], playback, load };
})();
