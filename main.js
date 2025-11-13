import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ---Game constants/variables---

const HIT_ZONE_Z = -5;
const NOTE_SPEED = 0.2;

let score = 0;

// ---Three.js Setup---

const scene = new THREE.Scene();
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

// ---Lighting/Environment---

const directionalLight = new THREE.DirectionalLight( 0xffffff, 0.5 );
directionalLight.position.set( 0, 10, 5 ); 
directionalLight.castShadow = true; 
scene.add( directionalLight );

// ---Ambient Light---
scene.add( new THREE.AmbientLight( 0x404040, 1.5 ) );

const trackGeometry = new THREE.PlaneGeometry( 50, 500 );
const trackMaterial = new THREE.MeshStandardMaterial( { color: 0xffffff, metalness: 0.8, roughness: 0.1 } );
const track = new THREE.Mesh( trackGeometry, trackMaterial );
track.rotation.x = -Math.PI / 2;
track.position.y = 0;
track.position.z = -200;
track.receiveShadow = true; 
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
const noteMaterial = new THREE.MeshStandardMaterial( { color: 0x800080, metalness: 0.5, roughness: 0.5 } );
function createNote(positionX, positionY, positionZ) {
    const note = new THREE.Mesh(noteGeometry, noteMaterial);
    note.position.set(positionX, positionY, positionZ);
    scene.add(note);
    return note;
}

const activeNotes = [];
function spawnNote() {
    const lanePositions = [-3, -1, 1, 3];
    const lane = Math.floor(Math.random() * 4);
    const note = createNote(lanePositions[lane], 2, -25);
    activeNotes.push(note);
}

setInterval(spawnNote, 1000);

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
            console.log('Hit detected!');
            return;
        }
    }
}


document.addEventListener('keydown', onKeyDown, false);

let clock = new THREE.Clock();

function animate() {

    let time = clock.getElapsedTime();

    // Move active notes
    for(let i = activeNotes.length - 1; i >= 0; i--) {
        const note = activeNotes[i];
        note.position.z += NOTE_SPEED; // Move note towards the player
        if(note.position.z > 10) {
            scene.remove(note);
            activeNotes.splice(i, 1);
        }
    }

	renderer.render( scene, camera );
}

