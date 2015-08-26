'use strict'

var app = require('express')()
var compression = require('compression')
var exphbs = require('express-handlebars')
var express = require('express')
var Io = require('socket.io')
var http = require('http')
var loki = require('lokijs')
var moment = require('moment')

var common = require('./lib/common.js')

var server = http.Server(app)
var settings = require('./settings.json')
var io = Io(server)

var canvas, pathsCollection


function getFabricObjects() {
    return app.db.getCollection('paths').find({day: parseInt(moment().format('e'), 10)})
}


/**
 *  Rebuild the canvas from Loki.
 */
function getCanvas() {
    var _canvas = fabric.createCanvasForNode(1900, 1080)
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
            // for security issues.
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
        var pathObj = JSON.parse(msg)

        var fabricObj = canvas.getObjectByUUID(pathObj.uuid)
        if(fabricObj) {
            fabricObj.set(pathObj)
            var dbPath = pathsCollection.findOne({uuid: pathObj.uuid})
            if(dbPath) {
                // Update all the properties of the fabric object.
                Object.keys(pathObj).forEach(function(key) {
                    dbPath[key] = pathObj[key]
                })
                pathsCollection.update(dbPath)
            } else {
                console.warn('No object found in scene:', pathObj.uuid)
            }
        } else {
            console.warn('No object found in scene:', pathObj.uuid)
        }

        socket.broadcast.emit('object:modified', pathObj)
    })


    socket.on('object:removed', function(msg) {
        var pathObj = JSON.parse(msg)

        var fabricObj = canvas.getObjectByUUID(pathObj.uuid)
        if(fabricObj) {
            console.info('Removing %s with UUID: %s', pathObj.type, pathObj.uuid)
            canvas.remove(fabricObj)
            var dbPath = pathsCollection.findOne({uuid: pathObj.uuid})
            if(dbPath) {
                pathsCollection.remove(dbPath)
                socket.broadcast.emit('object:removed', pathObj)
            } else {
                console.warn('No object found in scene:', pathObj.uuid)
            }
        }
    })


    socket.on('canvas:clear', function() {
        console.info('Clearing canvas for today...')
        var dbPaths = getFabricObjects()
        pathsCollection.remove(dbPaths)
        canvas.clear()
        socket.broadcast.emit('canvas:clear')
    })
})

app.use(express.static('public'))
app.use(compression())


app.get('/', function(req, res) {
    var serializedCanvas = JSON.parse(JSON.stringify(canvas))
    serializedCanvas.objects.forEach(function(obj, i) {
        if(obj.type === 'group') {
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
                pathsCollection.ensureUniqueIndex('uuid')
            }

            canvas = getCanvas()
        },
        env: 'NODEJS',
    })
})
