const mongoose = require('mongoose');

const rejectionSchema = new mongoose.Schema({
    partNumber: {
        type: String,
        required: true
    },
    count: {
        type: Number,
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
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Rejection', rejectionSchema);