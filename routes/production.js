const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const { PartDetails, HourlyProduction, PlanActual } = require('../models');
const { getCurrentIST, getCurrentShiftAndDate, getHourNumber } = require('../utils/helpers');
const { OFFLINE_THRESHOLD_MINUTES, PART_NUMBERS, PART_NAMES } = require('../config/constants');

// POST /spark/data
router.post('/spark/data', async (req, res) => {
    try {
        const { partNumber, count, target } = req.body;

        // Input validation
        if (!partNumber || !count || !target) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Get current shift and date
        const { shift, date, time } = getCurrentShiftAndDate();
        const currentHour = time;

        if (!shift) {
            return res.status(400).json({
                success: false,
                message: 'Production data can only be recorded during shift hours'
            });
        }

        // Find or update part details
        let partDetails = await PartDetails.findOneAndUpdate(
            {
                partNumber: partNumber.toString(),
                shift,
                date
            },
            { count, target },
            { new: true, upsert: true }
        );

        // Handle HourlyProduction
        let lastHourlyRecord;
        if (shift === 'shift-2' && currentHour >= '00:00' && currentHour <= '07:00') {
            // For early hours on shift-2, adjust by adding 24 to hours less than 7
            const records = await HourlyProduction.find({
                partNumber: partNumber.toString(),
                shift,
                date
            });
            if (records.length > 0) {
                const getAdjustedTime = (record) => {
                    let [h, m] = record.hour.split(':').map(Number);
                    if (h < 7) h += 24;
                    return h * 60 + m;
                };
                lastHourlyRecord = records.reduce((prev, curr) =>
                    getAdjustedTime(curr) > getAdjustedTime(prev) ? curr : prev
                );
            }
        } else {
            lastHourlyRecord = await HourlyProduction.findOne({
                partNumber: partNumber.toString(),
                shift,
                date
            }).sort({ hour: -1 });
        }

        let hourlyRecord;
        if (!lastHourlyRecord) {
            hourlyRecord = new HourlyProduction({
                partNumber: partNumber.toString(),
                shift,
                date,
                hour: currentHour,
                count: count,
                cumulativeCount: count
            });
        } else if (getHourNumber(lastHourlyRecord.hour) === getHourNumber(currentHour)) {
            const hourlyCount = count - (lastHourlyRecord.cumulativeCount - lastHourlyRecord.count);
            hourlyRecord = await HourlyProduction.findByIdAndUpdate(
                lastHourlyRecord._id,
                { count: hourlyCount, cumulativeCount: count },
                { new: true }
            );
        } else {
            const hourlyCount = count - lastHourlyRecord.cumulativeCount;
            hourlyRecord = new HourlyProduction({
                partNumber: partNumber.toString(),
                shift,
                date,
                hour: currentHour,
                count: hourlyCount,
                cumulativeCount: count
            });
        }

        await hourlyRecord.save();

        // Find or create PlanActual record
        let planActual = await PlanActual.findOneAndUpdate(
            {
                partNumber: partNumber.toString(),
                shift,
                date
            },
            { actual: count },
            { new: true, upsert: true, setDefaultsOnInsert: { plan: target } }
        );

        res.status(200).json({
            success: true,
            message: 'Production data updated successfully',
            data: {
                partDetails: {
                    partNumber: partDetails.partNumber,
                    currentCount: partDetails.count,
                    target: partDetails.target,
                    shift: partDetails.shift,
                    date: partDetails.date
                },
                hourlyData: {
                    hour: hourlyRecord.hour,
                    count: hourlyRecord.count,
                    cumulativeCount: hourlyRecord.cumulativeCount
                },
                planActual: {
                    plan: planActual.plan,
                    actual: planActual.actual
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error processing part details',
            error: error.message
        });
    }
});

// POST /api/production
router.post('/api/production', async (req, res) => {
    try {
        let { partNumber } = req.body;
        
        if (!partNumber) {
            return res.status(400).json({
                success: false,
                message: 'Part number is required'
            });
        }

        const partNumberStr = partNumber.toString();
        const latestPartDetails = await PartDetails.findOne({
            partNumber: partNumberStr
        })
        .sort({
            date: -1,
            shift: -1
        })
        .limit(1);

        if (!latestPartDetails) {
            return res.status(404).json({
                success: false,
                message: 'No production data found for this part number'
            });
        }

        return res.status(200).json({
            success: true,
            partNumber: latestPartDetails.partNumber,
            plan: latestPartDetails.target,
            actual: latestPartDetails.count,
            shift: latestPartDetails.shift,
            date: latestPartDetails.date
        });

    } catch (error) {
        console.error('Error in /api/production:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching production data',
            error: error.message
        });
    }
});

// GET /api/hourly-production-data
router.get('/api/hourly-production-data', async (req, res) => {
    try {
        const { date, shift } = req.query;
        
        let queryDate;
        if (date) {
            queryDate = moment(date).tz('Asia/Kolkata');
        } else {
            const latestRecord = await PartDetails.findOne().sort({ date: -1 });
            if (!latestRecord) {
                return res.status(404).json({
                    success: false,
                    message: 'No production data found'
                });
            }
            queryDate = moment(latestRecord.date).tz('Asia/Kolkata');
        }

        const formattedDate = queryDate.format('YYYY-MM-DD');
        const query = { date: formattedDate };

        if (shift) {
            query.shift = shift;
            
            if (shift === 'shift-2') {
                const currentHour = queryDate.format('HH');
                if (currentHour >= '00' && currentHour <= '07') {
                    query.date = queryDate.subtract(1, 'days').format('YYYY-MM-DD');
                }
            }
        }

        const hourlyData = await HourlyProduction.find(query)
            .sort({ hour: 1 });

        const formattedData = {
            [PART_NAMES.BIG_CYLINDER]: {},
            [PART_NAMES.SMALL_CYLINDER]: {}
        };

        hourlyData.forEach(record => {
            const partName = record.partNumber === PART_NUMBERS.BIG_CYLINDER 
                ? PART_NAMES.BIG_CYLINDER 
                : PART_NAMES.SMALL_CYLINDER;
            formattedData[partName][record.hour] = record.count;
        });

        res.status(200).json({
            success: true,
            date: queryDate.format('YYYY-MM-DD'),
            shift: shift || 'all',
            hourlyProduction: formattedData
        });

    } catch (error) {
        console.error('Error in /api/hourly-production-data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching hourly production data',
            error: error.message
        });
    }
});

