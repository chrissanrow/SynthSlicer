import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { generateBeatmap } from './beatmap.js';

// ---Game constants/variables---

const HIT_ZONE_Z = -5;
const NOTE_DELTA = 0.2;
const SPAWN_Z = -40;

const FPS = 60; // assumed fps

const NOTE_TRAVEL_DISTANCE = Math.abs(SPAWN_Z) - Math.abs(HIT_ZONE_Z);
const NOTE_TRAVEL_TIME = NOTE_TRAVEL_DISTANCE / (NOTE_DELTA * FPS);
console.log('NOTE_TRAVEL_TIME:', NOTE_TRAVEL_TIME);

// let gameRunning = false;
let beatmapLoaded = false;

let score = 0;

const clock = new THREE.Clock();

// Lane positions and colors (left -> right)
const LANE_POSITIONS = [-3, -1, 1, 3];
const LANE_COLORS = [0x00FFFF, 0xfe019a, 0x000000, 0x703be7];
const TRACK_COLOR = 0x631C99; // dark purple
const BG_COLOR = 0x080e12; // dark grayish blue

// ---Three.js Setup---

const scene = new THREE.Scene();
scene.background = new THREE.Color( BG_COLOR ); 
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );
renderer.shadowMap.enabled = true;


const hitSpheres = [];

const hitSphereGeometry = new THREE.SphereGeometry(0.7, 16, 16);
const hitSPhereMaterial = new THREE.MeshBasicMaterial({
    color: 0x800080,
    transparent: true, 
    opacity: 1.0
})

/* let hitShere = new THREE.Mesh(hitSphereGeometry, hitSPhereMaterial);
hitShere.position.set(0, 2, -5);
scene.add(hitShere); */


camera.position.set(0, 4, 0);
camera.lookAt(0, 2, -10);

// Transformation Matrices

function translationMatrix(tx, ty, tz) {
    return new THREE.Matrix4().set(
        1, 0, 0, tx,
        0, 1, 0, ty,
        0, 0, 1, tz,
        0, 0, 0, 1
    );
}

function rotationMatrixX(theta) {
    return new THREE.Matrix4().set(
        1, 0, 0, 0,
        0, Math.cos(theta), -Math.sin(theta), 0,
        0, Math.sin(theta), Math.cos(theta), 0,
        0, 0, 0, 1
    );
}

function rotationMatrixY(theta) {
    return new THREE.Matrix4().set(
        Math.cos(theta), 0, Math.sin(theta), 0,
        0, 1, 0, 0,
        -Math.sin(theta), 0, Math.cos(theta), 0,
        0, 0, 0, 1
    );
}

function rotationMatrixZ(theta) {
    return new THREE.Matrix4().set(
        Math.cos(theta), -Math.sin(theta), 0, 0,
        Math.sin(theta),  Math.cos(theta), 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    );
}

