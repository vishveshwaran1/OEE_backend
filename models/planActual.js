// models/planActual.js
const mongoose = require('mongoose');

const planActualSchema = new mongoose.Schema({
    partNumber: {
        type: String,
        required: true
    },
    plan: {
        type: Number,
        required: true
    },
    actual: {
        type: Number,
        default: 0
    },
    date: {
        type: String,
        required: true
    },
    shift: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model('PlanActual', planActualSchema);