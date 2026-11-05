(() => {
    const section = document.getElementById('habitats');
    const canvas = document.getElementById('ocean-canvas');
    const depthLabel = document.getElementById('ocean-depth');

    if (!section || !canvas) return;

    const gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        powerPreference: 'high-performance'
    });

    if (!gl) {
        section.classList.add('ocean-scene--fallback');
        return;
    }

    const vertexSource = `
        attribute vec2 a_position;
        varying vec2 v_uv;

        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;

    const fragmentSource = `
        precision highp float;

        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_progress;
        varying vec2 v_uv;

        float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
                f.y
            );
        }

        float fbm(vec2 p) {
            float value = 0.0;
            float amplitude = 0.5;
            for (int i = 0; i < 5; i++) {
                value += amplitude * noise(p);
                p = p * 2.03 + vec2(4.1, 1.7);
                amplitude *= 0.5;
            }
            return value;
        }

        float waveField(vec2 p, float time) {
            float wave = sin(p.x * 7.0 + time * 0.68) * 0.48;
            wave += sin(p.x * 13.0 - time * 0.91 + p.y * 1.8) * 0.26;
            wave += sin(p.x * 23.0 + time * 0.43) * 0.12;
            wave += (noise(vec2(p.x * 5.0 - time * 0.16, p.y * 3.0)) - 0.5) * 0.44;
            return wave;
        }

        vec3 skyColour(vec2 uv, vec2 p, float horizon) {
            float height = clamp((uv.y - horizon) / max(0.001, 1.0 - horizon), 0.0, 1.0);
            vec3 sunset = vec3(0.96, 0.61, 0.36);
            vec3 blue = vec3(0.32, 0.61, 0.82);
            vec3 zenith = vec3(0.13, 0.35, 0.62);
            vec3 colour = mix(sunset, blue, smoothstep(0.0, 0.42, height));
            colour = mix(colour, zenith, smoothstep(0.46, 1.0, height));

            vec2 sunPosition = vec2(0.33, horizon + 0.12);
            float sunDistance = length((uv - sunPosition) * vec2(u_resolution.x / u_resolution.y, 1.0));
            float sun = 1.0 - smoothstep(0.006, 0.048, sunDistance);
            float halo = exp(-sunDistance * 7.5);
            colour += vec3(1.0, 0.68, 0.30) * halo * 0.65;
            colour += vec3(1.0, 0.91, 0.66) * sun * 1.4;

            float clouds = fbm(vec2(p.x * 1.45 - u_time * 0.012, uv.y * 4.0));
            clouds = smoothstep(0.54, 0.78, clouds + (1.0 - height) * 0.11);
            colour = mix(colour, vec3(1.0, 0.75, 0.62), clouds * 0.33);
            return colour;
        }

        vec3 surfaceColour(vec2 uv, vec2 p, float waterline, float wave) {
            float depth = clamp((waterline - uv.y) / max(waterline, 0.08), 0.0, 1.0);
            float perspective = 1.0 / (0.055 + depth * 1.7);
            vec2 waterUv = vec2(p.x * perspective, depth * 18.0 - u_time * 0.28);
            float ripples = waveField(waterUv * 0.72, u_time) * 0.5 + 0.5;
            ripples += (fbm(waterUv * 0.43 + vec2(u_time * 0.025, 0.0)) - 0.5) * 0.72;

            vec3 nearWater = vec3(0.015, 0.105, 0.17);
            vec3 farWater = vec3(0.09, 0.36, 0.47);
            vec3 colour = mix(farWater, nearWater, smoothstep(0.15, 0.96, depth));
            colour += vec3(0.06, 0.22, 0.27) * ripples * (0.35 + depth * 0.5);

            float highlight = pow(clamp(ripples, 0.0, 1.0), 7.0);
            float sunPath = exp(-abs(p.x - 0.33) * (5.0 + depth * 14.0));
            colour += vec3(1.0, 0.72, 0.35) * highlight * sunPath * (1.0 - depth) * 1.9;
            colour += vec3(0.48, 0.76, 0.83) * highlight * 0.34;
            return colour;
        }

        vec3 underwaterColour(vec2 uv, vec2 p, float wave) {
            float depth = clamp(u_progress * 1.22 + (0.58 - uv.y) * 0.18, 0.0, 1.0);
            vec3 shallow = vec3(0.04, 0.48, 0.57);
            vec3 deep = vec3(0.005, 0.075, 0.13);
            vec3 colour = mix(shallow, deep, smoothstep(0.22, 1.0, depth));

            float surfaceTexture = fbm(vec2(p.x * 2.3 + wave * 0.22, uv.y * 5.2 - u_time * 0.05));
            colour += vec3(0.08, 0.30, 0.31) * surfaceTexture * (1.0 - depth) * 0.52;

            float causticA = sin((p.x * 8.0 + uv.y * 4.0 + u_time * 0.45) + sin(uv.y * 11.0));
            float causticB = sin((p.x * 11.0 - uv.y * 5.0 - u_time * 0.32) + sin(p.x * 6.0));
            float caustics = pow(max(0.0, causticA * causticB), 5.0);
            colour += vec3(0.28, 0.78, 0.72) * caustics * (1.0 - depth) * 0.28;

            float rays = pow(max(0.0, sin(p.x * 5.4 + surfaceTexture * 2.2)), 10.0);
            rays *= (1.0 - smoothstep(0.12, 0.9, depth)) * smoothstep(-0.75, 0.3, p.x);
            colour += vec3(0.34, 0.72, 0.70) * rays * 0.16;

            vec2 particleGrid = vec2(p.x * 28.0, uv.y * 22.0 + u_time * 0.12);
            vec2 particleCell = floor(particleGrid);
            vec2 particlePoint = fract(particleGrid) - 0.5;
            float seed = hash21(particleCell);
            float particleDistance = length(particlePoint - vec2(seed - 0.5, fract(seed * 7.3) - 0.5));
            float particle = 1.0 - smoothstep(0.0, 0.055, particleDistance);
            colour += vec3(0.55, 0.86, 0.79) * particle * step(0.82, seed) * (0.15 + depth * 0.25);
            return colour;
        }

        void main() {
            vec2 uv = v_uv;
            float aspect = u_resolution.x / max(u_resolution.y, 1.0);
            vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

            float dive = smoothstep(0.08, 0.88, u_progress);
            float horizon = mix(0.38, 1.16, dive);
            float wave = waveField(vec2(p.x * 2.4, 0.0), u_time) * mix(0.016, 0.035, dive);
            float waterline = horizon + wave;

            vec3 sky = skyColour(uv, p, min(horizon, 0.84));
            vec3 surface = surfaceColour(uv, p, waterline, wave);
            vec3 underwater = underwaterColour(uv, p, wave);

            float submerged = smoothstep(0.42, 0.68, u_progress);
            vec3 water = mix(surface, underwater, submerged);
            float waterMask = 1.0 - smoothstep(waterline - 0.012, waterline + 0.012, uv.y);
            vec3 colour = mix(sky, water, waterMask);

            float waterlineGlow = exp(-abs(uv.y - waterline) * 105.0) * (1.0 - submerged);
            colour += vec3(0.68, 0.89, 0.88) * waterlineGlow * 0.26;

            float vignette = 1.0 - smoothstep(0.22, 0.98, length(p * vec2(0.72, 0.92)));
            colour *= mix(0.72, 1.0, vignette);
            colour = pow(colour, vec3(0.92));

            gl_FragColor = vec4(colour, 1.0);
        }
    `;

    function createShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) {
        section.classList.add('ocean-scene--fallback');
        return;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        section.classList.add('ocean-scene--fallback');
        return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
    ]), gl.STATIC_DRAW);

    gl.useProgram(program);

    const position = gl.getAttribLocation(program, 'a_position');
    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const time = gl.getUniformLocation(program, 'u_time');
    const progressUniform = gl.getUniformLocation(program, 'u_progress');

    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let oceanActive = false;
    let sectionVisible = false;
    let animationFrame = null;
    let startTime = performance.now();
    let targetProgress = 0;
    let displayedProgress = 0;

    function resize() {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
        const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            gl.viewport(0, 0, width, height);
        }
    }

    function updateProgress() {
        if (!oceanActive) return;

        if (reducedMotion.matches) {
            targetProgress = 0.7;
            return;
        }

        const rect = section.getBoundingClientRect();
        const travel = Math.max(rect.height - window.innerHeight * 0.72, window.innerHeight * 0.6);
        targetProgress = Math.min(1, Math.max(0, (-rect.top + window.innerHeight * 0.16) / travel));
    }

    function updateDepth(progress) {
        if (!depthLabel) return;

        if (progress < 0.38) {
            depthLabel.textContent = 'Surface · 0 m';
        } else {
            const depth = Math.round((progress - 0.38) / 0.62 * 36);
            depthLabel.textContent = `Sunlight zone · ${Math.max(1, depth)} m`;
        }
    }

    function render(now) {
        animationFrame = null;

        if (!oceanActive || !sectionVisible || document.hidden) return;

        resize();
        updateProgress();
        displayedProgress += (targetProgress - displayedProgress) * (reducedMotion.matches ? 1 : 0.055);

        const elapsed = (now - startTime) / 1000;
        gl.useProgram(program);
        gl.uniform2f(resolution, canvas.width, canvas.height);
        gl.uniform1f(time, elapsed * (reducedMotion.matches ? 0.12 : 1));
        gl.uniform1f(progressUniform, displayedProgress);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        updateDepth(displayedProgress);

        animationFrame = requestAnimationFrame(render);
    }

    function requestRender() {
        if (!animationFrame && oceanActive && sectionVisible && !document.hidden) {
            animationFrame = requestAnimationFrame(render);
        }
    }

    const observer = new IntersectionObserver(entries => {
        sectionVisible = entries[0].isIntersecting;
        requestRender();
    }, { rootMargin: '35% 0px 35% 0px' });

    observer.observe(section);

    section.addEventListener('habitatchange', event => {
        oceanActive = event.detail.isOcean;

        if (oceanActive) {
            startTime = performance.now();
            updateProgress();
            displayedProgress = targetProgress;
            requestRender();
        } else if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
    });

    window.addEventListener('resize', () => {
        resize();
        updateProgress();
        requestRender();
    });

    window.addEventListener('scroll', updateProgress, { passive: true });
    document.addEventListener('visibilitychange', requestRender);
    reducedMotion.addEventListener('change', () => {
        updateProgress();
        requestRender();
    });

    resize();
})();
