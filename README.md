# SpinCrop - Rotated Image Cropper

An advanced, browser-based image cropping tool that lets you rotate, translate, and resize crop boxes (both squares and rectangles) at any angle.

Standard crop tools lock the crop area upright and rotate the image, which can be disorienting and limits creative freedom. SpinCrop allows the crop boundaries themselves to be rotated and scaled along their rotated axes. It then automatically de-rotates the content and exports the exact selection.

## Features

- 🔄 **Fully Rotatable Crop Box**: Drag the rotation handle to crop at any arbitrary angle.
- 📐 **Flexible Aspect Ratios**: Easily toggle between Square (1:1), standard ratios (16:9, 4:3, 3:2, 2:3), or Free Form.
- 🖐️ **Intuitive Rotated Controls**: Move and resize the crop box via 4 corner handles and 4 edge handles that track along the rotated coordinate system.
- 🖼️ **Live De-rotated Preview**: A real-time preview drawer shows the exact cropped region as it will look when exported.
- 🎨 **Smart Background Padding**: Fill boundary overlaps with Transparency, Blurred padding, Solid Black, or Solid White.
- ⌨️ **Keyboard Controls**: Pixel-perfect adjustments using arrow keys for translation, scaling, and rotation.
- 🕒 **History Stack**: Multi-level Undo & Redo (Ctrl+Z / Ctrl+Y) to recover previous crop box states.
- 💾 **High Quality Exports**: Export directly to PNG, JPEG, or WebP at custom or preset resolutions.
- ⚡ **100% Offline & Client-side**: Running entirely in the browser using HTML5 canvas, ensuring privacy and speed.

## How to Use

1. **Load Image**: Drag & drop any image into the workspace, click the upload button, or click "Load Demo Image" to test instantly.
2. **Adjust Crop Box**:
   - **Move**: Click and drag inside the crop box.
   - **Rotate**: Click and drag the rotation circle at the top, or use the angle slider in the sidebar.
   - **Resize**: Drag the corner handles to scale, or drag the edge lines directly to stretch width or height.
3. **Configure Options**: Set your preferred background overlap fill style, export resolution, and file format in the sidebar.
4. **Download**: Click "Download Cropped Image" to save your file.