// Atmospheric Attenuation Material with Phong Shading
function obscuredMaterial(materialProperties) {
    const numLights = 2;
    
    // convert shape_color1 to a Vector4
    let shape_color_representation = new THREE.Color(materialProperties.color);
    let shape_color = new THREE.Vector4(
        shape_color_representation.r,
        shape_color_representation.g,
        shape_color_representation.b,
        1.0
    );

    // Vertex Shader
    let vertexShader = `
        precision mediump float;
        const int N_LIGHTS = ${numLights};
        uniform float ambient, diffusivity, specularity, smoothness;
        uniform vec4 light_positions_or_vectors[N_LIGHTS];
        uniform vec4 light_colors[N_LIGHTS];
        uniform float light_attenuation_factors[N_LIGHTS];
        uniform vec4 shape_color;
        uniform vec3 squared_scale;
        uniform vec3 camera_center;
        varying vec3 N, vertex_worldspace;

        // ***** PHONG SHADING HAPPENS HERE: *****
        vec3 phong_model_lights(vec3 N, vec3 vertex_worldspace) {
            vec3 E = normalize(camera_center - vertex_worldspace); // View direction
            vec3 result = vec3(0.0); // Initialize the output color
            for(int i = 0; i < N_LIGHTS; i++) {
                // Calculate the vector from the surface to the light source
                vec3 surface_to_light_vector = light_positions_or_vectors[i].xyz - 
                    light_positions_or_vectors[i].w * vertex_worldspace;
                float distance_to_light = length(surface_to_light_vector); // Light distance
                vec3 L = normalize(surface_to_light_vector); // Light direction
                
                // Phong uses the reflection vector R
                vec3 R = reflect(-L, N); // Reflect L around the normal N
                
                float diffuse = max(dot(N, L), 0.0); // Diffuse term
                float specular = pow(max(dot(R, E), 0.0), smoothness); // Specular term
                
                // Light attenuation
                float attenuation = 1.0 / (1.0 + light_attenuation_factors[i] * distance_to_light * distance_to_light);
                
                // Calculate the contribution of this light source
                vec3 light_contribution = shape_color.xyz * light_colors[i].xyz * diffusivity * diffuse
                                        + light_colors[i].xyz * specularity * specular;
                result += attenuation * light_contribution;
            }
            return result;
        }

        uniform mat4 model_transform;
        uniform mat4 projection_camera_model_transform;

        void main() {
            gl_Position = projection_camera_model_transform * vec4(position, 1.0);
            N = normalize(mat3(model_transform) * normal / squared_scale);
            vertex_worldspace = (model_transform * vec4(position, 1.0)).xyz;
        }
    `;
    // Fragment Shader
    let fragmentShader = `
        precision mediump float;
        const int N_LIGHTS = ${numLights};
        uniform float ambient, diffusivity, specularity, smoothness;
        uniform vec4 light_positions_or_vectors[N_LIGHTS];
        uniform vec4 light_colors[N_LIGHTS];
        uniform float light_attenuation_factors[N_LIGHTS];
        uniform vec4 shape_color;
        uniform vec3 camera_center;
        varying vec3 N, vertex_worldspace;

        // ***** PHONG SHADING HAPPENS HERE: *****
        vec3 phong_model_lights(vec3 N, vec3 vertex_worldspace) {
            vec3 E = normalize(camera_center - vertex_worldspace); // View direction
            vec3 result = vec3(0.0); // Initialize the output color
            for(int i = 0; i < N_LIGHTS; i++) {
                // Calculate the vector from the surface to the light source
                vec3 surface_to_light_vector = light_positions_or_vectors[i].xyz - 
                    light_positions_or_vectors[i].w * vertex_worldspace;
                float distance_to_light = length(surface_to_light_vector); // Light distance
                vec3 L = normalize(surface_to_light_vector); // Light direction
                
                // Phong uses the reflection vector R
                vec3 R = reflect(-L, N); // Reflect L around the normal N
                
                float diffuse = max(dot(N, L), 0.0); // Diffuse term
                float specular = pow(max(dot(R, E), 0.0), smoothness); // Specular term
                
                // Light attenuation
                float attenuation = 1.0 / (1.0 + light_attenuation_factors[i] * distance_to_light * distance_to_light);
                
                // Calculate the contribution of this light source
                vec3 light_contribution = shape_color.xyz * light_colors[i].xyz * diffusivity * diffuse
                                        + light_colors[i].xyz * specularity * specular;
                result += attenuation * light_contribution;
            }
            return result;
        }

        uniform vec4 fog_color;
        uniform float zf;
        uniform float zb;
        uniform float sf;
        uniform float sb;

        void main() {
            // Compute an initial (ambient) color:
            vec4 color = vec4(shape_color.xyz * ambient, shape_color.w);
            // Compute the final color with contributions from lights:
            color.xyz += phong_model_lights(normalize(N), vertex_worldspace);

            float dist = length(camera_center - vertex_worldspace);
            float s0 =  clamp(sf + (sb - sf)/(zb - zf)*(dist - zf), 0.0, 1.0);
            vec4 obscured_color = s0 * color + (1.0 - s0) * fog_color;
            gl_FragColor = obscured_color;
        }
    `;
    // Prepare uniforms
    const uniforms = {
        ambient: { value: materialProperties.ambient },
        diffusivity: { value: materialProperties.diffusivity },
        specularity: { value: materialProperties.specularity },
        smoothness: { value: materialProperties.smoothness },
        shape_color: { value: shape_color },
        squared_scale: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
        camera_center: { value: new THREE.Vector3() },
        model_transform: { value: new THREE.Matrix4() },
        projection_camera_model_transform: { value: new THREE.Matrix4() },
        light_positions_or_vectors: { value: [] },
        light_colors: { value: [] },
        light_attenuation_factors: { value: [] },
        fog_color: { value: new THREE.Vector4(0.2, 0.8, 0.8, 1.0) },
        zf: { value: materialProperties.zf || 5.0 },
        zb: { value: materialProperties.zb || 35.0 },
        sf: { value: materialProperties.sf || 1.0 },
        sb: { value: materialProperties.sb || 0.0 }
    };

    // Create the ShaderMaterial using the custom vertex and fragment shaders
    return new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: uniforms
    });
}

