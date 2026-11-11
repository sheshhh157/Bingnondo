const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./admin.settings.controller');
const qrCtrl = require('./payment-qr-codes.controller');

// All system-settings routes are admin-only
router.use(authenticateToken, requireRoles('admin'));

// ─── Business Hours ───────────────────────────────────────────────────────────
router.get('/business-hours',        ctrl.getBusinessHours);  // GET /api/admin/system-settings/business-hours
router.put('/business-hours',        ctrl.saveBusinessHours); // PUT /api/admin/system-settings/business-hours

// ─── Menu Categories ──────────────────────────────────────────────────────────
router.get   ('/menu-categories',     ctrl.listCategories);  // GET    /api/admin/system-settings/menu-categories
router.post  ('/menu-categories',     ctrl.createCategory);  // POST   /api/admin/system-settings/menu-categories
router.patch ('/menu-categories/:id', ctrl.updateCategory);  // PATCH  /api/admin/system-settings/menu-categories/:id
router.delete('/menu-categories/:id', ctrl.deleteCategory);  // DELETE /api/admin/system-settings/menu-categories/:id
router.put   ('/menu-categories/:id/variants', ctrl.updateCategoryVariants); // PUT /api/admin/system-settings/menu-categories/:id/variants

// ─── Menu Variants (reusable variant groups) ──────────────────────────────────
router.get   ('/variants',     ctrl.listVariantGroups);  // GET    /api/admin/system-settings/variants
router.post  ('/variants',     ctrl.createVariantGroup); // POST   /api/admin/system-settings/variants
router.patch ('/variants/:id', ctrl.updateVariantGroup); // PATCH  /api/admin/system-settings/variants/:id
router.delete('/variants/:id', ctrl.deleteVariantGroup); // DELETE /api/admin/system-settings/variants/:id

// ─── Notification Settings ────────────────────────────────────────────────────
router.get('/notifications', ctrl.getNotificationSettings);  // GET /api/admin/system-settings/notifications
router.put('/notifications', ctrl.saveNotificationSettings); // PUT /api/admin/system-settings/notifications

// ─── Delivery Fee ─────────────────────────────────────────────────────────────
router.get('/delivery-fee', ctrl.getDeliveryFee);  // GET /api/admin/system-settings/delivery-fee
router.put('/delivery-fee', ctrl.saveDeliveryFee); // PUT /api/admin/system-settings/delivery-fee

// ─── Payment QR Codes ─────────────────────────────────────────────────────────
router.get   ('/qr-codes',     qrCtrl.listQrCodes);    // GET    /api/admin/system-settings/qr-codes
router.post  ('/qr-codes',     qrCtrl.createQrCode);   // POST   /api/admin/system-settings/qr-codes
router.patch ('/qr-codes/:id', qrCtrl.updateQrCode);   // PATCH  /api/admin/system-settings/qr-codes/:id
router.delete('/qr-codes/:id', qrCtrl.deleteQrCode);   // DELETE /api/admin/system-settings/qr-codes/:id

router.get('/esp32-devices', ctrl.listEsp32Devices);          // GET /api/admin/system-settings/esp32-devices
router.put('/esp32-devices/:code/wifi', ctrl.saveEsp32Wifi); // PUT /api/admin/system-settings/esp32-devices/:code/wifi
router.put('/esp32-devices/:code/wifi/resend', ctrl.resendEsp32Wifi);   // PUT /api/admin/system-settings/esp32-devices/:code/wifi/resend
router.get('/esp32-devices/:code/history', ctrl.esp32ConfigHistory);    // GET /api/admin/system-settings/esp32-devices/:code/history
router.post('/esp32-devices/:code/test-connection', ctrl.testEsp32Connection); // POST /api/admin/system-settings/esp32-devices/:code/test-connection
router.put('/esp32-devices/wifi/bulk', ctrl.bulkSaveEsp32Wifi); // PUT /api/admin/system-settings/esp32-devices/wifi/bulk

module.exports = router;