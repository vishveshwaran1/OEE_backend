const mongoose = require('mongoose');

const stopTimeSchema = new mongoose.Schema({
    duration: {
        type: Number,  // in minutes
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    shift: {
        type: String,
        required: true
    },
    date: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model('StopTime', stopTimeSchema);