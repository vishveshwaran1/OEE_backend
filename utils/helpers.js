const moment = require('moment-timezone');

function getCurrentIST() {
    return moment().tz('Asia/Kolkata');
}

function getHourNumber(timeString) {
    return parseInt(timeString.split(":")[0], 10);
}

function getCurrentShiftAndDate() {
    const currentIST = getCurrentIST();
    const time = currentIST.format('HH:mm');
    const date = currentIST.format('YYYY-MM-DD');
    
    let shift;
    let shiftDate = date;

    if (time >= '08:30' && time <= '19:00') {
        shift = 'shift-1';
    } else if ((time >= '20:30' && time <= '23:59') || (time >= '00:00' && time <= '07:00')) {
        shift = 'shift-2';
        // Adjust date for early morning hours of shift-2
        if (time >= '00:00' && time <= '07:00') {
            shiftDate = moment(currentIST).subtract(1, 'days').format('YYYY-MM-DD');
        }
    } else {
        shift = null;
    }

    return { shift, date: shiftDate, time };
}

async function calculateAndSaveOEE(shift, date) {
    try {
        const { PLANNED_PRODUCTION_TIME, IDEAL_CYCLE_TIME } = require('../config/constants');
        const { OEE, PartDetails, StopTime, Rejection } = require('../models');

        // Get date range
        const queryDate = moment(date).tz('Asia/Kolkata').format('YYYY-MM-DD');

        // Get production data
        const productions = await PartDetails.find({
            shift,
            date: queryDate
        });

        const totalCount = productions.reduce((sum, prod) => sum + prod.count, 0);
        if (totalCount === 0) throw new Error('Total count cannot be zero');

        // Get stoppage data
        const stopTimes = await StopTime.find({
            shift,
            date: queryDate
        });

        const totalStopTime = stopTimes.reduce((sum, stop) => sum + stop.duration, 0);

        // Get rejection data - now optional
        const rejections = await Rejection.find({
            shift,
            date: queryDate
        });

        // If no rejections found, assume all products are good
        const totalRejections = rejections.length > 0 ? 
            rejections.reduce((sum, rej) => sum + rej.count, 0) : 0;

        // Calculate OEE components
        const runTime = PLANNED_PRODUCTION_TIME - totalStopTime;
        if (runTime <= 0) throw new Error('Run time must be greater than 0');

        const goodCount = totalCount - totalRejections;
        const availability = runTime / PLANNED_PRODUCTION_TIME;
        const performance = (IDEAL_CYCLE_TIME * totalCount) / (runTime * 60);
        // If no rejections, quality is 100%
        const quality = rejections.length > 0 ? (goodCount / totalCount) : 1;
        const oee = availability * performance * quality;

        // Validate calculations
        if ([availability, performance, quality, oee].some(val => isNaN(val))) {
            throw new Error('Invalid OEE calculation values');
        }

        // Save OEE record
        return await OEE.findOneAndUpdate(
            { shift, date: queryDate },
            {
                availability,
                performance,
                quality,
                oee,
                totalCount,
                goodCount,
                runTime
            },
            { upsert: true, new: true }
        );
    } catch (error) {
        throw new Error(`OEE Calculation Error: ${error.message}`);
    }
}

module.exports = {
    getCurrentIST,
    getHourNumber,
    getCurrentShiftAndDate,
    calculateAndSaveOEE
};