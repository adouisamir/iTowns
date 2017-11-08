/**
 * Generated On: 2017-12-09
 * Class: OrientedImage_Provider
 * Description: Provides Oriented Image data for immersive navigation
 */
import * as THREE from 'three';
import format from 'string-format';
import Extent from '../../Geographic/Extent';
import Coordinates from '../../Geographic/Coordinates';
import Provider from './Provider';
import Fetcher from './Fetcher';
import CacheRessource from './CacheRessource';

function OrientedImage_Provider() {
    this.cache = CacheRessource();
}

OrientedImage_Provider.prototype = Object.create(Provider.prototype);

OrientedImage_Provider.prototype.constructor = OrientedImage_Provider;

OrientedImage_Provider.prototype.preprocessDataLayer = function preprocessDataLayer(layer) {
    layer.format = layer.options.mimetype || 'json';
    layer.offset = layer.offset || { x: 0, y: 0, z: 0 };
    layer.orientedImages = null;
    layer.currentPano = -1;
    layer.currentMat = null;
    layer.sensors = [];
    layer.networkOptions = { crossOrigin: '' };
    if (!(layer.extent instanceof Extent)) {
        layer.extent = new Extent(layer.projection, layer.extent);
    }
    var promises = [];

    promises.push(Fetcher.json(layer.orientations, layer.networkOptions));
    promises.push(Fetcher.json(layer.calibrations, layer.networkOptions));

    return Promise.all(promises).then((res) => { orientedImagesInit(res[0], layer); sensorsInit(res[1], layer); });
};

function loadOrientedImageData(oiInfo, layer, camera) {
    var promises = [];
    for (const sensor of layer.sensors) {
        var url = format(layer.images, { imageId: oiInfo.id, sensorId: sensor.id });
        const { texture, promise } = Fetcher.texture(url, layer.networkOptions);
        promise.then(() => texture);
        promises.push(promise);
    }
    return Promise.all(promises).then(res => updateMaterial(res, oiInfo, layer, camera));
}

function getMatrix4FromRotation(Rot) {
    var M4 = new THREE.Matrix4();
    M4.elements[0] = Rot.elements[0];
    M4.elements[1] = Rot.elements[1];
    M4.elements[2] = Rot.elements[2];
    M4.elements[4] = Rot.elements[3];
    M4.elements[5] = Rot.elements[4];
    M4.elements[6] = Rot.elements[5];
    M4.elements[8] = Rot.elements[6];
    M4.elements[9] = Rot.elements[7];
    M4.elements[10] = Rot.elements[8];
    return M4;
}

// function getTransfoGeoCentriqueToLocal(cGeocentrique) {
//     var clocal = cGeocentrique.as('EPSG:4326').as('EPSG:2154');
//     var cx = new Coordinates('EPSG:4978', cGeocentrique._values[0] + 1, cGeocentrique._values[1], cGeocentrique._values[2]).as('EPSG:4326').as('EPSG:2154');
//     var cy = new Coordinates('EPSG:4978', cGeocentrique._values[0], cGeocentrique._values[1] + 1, cGeocentrique._values[2]).as('EPSG:4326').as('EPSG:2154');
//     var cz = new Coordinates('EPSG:4978', cGeocentrique._values[0], cGeocentrique._values[1], cGeocentrique._values[2] + 1).as('EPSG:4326').as('EPSG:2154');
//     var p0geocentrique = new THREE.Vector3().set(cGeocentrique._values[0], cGeocentrique._values[1], cGeocentrique._values[2]);
//     return new THREE.Matrix4().set(
//         cx._values[0] - clocal._values[0], cy._values[0] - clocal._values[0], cz._values[0] - clocal._values[0], 0,
//         cx._values[1] - clocal._values[1], cy._values[1] - clocal._values[1], cz._values[1] - clocal._values[1], 0,
//         cx._values[2] - clocal._values[2], cy._values[2] - clocal._values[2], cz._values[2] - clocal._values[2], 0,
//         0, 0, 0, 1).multiply(new THREE.Matrix4().makeTranslation(-p0geocentrique.x, -p0geocentrique.y, -p0geocentrique.z));
// }

