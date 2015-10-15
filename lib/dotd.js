'use strict'

moment.locale('nl')

var $ = function(id) {return document.getElementById(id)}

var canvas
var common = require('./common.js')
var objectModified
var socket

var Dotd = function() {
    var _this = this
    socket = io()

    socket.on('connect', function() {
        canvas = new fabric.Canvas('c', {isDrawingMode: true})
        // For debugging.
        window._canvas = canvas
        // Load initial state from the server.
        if(_this.loaded) {
            // For now just reload the page. May be possible to reinject
            // state.js and update state in place.
            location.reload()
        } else {
            canvas.loadFromJSON(initialState)
            canvas.renderAll()

            _this.initUI()
            _this.initEvents()
            _this.loaded = true
        }
    })
}

window.app = {
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


/**
 * Sets the fill color in the UI and prepares the brush.
 * Changes fill of a selected object. Expect a hex color
 * for now.
 */
Dotd.prototype.setFillColor = function(color) {
    if(!color) color = '#000000'
    canvas.freeDrawingBrush.color = color
    $('fill-color').value = color
    localStorage.setItem('fillColor', color)
    var fabricObject = canvas.getActiveObject()
    // Changing color while object selected, changes the fill of that object.
    if(fabricObject) {
        if(fabricObject.type === 'group') {
            var newColor = new fabric.Color(color)
            fabricObject._objects.forEach(function(groupObject) {
                var currentColor = new fabric.Color(groupObject.fill)
                // Keep opacity intact.
                newColor._source[3] = currentColor._source[3]
                groupObject.set({fill: newColor.toRgba()})
            })

        } else {
            fabricObject.set({ fill: color})
        }

        canvas.renderAll()
        // Trigger an object update.
        objectModified({target: fabricObject})
    }
}


Dotd.prototype.setStrokeColor = function(color) {
    if(!color) color = '#000000'
    $('stroke-color').value = color
    localStorage.setItem('strokeColor', color)
    var fabricObject = canvas.getActiveObject()
    // Changing color while object selected, changes the fill of that object.
    if(fabricObject) {
        fabricObject.set({ stroke: color})
        canvas.renderAll()
        // Trigger an object update.
        objectModified({target: fabricObject})
    }
}


Dotd.prototype.initUI = function() {
    var _this = this

    this.setBrushWidth(localStorage.getItem('brushWidth'))
    this.setFillColor(localStorage.getItem('fillColor'))
    this.setStrokeColor(localStorage.getItem('strokeColor'))

    fabric.Object.prototype.transparentCorners = false

    var drawingModeEl = $('drawing-mode')
    var insertTextEl = $('insert-text')
    var drawingOptionsEl = $('drawing-mode-options')
    var editOptionsEl = $('edit-mode-options')
    var fillColorEl = $('fill-color')
    var strokeColorEl = $('stroke-color')
    var drawingLineWidthEl = $('drawing-line-width')

    var dolphinDayEl = document.querySelector('#dolphin-day-container span')

    dolphinDayEl.innerHTML = moment().format('dddd' + '</span></div>')

    drawingModeEl.onclick = function() {
        canvas.isDrawingMode = !canvas.isDrawingMode;
        if (canvas.isDrawingMode) {
            drawingModeEl.innerHTML = 'Edit scene'
            drawingOptionsEl.style.display = 'block'
            editOptionsEl.style.display = 'none'
        } else {
            drawingModeEl.innerHTML = 'Draw mode'
            drawingOptionsEl.style.display = 'none'
            editOptionsEl.style.display = 'block'
        }
    }

    insertTextEl.onclick = function() {
        var textObject = new fabric.IText('Edit me...', {
            fontFamily: 'arial black',
            left: Math.random() * 1000,
            top: Math.random() * 500,
            fill: localStorage.getItem('fillColor') || '#00000',
        })

        canvas.add(textObject)
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
            canvas.freeDrawingBrush.color = strokeColorEl.value
            canvas.freeDrawingBrush.width = parseInt(drawingLineWidthEl.value, 10) || 1
        } else {
            console.warn('Invalid brush! ', this.value)
        }
    }

    fillColorEl.onchange = function() {_this.setFillColor(this.value)}
    strokeColorEl.onchange = function() {_this.setStrokeColor(this.value)}
    drawingLineWidthEl.onchange = function() {_this.setBrushWidth(this.value)}

    if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = fillColorEl.value
        canvas.freeDrawingBrush.width = parseInt(drawingLineWidthEl.value, 10) || 1
        canvas.freeDrawingBrush.shadowBlur = 0
    }
}


