var express = require('express');
var app = require('express')()
var fabric = require('fabric').fabric
var canvas = fabric.createCanvasForNode(1280, 800)
var http = require('http').Server(app)
var io = require('socket.io')(http)
var exphbs  = require('express-handlebars')
var loki = require('lokijs')
var moment = require('moment')

var postcard, postcardCollection

app.engine('handlebars', exphbs({defaultLayout: 'main'}))
app.set('view engine', 'handlebars')


io.on('connection', function(socket){

    socket.on('disconnect', function() {
        console.log('user disconnected')
    })

    // A client adds a path.
    socket.on('path:created', function(obj) {
        var cardOftheDay =
        moment().format('e')
        fabric.util.enlivenObjects([JSON.parse(obj)], function(objects) {
            objects.forEach(function(o) {
                canvas.add(o)
                // Notify other clients.
                socket.broadcast.emit('path:created', obj)
            })
        })

    })

})

app.use(express.static('public'))

app.get('/', function(req, res) {
    res.render('home', {canvasState: JSON.stringify(canvas)})
})


http.listen(3000, function() {
    console.log('listening on *:3000')

    app.db = new loki('db.json', {
        autoload: true,
        autosave: true,
        autoloadCallback : function() {
            // if database did not exist it will be empty so I will intitialize here
            postcardCollection = app.db.getCollection('postcards')
            if (postcardCollection === null) {
                postcardCollection = app.db.addCollection('postcards')
                postcardCollection.insert({id: moment().format('e')})
            }
            postcard = postcardCollection.find({id: moment().format('e')})
        },
        env: 'NODEJS'
    })

})
