(() => {
  'use strict';

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const wrap = (value, count) => ((value % count) + count) % count;

  class CircularGallery {
    constructor(root, openPhoto) {
      this.root = root;
      this.openPhoto = openPhoto;
      this.stage = root.querySelector('#ring-stage');
      this.previousButton = root.querySelector('#ring-prev');
      this.nextButton = root.querySelector('#ring-next');
      this.dateLabel = root.querySelector('#ring-date');
      this.countLabel = root.querySelector('#ring-count');
      this.items = [];
      this.cards = [];
      this.position = 0;
      this.target = 0;
      this.frame = 0;
      this.drag = null;
      this.wheelLockUntil = 0;
      this.didDrag = false;
      this.cardWidth = 300;
      this.cardHeight = 350;
      this.spacing = 270;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

      this.previousButton.addEventListener('click', () => this.navigate(-1));
      this.nextButton.addEventListener('click', () => this.navigate(1));
      root.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      root.addEventListener('pointermove', (event) => this.onPointerMove(event));
      root.addEventListener('pointerup', (event) => this.onPointerUp(event));
      root.addEventListener('pointercancel', (event) => this.onPointerUp(event));
      root.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(root);
    }

    setItems(items) {
      cancelAnimationFrame(this.frame);
      this.items = items.slice();
      this.position = 0;
      this.target = 0;
      this.wheelLockUntil = 0;
      this.didDrag = false;
      const fragment = document.createDocumentFragment();
      const count = Math.min(this.items.length, 11);
      this.cards = Array.from({ length: count }, () => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ring-card';
        button.tabIndex = -1;
        const image = document.createElement('img');
        image.alt = '';
        image.decoding = 'async';
        image.draggable = false;
        const date = document.createElement('time');
        button.append(image, date);
        button.addEventListener('click', (event) => {
          const item = this.items[Number(button.dataset.index)];
          if (item && (event.detail === 0 || !this.didDrag)) this.openPhoto(item.id, button, event);
        });
        fragment.append(button);
        return { button, image, date, index: -1 };
      });
      this.stage.replaceChildren(fragment);
      this.previousButton.disabled = this.items.length < 2;
      this.nextButton.disabled = this.items.length < 2;
      this.resize();
    }

    get currentIndex() {
      return this.items.length ? wrap(Math.round(this.position), this.items.length) : -1;
    }

    select(index) {
      cancelAnimationFrame(this.frame);
      this.position = this.target = index;
      this.layout();
    }

    resize() {
      const width = this.root.clientWidth;
      const height = this.root.clientHeight;
      if (!width || !height) return;
      this.cardWidth = clamp(width * (width < 600 ? 0.6 : 0.36), 210, 330);
      this.cardHeight = Math.min(this.cardWidth * 1.19, height * 0.53);
      this.spacing = this.cardWidth * 0.82 + 24;
      this.root.style.setProperty('--ring-card-width', `${this.cardWidth}px`);
      this.root.style.setProperty('--ring-card-height', `${this.cardHeight}px`);
      this.layout();
    }

    assign(card, index, active) {
      const item = this.items[index];
      if (card.index !== index) {
        card.index = index;
        card.button.dataset.index = String(index);
        card.button.dataset.id = item.id;
        card.button.setAttribute('aria-label', `查看第 ${index + 1} 张照片，${item.date}`);
        card.date.dateTime = item.date;
        card.date.textContent = item.date.replaceAll('-', '.');
        card.image.src = active ? item.full : item.thumb;
        card.image.dataset.quality = active ? 'full' : 'thumb';
      } else if (active && card.image.dataset.quality !== 'full') {
        card.image.src = item.full;
        card.image.dataset.quality = 'full';
      }
    }

    layout() {
      const count = this.items.length;
      if (!count) {
        this.dateLabel.textContent = '';
        this.countLabel.textContent = '0 / 0';
        return;
      }
      const center = Math.round(this.position);
      const active = wrap(center, count);
      const half = this.root.clientWidth / 2;
      const bend = Math.min(half * 0.24, 110);
      const radius = (half * half + bend * bend) / (2 * bend);
      const slots = count < 11
        ? this.items.map((_, index) => {
          let distance = wrap(index - this.position, count);
          if (distance > count / 2) distance -= count;
          return { index, distance };
        }).sort((a, b) => a.distance - b.distance)
        : this.cards.map((_, slot) => {
          const logical = center + slot - 5;
          return { index: wrap(logical, count), distance: logical - this.position };
        });

      this.cards.forEach((card, slot) => {
        const { index, distance } = slots[slot];
        const x = distance * this.spacing;
        const edgeX = Math.min(Math.abs(x), half);
        const arc = radius - Math.sqrt(Math.max(0, radius * radius - edgeX * edgeX));
        const angle = -Math.sign(x) * Math.asin(edgeX / radius) * 180 / Math.PI;
        const shown = Math.abs(x) < half + this.cardWidth * 0.8;
        card.button.style.display = shown ? 'block' : 'none';
        card.button.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${arc.toFixed(1)}px, 0) rotate(${angle.toFixed(2)}deg) scale(${clamp(1 - Math.abs(distance) * 0.05, 0.72, 1).toFixed(3)})`;
        card.button.style.opacity = String(clamp(1.05 - Math.abs(distance) * 0.15, 0.25, 1));
        card.button.style.zIndex = String(100 - Math.round(Math.abs(distance) * 10));
        card.button.tabIndex = index === active ? 0 : -1;
        if (shown) this.assign(card, index, index === active);
      });
      this.dateLabel.textContent = this.items[active].date.replaceAll('-', '.');
      this.countLabel.textContent = `${active + 1} / ${count}`;
    }

    animate() {
      cancelAnimationFrame(this.frame);
      if (this.reducedMotion.matches) {
        this.position = this.target;
        this.layout();
        return;
      }
      const tick = () => {
        const difference = this.target - this.position;
        this.position += difference * 0.16;
        if (Math.abs(difference) < 0.002) this.position = this.target;
        this.layout();
        if (this.position !== this.target) this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    }

    goTo(index) {
      const count = this.items.length;
      if (!count || !Number.isInteger(index)) return;
      let difference = wrap(index - this.position, count);
      if (difference > count / 2) difference -= count;
      this.target = this.position + difference;
      this.animate();
    }

    navigate(direction) {
      if (this.items.length < 2) return;
      this.target = Math.round(this.target) + direction;
      this.animate();
    }

    home() {
      if (!this.items.length) return;
      this.goTo(0);
    }

    onWheel(event) {
      event.preventDefault();
      if (this.items.length < 2 || performance.now() < this.wheelLockUntil) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(delta) < 4) return;
      this.wheelLockUntil = performance.now() + 320;
      this.navigate(Math.sign(delta));
    }

    onPointerDown(event) {
      if (this.items.length < 2 || event.button !== 0 || event.target.closest('.ring-controls')) return;
      cancelAnimationFrame(this.frame);
      this.didDrag = false;
      this.drag = { id: event.pointerId, x: event.clientX, start: this.position };
    }

    onPointerMove(event) {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const travel = event.clientX - this.drag.x;
      if (Math.abs(travel) > 6 && !this.didDrag) {
        this.didDrag = true;
        this.root.setPointerCapture(event.pointerId);
        this.root.classList.add('is-dragging');
      }
      if (this.didDrag) {
        this.position = this.drag.start - travel / this.spacing;
        this.target = this.position;
        this.layout();
      }
    }

    onPointerUp(event) {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      this.drag = null;
      this.root.classList.remove('is-dragging');
      if (this.didDrag) {
        this.target = Math.round(this.position);
        this.animate();
      }
    }
  }

  window.CircularGallery = CircularGallery;
})();
