(() => {
  'use strict';

  const maxFileBytes = 64 * 1024 * 1024;
  let databasePromise;

  function openDatabase() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = window.indexedDB.open('university-memories-library', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch(error => {
        databasePromise = null;
        throw error;
      });
    }
    return databasePromise;
  }

  function accessPhotos(db, mode, action) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('photos', mode);
      const request = action(transaction.objectStore('photos'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(request.error || transaction.error);
    });
  }

  function resizeImage(image, limit, quality) {
    const ratio = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        canvas.width = canvas.height = 1;
        if (blob) resolve(blob);
        else reject(new Error('无法生成照片预览'));
      }, 'image/webp', quality);
    });
  }

  async function identify(file) {
    const digest = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return `local-${hex}`;
  }

  async function preparePhoto(file, id) {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    try {
      image.src = objectUrl;
      await image.decode();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height) throw new Error('图片没有有效尺寸');
      const big = Math.max(width, height) > 1600;
      const thumb = await resizeImage(image, 520, 0.78);
      const full = big ? await resizeImage(image, 1600, 0.88) : file;
      const timestamp = new Date(file.lastModified > 0 ? file.lastModified : Date.now());
      const year = timestamp.getFullYear();
      const month = String(timestamp.getMonth() + 1).padStart(2, '0');
      const day = String(timestamp.getDate()).padStart(2, '0');
      return {
        id, name: file.name, width, height, year, date: `${year}-${month}-${day}`,
        addedAt: Date.now(),
        thumb, full, zoom: big ? file : null,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  class PhotoImport {
    constructor(onPhotos, onBrowse) {
      this.onPhotos = onPhotos;
      this.onBrowse = onBrowse;
      this.dialog = document.querySelector('#photo-import');
      this.trigger = document.querySelector('#add-photos');
      this.picker = document.querySelector('#photo-import-picker');
      this.close = document.querySelector('#close-photo-import');
      this.status = document.querySelector('#photo-import-status');
      this.progress = document.querySelector('#photo-import-progress');
      this.issues = document.querySelector('#photo-import-issues');
      this.browse = document.querySelector('#show-added-photos');
      this.adding = false;

      this.trigger.addEventListener('click', () => this.picker.click());
      this.picker.addEventListener('change', () => {
        const files = [...this.picker.files];
        this.picker.value = '';
        if (files.length && !this.adding) this.add(files);
      });
      this.close.addEventListener('click', () => this.dialog.close());
      this.dialog.addEventListener('cancel', event => {
        if (this.adding) event.preventDefault();
      });
      this.browse.addEventListener('click', () => {
        this.dialog.close();
        this.onBrowse(this.firstAdded);
      });
    }

    get isOpen() {
      return this.dialog.open;
    }

    async load() {
      try {
        const db = await openDatabase();
        this.onPhotos(await accessPhotos(db, 'readonly', store => store.getAll()));
      } catch {
        // Built-in photos remain available if the browser blocks local storage.
      }
    }

    async add(files) {
      this.adding = this.close.disabled = this.trigger.disabled = true;
      this.browse.hidden = this.issues.hidden = true;
      this.issues.replaceChildren();
      this.progress.hidden = false;
      this.progress.max = files.length;
      this.progress.value = 0;
      this.status.textContent = `正在添加 ${files.length} 张照片…`;
      this.dialog.showModal();

      const added = [];
      let duplicates = 0;
      let failed = 0;
      try {
        if (!window.crypto?.subtle) throw new Error('请在本机预览或 HTTPS 网页中添加照片。');
        let db;
        try {
          db = await openDatabase();
        } catch {
          throw new Error('当前浏览器无法保存照片，请允许网页使用本机存储后重试。');
        }
        for (const [index, file] of files.entries()) {
          try {
            if (!file.size || file.size > maxFileBytes) throw new Error('文件为空或超过 64 MB');
            if ((file.type && !file.type.startsWith('image/')) || file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name)) {
              throw new Error('请选择 JPG、PNG 或其他相册照片');
            }
            const id = await identify(file);
            if (await accessPhotos(db, 'readonly', store => store.getKey(id))) {
              duplicates++;
              continue;
            }
            let photo;
            try {
              photo = await preparePhoto(file, id);
            } catch {
              throw new Error(/hei[cf]|heif/i.test(file.type + file.name)
                ? '浏览器无法读取这张 HEIC 照片，可用 JPG 版本重试'
                : '浏览器无法读取这张照片');
            }
            try {
              await accessPhotos(db, 'readwrite', store => store.add(photo));
              added.push(photo);
            } catch (error) {
              if (error?.name === 'ConstraintError') duplicates++;
              else throw new Error(error?.name === 'QuotaExceededError' ? '浏览器存储空间不足' : '保存失败');
            }
          } catch (error) {
            const issue = document.createElement('li');
            issue.textContent = `${file.name}：${error.message}`;
            this.issues.append(issue);
            failed++;
          } finally {
            this.progress.value = index + 1;
          }
        }
        this.onPhotos(added);
        this.firstAdded = added[0]?.id;
        this.browse.hidden = !added.length;
        this.issues.hidden = !failed;
        const result = [`已添加 ${added.length} 张照片`];
        if (duplicates) result.push(`跳过 ${duplicates} 张重复照片`);
        if (failed) result.push(`${failed} 张未能添加`);
        this.status.textContent = result.join('，') + '。照片保存在当前浏览器。';
      } catch (error) {
        this.status.textContent = error.message;
      } finally {
        this.progress.hidden = true;
        this.adding = this.close.disabled = this.trigger.disabled = false;
        (this.browse.hidden ? this.close : this.browse).focus();
      }
    }
  }

  window.PhotoImport = PhotoImport;
})();
