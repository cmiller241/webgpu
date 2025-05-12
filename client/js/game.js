import { loadTexture } from './loadTexture.js';

export class Game {
    constructor(batches, webgpu, mapData, computeBatch, customTexture = null) {
        console.log('Game constructor - batches:', batches);
        console.log('Game constructor - mapData:', mapData);
        console.log('Game constructor - customTexture:', customTexture);
        this.batches = Array.isArray(batches) ? batches : [];
        this.webgpu = webgpu;

        // Validate and normalize mapData
        let normalizedMap = [];
        if (Array.isArray(mapData) && mapData.length > 0 && Array.isArray(mapData[0])) {
            const maxCols = Math.max(...mapData.map(row => Array.isArray(row) ? row.length : 0));
            normalizedMap = mapData.map((row, rowIndex) => {
                if (!Array.isArray(row)) {
                    console.warn(`Map row ${rowIndex} is not an array, skipping`);
                    return [];
                }
                const newRow = Array(maxCols).fill([7]);
                row.forEach((cell, colIndex) => {
                    if (colIndex < maxCols && Array.isArray(cell) && cell.length > 0) {
                        newRow[colIndex] = cell;
                    }
                });
                return newRow;
            }).filter(row => row.length > 0);
        }
        this.map = normalizedMap.length > 0 ? normalizedMap : [];
        if (this.map.length === 0) {
            console.warn('Map data is empty or invalid, using default map');
            this.map = Array(100).fill().map(() => Array(100).fill([7]));
        }
        console.log('Normalized map rows:', this.map.length, 'cols:', this.map[0]?.length);

        this.computeBatch = computeBatch;
        this.customTexture = customTexture || { hero: null, tree: null };
        this.cameraX = 600; // Center on canvas (1200/2)
        this.cameraY = 400; // Center on canvas (800/2)
        this.cameraSpeed = 5;
        this.time = 0;
        this.lastTime = performance.now() / 1000;

        // Set mapTexture
        this.mapTexture = null;
        if (this.batches.length > 0 && this.batches[0]?.texture) {
            this.mapTexture = this.batches[0].texture;
            console.log('mapTexture set:', this.mapTexture);
        } else {
            console.warn('Failed to set mapTexture: Invalid batches or texture', {
                batchesLength: this.batches.length,
                firstBatch: this.batches[0],
                texture: this.batches[0]?.texture,
            });
            this.mapTexture = this.webgpu.getDevice().createTexture({
                size: [1200, 800],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
                label: 'Fallback Map Texture',
            });
            const blankData = new Uint8Array(1200 * 800 * 4).fill(255);
            this.webgpu.getDevice().queue.writeTexture(
                { texture: this.mapTexture },
                blankData,
                { bytesPerRow: 1200 * 4, rowsPerImage: 800 },
                [1200, 800]
            );
        }

        // Initialize plasmaPositions for trees and heroes
        this.plasmaPositions = [];
        if (this.map.length > 0) {
            for (let row = 0; row < this.map.length; row++) {
                for (let col = 0; col < this.map[row].length; col++) {
                    const cell = this.map[row][col];
                    const tileValue = Array.isArray(cell) && cell.length > 0 ? cell[0] : 7;
                    if (tileValue === 511 || tileValue === 512) {
                        const x = col * 32 - 240 + 16;
                        const y = row * 32 - 240 + 16;
                        this.plasmaPositions.push({
                            x, y, type: 1, xSize: 480, ySize: 480, baseY: 400, maxShadowDist: 100, rotation: 0, tileIndex: 0,
                        });
                        this.plasmaPositions.push({
                            x, y, type: 1, xSize: 480, ySize: 480, baseY: 400, maxShadowDist: 100, rotation: 0, tileIndex: 1,
                        });
                    }
                }
            }
        } else {
            console.warn('No map data for trees');
        }

        // Add random heroes, tightly aligned with camera
        for (let i = 0; i < 300; i++) {
            this.plasmaPositions.push({
                x: 300 + Math.random() * 600, // 300 to 900
                y: 200 + Math.random() * 400, // 200 to 600
                type: 0,
                xSize: 112,
                ySize: 112,
                baseY: 80,
                maxShadowDist: 40,
                rotation: 0,
                tileIndex: 0,
            });
        }
        this.plasmaPositions.sort((a, b) => a.y - b.y);
        console.log('plasmaPositions:', this.plasmaPositions.map(s => ({ type: s.type, x: s.x, y: s.y, tileIndex: s.tileIndex, xSize: s.xSize })));

        this.setupControls();
    }

    setupControls() {
        this.keys = {
            ArrowLeft: false,
            ArrowRight: false,
            ArrowUp: false,
            ArrowDown: false,
        };

        window.addEventListener('keydown', (e) => {
            if (this.keys.hasOwnProperty(e.key)) {
                this.keys[e.key] = true;
            }
            if (e.key === 'z') {
                let newScale = Math.min(this.webgpu.scaleFactor + 0.05, 4);
                this.webgpu.setScaleFactor(newScale);
                console.log(`scaleFactor increased to: ${newScale}`);
            } else if (e.key === 'x') {
                let newScale = Math.max(this.webgpu.scaleFactor - 0.05, 1);
                this.webgpu.setScaleFactor(newScale);
                console.log(`scaleFactor decreased to: ${newScale}`);
            }
        });

        window.addEventListener('keyup', (e) => {
            if (this.keys.hasOwnProperty(e.key)) {
                this.keys[e.key] = false;
            }
        });
    }

