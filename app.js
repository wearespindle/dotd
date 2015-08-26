var express = require('express');
var app = require('express')()
var fabric = require('fabric').fabric
var http = require('http').Server(app)
var io = require('socket.io')(http)
var exphbs = require('express-handlebars')
var loki = require('lokijs')
var moment = require('moment')

var canvas, pathsCollection
var dayOftheWeek = parseInt(moment().format('e'))

app.engine('handlebars', exphbs({defaultLayout: 'main'}))
app.set('view engine', 'handlebars')


function getOrCreateDayPaths() {
    return app.db.getCollection('paths').find({day: parseInt(moment().format('e'))})
}


function getCanvas() {
    var canvas = fabric.createCanvasForNode(1280, 800)
    fabric.util.enlivenObjects(getOrCreateDayPaths(), function(objects) {
        objects.forEach(function(o) {
            canvas.add(o)
        })
    })
    return canvas
}

// Reload the page when the next day occurs.
setInterval(function() {
    var currentDay = parseInt(moment().format('e'))
    if(currentDay !== dayOftheWeek) {
        canvas = getCanvas()
    }
}, 3000)


function uuid() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    });
}

fabric.Object.prototype.setOptions = (function (setOptions) {
    return function (options) {
        setOptions.apply(this, [options])
        this.uuid = this.uuid || uuid()
        this.day = dayOftheWeek
    }
})(fabric.Object.prototype.setOptions)

fabric.Object.prototype.toObject = (function (toObject) {
    return function (propertiesToInclude) {
        propertiesToInclude = (propertiesToInclude || []).concat(['uuid', 'day'])
        return toObject.apply(this, [propertiesToInclude])
    };
})(fabric.Object.prototype.toObject)


/**
 * Item name is unique
 */
fabric.Canvas.prototype.getObjectByUUID = function(uuid) {
    var object = null
    var objects = this.getObjects()

    for (var i = 0, len = this.size(); i < len; i++) {
        if (objects[i].uuid && objects[i].uuid === uuid) {
            object = objects[i]
            break
        }
    }

    return object
}


io.on('connection', function(socket){

    socket.on('disconnect', function() {

    })


    // A client adds a path.
    socket.on('object:added', function(msg) {
        var pathObj = JSON.parse(msg)

        fabric.util.enlivenObjects([pathObj], function(objects) {
            objects.forEach(function(fabricObj) {
                // Notify other clients.
                console.log(fabricObj)
                canvas.add(fabricObj)
                console.info('Inserting object with UUID:', pathObj.uuid)
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
            console.info('Removing object with UUID:', pathObj.uuid)
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
        var dbPaths = getOrCreateDayPaths()
        pathsCollection.remove(dbPaths)
        canvas.clear()
        socket.broadcast.emit('canvas:clear')
    })

})

app.use(express.static('public'))

app.get('/', function(req, res) {
    res.render('home', {canvasState: JSON.stringify(canvas)})
})


http.listen(3000, function() {

    app.db = new loki('db.json', {
        autosave: true,
        autosaveInterval: 3000,
        autoload: true,
        autoloadCallback : function() {
            // if database did not exist it will be empty so I will intitialize here
            pathsCollection = app.db.getCollection('paths')
            if (!pathsCollection) {
                pathsCollection = app.db.addCollection('paths', {indices: ['uuid']})
                pathsCollection.ensureUniqueIndex('uuid')
            }

            canvas = getCanvas()
        },
        env: 'NODEJS'
    })
})
