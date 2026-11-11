const express = require('express');
const router = express.Router();
const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./archive.controller');

router.use(authenticateToken, requireRoles('admin'));
router.get('/', ctrl.listArchivedRecords);
router.post('/:id/restore', ctrl.restoreArchivedRecord);
router.delete('/:id', ctrl.deleteArchivedRecord);

module.exports = router;