    update() {
        if (this.keys.ArrowLeft) this.cameraX -= this.cameraSpeed;
        if (this.keys.ArrowRight) this.cameraX += this.cameraSpeed;
        if (this.keys.ArrowUp) this.cameraY -= this.cameraSpeed;
        if (this.keys.ArrowDown) this.cameraY += this.cameraSpeed;

        const spriteWidth = 32;
        const spriteHeight = 32;
        const canvasWidth = this.webgpu.getContext().canvas.width;
        const canvasHeight = this.webgpu.getContext().canvas.height;
        const maxX = (this.map.length > 0 ? this.map[0].length * spriteWidth - canvasWidth : 1200) / this.webgpu.scaleFactor;
        const maxY = (this.map.length > 0 ? this.map.length * spriteHeight - canvasHeight : 800) / this.webgpu.scaleFactor;
        this.cameraX = Math.max(0, Math.min(this.cameraX, maxX));
        this.cameraY = Math.max(0, Math.min(this.cameraY, maxY));
    }

    render(renderPass) {
        const spriteWidth = 32, spriteHeight = 32;
        const canvasWidth = this.webgpu.getContext().canvas.width;
        const canvasHeight = this.webgpu.getContext().canvas.height;
        const scaledCanvasWidth = canvasWidth * this.webgpu.scaleFactor;
        const scaledCanvasHeight = canvasHeight * this.webgpu.scaleFactor;

        const startCol = Math.floor(this.cameraX / spriteWidth);
        const startRow = Math.floor(this.cameraY / spriteHeight);
        const maxCols = Math.floor(scaledCanvasWidth / spriteWidth) + 1;
        const maxRows = Math.floor(scaledCanvasHeight / spriteHeight) + 1;

        this.batches.forEach(batch => batch.clear());

        const spriteDataForBatch0 = [];

        const currentTime = performance.now() / 1000;
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        this.time += deltaTime;

        if (this.map.length > 0) {
            for (let row = -10; row < maxRows + 10; row++) {
                for (let col = -5; col < maxCols + 10; col++) {
                    const mapRow = startRow + row;
                    const mapCol = startCol + col;

                    if (
                        mapRow >= 0 &&
                        mapRow < this.map.length &&
                        mapCol >= 0 &&
                        mapCol < this.map[mapRow].length
                    ) {
                        const cell = this.map[mapRow][mapCol];
                        const tileValue = Array.isArray(cell) && cell.length > 0 ? cell[0] : 7;
                        const x = mapCol * spriteWidth - this.cameraX;
                        const y = mapRow * spriteHeight - this.cameraY;

                        if (tileValue <= 511) {
                            spriteDataForBatch0.push({ x, y, tile: 7 });
                        }
                    }
                }
            }
        } else {
            console.warn('No map data, rendering default grass tiles');
            for (let row = -10; row < maxRows + 10; row++) {
                for (let col = -5; col < maxCols + 10; col++) {
                    const x = (col + startCol) * spriteWidth - this.cameraX;
                    const y = (row + startRow) * spriteHeight - this.cameraY;
                    spriteDataForBatch0.push({ x, y, tile: 7 });
                }
            }
        }

        if (this.batches[0]) {
            this.batches[0].draw(renderPass, spriteDataForBatch0);
        } else {
            console.warn('Grass batch (batches[0]) is undefined');
        }

        if (this.computeBatch.isInitialized()) {
            console.log('Camera bounds:', { cameraX: this.cameraX, cameraY: this.cameraY, scaledCanvasWidth, scaledCanvasHeight });
            const visibleSprites = this.plasmaPositions.filter(sprite => {
                const xMin = this.cameraX - scaledCanvasWidth / 2 - sprite.xSize * 3;
                const xMax = this.cameraX + scaledCanvasWidth / 2 + sprite.xSize * 3;
                const yMin = this.cameraY - scaledCanvasHeight / 2 - sprite.ySize * 3;
                const yMax = this.cameraY + scaledCanvasHeight / 2 + sprite.ySize * 3;
                const isVisible = sprite.x >= xMin && sprite.x <= xMax && sprite.y >= yMin && sprite.y <= yMax;
                if (!isVisible) {
                    console.log(`${sprite.type === 0 ? 'Hero' : 'Tree'} filtered out:`, {
                        type: sprite.type,
                        x: sprite.x,
                        y: sprite.y,
                        xSize: sprite.xSize,
                        ySize: sprite.ySize,
                        xMin,
                        xMax,
                        yMin,
                        yMax
                    });
                }
                return isVisible;
            });
            console.log('Visible sprites:', visibleSprites.map(s => ({ type: s.type, x: s.x, y: s.y, tileIndex: s.tileIndex, xSize: s.xSize })));
            console.log('Drawing compute batch with:', {
                spriteCount: visibleSprites.length,
                customTexture: this.customTexture,
                mapTexture: this.mapTexture
            });
            this.computeBatch.draw(renderPass, visibleSprites, this.customTexture, this.mapTexture);
            for (let i = 0; i < this.plasmaPositions.length; i++) {
                if (this.plasmaPositions[i].type === 1) {
                    this.plasmaPositions[i].rotation = Math.sin(this.time * 0.5) * 0.1;
                }
            }
        } else {
            console.warn('Compute batch not initialized, skipping draw');
        }
    }
}