// The webcam frame as a GPU texture, for the video background. The per-frame
// loop calls upload() right before tracking a frame, so the background shows
// exactly the frame the glasses were placed on (see TryOnScene.tsx, step 1).
import * as THREE from 'three';

export class VideoFrameTexture {
  readonly texture: THREE.VideoTexture;

  constructor(video: HTMLVideoElement) {
    this.texture = new THREE.VideoTexture(video);
    // Sample the raw values; the background shader does the sRGB decode itself.
    this.texture.colorSpace = THREE.NoColorSpace;
  }

  /**
   * Copies the video's current frame to the GPU now. Left alone, three.js would
   * copy it later, inside gl.render(), by which time the camera may have delivered
   * a newer frame than the one that was tracked. Uploading here, in the same
   * JavaScript task as tracking, means the next render reuses this exact frame.
   */
  upload(renderer: THREE.WebGLRenderer): void {
    this.texture.needsUpdate = true;
    renderer.initTexture(this.texture);
  }

  dispose(): void {
    this.texture.dispose();
  }
}
