'use strict';

const crypto = require('crypto');

function getKey() {
  const secret = process.env.ESP32_CONFIG_SECRET;
  if (!secret) throw new Error('ESP32_CONFIG_SECRET is not set');
  // Expect a 64‑hex‑character (32‑byte) key
  const buf = Buffer.from(secret, 'hex');
  if (buf.length !== 32) throw new Error('ESP32_CONFIG_SECRET must be a 64‑hex‑character string (32‑byte key)');
  return buf;
}

function encryptPassword(password) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96‑bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');
  // Format: v1:iv:tag:ciphertext
  return `v1:${iv.toString('base64')}:${tag}:${encrypted}`;
}

function decryptPassword(ciphertext) {
  const key = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid encrypted password format');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const encrypted = parts[3];
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encryptPassword, decryptPassword };