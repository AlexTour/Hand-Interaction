import * as THREE from 'three';
import { GUI } from 'lil-gui';

// Note: We do NOT import { Hands } here anymore. 
// It is already available globally as 'window.Hands'

let scene, camera, renderer, material, audioData = 0, pinchValue = 0;
let handX = 0.5, handY = 0.5;

// --- Fragment Shader (Raymarching) ---
const fractalFS = `
    uniform float uTime;
    uniform float uAudio;
    uniform vec2 uHandPos;
    uniform float uPinch;
    uniform vec2 uRes;

    float map(vec3 p) {
        p.xz *= mat2(cos(uTime*0.3), sin(uTime*0.3), -sin(uTime*0.3), cos(uTime*0.3));
        float scale = 1.1 + (uAudio * 0.5);
        for(int i = 0; i < 8; i++) {
            p = abs(p) - vec3(uHandPos.x * 1.2, uHandPos.y * 1.2, 1.0);
            float r2 = dot(p, p);
            p *= clamp(max(0.8/r2, 0.8), 0.0, 2.2) * scale;
        }
        return length(p) * pow(scale, -8.0);
    }

    void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * uRes.xy) / uRes.y;
        vec3 ro = vec3(0, 0, -3.5);
        vec3 rd = normalize(vec3(uv, 1.0));
        float d, t = 0.0;
        for(int i = 0; i < 64; i++) {
            d = map(ro + rd * t);
            if(d < 0.001 || t > 10.0) break;
            t += d;
        }
        vec3 baseCol = mix(vec3(0.1, 0.5, 1.0), vec3(1.0, 0.2, 0.1), uPinch);
        vec3 col = (t < 10.0) ? (baseCol * (1.0 - t/10.0) + 0.05/d * baseCol) : vec3(0.02);
        gl_FragColor = vec4(col, 1.0);
    }
`;

async function initHands() {
    const video = document.getElementById('webcam');
    
    // Use the global window.Hands object
    const hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults((results) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const h = results.multiHandLandmarks[0];
            handX = h[8].x;
            handY = h[8].y;
            const dist = Math.sqrt(Math.pow(h[8].x - h[4].x, 2) + Math.pow(h[8].y - h[4].y, 2));
            pinchValue = THREE.MathUtils.lerp(pinchValue, 1.0 - Math.min(Math.max((dist - 0.05)/0.15, 0), 1), 0.2);
        }
    });

    // Start Camera
    const cameraFeed = new window.Camera(video, {
        onFrame: async () => { await hands.send({image: video}); },
        width: 640, height: 480
    });
    cameraFeed.start();
}

function initThree() {
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uAudio: { value: 0 },
            uHandPos: { value: new THREE.Vector2(0.5, 0.5) },
            uPinch: { value: 0 },
            uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        },
        vertexShader: `void main() { gl_Position = vec4(position, 1.0); }`,
        fragmentShader: fractalFS
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
}

function animate(time) {
    material.uniforms.uTime.value = time * 0.001;
    material.uniforms.uHandPos.value.set(handX, handY);
    material.uniforms.uPinch.value = pinchValue;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

document.getElementById('start-btn').onclick = async (e) => {
    try {
        initThree();
        await initHands();
        animate();
        e.target.remove();
    } catch (err) {
        console.error(err);
        alert("Startup Error: " + err.message);
    }
};

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    material.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
});
