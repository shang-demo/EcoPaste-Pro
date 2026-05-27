import { convertFileSrc } from "@tauri-apps/api/core";

// Set to keep track of already preloaded image paths to avoid duplicate loading
const preloadedPaths = new Set<string>();

/**
 * Preloads and pre-decodes a local image file asynchronously in the background.
 * By using the native browser Image.decode() API, the image is decoded on a background
 * thread and placed in the browser cache, resulting in instant, flicker-free rendering
 * when the image enters the viewport.
 * 
 * @param filePath The absolute local file path of the image.
 */
export const preloadLocalImage = async (filePath: string): Promise<void> => {
  if (!filePath || preloadedPaths.has(filePath)) return;

  preloadedPaths.add(filePath);

  try {
    const assetUrl = convertFileSrc(filePath);
    const img = new Image();
    img.src = assetUrl;

    // Use asynchronous browser decoding if supported
    if ("decode" in img) {
      await img.decode();
    }
  } catch (error) {
    // Fail silently to ensure preloading failures never crash the main application
    console.debug("Failed to preload local image:", filePath, error);
    preloadedPaths.delete(filePath);
  }
};