Dotd.prototype.initEvents = function() {
    var _this = this
    var clearEl = $('clear-canvas')

    clearEl.onclick = function() {
        canvas.clear()
        socket.emit('canvas:clear', {})
    }

    // objectModified event may be used by other similar events like
    // 'text:changed'.
    objectModified = function(e) {
        var fabricObject = e.target
        socket.emit('object:modified', JSON.stringify(fabricObject))
    }

    canvas.on('object:modified', objectModified)
    canvas.on('text:changed', objectModified)

    // Change current colors to the selected object's.
    canvas.on('object:selected', function(e) {
        var fabricObject = e.target
        if(fabricObject.stroke) {
            _this.setStrokeColor(fabricObject.stroke)
        }
        if(fabricObject.fill) {
            if(fabricObject.type !== 'group') {
                _this.setFillColor(e.target.fill)
            } else {
                // Doesn't handle transparency, but ok for now.
                var color = new fabric.Color(e.target._objects[0].fill)
                _this.setFillColor('#' + color.toHex())
            }
        }
    })

    socket.on('object:modified', function(rawObject) {
        // TODO: This can probably be fixed in fabricjs' toObject.
        // Serialization issue. Remove group fill.
        if(rawObject.type === 'group') {
            delete rawObject.fill
            delete rawObject.stroke
        }

        var fabricObject = canvas.getObjectByUUID(rawObject.uuid)
        if(fabricObject) {
            // Update all the properties of the fabric object.
            fabricObject.set(rawObject)
            canvas.renderAll()
        } else {
            console.warn('No object found in scene:', rawObject.uuid)
        }
    })


    canvas.on('object:added', function(e) {
        var fabricObject = e.target
        if(!fabricObject.remote) {
            socket.emit('object:added', JSON.stringify(fabricObject))
        }
        delete fabricObject.remote
    })

    // Update canvas when other clients made changes.
    socket.on('object:added', function(rawObject) {
        // Revive group objects.
        if(rawObject.type === 'group') {
            rawObject.objects = rawObject.__objects
            delete rawObject.fill
        }
        fabric.util.enlivenObjects([rawObject], function(fabricObjects) {
            fabricObjects.forEach(function(fabricObject) {
                // Prevent infinite loop, because this triggers canvas`
                // object:added, which in turn calls this function.
                fabricObject.remote = true
                canvas.add(fabricObject)
            })
        })
    })


    canvas.on('object:removed', function(e) {
        var fabricObject = e.target
        socket.emit('object:removed', JSON.stringify(fabricObject))
    })

    socket.on('object:removed', function(rawObject) {
        var fabricObject = canvas.getObjectByUUID(rawObject.uuid)
        if(fabricObject) {
            canvas.remove(fabricObject)
        } else {
            console.warn('No object found in scene:', rawObject.uuid)
        }
    })


    socket.on('canvas:clear', function() {
        canvas.clear()
    })

    socket.on('canvas:bringForward', function(uuid) {
        var fabricObject = canvas.getObjectByUUID(uuid)
        canvas.bringForward(fabricObject)
    })

    socket.on('canvas:sendBackwards', function(uuid) {
        var fabricObject = canvas.getObjectByUUID(uuid)
        canvas.sendBackwards(fabricObject)
    })

    // Handle keyboard events
    window.onkeyup = function(e) {
        var key = e.keyCode ? e.keyCode : e.which;
        var fabricObject = canvas.getActiveObject()
        if(!fabricObject) return null

        if (key === 46) {
            // `Delete` key removes a selected object.
            canvas.remove(fabricObject)
        } else if (key === 33) {
            // 'Page Up' adjusts z-index of selected object.
            canvas.bringForward(fabricObject)
            socket.emit('canvas:bringForward', fabricObject.uuid)
        } else if (key === 34) {
            // 'Page Down adjusts z-index of selected object.
            canvas.sendBackwards(fabricObject)
            socket.emit('canvas:sendBackwards', fabricObject.uuid)
        }

        e.preventDefault()
        return false
    }
}


document.addEventListener('DOMContentLoaded', function(event) {
    app.init()
})
