const express = require('express');
const cors = require('cors');
const moment = require('moment-timezone');
const PartDetails = require('./models/partdetails');
const HourlyProduction = require('./models/hourlyProduction');
const Rejection = require('./models/rejection');
const OEE = require('./models/oee');
const StopTime = require('./models/stoptime');
const Correction = require('./models/correction');

const app = express();

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
require('./connection');

// Constants
const IDEAL_CYCLE_TIME = 36; // seconds
const PLANNED_PRODUCTION_TIME = (10 * 60) + 30; // 10 hours 30 minutes

// Time Helper Functions
function getCurrentIST() {
    return moment().tz('Asia/Kolkata');
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

app.post('/spark/data', async (req, res) => {
    try {
        const { partNumber, count, target } = req.body;

        console.log(partNumber, count, target);

        // Input validation
        if (!partNumber || !count || !target) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Get current shift and date
        const currentIST = getCurrentIST();
        const { shift, date, time } = getCurrentShiftAndDate();
        const currentHour = currentIST.format('HH:mm');


        if (!shift) {
            return res.status(400).json({
                success: false,
                message: 'Production data can only be recorded during shift hours'
            });
        }

        // Find existing record
        let partDetails = await PartDetails.findOne({
            partNumber: partNumber.toString(),
            shift,
            date
        });

        if (partDetails) {
            // Update existing record
            partDetails = await PartDetails.findOneAndUpdate(
                {
                    partNumber: partNumber.toString(),
                    shift,
                    date
                },
                { count, target },
                { new: true }
            );
        } else {
            // Create new record
            partDetails = new PartDetails({
                partNumber: partNumber.toString(),
                count,
                target,
                shift,
                date
            });
            await partDetails.save();
        }

        //console.log(partNumber,shift,date);

        // Handle HourlyProduction
        const lastHourlyRecord = await HourlyProduction.findOne({
            partNumber: partNumber.toString(),
            shift,
            date
        }).sort({ hour: -1 });

        let hourlyRecord;
        //console.log(lastHourlyRecord.hour.split(":")[0],currentHour.split(":")[0]);
        
        if (!lastHourlyRecord) {
            console.log("first entry for the shift");
            // First entry for this shift
            hourlyRecord = new HourlyProduction({
                partNumber: partNumber.toString(),
                shift,
                date,
                hour: currentHour,
                count: count, // First hour count
                cumulativeCount: count // Same as count for first entry
            });
        } else if (lastHourlyRecord.hour.split(":")[0] === currentHour.split(":")[0]) {
            console.log("record update for the same hour");
            // Update existing hour's record
            const hourlyCount = count - (lastHourlyRecord.cumulativeCount - lastHourlyRecord.count);
            hourlyRecord = await HourlyProduction.findByIdAndUpdate(
                lastHourlyRecord._id,
                {
                    count: hourlyCount,
                    cumulativeCount: count
                },
                { new: true }
            );
        } else {
            console.log("new hour within the same shift");
            // New hour within same shift
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

app.post('/api/production', async (req, res) => {
    try {
        let { partNumber } = req.body;
        
        // Input validation
        if (!partNumber) {
            return res.status(400).json({
                success: false,
                message: 'Part number is required'
            });
        }

        // Format part number as string for consistency
        const partNumberStr = partNumber.toString();

        // Get the latest record with proper date sorting
        const latestProduction = await PartDetails.findOne({ 
            partNumber: partNumberStr 
        })
        .sort({ 
            date: -1,  // Sort by date first
            shift: -1  // Then by shift
        })
        .limit(1);

        if (!latestProduction) {
            return res.status(404).json({
                success: false,
                message: 'No production data found for this part number'
            });
        }

        // Format response using moment for consistent date handling
        const responseData = {
            success: true,

            partNumber: latestProduction.partNumber,
            plan: latestProduction.target,
            actual: latestProduction.count,
            shift: latestProduction.shift,
            date: latestProduction.date,
            //lastUpdated: moment(latestProduction.date).tz('Asia/Kolkata').format()
            
        };

        res.status(200).json(responseData);

    } catch (error) {
        console.error('Error in /api/production:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching production data',
            error: error.message
        });
    }
});

// Add to index.js after /api/production endpoint
app.get('/api/hourly-production-data', async (req, res) => {
    try {
        const { date, shift } = req.query;
        
        // Get query date
        let queryDate;
        if (date) {
            queryDate = moment(date).tz('Asia/Kolkata');
        } else {
            // Get latest date from PartDetails
            const latestRecord = await PartDetails.findOne().sort({ date: -1 });
            if (!latestRecord) {
                return res.status(404).json({
                    success: false,
                    message: 'No production data found'
                });
            }
            queryDate = moment(latestRecord.date).tz('Asia/Kolkata');
        }

        // Format date as YYYY-MM-DD for query
        const formattedDate = queryDate.format('YYYY-MM-DD');

        // Build query
        const query = {
            date: formattedDate
        };

        if (shift) {
            query.shift = shift;
            
            // Adjust date for shift-2 early morning hours
            if (shift === 'shift-2') {
                const currentHour = queryDate.format('HH');
                if (currentHour >= '00' && currentHour <= '07') {
                    query.date = queryDate.subtract(1, 'days').format('YYYY-MM-DD');
                }
            }
        }

        // Get hourly production data
        const hourlyData = await HourlyProduction.find(query)
            .sort({ hour: 1 });

        // Format response data
        const formattedData = {
            'BIG CYLINDER': {},
            'SMALL CYLINDER': {}
        };

        hourlyData.forEach(record => {
            const partName = record.partNumber === '9253010242' ? 'BIG CYLINDER' : 'SMALL CYLINDER';
            formattedData[partName][record.hour] = record.count;
        });

        // Prepare response
        const responseData = {
            success: true,
            date: queryDate.format('YYYY-MM-DD'),
            shift: shift || 'all',
            hourlyProduction: formattedData
        };

        res.status(200).json(responseData);

    } catch (error) {
        console.error('Error in /api/hourly-production-data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching hourly production data',
            error: error.message
        });
    }
});

// Add after the hourly-production-data endpoint
app.get('/api/pie', async (req, res) => {
    try {
        // Find the latest date and shift
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

        // Get the date in YYYY-MM-DD format
        const queryDate = latestRecord.date;
        const queryShift = latestRecord.shift;

        // Get all records for the latest date and shift
        const records = await PartDetails.find({
            date: queryDate,
            shift: queryShift
        });

        // Format the response data
        const result = {
            'BIG CYLINDER': 0,
            'SMALL CYLINDER': 0
        };

        records.forEach(record => {
            if (record.partNumber === '9253020232') {
                result['BIG CYLINDER'] = record.count;
            } else if (record.partNumber === '9253010242') {
                result['SMALL CYLINDER'] = record.count;
            }
        });

        // Add metadata to response
        // const responseData = {
        //     success: true,
        //     date: queryDate,
        //     shift: queryShift,
        //     data: result
        // };

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


// Monthly Stats API
app.get('/api/monthly-stats', async (req, res) => {
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
                'BIG CYLINDER': {
                    partNumber: '9253020232',
                    totalProduction: 0,
                    goodCount: 0,
                    totalRejections: 0,
                    rejectionsByReason: []
                },
                'SMALL CYLINDER': {
                    partNumber: '9253010242',
                    totalProduction: 0,
                    goodCount: 0,
                    totalRejections: 0,
                    rejectionsByReason: []
                }
            }
        };

        // Process production data
        productionData.forEach(prod => {
            const partName = prod._id === '9253020232' ? 'BIG CYLINDER' : 'SMALL CYLINDER';
            monthlyStats.stats[partName].totalProduction = prod.totalProduction;
        });

        // Process rejection data
        rejectionData.forEach(rej => {
            const partName = rej._id === '9253020232' ? 'BIG CYLINDER' : 'SMALL CYLINDER';
            monthlyStats.stats[partName].totalRejections = rej.totalRejections;
            monthlyStats.stats[partName].rejectionsByReason = rej.rejectionsByReason;
            monthlyStats.stats[partName].goodCount = 
                monthlyStats.stats[partName].totalProduction - rej.totalRejections;
        });

        // Set goodCount equal to totalProduction if no rejections
        Object.keys(monthlyStats.stats).forEach(partName => {
            if (!monthlyStats.stats[partName].goodCount) {
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

// Monthly Runtime API
app.get('/api/monthly-runtime', async (req, res) => {
    try {
        // Get current month's date range in IST
        const now = moment().tz('Asia/Kolkata');
        const startOfMonth = moment(now).startOf('month').format('YYYY-MM-DD');
        const endOfMonth = moment(now).endOf('month').format('YYYY-MM-DD');

        // Get runtime from OEE records
        const oeeData = await OEE.aggregate([
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
                    _id: null,
                    totalRunTime: { $sum: "$runTime" },
                    totalPlannedTime: { 
                        $sum: { $multiply: [PLANNED_PRODUCTION_TIME, 1] }
                    }
                }
            }
        ]);

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
        const totalPlannedTime = oeeData[0]?.totalPlannedTime || 0;
        const actualRunTime = oeeData[0]?.totalRunTime || 0;

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
app.get('/api/oee', async (req, res) => {
    try {
        // Get latest OEE record with proper date sorting
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

        // Format percentages with proper validation
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

app.get('/api/oee-history', async (req, res) => {
    try {
        // Get OEE history with date and shift, sorted by latest first
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

        // Format response with proper IST dates and OEE percentage
        const formattedHistory = oeeHistory.map(record => ({
            date: moment(record.date).tz('Asia/Kolkata').format('YYYY-MM-DD'),
            shift: record.shift,
            oee: (record.oee * 100).toFixed(2)
        }));

        // Preserve original response format
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

app.post('/api/quality-data', async (req, res) => {
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
            // Only delete rejections if new rejection data is provided
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
async function calculateAndSaveOEE(shift, date) {
    try {
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

// app.post('/api/quality-data', async (req, res) => {
//     try {
//         const { rejections, stopTimes, shift, date } = req.body;
//         console.log(req.body);

//         // Validate inputs
//         if (!shift || !date || !rejections || !stopTimes) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Missing required fields: shift, date, rejections, stopTimes'
//             });
//         }

//         // Format date
//         const queryDate = moment(date).tz('Asia/Kolkata').format('YYYY-MM-DD');

//         // Validate production exists
//         const productionExists = await PartDetails.findOne({
//             shift,
//             date: queryDate
//         });

//         if (!productionExists) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'No production data found for the specified shift and date'
//             });
//         }

//         // Delete existing records
//         await Promise.all([
//             Rejection.deleteMany({ shift, date: queryDate }),
//             StopTime.deleteMany({ shift, date: queryDate })
//         ]);

//         // Save new records
//         await Promise.all([
//             ...rejections.map(rejection => 
//                 new Rejection({ ...rejection, shift, date: queryDate }).save()
//             ),
//             ...stopTimes.map(stopTime => 
//                 new StopTime({ ...stopTime, shift, date: queryDate }).save()
//             )
//         ]);

//         // Calculate and save OEE
//         await calculateAndSaveOEE(shift, queryDate);

//         res.status(200).json({
//             success: true,
//             message: 'Quality data updated and OEE calculated successfully',
//             shift,
//             date: queryDate
//         });

//     } catch (error) {
//         console.error('Error in /api/quality-data:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error processing quality data',
//             error: error.message
//         });
//     }
// });

// async function calculateAndSaveOEE(shift, date) {
//     try {
//         // Get date range
//         const queryDate = moment(date).tz('Asia/Kolkata').format('YYYY-MM-DD');

//         // Get production data
//         const productions = await PartDetails.find({
//             shift,
//             date: queryDate
//         });

//         const totalCount = productions.reduce((sum, prod) => sum + prod.count, 0);
//         if (totalCount === 0) throw new Error('Total count cannot be zero');

//         // Get stoppage data
//         const stopTimes = await StopTime.find({
//             shift,
//             date: queryDate
//         });

//         const totalStopTime = stopTimes.reduce((sum, stop) => sum + stop.duration, 0);

//         // Get rejection data
//         const rejections = await Rejection.find({
//             shift,
//             date: queryDate
//         });

//         const totalRejections = rejections.reduce((sum, rej) => sum + rej.count, 0);

//         // Calculate OEE components
//         const runTime = PLANNED_PRODUCTION_TIME - totalStopTime;
//         if (runTime <= 0) throw new Error('Run time must be greater than 0');

//         const goodCount = totalCount - totalRejections;
//         const availability = runTime / PLANNED_PRODUCTION_TIME;
//         const performance = (IDEAL_CYCLE_TIME * totalCount) / (runTime * 60);
//         const quality = goodCount / totalCount;
//         const oee = availability * performance * quality;

//         // Validate calculations
//         if ([availability, performance, quality, oee].some(val => isNaN(val))) {
//             throw new Error('Invalid OEE calculation values');
//         }

//         // Save OEE record
//         return await OEE.findOneAndUpdate(
//             { shift, date: queryDate },
//             {
//                 availability,
//                 performance,
//                 quality,
//                 oee,
//                 totalCount,
//                 goodCount,
//                 runTime
//             },
//             { upsert: true, new: true }
//         );
//     } catch (error) {
//         throw new Error(`OEE Calculation Error: ${error.message}`);
//     }
// }

app.post('/api/correction', async (req, res) => {
    try {
        const { problem, date, correctiveAction } = req.body;

        // Validate inputs
        if (!problem || !date || !correctiveAction) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: problem, date, correctiveAction'
            });
        }

        // Format date
        const formattedDate = moment(date).format('YYYY-MM-DD');

        // Create new correction record
        const correction = new Correction({
            problem,
            date: formattedDate,
            correctiveAction
        });

        // Save to database
        await correction.save();

        res.status(200).json({
            success: true,
            message: 'Correction data saved successfully',
            data: correction
        });

    } catch (error) {
        console.error('Error in /api/correction:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving correction data',
            error: error.message
        });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});