function getTransfoGeoCentriqueToLocal(cGeocentrique) {
    var position = new THREE.Vector3().set(cGeocentrique._values[0], cGeocentrique._values[1], cGeocentrique._values[2]);
    var object = new THREE.Object3D();
    object.up = THREE.Object3D.DefaultUp;
    object.position.copy(position);
    object.lookAt(position.clone().multiplyScalar(1.1));
    object.updateMatrixWorld();
    return new THREE.Matrix4().makeRotationFromQuaternion(object.quaternion.clone().inverse()).multiply(new THREE.Matrix4().makeTranslation(-position.x, -position.y, -position.z));
}

function getTransfoLocalToPanoStereopolis2(roll, pitch, heading) {
    const euler = new THREE.Euler(
        pitch * Math.PI / 180,
        roll * Math.PI / 180,
        heading * Math.PI / 180, 'ZXY');
    const qLocalToPano = new THREE.Quaternion().setFromEuler(euler);
    return new THREE.Matrix4().makeRotationFromQuaternion(qLocalToPano);
}

function getTransfoLocalToPanoMicMac(roll, pitch, heading) {
    // Omega
    var o = parseFloat(roll) / 180 * Math.PI;  // Deg to Rad // Axe X
    // Phi
    var p = parseFloat(pitch) / 180 * Math.PI;  // Deg to Rad // axe Y
    // Kappa
    var k = parseFloat(heading) / 180 * Math.PI;  // Deg to Rad // axe Z
    var M4 = new THREE.Matrix4();
    M4.elements[0] = Math.cos(p) * Math.cos(k);
    M4.elements[1] = Math.cos(p) * Math.sin(k);
    M4.elements[2] = -Math.sin(p);

    M4.elements[4] = Math.cos(o) * Math.sin(k) + Math.sin(o) * Math.sin(p) * Math.cos(k);
    M4.elements[5] = -Math.cos(o) * Math.cos(k) + Math.sin(o) * Math.sin(p) * Math.sin(k);
    M4.elements[6] = Math.sin(o) * Math.cos(p);

    M4.elements[8] = Math.sin(o) * Math.sin(k) - Math.cos(o) * Math.sin(p) * Math.cos(k);
    M4.elements[9] = -Math.sin(o) * Math.cos(k) - Math.cos(o) * Math.sin(p) * Math.sin(k);
    M4.elements[10] = -Math.cos(o) * Math.cos(p);
    return M4;
}

function updateMatrixMaterial(oiInfo, layer, camera) {
    if (!layer.mLocalToPano) return;
    // a recalculer a chaque fois que la camera bouge
    var mCameraToWorld = camera.matrixWorld;
    var mCameraToPano = layer.mLocalToPano.clone().multiply(layer.mWorldToLocal).clone().multiply(mCameraToWorld);

    for (var i = 0; i < layer.shaderMat.uniforms.mvpp.value.length; ++i) {
        var mp2t = layer.sensors[i].mp2t.clone();
        layer.shaderMat.uniforms.mvpp.value[i] = mp2t.multiply(mCameraToPano);
    }
}

// function debugDisto(px, py, pps, distortion, l1l2, etats) {
//     var ABx = 1 / etats * (px - pps.x);
//     var ABy = 1 / etats * (py - pps.y);
//     var R = Math.sqrt(ABx * ABx + ABy * ABy);
//     var lambda = Math.atan(R) / R;
//     var abx = lambda * ABx;
//     var aby = lambda * ABy;
//     var rho2 = abx * abx + aby * aby;
//     var r357 = (1 + rho2 * (distortion.x + rho2 * (distortion.y + rho2 * distortion.z))) * etats;
//     return { x: pps.x + r357 * abx + (l1l2.x * abx + l1l2.y * aby) * etats, y: pps.y + r357 * aby + l1l2.y * abx * etats };
// }

