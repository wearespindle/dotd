'use strict'

moment.locale('nl')

var $ = function(id) {return document.getElementById(id)}

var canvas
var common = require('./common.js')
var socket

var Dotd = function() {
    var _this = this
    socket = io()

    socket.on('connect', function() {
        canvas = new fabric.Canvas('c', {isDrawingMode: true})
        // For debugging.
        window._canvas = canvas
        // Load initial state passed by the server.
        canvas.loadFromJSON(initialState)
        canvas.renderAll()
        _this.initUI()
        _this.initEvents()
    })
}

var app = {
    brushes: {},
    dayOftheWeek: parseInt(moment().format('e'), 10),
    init: function() {
        var _this = this
        console.info('Init Dotd board...')
        this.dotd = new Dotd()
        common.init(_this)

        // Reload the page when the next day occurs.
        setInterval(function() {
            var currentDay = parseInt(moment().format('e'), 10)
            if(currentDay !== _this.dayOftheWeek) {
                location.reload()
            }
        }, 3000)
    },
    fabric: fabric,
}


Dotd.prototype.setBrushWidth = function(width) {
    width = parseInt(width, 10) || 1
    console.log('Setting brush size to', width)
    canvas.freeDrawingBrush.width = width
    $('drawing-line-width-info').innerHTML = width
    $('drawing-line-width').value = width
    localStorage.setItem('brushWidth', width)
}


Dotd.prototype.setBrushColor = function(color) {
    if(!color) color = '#000000'
    canvas.freeDrawingBrush.color = color
    $('drawing-color').value = color
    localStorage.setItem('brushColor', color)
}


Dotd.prototype.initUI = function() {
    var _this = this

    this.setBrushWidth(localStorage.getItem('brushWidth'))
    this.setBrushColor(localStorage.getItem('brushColor'))

    fabric.Object.prototype.transparentCorners = false

    var drawingModeEl = $('drawing-mode')
    var drawingOptionsEl = $('drawing-mode-options')
    var editOptionsEl = $('edit-mode-options')
    var drawingColorEl = $('drawing-color')
    var drawingLineWidthEl = $('drawing-line-width')

    var dolphinDayEl = $('dolphin-day')

    dolphinDayEl.innerHTML = '<div id="dolphin-day-container"><img src="/dolphin.png" /><span>' + moment().format('dddd' + '</span></div>')

    drawingModeEl.onclick = function() {
        canvas.isDrawingMode = !canvas.isDrawingMode;
        if (canvas.isDrawingMode) {
            drawingModeEl.innerHTML = 'Edit scene'
            drawingOptionsEl.style.display = 'block'
            editOptionsEl.style.display = 'none'
        } else {
            drawingModeEl.innerHTML = 'Let\'s droodle'
            drawingOptionsEl.style.display = 'none'
            editOptionsEl.style.display = 'block'
        }
    }

    if(fabric.PatternBrush) {
        app.brushes.vline = new fabric.PatternBrush(canvas)
        app.brushes.vline.getPatternSrc = function() {
            var patternCanvas = fabric.document.createElement('canvas')
            patternCanvas.width = patternCanvas.height = 10
            var ctx = patternCanvas.getContext('2d')

            ctx.strokeStyle = this.color
            ctx.lineWidth = 5
            ctx.beginPath()
            ctx.moveTo(0, 5)
            ctx.lineTo(10, 5)
            ctx.closePath()
            ctx.stroke()

            return patternCanvas
        }

        app.brushes.hline = new fabric.PatternBrush(canvas)
        app.brushes.hline.getPatternSrc = function() {
            var patternCanvas = fabric.document.createElement('canvas')
            patternCanvas.width = patternCanvas.height = 10
            var ctx = patternCanvas.getContext('2d')

            ctx.strokeStyle = this.color
            ctx.lineWidth = 5
            ctx.beginPath()
            ctx.moveTo(5, 0)
            ctx.lineTo(5, 10)
            ctx.closePath()
            ctx.stroke()

            return patternCanvas
        }

        app.brushes.square = new fabric.PatternBrush(canvas)
        app.brushes.square.getPatternSrc = function() {
            var squareWidth = 10
            var squareDistance = 2

            var patternCanvas = fabric.document.createElement('canvas')
            patternCanvas.width = patternCanvas.height = squareWidth + squareDistance
            var ctx = patternCanvas.getContext('2d')
            ctx.fillStyle = this.color
            ctx.fillRect(0, 0, squareWidth, squareWidth)
            return patternCanvas
        }

        app.brushes.diamond = new fabric.PatternBrush(canvas)
        app.brushes.diamond.getPatternSrc = function() {
            var squareWidth = 10, squareDistance = 5
            var patternCanvas = fabric.document.createElement('canvas')
            var rect = new fabric.Rect({
                width: squareWidth,
                height: squareWidth,
                angle: 45,
                fill: this.color,
            })

            var canvasWidth = rect.getBoundingRectWidth()

            patternCanvas.width = patternCanvas.height = canvasWidth + squareDistance
            rect.set({ left: canvasWidth / 2, top: canvasWidth / 2 })

            var ctx = patternCanvas.getContext('2d')
            rect.render(ctx)

            return patternCanvas
        }
        app.brushes.pencil = new fabric.PencilBrush(canvas)
        app.brushes.spray = new fabric.SprayBrush(canvas)
        app.brushes.circle = new fabric.CircleBrush(canvas)
    }

    $('drawing-mode-selector').onchange = function() {
        if(this.value in app.brushes) {
            canvas.currentBrush = this.value
            console.info('Switching brush to', canvas.currentBrush)
            canvas.freeDrawingBrush = app.brushes[this.value]
            canvas.freeDrawingBrush.color = drawingColorEl.value
            canvas.freeDrawingBrush.width = parseInt(drawingLineWidthEl.value, 10) || 1
        } else {
            console.warn('Invalid brush! ', this.value)
        }
    }

    drawingColorEl.onchange = function() {
        _this.setBrushColor(this.value)
    }

    drawingLineWidthEl.onchange = function() {
        _this.setBrushWidth(this.value)
    }

    if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = drawingColorEl.value
        canvas.freeDrawingBrush.width = parseInt(drawingLineWidthEl.value, 10) || 1
        canvas.freeDrawingBrush.shadowBlur = 0
    }
}


