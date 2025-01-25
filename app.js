const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const PartDetails = require('./models/partdetails');
const Rejection = require('./models/rejection');
const StopTime = require('./models/stoptime');
const OEE = require('./models/oee');
const HourlyProduction = require('./models/hourlyProduction'); 

require('./connection');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

// Constants
const IDEAL_CYCLE_TIME = 36; // seconds
const PLANNED_PRODUCTION_TIME = (10 * 60) + 30; // 10 hours 30 minutes


// Add this helper function at the top of app.js to convert to IST
function getISTDateTime(date = new Date()) {
    // Get the time offset between UTC and IST (IST is UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
    
    // Get current time in UTC
    const utc = date.getTime();
    
    // Create new date object for IST
    const istDate = new Date(utc + istOffset);
    
    return istDate;
}

// function getISTDateTime(date = new Date()) {
//     const istDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
//     //console.log("istDate",istDate);
//     return istDate;
// }

// Helper function to get start and end of IST day
function getISTDayBounds(date) {
    //.log("istDate",istDate);
    // Convert input to Date if string
    const inputDate = typeof date === 'string' ? new Date(date) : date;
    
    // Get IST date
    //const istDate = getISTDateTime(inputDate);
    
    let startOfDay = new Date(inputDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    let endOfDay = new Date(inputDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    startOfDay = startOfDay.toISOString();
    endOfDay = endOfDay.toISOString();
    return { startOfDay, endOfDay };
}


function getCurrentShift() {
    const istDateTime = getISTDateTime();
    
    const timeString = istDateTime.toISOString();
    const time = timeString.slice(11, 16);  // This will extract "HH:MM" from the ISO string
   
   
    
    // Convert times to comparable format (HH:mm)
    const currentTime = time;
    
    // For shift-2, check if time is between 20:30 and 23:59 OR between 00:00 and 07:00
    if (
        (currentTime >= '20:30' && currentTime <= '23:59') || 
        (currentTime >= '00:00' && currentTime <= '08:29')
    ) {
        return 'shift-2';
    } 
    // For shift-1, check if time is between 08:30 and 19:00
    else if (currentTime >= '08:30' && currentTime <= '20:29') {
        return 'shift-1';
    }
    
    return null;
}

app.post('/spark/data', async (req, res) => {
    try {
        const {partNumber, count, target} = req.body;
        console.log(partNumber,count,target);
        
        // Validate part number
        if (partNumber !== 9253010242 && partNumber !== 9253020232) {
            console.log("Invalid part number");
            return res.status(400).json({
                success: false,
                message: 'Invalid part number'
            });
        }

        const currentShift = getCurrentShift();
        if (!currentShift) {
            console.log("Production data can only be recorded during shift hours");
            return res.status(400).json({
                success: false,
                message: 'Production data can only be recorded during shift hours'
            });
        }


        const today = getISTDateTime();

        const timeString = today.toISOString();
        const time = timeString.slice(11, 16); 
        if(  (time >= '00:00' && time <= '07:00')){
            today.setDate(today.getDate() - 1);
        }

        let { startOfDay, endOfDay } = getISTDayBounds(today);
        startOfDay = new Date(startOfDay);
        endOfDay = new Date(endOfDay);


        
        today.setUTCHours(0, 0, 0, 0);

        // Calculate target based on ideal cycle time
        // const target = req.body.target; // Calculate theoretical max parts

        // Find existing record for this part number in current shift
        const existingPart = await PartDetails.findOne({
            partNumber: partNumber.toString(),
            shift: currentShift,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        });

        let partDetails;
        if (existingPart) {
            console.log("existingPart",existingPart);
            // // Validate count increase
            // if (count <= existingPart.count) {
            //     return res.status(400).json({
            //         success: false,
            //         message: 'New count must be greater than previous count'
            //     });
            // }

            // Update existing record using findOneAndUpdate
            partDetails = await PartDetails.findOneAndUpdate(
                {
                    partNumber: partNumber.toString(),
                    shift: currentShift,
                    date: {
                        $gte: startOfDay,
                        $lt: endOfDay
                    }
                },
                { 
                    count,
                    target,
                    lastUpdated: getISTDateTime()
                },
                { new: true }
            );
        } else {
            console.log("new part");
            // Create new record
            partDetails = new PartDetails({
                partNumber: partNumber.toString(),
                count,
                target,
                shift: currentShift,
                date:  getISTDateTime(),
                lastUpdated: getISTDateTime()
            });
            await partDetails.save();
        }

         // Add hourly production tracking
         const currentHour = getISTDateTime().toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Asia/Kolkata'
        });

        // Find the previous hour's cumulative count
        const previousHourProduction = await HourlyProduction.findOne({
            partNumber: partNumber.toString(),
            shift: currentShift,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        }).sort({ hour: -1 });

        const previousCumulativeCount = previousHourProduction ? previousHourProduction.cumulativeCount : 0;
        const hourlyCount = count - previousCumulativeCount;

        // Update or create hourly production record
        await HourlyProduction.findOneAndUpdate(
            {
                partNumber: partNumber.toString(),
                shift: currentShift,
                date: getISTDateTime(),
                hour: time
            },
            {
                count: hourlyCount,
                cumulativeCount: count
            },
            { upsert: true, new: true }
        );
        console.log("partDetails",partDetails);

        res.status(200).json({
            success: true,
            message: existingPart ? 'Part count updated successfully' : 'New part record created',
            data: {
                partNumber: partDetails.partNumber,
                currentCount: partDetails.count,
                target: partDetails.target,
                shift: partDetails.shift,
                lastUpdated: partDetails.lastUpdated
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

// New endpoint to get hourly production data
app.get('/api/hourly-production-data', async (req, res) => {
    try {
        const { date, shift } = req.query;
        
        let queryDate;
        if (date) {
            queryDate = new Date(date);
        } else {
            // Get the latest date from PartDetails if no date provided
            const latestRecord = await PartDetails.findOne().sort({ date: -1 });
            if (!latestRecord) {
                return res.status(404).json({
                    success: false,
                    message: 'No production data found'
                });
            }
            queryDate = latestRecord.date;
        }

        let { startOfDay, endOfDay } = getISTDayBounds(queryDate);
        startOfDay = new Date(startOfDay);
        endOfDay = new Date(endOfDay);

        const query = {
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        };

        if (shift) {
            query.shift = shift;
        }

        const hourlyData = await HourlyProduction.find(query)
            .sort({ hour: 1 });

        const formattedData = {
            'BIG CYLINDER': {},
            'SMALL CYLINDER': {}
        };

        hourlyData.forEach(record => {
            const partName = record.partNumber === '9253010242' ? 'BIG CYLINDER' : 'SMALL CYLINDER';
            formattedData[partName][record.hour] = record.count;
        });

        res.status(200).json({
            success: true,
            date: getISTDateTime(queryDate).toISOString(),
            shift: shift || 'all',
            hourlyProduction: formattedData
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching hourly production data',
            error: error.message
        });
    }
});

// API to submit rejections and stop times
app.post('/api/quality-data', async (req, res) => {
    try {
        const { rejections, stopTimes, shift, date } = req.body;


        const shiftDate = getISTDateTime(new Date(date));
        //let { startOfDay, endOfDay } = getISTDayBounds(shiftDate);
        
        // Convert incoming date to UTC
        const inputDate = new Date(date);

        // Create UTC day bounds
        const startOfDay = new Date(Date.UTC(
            inputDate.getUTCFullYear(),
            inputDate.getUTCMonth(),
            inputDate.getUTCDate(),
            0, 0, 0, 0
        ));

        const endOfDay = new Date(Date.UTC(
            inputDate.getUTCFullYear(),
            inputDate.getUTCMonth(),
            inputDate.getUTCDate(),
            23, 59, 59, 999
        ));


        if (!shift || !date || !rejections || !stopTimes) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: shift, date, rejections, stopTimes'
            });
        }


        // Validate if provided shift and date have production data
        const productionExists = await PartDetails.findOne({
            shift,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        });


        if (!productionExists) {
            return res.status(404).json({
                success: false,
                message: 'No production data found for the specified shift and date'
            });
        }
        
        // Check if data already exists for this shift and day
        const existingRejections = await Rejection.find({
            shift,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        });

        const existingStopTimes = await StopTime.find({
            shift,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        });

        // Delete existing records if any
        if (existingRejections.length > 0) {
            await Rejection.deleteMany({
                shift,
                date: {
                    $gte: startOfDay,
                    $lt: endOfDay
                }
            });
        }

        if (existingStopTimes.length > 0) {
            await StopTime.deleteMany({
                shift,
                date: {
                    $gte: startOfDay,
                    $lt: endOfDay
                }
            });
        }

        // Save new rejections
        await Promise.all(rejections.map(rejection => 
            new Rejection({
                ...rejection,
                shift,
                date: new Date(date)
            }).save()
        ));

        // Save new stop times
        await Promise.all(stopTimes.map(stopTime => 
            new StopTime({
                ...stopTime,
                shift,
                date: new Date(date)
            }).save()
        ));

        // Calculate and save OEE
        await calculateAndSaveOEE(shift, date);

        res.status(200).json({
            success: true,
            message: 'Quality data updated and OEE calculated successfully',
            shift,
            date: shiftDate
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error processing quality data',
            error: error.message
        });
    }
});

async function calculateAndSaveOEE(shift, date) {
    try {
        // Set date to start of day
        const shiftDate = getISTDateTime(new Date(date));
        const inputDate = new Date(date);

        // Create UTC day bounds
        const startOfDay = new Date(Date.UTC(
            inputDate.getUTCFullYear(),
            inputDate.getUTCMonth(),
            inputDate.getUTCDate(),
            0, 0, 0, 0
        ));

        const endOfDay = new Date(Date.UTC(
            inputDate.getUTCFullYear(),
            inputDate.getUTCMonth(),
            inputDate.getUTCDate(),
            23, 59, 59, 999
        ));



        // Get total production count
        const productions = await PartDetails.find({
            shift,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        });


        const totalCount = productions.reduce((sum, prod) => sum + prod.count, 0);
        
        // Validate totalCount
        if (totalCount === 0) {
            throw new Error('Total count cannot be zero');
        }

        // Get total stop time
        const stopTimes = await StopTime.find({
            shift,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        });

        const totalStopTime = stopTimes.reduce((sum, stop) => sum + stop.duration, 0);

        // Get total rejections
        const rejections = await Rejection.find({
            shift,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        });

        const totalRejections = rejections.reduce((sum, rej) => sum + rej.count, 0);

        // Calculate OEE components with validation
        const runTime = PLANNED_PRODUCTION_TIME - totalStopTime;

        
        // Validate runTime
        if (runTime <= 0) {
            throw new Error('Run time must be greater than 0');
        }

        const goodCount = totalCount - totalRejections;

        const availability = runTime / PLANNED_PRODUCTION_TIME;
        const performance = (IDEAL_CYCLE_TIME * totalCount) / (runTime * 60); // convert runtime to seconds
        const quality = goodCount / totalCount;
        
        // Validate all components
        if (isNaN(availability) || isNaN(performance) || isNaN(quality)) {
            throw new Error('Invalid calculation: One or more OEE components is NaN');
        }

        const oee = availability * performance * quality;

        // Final validation
        if (isNaN(oee)) {
            throw new Error('OEE calculation resulted in NaN');
        }

        // Save or update OEE record
        await OEE.findOneAndUpdate(
            { shift, date: shiftDate },
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

// API to get latest OEE
app.get('/api/oee', async (req, res) => {
    try {
        const latestOEE = await OEE.findOne()
            .sort({ date: -1, shift: -1 })
            .limit(1);

        if (!latestOEE) {
            return res.status(404).json({
                success: false,
                message: 'No OEE data found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                availability: (latestOEE.availability * 100).toFixed(2) + '%',
                performance: (latestOEE.performance * 100).toFixed(2) + '%',
                quality: (latestOEE.quality * 100).toFixed(2) + '%',
                oee: (latestOEE.oee * 100).toFixed(2) + '%',
                totalCount: latestOEE.totalCount,
                goodCount: latestOEE.goodCount,
                runTime: latestOEE.runTime
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching OEE data',
            error: error.message
        });
    }
});

app.get('/api/pie', async (req, res) => {
    try {
        // Find the latest date from all records
        const latestRecord = await PartDetails.findOne()
            .sort({ date: -1, shift: -1 })
            .limit(1);

        //console.log(latestRecord);
        

        if (!latestRecord) {
            return res.status(404).json({ 
                success: false, 
                message: 'No records found' 
            });
        }

        let { startOfDay, endOfDay } = getISTDayBounds(latestRecord.date);
        startOfDay = new Date(startOfDay);
        endOfDay = new Date(endOfDay);


        // Get all records for the latest date and shift
        const records = await PartDetails.find({
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            },
            shift: latestRecord.shift
        });

        const result = {};
        //console.log(records);

        records.forEach(record => {
            if (record.partNumber === '9253010242') {
                result['BIG CYLINDER'] = record.count;
            } else if (record.partNumber === '9253020232') {
                result['SMALL CYLINDER'] = record.count;
            }
        });

        res.status(200).json(result);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching pie data',
            error: error.message
        });
    }
});

app.post('/api/production', async (req, res) => {
    try {
        let { partNumber } = req.body;
        partNumber = parseInt(partNumber);

        // Find the latest record for the given part number using IST date
        const latestProduction = await PartDetails.findOne({ partNumber })
            .sort({ 
                date: -1, 
                shift: -1 
            })
            .limit(1);

        if (!latestProduction) {
            return res.status(404).json({
                success: false,
                message: 'No production data found for this part number'
            });
        }

        res.status(200).json({
            plan: latestProduction.target,
            actual: latestProduction.count,
            lastUpdated: getISTDateTime(latestProduction.lastUpdated).toISOString()
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching production data',
            error: error.message
        });
    }
});

app.get('/api/oee-history', async (req, res) => {
    try {
        // Include shift in projection
        const oeeHistory = await OEE.find({}, 'date shift oee')
            .sort({ date: -1, shift: -1 });

        if (!oeeHistory || oeeHistory.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No OEE history found'
            });
        }

        // Format response to include shift
        const formattedHistory = oeeHistory.map(record => ({
            date: getISTDateTime(record.date).toISOString(),
            shift: record.shift,
            oee: (record.oee * 100).toFixed(2)
        }));

        res.status(200).json(formattedHistory);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching OEE history',
            error: error.message
        });
    }
});

