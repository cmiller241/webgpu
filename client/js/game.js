export class Game {
    constructor(renderer, webgpu, mapData) {
        this.renderer = renderer;
        this.webgpu = webgpu;       // Store WebGPUSetup instance for context access
        this.map = mapData;
        this.cameraX = 0;
        this.cameraY = 0;
        this.cameraSpeed = 5;
        this.setupControls();       // Add keyboard event listeners
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

    render(texture, treeTexture, renderPass) {
        const spriteWidth = 32, spriteHeight = 32; // Tile size remains constant (32x32)
        const canvasWidth = this.webgpu.getContext().canvas.width;
        const canvasHeight = this.webgpu.getContext().canvas.height;
    
        // Adjust the number of columns and rows based on the scale factor
        const scaledCanvasWidth = canvasWidth * this.webgpu.scaleFactor;
        const scaledCanvasHeight = canvasHeight * this.webgpu.scaleFactor;
    
        // Calculate which tile to start rendering from based on camera position
        const startCol = Math.floor(this.cameraX / spriteWidth);
        const startRow = Math.floor(this.cameraY / spriteHeight);
    
        // The number of columns and rows that fit in the scaled canvas
        const maxCols = Math.floor(scaledCanvasWidth / spriteWidth)+1;
        const maxRows = Math.floor(scaledCanvasHeight / spriteHeight)+1;
    
        const spriteData = [];
        const treeData = [];
    
        // Loop through the tiles within the calculated bounds
        for (let row = -10; row < maxRows+10; row++) {
            for (let col = -5; col < maxCols+10; col++) {
                const mapRow = startRow + row;
                const mapCol = startCol + col;
    
                // Ensure we're within map bounds
                if (
                    mapRow >= 0 &&
                    mapRow < this.map.length &&
                    mapCol >= 0 &&
                    mapCol < this.map[0].length
                ) {
                    const tileValue = this.map[mapRow][mapCol][0];  // Get tile from map data
                    const tile = tileValue - 1;  // Adjust as needed (e.g., sprite index starts at 0)
    
                    // Calculate tile positions relative to the camera
                    const x = mapCol * spriteWidth - this.cameraX;
                    const y = mapRow * spriteHeight - this.cameraY;
    
                    // Ensure only valid tiles are rendered
                    if (tile === 0) { 
                        spriteData.push({ x, y, tile:7 });
                    } else if (tile === 511) {
                        spriteData.push({x, y, tile: 7});
                        treeData.push({x: x-240+16,y:y-240+16, tile:0});
                        treeData.push({x: x-240+16,y:y-240+16, tile:1});
                    }
                }
            }
        }
    
        // Draw the tiles in batches
        this.renderer.drawSpritesBatch(spriteData, texture, renderPass);
        this.renderer.drawTreeSpritesBatch(treeData, treeTexture, renderPass); // Trees (160x224)
    }
    
}