Dotd.prototype.initEvents = function() {
    var clearEl = $('clear-canvas')

    clearEl.onclick = function() {
        canvas.clear()
        socket.emit('canvas:clear', {})
    }

    canvas.on('object:modified', function(e) {
        var pathObj = e.target
        socket.emit('object:modified', JSON.stringify(pathObj))
    })

    socket.on('object:modified', function(pathObj) {
        // Serialization issue. Remove group fill.
        if(pathObj.type === 'group') {
            delete pathObj.fill
        }

        var fabricObj = canvas.getObjectByUUID(pathObj.uuid)
        if(fabricObj) {
            // Update all the properties of the fabric object.
            delete pathObj.stroke
            fabricObj.set(pathObj)
            canvas.renderAll()
        } else {
            console.warn('No object found in scene:', pathObj.uuid)
        }
    })


    canvas.on('object:added', function(e) {
        window._stroke = e.target.stroke
        window._target = e.target

        if(!e.target.remote) {
            socket.emit('object:added', JSON.stringify(e.target))
        }
        delete e.target.remote
    })

    // Update canvas when other clients made changes.
    socket.on('object:added', function(obj) {
        // Revive group objects.
        if(obj.type === 'group') {
            obj.objects = obj.__objects
            delete obj.fill
        }
        fabric.util.enlivenObjects([obj], function(objects) {
            objects.forEach(function(o) {
                // Prevent infinite loop, because this triggers canvas`
                // object:added, which in turn calls this function.
                o.remote = true
                canvas.add(o)
            })
        })
    })


    canvas.on('object:removed', function(e) {
        socket.emit('object:removed', JSON.stringify(e.target))
    })

    socket.on('object:removed', function(pathObj) {
        var fabricObj = canvas.getObjectByUUID(pathObj.uuid)
        if(fabricObj) {
            canvas.remove(fabricObj)
        } else {
            console.warn('No object found in scene:', pathObj.uuid)
        }
    })


    socket.on('canvas:clear', function() {
        canvas.clear()
    })

    // Handle keyboard events
    window.onkeyup = function(e) {
        var key = e.keyCode ? e.keyCode : e.which;
        var activeObject = canvas.getActiveObject()
        if(!activeObject) {
            return null
        }

        if (key === 46) {
            // `Delete` key removes a selected object.
            canvas.remove(canvas.getActiveObject())
        } else if (key === 33) {
            // 'Page Up' adjusts z-index.
            canvas.bringForward(activeObject)
        } else if (key === 34) {
            // 'Page Down adjusts z-index.
            canvas.sendBackwards(activeObject)
        }

        e.preventDefault()
        return false
    }
}


document.addEventListener('DOMContentLoaded', function(event) {
    app.init()
})
