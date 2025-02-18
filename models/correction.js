const mongoose = require('mongoose');

const correctionSchema = new mongoose.Schema({
    problem: {
        type: String,
        required: true
    },
    date: {
        type: String,
        required: true
    },
    correctiveAction: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Correction', correctionSchema);