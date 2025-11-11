const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const { Rejection, StopTime, PartDetails } = require('../models');
const { calculateAndSaveOEE } = require('../utils/helpers');

// POST /api/quality-data
router.post('/quality-data', async (req, res) => {
    try {
        const { rejections, stopTimes, shift, date } = req.body;

        // Validate required inputs
        if (!shift || !date || !stopTimes) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: shift, date, stopTimes'
            });
        }

        // Format date
        const queryDate = moment(date, 'YYYY-MM-DD').tz('Asia/Kolkata').format('YYYY-MM-DD');

        // Validate production exists
        const productionExists = await PartDetails.findOne({
            shift,
            date: queryDate
        });

        if (!productionExists) {
            return res.status(404).json({
                success: false,
                message: 'No production data found for the specified shift and date'
            });
        }

        // Delete existing records
        await Promise.all([
            StopTime.deleteMany({ shift, date: queryDate }),
            ...(rejections && rejections.length > 0 ? 
                [Rejection.deleteMany({ shift, date: queryDate })] : 
                [])
        ]);

        // Save new records
        const saveOperations = [
            ...stopTimes.map(stopTime => 
                new StopTime({ ...stopTime, shift, date: queryDate }).save()
            )
        ];

        // Only save rejections if valid data is provided
        if (rejections && rejections.length > 0 && 
            rejections.some(r => r.partNumber && r.count && r.reason)) {
            const validRejections = rejections.filter(r => 
                r.partNumber && r.count && r.reason
            );
            saveOperations.push(
                ...validRejections.map(rejection => 
                    new Rejection({ ...rejection, shift, date: queryDate }).save()
                )
            );
        }

        await Promise.all(saveOperations);

        // Calculate and save OEE
        await calculateAndSaveOEE(shift, queryDate);

        res.status(200).json({
            success: true,
            message: 'Quality data updated and OEE calculated successfully',
            shift,
            date: queryDate,
            details: {
                stoppagesProcessed: stopTimes.length,
                rejectionsProcessed: rejections && rejections.length > 0 ? 
                    rejections.filter(r => r.partNumber && r.count && r.reason).length : 
                    'No rejections provided'
            }
        });

    } catch (error) {
        console.error('Error in /api/quality-data:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing quality data',
            error: error.message
        });
    }
});

module.exports = router;