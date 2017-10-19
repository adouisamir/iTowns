/* global itowns, document, renderer */
// # Simple Globe viewer

// Define initial camera position
var positionOnGlobe = { longitude: 2.423814, latitude: 48.844882, altitude: 60};
// var positionOnGlobe = { longitude: 2.391864678818233, latitude: 48.889957901766138, altitude: 80 };
// var positionOnGlobe = { longitude: 4.818, latitude: 45.7354, altitude: 3000 };
var promises = [];

// `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
var viewerDiv = document.getElementById('viewerDiv');

// Instanciate iTowns GlobeView*
var globeView = new itowns.GlobeView(viewerDiv, positionOnGlobe, { renderer: renderer, handleCollision: false });
function addLayerCb(layer) {
    return globeView.addLayer(layer);
}
globeView.controls.minDistance = 0;
// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
itowns.proj4.defs('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Add one imagery layer to the scene
// This layer is defined in a json file but it could be defined as a plain js
// object. See Layer* for more info.
promises.push(itowns.Fetcher.json('../layers/JSONLayers/Ortho.json').then(addLayerCb));

// Add two elevation layers.
// These will deform iTowns globe geometry to represent terrain elevation.
promises.push(itowns.Fetcher.json('../layers/JSONLayers/WORLD_DTM.json').then(addLayerCb));
promises.push(itowns.Fetcher.json('../layers/JSONLayers/IGN_MNT_HIGHRES.json').then(addLayerCb));


// var meshLayer = new itowns.GeometryLayer('mesh', globeView.scene);
// meshLayer.preUpdate = preUpdateMeshLayer;
// meshLayer.update = processMeshLayer;
// meshLayer.name = 'Mesh Layer';
// meshLayer.url = 'http://localhost:8080/examples/mesh.ply';
// // meshLayer.protocol = 'ply';
// meshLayer.overrideMaterials = true;  // custom cesium shaders are not functional
// meshLayer.type = 'geometry';
// meshLayer.visible = true;
// globeView.addLayer(meshLayer);

// globeView.addLayer({
//     preUpdate: preUpdateMeshLayer,
//     update: processMeshLayer,
//     name: 'Mesh Layer',
//     url: 'http://localhost:8080/examples/mesh.ply',
//     type: 'geometry',
//     visible: true,
// }, globeView.scene);

function altitudeBuildings(properties) {
    return properties.z_min - properties.hauteur;
}

function extrudeBuildings(properties) {
    return properties.hauteur;
}

var textureLayer;
globeView.addLayer({
    type: 'geometry',
    update: itowns.OrientedImageProcessing.update(),
    images: 'http://localhost:8080/examples/Li3ds/images/{imageId}_{sensorId}.jpg',
    orientations: 'http://localhost:8080/examples/Li3ds/li3ds_pano.json',
    calibrations: 'http://localhost:8080/examples/Li3ds/li3ds_camera.json',
    protocol: 'orientedimage',
    offset: {x: 657000, y: 6860000, z: 0},
    // version: '2.0.0',
    id: 'demo_orientedImage',
    // typeName: 'tcl_sytral.tcllignebus',
    level: 16,
    projection: 'EPSG:2154',
    view: globeView,
    crsOut: globeView.referenceCrs,
    options: {
        mimetype: 'geojson',
    },
}, globeView.tileLayer).then(result => {
    var loader = new itowns.THREE.PLYLoader();

    // loader.load('http://localhost:8080/examples/Li3ds/li3ds.ply', function (geometry) {
    //     var meshLayer = new itowns.GeometryLayer('mesh', globeView.scene);
    //     meshLayer.update = function() {};
    //     meshLayer.name = 'Mesh Layer';
    //     meshLayer.overrideMaterials = true;  // custom cesium shaders are not functional
    //     meshLayer.type = 'geometry';
    //     meshLayer.visible = true;
    //     globeView.addLayer(meshLayer);
    //     // console.log(geometry);
    //     // var material = new itowns.THREE.MeshPhongMaterial({ color: 0x7777ff, side: itowns.THREE.DoubleSide, transparent: true, opacity: 0.5, wireframe: false });
    //     var mesh = new itowns.THREE.Mesh( geometry, result.shaderMat );
    //     mesh.position.copy(new itowns.THREE.Vector3().set(4201000,177000,4779000));
    //     mesh.updateMatrixWorld();
    //     mesh.layer = meshLayer.id;
    //     globeView.scene.add( mesh );
    // });

    globeView.addLayer({
        type: 'geometry',
        update: itowns.FeatureProcessing.update,
        url: 'http://wxs.ign.fr/72hpsel8j8nhb5qgdh07gcyp/geoportail/wfs?',
        convert: itowns.Feature2Mesh.convert({
        altitude: altitudeBuildings,
        extrude: extrudeBuildings }),
        onMeshCreated: function setMaterial(res) { res.children[0].material = result.shaderMat; },
        protocol: 'wfs',
        version: '2.0.0',
        id: 'wfsBuilding',
        typeName: 'BDTOPO_BDD_WLD_WGS84G:bati_remarquable,BDTOPO_BDD_WLD_WGS84G:bati_indifferencie,BDTOPO_BDD_WLD_WGS84G:bati_industriel',
        level: 16,
        projection: 'EPSG:4326',
        extent: {
            west: 2.42,
            east: 2.43,
            south: 48.84,
            north: 48.85,
        },
        ipr: 'IGN',
        options: {
            mimetype: 'json',
    },
}, globeView.tileLayer);

});

exports.view = globeView;
exports.initialPosition = positionOnGlobe;