function updateMaterial(textures, oiInfo, layer, camera) {
    for (let i = 0; i < textures.length; ++i) {
        var oldTexture = layer.shaderMat.uniforms.texture.value[i];
        layer.shaderMat.uniforms.texture.value[i] = textures[i];
        if (oldTexture) oldTexture.dispose();
    }
    layer.mWorldToLocal = getTransfoGeoCentriqueToLocal(oiInfo.coordinates);
    if (layer.orientationType && (layer.orientationType == 'Stereopolis2')) {
        layer.mLocalToPano = getTransfoLocalToPanoStereopolis2(oiInfo.roll, oiInfo.pitch, oiInfo.heading);
    }
    else {
        layer.mLocalToPano = getTransfoLocalToPanoMicMac(oiInfo.roll, oiInfo.pitch, oiInfo.heading);
    }

    // Debug
    // var c2154 = new Coordinates('EPSG:2154', 653244.3, 6863994.22, 39.0);
    // var c4978 = c2154.as('EPSG:4326').as('EPSG:4978');
    // var v4978 = new THREE.Vector3(c4978._values[0], c4978._values[1], c4978._values[2]);
    // console.log('v4978', v4978);
    // var vLocal = v4978.clone().applyMatrix4(layer.mWorldToLocal);
    // console.log('vLocal', vLocal);
    // console.log('mLocalToPano', layer.mLocalToPano.clone());
    // var vPano = vLocal.clone().applyMatrix4(layer.mLocalToPano);
    // console.log('vPano', vPano);
    // console.log('layer.sensors[0].centerCameraInPano', layer.sensors[0].centerCameraInPano);
    // var vPanoTrans0 = vPano.clone().sub(layer.sensors[0].centerCameraInPano);
    // console.log('vPanoTrans0', vPanoTrans0);
    // var vTexture0 = vPanoTrans0.clone().applyMatrix3(layer.sensors[0].rotPano2Texture);
    // // var vTexture0 = vPano.clone().applyMatrix4(layer.sensors[0].mp2t);
    // var p0x = vTexture0.x / vTexture0.z;
    // var p0y = vTexture0.y / vTexture0.z;
    // console.log('Texture0 sans disto', p0x, p0y);
    // console.log('Texture0 avec disto', debugDisto(p0x, p0y, layer.sensors[0].pps, layer.sensors[0].distortion, layer.sensors[0].l1l2, layer.sensors[0].etats));

    // var vPanoTrans1 = vPano.clone().sub(layer.sensors[1].centerCameraInPano);
    // console.log('vPanoTrans1', vPanoTrans1);
    // var vTexture1 = vPanoTrans1.clone().applyMatrix3(layer.sensors[1].rotPano2Texture);
    // // var vTexture1 = vPano.clone().applyMatrix4(layer.sensors[1].mp2t);
    // var p1x = vTexture1.x / vTexture1.z;
    // var p1y = vTexture1.y / vTexture1.z;
    // console.log('Texture1 sans disto', p1x, p1y);
    // console.log('Texture1 avec disto', debugDisto(p1x, p1y, layer.sensors[1].pps, layer.sensors[1].distortion, layer.sensors[1].l1l2, layer.sensors[1].etats));
    // Fin Debug

    updateMatrixMaterial(oiInfo, layer, camera);
}

