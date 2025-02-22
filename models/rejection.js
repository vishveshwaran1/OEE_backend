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
        type: String,
        required: true
    }
});

module.exports = mongoose.model('Rejection', rejectionSchema);