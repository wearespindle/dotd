'use strict'

GLOBAL.app = require('express')()
var compression = require('compression')
var exphbs = require('express-handlebars')
var express = require('express')
var favicon = require('serve-favicon')
var Io = require('socket.io')
var http = require('http')
var loki = require('lokijs')
var moment = require('moment')

var common = require('./lib/common')
var Events = require('./lib/events')

var server = http.Server(app)
var settings = require('./settings.json')
var io = Io(server)


/**
 *  Rebuild the canvas from Loki.
 */
function getCanvas() {
    var _canvas = fabric.createCanvasForNode(1920, 1080)
    var collection = app.db.addCollection('paths', {indices: ['uuid']})

    var fabricObjects = collection.find({day: parseInt(moment().format('e'), 10)}).reverse()

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
        app.canvas = getCanvas()
    }
}, 3000)


io.on('connection', function(socket) {new Events(socket)})

app.use(express.static('public'))
app.use(favicon(__dirname + '/public/img/dolphin.png'))
app.use(compression())


app.get('/', function(req, res) {
    var serializedCanvas = JSON.parse(JSON.stringify(app.canvas))
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
app.get('/js/state.js', function(req, res) {
    var serializedCanvas = JSON.parse(JSON.stringify(app.canvas))
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
 * Retrieve the current DOTD droodle as a PNG.
 */
app.get('/dotd.png', function(req, res) {
    res.writeHead(200, { 'Content-Type': 'image/png' })
    var stream = canvas.createPNGStream()
    stream.on('data', function(chunk) {res.write(chunk)})
    stream.on('end', function() {res.end()})
})


/**
 * Retrieve the current DOTD droodle as a SVG.
 */
app.get('/dotd.svg', function(req, res) {
    res.send(canvas.toSVG())
})


/**
 * Retrieve the current DOTD droodle as a serialized Fabric.js canvas.
 */
app.get('/dotd.json', function(req, res) {
    res.send(JSON.parse(JSON.stringify(app.canvas)))
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
            var collection = app.db.getCollection('paths')
            if (!collection) {
                collection = app.db.addCollection('paths', {indices: ['uuid']})
                collection.ensureUniqueIndex('uuid')
            }

            app.canvas = getCanvas()
        },
        env: 'NODEJS',
    })
})
