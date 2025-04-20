export class Game {
    constructor(batches, webgpu, mapData) {
        this.batches = batches;
        this.webgpu = webgpu;
        this.map = mapData;
        this.cameraX = 0;
        this.cameraY = 0;
        this.cameraSpeed = 5;
        this.setupControls();
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
        const canvasWidth = this.webgpu.getContext().canvas.width; // Access canvas via WebGPUSetup
        const canvasHeight = this.webgpu.getContext().canvas.height;

        const maxX = (this.map[0].length * spriteWidth) - canvasWidth;
        const maxY = (this.map.length * spriteHeight) - canvasHeight;

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
        const time = performance.now() / 1000;
    
        // Sway parameters
        const amplitude = 1 * Math.PI / 180; // 20 degrees in radians
        const frequency = 2; // One full sway cycle every ~4 seconds (2π / 0.5 ≈ 12.56s, but adjust for feel)
        const phaseScale = 0.1; // Adjusts how much x-position affects the phase (smaller = more uniform)
    
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
    
                    if (tile === 0) {
                        spriteDataForBatch0.push({ x, y, tile: 7 }); // Grass
                    } else if (tile === 511) {
                        spriteDataForBatch0.push({ x, y, tile: 7 }); // Grass
                        // Calculate rotation based on x-position and time
                        const rotation = amplitude * Math.sin(frequency * time + phaseScale * mapCol);
                        spriteDataForBatch1.push({ x: x - 240 + 16, y: y - 240 + 16, tile: 0, rotation }); // Tree base
                        spriteDataForBatch1.push({ x: x - 240 + 16, y: y - 240 + 16, tile: 1, rotation }); // Tree top
                    }
                }
            }
        }
    
        // Draw all batches
        this.batches[0].draw(renderPass, spriteDataForBatch0);
        this.batches[1].draw(renderPass, spriteDataForBatch1);
    }
        
}