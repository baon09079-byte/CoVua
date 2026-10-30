const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

router.get('/history/:userId', gameController.getHistory);
router.get('/stats/:userId', gameController.getStats);
router.get('/:id', gameController.getGameById);
router.post('/save', gameController.saveGame);

module.exports = router;

