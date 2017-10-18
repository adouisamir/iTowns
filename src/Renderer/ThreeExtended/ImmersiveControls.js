import * as THREE from 'three';
import AnimationPlayer, { AnimatedExpression } from '../../Core/AnimationPlayer';

const MAX_FOV = 40;

// Note: we could use existing three.js controls (like https://github.com/mrdoob/three.js/blob/dev/examples/js/controls/FirstPersonControls.js)
// but including these controls in itowns allows use to integrate them tightly with itowns.
// Especially the existing controls are expecting a continuous update loop while we have a pausable one (so our controls use .notifyChange when needed)

function onDocumentMouseDown(event) {
    // event.preventDefault();
    this._isUserInteracting = true;

    this._onMouseDownMouseX = event.clientX;
    this._onMouseDownMouseY = event.clientY;
    this._onMouseDownPhi = this._phi;
    this._onMouseDownTheta = this._theta;
}

function onDocumentMouseMove(event) {
    if (this._isUserInteracting === true) {
        const fovCorrection = this.camera.fov / MAX_FOV; // 1 at MAX_FOV
        this._phi = -1 * (this._onMouseDownMouseX - event.clientX) * 0.13 * fovCorrection + this._onMouseDownPhi;
        this._theta = (event.clientY - this._onMouseDownMouseY) * 0.13 * fovCorrection + this._onMouseDownTheta;
        this.view.notifyChange(false);
    }
}

function onDocumentMouseUp() {
    this._isUserInteracting = false;
}

function onKeyUp(e) {
    const move = MOVEMENTS[e.keyCode];
    if (move) {
        this.moves.delete(move);
        this.view.notifyChange(true);
        e.preventDefault();
    }
}


function onKeyDown(e) {
    if (e.keyCode == 90) {
        this.moveCameraToNextPano();
    }

    if (e.keyCode == 65) {
        this.moveCameraToCurrentPano();
    }

    const move = MOVEMENTS[e.keyCode];
    if (move) {
        this.moves.add(move);
        this.view.notifyChange(false);
        e.preventDefault();
    }
}

const MOVEMENTS = {
    38: { method: 'translateZ', sign: -1 }, // FORWARD: up key
    40: { method: 'translateZ', sign: 1 }, // BACKWARD: down key
    37: { method: 'translateX', sign: -1 }, // STRAFE_LEFT: left key
    39: { method: 'translateX', sign: 1 }, // STRAFE_RIGHT: right key
    33: { method: 'translateY', sign: 1 }, // UP: PageUp key
    34: { method: 'translateY', sign: -1 }, // DOWN: PageDown key
};


    // Expression used to damp camera's moves
function moveCameraExp(root, progress) {
    // const dampingProgress = 1 - Math.pow((1 - (Math.sin((progress - 0.5) * Math.PI) * 0.5 + 0.5)), 2);
    // root.camera.position.lerpVectors(root.positionFrom, root.positionTo, dampingProgress);
    root.camera.position.lerpVectors(root.positionFrom, root.positionTo, progress);
}

function update2() {
    this.view.notifyChange(true, this.view);
}

class ImmersiveControls extends THREE.EventDispatcher {
    // Animations

    constructor(view, options = {}) {
        super();

        this.animationMoveCamera = new AnimatedExpression({ duration: 5, root: this, expression: moveCameraExp, name: 'Move camera' });

        this.camera = view.camera.camera3D;
        this.view = view;
        this.player = new AnimationPlayer();

        this.moves = new Set();
        this.moveSpeed = options.moveSpeed || 10; // backward or forward move speed in m/s
        this._isUserInteracting = false;
        this._onMouseDownMouseX = 0;
        this._onMouseDownMouseY = 0;
        this._onMouseDownPhi = 0;
        this._onMouseDownTheta = 0;

        this.objectCam = new THREE.AxisHelper(50);
        this.view.scene.add(this.objectCam);
        // this.axis = new THREE.AxisHelper( 50 );
        this.axis = new THREE.Object3D();
        this.objectCam.add(this.axis);

        // this.axis.rotation.reorder('ZYX');
        // this._theta = THREE.Math.radToDeg(this.axis.rotation.x);
        // this._phi = THREE.Math.radToDeg(this.axis.rotation.z);
        // this.updateAngles();

        const lookAtPosition = this.camera.position.clone().multiplyScalar(1.1);
        this.setCameraOnPano(this.camera.position.clone(), lookAtPosition);

        const domElement = view.mainLoop.gfxEngine.renderer.domElement;
        domElement.addEventListener('mousedown', onDocumentMouseDown.bind(this), false);
        domElement.addEventListener('mousemove', onDocumentMouseMove.bind(this), false);
        domElement.addEventListener('mouseup', onDocumentMouseUp.bind(this), false);
        domElement.addEventListener('keyup', onKeyUp.bind(this), true);
        domElement.addEventListener('keydown', onKeyDown.bind(this), true);
        this.player.addEventListener('animation-frame', update2.bind(this));
        this.view.addFrameRequester(this);

        // focus policy
        if (options.focusOnMouseOver) {
            domElement.addEventListener('mouseover', () => domElement.focus());
        }
        if (options.focusOnClick) {
            domElement.addEventListener('click', () => domElement.focus());
        }
    }