function updateObscuredUniforms(obj) {
    const material = obj.material;
    const uniforms = material.uniforms;
    const numLights = 2;
    const lights = scene.children.filter(child => child.isLight).slice(0, numLights);
    // Ensure we have the correct number of lights
    if (lights.length < numLights) {
        console.warn(`Expected ${numLights} lights, but found ${lights.length}. Padding with default lights.`);
    }

    // Update model_transform and projection_camera_model_transform
    obj.updateMatrixWorld();
    camera.updateMatrixWorld();

    uniforms.model_transform.value.copy(obj.matrixWorld);
    uniforms.projection_camera_model_transform.value.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
    ).multiply(obj.matrixWorld);

    // Update camera_center
    uniforms.camera_center.value.setFromMatrixPosition(camera.matrixWorld);

    // Update squared_scale (in case the scale changes)
    const scale = obj.scale;
    uniforms.squared_scale.value.set(
        scale.x * scale.x,
        scale.y * scale.y,
        scale.z * scale.z
    );

    // Update light uniforms
    uniforms.light_positions_or_vectors.value = [];
    uniforms.light_colors.value = [];
    uniforms.light_attenuation_factors.value = [];

    for (let i = 0; i < numLights; i++) {
        const light = lights[i];
        if (light) {
            let position = new THREE.Vector4();
            if (light.isDirectionalLight) {
                // For directional lights
                const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(light.quaternion);
                position.set(direction.x, direction.y, direction.z, 0.0);
            } else if (light.position) {
                // For point lights
                position.set(light.position.x, light.position.y, light.position.z, 1.0);
            } else {
                // Default position
                position.set(0.0, 0.0, 0.0, 1.0);
            }
            uniforms.light_positions_or_vectors.value.push(position);

            // Update light color
            const color = new THREE.Vector4(light.color.r, light.color.g, light.color.b, 1.0);
            uniforms.light_colors.value.push(color);

            // Update attenuation factor
            let attenuation = 0.0;
            if (light.isPointLight || light.isSpotLight) {
                const distance = light.distance || 1000.0; // Default large distance
                attenuation = 1.0 / (distance * distance);
            } else if (light.isDirectionalLight) {
                attenuation = 0.0; // No attenuation for directional lights
            }
            // Include light intensity
            const intensity = light.intensity !== undefined ? light.intensity : 1.0;
            attenuation *= intensity;

            uniforms.light_attenuation_factors.value.push(attenuation);
        } else {
            // Default light values
            uniforms.light_positions_or_vectors.value.push(new THREE.Vector4(0.0, 0.0, 0.0, 0.0));
            uniforms.light_colors.value.push(new THREE.Vector4(0.0, 0.0, 0.0, 1.0));
            uniforms.light_attenuation_factors.value.push(0.0);
        }
    }
}

// ---Lighting/Environment---

const directionalLight = new THREE.DirectionalLight( 0xffffff, 0.5 );
directionalLight.position.set( 0, 10, 5 ); 
directionalLight.castShadow = true; 
scene.add( directionalLight );

// ---Ambient Light---
scene.add( new THREE.AmbientLight( 0x404040, 1.5 ) );

const trackGeometry = new THREE.PlaneGeometry( 50, 500 );
const trackMaterialProperties = {
    color: TRACK_COLOR || 0x631C99,
    ambient: 1.0,
    diffusivity: 0.2,
    specularity: 0.2,
    smoothness: 10.0,
    zb: 30.0,
    zf: 10.0,
    sf: 1.0,
    sb: 0.0
};
const trackMaterial = obscuredMaterial(trackMaterialProperties);
const track = new THREE.Mesh( trackGeometry, trackMaterial );
track.receiveShadow = true;
track.rotation.x = -Math.PI / 2;
track.position.y = 0;
track.position.z = -200;
scene.add( track );

// --- SHADOWS SETUP (Planar Projection) --- Mashab
const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x220a57,
    transparent: true,
    opacity: 0.6
});

const shadowMatrix = new THREE.Matrix4();

const Lx = 0;
const Ly = 10;
const Lz = 5;
const floorHeight = 0.01;

