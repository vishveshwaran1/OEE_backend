const express = require('express');
const router = express.Router();

const productionRoutes = require('./production');
const qualityRoutes = require('./quality');
const oeeRoutes = require('./oee');
const reportRoutes = require('./reports');
const correctionRoutes = require('./correction');
const planActualRoutes = require('./planActual');
const statsRoutes = require('./stats');

router.use('/', productionRoutes);
router.use('/api', qualityRoutes);
router.use('/api', oeeRoutes);
router.use('/api/reports', reportRoutes);
router.use('/api', correctionRoutes);
router.use('/api', planActualRoutes);
router.use('/api', statsRoutes);

module.exports = router;