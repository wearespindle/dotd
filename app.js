'use strict'

var app = require('express')()
var compression = require('compression')
var exphbs = require('express-handlebars')
var express = require('express')
var favicon = require('serve-favicon')
var Io = require('socket.io')
var http = require('http')
var loki = require('lokijs')
var moment = require('moment')

var common = require('./lib/common.js')

var server = http.Server(app)
var settings = require('./settings.json')
var io = Io(server)

var canvas, pathsCollection


/**
 * Return the objects in the right order, this is important because
 * fabricjs uses the array order to figure out zindex.
 */
function getFabricObjects() {
    return pathsCollection.find({day: parseInt(moment().format('e'), 10)}).reverse()
}


/**
 *  Rebuild the canvas from Loki.
 */
function getCanvas() {
    var _canvas = fabric.createCanvasForNode(1920, 1080)
    var fabricObjects = getFabricObjects()

    if(fabricObjects) {
        fabricObjects.forEach(function(obj) {
            // Revive the objects property for a group.
            if(obj.type === 'group') {
                obj.objects = obj.__objects
            }
        })
    }
    fabric.util.enlivenObjects(fabricObjects, function(objects) {
        objects.forEach(function(o) {
            // Please note that a deserialize custom brush(stroke property) is
            // an anonymous function coming from the client. Potential recipe
            // for security issues(!).
            _canvas.add(o)
        })
    })
    return _canvas
}

// Reload the page when the next day occurs.
setInterval(function() {
    var currentDay = parseInt(moment().format('e'), 10)
    if(currentDay !== app.dayOftheWeek) {
        canvas = getCanvas()
    }
}, 3000)


io.on('connection', function(socket) {
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
                canvas.add(fabricObj)
                pathsCollection.insert(pathObj)
                socket.broadcast.emit('object:added', pathObj)
            })
        })
    })


    socket.on('object:modified', function(msg) {
        var rawObject = JSON.parse(msg)
        var fabricObject = canvas.getObjectByUUID(rawObject.uuid)

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

        var fabricObj = canvas.getObjectByUUID(rawObject.uuid)
        if(fabricObj) {
            console.info('Removing %s with UUID: %s', rawObject.type, rawObject.uuid)
            canvas.remove(fabricObj)
            var dbPath = pathsCollection.findOne({uuid: rawObject.uuid})
            if(dbPath) {
                pathsCollection.remove(dbPath)
                socket.broadcast.emit('object:removed', rawObject)
            } else {
                console.warn('No object found in scene:', rawObject.uuid)
            }
        }
    })


    socket.on('canvas:clear', function() {
        console.info('Clearing canvas for today...')
        canvas.clear()
        socket.broadcast.emit('canvas:clear')
        var dbPaths = getFabricObjects()
        pathsCollection.remove(dbPaths)
    })

    socket.on('canvas:bringForward', function(uuid) {
        var fabricObj = canvas.getObjectByUUID(uuid)
        canvas.bringForward(fabricObj)
        socket.broadcast.emit('canvas:bringForward', uuid)

        // TODO: Make this less insane
        // This is ugly, but I don't know the proper way to update items' array
        // index seperatly with lokijs. The db version should just
        // reflect the same object order:
        // https://github.com/kangax/fabric.js/blob/0715f15f288bc3b29b3f97d11f049441cc692a00/src/static_canvas.class.js#L1421)
        var dbPaths = getFabricObjects()
        pathsCollection.remove(dbPaths)
        canvas.getObjects().forEach(function(fabricObject) {
            pathsCollection.insert(JSON.parse(JSON.stringify(fabricObject)))
        })
    })

    socket.on('canvas:sendBackwards', function(uuid) {
        var fabricObj = canvas.getObjectByUUID(uuid)
        canvas.sendBackwards(fabricObj)
        socket.broadcast.emit('canvas:sendBackwards', uuid)

        // TODO: Make this less insane (see comment in canvas:bringForward).
        var dbPaths = getFabricObjects()
        pathsCollection.remove(dbPaths)
        canvas.getObjects().forEach(function(fabricObject) {
            pathsCollection.insert(JSON.parse(JSON.stringify(fabricObject)))
        })
    })
})

app.use(express.static('public'))
app.use(favicon(__dirname + '/public/dolphin.png'))
app.use(compression())


app.get('/', function(req, res) {
    var serializedCanvas = JSON.parse(JSON.stringify(canvas))
    serializedCanvas.objects.forEach(function(rawObject, i) {
        if(rawObject.type === 'group') {
            // Somehow this is set to black during group serialization...
            delete serializedCanvas.objects[i].fill
        }
    })

    res.render('home', {canvasState: JSON.stringify(serializedCanvas)})
})


/**
 * Present the droodle data as a javascript file that can be
 * retrieved as GZIP script.
 */
app.get('/state.js', function(req, res) {
    var serializedCanvas = JSON.parse(JSON.stringify(canvas))
    serializedCanvas.objects.forEach(function(obj, i) {
        if(obj.type === 'group') {
            // Somehow this is set to black during group serialization...
            delete serializedCanvas.objects[i].fill
            delete serializedCanvas.objects[i].stroke
        }
    })

    res.send('window.initialState = ' + JSON.stringify(serializedCanvas) + ';')
})


/**
 * Retrieve the current DOTD droodle as a png.
 */
app.get('/dotd.png', function(req, res) {
    res.writeHead(200, { 'Content-Type': 'image/png' })
    var stream = canvas.createPNGStream()
    stream.on('data', function(chunk) {
        res.write(chunk)
    });
    stream.on('end', function() {
        res.end()
    });
})


server.listen(settings.port, function() {
    moment.locale(settings.language)
    app.engine('handlebars', exphbs({defaultLayout: 'main'}))
    app.set('view engine', 'handlebars')
    app.dayOftheWeek = parseInt(moment().format('e'), 10)
    app.fabric = require('fabric').fabric
    GLOBAL.fabric = app.fabric

    common.init(app)

    app.db = new loki('db.json', {
        autosave: true,
        autosaveInterval: 3000,
        autoload: true,
        autoloadCallback: function() {
            // if database did not exist it will be empty so I will intitialize here
            pathsCollection = app.db.getCollection('paths')
            if (!pathsCollection) {
                pathsCollection = app.db.addCollection('paths', {indices: ['uuid']})
                //pathsCollection.ensureUniqueIndex('uuid')
            }

            canvas = getCanvas()
        },
        env: 'NODEJS',
    })
})
