#include "Boxes/cameralayer.h"
#include "Animators/qrealanimator.h"
#include "canvas.h"
#include "Private/document.h"

CameraLayer::CameraLayer() :
    BoundingBox(QObject::tr("Camera"), eBoxType::cameraLayer) {
    mPanX = enve::make_shared<QrealAnimator>(0., -100000., 100000., 1.,
                QObject::tr("Pan X"));
    mPanY = enve::make_shared<QrealAnimator>(0., -100000., 100000., 1.,
                QObject::tr("Pan Y"));
    // zoom upper bound 100000: the camera's virtual depth is
    // z = dz*focal/zoom, so a dolly-in was capped at 8*dz
    // (focal 800, zoom 100) - the top-view camera icon got pinned
    // onto the x axis line (~z=-8) and refused to move closer;
    // the wide bound lets the dolly solve cover the whole depth
    // range down to the z<-1 viewer-side guard
    mZoom = enve::make_shared<QrealAnimator>(1., 0.01, 100000., 0.01,
                QObject::tr("Zoom"));
    mRotZ = enve::make_shared<QrealAnimator>(0., -36000., 36000., 1.,
                QObject::tr("Rotate"));
    mRotX = enve::make_shared<QrealAnimator>(0., -89., 89., 1.,
                QObject::tr("Tilt X"));
    mRotY = enve::make_shared<QrealAnimator>(0., -89., 89., 1.,
                QObject::tr("Tilt Y"));
    mFocal = enve::make_shared<QrealAnimator>(800., 1., 100000., 1.,
                QObject::tr("Focal Length"));
    ca_addChild(mPanX);
    ca_addChild(mPanY);
    ca_addChild(mZoom);
    ca_addChild(mRotZ);
    ca_addChild(mRotX);
    ca_addChild(mRotY);
    ca_addChild(mFocal);

    // camera changes must invalidate every 3D layer's render data and
    // the scene frame cache - a plain box-child animator change does
    // NOT reach them (each layer believes nothing of its own changed
    // and would keep serving its cached render data with the OLD
    // camera matrix). NOTE: prp_afterChangedAbsRange is a virtual
    // METHOD, not a signal - the Qt signal emitted from it is
    // prp_absFrameRangeChanged
    const auto changed = [this](const FrameRange& range, const bool) {
        const auto scene = getParentScene();
        if(scene) scene->sceneCameraChanged(range);
    };
    const QrealAnimator* anims[] = { mPanX.data(), mPanY.data(),
                                     mZoom.data(), mRotZ.data(),
                                     mRotX.data(), mRotY.data(),
                                     mFocal.data() };
    for(const auto anim : anims) {
        connect(anim, &Property::prp_absFrameRangeChanged, changed);
    }
}

// combined camera transform in canvas/world space:
//   point -> translate(-pan) -> center -> scale -> rotZ -> tilt
//         -> project -> back from center
// (the tilt math mirrors AdvancedTransformAnimator::get3DTransformAtFrame:
//  plane point (x,y,0) rotated by Rx*Ry, then x' = f*vx/(f+vz))
SkMatrix CameraLayer::getCameraTransformAtFrame(const qreal relFrame,
                                                const qreal canvasW,
                                                const qreal canvasH) const {
    const qreal panX = mPanX->getEffectiveValue(relFrame);
    const qreal panY = mPanY->getEffectiveValue(relFrame);
    const qreal zoom = mZoom->getEffectiveValue(relFrame);
    const qreal rotZ = mRotZ->getEffectiveValue(relFrame);
    const qreal rotX = mRotX->getEffectiveValue(relFrame);
    const qreal rotY = mRotY->getEffectiveValue(relFrame);
    if(qAbs(panX) < 0.001 && qAbs(panY) < 0.001 &&
       qAbs(zoom - 1.) < 0.001 && qAbs(rotZ) < 0.001 &&
       qAbs(rotX) < 0.001 && qAbs(rotY) < 0.001) {
        return SkMatrix();
    }
    const qreal cx = canvasW * 0.5;
    const qreal cy = canvasH * 0.5;
    SkMatrix result;
    result.setTranslate(toSkScalar(cx), toSkScalar(cy));
    if(qAbs(rotX) > 0.001 || qAbs(rotY) > 0.001) {
        const qreal f = mFocal->getEffectiveValue(relFrame);
        const qreal rx = qDegreesToRadians(rotX);
        const qreal ry = qDegreesToRadians(rotY);
        const qreal crx = std::cos(rx);
        const qreal srx = std::sin(rx);
        const qreal cry = std::cos(ry);
        const qreal sry = std::sin(ry);
        SkMatrix h;
        h.setAll(toSkScalar(f*cry),       toSkScalar(0.),
                 toSkScalar(0.),
                 toSkScalar(f*srx*sry),   toSkScalar(f*crx),
                 toSkScalar(0.),
                 toSkScalar(-crx*sry),    toSkScalar(srx),
                 toSkScalar(f));
        result.preConcat(h);
    }
    if(qAbs(rotZ) > 0.001) {
        SkMatrix r;
        r.setRotate(toSkScalar(rotZ));
        result.preConcat(r);
    }
    if(qAbs(zoom - 1.) > 0.001) {
        SkMatrix s;
        s.setScale(toSkScalar(zoom), toSkScalar(zoom));
        result.preConcat(s);
    }
    SkMatrix toCenter;
    toCenter.setTranslate(toSkScalar(-cx), toSkScalar(-cy));
    result.preConcat(toCenter);
    if(qAbs(panX) > 0.001 || qAbs(panY) > 0.001) {
        // content moves opposite to the camera pan
        SkMatrix p;
        p.setTranslate(toSkScalar(-panX), toSkScalar(-panY));
        result.preConcat(p);
    }
    return result;
}

