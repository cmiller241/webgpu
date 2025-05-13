import { loadTexture } from './loadTexture.js';

export class Game {
    constructor(batches, webgpu, mapData, computeBatch, textures) {
        this.batches = batches;
        this.webgpu = webgpu;
        this.map = mapData;
        this.computeBatch = computeBatch;
        this.heroTexture = textures.heroTexture;
        this.treeTexture = textures.treeTexture;
        this.cameraX = 0;
        this.cameraY = 0;
        this.cameraSpeed = 5;
        this.setupControls();
        this.lastTime = performance.now() / 1000;
        this.time = 0;
        this.heroPositions = [];
        for (let i = 0; i < 300; i++) {
            this.heroPositions.push({
                x: 1 + Math.random() * 1199,
                y: 1 + Math.random() * 500,
                xSize: 112,
                ySize: 112,
                tile: 0,
                rotation: 0,
                texture: this.heroTexture,
                baseY: 80.0
            });
        }
        this.heroPositions.sort((a, b) => a.y - b.y);
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

        const maxX = (this.map[0].length * spriteWidth - canvasWidth) / this.webgpu.scaleFactor;
        const maxY = (this.map.length * spriteHeight - canvasHeight) / this.webgpu.scaleFactor;

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
        const combinedSprites = [];

        const currentTime = performance.now / 1000;
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        this.time += deltaTime;

        const amplitude = 1 * Math.PI / 180;
        const frequency = 2;
        const phaseScale = 0.5;

        for (let row = -10; row < maxRows + 10; row++) {
            for (let col = -5; col < maxCols + 10; col++) {
                const mapRow = startRow + row;
                const mapCol = startCol + col;

                if (
                    mapRow >= 0 &&
                    mapRow < this.map.length &&
                    mapCol >= 0 &&
                    mapCol < this.map[0].length
                ) {
                    const tileValue = this.map[mapRow][mapCol][0];
                    const tile = tileValue - 1;

                    const x = mapCol * spriteWidth - this.cameraX;
                    const y = mapRow * spriteHeight - this.cameraY;

                    if (tile < 511) {
                        spriteDataForBatch0.push({ x, y, tile: 7 }); // Grass
                    } else if (tile === 511) {
                        spriteDataForBatch0.push({ x, y, tile: 7 }); // Grass
                        const rotation = amplitude * Math.sin(frequency * this.time + phaseScale * mapCol);
                        combinedSprites.push({
                            x: x - 240 + 16,
                            y: y - 240 + 16,
                            xSize: 480, // Tree sprite size from treeBatch
                            ySize: 480,
                            tile: 0,
                            rotation: 0,
                            texture: "tree",
                            baseY: 250.0
                        });
                        combinedSprites.push({
                            x: x - 240 + 16,
                            y: y - 240 + 16,
                            xSize: 480,
                            ySize: 480,
                            tile: 1,
                            rotation,
                            texture: "tree",
                            baseY: 250.0
                        });
                    }
                }
            }
        }

        this.heroPositions.forEach(hero => {
            combinedSprites.push({
                x: hero.x,
                y: hero.y,
                xSize: hero.xSize,
                ySize: hero.ySize,
                tile: hero.tile,
                rotation: hero.rotation,
                texture: "hero",
                baseY: hero.baseY
            });
        });

        combinedSprites.sort((a, b) => a.y - b.y);

        this.batches[0].draw(renderPass, spriteDataForBatch0);

        if (this.computeBatch.isInitialized()) {
            this.computeBatch.draw(renderPass, combinedSprites);
        } else {
            console.warn('Compute batch not initialized, skipping draw');
        }
    }
}