import * as THREE from 'three';
import Earcut from 'earcut';

function getAltitude(options, properties) {
    if (options.altitude) {
        if (typeof options.altitude === 'function') {
            return options.altitude(properties);
        } else {
            return options.altitude;
        }
    }
    return 0;
}

function getExtrude(options, properties) {
    if (options.extrude) {
        if (typeof options.extrude === 'function') {
            return options.extrude(properties);
        } else {
            return options.extrude;
        }
    }
    return 0;
}

function randomColor() {
    const randomColor = new THREE.Color();
    randomColor.setHex(Math.random() * 0xffffff);
    return randomColor;
}

function getColor(options, properties) {
    if (options.color) {
        if (typeof options.color === 'function') {
            return options.color(properties);
        } else {
            return options.color;
        }
    }
    return randomColor();
}

function createColorArray(length, color, brightness) {
    const colors = new Array(length * 3);
    for (let i = 0; i < length; ++i) {
        colors[3 * i] = color.r * brightness;
        colors[3 * i + 1] = color.g * brightness;
        colors[3 * i + 2] = color.b * brightness;
    }
    return colors;
}

/*
 * Convert coordinates to vertices positionned at a given altitude
 *
 * @param  {Coordinate[]} contour - Coordinates of a feature
 * @param  {number} altitude - Altitude of the feature
 * @return {Vector3[]} vertices
 */
function coordinatesToVertices(contour, altitude) {
    // position in the vertices result
    let offset = 0;
    const vertices = new Array(contour.length * 3);
    // loop over contour coodinates
    for (const coordinate of contour) {
        // convert coordinate to position
        const vec = coordinate.xyz();
        // get the normal vector.
        const normal = coordinate.geodesicNormal;
        // move the vertex following the normal, to put the point on the good altitude
        vec.add(normal.clone().multiplyScalar(altitude));
        // fill the vertices array at the offset position
        vec.toArray(vertices, offset);
        // increment the offset
        offset += 3;
    }
    return vertices;
}

/*
 * Helper function to extract, for a given feature id, the feature contour coordinates, and its properties.
 *
 * param  {structure with coordinate[] and featureVertices[]} coordinates - representation of the features
 * param  {properties[]} properties - properties of the features
 * param  {number} id - id of the feature
 * return {Coordinate[], propertie[] } {contour, properties}
 */
function extractFeature(coordinates, properties, id) {
    const featureVertices = coordinates.featureVertices[id];
    const contour = coordinates.coordinates.slice(featureVertices.offset, featureVertices.offset + featureVertices.count);
    const property = properties[id].properties;
    return { contour, property };
}

/*
 * Add indices for the side faces.
 * We loop over the contour and create a side face made of two triangles.
 *
 * For a contour made of (n) coordinates, there are (n*2) vertices.
 * The (n) first vertices are on the roof, the (n) other vertices are on the floor.
 *
 * If index (i) is on the roof, index (i+length) is on the floor.
 *
 * @param {number[]} indices - Indices of vertices
 * @param {number} length - length of the contour of the feature
 * @param {number} offset - index of the first vertice of this feature
 */
function addFaces(indices, length, offset) {
    // loop over contour length, and for each point of the contour,
    // add indices to make two triangle, that make the side face
    for (let i = offset; i < offset + length - 1; ++i) {
        // first triangle indices
        indices.push(i);
        indices.push(i + length);
        indices.push(i + 1);
        // second triangle indices
        indices.push(i + 1);
        indices.push(i + length);
        indices.push(i + length + 1);
    }
}

function coordinateToPoints(coordinates, properties, options) {
    let vertices = [];
    let colors = [];
    const geometry = new THREE.BufferGeometry();

    /* eslint-disable guard-for-in */
    for (const id in coordinates.featureVertices) {
        const { contour, property } = extractFeature(coordinates, properties, id);
        // get altitude from properties
        const altitude = getAltitude(options, property);
        const newVertices = coordinatesToVertices(contour, altitude);
        vertices = vertices.concat(newVertices);

        // assign color to each point
        const colorArray = createColorArray(contour.length, getColor(options, property), 255);
        colors = colors.concat(colorArray);
    }

    geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.addAttribute('color', new THREE.BufferAttribute(new Uint8Array(colors), 3, true));
    return new THREE.Points(geometry);
}

function coordinateToLines(coordinates, properties, options) {
    let vertices = [];
    const indices = [];
    let colors = [];
    const geometry = new THREE.BufferGeometry();

    /* eslint-disable-next-line */
    for (const id in coordinates.featureVertices) {
        const { contour, property } = extractFeature(coordinates, properties, id);
        // get altitude from properties
        const altitude = getAltitude(options, property);
        const newVertices = coordinatesToVertices(contour, altitude);
        vertices = vertices.concat(newVertices);

        // set indices
        const line = coordinates.featureVertices[id];
        // TODO optimize indices lines
        // is the same array each time
        for (let i = line.offset; i < line.offset + line.count - 1; ++i) {
            indices.push(i);
            indices.push(i + 1);
        }

        // assign color to each point of the line
        const colorArray = createColorArray(contour.length, getColor(options, property), 255);
        colors = colors.concat(colorArray);
    }

    geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.addAttribute('color', new THREE.BufferAttribute(new Uint8Array(colors), 3, true));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    return new THREE.LineSegments(geometry);
}

