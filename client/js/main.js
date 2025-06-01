import { WebGPULibrary } from './webgpu.js';
import { SpriteBatch } from './spriteBatch.js';
import { ComputeTextureBatch } from './ComputeTextureBatch.js';

let gpu, mapData, grassBatchId, computeBatches, grassTextureId, heroTextureId, treeTextureId;
let cameraX = 0, cameraY = 0, cameraSpeed = 5;
let keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
let heroPositions = [];
let lastTime = performance.now();
let frameTimes = [];
const maxFrameTimes = 60;
let time = 0;

async function init() {
    try {
        gpu = await new WebGPULibrary('webgpuCanvas').initialize();
        console.log('Canvas size:', gpu.getContext().canvas.width, gpu.getContext().canvas.height);

        const response = await fetch('js/map.json');
        if (!response.ok) throw new Error(`Failed to load map.json: ${response.statusText}`);
        mapData = await response.json();

        const grassTextureInfo = await gpu.loadTexture('assets/sprites2.png', 'grass');
        const treeTextureInfo = await gpu.loadTexture('assets/tree3.png', 'tree', 1440, 480);
        const heroTextureInfo = await gpu.loadTexture('assets/hero.png', 'hero');
        grassTextureId = grassTextureInfo.textureId;
        heroTextureId = heroTextureInfo.textureId;
        treeTextureId = treeTextureInfo.textureId;

        const vertexShaderCode = await fetch('js/shaders/vertex.wgsl').then(r => r.text());
        const fragmentShaderCode = await fetch('js/shaders/fragment.wgsl').then(r => r.text());
        const computeShaderCode = await fetch('js/shaders/custom_compute.wgsl').then(r => r.text());
        const vertexShaderId = gpu.newShader(vertexShaderCode, 'vertex');
        const fragmentShaderId = gpu.newShader(fragmentShaderCode, 'fragment');
        gpu.newShader(computeShaderCode, 'compute');

        grassBatchId = gpu.newSpriteBatch(4096, vertexShaderId, fragmentShaderId, grassTextureId, false);

        console.log('Creating hero compute batch...');
        const heroComputeBatch = new ComputeTextureBatch(gpu.getDevice(), gpu, 112, 112, 10000, gpu.textures.get(heroTextureId).texture);
        await heroComputeBatch.init();
        if (!heroComputeBatch.isInitialized()) throw new Error('Hero ComputeTextureBatch failed to initialize');

        console.log('Creating tree compute batch...');
        const treeComputeBatch = new ComputeTextureBatch(gpu.getDevice(), gpu, 480, 480, 2000, gpu.textures.get(treeTextureId).texture);
        await treeComputeBatch.init();
        if (!treeComputeBatch.isInitialized()) throw new Error('Tree ComputeTextureBatch failed to initialize');

        computeBatches = { hero: heroComputeBatch, tree: treeComputeBatch };

        const heroTexture = gpu.textures.get(heroTextureId);
        for (let i = 0; i < 300; i++) {
            heroPositions.push({
                x: 1 + Math.random() * 1199,
                y: 1 + Math.random() * 500,
                xSize: heroTexture.width,
                ySize: heroTexture.height,
                tile: 0,
                rotation: 0,
                texture: heroTextureId,
                baseY: 80
            });
        }
        heroPositions.sort((a, b) => a.y - b.y);

        window.addEventListener('keydown', (e) => {
            if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
            if (e.key === 'z') {
                let newScale = Math.min(gpu.scaleFactor + 0.05, 4);
                gpu.setScaleFactor(newScale);
                console.log(`scaleFactor increased to: ${newScale}`);
            } else if (e.key === 'x') {
                let newScale = Math.max(gpu.scaleFactor - 0.05, 1);
                gpu.setScaleFactor(newScale);
                console.log(`scaleFactor decreased to: ${newScale}`);
            }
        });

        window.addEventListener('keyup', (e) => {
            if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
        });

        window.addEventListener('resize', () => gpu.resizeCanvas());

        console.log('init completed');
    } catch (error) {
        console.error('Error in init:', error);
        throw error;
    }
}

function tick() {
    const spriteWidth = 32, spriteHeight = 32;
    const canvasWidth = gpu.getContext().canvas.width;
    const canvasHeight = gpu.getContext().canvas.height;

    if (keys.ArrowLeft) cameraX -= cameraSpeed;
    if (keys.ArrowRight) cameraX += cameraSpeed;
    if (keys.ArrowUp) cameraY -= cameraSpeed;
    if (keys.ArrowDown) cameraY += cameraSpeed;

    const maxX = (mapData[0].length * spriteWidth - canvasWidth) / gpu.scaleFactor;
    const maxY = (mapData.length * spriteHeight - canvasHeight) / gpu.scaleFactor;
    cameraX = Math.max(0, Math.min(cameraX, maxX));
    cameraY = Math.max(0, Math.min(cameraY, maxY));

    const currentTime = performance.now();
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    const fps = deltaTime > 0 ? 1000 / deltaTime : 0;
    frameTimes.push(fps);
    if (frameTimes.length > maxFrameTimes) frameTimes.shift();
    const avgFps = frameTimes.reduce((sum, fps) => sum + fps, 0) / frameTimes.length;
    document.getElementById('fpsDisplay').textContent = `FPS: ${Math.round(avgFps)}`;

    time += deltaTime / 1000;
}

