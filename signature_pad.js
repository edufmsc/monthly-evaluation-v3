(function () {
  'use strict';

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
  };

  SignaturePadController.prototype._move = function (event) {
    if (!this._drawing || !this._lastPoint || !this.drawnRadio.checked) return;
    event.preventDefault();
    var point = this._point(event);
    var context = this.canvas.getContext('2d');
    context.beginPath();
    context.moveTo(this._lastPoint.x, this._lastPoint.y);
    context.lineTo(point.x, point.y);
    context.lineWidth = 2.4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#2d241f';
    context.stroke();
    this._lastPoint = point;
    this._hasInk = true;
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
  };

  SignaturePadController.prototype.setSavedAvailable = function (available, dataUrl) {
    this.savedRadio.disabled = !available;
    if (available && dataUrl) {
      this.savedRadio.checked = true;
      this.drawnRadio.checked = false;
      this.preview.src = dataUrl;
      this.preview.hidden = false;
      this.savedStatus.textContent = '已載入本人預存簽名；正式送出時才會建立本次簽核紀錄。';
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
    if (this.savedRadio.checked && !this.savedRadio.disabled) return { mode: 'saved' };
    if (this.drawnRadio.checked) {
      if (!this._hasInk) throw new Error('請先完成手寫簽名。');
      return {
        mode: 'drawn',
        dataUrl: this.canvas.toDataURL('image/png'),
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

  window.V3SignaturePadController = SignaturePadController;
})();
