import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

// ---Game constants/variables---

const HIT_ZONE_Z = -5;
const NOTE_SPEED = 0.2;

let score = 0;

const clock = new THREE.Clock();

// ---Three.js Setup---

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0.5, 0.5, 0.5 ); // Sky blue background
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

camera.position.set(0, 2, 0);
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
        fog_color: { value: new THREE.Vector4(0.5, 0.5, 0.5, 1.0) },
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
    color: 0x808080,
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
track.rotation.x = -Math.PI / 2;
track.position.y = 0;
track.position.z = -200;
scene.add( track );

// ---Hit Zones---

// Triangle geometry for zone direction indicators
const triangleGeometry = new THREE.BufferGeometry();
const vertices = new Float32Array( [
    0.0,  0.5, 0.0,
    -0.5, -0.5, 0.0,
    0.5, -0.5, 0.0
] );
triangleGeometry.setAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
const triangleMaterial = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } );

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
    const material = new THREE.MeshBasicMaterial( { color: 0xffffff, transparent: true, opacity: 0.25, wireframe: true } );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(center);
    mesh.translateY(1);
    scene.add(mesh);

    // Add directional indicator
    const triangle = new THREE.Mesh(triangleGeometry, triangleMaterial);
    triangle.position.set(center.x, center.y + 3, center.z);
    triangle.rotation.z = zone.triangleRotation;

    scene.add(triangle);
}

// ---Notes---

const noteGeometry = new THREE.BoxGeometry(1.5, 1.5, 0.5);

const noteMaterialProperties = {
    color: 0x800080,
    ambient: 0.2,
    diffusivity: 0.7,
    specularity: 0.5,
    smoothness: 20.0
};

const noteMaterial = obscuredMaterial(noteMaterialProperties);

function createNote(positionX, positionY, positionZ) {
    const note = new THREE.Mesh(noteGeometry, noteMaterial.clone());
    note.position.set(positionX, positionY, positionZ);
    scene.add(note);
    return note;
}

const activeNotes = [];
function spawnNote() {
    const lanePositions = [-3, -1, 1, 3];
    const lane = Math.floor(Math.random() * 4);
    const note = createNote(lanePositions[lane], 2, -40);
    activeNotes.push(note);
}

setInterval(spawnNote, 1000);

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
gradient.addColorStop(1, 'green');
ctx.fillStyle = gradient;

// initial text
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.fillText('Score: 0', canvas.width/2, canvas.height/2);

// make texture and sprite
const texture = new THREE.CanvasTexture(canvas);
const material = new THREE.SpriteMaterial({ map: texture });
const scoreSprite = new THREE.Sprite(material);
scoreSprite.scale.set(4, 2, 1);
scoreSprite.position.set(0, 4.5, -4);
scene.add(scoreSprite);

// dynamically update text
function updateScore() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillText('Score: ' + score, canvas.width/2, canvas.height/2);
    texture.needsUpdate = true; 
}

// ---Controls---

function onKeyDown(event) {
    const key = event.key;
    switch(key) {
        case 'ArrowLeft':
        case 'ArrowDown':
        case 'ArrowUp':
        case 'ArrowRight':
            checkHit(key);
            break;
    }
}

function checkHit(key) {
    let zone;
    switch(key) {
        case 'ArrowLeft':
            zone = HIT_ZONES['Left'];
            break;
        case 'ArrowDown':
            zone = HIT_ZONES['Down'];
            break;
        case 'ArrowUp':
            zone = HIT_ZONES['Up'];
            break;
        case 'ArrowRight':
            zone = HIT_ZONES['Right'];
            break;
    }
    // Determine if a note is in the hit zone
    for(let i = activeNotes.length - 1; i >= 0; i--) {
        const note = activeNotes[i];
        const noteBox = new THREE.Box3().setFromObject(note);
        if(zone.box.intersectsBox(noteBox)) {
            // TODO: Create note hit effect
            scene.remove(note);
            activeNotes.splice(i, 1);
            score += 1;
            updateScore();
            return;
        }
    }
}


document.addEventListener('keydown', onKeyDown, false);

function animate() {

    let time = clock.getElapsedTime();

    updateObscuredUniforms(track);

    // Move active notes and update their uniforms
    for(let i = activeNotes.length - 1; i >= 0; i--) {
        const note = activeNotes[i];
        updateObscuredUniforms(note);
        note.position.z += NOTE_SPEED;
        if(note.position.z > -2.5) {
            scene.remove(note);
            activeNotes.splice(i, 1);
        }
    }

	renderer.render( scene, camera );
}

