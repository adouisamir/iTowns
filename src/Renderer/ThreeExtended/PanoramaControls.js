import * as THREE from 'three';

function onDocumentMouseDown(event, pointerX, pointerY) {
    event.preventDefault();
    this._isMouseDown = true;

    this._onMouseDownMouseX = pointerX;
    this._onMouseDownMouseY = pointerY;

    this._stateOnMouseDown = this._state.snapshot();
}

function limitRotation(camera3D, rot, panoramaVerticalFov) {
    if (camera3D.fov / 2 + Math.abs(THREE.Math.radToDeg(rot)) >
        panoramaVerticalFov / 2) {
        const s = Math.sign(rot);
        rot = s * THREE.Math.degToRad(panoramaVerticalFov - camera3D.fov) / 2;
    }
    return rot;
}


function onPointerMove(pointerX, pointerY) {
    if (this._isMouseDown === true) {
        // in rigor we have tan(theta) = tan(cameraFOV) * deltaH / H
        // (where deltaH is the vertical amount we moved, and H the renderer height)
        // we loosely approximate tan(x) by x
        const pxToAngleRatio = THREE.Math.degToRad(this._camera3D.fov) / this.view.mainLoop.gfxEngine.height;

        // update state based on pointer movement
        this._state.rotateY = ((pointerX - this._onMouseDownMouseX) * pxToAngleRatio) + this._stateOnMouseDown.rotateY;
        this._state.rotateX = limitRotation(
            this._camera3D,
            ((pointerY - this._onMouseDownMouseY) * pxToAngleRatio) + this._stateOnMouseDown.rotateX,
        this.options.panoramaVerticalFov);

        applyRotation(this.view, this._camera3D, this._state);
    }
}

function applyRotation(view, camera3D, state) {
    camera3D.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), camera3D.up);

    camera3D.rotateY(state.rotateY);
    camera3D.rotateX(state.rotateX);

    view.notifyChange(true, camera3D);
}

function onDocumentMouseUp() {
    this._isMouseDown = false;
}

function onDocumentMouseWheel(event) {
    let delta = 0;
    if (event.wheelDelta !== undefined) {
        delta = -event.wheelDelta;
    // Firefox
    } else if (event.detail !== undefined) {
        delta = event.detail;
    }

    this._camera3D.fov = Math.max(10,
        Math.min(
            this._camera3D.fov + Math.sign(delta),
            Math.min(100, this.options.panoramaVerticalFov)));
    this._camera3D.updateProjectionMatrix();

    this._state.rotateX = limitRotation(
        this._camera3D,
        this._state.rotateX,
        this.options.panoramaVerticalFov);

    applyRotation(this.view, this._camera3D, this._state);
}

/**
 * First-Person controls (at least a possible declination of it).
 *
 * Bindings:
 * - up + down keys: forward/backward
 * - left + right keys: strafing movements
 * - PageUp + PageDown: roll movement
 * - mouse click+drag: pitch and yaw movements (as looking at a panorama, not as in FPS games for instance)
 */
class PanoramaControls extends THREE.EventDispatcher {

    /**
     * @Constructor
     * @param {View} view
     * @param {object} options
     * @param {boolean} options.focusOnClick - whether or not to focus the renderer domElement on click
     * @param {boolean} options.focusOnMouseOver - whether or not to focus when the mouse is over the domElement
     */
    constructor(view, options = { }) {
        super();
        const domElement = view.mainLoop.gfxEngine.renderer.domElement;
        options.panoramaVerticalFov = options.panoramaVerticalFov || 180;
        if (options.panoramaRatio) {
            const radius = (options.panoramaRatio * 200) / (2 * Math.PI);
            options.panoramaVerticalFov = options.panoramaRatio == 2 ? 180 : THREE.Math.radToDeg(2 * Math.atan(200 / (2 * radius)));
        }

        this.view = view;
        this.options = options;
        this._camera3D = view.camera.camera3D;

        this._onMouseDownMouseX = 0;
        this._onMouseDownMouseY = 0;

        const self = this;
        this._state = {
            rotateX: 0,
            rotateY: 0,

            snapshot() {
                return { rotateX: self._state.rotateX, rotateY: self._state.rotateY };
            },
        };

        this._isMouseDown = false;

        const bindedPD = onDocumentMouseDown.bind(this);
        domElement.addEventListener('mousedown', e => bindedPD(e, e.clientX, e.clientY), false);
        domElement.addEventListener('touchstart', e => bindedPD(e, e.touches[0].pageX, e.touches[0].pageY), false);
        const bindedPM = onPointerMove.bind(this);
        domElement.addEventListener('mousemove', e => bindedPM(e.clientX, e.clientY), false);
        domElement.addEventListener('touchmove', e => bindedPM(e.touches[0].pageX, e.touches[0].pageY), false);
        domElement.addEventListener('mouseup', onDocumentMouseUp.bind(this), false);
        domElement.addEventListener('touchend', onDocumentMouseUp.bind(this), false);
        domElement.addEventListener('mousewheel', onDocumentMouseWheel.bind(this), false);
        domElement.addEventListener('DOMMouseScroll', onDocumentMouseWheel.bind(this), false); // firefox

        // focus policy
        if (options.focusOnMouseOver) {
            domElement.addEventListener('mouseover', () => domElement.focus());
        }
        if (options.focusOnClick) {
            domElement.addEventListener('click', () => domElement.focus());
        }
    }

    isUserInteracting() {
        return this._isMouseDown;
    }
}

export default PanoramaControls;
