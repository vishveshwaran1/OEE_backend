const express = require('express');
const router = express.Router();
const { PlanActual } = require('../models');

// POST /api/set-plan
router.post('/set-plan', async (req, res) => {
    try {
        const { partNumber, plan, date, shift } = req.body;

        if (!partNumber || !plan || !date || !shift) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: partNumber, plan, date, shift'
            });
        }

        const planActual = await PlanActual.findOneAndUpdate(
            {
                partNumber: partNumber.toString(),
                date,
                shift
            },
            {
                partNumber: partNumber.toString(),
                plan,
                date,
                shift
            },
            { upsert: true, new: true }
        );

        res.status(200).json({
            success: true,
            message: 'Plan set successfully',
            data: planActual
        });

    } catch (error) {
        console.error('Error in /api/set-plan:', error);
        res.status(500).json({
            success: false,
            message: 'Error setting plan',
            error: error.message
        });
    }
});

// GET /api/recent-plan-actual
router.get('/recent-plan-actual', async (req, res) => {
    try {
        const recentRecords = await PlanActual.find()
            .sort({ 
                date: -1,
                shift: -1 
            })
            .limit(8);

        if (!recentRecords || recentRecords.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No plan-actual records found'
            });
        }

        const formattedData = recentRecords.map(record => ({
            plan: record.plan,
            actual: record.actual,
            date: record.date,
            shift: record.shift
        }));

        res.status(200).json({
            success: true,
            data: formattedData
        });

    } catch (error) {
        console.error('Error in /api/recent-plan-actual:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recent plan-actual data',
            error: error.message
        });
    }
});

module.exports = router;