// GET /api/pie
router.get('/api/pie', async (req, res) => {
    try {
        const latestRecord = await PartDetails.findOne()
            .sort({ 
                date: -1,
                shift: -1 
            })
            .limit(1);

        if (!latestRecord) {
            return res.status(404).json({ 
                success: false, 
                message: 'No records found' 
            });
        }

        const records = await PartDetails.find({
            date: latestRecord.date,
            shift: latestRecord.shift
        });

        const result = {
            [PART_NAMES.BIG_CYLINDER]: 0,
            [PART_NAMES.SMALL_CYLINDER]: 0
        };

        records.forEach(record => {
            if (record.partNumber === PART_NUMBERS.BIG_CYLINDER) {
                result[PART_NAMES.BIG_CYLINDER] = record.count;
            } else if (record.partNumber === PART_NUMBERS.SMALL_CYLINDER) {
                result[PART_NAMES.SMALL_CYLINDER] = record.count;
            }
        });

        res.status(200).json(result);

    } catch (error) {
        console.error('Error in /api/pie:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pie data',
            error: error.message
        });
    }
});

// GET /api/production1 - Check production online/offline status
router.get('/api/production1', async (req, res) => {
    try {
        const currentIST = getCurrentIST();
        
        // Check for recent production activity
        // Production is considered online if there's activity within the threshold
        const thresholdTime = moment(currentIST).subtract(OFFLINE_THRESHOLD_MINUTES, 'minutes');
        
        // Get the latest hourly production record
        const latestHourlyRecord = await HourlyProduction.findOne()
            .sort({ date: -1, hour: -1 })
            .limit(1);

        let status = 'offline';
        let lastActivity = null;
        let timeSinceLastActivity = null;

        if (latestHourlyRecord) {
            // Parse the date and hour to create a moment object
            const recordDate = moment(latestHourlyRecord.date).tz('Asia/Kolkata');
            const [hours, minutes] = latestHourlyRecord.hour.split(':').map(Number);
            const recordDateTime = recordDate.hour(hours).minute(minutes).second(0);
            
            // Calculate time difference
            const diffMinutes = currentIST.diff(recordDateTime, 'minutes');
            
            if (diffMinutes <= OFFLINE_THRESHOLD_MINUTES && diffMinutes >= 0) {
                status = 'online';
            }
            
            lastActivity = recordDateTime.format('YYYY-MM-DD HH:mm:ss');
            timeSinceLastActivity = `${diffMinutes} minutes ago`;
        }

        // Also check if we're in an active shift
        const { shift } = getCurrentShiftAndDate();
        const isShiftActive = shift !== null;

        res.status(200).json({
            success: true,
            status: status,
            isShiftActive: isShiftActive,
            lastActivity: lastActivity,
            timeSinceLastActivity: timeSinceLastActivity,
            currentTime: currentIST.format('YYYY-MM-DD HH:mm:ss'),
            threshold: `${OFFLINE_THRESHOLD_MINUTES} minutes`
        });

    } catch (error) {
        console.error('Error in /api/production1:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking production status',
            error: error.message
        });
    }
});

module.exports = router;