//M = [1, -Lx/Ly, 0, 0,  0, 0, 0, floor,  0, -Lz/Ly, 1, 0,  0, 0, 0, 1]
shadowMatrix.set(
    1, -Lx / Ly, 0, 0,
    0,  0,       0, floorHeight,
    0, -Lz / Ly, 1, 0,
    0,  0,       0, 1
);

//----Mashaend

// ---Hit Zones---

// Triangle geometry for zone direction indicators
const triangleGeometry = new THREE.BufferGeometry();
const vertices = new Float32Array( [
    0.0,  0.5, 0.0,
    -0.5, -0.5, 0.0,
    0.5, -0.5, 0.0
] );
triangleGeometry.setAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
// const triangleMaterial = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } );

const HIT_ZONES = {
    'Left': { box: new THREE.Box3(new THREE.Vector3(-4, 0, HIT_ZONE_Z - 1), new THREE.Vector3(-2, 2, HIT_ZONE_Z + 1)), triangleRotation: Math.PI / 2 },
    'Down': { box: new THREE.Box3(new THREE.Vector3(-2, 0, HIT_ZONE_Z - 1), new THREE.Vector3(0, 2, HIT_ZONE_Z + 1)), triangleRotation: Math.PI },
    'Up':   { box: new THREE.Box3(new THREE.Vector3(0, 0, HIT_ZONE_Z - 1), new THREE.Vector3(2, 2, HIT_ZONE_Z + 1)), triangleRotation: 0 },
    'Right':{ box: new THREE.Box3(new THREE.Vector3(2, 0, HIT_ZONE_Z - 1), new THREE.Vector3(4, 2, HIT_ZONE_Z + 1)), triangleRotation: -Math.PI / 2 },
};

for(let key in HIT_ZONES) {
    const zone = HIT_ZONES[key];
    const center = zone.box.getCenter(new THREE.Vector3());
    const size = zone.box.getSize(new THREE.Vector3());
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    // Map hit zone keys to lane indices (Left, Down, Up, Right)
    const zoneToLaneIndex = { 'Left': 0, 'Down': 1, 'Up': 2, 'Right': 3 };
    const laneIndex = zoneToLaneIndex[key] !== undefined ? zoneToLaneIndex[key] : 0;
    const laneColor = LANE_COLORS[laneIndex] || 0xffffff;
    const material = new THREE.MeshBasicMaterial( { color: laneColor, transparent: true, opacity: 0.25, wireframe: true } );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(center);
    mesh.translateY(1);
    scene.add(mesh);

    const triangleMaterial = new THREE.MeshBasicMaterial({ color: laneColor, side: THREE.DoubleSide });
    const triangle = new THREE.Mesh(triangleGeometry, triangleMaterial);
    triangle.position.set(center.x, center.y + 3, center.z);
    triangle.rotation.z = zone.triangleRotation;
    triangle.scale.set(0.8, 0.8, 0.8);
    scene.add(triangle);
}

// ---Notes---

const noteGeometry = new THREE.BoxGeometry(1.5, 1.5, 0.5);

const noteMaterialProperties = {
    color: 0xffffff,
    ambient: 0.8,
    diffusivity: 0.7,
    specularity: 0.5,
    smoothness: 20.0
};

// const noteMaterial = obscuredMaterial(noteMaterialProperties);
let activeNotes = [];

function createNote(laneIndex) {

    const positionY = 2;
    const positionZ = -40;

    const laneColor = LANE_COLORS[laneIndex] || noteMaterialProperties.color;
    const props = Object.assign({}, noteMaterialProperties, { color: laneColor });
    const material = obscuredMaterial(props);

    const note = new THREE.Mesh(noteGeometry, material);
    note.position.set(LANE_POSITIONS[laneIndex], positionY, positionZ);
    note.castShadow = true;
    scene.add(note);
    activeNotes.push(note);

    const shadow = new THREE.Mesh(noteGeometry, shadowMaterial);
    shadow.matrixAutoUpdate = false; 
    scene.add(shadow);
    
    note.userData.shadow = shadow;

    return note;
}

// score text
// const loader = new FontLoader();
// loader.load(
//     'fonts/Trench_Thin.json',
//     function (font) {
//         console.log('FONT LOADED');
//         // Make the debug text much smaller and centered so it's easy to spot.
//         const geometry = new TextGeometry('SCORE:', {
//             font: font,
//             size: 1,
//             depth: 0.1,
//             height: 1,
//             curveSegments: 5,
//             bevelEnabled: false
//         });