// todo: deplacer les shaders dans le dossier shader
// Minimal vertex shader for one oriented image
function minimalTextureProjectiveVS(NbImages) {
    return [
        '#ifdef GL_ES',
        'precision  highp float;',
        '#endif',
        '#ifdef USE_LOGDEPTHBUF',
        '#define EPSILON 1e-6',
        '#ifdef USE_LOGDEPTHBUF_EXT',
        'varying float vFragDepth;',
        '#endif',
        'uniform float logDepthBufFC;',
        '#endif',
        `#define N ${NbImages}`,
        'uniform mat4 mvpp[N];',
        'varying vec4 texcoord[N];',
        'vec4 posView;',
        'void main() {',
        '   posView =  modelViewMatrix * vec4(position,1.);',
        '   for(int i=0; i<N; ++i) texcoord[i] = mvpp[i] * posView;',
        '   gl_Position = projectionMatrix * posView;',
        '#ifdef USE_LOGDEPTHBUF',
        '   gl_Position.z = log2(max( EPSILON, gl_Position.w + 1.0 )) * logDepthBufFC;',
        '#ifdef USE_LOGDEPTHBUF_EXT',
        '   vFragDepth = 1.0 + gl_Position.w;',
        '#else',
        '   gl_Position.z = (gl_Position.z - 1.0) * gl_Position.w;',
        '#endif',
        '#endif',
        '}',
    ].join('\n');
}

// // Minimal fragment shader for one oriented image
function minimalTextureProjectiveFS(NbImages, withDistort) {
    var mainLoop = [];
    let i;
    for (i = 0; i < NbImages; ++i) {
        mainLoop.push(`if(texcoord[${i}].z>0.) {`);
        mainLoop.push(`   p =  texcoord[${i}].xy/texcoord[${i}].z;`);
        if (withDistort) mainLoop.push(`  distort(p,distortion[${i}],l1l2[${i}],pps[${i}]);`);
        mainLoop.push(`   d = borderfadeoutinv * getUV(p,size[${i}]);`);
        mainLoop.push('   if(d>0.) {');
        mainLoop.push(`       c = d*texture2D(texture[${i}],p);`);
        mainLoop.push('       color += c;');
        mainLoop.push('       if(c.a>0.) ++blend;');
        mainLoop.push('   }');
        mainLoop.push('}');
    }
    return [
        '#ifdef GL_ES',
        'precision  highp float;',
        '#endif',
        '#ifdef USE_LOGDEPTHBUF',
        '#define EPSILON 1e-6',
        '#ifdef USE_LOGDEPTHBUF_EXT',
        'varying float vFragDepth;',
        '#endif',
        'uniform float logDepthBufFC;',
        '#endif',
        `#define N ${NbImages}`,
        'varying vec4 texcoord[N];',
        'uniform sampler2D texture[N];',
        'uniform vec2      size[N];',
        (withDistort) ? '#define WITH_DISTORT' : '',
        '#ifdef WITH_DISTORT',
        'uniform vec2      pps[N];',
        'uniform vec4      distortion[N];',
        'uniform vec3      l1l2[N];',
        '#endif',
        'const float borderfadeoutinv = 0.02;',

        'float getUV(inout vec2 p, vec2 s)',
        '{',
        '   p.y = s.y-p.y;',
        '   vec2 d = min(p.xy,s-p.xy);',
        '   p/=s;',
        '   return min(d.x,d.y);',
        '}',

        '#ifdef WITH_DISTORT',
        'void distort(inout vec2 p, vec4 adist, vec2 apps)',
        '{',
        '   vec2 v = p - apps;',
        '   float v2 = dot(v,v);',
        '   if(v2>adist.w) p = vec2(-1.);',
        '   else p += (v2*(adist.x+v2*(adist.y+v2*adist.z)))*v;',
        '}',
        'void distort(inout vec2 p, vec4 dist, vec3 l1l2, vec2 pps)',
        '{ ',
        '   if ((l1l2.x == 0.)&&(l1l2.y == 0.)) distort(p,dist,pps);',
        '   else {',
        '   vec2 AB = 1./l1l2.z*(p-pps);',
        '   float R = sqrt(dot(AB,AB));',
        '   float lambda = atan(R)/R;',
        '   vec2 ab = lambda*AB;',
        '   float rho2 = dot(ab,ab);',
        '   float r357 = (1. + rho2* (dist.x + rho2* (dist.y + rho2*dist.z)))*l1l2.z;',
        '   p = pps + r357*ab + vec2((l1l2.x*ab.x+l1l2.y*ab.y)*l1l2.z,l1l2.y*ab.x*l1l2.z);',
        '   }',
        '}',
        '#endif',

        'void main(void)',
        '{',
        '#if defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)',
        '   gl_FragDepthEXT = log2(vFragDepth) * logDepthBufFC * 0.5;',
        '#endif',
        '   vec4 color  = vec4(0.);',
        '   vec2 p;',
        '   vec4 c;',
        '   float d;',
        '   int blend = 0;',
        mainLoop.join('\n'),
        '   if (color.a > 0.0) color = color / color.a;',
        '   color.a = 1.;',
        '   gl_FragColor = color;',
        '} ',
    ].join('\n');
}

