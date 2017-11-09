/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */

import Provider from './Provider';
import TileGeometry from '../../TileGeometry';
import TileMesh from '../../TileMesh';
import CancelledCommandException from '../CancelledCommandException';
import { requestNewTile } from '../../../Process/TiledNodeProcessing';

function TileProvider() {
    Provider.call(this, null);
    this.cacheGeometry = [];
}

TileProvider.prototype = Object.create(Provider.prototype);

TileProvider.prototype.constructor = TileProvider;

TileProvider.prototype.preprocessDataLayer = function preprocessLayer(layer, view, scheduler) {
    if (!layer.schemeTile) {
        throw new Error(`Cannot init tiled layer without schemeTile for layer ${layer.id}`);
    }

    layer.level0Nodes = [];
    layer.onTileCreated = layer.onTileCreated || (() => {});

    const promises = [];

    for (const root of layer.schemeTile) {
        promises.push(requestNewTile(view, scheduler, layer, root, undefined, 0));
    }
    return Promise.all(promises).then((level0s) => {
        layer.level0Nodes = level0s;
        for (const level0 of level0s) {
            layer.object3d.add(level0);
            level0.updateMatrixWorld();
        }
    });
};

function defer() {
    const deferedPromise = {};
    deferedPromise.promise = new Promise((resolve, reject) => {
        deferedPromise.resolve = resolve;
        deferedPromise.reject = reject;
    });
    return deferedPromise;
}

TileProvider.prototype.executeCommand = function executeCommand(command) {
    const extent = command.extent;
    if (command.requester &&
        !command.requester.material) {
        // request has been deleted
        return Promise.reject(new CancelledCommandException(command));
    }

    const parent = command.requester;
    const level = (command.level === undefined) ? (parent.level + 1) : command.level;

    if (!this.cacheGeometry[level]) {
        this.cacheGeometry[level] = [];
    }

    const ce = command.layer.getCommonGeometryExtent(extent);

    if (!this.cacheGeometry[level][ce.west()]) {
        this.cacheGeometry[level][ce.west()] = [];
    }

    // build geometry if doesn't exist
    if (!this.cacheGeometry[level][ce.west()][ce.south()]) {
        this.cacheGeometry[level][ce.west()][ce.south()] = defer();
        const paramsGeometry = {
            extent: ce,
            level,
            segment: 16,
            disableSkirt: command.layer.disableSkirt,
        };
        this.cacheGeometry[level][ce.west()][ce.south()].resolve(new TileGeometry(paramsGeometry, command.layer.builder));
    }

    // get geometry from cache
    return this.cacheGeometry[level][ce.west()][ce.south()].promise.then((geometry) => {
        // build tile
        var params = {
            layerId: command.layer.id,
            extent,
            level,
            materialOptions: command.layer.materialOptions,
        };

        command.layer.builder.Center(params);
        var tile = new TileMesh(geometry, params);
        tile.layer = command.layer.id;
        tile.layers.set(command.threejsLayer);

        if (parent) {
            parent.worldToLocal(params.center);
        }
        tile.position.copy(params.center);

        if (command.layer.getQuaternionTile) {
            tile.quaternion.copy(command.layer.getQuaternionTile(tile, parent));
            if (parent) {
                tile.quaternion.premultiply(parent.invWorldQuaternion);
            }
        }

        tile.material.transparent = command.layer.opacity < 1.0;
        tile.material.uniforms.opacity.value = command.layer.opacity;
        tile.setVisibility(false);
        tile.updateMatrix();
        if (parent) {
            tile.setBBoxZ(parent.OBB().z.min, parent.OBB().z.max);
        } else if (command.layer.materialOptions && command.layer.materialOptions.useColorTextureElevation) {
            tile.setBBoxZ(command.layer.materialOptions.colorTextureElevationMinZ, command.layer.materialOptions.colorTextureElevationMaxZ);
        }

        return Promise.resolve(tile);
    });
};

export default TileProvider;
