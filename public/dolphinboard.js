(function() {
    var canvas, socket
    var dayOftheWeek = parseInt(moment().format('e'))

    // Reload the page when the next day occurs.
    setInterval(function() {
        var currentDay = parseInt(moment().format('e'))
        if(currentDay !== dayOftheWeek) {
            location.reload()
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


    var $ = function(id) {
        return document.getElementById(id)
    }

    window.DolphinBoard = function() {
        var _this = this
        socket = io()

        socket.on('connect', function () {
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


    DolphinBoard.prototype.setBrushWidth = function(width) {
        var width = parseInt(width, 10) || 1
        console.log('Setting brush size to', width)
        canvas.freeDrawingBrush.width = width
        $('drawing-line-width-info').innerHTML = width
        $('drawing-line-width').value = width
        localStorage.setItem('brushWidth', width)
    }


    DolphinBoard.prototype.setBrushColor = function(color) {
        if(!color) color = '#5d12b5'
        canvas.freeDrawingBrush.color = color
        $('drawing-color').value = color
        localStorage.setItem('brushColor', color)
    }


    DolphinBoard.prototype.initUI = function() {
        var _this = this

        this.setBrushWidth(localStorage.getItem('brushWidth'))
        this.setBrushColor(localStorage.getItem('brushColor'))

        fabric.Object.prototype.transparentCorners = false

        var drawingModeEl = $('drawing-mode')
        var drawingOptionsEl = $('drawing-mode-options')
        var editOptionsEl = $('edit-mode-options')
        var drawingColorEl = $('drawing-color')
        var drawingLineWidthEl = $('drawing-line-width')

        var cardDayEl = $('card-day')

        cardDayEl.innerHTML = moment().format('dddd')

        drawingModeEl.onclick = function() {
            canvas.isDrawingMode = !canvas.isDrawingMode;
            if (canvas.isDrawingMode) {
                drawingModeEl.innerHTML = 'Edit dolphinword card'
                drawingOptionsEl.style.display = 'block'
                editOptionsEl.style.display = 'none'
            }
            else {
                drawingModeEl.innerHTML = 'Continue droodling'
                drawingOptionsEl.style.display = 'none'
                editOptionsEl.style.display = 'block'
            }
        }

        if (fabric.PatternBrush) {

            var vLinePatternBrush = new fabric.PatternBrush(canvas)

            vLinePatternBrush.getPatternSrc = function() {
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

            var hLinePatternBrush = new fabric.PatternBrush(canvas)

            hLinePatternBrush.getPatternSrc = function() {
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

            var squarePatternBrush = new fabric.PatternBrush(canvas)

            squarePatternBrush.getPatternSrc = function() {
                var squareWidth = 10
                var squareDistance = 2

                var patternCanvas = fabric.document.createElement('canvas')
                patternCanvas.width = patternCanvas.height = squareWidth + squareDistance
                var ctx = patternCanvas.getContext('2d')
                ctx.fillStyle = this.color
                ctx.fillRect(0, 0, squareWidth, squareWidth)
                return patternCanvas
            }

            var diamondPatternBrush = new fabric.PatternBrush(canvas);

            diamondPatternBrush.getPatternSrc = function() {
                var squareWidth = 10, squareDistance = 5
                var patternCanvas = fabric.document.createElement('canvas')
                var rect = new fabric.Rect({
                    width: squareWidth,
                    height: squareWidth,
                    angle: 45,
                    fill: this.color
                })

                var canvasWidth = rect.getBoundingRectWidth()

                patternCanvas.width = patternCanvas.height = canvasWidth + squareDistance
                rect.set({ left: canvasWidth / 2, top: canvasWidth / 2 })

                var ctx = patternCanvas.getContext('2d')
                rect.render(ctx)

                return patternCanvas
            }

        }

        $('drawing-mode-selector').onchange = function() {

            if (this.value === 'hline') {
                canvas.freeDrawingBrush = vLinePatternBrush
            } else if (this.value === 'vline') {
                canvas.freeDrawingBrush = hLinePatternBrush
            } else if (this.value === 'square') {
                canvas.freeDrawingBrush = squarePatternBrush
            } else if (this.value === 'diamond') {
                canvas.freeDrawingBrush = diamondPatternBrush
            } else if (this.value === 'texture') {
                canvas.freeDrawingBrush = texturePatternBrush
            } else {
                canvas.freeDrawingBrush = new fabric[this.value + 'Brush'](canvas)
            }

            if (canvas.freeDrawingBrush) {
                canvas.freeDrawingBrush.color = drawingColorEl.value
                canvas.freeDrawingBrush.width = parseInt(drawingLineWidthEl.value, 10) || 1
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


    DolphinBoard.prototype.initEvents = function() {

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
            var fabricObj = canvas.getObjectByUUID(pathObj.uuid)
            if(fabricObj) {
                // Update all the properties of the fabric object.
                fabricObj.set(pathObj)
                canvas.renderAll()
            } else {
                console.warn('No object found in scene:', pathObj.uuid)
            }
        })


        canvas.on('object:added', function(e) {
            if(!e.target.remote) {
                socket.emit('object:added', JSON.stringify(e.target))
            }
            delete e.target.remote
        })

        // Update canvas when other clients made changes.
        socket.on('object:added', function (obj) {
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
           if (key == 46) {
               // `Delete` key removes a selected object.
               var activeObject = _canvas.getActiveObject()
               if(activeObject) {
                   canvas.remove(canvas.getActiveObject())
               }
           }
        }

    }

})();
