(function () {
  'use strict';

  // 7.7.0B: signatures are cropped, centered, and thickened before snapshots are created.

  function SignaturePadController(options) {
    this.canvas = options.canvas;
    this.preview = options.preview;
    this.clearButton = options.clearButton;
    this.savedRadio = options.savedRadio;
    this.drawnRadio = options.drawnRadio;
    this.modePanelSaved = options.modePanelSaved;
    this.modePanelDrawn = options.modePanelDrawn;
    this.savedStatus = options.savedStatus;
    this.savePersonalCheckbox = options.savePersonalCheckbox || null;
    this._drawing = false;
    this._hasInk = false;
    this._lastPoint = null;
    this._inkBounds = null;
    this._savedOriginalDataUrl = '';
    this._normalizedSavedDataUrl = '';
    this._savedNormalizationPending = false;
    this._boundResize = this.resize.bind(this);
    this._bind();
    this.resize();
  }

  SignaturePadController.prototype._bind = function () {
    var self = this;
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave'].forEach(function (eventName) {
      self.canvas.addEventListener(eventName, function (event) {
        if (eventName === 'pointerdown') self._start(event);
        else if (eventName === 'pointermove') self._move(event);
        else self._end(event);
      });
    });
    this.clearButton.addEventListener('click', function () { self.clear(); });
    this.savedRadio.addEventListener('change', function () { self._renderMode(); });
    this.drawnRadio.addEventListener('change', function () { self._renderMode(); });
    window.addEventListener('resize', this._boundResize);
  };

  SignaturePadController.prototype._point = function (event) {
    var rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  SignaturePadController.prototype._start = function (event) {
    if (!this.drawnRadio.checked) return;
    event.preventDefault();
    try { this.canvas.setPointerCapture(event.pointerId); } catch (ignore) {}
    this._drawing = true;
    this._lastPoint = this._point(event);
    this._expandInkBounds(this._lastPoint.x, this._lastPoint.y, 10);
  };

  SignaturePadController.prototype._move = function (event) {
    if (!this._drawing || !this._lastPoint || !this.drawnRadio.checked) return;
    event.preventDefault();
    var point = this._point(event);
    var context = this.canvas.getContext('2d');
    context.beginPath();
    context.moveTo(this._lastPoint.x, this._lastPoint.y);
    context.lineTo(point.x, point.y);
    context.lineWidth = window.matchMedia && window.matchMedia('(max-width: 720px)').matches ? 6.2 : 5.6;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#181411';
    context.stroke();
    this._lastPoint = point;
    this._hasInk = true;
    this._expandInkBounds(point.x, point.y, context.lineWidth + 4);
  };

  SignaturePadController.prototype._end = function (event) {
    if (!this._drawing) return;
    event.preventDefault();
    this._drawing = false;
    this._lastPoint = null;
  };

  SignaturePadController.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    var snapshot = this._hasInk ? this.canvas.toDataURL('image/png') : '';
    var ratio = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(rect.width * ratio);
    this.canvas.height = Math.floor(rect.height * ratio);
    var context = this.canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, rect.width, rect.height);
    if (snapshot) {
      var image = new Image();
      var self = this;
      image.onload = function () {
        context.drawImage(image, 0, 0, rect.width, rect.height);
        self._hasInk = true;
      };
      image.src = snapshot;
    }
  };

  SignaturePadController.prototype.clear = function () {
    var rect = this.canvas.getBoundingClientRect();
    var context = this.canvas.getContext('2d');
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, rect.width, rect.height);
    this._hasInk = false;
    this._inkBounds = null;
  };

  SignaturePadController.prototype._expandInkBounds = function (x, y, padding) {
    var p = Number(padding || 0);
    if (!this._inkBounds) {
      this._inkBounds = { left: x - p, top: y - p, right: x + p, bottom: y + p };
      return;
    }
    this._inkBounds.left = Math.min(this._inkBounds.left, x - p);
    this._inkBounds.top = Math.min(this._inkBounds.top, y - p);
    this._inkBounds.right = Math.max(this._inkBounds.right, x + p);
    this._inkBounds.bottom = Math.max(this._inkBounds.bottom, y + p);
  };

  SignaturePadController.prototype._exportCroppedDataUrl = function () {
    return normalizeSignatureSourceToDataUrl(this.canvas);
  };

  SignaturePadController.prototype.setSavedAvailable = function (available, dataUrl) {
    var self = this;
    this.savedRadio.disabled = !available;
    this._savedOriginalDataUrl = available ? String(dataUrl || '') : '';
    this._normalizedSavedDataUrl = '';
    this._savedNormalizationPending = false;

    if (available && dataUrl) {
      this.savedRadio.checked = true;
      this.drawnRadio.checked = false;
      this.preview.src = dataUrl;
      this.preview.hidden = false;
      this.savedStatus.textContent = '正在最佳化預存簽名（裁白邊、置中及加粗）…';
      this._savedNormalizationPending = true;
      normalizeSignatureDataUrl(dataUrl, function (normalized) {
        self._savedNormalizationPending = false;
        self._normalizedSavedDataUrl = normalized || self._savedOriginalDataUrl;
        if (self._normalizedSavedDataUrl) self.preview.src = self._normalizedSavedDataUrl;
        self.savedStatus.textContent = '已載入並最佳化本人預存簽名；正式送出時才會建立本次簽核紀錄。';
      });
    } else {
      this.savedRadio.checked = false;
      this.drawnRadio.checked = true;
      this.preview.removeAttribute('src');
      this.preview.hidden = true;
      this.savedStatus.textContent = '目前沒有預存簽名，請改用手寫簽名。';
    }
    this._renderMode();
  };

  SignaturePadController.prototype._renderMode = function () {
    this.modePanelSaved.hidden = !this.savedRadio.checked;
    this.modePanelDrawn.hidden = !this.drawnRadio.checked;
    if (this.savePersonalCheckbox) this.savePersonalCheckbox.disabled = !this.drawnRadio.checked;
    if (this.drawnRadio.checked) window.setTimeout(this.resize.bind(this), 0);
  };

  SignaturePadController.prototype.getSignaturePayload = function () {
    if (this.savedRadio.checked && !this.savedRadio.disabled) {
      if (!this._normalizedSavedDataUrl && this.preview && this.preview.complete && this.preview.naturalWidth) {
        try { this._normalizedSavedDataUrl = normalizeSignatureSourceToDataUrl(this.preview); } catch (ignore) {}
      }
      if (this._savedNormalizationPending && !this._normalizedSavedDataUrl) {
        throw new Error('預存簽名正在最佳化，請稍候片刻再送出。');
      }
      return {
        mode: 'saved',
        dataUrl: this._normalizedSavedDataUrl || this._savedOriginalDataUrl || ''
      };
    }
    if (this.drawnRadio.checked) {
      if (!this._hasInk) throw new Error('請先完成手寫簽名。');
      return {
        mode: 'drawn',
        dataUrl: this._exportCroppedDataUrl(),
        saveAsPersonal: this.savePersonalCheckbox ? Boolean(this.savePersonalCheckbox.checked) : true
      };
    }
    throw new Error('請選擇簽名方式。');
  };

  SignaturePadController.prototype.reset = function () {
    this.clear();
    this.savedRadio.checked = !this.savedRadio.disabled;
    this.drawnRadio.checked = this.savedRadio.disabled;
    this._renderMode();
  };

  function normalizeSignatureDataUrl(dataUrl, callback) {
    var image = new Image();
    image.onload = function () {
      try { callback(normalizeSignatureSourceToDataUrl(image)); }
      catch (error) { callback(String(dataUrl || '')); }
    };
    image.onerror = function () { callback(String(dataUrl || '')); };
    image.src = dataUrl;
  }

  function normalizeSignatureSourceToDataUrl(source) {
    var sourceWidth = Number(source.naturalWidth || source.width || 0);
    var sourceHeight = Number(source.naturalHeight || source.height || 0);
    if (!sourceWidth || !sourceHeight) throw new Error('簽名圖片尺寸無效。');

    var maxWidth = 1600;
    var maxHeight = 700;
    var scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
    var width = Math.max(1, Math.round(sourceWidth * scale));
    var height = Math.max(1, Math.round(sourceHeight * scale));
    var scan = document.createElement('canvas');
    scan.width = width;
    scan.height = height;
    var scanContext = scan.getContext('2d', { willReadFrequently: true });
    scanContext.fillStyle = '#fff';
    scanContext.fillRect(0, 0, width, height);
    scanContext.drawImage(source, 0, 0, width, height);

    var pixels = scanContext.getImageData(0, 0, width, height);
    var data = pixels.data;
    var left = width;
    var top = height;
    var right = -1;
    var bottom = -1;
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        var index = (y * width + x) * 4;
        var alpha = data[index + 3];
        var luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
        if (alpha > 15 && luminance < 246) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (right < left || bottom < top) return scan.toDataURL('image/png');

    var sourcePadding = Math.max(3, Math.round(Math.max(right - left, bottom - top) * 0.015));
    left = Math.max(0, left - sourcePadding);
    top = Math.max(0, top - sourcePadding);
    right = Math.min(width - 1, right + sourcePadding);
    bottom = Math.min(height - 1, bottom + sourcePadding);
    var cropWidth = Math.max(1, right - left + 1);
    var cropHeight = Math.max(1, bottom - top + 1);
    var cropPixels = scanContext.getImageData(left, top, cropWidth, cropHeight);

    var inkCanvas = document.createElement('canvas');
    inkCanvas.width = cropWidth;
    inkCanvas.height = cropHeight;
    var inkContext = inkCanvas.getContext('2d');
    var inkPixels = inkContext.createImageData(cropWidth, cropHeight);
    var sourceData = cropPixels.data;
    var inkData = inkPixels.data;
    for (var i = 0; i < sourceData.length; i += 4) {
      var sourceAlpha = sourceData[i + 3] / 255;
      var sourceLuminance = sourceData[i] * 0.299 + sourceData[i + 1] * 0.587 + sourceData[i + 2] * 0.114;
      var darkness = Math.max(0, 250 - sourceLuminance);
      if (sourceAlpha <= 0.05 || darkness <= 2) continue;
      inkData[i] = 22;
      inkData[i + 1] = 18;
      inkData[i + 2] = 15;
      inkData[i + 3] = Math.max(70, Math.min(255, Math.round(darkness * 3.4 * sourceAlpha)));
    }
    inkContext.putImageData(inkPixels, 0, 0);

    var margin = Math.max(10, Math.round(Math.max(cropWidth, cropHeight) * 0.035));
    var output = document.createElement('canvas');
    output.width = cropWidth + margin * 2;
    output.height = cropHeight + margin * 2;
    var outputContext = output.getContext('2d');
    outputContext.fillStyle = '#fff';
    outputContext.fillRect(0, 0, output.width, output.height);

    var radius = Math.max(1, Math.min(2, Math.round(Math.max(cropWidth, cropHeight) / 650)));
    outputContext.globalAlpha = 0.62;
    for (var offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (var offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (offsetX * offsetX + offsetY * offsetY > radius * radius + 1) continue;
        outputContext.drawImage(inkCanvas, margin + offsetX, margin + offsetY);
      }
    }
    outputContext.globalAlpha = 1;
    outputContext.drawImage(inkCanvas, margin, margin);
    return output.toDataURL('image/png');
  }

  window.V3SignaturePadController = SignaturePadController;
})();
