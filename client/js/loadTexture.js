const textureCache = new Map();

export async function loadTexture(device, imageUrl) {
    if (textureCache.has(imageUrl)) {
        return textureCache.get(imageUrl);
    }

    const img = new Image();
    img.src = imageUrl;
    await img.decode();

    const bitmap = await createImageBitmap(img);
    const texture = device.createTexture({
        size: [bitmap.width, bitmap.height, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: texture },
        [bitmap.width, bitmap.height]
    );

    const sampler = device.createSampler({
        magFilter: 'nearest',
        minFilter: 'nearest',
    });

    const textureData = { texture, sampler };
    textureCache.set(imageUrl, textureData);

    return textureData;
}