    isUserInteracting() {
        return this.moves.size !== 0;
    }

    moveCameraToCurrentPano() {
        var immersiveSphere = this.view.scene.getObjectByName('immersiveSphere');
        if (immersiveSphere) {
            const nextPanoPosition = immersiveSphere.orientedImageProvider.getNextPano(immersiveSphere.layer).position;

            this.setCameraOnPano(immersiveSphere.position, nextPanoPosition);
        }
    }

    moveCameraToNextPano() {
        var immersiveSphere = this.view.scene.getObjectByName('immersiveSphere');
        if (immersiveSphere) {
            const nextPanoPosition = immersiveSphere.orientedImageProvider.getNextPano(immersiveSphere.layer).position;

            this.positionFrom = this.camera.position.clone();

            this.positionTo = nextPanoPosition;
            this.positionTo.add(this.positionTo.clone().normalize());

            this.player.play(this.animationMoveCamera);
        }
    }

    updateAngles() {
        // get angles from axis (axis rotation move as mouse move, in the plan tangent to the surface of the globe)
        this.axis.rotation.order = 'ZYX';
        this.axis.rotation.x = THREE.Math.degToRad(this._theta);
        this.axis.rotation.z = THREE.Math.degToRad(this._phi) + 3.14;
        this.axis.updateMatrixWorld();

        const rotMatrix = new THREE.Matrix4();
        rotMatrix.multiplyMatrices(this.objectCam.matrix, this.axis.matrix);
        this.camera.rotation.setFromRotationMatrix(rotMatrix);

        this.view.notifyChange(true, this.view);
    }

    setCameraOnPano(positionPano, nextPanoPosition) {
        // move camObject on the surface of the globe
        this.objectCam.position.copy(positionPano);
        this.objectCam.lookAt(this.objectCam.position.clone().multiplyScalar(1.1));
        this.objectCam.updateMatrixWorld();

        // rotate axis to look at next pano
        const nextPanoLocal = this.objectCam.worldToLocal(nextPanoPosition);
        this.axis.lookAt(nextPanoLocal);
        this.axis.updateMatrixWorld();

        // move camera on objectCam position
        this.camera.position.copy(this.objectCam.position);
        this.camera.position.add(this.objectCam.position.clone().normalize());
        this.camera.updateMatrixWorld();

        // save axis rotation
        this.axis.rotation.reorder('ZYX');
        this._theta = THREE.Math.radToDeg(this.axis.rotation.x);
        this._phi = THREE.Math.radToDeg(this.axis.rotation.z);
        this.updateAngles();
    }

    update(dt, updateLoopRestarted) {
        // if we are in a keypressed state, then update position

        // dt will not be relevant when we just started rendering, we consider a 1-frame move in this case
        if (updateLoopRestarted) {
            dt = 16;
        }

        for (const move of this.moves) {
            if (move.method === 'translateY') {
                const normal = this.objectCam.position.clone().normalize();
                this.camera.position.add(normal.multiplyScalar(move.sign * this.moveSpeed * dt / 1000));
            } else if (move.method === 'translateX') {
                // slow camera pan on X
                this.camera[move.method](move.sign * this.moveSpeed * 0.5 * dt / 1000);
            } else {
                // speed camera on tanslate Z
                this.camera[move.method](move.sign * this.moveSpeed * 2 * dt / 1000);
            }
        }

        if (this.moves.size || this._isUserInteracting) {
            this.updateAngles();
        }
    }
}

export default ImmersiveControls;
