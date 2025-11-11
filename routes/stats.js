const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const { PartDetails, Rejection, OEE, StopTime } = require('../models');
const { PLANNED_PRODUCTION_TIME, PART_NUMBERS, PART_NAMES } = require('../config/constants');

// GET /api/monthly-stats
router.get('/monthly-stats', async (req, res) => {
    try {
        // Get current month's date range in IST
        const now = moment().tz('Asia/Kolkata');
        const startOfMonth = moment(now).startOf('month').format('YYYY-MM-DD');
        const endOfMonth = moment(now).endOf('month').format('YYYY-MM-DD');

        // Get total production from PartDetails
        const productionData = await PartDetails.aggregate([
            {
                $match: {
                    date: {
                        $gte: startOfMonth,
                        $lte: endOfMonth
                    }
                }
            },
            {
                $group: {
                    _id: "$partNumber",
                    totalProduction: { $sum: "$count" }
                }
            }
        ]);

        // Get total rejections
        const rejectionData = await Rejection.aggregate([
            {
                $match: {
                    date: {
                        $gte: startOfMonth,
                        $lte: endOfMonth
                    }
                }
            },
            {
                $group: {
                    _id: "$partNumber",
                    totalRejections: { $sum: "$count" },
                    rejectionsByReason: {
                        $push: {
                            reason: "$reason",
                            count: "$count"
                        }
                    }
                }
            }
        ]);

        // Format the response
        const monthlyStats = {
            period: {
                start: startOfMonth,
                end: endOfMonth
            },
            stats: {
                [PART_NAMES.BIG_CYLINDER]: {
                    partNumber: PART_NUMBERS.BIG_CYLINDER,
                    totalProduction: 0,
                    goodCount: 0,
                    totalRejections: 0,
                    rejectionsByReason: []
                },
                [PART_NAMES.SMALL_CYLINDER]: {
                    partNumber: PART_NUMBERS.SMALL_CYLINDER,
                    totalProduction: 0,
                    goodCount: 0,
                    totalRejections: 0,
                    rejectionsByReason: []
                }
            }
        };

        // Process production data
        productionData.forEach(prod => {
            const partName = prod._id === PART_NUMBERS.BIG_CYLINDER 
                ? PART_NAMES.BIG_CYLINDER 
                : PART_NAMES.SMALL_CYLINDER;
            monthlyStats.stats[partName].totalProduction = prod.totalProduction;
        });

        // Process rejection data
        rejectionData.forEach(rej => {
            const partName = rej._id === PART_NUMBERS.BIG_CYLINDER 
                ? PART_NAMES.BIG_CYLINDER 
                : PART_NAMES.SMALL_CYLINDER;
            monthlyStats.stats[partName].totalRejections = rej.totalRejections;
            monthlyStats.stats[partName].rejectionsByReason = rej.rejectionsByReason;
            monthlyStats.stats[partName].goodCount = 
                monthlyStats.stats[partName].totalProduction - rej.totalRejections;
        });

        // Set goodCount equal to totalProduction if no rejections were processed
        Object.keys(monthlyStats.stats).forEach(partName => {
            if (monthlyStats.stats[partName].totalRejections === 0 && monthlyStats.stats[partName].goodCount === 0) {
                monthlyStats.stats[partName].goodCount = monthlyStats.stats[partName].totalProduction;
            }
        });

        res.status(200).json({
            success: true,
            data: monthlyStats
        });

    } catch (error) {
        console.error('Error in /api/monthly-stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching monthly statistics',
            error: error.message
        });
    }
});

// GET /api/monthly-runtime
router.get('/monthly-runtime', async (req, res) => {
    try {
        // Get current month's date range in IST
        const now = moment().tz('Asia/Kolkata');
        const startOfMonth = moment(now).startOf('month').format('YYYY-MM-DD');
        const endOfMonth = moment(now).endOf('month').format('YYYY-MM-DD');

        // Get runtime from OEE records
        const oeeRecords = await OEE.find({
            date: {
                $gte: startOfMonth,
                $lte: endOfMonth
            }
        });

        const totalRunTime = oeeRecords.reduce((sum, record) => sum + (record.runTime || 0), 0);
        const totalPlannedTime = oeeRecords.length * PLANNED_PRODUCTION_TIME;

        // Get stoppage breakdown
        const stoppageData = await StopTime.aggregate([
            {
                $match: {
                    date: {
                        $gte: startOfMonth,
                        $lte: endOfMonth
                    }
                }
            },
            {
                $group: {
                    _id: "$reason",
                    duration: { $sum: "$duration" },
                    occurrences: { $sum: 1 }
                }
            },
            {
                $project: {
                    reason: "$_id",
                    duration: 1,
                    occurrences: 1,
                    _id: 0
                }
            },
            {
                $sort: { duration: -1 }
            }
        ]);

        const totalStopTime = stoppageData.reduce((sum, stop) => sum + stop.duration, 0);
        const actualRunTime = totalRunTime;

        const runtimeStats = {
            period: {
                start: startOfMonth,
                end: endOfMonth
            },
            stats: {
                totalPlannedTime,
                totalStopTime,
                actualRunTime,
                utilizationRate: totalPlannedTime ? 
                    ((actualRunTime / totalPlannedTime) * 100).toFixed(2) + '%' : 
                    '0%',
                stoppagesByReason: stoppageData.map(stop => ({
                    ...stop,
                    percentage: totalStopTime ? 
                        ((stop.duration / totalStopTime) * 100).toFixed(2) + '%' : 
                        '0%'
                }))
            }
        };

        res.status(200).json({
            success: true,
            data: runtimeStats
        });

    } catch (error) {
        console.error('Error in /api/monthly-runtime:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching monthly runtime statistics',
            error: error.message
        });
    }
});

module.exports = router;

