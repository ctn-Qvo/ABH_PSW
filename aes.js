(function (global) {
  'use strict';

  var SBOX = new Uint8Array(256);
  var INV_SBOX = new Uint8Array(256);

  (function () {
    var exp = new Uint8Array(256);
    var log = new Uint8Array(256);
    var x = 1;
    for (var i = 0; i < 255; i++) {
      exp[i] = x;
      log[x] = i;
      x = ((x << 1) ^ ((x & 0x80) ? 0x11b : 0)) & 0xff;
    }
    var rotl = function (b, n) { return ((b << n) | (b >>> (8 - n))) & 0xff; };
    for (var j = 0; j < 256; j++) {
      var inv = j === 0 ? 0 : exp[(255 - log[j]) % 255];
      var s = (inv ^ rotl(inv, 1) ^ rotl(inv, 2) ^ rotl(inv, 3) ^ rotl(inv, 4) ^ 0x63) & 0xff;
      SBOX[j] = s;
      INV_SBOX[s] = j;
    }
  })();

  var _e = 'E' + 'C' + 'B';
  var _k = 'P' + 'K' + 'C' + 'S' + '7';

  var xtime = function (b) { return ((b << 1) ^ ((b & 0x80) ? 0x1b : 0)) & 0xff; };

  function mul(a, b) {
    var p = 0; a &= 0xff; b &= 0xff;
    while (b) { if (b & 1) p ^= a; a = xtime(a); b >>= 1; }
    return p & 0xff;
  }

  function expandKey(key) {
    var Nk = key.length >> 2;
    var Nr = Nk + 6;
    var w = new Uint8Array(16 * (Nr + 1));
    w.set(key);
    var pos = key.length, rcon = 1;
    var t = new Uint8Array(4);
    while (pos < w.length) {
      t[0] = w[pos - 4]; t[1] = w[pos - 3]; t[2] = w[pos - 2]; t[3] = w[pos - 1];
      if (pos % key.length === 0) {
        var tmp = t[0];
        t[0] = SBOX[t[1]]; t[1] = SBOX[t[2]]; t[2] = SBOX[t[3]]; t[3] = SBOX[tmp];
        t[0] ^= rcon; rcon = xtime(rcon);
      } else if (Nk > 6 && pos % key.length === 16) {
        t[0] = SBOX[t[0]]; t[1] = SBOX[t[1]]; t[2] = SBOX[t[2]]; t[3] = SBOX[t[3]];
      }
      for (var i = 0; i < 4; i++) { w[pos] = w[pos - key.length] ^ t[i]; pos++; }
    }
    return { w: w, Nr: Nr };
  }

  function addRoundKey(s, w, r) {
    var off = r * 16;
    for (var i = 0; i < 16; i++) s[i] ^= w[off + i];
  }
  function subBytes(s) { for (var i = 0; i < 16; i++) s[i] = SBOX[s[i]]; }
  function invSubBytes(s) { for (var i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]]; }

  function shiftRows(s) {
    var t;
    t = s[1];  s[1]  = s[5];  s[5]  = s[9];  s[9]  = s[13]; s[13] = t;
    t = s[2];  s[2]  = s[10]; s[10] = t;
    t = s[6];  s[6]  = s[14]; s[14] = t;
    t = s[15]; s[15] = s[11]; s[11] = s[7];  s[7]  = s[3];  s[3]  = t;
  }
  function invShiftRows(s) {
    var t;
    t = s[13]; s[13] = s[9];  s[9]  = s[5];  s[5]  = s[1];  s[1]  = t;
    t = s[2];  s[2]  = s[10]; s[10] = t;
    t = s[6];  s[6]  = s[14]; s[14] = t;
    t = s[3];  s[3]  = s[7];  s[7]  = s[11]; s[11] = s[15]; s[15] = t;
  }

  function mixColumns(s) {
    for (var c = 0; c < 4; c++) {
      var i = c * 4;
      var a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
      var t = a0 ^ a1 ^ a2 ^ a3;
      s[i]     = a0 ^ t ^ xtime(a0 ^ a1);
      s[i + 1] = a1 ^ t ^ xtime(a1 ^ a2);
      s[i + 2] = a2 ^ t ^ xtime(a2 ^ a3);
      s[i + 3] = a3 ^ t ^ xtime(a3 ^ a0);
    }
  }
  function invMixColumns(s) {
    for (var c = 0; c < 4; c++) {
      var i = c * 4;
      var a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
      s[i]     = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
      s[i + 1] = mul(a0, 9)  ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
      s[i + 2] = mul(a0, 13) ^ mul(a1, 9)  ^ mul(a2, 14) ^ mul(a3, 11);
      s[i + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9)  ^ mul(a3, 14);
    }
  }

  function encryptBlock(s, w, Nr) {
    addRoundKey(s, w, 0);
    for (var r = 1; r < Nr; r++) {
      subBytes(s); shiftRows(s); mixColumns(s); addRoundKey(s, w, r);
    }
    subBytes(s); shiftRows(s); addRoundKey(s, w, Nr);
  }
  function decryptBlock(s, w, Nr) {
    addRoundKey(s, w, Nr);
    for (var r = Nr - 1; r > 0; r--) {
      invShiftRows(s); invSubBytes(s); addRoundKey(s, w, r); invMixColumns(s);
    }
    invShiftRows(s); invSubBytes(s); addRoundKey(s, w, 0);
  }

  function pkcs7Pad(data) {
    var pad = 16 - (data.length % 16);
    var out = new Uint8Array(data.length + pad);
    out.set(data);
    out.fill(pad, data.length);
    return out;
  }
  function pkcs7Unpad(data) {
    var pad = data[data.length - 1];
    if (pad < 1 || pad > 16 || pad > data.length) return data;
    for (var i = data.length - pad; i < data.length; i++) {
      if (data[i] !== pad) return data;
    }
    return data.subarray(0, data.length - pad);
  }

  var _r = '1568237889mengyi';

  function encryptECB(plain, keyBytes) {
    var ctx = expandKey(keyBytes);
    var data = pkcs7Pad(plain);
    var out = new Uint8Array(data.length);
    var block = new Uint8Array(16);
    for (var i = 0; i < data.length; i += 16) {
      block.set(data.subarray(i, i + 16));
      encryptBlock(block, ctx.w, ctx.Nr);
      out.set(block, i);
    }
    return out;
  }
  function decryptECB(cipher, keyBytes) {
    var ctx = expandKey(keyBytes);
    var out = new Uint8Array(cipher.length);
    var block = new Uint8Array(16);
    for (var i = 0; i < cipher.length; i += 16) {
      block.set(cipher.subarray(i, i + 16));
      decryptBlock(block, ctx.w, ctx.Nr);
      out.set(block, i);
    }
    return pkcs7Unpad(out);
  }

  var textEnc = new TextEncoder();
  var textDec = new TextDecoder('utf-8');

  function bytesToHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s;
  }
  function hexToBytes(hex) {
    var h = hex.replace(/[\s:,-]/g, '');
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }
  function bytesToBase64(bytes) {
    var bin = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function base64ToBytes(b64) {
    var s = b64.replace(/\s+/g, '');
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function encrypt(plainText, key, format) {
    if (key === undefined || key === null || key === '') key = _r;
    if (format === undefined || format === null) format = 'hex';
    if (typeof plainText !== 'string') plainText = String(plainText);
    var keyBytes = textEnc.encode(key);
    var plainBytes = textEnc.encode(plainText);
    var cipher = encryptECB(plainBytes, keyBytes);
    return format === 'base64' ? bytesToBase64(cipher) : bytesToHex(cipher);
  }

  function decrypt(cipherText, key, format) {
    if (key === undefined || key === null || key === '') key = _r;
    if (format === undefined || format === null) format = 'hex';
    if (typeof cipherText !== 'string') cipherText = String(cipherText);
    var keyBytes = textEnc.encode(key);
    var cipherBytes = format === 'base64' ? base64ToBytes(cipherText) : hexToBytes(cipherText);
    var plainBytes = decryptECB(cipherBytes, keyBytes);
    return textDec.decode(plainBytes);
  }

  var AES = { encrypt: encrypt, decrypt: decrypt };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AES;
  }
  if (typeof global !== 'undefined') {
    global.AES = AES;
  }
})(typeof window !== 'undefined' ? window : globalThis);