function orientedImagesInit(res, layer) {
    // todo: gerer l'offset et le changement de projection
    layer.orientedImages = res;
    for (const ori of layer.orientedImages) {
        ori.easting += layer.offset.x;
        ori.northing += layer.offset.y;
        ori.altitude += layer.offset.z;
        if (layer.projection == 'EPSG:4978') {
            ori.coordinates = new Coordinates('EPSG:4978', ori.easting, ori.northing, ori.altitude);
        }
        else if (layer.projection == 'EPSG:4326') {
            ori.coordinates = new Coordinates('EPSG:4326', ori.easting, ori.northing, ori.altitude).as('EPSG:4978');
        }
        else {
            ori.coordinates = new Coordinates(layer.projection, ori.easting, ori.northing, ori.altitude).as('EPSG:4326').as('EPSG:4978');
        }
    }
}

function sensorsInit(res, layer) {
    let i;

    var withDistort = false;
    for (const s of res) {
        var sensor = {};
        sensor.id = s.id;

        var rotCamera2Pano = new THREE.Matrix3().fromArray(s.rotation);
        var rotTerrain = new THREE.Matrix3().set(
            1, 0, 0,
            0, 1, 0,
            0, 0, 1);
        if (layer.orientationType && (layer.orientationType == 'Stereopolis2')) {
            rotTerrain = new THREE.Matrix3().set(
                0, -1, 0,
                1, 0, 0,
                0, 0, 1);
        }
        var rotEspaceImage = new THREE.Matrix3().set(
            1, 0, 0,
            0, 1, 0,
            0, 0, 1);
        rotCamera2Pano = rotTerrain.clone().multiply(rotCamera2Pano.clone().multiply(rotEspaceImage));
        var rotPano2Camera = rotCamera2Pano.clone().transpose();

        var centerCameraInPano = new THREE.Vector3().fromArray(s.position);
        var transPano2Camera = new THREE.Matrix4().makeTranslation(
            -centerCameraInPano.x,
            -centerCameraInPano.y,
            -centerCameraInPano.z);
        var projection = (new THREE.Matrix3().fromArray(s.projection)).transpose();
        var rotPano2Texture = projection.clone().multiply(rotPano2Camera);
        sensor.mp2t = getMatrix4FromRotation(rotPano2Texture).multiply(transPano2Camera);
        // sensor.rotPano2Texture = rotPano2Texture;
        // sensor.centerCameraInPano = centerCameraInPano;
        sensor.distortion = null;
        sensor.pps = null;
        if (s.distortion) {
            sensor.pps = new THREE.Vector2().fromArray(s.distortion.pps);
            var disto = new THREE.Vector3().fromArray(s.distortion.poly357);
            sensor.distortion = new THREE.Vector4(disto.x, disto.y, disto.z, s.distortion.limit * s.distortion.limit);
            if (s.distortion.l1l2) {
                sensor.l1l2 = new THREE.Vector2().fromArray(s.distortion.l1l2);
                sensor.etats = s.distortion.etats;
            }
            else {
                sensor.l1l2 = new THREE.Vector2().set(0, 0);
                sensor.etats = 0;
            }
            withDistort = true;
        }
        sensor.size = new THREE.Vector2().fromArray(s.size);
        layer.sensors.push(sensor);
    }
    var U = {
        size: { type: 'v2v', value: [] },
        mvpp: { type: 'm4v', value: [] },
        texture: { type: 'tv', value: [] },
    };

    if (withDistort) {
        U.distortion = { type: 'v4v', value: [] };
        U.pps = { type: 'v2v', value: [] };
        U.l1l2 = { type: 'v3v', value: [] };
    }

    for (i = 0; i < layer.sensors.length; ++i) {
        U.size.value[i] = layer.sensors[i].size;
        U.mvpp.value[i] = new THREE.Matrix4();
        U.texture.value[i] = new THREE.Texture();
        if (withDistort) {
            U.distortion.value[i] = layer.sensors[i].distortion;
            U.pps.value[i] = layer.sensors[i].pps;
            U.l1l2.value[i] = new THREE.Vector3().set(layer.sensors[i].l1l2.x, layer.sensors[i].l1l2.y, layer.sensors[i].etats);
        }
    }

    // create the shader material for Three
    layer.shaderMat = new THREE.ShaderMaterial({
        uniforms: U,
        vertexShader: minimalTextureProjectiveVS(layer.sensors.length),
        fragmentShader: minimalTextureProjectiveFS(layer.sensors.length, withDistort),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.1,
        // wireframe: true,
    });
}