function render() {
    const spriteWidth = 32, spriteHeight = 32;
    const canvasWidth = gpu.getContext().canvas.width;
    const canvasHeight = gpu.getContext().canvas.height;
    const scaledCanvasWidth = canvasWidth * gpu.scaleFactor;
    const scaledCanvasHeight = canvasHeight * gpu.scaleFactor;

    const startCol = Math.floor(cameraX / spriteWidth) - 5;
    const startRow = Math.floor(cameraY / spriteHeight) - 5;
    const maxCols = Math.floor(scaledCanvasWidth / spriteWidth) + 10;
    const maxRows = Math.floor(scaledCanvasHeight / spriteHeight) + 10;

    const spriteData = [];
    const allSprites = [];

    const amplitude = 1 * Math.PI / 180;
    const frequency = 2;
    const phaseScale = 0.5;

    let treeIndex = 0;
    for (let row = -15; row < maxRows + 15; row++) {
        for (let col = -10; col < maxCols + 10; col++) {
            const mapRow = startRow + row;
            const mapCol = startCol + col;

            if (mapRow >= 0 && mapRow < mapData.length && mapCol >= 0 && mapCol < mapData[0].length) {
                const tileValue = mapData[mapRow][mapCol][0];
                const tile = tileValue - 1;
                const x = mapCol * spriteWidth - cameraX;
                const y = mapRow * spriteHeight - cameraY;

                if (tile < 511) {
                    spriteData.push({ x, y, tile: 7 });
                } else if (tile === 511) {
                    spriteData.push({ x, y, tile: 7 });
                    const rotation = amplitude * Math.sin(frequency * time + phaseScale * mapCol);
                    allSprites.push({
                        x: x - 240 + 16,
                        y: y - 240 + 16,
                        xSize: 480,
                        ySize: 480,
                        tile: 0, // First 480x480 frame (0-480px)
                        rotation: 0,
                        texture: treeTextureId,
                        baseY: 250.0,
                        index: treeIndex++
                    });
                    allSprites.push({
                        x: x - 240 + 16,
                        y: y - 240 + 16,
                        xSize: 480,
                        ySize: 480,
                        tile: 1, // Second 480x480 frame (480-960px)
                        rotation,
                        texture: treeTextureId,
                        baseY: 250.0,
                        index: treeIndex++
                    });
                }
            }
        }
    }

    heroPositions.forEach((hero, index) => {
        const x = hero.x - cameraX;
        const y = hero.y - cameraY;
        if (x >= -480 && x <= scaledCanvasWidth + 480 && y >= -480 && y <= scaledCanvasHeight + 480) {
            allSprites.push({
                x,
                y,
                xSize: hero.xSize,
                ySize: hero.ySize,
                tile: hero.tile,
                rotation: hero.rotation,
                texture: heroTextureId,
                baseY: hero.baseY,
                index
            });
        }
    });

    allSprites.sort((a, b) => {
        if (a.y !== b.y) return a.y - b.y;
        if (a.texture !== b.texture) return a.texture === heroTextureId ? -1 : 1;
        return a.index - b.index;
    });

    // Log all sprites and close y values
    console.log('All sprites:', allSprites.map(s => ({ y: s.y, x: s.x, texture: s.texture, tile: s.tile, xSize: s.xSize, ySize: s.ySize, index: s.index })));
    for (let i = 1; i < allSprites.length; i++) {
        if (Math.abs(allSprites[i].y - allSprites[i-1].y) < 5) {
            console.log('Close y sprites:', {
                sprite1: { y: allSprites[i-1].y, x: allSprites[i-1].x, texture: allSprites[i-1].texture, tile: allSprites[i-1].tile, xSize: allSprites[i-1].xSize, ySize: allSprites[i-1].ySize, index: allSprites[i-1].index },
                sprite2: { y: allSprites[i].y, x: allSprites[i].x, texture: allSprites[i].texture, tile: allSprites[i].tile, xSize: allSprites[i].xSize, ySize: allSprites[i].ySize, index: allSprites[i].index }
            });
        }
    }

    console.log('Sprite count:', allSprites.length, { heroes: allSprites.filter(s => s.texture === heroTextureId).length, trees: allSprites.filter(s => s.texture === treeTextureId).length });

    gpu.setSpriteBatchData(grassBatchId, spriteData);
    gpu.draw(grassBatchId, computeBatches, allSprites, { heroTextureId, treeTextureId });
}

async function main() {
    try {
        await init();
        function gameLoop(time) {
            tick();
            render();
            requestAnimationFrame(gameLoop);
        }
        requestAnimationFrame(gameLoop);
    } catch (error) {
        console.error('Error in main:', error);
    }
}

main();