#ifndef CAMERALAYER_H
#define CAMERALAYER_H

#include "boundingbox.h"

class QrealAnimator;

// AE-style scene camera LAYER: creating one enables the scene camera
// (the camera tool auto-creates it on first use). The camera affects
// ONLY layers with their 3D switch enabled (AE rule - plain 2D layers
// live in screen space). All parameters are plain keyframable
// animators, so the timeline/undo/auto-key pipeline works out of the
// box; changes invalidate every 3D layer's render data and the scene
// frame cache.
class CORE_EXPORT CameraLayer : public BoundingBox {
    e_OBJECT
public:
    CameraLayer();

    stdsptr<BoxRenderData> createRenderData() { return nullptr; }
    bool shouldScheduleUpdate() { return false; }

    // combined camera transform in canvas/world space around the
    // canvas center (identity when every value is at its default)
    SkMatrix getCameraTransformAtFrame(const qreal relFrame,
                                       const qreal canvasW,
                                       const qreal canvasH) const;
    bool hasPerspectiveAtFrame(const qreal relFrame) const;

    // per-layer (2.5D) camera: pinhole projection of the layer's
    // billboard plane at depth layerZ with the AE-Parallaxer
    // compensation baked in - IDENTITY for every depth while the
    // camera sits at its default (pan 0, zoom 1, no rotation), so
    // the flat look only breaks apart when the camera actually
    // moves/zooms/rotates, each layer by its own depth. layerFocal
    // is the layer's own "3D perspective" value and pivotW its pivot
    // in world coords: the billboard shrink f/(f+z) the layer renders
    // with is un-done around pivotW so the depth is expressed purely
    // through the camera (applied to already-billboarded content).
    SkMatrix getCameraPerLayerTransformAtFrame(const qreal relFrame,
                                               const qreal canvasW,
                                               const qreal canvasH,
                                               const qreal layerZ,
                                               const qreal layerFocal,
                                               const QPointF& pivotW) const;

    // identity up to float noise (SkMatrix::isIdentity is exact);
    // a matrix that acts as the identity lets renderers keep their
    // fast affine path
    static bool isEffectivelyIdentity(const SkMatrix& m);

    QrealAnimator* panXAnimator() const { return mPanX.data(); }
    QrealAnimator* panYAnimator() const { return mPanY.data(); }
    QrealAnimator* zoomAnimator() const { return mZoom.data(); }
    QrealAnimator* rotZAnimator() const { return mRotZ.data(); }
    QrealAnimator* rotXAnimator() const { return mRotX.data(); }
    QrealAnimator* rotYAnimator() const { return mRotY.data(); }
    QrealAnimator* focalAnimator() const { return mFocal.data(); }
private:
    qsptr<QrealAnimator> mPanX;
    qsptr<QrealAnimator> mPanY;
    qsptr<QrealAnimator> mZoom;
    qsptr<QrealAnimator> mRotZ;
    qsptr<QrealAnimator> mRotX;
    qsptr<QrealAnimator> mRotY;
    qsptr<QrealAnimator> mFocal;
};

#endif // CAMERALAYER_H
