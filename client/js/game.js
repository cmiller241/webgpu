import { loadTexture } from './loadTexture.js'; // Keep import for potential future use

export class Game {
    constructor(batches, webgpu, mapData, computeBatch, customTexture = null) {
        this.batches = batches;
        this.webgpu = webgpu;
        this.map = mapData;
        this.computeBatch = computeBatch;
        this.customTexture = customTexture; // Store pre-loaded texture
        this.cameraX = 0;
        this.cameraY = 0;
        this.cameraSpeed = 5;
        this.setupControls();
        this.lastTime = performance.now() / 1000;
        this.time = 0;
        // this.plasmaPositions = [];
        // this.plasmaPositions.push({
        //     x: 200, // Random x within canvas (0 to 256)
        //     y: 200, // Random y within canvas (0 to 256)
        //     xSize: 112,
        //     ySize: 112
        // });
        this.plasmaPositions = [];
        for (let i = 0; i < 300; i++) {
            this.plasmaPositions.push({
                x: 1 + Math.random() * 1199, // Random x from 1 to 1200
                y: 1 + Math.random() * 500,  // Random y from 1 to 800
                xSize: 112,                  // Fixed sprite width
                ySize: 112                   // Fixed sprite height
            });
        }

        this.plasmaPositions.sort((a, b) => a.y - b.y);
    }    

    setupControls() {
        // Track which keys are pressed
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
    
            // Handle scaleFactor adjustments
            if (e.key === 'z') {
                let newScale = Math.min(this.webgpu.scaleFactor + .1, 4);
                this.webgpu.setScaleFactor(newScale);
                console.log(`scaleFactor increased to: ${newScale}`);
            } else if (e.key === 'x') {
                let newScale = Math.max(this.webgpu.scaleFactor - .1, 1);
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
        // Update camera position based on key presses
        if (this.keys.ArrowLeft) this.cameraX -= this.cameraSpeed;
        if (this.keys.ArrowRight) this.cameraX += this.cameraSpeed;
        if (this.keys.ArrowUp) this.cameraY -= this.cameraSpeed;
        if (this.keys.ArrowDown) this.cameraY += this.cameraSpeed;

        // Optional: Add camera bounds
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
    
        // Clear data
        this.batches.forEach(batch => batch.clear());
    
        const spriteDataForBatch0 = [];
        const spriteDataForBatch1 = [];
    
        // Get current time in seconds for animation
        const currentTime = performance.now() / 1000;
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        this.time += deltaTime;
    
        // Sway parameters
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
                        spriteDataForBatch1.push({ x: x - 240 + 16, y: y - 240 + 16, tile: 0, rotation }); // Tree base
                        spriteDataForBatch1.push({ x: x - 240 + 16, y: y - 240 + 16, tile: 1, rotation }); // Tree top
                    }
                }
            }
        }
    
        // Draw all batches
        this.batches[0].draw(renderPass, spriteDataForBatch0);
        
        // Draw compute batch with pre-loaded texture (or default if null)
        if (this.computeBatch.isInitialized()) {
            this.computeBatch.draw(renderPass, this.plasmaPositions, this.customTexture);
        } else {
            console.warn('Compute batch not initialized, skipping draw');
        }
        
        this.batches[1].draw(renderPass, spriteDataForBatch1);
    }
}