//         // Center geometry so origin is in the middle of the text
//         if (geometry.center) geometry.center();
//         geometry.computeBoundingBox && geometry.computeBoundingBox();

//         // Use a basic material (ignores lighting) and double-sided so we can always see it while debugging
//         const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
//         const textMesh = new THREE.Mesh(geometry, material);
//         // place text in front of the camera
//         textMesh.position.set(0, 0, -4);
//         textMesh.rotateX(-Math.PI / 2);
//         scene.add(textMesh);
//     },
//     undefined,
//     function (err) {
//         console.error('FONT LOAD ERROR:', err);
//     }
// );

// 1. Create HTML canvas
const canvas = document.createElement('canvas');
canvas.width = 256;
canvas.height = 128;
const ctx = canvas.getContext('2d');
await document.fonts.load('48px Trench');
ctx.font = '48px Trench';
ctx.fillStyle = 'white';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.shadowColor = 'black';
ctx.shadowOffsetX = 2;
ctx.shadowOffsetY = 2;
ctx.shadowBlur = 4;
const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
gradient.addColorStop(0, 'blue');
gradient.addColorStop(1, '#fe0151ff');
ctx.fillStyle = gradient;

// initial text
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.fillText('Score: 0', canvas.width/2, canvas.height/2);

// make texture and sprite
const texture = new THREE.CanvasTexture(canvas);
const material = new THREE.SpriteMaterial({ map: texture });
const scoreSprite = new THREE.Sprite(material);
scoreSprite.scale.set(4, 2, 1);
scoreSprite.position.set(0, 5, -4);
scene.add(scoreSprite);

// dynamically update text
function updateScore() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillText('Score: ' + score, canvas.width/2, canvas.height/2);
    texture.needsUpdate = true; 
}

//Mashab
// --- FEEDBACK TEXT SETUP (Perfect/Good/Miss) ---
const feedbackCanvas = document.createElement('canvas');
feedbackCanvas.width = 512; 
feedbackCanvas.height = 128;
const fbCtx = feedbackCanvas.getContext('2d');

const fbTexture = new THREE.CanvasTexture(feedbackCanvas);
const fbMaterial = new THREE.SpriteMaterial({ map: fbTexture, transparent: true, opacity: 0 }); 
const feedbackSprite = new THREE.Sprite(fbMaterial);
feedbackSprite.scale.set(6, 1.5, 1);
feedbackSprite.position.set(0, 4, -4); 
scene.add(feedbackSprite);

let feedbackTimer = null; 

function showFeedback(text, colorHex, position) {
    // Optionally move the feedback sprite to a world-space `position` (THREE.Vector3)
    if (position && position.isVector3) {
        feedbackSprite.position.copy(position);
    }
    fbCtx.clearRect(0, 0, feedbackCanvas.width, feedbackCanvas.height);
    fbCtx.font = 'bold 36px Trench, sans-serif'; 
    fbCtx.textAlign = 'center';
    fbCtx.textBaseline = 'middle';
    
    fbCtx.shadowColor = 'rgba(0,0,0,0.8)';
    fbCtx.shadowBlur = 4;
    fbCtx.shadowOffsetX = 3;
    fbCtx.shadowOffsetY = 3;

    fbCtx.fillStyle = colorHex;
    fbCtx.fillText(text, feedbackCanvas.width / 2, feedbackCanvas.height / 2);
    
    fbTexture.needsUpdate = true;

    feedbackSprite.material.opacity = 1;
    
    // Сбрасываем старый таймер и ставим новый, чтобы текст исчез через 1 сек
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
        feedbackSprite.material.opacity = 0;
    }, 1000);
}

//Mashaend

// ---Controls---

function onKeyDown(event) {
    const key = event.key;
    switch(key) 
    {
        case 'ArrowLeft':
        case 'ArrowDown':
        case 'ArrowUp':
        case 'ArrowRight':
        case 'd':
        case 'f':
        case 'j':
        case 'k':
            checkHit(key);
            break;
        /*
        case 'Enter':
            gameRunning = true;
            startMusic();
            break;
        */
        case 'Escape':
            // unpause game if paused
            if (pauseMenu.style.display === "flex")
                unpauseGame();
            // pause game if running
            else if (!audio.paused)
                pauseGame();
    }
}


