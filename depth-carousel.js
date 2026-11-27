(() => {
  'use strict';

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const wrap = (value, count) => ((value % count) + count) % count;
  const CARD_WIDTH = 300;
  const CARD_HEIGHT = 300;
  const PERSPECTIVE = 1400;

  class DepthCarousel {
    constructor(root, openPhoto) {
      this.root = root;
      this.openPhoto = openPhoto;
      this.stage = root.querySelector('#depth-stage');
      this.previousButton = root.querySelector('#depth-prev');
      this.nextButton = root.querySelector('#depth-next');
      this.dateLabel = root.querySelector('#depth-date');
      this.countLabel = root.querySelector('#depth-count');
      this.items = [];
      this.cards = [];
      this.position = 0;
      this.focus = 0;
      this.frame = 0;
      this.wheelAccumulation = 0;
      this.wheelLockUntil = 0;
      this.drag = null;
      this.didDrag = false;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

      this.previousButton.addEventListener('click', () => this.navigate(-1));
      this.nextButton.addEventListener('click', () => this.navigate(1));
      this.root.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      this.root.addEventListener('pointermove', (event) => this.onPointerMove(event));
      this.root.addEventListener('pointerup', (event) => this.onPointerUp(event));
      this.root.addEventListener('pointercancel', (event) => this.onPointerUp(event));
      this.root.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(root);
    }

    setItems(items) {
      cancelAnimationFrame(this.frame);
      this.wheelAccumulation = 0;
      this.wheelLockUntil = 0;
      this.didDrag = false;
      this.items = items.slice();
      this.position = 0;
      this.focus = 0;
      const fragment = document.createDocumentFragment();
      this.cards = this.items.map((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'depth-card';
        button.dataset.id = item.id;
        button.setAttribute('aria-label', `查看第 ${index + 1} 张照片，${item.date}`);
        button.tabIndex = index === 0 ? 0 : -1;

        const image = document.createElement('img');
        image.alt = '';
        image.decoding = 'async';
        image.draggable = false;
        button.append(image);
        button.addEventListener('click', (event) => {
          if (event.detail === 0 || !this.didDrag) this.openPhoto(item.id, button, event);
        });
        fragment.append(button);
        return { button, image, item };
      });
      this.stage.replaceChildren(fragment);
      this.resize();
      this.updateLabels();
      this.previousButton.disabled = this.items.length < 2;
      this.nextButton.disabled = this.items.length < 2;
    }

    get currentIndex() {
      return this.focus;
    }

    select(index) {
      cancelAnimationFrame(this.frame);
      this.position = this.focus = index;
      this.updateLabels();
      this.layout();
    }

    resize() {
      this.layout();
    }

    layout() {
      const count = this.items.length;
      const width = this.root.clientWidth;
      const height = this.root.clientHeight;
      if (!count || !width || !height) return;
      const mobile = width < 600;
      const visible = Math.min(count - 1, mobile ? 3 : 4);
      const room = width - (mobile ? 24 : 64);
      const exposedWidth = clamp(room / (visible + 4), 36, 74);
      const frontWidth = Math.min(336, room - exposedWidth * visible, Math.max(88, (height - 154) * CARD_WIDTH / CARD_HEIGHT));
      const frontRight = (width + frontWidth - visible * exposedWidth) / 2;
      const centerY = height / 2 - 27;

      this.cards.forEach((card, index) => {
        let distance = index - this.position;
        if (count > 1) {
          distance = wrap(distance, count);
          if (distance > count / 2) distance -= count;
        }
        const shown = distance > -0.9 && distance <= visible;
        if (!shown) {
          card.button.style.display = 'none';
          card.button.tabIndex = -1;
          return;
        }
        const behind = Math.max(0, distance);
        const opacity = distance < 0 ? clamp(1 + distance, 0, 1) : 1;
        const screenWidth = frontWidth * (1 - behind * 0.065);
        const screenX = frontRight + exposedWidth * distance - screenWidth / 2;
        const z = -140 * behind;
        // Compensate for perspective so every layer keeps a predictable exposed edge.
        const projection = (PERSPECTIVE - z) / PERSPECTIVE;
        const x = width / 2 + (screenX - width / 2) * projection;
        const y = height * 0.45 + (centerY - height * 0.45) * projection;
        const scale = screenWidth / CARD_WIDTH * projection;
        card.button.style.display = 'block';
        card.button.style.transform = `translate3d(${x}px, ${y}px, ${z}px) translate(-50%, -50%) scale(${scale})`;
        card.button.style.opacity = opacity.toFixed(3);
        card.button.style.zIndex = String(Math.round(2000 - distance * 20));
        card.button.style.pointerEvents = 'auto';
        card.button.tabIndex = index === this.focus ? 0 : -1;
        if (!card.image.hasAttribute('src')) card.image.src = card.item.thumb;
        if (index === this.focus && card.image.dataset.quality !== 'full') {
          card.image.src = card.item.full;
          card.image.dataset.quality = 'full';
        }
      });
    }

    updateLabels() {
      if (!this.items.length) {
        this.dateLabel.textContent = '';
        this.countLabel.textContent = '0 / 0';
        return;
      }
      this.dateLabel.textContent = this.items[this.focus].date.replaceAll('-', '.');
      this.countLabel.textContent = `${this.focus + 1} / ${this.items.length}`;
    }

    animateTo(target) {
      cancelAnimationFrame(this.frame);
      if (this.reducedMotion.matches) {
        this.position = wrap(target, this.items.length);
        this.layout();
        return;
      }
      const start = this.position;
      const change = target - start;
      const startTime = performance.now();
      const duration = 700;
      const tick = (now) => {
        const progress = clamp((now - startTime) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        this.position = start + change * eased;
        this.layout();
        if (progress < 1) this.frame = requestAnimationFrame(tick);
        else {
          this.position = wrap(target, this.items.length);
          this.layout();
        }
      };
      this.frame = requestAnimationFrame(tick);
    }

    go(rawIndex) {
      const count = this.items.length;
      if (!count) return;
      const index = wrap(rawIndex, count);
      let delta = index - this.position;
      if (count > 1) {
        delta = wrap(delta, count);
        if (delta > count / 2) delta -= count;
      }
      this.focus = index;
      this.updateLabels();
      this.animateTo(this.position + delta);
    }

    navigate(step) {
      if (this.items.length < 2) return;
      this.go(this.focus + step);
    }

    onWheel(event) {
      event.preventDefault();
      if (this.items.length < 2) return;
      const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const delta = event.deltaMode === 1 ? raw * 24 : raw;
      if (performance.now() < this.wheelLockUntil) return;
      this.wheelAccumulation += delta;
      if (Math.abs(this.wheelAccumulation) < 40) return;
      const direction = Math.sign(this.wheelAccumulation);
      this.wheelAccumulation = 0;
      this.wheelLockUntil = performance.now() + 420;
      this.navigate(direction);
    }

    onPointerDown(event) {
      if (this.items.length < 2 || event.button !== 0 || event.target.closest('.depth-controls')) return;
      cancelAnimationFrame(this.frame);
      this.didDrag = false;
      this.drag = { id: event.pointerId, x: event.clientX, start: this.position };
    }

    onPointerMove(event) {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const travel = event.clientX - this.drag.x;
      const threshold = event.pointerType === 'touch' ? 12 : 6;
      if (Math.abs(travel) > threshold && !this.didDrag) {
        this.didDrag = true;
        this.root.setPointerCapture(event.pointerId);
        this.root.classList.add('is-dragging');
      }
      if (this.didDrag) {
        this.position = this.drag.start - travel / (this.root.clientWidth < 600 ? 150 : 220);
        this.layout();
      }
    }

    onPointerUp(event) {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      this.drag = null;
      this.root.classList.remove('is-dragging');
      if (this.didDrag) this.go(Math.round(this.position));
    }
  }

  window.DepthCarousel = DepthCarousel;
})();