app.get('/api/hourly-production', async (req, res) => {
    try {
        // Get the latest part details record to get shift and date
        const latestRecord = await PartDetails.findOne()
            .sort({ date: -1, shift: -1 })
            .limit(1);

        if (!latestRecord) {
            return res.status(404).json({
                success: false,
                message: 'No production data found'
            });
        }

        const shift = latestRecord.shift;
        let { startOfDay, endOfDay } = getISTDayBounds(latestRecord.date);
        startOfDay = new Date(startOfDay);
        endOfDay = new Date(endOfDay);

        // Get all updates for this shift
        const allUpdates = await PartDetails.find({
            shift,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        }).sort({ lastUpdated: 1 }); // Sort by update time

        // Define shift hours
        const shiftHours = shift === 'shift-1' 
            ? ['08:30', '09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30', '17:30', '18:30'] 
            : ['20:30', '21:30', '22:30', '23:30', '00:30', '01:30', '02:30', '03:30', '04:30', '05:30', '06:30'];

        // Initialize hourly counts
        const hourlyProduction = {
            'BIG CYLINDER': {},
            'SMALL CYLINDER': {}
        };

        shiftHours.forEach((hour, index) => {
            const nextHour = shiftHours[index + 1] || (shift === 'shift-1' ? '19:00' : '07:00');
            
            // Filter updates within this hour
            const updatesInHour = allUpdates.filter(update => {
                const updateTime = getISTDateTime(update.lastUpdated)
                    .toLocaleTimeString('en-US', { 
                        hour12: false, 
                        hour: '2-digit', 
                        minute: '2-digit'
                    });
                return updateTime >= hour && updateTime < nextHour;
            });

            // Get last count for each part in this hour
            const bigCylinder = updatesInHour
                .filter(u => u.partNumber === '9253010242')
                .pop();
            const smallCylinder = updatesInHour
                .filter(u => u.partNumber === '9253020232')
                .pop();

            hourlyProduction['BIG CYLINDER'][hour] = bigCylinder ? bigCylinder.count : 0;
            hourlyProduction['SMALL CYLINDER'][hour] = smallCylinder ? smallCylinder.count : 0;
        });

        // Calculate differences to get actual hourly production
        const hourlyOutput = {
            'BIG CYLINDER': {},
            'SMALL CYLINDER': {}
        };

        Object.keys(hourlyProduction).forEach(part => {
            const hours = Object.keys(hourlyProduction[part]);
            hours.forEach((hour, index) => {
                const currentCount = hourlyProduction[part][hour];
                const previousCount = index > 0 ? hourlyProduction[part][hours[index - 1]] : 0;
                hourlyOutput[part][hour] = currentCount - previousCount;
            });
        });

        res.status(200).json({
            success: true,
            shift: shift,
            date: getISTDateTime(latestRecord.date).toISOString(),
            hourlyProduction: hourlyOutput
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching hourly production data',
            error: error.message
        });
    }
});