OrientedImage_Provider.prototype.getPanoIndex = function getPanoIndex(layer) {
    return layer.currentPano;
};

OrientedImage_Provider.prototype.getPanoLenght = function getPanoLenght(layer) {
    return layer.currentPano;
};

OrientedImage_Provider.prototype.getPanoPosition = function getPanoPosition(layer, panoIndex) {
    if (panoIndex >= layer.orientedImages.length) return;

    var P = layer.orientedImages[panoIndex].coordinates;
    var cameraPosition = (new THREE.Vector3()).set(P._values[0], P._values[1], P._values[2]);
    return { position: cameraPosition };
};

OrientedImage_Provider.prototype.getNextPano = function getNextPano(layer) {
    var panoIndex = (layer.currentPano + 1) % layer.orientedImages.length;
    return this.getPanoPosition(layer, panoIndex);
};

OrientedImage_Provider.prototype.updateMaterial = function updateMaterial(camera, scene, layer) {
    var currentPos = camera.position.clone();
    var position = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z);

    // if necessary create the sphere
    if (!layer.sphere) {
        // On cree une sphere et on l'ajoute a la scene
        var geometry = new THREE.SphereGeometry(5, 32, 32);
        // var material = layer.shaderMat;
        var material = new THREE.MeshPhongMaterial({ color: 0x7777ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5, wireframe: true });
        layer.sphere = new THREE.Mesh(geometry, material);
        layer.sphere.visible = true;
        layer.sphere.layer = layer;// layer.id;
        layer.sphere.name = 'immersiveSphere';
        layer.sphere.orientedImageProvider = this;
        scene.add(layer.sphere);
    }

    // sphere can be create before shaderMat
    // update the material to be sure
    if (layer.shaderMat) layer.sphere.material = layer.shaderMat;

    // look for the closest oriented image
    if (layer.orientedImages)
    {
        var minDist = -1;
        var minIndice = -1;
        let indice = 0;
        for (const ori of layer.orientedImages) {
            var vPano = new THREE.Vector3(ori.coordinates._values[0], ori.coordinates._values[1], ori.coordinates._values[2]);
            var D = position.distanceTo(vPano);
            if ((minDist < 0) || (minDist > D)) {
                minDist = D;
                minIndice = indice;
            }
            ++indice;
        }
        if (layer.currentPano !== minIndice) {
            layer.currentPano = minIndice;
            var P = layer.orientedImages[minIndice].coordinates;
            layer.sphere.position.set(P._values[0], P._values[1], P._values[2]);
            layer.sphere.updateMatrixWorld();
            loadOrientedImageData(layer.orientedImages[minIndice], layer, camera);
        }
        else {
            // update the uniforms
            updateMatrixMaterial(layer.orientedImages[minIndice], layer, camera);
        }
    }
};