function coordinateToPolygon(coordinates, properties, options) {
    const indices = [];
    let vertices = [];
    let colors = [];
    const geometry = new THREE.BufferGeometry();
    let offset = 0;
    /* eslint-disable-next-line */
    for (const id in coordinates.featureVertices) {
        // extract contour coodinates and properties of one feature
        const { contour, property } = extractFeature(coordinates, properties, id);
        // get altitude and extrude amount from properties
        const altitudeBottom = getAltitude(options, property);
        const altitudeTopFace = altitudeBottom;
        // add vertices of the top face
        const verticesTopFace = coordinatesToVertices(contour, altitudeTopFace);
        vertices = vertices.concat(verticesTopFace);
        // triangulate the top face
        const triangles = Earcut(verticesTopFace, null, 3);
        for (const indice of triangles) {
            indices.push(offset + indice);
        }
        // increment offset
        offset += contour.length;

        // assign color to each point of the polygon
        const colorArray = createColorArray(contour.length, getColor(options, property), 255);
        colors = colors.concat(colorArray);
    }

    geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.addAttribute('color', new THREE.BufferAttribute(new Uint8Array(colors), 3, true));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    return new THREE.Mesh(geometry);
}

function coordinateToPolygonExtruded(coordinates, properties, options) {
    const indices = [];
    let vertices = [];
    let colors = [];
    const geometry = new THREE.BufferGeometry();
    let offset = 0;
    /* eslint-disable-next-line */
    for (const id in coordinates.featureVertices) {
        // extract contour coodinates and properties of one feature
        const { contour, property } = extractFeature(coordinates, properties, id);
        // get altitude and extrude amount from properties
        const altitudeBottom = getAltitude(options, property);
        const extrudeAmount = getExtrude(options, property);
        // altitudeTopFace is the altitude of the visible top face.
        const altitudeTopFace = altitudeBottom + extrudeAmount;
        // add vertices of the top face
        const verticesTopFace = coordinatesToVertices(contour, altitudeTopFace);
        vertices = vertices.concat(verticesTopFace);
        // triangulate the top face
        const triangles = Earcut(verticesTopFace, null, 3);
        for (const indice of triangles) {
            indices.push(offset + indice);
        }
        // add vertices of the bottom face
        const verticesBottom = coordinatesToVertices(contour, altitudeBottom);
        vertices = vertices.concat(verticesBottom);
        // add indices to make the side faces
        addFaces(indices, contour.length, offset);
        // increment offset, there is twice many vertices because polygone is extruded.
        offset += 2 * contour.length;

        // assign color to each point
        const color = getColor(options, property);
        const colorArray = createColorArray(contour.length, color, 255);
        // The floor is colored darker to create a shadow effect.
        const colorArrayFloor = createColorArray(contour.length, color, 155);
        colors = colors.concat(colorArray, colorArrayFloor);
    }

    geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.addAttribute('color', new THREE.BufferAttribute(new Uint8Array(colors), 3, true));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    const result = new THREE.Mesh(geometry);

    return result;
}

/*
 * Convert all feature coordinates in one mesh.
 *
 * Read the altitude of each feature in the properties of the feature, using the function given in the param style : style.altitude(properties).
 * For polygon, read extrude amout using the function given in the param style.extrude(properties).
 *
 * param  {structure with coordinate[] and featureVertices[]} coordinates - representation of all the features
 * param  {properties[]} properties - properties of all the features
 * param  {callbacks} callbacks defines functions to read altitude and extrude amout from feature properties
 * return {THREE.Mesh} mesh
 */
function coordinatesToMesh(coordinates, properties, options) {
    if (!coordinates) {
        return;
    }
    var mesh;
    switch (coordinates.type) {
        case 'point': {
            mesh = coordinateToPoints(coordinates, properties, options);
            break;
        }
        case 'linestring': {
            mesh = coordinateToLines(coordinates, properties, options);
            break;
        }
        case 'polygon': {
            if (options.extrude) {
                mesh = coordinateToPolygonExtruded(coordinates, properties, options);
            }
            else {
                mesh = coordinateToPolygon(coordinates, properties, options);
            }
            break;
        }
        default:
    }

    // set mesh material
    mesh.material.vertexColors = THREE.VertexColors;
    mesh.material.color = new THREE.Color(0xffffff);
    return mesh;
}

function featureToThree(feature, options) {
    const mesh = coordinatesToMesh(feature.geometry, feature.properties, options);
    mesh.properties = feature.properties;
    return mesh;
}

function featureCollectionToThree(featureCollection, options) {
    const group = new THREE.Group();
    for (const geometry of featureCollection.geometries) {
        const properties = featureCollection.features;
        group.add(coordinatesToMesh(geometry, properties, options));
    }
    group.features = featureCollection.features;
    return group;
}

export default {

    convert(options = {}) {
        return function _convert(feature) {
            if (!feature) return;
            if (feature.geometries) {
                return featureCollectionToThree(feature, options);
            } else {
                return featureToThree(feature, options);
            }
        };
    },
};
