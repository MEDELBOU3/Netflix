// ============================================================================
// js/utils/colorExtractor.js
// Clean Color Extractor — Pure Ambient Wash without Screen-Stuck Meshes
// ============================================================================

export class ColorExtractor {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.canvas.width = 48;
        this.canvas.height = 48;
        this.cache = new Map();
    }

    async extractDominantColor(imageUrl) {
        if (!imageUrl) return { r: 34, g: 197, b: 94 };

        if (this.cache.has(imageUrl)) {
            return this.cache.get(imageUrl);
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';

            img.onload = () => {
                try {
                    this.ctx.clearRect(0, 0, 48, 48);
                    this.ctx.drawImage(img, 0, 0, 48, 48);
                    const pixels = this.ctx.getImageData(0, 0, 48, 48).data;

                    let bestColor = { r: 34, g: 197, b: 94 };
                    let maxVibrancy = -1;

                    for (let i = 0; i < pixels.length; i += 16) {
                        const r = pixels[i];
                        const g = pixels[i + 1];
                        const b = pixels[i + 2];
                        const a = pixels[i + 3];

                        if (a < 128) continue;

                        const hsl = this._rgbToHsl(r, g, b);
                        // Looser gates so deep cinematic reds / dark tones survive
                        if (hsl.l < 0.12 || hsl.l > 0.88 || hsl.s < 0.15) continue;

                        const vibrancy = hsl.s * (1 - Math.abs(hsl.l - 0.48));
                        if (vibrancy > maxVibrancy) {
                            maxVibrancy = vibrancy;
                            bestColor = { r, g, b };
                        }
                    }

                    this.cache.set(imageUrl, bestColor);
                    resolve(bestColor);
                } catch {
                    const fallback = this._getProceduralColor(imageUrl);
                    this.cache.set(imageUrl, fallback);
                    resolve(fallback);
                }
            };

            img.onerror = () => {
                const fallback = this._getProceduralColor(imageUrl);
                resolve(fallback);
            };

            img.src = imageUrl;
        });
    }

    applyAmbientLighting(rgb) {
        const root = document.documentElement;
        root.style.setProperty('--ambient-r', rgb.r);
        root.style.setProperty('--ambient-g', rgb.g);
        root.style.setProperty('--ambient-b', rgb.b);
        root.style.setProperty('--ambient-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }

    _rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, l };
    }

    _getProceduralColor(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
        const palettes = [
            { r: 132, g: 204, b: 22 },  // Olive/Lime
            { r: 16, g: 185, b: 129 },  // Emerald
            { r: 6, g: 182, b: 212 },   // Cyan
            { r: 245, g: 158, b: 11 },  // Gold
            { r: 239, g: 68, b: 68 }    // Red
        ];
        return palettes[Math.abs(hash) % palettes.length];
    }
}

export const colorExtractor = new ColorExtractor();