function checkHit(key) {
    let zone;
    switch(key) {
        case 'ArrowLeft':
        case 'd':  
            zone = HIT_ZONES['Left'];
            break;
        case 'ArrowDown':
        case 'f':
            zone = HIT_ZONES['Down'];
            break;
        case 'ArrowUp':
        case 'j':
            zone = HIT_ZONES['Up'];
            break;
        case 'ArrowRight':
        case 'k':
            zone = HIT_ZONES['Right'];
            break;
        case 'ArrowLeft':  zone = HIT_ZONES['Left'];  break;
        case 'ArrowDown':  zone = HIT_ZONES['Down'];  break;
        case 'ArrowUp':    zone = HIT_ZONES['Up'];    break;
        case 'ArrowRight': zone = HIT_ZONES['Right']; break;
    }

    let hitFound = false; 
    let hitColor = 0x800080; // Default Purple
    let hitText = "";
    let textColor = "";
    let points = 0;

    for(let i = activeNotes.length - 1; i >= 0; i--) {
        const note = activeNotes[i];
        const noteBox = new THREE.Box3().setFromObject(note);
        
        if(zone.box.intersectsBox(noteBox)) {
            hitFound = true;
            
            // --- РАСЧЕТ ТОЧНОСТИ ---
            // Считаем разницу между позицией ноты и идеальным центром (-5)
            const diff = Math.abs(note.position.z - HIT_ZONE_Z);

            if (diff < 0.4) { 
                hitColor = 0xFF00FF;
                hitText = "PERFECT!";
                textColor = "#ff00b7ff";
                points = 50;
            } else if (diff < 0.9) {
                hitColor = 0x00FF00; 
                hitText = "GOOD";
                textColor = "#00FF00";
                points = 20;
            } else {
                hitColor = 0x800080;
                hitText = "OKAY";
                textColor = "#8400ffff";
                points = 10;
            }

            const hitSphere = new THREE.Mesh(hitSphereGeometry, hitSPhereMaterial.clone());
            hitSphere.material.color.setHex(hitColor);
            hitSphere.position.copy(note.position);
            scene.add(hitSphere);
            hitSpheres.push(hitSphere);

            if (note.userData.shadow) {
                scene.remove(note.userData.shadow);
                note.userData.shadow = null;
            }

            scene.remove(note);
            activeNotes.splice(i, 1);
            score += points;
            updateScore();
            
            break; 
        }
    }

    if (!hitFound) {
        hitText = "MISS";
        textColor = "#FF0000";
    }

    // position feedback above the hit zone
    const zoneCenter = zone.box.getCenter(new THREE.Vector3());
    const feedbackPos = new THREE.Vector3(zoneCenter.x, zoneCenter.y + 2.0, zoneCenter.z);
    showFeedback(hitText, textColor, feedbackPos);
}

document.addEventListener('keydown', onKeyDown, false);

// --- MUSIC / BEATMAP LOGIC ---

const audio = new Audio();

function startMusic() {
    audio.play();
    // console.log('Music started');
}
function pauseMusic() {
    audio.pause();
}

let beatmap = [];
let beatIndex = 0;

async function loadGame(audio) {
    // reset game state
    score = 0;
    updateScore();
    beatIndex = 0;
    isPaused = false;
    time = 0;
    clock.getDelta();
    activeNotes.forEach(note => { scene.remove(note); scene.remove(note.userData.shadow); });
    activeNotes = [];
    // Ensure materials that expect updated uniforms have them before a manual render
    try {
        updateObscuredUniforms(track);
        renderer.render(scene, camera);
    } catch (err) {
        console.warn('Render error during loadGame:', err);
    }

    beatmap = await generateBeatmap(audio);
    beatmapLoaded = true;
    setTimeout((startMusic), beatmap[0].time + NOTE_TRAVEL_TIME * 1000); // Adjust for initial delay
    console.log('Generated Beatmap:', beatmap);
}

// ---- event listeners for menu controls and buttons ----

const startMenu = document.getElementById("start-menu");
const pauseMenu = document.getElementById("game-paused-menu");
const gameOverMenu = document.getElementById("game-over-menu");

document.querySelectorAll(".level-button").forEach(btn => {
  btn.addEventListener("click", async () => {

    let audioURL = `audio/${btn.dataset.audio}.mp3`;

    // Play audio first to unlock audio context
    audio.src = audioURL;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;

    loadGame(audioURL); 

    // Hide overlay
   startMenu.style.display = "none";
  });
});