app.get('/api/monthly-stats', async (req, res) => {
    try {
        // Get current month's date range
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        // Set time to start and end of days
        startOfMonth.setUTCHours(0, 0, 0, 0);
        endOfMonth.setUTCHours(23, 59, 59, 999);

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
                start: startOfMonth.toISOString(),
                end: endOfMonth.toISOString()
            },
            stats: {
                'BIG CYLINDER': {
                    partNumber: '9253010242',
                    totalProduction: 0,
                    goodCount: 0,
                    totalRejections: 0,
                    rejectionsByReason: []
                },
                'SMALL CYLINDER': {
                    partNumber: '9253020232',
                    totalProduction: 0,
                    goodCount: 0,
                    totalRejections: 0,
                    rejectionsByReason: []
                }
            }
        };

        // Process production data
        productionData.forEach(prod => {
            const partName = prod._id === '9253010242' ? 'BIG CYLINDER' : 'SMALL CYLINDER';
            monthlyStats.stats[partName].totalProduction = prod.totalProduction;
        });

        // Process rejection data
        rejectionData.forEach(rej => {
            const partName = rej._id === '9253010242' ? 'BIG CYLINDER' : 'SMALL CYLINDER';
            monthlyStats.stats[partName].totalRejections = rej.totalRejections;
            monthlyStats.stats[partName].rejectionsByReason = rej.rejectionsByReason;
            monthlyStats.stats[partName].goodCount = 
                monthlyStats.stats[partName].totalProduction - rej.totalRejections;
        });

        res.status(200).json({
            success: true,
            data: monthlyStats
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching monthly statistics',
            error: error.message
        });
    }
});

app.get('/api/monthly-runtime', async (req, res) => {
    try {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        startOfMonth.setUTCHours(0, 0, 0, 0);
        endOfMonth.setUTCHours(23, 59, 59, 999);

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
                    totalPlannedTime: { $sum: PLANNED_PRODUCTION_TIME }
                }
            }
        ]);

        // Get stoppage breakdown with renamed fields
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
            }
        ]);

        const totalStopTime = stoppageData.reduce((sum, stop) => sum + stop.duration, 0);

        const runtimeStats = {
            period: {
                start: startOfMonth.toISOString(),
                end: endOfMonth.toISOString()
            },
            stats: {
                totalPlannedTime: oeeData[0]?.totalPlannedTime || 0,
                totalStopTime: totalStopTime,
                actualRunTime: oeeData[0]?.totalRunTime || 0,
                stoppagesByReason: stoppageData
            }
        };

        res.status(200).json({
            success: true,
            data: runtimeStats
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching monthly runtime statistics',
            error: error.message
        });
    }
});

app.listen(port,()=>{
    console.log(`Server is running on port ${port}`);
})
