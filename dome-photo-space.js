(() => {
  'use strict';

  const radians = Math.PI / 180;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const wrap = angle => ((angle + 180) % 360 + 360) % 360 - 180;
  const pinchDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  class DomePhotoSpace {
    constructor(root, openPhoto) {
      this.root = root;
      this.sphere = root.querySelector('.photo-dome-sphere');
      this.openPhoto = openPhoto;
      this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
      this.tiles = [];
      this.pointers = new Map();
      this.pose = { yaw: 0, pitch: 0, zoom: 1 };
      this.frame = 0;
      this.motionId = 0;
      this.sharpening = 0;

      root.addEventListener('pointerdown', event => this.beginGesture(event));
      root.addEventListener('pointermove', event => this.moveGesture(event));
      window.addEventListener('pointerup', event => this.endGesture(event));
      window.addEventListener('pointercancel', event => this.endGesture(event));
      root.addEventListener('click', event => {
        const button = event.target.closest('.photo-dome-tile');
        if (!button || !this.canInteract() || (event.detail && this.dragged)) return;
        this.stop();
        this.openPhoto(button.dataset.id, button, event);
      });
      root.addEventListener('wheel', event => {
        if (!this.canInteract()) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1;
        this.zoomBy(Math.exp(clamp(-event.deltaY * unit * 0.0018, -0.45, 0.45)));
      }, { passive: false });
      root.addEventListener('keydown', event => this.onKey(event));
      new ResizeObserver(() => this.resize()).observe(root);
    }

    setItems(items) {
      if (items === this.items) return;
      this.items = items;
      this.stop();
      this.pose = { yaw: 0, pitch: 0, zoom: 1 };
      const rows = clamp(Math.round(Math.sqrt(items.length / 5.6)), 1, 7);
      const columns = Math.max(1, Math.ceil(items.length / rows));
      this.yawStep = Math.min(24, 360 / columns);
      this.pitchStep = Math.min(15, this.yawStep);
      const completeTurn = this.yawStep * columns >= 359.99;
      this.yawLimit = completeTurn ? null : (columns - 1) * this.yawStep / 2 + (rows > 1 ? this.yawStep / 4 : 0);
      this.pitchLimit = Math.max(10, (rows - 1) * this.pitchStep / 2 + 5);

      this.tiles = items.map((item, index) => {
        const row = index % rows;
        const column = Math.floor(index / rows);
        const stagger = row % 2 && columns > 1 ? (completeTurn ? 0.5 : 0.25) : 0;
        const yaw = (column - (columns - 1) / 2 + stagger) * this.yawStep;
        const pitch = (row - (rows - 1) / 2) * this.pitchStep;
        const cosPitch = Math.cos(pitch * radians);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'photo-dome-tile';
        button.dataset.id = item.id;
        button.setAttribute('aria-label', `查看 ${item.date} 的照片`);
        button.tabIndex = -1;
        button.style.transform = `rotateY(${yaw}deg) rotateX(${pitch}deg) translateZ(var(--dome-radius))`;
        const image = document.createElement('img');
        image.alt = '';
        image.decoding = 'async';
        image.draggable = false;
        button.append(image);
        return {
          item, button, image, yaw, pitch,
          nx: Math.sin(yaw * radians) * cosPitch,
          ny: -Math.sin(pitch * radians),
          nz: Math.cos(yaw * radians) * cosPitch,
        };
      });
      this.sphere.replaceChildren(...this.tiles.map(tile => tile.button));
      this.resize();
    }

    setActive(active) {
      if (this.active === active) return;
      this.active = active;
      this.root.hidden = !active;
      if (active) this.resize();
      else {
        this.stop();
        this.pointers.clear();
        this.drag = null;
        this.pinch = null;
        this.root.classList.remove('is-turning');
      }
    }

    canInteract() {
      return this.active && !this.root.inert && this.tiles.length > 0;
    }

    resize() {
      if (!this.active) return;
      this.width = this.root.clientWidth;
      this.height = this.root.clientHeight;
      if (!this.width || !this.height || !this.tiles.length) return;
      this.radius = this.width < 600
        ? clamp(this.width * 0.87, 210, 470)
        : clamp(Math.min(this.width * 0.57, this.height * 0.84), 270, 860);
      this.perspective = this.radius * 2.2;
      this.tileWidth = this.radius * 2 * Math.sin(this.yawStep * radians / 2) * 0.88;
      this.tileHeight = this.radius * 2 * Math.sin(this.pitchStep * radians / 2) * 0.88;
      const style = this.root.style;
      style.setProperty('--dome-radius', `${this.radius}px`);
      style.setProperty('--dome-perspective', `${this.perspective}px`);
      style.setProperty('--dome-tile-width', `${this.tileWidth}px`);
      style.setProperty('--dome-tile-height', `${this.tileHeight}px`);
      this.render();
    }

    setPose(yaw, pitch, zoom) {
      this.pose = {
        yaw: this.yawLimit === null ? wrap(yaw) : clamp(yaw, -this.yawLimit, this.yawLimit),
        pitch: clamp(pitch, -this.pitchLimit, this.pitchLimit),
        zoom: clamp(zoom, 0.72, 1.9),
      };
      this.render();
    }

    render() {
      if (!this.active || !this.radius) return;
      const { yaw, pitch, zoom } = this.pose;
      this.sphere.style.transform =
        `translateZ(${-this.radius}px) scale(${zoom}) rotateX(${pitch}deg) rotateY(${yaw}deg)`;
      const cosY = Math.cos(yaw * radians), sinY = Math.sin(yaw * radians);
      const cosX = Math.cos(pitch * radians), sinX = Math.sin(pitch * radians);
      for (const tile of this.tiles) {
        const rotatedZ = tile.nz * cosY - tile.nx * sinY;
        const facing = tile.ny * sinX + rotatedZ * cosX;
        const projection = this.perspective / (this.perspective + this.radius * (1 - facing));
        const scale = projection * zoom;
        const x = this.radius * scale * (tile.nx * cosY + tile.nz * sinY);
        const y = this.radius * scale * (tile.ny * cosX - rotatedZ * sinX);
        const nearScreen = Math.abs(x) < this.width / 2 + this.tileWidth * scale
          && Math.abs(y) < this.height / 2 + this.tileHeight * scale;
        const visible = facing > 0.31 && nearScreen;
        if (visible !== tile.visible) {
          tile.visible = visible;
          tile.button.style.visibility = visible ? 'visible' : 'hidden';
        }
        const tabIndex = visible && Math.abs(x) < this.width / 2 && Math.abs(y) < this.height / 2 ? 0 : -1;
        if (tile.button.tabIndex !== tabIndex) tile.button.tabIndex = tabIndex;
        if (!visible) continue;
        tile.button.style.opacity = (0.6 + 0.4 * clamp((facing - 0.31) / 0.47, 0, 1)).toFixed(2);
        if (!tile.image.hasAttribute('src')) tile.image.src = tile.item.thumb;
        if (facing > 0.66 && Math.max(this.tileWidth, this.tileHeight) * scale * devicePixelRatio > 420) {
          this.sharpen(tile);
        }
      }
    }

    async sharpen(tile) {
      if (tile.sharpened || this.sharpening >= 2 || !tile.item.full) return;
      tile.sharpened = true;
      this.sharpening++;
      const image = new Image();
      image.src = tile.item.full;
      try {
        await image.decode();
        if (tile.button.isConnected) tile.image.src = tile.item.full;
      } catch {
        // Keep the thumbnail when a high-resolution image is unavailable.
      } finally {
        this.sharpening--;
        this.render();
      }
    }

    stop() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.motionId++;
    }

    reset() {
      this.stop();
      this.setPose(0, 0, 1);
    }

    zoomBy(factor) {
      this.stop();
      const { yaw, pitch, zoom } = this.pose;
      this.setPose(yaw, pitch, zoom * factor);
    }

    pointAt(id, onArrival) {
      const tile = this.tiles.find(candidate => candidate.item.id === id);
      if (!tile) return;
      this.stop();
      const motion = this.motionId;
      const start = this.pose;
      const turn = this.yawLimit === null ? wrap(-tile.yaw - start.yaw) : -tile.yaw - start.yaw;
      const aim = -tile.pitch;
      const zoom = Math.max(start.zoom, 1.15);
      const finish = () => {
        this.setPose(start.yaw + turn, aim, zoom);
        onArrival?.(tile.button, () => this.active && motion === this.motionId && !this.root.inert);
      };
      if (!onArrival || this.reducedMotion.matches) {
        finish();
        return;
      }
      const startTime = performance.now();
      const tick = now => {
        const progress = clamp((now - startTime) / 850, 0, 1);
        if (progress === 1) {
          this.frame = 0;
          finish();
          return;
        }
        const ease = progress * progress * (3 - 2 * progress);
        this.setPose(start.yaw + turn * ease, start.pitch + (aim - start.pitch) * ease, start.zoom + (zoom - start.zoom) * ease);
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    }

    beginGesture(event) {
      if (!this.canInteract() || event.button !== 0 || this.pointers.size >= 2) return;
      this.stop();
      const point = { x: event.clientX, y: event.clientY };
      this.pointers.set(event.pointerId, point);
      if (this.pointers.size === 1) {
        this.dragged = false;
        this.drag = { ...point, time: performance.now(), vx: 0, vy: 0 };
      } else {
        const [a, b] = this.pointers.values();
        this.pinch = { distance: Math.max(1, pinchDistance(a, b)), zoom: this.pose.zoom };
        this.dragged = true;
        this.drag = null;
      }
    }

    moveGesture(event) {
      if (!this.canInteract() || !this.pointers.has(event.pointerId)) return;
      const point = { x: event.clientX, y: event.clientY };
      this.pointers.set(event.pointerId, point);
      const { yaw, pitch, zoom } = this.pose;
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = this.pointers.values();
        this.captureDrag(event.pointerId);
        this.setPose(yaw, pitch, this.pinch.zoom * pinchDistance(a, b) / this.pinch.distance);
      } else if (this.drag) {
        const dx = point.x - this.drag.x, dy = point.y - this.drag.y;
        if (!this.dragged && Math.hypot(dx, dy) < (event.pointerType === 'touch' ? 10 : 7)) return;
        const time = performance.now();
        const elapsed = Math.max(8, time - this.drag.time);
        const turn = dx * 0.21 / zoom, tilt = -dy * 0.15 / zoom;
        this.captureDrag(event.pointerId);
        this.setPose(yaw + turn, pitch + tilt, zoom);
        this.drag = { ...point, time, vx: clamp(turn / elapsed, -0.23, 0.23), vy: clamp(tilt / elapsed, -0.17, 0.17) };
      }
    }

    captureDrag(id) {
      this.dragged = true;
      if (!this.root.hasPointerCapture(id)) this.root.setPointerCapture(id);
      this.root.classList.add('is-turning');
    }

    endGesture(event) {
      if (!this.pointers.delete(event.pointerId)) return;
      this.pinch = null;
      if (this.pointers.size) {
        const [point] = this.pointers.values();
        this.drag = { ...point, time: performance.now(), vx: 0, vy: 0 };
        return;
      }
      const drag = this.drag;
      this.drag = null;
      this.root.classList.remove('is-turning');
      if (event.type === 'pointerup' && this.dragged && drag && performance.now() - drag.time < 85) {
        this.glide(drag.vx, drag.vy);
      }
    }

    glide(vx, vy) {
      if (this.reducedMotion.matches || Math.abs(vx) + Math.abs(vy) < 0.008) return;
      this.stop();
      let previous = performance.now();
      const tick = now => {
        const elapsed = clamp(now - previous, 0, 35);
        const damping = Math.exp(-elapsed / 145);
        previous = now;
        vx *= damping;
        vy *= damping;
        const { yaw, pitch, zoom } = this.pose;
        this.setPose(yaw + vx * elapsed, pitch + vy * elapsed, zoom);
        this.frame = Math.abs(vx) + Math.abs(vy) >= 0.004 ? requestAnimationFrame(tick) : 0;
      };
      this.frame = requestAnimationFrame(tick);
    }

    onKey(event) {
      if (!this.canInteract()) return;
      const directions = { ArrowLeft: [14, 0], ArrowRight: [-14, 0], ArrowUp: [0, -9], ArrowDown: [0, 9] };
      const direction = directions[event.key];
      if (direction) {
        event.preventDefault();
        this.stop();
        const { yaw, pitch, zoom } = this.pose;
        this.setPose(yaw + direction[0], pitch + direction[1], zoom);
        this.root.focus({ preventScroll: true });
      } else if (event.key === '+' || event.key === '=' || event.key === '-') {
        event.preventDefault();
        this.zoomBy(event.key === '-' ? 0.83 : 1.2);
      } else if (event.key === 'Home') {
        event.preventDefault();
        this.reset();
      }
    }
  }

  window.DomePhotoSpace = DomePhotoSpace;
})();