// Handle user-uploaded custom audio file
const customAudioInput = document.getElementById('custom-audio-input');
if (customAudioInput) {
    customAudioInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        // Create an object URL so the <audio> element can play the file
        const objectUrl = URL.createObjectURL(file);
        audio.src = objectUrl;

        // Try to unlock audio playback with a user gesture
        try {
            await audio.play();
            audio.pause();
            audio.currentTime = 0;
        } catch (err) {
            console.warn('Could not auto-play uploaded audio to unlock audio context:', err);
        }

        // Pass the File object to the beatmap generator
        loadGame(file);

        // Hide the start menu
        startMenu.style.display = 'none';
    });
}

audio.addEventListener('ended', () => {
    let perfectScore = beatmap.length * 50;
    document.getElementById("final-score-span").innerHTML = score + ' / ' + perfectScore;
    document.getElementById("final-rank-span").innerHTML = 
        score >= perfectScore * 0.9 ? 'S' :
        score >= perfectScore * 0.75 ? 'A' :
        score >= perfectScore * 0.5 ? 'B' :
        score >= perfectScore * 0.25 ? 'C' : 'D';
    document.getElementById("game-over-menu").style.display = "flex";
});

document.getElementById("play-again-button").addEventListener("click", () => {    
    loadGame(audio.src);
    gameOverMenu.style.display = "none";
});

document.querySelectorAll(".go-to-start-menu-button").forEach(button => {
    button.addEventListener("click", () => {
        gameOverMenu.style.display = "none";
        pauseMenu.style.display = "none";
        startMenu.style.display = "flex";
    });
});

document.getElementById("return-to-game-button").addEventListener("click", () => {    
    unpauseGame();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && !isPaused) {
        pauseGame();
    }
});

// play/pause logic

let isPaused = false;
let time = 0;

function pauseGame() {
    // console.log('paused time: ', time);
    isPaused = true;
    clock.getDelta(); // to avoid large delta on unpause
    pauseMusic();
    document.getElementById("current-score-span").innerHTML = score;
    pauseMenu.style.display = "flex";
}

function unpauseGame() {
    // console.log('unpaused time: ', time);
    isPaused = false;
    clock.getDelta(); // to avoid large delta on unpause
    pauseMenu.style.display = "none";
    audio.play();
}

function animate() {

    if(!beatmapLoaded || isPaused) return;

    const delta = isPaused ? 0 : clock.getDelta(); 
    if (!isPaused) time += delta;

    // Spawn notes based on beatmap timing
    if (beatIndex < beatmap.length) {
        while(beatIndex < beatmap.length && time >= beatmap[beatIndex].time) {
            // const lanePositions = [-3, -1, 1, 3];
            const lane = beatmap[beatIndex].lane;
            // createNote(LANE_POSITIONS[lane], 2, -40);
            createNote(lane);
            beatIndex++;
        }
    }

    updateObscuredUniforms(track);

    // Move active notes and update their uniforms, shadows Mashab
    for(let i = activeNotes.length - 1; i >= 0; i--) {
        const note = activeNotes[i];
        note.position.z += NOTE_DELTA;

        updateObscuredUniforms(note);
        
        // 3. ОБНОВЛЯЕМ ТЕНЬ
        const shadow = note.userData.shadow;
        if (shadow) {
            // Сначала берем позицию и поворот самой ноты
            note.updateMatrix();
            // Умножаем матрицу проекции на мировую матрицу ноты
            // shadowMatrix * noteMatrix
            shadow.matrix.copy(shadowMatrix).multiply(note.matrix);
        }

        // 4. Удаление, если улетела за экран
        if(note.position.z > -2.5) {
            // Удаляем и ноту, и тень
            if (note.userData.shadow) {
                scene.remove(note.userData.shadow);
                note.userData.shadow = null;
            }
            scene.remove(note);
            activeNotes.splice(i, 1);
        }
    }
    //Mashaend

    for(let j = hitSpheres.length - 1; j >= 0; j--)
    {
        const hitShere = hitSpheres[j];

        hitShere.material.opacity -= 0.04;
        hitShere.scale.x *= 1.08; 
        hitShere.scale.y *= 1.08; 

        if (hitShere.material.opacity <= 0)
        {
            scene.remove(hitShere);
            hitSpheres.splice(j, 1);
        }
    }

    renderer.render( scene, camera );

}