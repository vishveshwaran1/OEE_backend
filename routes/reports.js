const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const { 
    PartDetails, 
    HourlyProduction, 
    Rejection, 
    StopTime, 
    OEE, 
    Correction, 
    PlanActual 
} = require('../models');

// GET /production
router.get('/production', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Both startDate and endDate are required'
            });
        }

        const start = moment(startDate).startOf('day').toISOString();
        const end = moment(endDate).endOf('day').toISOString();

        const productionData = await PartDetails.find({
            date: {
                $gte: start,
                $lte: end
            }
        }).sort({ date: 1, shift: 1 });

        res.status(200).json({
            success: true,
            data: productionData
        });

    } catch (error) {
        console.error('Error in /api/reports/production:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating production report',
            error: error.message
        });
    }
});

// GET /hourly-production
router.get('/hourly-production', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Both startDate and endDate are required'
            });
        }

        const start = moment(startDate).startOf('day').toISOString();
        const end = moment(endDate).endOf('day').toISOString();

        const hourlyData = await HourlyProduction.find({
            date: {
                $gte: start,
                $lte: end
            }
        }).sort({ date: 1, shift: 1, hour: 1 });

        res.status(200).json({
            success: true,
            data: hourlyData
        });

    } catch (error) {
        console.error('Error in /api/reports/hourly-production:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating hourly production report',
            error: error.message
        });
    }
});

// GET /rejections
router.get('/rejections', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Both startDate and endDate are required'
            });
        }

        const start = moment(startDate).startOf('day').toISOString();
        const end = moment(endDate).endOf('day').toISOString();

        const rejectionData = await Rejection.find({
            date: {
                $gte: start,
                $lte: end
            }
        }).sort({ date: 1, shift: 1 });

        res.status(200).json({
            success: true,
            data: rejectionData
        });

    } catch (error) {
        console.error('Error in /api/reports/rejections:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating rejections report',
            error: error.message
        });
    }
});

// GET /stoptimes
router.get('/stoptimes', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Both startDate and endDate are required'
            });
        }

        const start = moment(startDate).startOf('day').toISOString();
        const end = moment(endDate).endOf('day').toISOString();

        const stopTimeData = await StopTime.find({
            date: {
                $gte: start,
                $lte: end
            }
        }).sort({ date: 1, shift: 1 });

        res.status(200).json({
            success: true,
            data: stopTimeData
        });

    } catch (error) {
        console.error('Error in /api/reports/stoptimes:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating stop times report',
            error: error.message
        });
    }
});

// GET /oee
router.get('/oee', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Both startDate and endDate are required'
            });
        }

        const start = moment(startDate).startOf('day').toISOString();
        const end = moment(endDate).endOf('day').toISOString();

        const oeeData = await OEE.find({
            date: {
                $gte: start,
                $lte: end
            }
        }).sort({ date: 1, shift: 1 });

        res.status(200).json({
            success: true,
            data: oeeData
        });

    } catch (error) {
        console.error('Error in /api/reports/oee:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating OEE report',
            error: error.message
        });
    }
});

// GET /corrections
router.get('/corrections', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Both startDate and endDate are required'
            });
        }

        const start = moment(startDate).startOf('day').toISOString();
        const end = moment(endDate).endOf('day').toISOString();

        const correctionData = await Correction.find({
            date: {
                $gte: start,
                $lte: end
            }
        }).sort({ date: 1 });

        res.status(200).json({
            success: true,
            data: correctionData
        });

    } catch (error) {
        console.error('Error in /api/reports/corrections:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating corrections report',
            error: error.message
        });
    }
});

// GET /plan-actual
router.get('/plan-actual', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Both startDate and endDate are required'
            });
        }

        const start = moment(startDate).startOf('day').toISOString();
        const end = moment(endDate).endOf('day').toISOString();

        const planActualData = await PlanActual.find({
            date: {
                $gte: start,
                $lte: end
            }
        }).sort({ date: 1, shift: 1 });

        res.status(200).json({
            success: true,
            data: planActualData
        });

    } catch (error) {
        console.error('Error in /api/reports/plan-actual:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating plan-actual report',
            error: error.message
        });
    }
});

module.exports = router;