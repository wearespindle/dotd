'use strict'

var pathsCollection

function Events(socket) {

    pathsCollection = app.db.getCollection('paths')
    // A client adds a path.
    socket.on('object:added', function(msg) {
        var pathObj = JSON.parse(msg)
        if(pathObj.type === 'group' && 'objects' in pathObj) {
            pathObj.__objects = pathObj.objects
            delete pathObj.fill
        }

        fabric.util.enlivenObjects([pathObj], function(_objects) {
            _objects.forEach(function(fabricObj) {
                //delete fabricObj.fill
                console.info('Adding %s with UUID: %s', pathObj.type, pathObj.uuid)
                app.canvas.add(fabricObj)
                pathsCollection.insert(pathObj)
                socket.broadcast.emit('object:added', pathObj)
            })
        })
    })


    socket.on('object:modified', function(msg) {
        var rawObject = JSON.parse(msg)
        var fabricObject = app.canvas.getObjectByUUID(rawObject.uuid)

        if(fabricObject) {
            console.info('%s has modifications: %s', fabricObject.type, fabricObject.uuid)
            if(fabricObject.type === 'group') {
                // Somehow this is set to black during group serialization...
                delete rawObject.fill
            }
            fabricObject.set(rawObject)
            var dbPath = pathsCollection.findOne({uuid: fabricObject.uuid})
            if(dbPath) {
                // Update all the properties of the fabric object.
                Object.keys(rawObject).forEach(function(key) {
                    dbPath[key] = rawObject[key]
                })
                pathsCollection.update(dbPath)
            } else {
                console.warn('No object found in scene:', rawObject.uuid)
            }
        } else {
            console.warn('No object found in scene:', rawObject.uuid)
        }

        socket.broadcast.emit('object:modified', rawObject)
    })


    socket.on('object:removed', function(msg) {
        var rawObject = JSON.parse(msg)

        var fabricObj = app.canvas.getObjectByUUID(rawObject.uuid)
        if(fabricObj) {
            console.info('Removing %s with UUID: %s', rawObject.type, rawObject.uuid)
            app.canvas.remove(fabricObj)
            var dbPath = pathsCollection.findOne({uuid: rawObject.uuid})
            if(dbPath) {
                pathsCollection.remove(dbPath)
                socket.broadcast.emit('object:removed', rawObject)
            } else {
                console.warn('No object found in scene:', rawObject.uuid)
            }
        }
    })


    socket.on('app.canvas:clear', function() {
        console.info('Clearing app.canvas for today...')
        app.canvas.clear()
        socket.broadcast.emit('app.canvas:clear')
        var dbPaths = getFabricObjects()
        pathsCollection.remove(dbPaths)
    })

    socket.on('app.canvas:bringForward', function(uuid) {
        var fabricObj = app.canvas.getObjectByUUID(uuid)
        app.canvas.bringForward(fabricObj)
        socket.broadcast.emit('app.canvas:bringForward', uuid)

        // TODO: Make this less insane
        // This is ugly, but I don't know the proper way to update items' array
        // index seperatly with lokijs. The db version should just
        // reflect the same object order:
        // https://github.com/kangax/fabric.js/blob/0715f15f288bc3b29b3f97d11f049441cc692a00/src/static_app.canvas.class.js#L1421)
        var dbPaths = getFabricObjects()
        pathsCollection.remove(dbPaths)
        app.canvas.getObjects().forEach(function(fabricObject) {
            pathsCollection.insert(JSON.parse(JSON.stringify(fabricObject)))
        })
    })

    socket.on('app.canvas:sendBackwards', function(uuid) {
        var fabricObj = app.canvas.getObjectByUUID(uuid)
        app.canvas.sendBackwards(fabricObj)
        socket.broadcast.emit('app.canvas:sendBackwards', uuid)

        // TODO: Make this less insane (see comment in app.canvas:bringForward).
        var dbPaths = getFabricObjects()
        pathsCollection.remove(dbPaths)
        app.canvas.getObjects().forEach(function(fabricObject) {
            pathsCollection.insert(JSON.parse(JSON.stringify(fabricObject)))
        })
    })
}

module.exports = Events