bool CameraLayer::hasPerspectiveAtFrame(const qreal relFrame) const {
    return qAbs(mRotX->getEffectiveValue(relFrame)) > 0.001 ||
           qAbs(mRotY->getEffectiveValue(relFrame)) > 0.001;
}

bool CameraLayer::isEffectivelyIdentity(const SkMatrix& m) {
    return qAbs(qreal(m[0]) - 1.) < 1e-4 &&
           qAbs(qreal(m[4]) - 1.) < 1e-4 &&
           qAbs(qreal(m[8]) - 1.) < 1e-4 &&
           qAbs(qreal(m[1])) < 1e-4 && qAbs(qreal(m[3])) < 1e-4 &&
           qAbs(qreal(m[2])) < 1e-4 && qAbs(qreal(m[5])) < 1e-4 &&
           qAbs(qreal(m[6])) < 1e-4 && qAbs(qreal(m[7])) < 1e-4;
}

// model (canvas coords, q = point - canvas center):
//   comp = (F + z) / F                     Parallaxer compensation
//   k    = F / zoom                        camera distance to the
//                                          focus point O (canvas center)
//   camera attitude R = Ry(rotY) * Rx(rotX) (rigid orbit around O)
//   camera center  C = R * (0,0,-k) + (panX, panY, 0)
//   layer point    p = (comp*qx, comp*qy, z)
//   view = R^T * (p - C),  screen = center + F * view.xy / view.z
// Default camera: C = (pan 0, -F), p - C = (comp*q, comp*F) = comp*(q,F)
// -> screen = q for EVERY depth (the flat look). As soon as the
// camera orbits (C.x/C.y leave the view axis) or pans/zooms, the
// layers peel apart by their own depth - the C.x/C.y orbit terms are
// what make ROTATION parallax work (a pure attitude spin cannot
// separate comp-compensated layers: their view vectors stay parallel).
SkMatrix CameraLayer::getCameraPerLayerTransformAtFrame(
        const qreal relFrame, const qreal canvasW, const qreal canvasH,
        const qreal layerZ) const {
    const qreal panX = mPanX->getEffectiveValue(relFrame);
    const qreal panY = mPanY->getEffectiveValue(relFrame);
    const qreal zoom = mZoom->getEffectiveValue(relFrame);
    const qreal rotZ = mRotZ->getEffectiveValue(relFrame);
    const qreal rotX = mRotX->getEffectiveValue(relFrame);
    const qreal rotY = mRotY->getEffectiveValue(relFrame);
    qreal f = mFocal->getEffectiveValue(relFrame);
    if(f < 1.) f = 800.;
    const qreal cx = canvasW * 0.5;
    const qreal cy = canvasH * 0.5;
    const qreal rx = qDegreesToRadians(rotX);
    const qreal ry = qDegreesToRadians(rotY);
    const qreal crx = std::cos(rx);
    const qreal srx = std::sin(rx);
    const qreal cry = std::cos(ry);
    const qreal sry = std::sin(ry);
    const qreal comp = (f + layerZ) / f;
    const qreal k = f / qMax(zoom, 0.01);
    // v = p - C, C = (panX - k*sry*crx, panY + k*srx, -k*cry*crx)
    const qreal b0 = -panX + k * sry * crx;   // v0 = comp*qx + b0
    const qreal b1 = -panY - k * srx;         // v1 = comp*qy + b1
    // keep the depth term away from 0 (layer at/behind the camera)
    const qreal v2 = qMax(layerZ + k * cry * crx, 1.);

    // homography on centered coords q: screen - center = Hc(q)
    //   N_x = F*(cry*v0 - sry*v2)
    //   N_y = F*(srx*sry*v0 + crx*v1 + cry*srx*v2)
    //   D   = sry*crx*v0 - srx*v1 + cry*crx*v2
    SkMatrix hc;
    hc.setAll(toSkScalar(f * cry * comp), 0.,
              toSkScalar(f * (cry * b0 - sry * v2)),
              toSkScalar(f * srx * sry * comp),
              toSkScalar(f * crx * comp),
              toSkScalar(f * (srx * sry * b0 + crx * b1 + cry * srx * v2)),
              toSkScalar(sry * crx * comp), toSkScalar(-srx * comp),
              toSkScalar(sry * crx * b0 - srx * b1 + cry * crx * v2));

    // back to canvas coords: T(center) * Hc * T(-center)
    SkMatrix pre;  pre.setTranslate(toSkScalar(-cx), toSkScalar(-cy));
    SkMatrix post; post.setTranslate(toSkScalar(cx), toSkScalar(cy));
    SkMatrix result = SkMatrix::Concat(post, SkMatrix::Concat(hc, pre));

    // camera roll around the canvas center, after the projection
    if(qAbs(rotZ) > 0.001) {
        SkMatrix r;
        r.setRotate(toSkScalar(rotZ));
        result = SkMatrix::Concat(post, SkMatrix::Concat(r,
                SkMatrix::Concat(pre, result)));
    }
    return result;
}