OrientedImage_Provider.prototype.tileInsideLimit = function tileInsideLimit(tile, layer) {
    return (layer.level === undefined || tile.level === layer.level) && layer.extent.intersect(tile.extent);
};

OrientedImage_Provider.prototype.executeCommand = function executeCommand(command) {
    const layer = command.layer;
    const tile = command.requester;
    const destinationCrs = command.view.referenceCrs;
    return this.getFeatures(destinationCrs, tile, layer, command).then(result => command.resolve(result));
};

function assignLayer(object, layer) {
    if (object) {
        object.layer = layer.id;
        object.layers.set(layer.threejsLayer);
        for (const c of object.children) {
            assignLayer(c, layer);
        }
        return object;
    }
}

function applyColor(colorAttribute, indice) {
    const pos = indice / 3;
    const pos4 = pos % 4;
    switch (pos4) {
        case 0:
            colorAttribute[indice] = 0;
            colorAttribute[indice + 1] = 255;
            colorAttribute[indice + 2] = 0;
            break;
        case 1:
            colorAttribute[indice] = 255;
            colorAttribute[indice + 1] = 255;
            colorAttribute[indice + 2] = 0;
            break;
        case 2:
            colorAttribute[indice] = 255;
            colorAttribute[indice + 1] = 0;
            colorAttribute[indice + 2] = 0;
            break;
        case 3:
            colorAttribute[indice] = 0;
            colorAttribute[indice + 1] = 0;
            colorAttribute[indice + 2] = 0;
            break;
        default:
            break;
    }
}

// load data for a layer/tile/crs
OrientedImage_Provider.prototype.getFeatures = function getFeatures(crs, tile, layer) {
    if ((layer.orientedImages) && (layer.orientedImages.length > 0))
    {
        var sel = [];
        var prop = [];
        var indicePano = [];
        let i = 0;
        for (const ori of layer.orientedImages) {
            var coordinates = ori.coordinates;
            if (tile.extent.isPointInside(coordinates)) {
                sel.push([coordinates._values[0], coordinates._values[1], coordinates._values[2]]);
                prop.push(ori);
                indicePano.push(i);
            }
            ++i;
        }
        if (sel.length) {
            // create THREE.Points with the orientedImage position
            const vertices = new Float32Array(3 * sel.length);
            const colorAttribute = new Uint8Array(sel.length * 3);
            let indice = 0;
            for (const v of sel) {
                vertices[indice] = v[0] - sel[0][0];
                vertices[indice + 1] = v[1] - sel[0][1];
                vertices[indice + 2] = v[2] - sel[0][2];

                applyColor(colorAttribute, indice);
                indice += 3;
            }
            const bufferGeometry = new THREE.BufferGeometry();
            bufferGeometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
            bufferGeometry.addAttribute('color', new THREE.BufferAttribute(colorAttribute, 3, true));
            const P = new THREE.Points(bufferGeometry);

            P.material.vertexColors = THREE.VertexColors;
            P.material.color = new THREE.Color(0xffffff);
            P.material.size = 0.1;
            P.opacity = 0.5;
            P.transparent = true;

            P.position.set(sel[0][0], sel[0][1], sel[0][2]);
            P.updateMatrixWorld(true);
            return Promise.resolve(assignLayer(P, layer));
        }
    }
    return Promise.resolve();
};

export default OrientedImage_Provider;
