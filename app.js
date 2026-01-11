import * as THREE from 'three';
import { GUI } from 'lil-gui';
import { Hands } from "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js";

// --- State Variables ---
let scene, camera, renderer, material, audioData = 0, pinchValue = 0;
let rtA, rtB, feedbackScene, feedbackMaterial;
let handX = 0.5, handY = 0.5;

const params = {
    trailDensity: 0.9,
    complexity: 8,
    audioSensitivity: 2,
    zoom: 3.5
};

// --- Shader Definitions ---
const fractalFS = `
    uniform float uTime; uniform float uAudio; uniform vec2 uHandPos;
    uniform float uPinch; uniform vec2 uRes; uniform float uComplexity; uniform float uZoom;
    float map(vec3 p) {
        p.xz *= mat2(cos(uTime*0.2), sin(uTime*0.2), -sin(uTime*0.2), cos(uTime*0.2));
        float scale = 1.1 + (uAudio * 0.4);
        for(int i = 0; i < 10; i++) {
            if(float(i) > uComplexity) break;
            p = abs(p) - vec3(uHandPos.x * 1.5, uHandPos.y * 1.5, 1.0);
            float r2 = dot(p, p);
            p *= clamp(max(0.8/r2, 0.8), 0.0, 2.2) * scale;
        }
        return length(p) * pow(scale, -8.0);
    }
    void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * uRes.xy) / uRes.y;
        vec3 ro = vec3(0, 0, -uZoom); vec3 rd = normalize(vec3(uv, 1.0));
        float d, t = 0.0;
        for(int i = 0; i < 64; i++) {
            d = map(ro + rd * t);
            if(d < 0.001 || t > 10.0) break;
            t += d;
        }
        vec3 baseCol = mix(vec3(0.2, 0.4, 0.9), vec3(1.0, 0.2, 0.1), uPinch);
        vec3 col = (t < 10.0) ? (baseCol * (1.0 - t/10.0) + 0.05/d * baseCol) : vec3(0.01);
        gl_FragColor = vec4(col, 1.0);
    }
`;

// --- Core Functions ---
async function initHands() {
    const video = document.getElementById('webcam');
    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5 });
    hands.onResults(res => {
        if(res.multiHandLandmarks?.length) {
            const h = res.multiHandLandmarks[0];
            handX = h[8].x; handY = h[8].y;
            const d = Math.hypot(h[8].x - h[4].x, h[8].y - h[4].y);
            pinchValue = THREE.MathUtils.lerp(pinchValue, 1.0 - Math.min(Math.max((d - 0.05)/0.15, 0), 1), 0.2);
        }
    });

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    const detect = async () => { await hands.send({image: video}); requestAnimationFrame(detect); };
    detect();
}

function initThree() {
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    material = new THREE.ShaderMaterial({
        uniforms: { 
            uTime: {value:0}, uAudio: {value:0}, uHandPos: {value: new THREE.Vector2()}, 
            uPinch: {value:0}, uRes: {value: new THREE.Vector2(window.innerWidth, window.innerHeight)}, 
            uComplexity: {value:8}, uZoom: {value:3.5} 
        },
        fragmentShader: fractalFS,
        vertexShader: `void main() { gl_Position = vec4(position, 1.0); }`
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
}

function animate(time) {
    material.uniforms.uTime.value = time * 0.001;
    material.uniforms.uHandPos.value.set(handX, handY);
    material.uniforms.uPinch.value = pinchValue;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

// --- The Trigger ---
document.getElementById('start-btn').onclick = async (e) => {
    try {
        initThree();
        await initHands();
        animate();
        e.target.remove();
    } catch (err) {
        alert("Startup Failed: " + err.message);
        e.target.style.background = "red";
    }
};
