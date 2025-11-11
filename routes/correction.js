const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const { Correction } = require('../models');

// POST /api/correction
router.post('/correction', async (req, res) => {
    try {
        const { problem, date, correctiveAction } = req.body;

        if (!problem || !date || !correctiveAction) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: problem, date, correctiveAction'
            });
        }

        const formattedDate = moment(date).format('YYYY-MM-DD');
        const correction = new Correction({
            problem,
            date: formattedDate,
            correctiveAction
        });

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

module.exports = router;