const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const { OEE } = require('../models');

// GET /api/oee
router.get('/oee', async (req, res) => {
    try {
        const latestOEE = await OEE.findOne()
            .sort({ 
                date: -1,
                shift: -1 
            })
            .limit(1);

        if (!latestOEE) {
            return res.status(404).json({
                success: false,
                message: 'No OEE data found'
            });
        }

        const formatPercentage = (value) => {
            if (isNaN(value) || value === null) return '0%';
            return (value * 100).toFixed(2) + '%';
        };

        res.status(200).json({
            success: true,
            data: {
                availability: formatPercentage(latestOEE.availability),
                performance: formatPercentage(latestOEE.performance),
                quality: formatPercentage(latestOEE.quality),
                oee: formatPercentage(latestOEE.oee),
                totalCount: latestOEE.totalCount || 0,
                goodCount: latestOEE.goodCount || 0,
                runTime: latestOEE.runTime || 0,
                date: moment(latestOEE.date).tz('Asia/Kolkata').format('YYYY-MM-DD'),
                shift: latestOEE.shift
            }
        });

    } catch (error) {
        console.error('Error in /api/oee:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching OEE data',
            error: error.message
        });
    }
});

// GET /api/oee-history
router.get('/oee-history', async (req, res) => {
    try {
        const oeeHistory = await OEE.find({}, 'date shift oee')
            .sort({ 
                date: -1,
                shift: -1 
            });

        if (!oeeHistory || oeeHistory.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No OEE history found'
            });
        }

        const formattedHistory = oeeHistory.map(record => ({
            date: moment(record.date).tz('Asia/Kolkata').format('YYYY-MM-DD'),
            shift: record.shift,
            oee: (record.oee * 100).toFixed(2)
        }));

        res.status(200).json(formattedHistory);

    } catch (error) {
        console.error('Error in /api/oee-history:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching OEE history',
            error: error.message
        });
    }
});

module.exports = router;