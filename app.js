const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { PORT } = require('./config/constants');
const { HourlyProduction } = require('./models');
const sendEmail = require('./models/sendemail');
const routes = require('./routes');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
require('./connection');

// Routes
app.use('/', routes);

// Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
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

       

        // If not found in PlanActual, try PartDetails
        const latestPartDetails = await PartDetails.findOne({
            partNumber: partNumberStr
        })
        .sort({
            date: -1,
            shift: -1
        })
        .limit(1);

        // If not found in either model
        if (!latestPartDetails) {
            return res.status(404).json({
                success: false,
                message: 'No production data found for this part number'
            });
        }

        // Return data from PartDetails
        return res.status(200).json({
            success: true,
            partNumber: latestPartDetails.partNumber,
            plan: latestPartDetails.target,  // target in PartDetails is equivalent to plan
            actual: latestPartDetails.count, // count in PartDetails is equivalent to actual
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

// Cron job for checking missing shift entries
cron.schedule('59 7 * * *', async () => {
  try {
    const testDate = '2025-07-12';

console.log("Manually testing for date:", testDate);

        const shift1 = await HourlyProduction.findOne({
  shift: 'shift-1',
  date: testDate,  
});

console.log(shift1);

        const shift2 = await HourlyProduction.findOne({
      shift: 'shift-2',
      date: testDate,
    });

    console.log('Shift-1 record:', shift1 ? 'Found' : 'Missing');
    console.log('Shift-2 record:', shift2 ? 'Found' : 'Missing');

    let missingShifts = [];
    if (!shift1) missingShifts.push('Shift-1');
    if (!shift2) missingShifts.push('Shift-2');

    if (missingShifts.length > 0) {
  const detailedMessage = `
Dear Admin,

This is an automated notification from the OEE Monitoring System regarding the shift-wise production entry status for the date: ${testDate}.

After checking the system records, we found that the following shift data entries are missing:

Missing Shift(s):
${missingShifts.join(', ')}

If this issue persists or you believe this message was received in error, please investigate or escalate it to the relevant team immediately.

Thank you for your attention to this matter.

Best regards,  
OEE Monitoring System  
[Do not reply to this automated email]
  `;

  await sendEmail({
    to: 'vichu2395@gmail.com',
    subject: `Missing Shift Entry Alert for ${testDate}`,
    text: detailedMessage,
  });

  console.log(`Email sent: Missing ${missingShifts.join(', ')} for ${testDate}`);
} else {
  console.log(`All shift data present for ${testDate}`);
}

  } catch (err) {
    console.error('Error in cron job:', err.message);
  }
});
