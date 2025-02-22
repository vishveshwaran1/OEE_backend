const mongoose = require('mongoose');

const hourlyProductionSchema = new mongoose.Schema({
    partNumber: {
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
    },
    hour: {
        type: String,
        required: true
    },
    count: {
        type: Number,
        required: true
    },
    cumulativeCount: {
        type: Number,
        required: true
    }
});

module.exports = mongoose.model('HourlyProduction', hourlyProductionSchema);