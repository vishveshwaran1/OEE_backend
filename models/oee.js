const mongoose = require('mongoose');

const oeeSchema = new mongoose.Schema({
    shift: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    availability: {
        type: Number,
        required: true
    },
    performance: {
        type: Number,
        required: true
    },
    quality: {
        type: Number,
        required: true
    },
    oee: {
        type: Number,
        required: true
    },
    totalCount: {
        type: Number,
        required: true
    },
    goodCount: {
        type: Number,
        required: true
    },
    runTime: {
        type: Number,
        required: true
    }
});

module.exports = mongoose.model('OEE', oeeSchema);