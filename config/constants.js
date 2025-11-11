module.exports = {
    IDEAL_CYCLE_TIME: 36, // seconds
    PLANNED_PRODUCTION_TIME: (10 * 60) + 30, // 10 hours 30 minutes in minutes
    PORT: process.env.PORT || 3000,
    OFFLINE_THRESHOLD_MINUTES: 10, // Production is considered offline if no activity for this many minutes
    PART_NUMBERS: {
        BIG_CYLINDER: '9253020232',
        SMALL_CYLINDER: '9253010242'
    },
    PART_NAMES: {
        BIG_CYLINDER: 'BIG CYLINDER',
        SMALL_CYLINDER: 'SMALL CYLINDER'
    }
};