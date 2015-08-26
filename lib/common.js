'use strict'


function Helpers() {

}


Helpers.prototype.init = function(app) {
    var _this = this

    app.fabric.Object.prototype.setOptions = (function(setOptions) {
        return function(options) {
            setOptions.apply(this, [options])
            this.uuid = this.uuid || _this.uuidGen()
            this.day = app.dayOftheWeek
        }
    })(fabric.Object.prototype.setOptions)

    app.fabric.Object.prototype.toObject = (function(toObject) {
        return function(propertiesToInclude) {
            propertiesToInclude = (propertiesToInclude || []).concat(['uuid', 'day'])
            return toObject.apply(this, [propertiesToInclude])
        };
    })(fabric.Object.prototype.toObject)

    /**
     * Item name is unique
     */
    app.fabric.Canvas.prototype.getObjectByUUID = function(uuid) {
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
}


/**
 * Cheap way to generate a UUID for each fabric object.
 */
Helpers.prototype.uuidGen = function() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}

module.exports = new Helpers()
